defmodule Fabrica.Recuperacao do
  @moduledoc """
  Saneia o que a sessao anterior deixou pela metade, quando o node caiu no meio de uma
  execucao. Duas fontes de verdade, e as duas se cruzam por tarefa: **o banco** (quem estava
  em estado transitorio) e **a arvore git** (o que foi escrito e nunca commitado).

  ## Como se decide que uma tarefa esta orfa

  `em_execucao`, `em_teste` e `em_revisao` sao os tres estados em que existe, por definicao,
  um agente trabalhando — construtor, verificador ou revisor, respectivamente (ver
  `Fabrica.Tarefas.Fila.papel_por_status/0`). Uma tarefa nesses estados SEM entrada viva no
  `Fabrica.Agente.Supervisor` (que so existe enquanto o processo dele roda) e orfa: o agente
  que deveria estar com ela morreu junto com o node, sem chance de terminar nem de reportar.

  ## Por que `em_execucao` nao muda de estado

  A tentacao e mapear `em_execucao -> pronta`, mas essa aresta NAO existe em
  `Fabrica.Tarefas.Maquina` (so avanca para `em_teste`, ou vai a um terminal) — e, pela T-036,
  nao precisa existir: `Fabrica.Tarefas.Fila.papel_por_status/0` ja mapeia `em_execucao` para
  `:construtor`, o MESMO papel de `pronta`. Uma tarefa `em_execucao` orfa ja e despachavel de
  novo, sem escrita nenhuma no banco. O motivo ainda e reportado (ver `sanear/1`), so que sem
  transicao de estado para acompanha-lo.

  ## Por que `em_teste` e `em_revisao` voltam para `em_execucao`

  Sao as UNICAS arestas de volta que `Fabrica.Tarefas.Maquina` ja conhece — as mesmas por
  onde passa um "verificador reprovou" ou um "revisor reprovou". Um verificador ou revisor
  que morre no meio do trabalho deixa um veredito desconhecido, nunca um veredito favoravel;
  tratar a queda como se fosse uma reprovacao (com o `desfecho` marcado `"recuperacao"`, para
  nao se confundir com uma reprovacao de verdade) e a leitura conservadora: o pior caso e
  reconstruir algo que já estava correto, nunca aprovar algo que não foi visto.

  Isso GASTA uma tentativa (`Fabrica.Tarefas.Maquina.entrega_ao_construtor?/1` vale para
  qualquer entrada em `em_execucao`, veio de onde vier) — deliberado: e o mesmo preco de uma
  reprovacao real, e a alternativa (nao contar) exigiria uma aresta nova na maquina so para
  este caso.

  ## A metade do git

  Alteracao nao commitada dentro das `areas` de uma tarefa orfa e trabalho real que o
  saneamento do banco, sozinho, deixaria solto na arvore — a v1 tinha esse mecanismo
  (`temTrabalhoParcial`) e ele ja deixou de disparar uma vez, custando um job inteiro
  jogado fora. Aqui, `Fabrica.Publicacao.Git.commitar/3` faz o commit escopado as `areas` da
  tarefa, com uma mensagem que marca a recuperacao — nunca silenciosamente descartado.

  ## Sempre reporta

  `sanear/1` devolve o relatorio do que foi feito, inclusive quando a resposta e "nada" — e
  registra cada achado via `Logger`. Saneamento que so fala quando encontra algo e
  indistinguivel de saneamento quebrado: ninguem percebe quando ele para de rodar.
  """

  import Ecto.Query, only: [from: 2]

  require Logger

  alias Fabrica.Agente.Supervisor, as: SupervisorDeAgentes
  alias Fabrica.Ferramentas.Comando
  alias Fabrica.Publicacao.Git
  alias Fabrica.Repo
  alias Fabrica.Tarefas.Tarefa
  alias Fabrica.Tarefas.Transicao

  @estados_transitorios [:em_execucao, :em_teste, :em_revisao]

  # As unicas arestas de volta que `Fabrica.Tarefas.Maquina` ja conhece — ver o @moduledoc,
  # secao "Por que em_teste e em_revisao voltam para em_execucao".
  @estado_anterior %{em_teste: :em_execucao, em_revisao: :em_execucao}
  @papel_orfao %{em_teste: "verificador", em_revisao: "revisor"}

  @typedoc "O que aconteceu com uma tarefa orfa: de onde saiu, para onde foi, e por que."
  @type achado :: %{
          tarefa_id: term(),
          codigo: String.t(),
          status_encontrado: atom(),
          status_apos: atom(),
          motivo: String.t(),
          commit: String.t() | nil
        }

  @typedoc "O relatorio de uma passada de saneamento — sempre devolvido, mesmo vazio."
  @type relatorio :: %{orfas: [achado()], nada_a_fazer?: boolean()}

  @doc """
  Sobre cada tarefa em estado transitorio sem processo vivo: devolve ao estado anterior
  (quando existe um) e recupera, em commit marcado, qualquer alteracao nao commitada dentro
  das `areas` dela. Devolve o relatorio do que foi feito.

  ## Opcoes

    * `:vivos` — os `tarefa_id` com agente vivo agora. Por padrao, le
      `Fabrica.Agente.Supervisor.listar/0`. Aceita lista ou `MapSet`.
    * `:raiz` — forca a raiz do git para TODAS as tarefas, ignorando `projeto.caminho`. Existe
      para teste; em producao cada tarefa usa a raiz do seu proprio projeto.
    * `:tarefas` — a lista de candidatas, ja com `:areas` e `:projeto` carregados. Por
      padrao, carrega do banco todas em estado transitorio. Existe para teste: decide o
      relatorio sem depender do banco estar limpo de tarefas de outras suites.
  """
  @spec sanear(keyword()) :: relatorio()
  def sanear(opcoes \\ []) do
    vivos = opcoes |> Keyword.get_lazy(:vivos, &tarefas_vivas/0) |> MapSet.new()
    raiz_forcada = Keyword.get(opcoes, :raiz)

    tarefas =
      Keyword.get_lazy(opcoes, :tarefas, fn -> carregar_transitorias(@estados_transitorios) end)

    orfas =
      tarefas
      |> Enum.filter(&(&1.status in @estados_transitorios))
      |> Enum.reject(&MapSet.member?(vivos, &1.id))
      |> Enum.map(&sanear_uma(&1, raiz_forcada))

    relatar(%{orfas: orfas, nada_a_fazer?: orfas == []})
  end

  defp tarefas_vivas do
    SupervisorDeAgentes.listar() |> Enum.map(& &1.tarefa_id)
  end

  defp carregar_transitorias(estados) do
    Repo.all(from t in Tarefa, where: t.status in ^estados, preload: [:areas, :projeto])
  end

  defp sanear_uma(tarefa, raiz_forcada) do
    {status_apos, motivo} = devolver_estado(tarefa)
    raiz = raiz_forcada || tarefa.projeto.caminho
    commit = recuperar_trabalho(tarefa, raiz)

    %{
      tarefa_id: tarefa.id,
      codigo: tarefa.codigo,
      status_encontrado: tarefa.status,
      status_apos: status_apos,
      motivo: motivo,
      commit: commit
    }
  end

  defp devolver_estado(%Tarefa{status: :em_execucao} = tarefa) do
    motivo =
      "sem despacho vivo no Registry; em_execucao ja e despachavel como :construtor " <>
        "(Fabrica.Tarefas.Fila), nenhuma transicao de estado e necessaria"

    {tarefa.status, motivo}
  end

  defp devolver_estado(tarefa) do
    anterior = Map.fetch!(@estado_anterior, tarefa.status)
    papel = Map.fetch!(@papel_orfao, tarefa.status)
    motivo = "sem despacho vivo no Registry; devolvida de #{tarefa.status} para #{anterior}"

    case Transicao.aplicar(tarefa, anterior,
           papel: papel,
           desfecho: "recuperacao",
           relatorio: motivo
         ) do
      {:ok, _movida} -> {anterior, motivo}
      {:erro, erro} -> {tarefa.status, "#{motivo} — falhou: #{inspect(erro)}"}
    end
  end

  defp recuperar_trabalho(%Tarefa{areas: areas}, _raiz) when areas in [nil, []], do: nil

  defp recuperar_trabalho(tarefa, raiz) do
    caminhos = Enum.map(tarefa.areas, & &1.caminho)

    with {:ok, %{codigo: 0, stdout: saida}} <- status_das_areas(raiz, caminhos),
         true <- String.trim(saida) != "" do
      commitar_recuperacao(tarefa, raiz, caminhos)
    else
      _ -> nil
    end
  end

  defp status_das_areas(raiz, caminhos) do
    Comando.rodar(
      raiz,
      "git",
      ["status", "--porcelain", "--untracked-files=all", "--"] ++ caminhos
    )
  end

  defp commitar_recuperacao(tarefa, raiz, caminhos) do
    mensagem = "#{tarefa.codigo}: recuperacao apos queda — trabalho parcial preservado"

    case Git.commitar(raiz, caminhos, mensagem) do
      {:ok, _} ->
        case Git.hash(raiz) do
          {:ok, hash} -> hash
          _ -> nil
        end

      {:erro, motivo} ->
        Logger.warning(
          "recuperacao: #{tarefa.codigo} tinha trabalho parcial mas o commit falhou: " <>
            inspect(motivo)
        )

        nil
    end
  end

  defp relatar(%{nada_a_fazer?: true} = relatorio) do
    Logger.info("recuperacao: nada a sanear — nenhuma tarefa orfa encontrada")
    relatorio
  end

  defp relatar(relatorio) do
    Enum.each(relatorio.orfas, &relatar_achado/1)
    relatorio
  end

  defp relatar_achado(achado) do
    commit = if achado.commit, do: " (commit #{achado.commit})", else: ""

    Logger.warning(
      "recuperacao: #{achado.codigo} #{achado.status_encontrado} -> #{achado.status_apos} " <>
        "— #{achado.motivo}#{commit}"
    )
  end
end
