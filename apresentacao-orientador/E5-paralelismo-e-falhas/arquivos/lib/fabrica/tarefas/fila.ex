defmodule Fabrica.Tarefas.Fila do
  @moduledoc """
  Quem vira `pronta`, e o que despachar agora. **Funcoes puras: nenhum acesso a banco.**

  E o porte de `painel/servidor/src/pipeline/maquina.ts` da v1 (`promoverProntas`,
  `proximosPassos`), o modulo que existe porque um MODELO fazia isto: no job `7a1f9a45` o
  orquestrador gastou 36 voltas e **US$ 1,29, 17% do job**, para executar uma maquina de
  estados. Regra deterministica rodada por modelo e cara E pouco confiavel.

  A fronteira e a mesma da v1: **se a regra cabe num teste, ela e codigo.** Replanejar,
  julgar marco e decidir que uma tarefa dispensa verificacao continuam sendo julgamento.

  ## Duas divergencias DELIBERADAS da v1, e uma simplificacao

  **1. Dependencia `cancelada` deixa de travar para sempre.** Na v1 ela conta como faltando
  (ha teste afirmando isso: *"dependencia cancelada trava, e aparece como faltando"*). Mas o
  proprio protocolo da fabrica CANCELA a tarefa original quando o replanejamento a substitui
  — entao, na v1, quem dependia dela ficava preso em `backlog` para sempre, sem que nada
  acusasse. Aqui a cancelada e satisfeita pelas SUBSTITUTAS (`replanejada_de_id`), e a
  regressao e recursiva: substituta que tambem foi replanejada resolve pela dela.

  **2. `bloqueada` NAO satisfaz** — e continua sem satisfazer. Bloqueio e trabalho que parou,
  nao trabalho que terminou; promover quem depende dele entregaria terreno inacabado.

  **3. A trilha sumiu do calculo.** A v1 recebe `trilha` e indexa `ETAPAS[trilha][status]`,
  mas as duas trilhas tem **a mesma tabela** — `construtor`, `verificador`, `revisor` sao
  nomes de PAPEL, e papel nao muda com o dominio. O que muda com a trilha e qual agente
  atende cada papel, e isso e a T-024. Carregar o parametro aqui seria sugerir uma variacao
  que nao existe.

  ## O criterio de "substituta concluida", e por que o mais estrito

  O plano diz *"conta como satisfeita se houver substituta concluida"*. Lido ao pe da letra,
  UMA substituta pronta bastaria — e um replanejamento que quebrou a tarefa em tres
  liberaria os dependentes com um terco do trabalho feito. Implementei o estrito: **ha pelo
  menos uma substituta, e cada uma delas satisfaz**. Promover cedo demais poe um construtor
  sobre terreno inacabado, que e o erro caro; esperar demais so atrasa.

  ## Ordem da fila

  Prioridade, depois **quem destrava mais tarefas ainda abertas**, e so entao `codigo`. O
  desempate do meio nao esta no resumo do plano ("prioridade, depois codigo") e esta na v1,
  acrescentado la de proposito: sem ele a ordenacao cai no codigo, que e ordem de CRIACAO, e
  numa fase madura isso inverte a fila — a tarefa que abre caminho para outras tres costuma
  ter sido criada depois delas.

  **Limite conhecido, herdado e nao consertado aqui:** so enxerga dependencia DECLARADA. Uma
  tarefa de fundacao que ninguem lista em `dependencias` continua invisivel, por mais
  dependentes reais que tenha. Foi o caso da T-043 do banco-imobiliario, que ficou por ultimo
  enquanto dois jobs (US$ 14) faziam a mao o ritual que ela existia para eliminar. O conserto
  daquilo e de planejamento — declarar a fundacao como dependencia de quem ela serve.
  """

  alias Fabrica.Tarefas.Tarefa

  defmodule Passo do
    @moduledoc "Uma unidade despachavel: a tarefa e o papel que vem agora."

    @type t :: %__MODULE__{tarefa: Tarefa.t(), papel: atom()}

    defstruct [:tarefa, :papel]
  end

  @papel_por_status %{
    pronta: :construtor,
    em_execucao: :construtor,
    em_teste: :verificador,
    em_revisao: :revisor
  }

  @ordem_prioridade %{alta: 0, media: 1, baixa: 2}

  @type travada :: %{
          tarefa: Tarefa.t(),
          faltando: [%{codigo: String.t(), status: atom()}],
          inexistentes: [term()]
        }

  @type promocao :: %{promover: [Tarefa.t()], travadas: [travada()]}

  @doc "O papel que atende cada status. Status fora da tabela nao gera passo."
  @spec papel_por_status() :: %{atom() => atom()}
  def papel_por_status, do: @papel_por_status

  @doc """
  O teto padrao de construtores em paralelo, lido de `config :fabrica, :max_construtores`
  (D-003, `_gestao/DECISOES.md`) — a FONTE UNICA que `proximos/2` e
  `Fabrica.Fila.Exclusao.lote/2` compartilham. Maquina mais forte sobe este numero mudando
  so `config/config.exs`, sem tocar em codigo.
  """
  @spec max_construtores_padrao() :: pos_integer()
  def max_construtores_padrao, do: Application.get_env(:fabrica, :max_construtores, 2)

  @doc """
  Quais tarefas em `backlog` podem virar `pronta`, e por que as outras nao podem.

  Devolve `{:erro, {:ciclo, caminho}}` quando o grafo tem ciclo — **defeito de planejamento,
  nao situacao normal**, e por isso e erro e nao uma fila vazia. O `caminho` traz os codigos
  na ordem em que se fecham, para o relatorio poder mostrar o laco.

  `travadas` distingue **faltando** (a dependencia existe e nao terminou) de **inexistentes**
  (a dependencia aponta para tarefa que nao esta na lista). A segunda nunca fecha sozinha —
  e erro de frontmatter — e silencia-la deixaria a tarefa presa para sempre sem ninguem
  saber por que.
  """
  @spec promover([Tarefa.t()]) :: {:ok, promocao()} | {:erro, term()}
  def promover(tarefas) do
    with :ok <- conferir_carregadas(tarefas),
         :ok <- conferir_ciclos(tarefas) do
      {:ok, avaliar(tarefas)}
    end
  end

  defp avaliar(tarefas) do
    indice = Map.new(tarefas, &{&1.id, &1})
    substitutas = Enum.group_by(tarefas, & &1.replanejada_de_id)

    tarefas
    |> Enum.filter(&(&1.status == :backlog))
    |> Enum.reduce(%{promover: [], travadas: []}, fn tarefa, acumulado ->
      classificar(tarefa, indice, substitutas, acumulado)
    end)
    |> then(&%{promover: Enum.reverse(&1.promover), travadas: Enum.reverse(&1.travadas)})
  end

  defp classificar(tarefa, indice, substitutas, acumulado) do
    {faltando, inexistentes} = pendencias(tarefa, indice, substitutas)

    if faltando == [] and inexistentes == [] do
      %{acumulado | promover: [tarefa | acumulado.promover]}
    else
      travada = %{tarefa: tarefa, faltando: faltando, inexistentes: inexistentes}
      %{acumulado | travadas: [travada | acumulado.travadas]}
    end
  end

  defp pendencias(tarefa, indice, substitutas) do
    veredito = &classificar_dependencia(&1, indice, substitutas)
    por_tipo = tarefa.dependencias |> Enum.map(veredito) |> Enum.group_by(&elem(&1, 0))

    {
      por_tipo |> Map.get(:faltando, []) |> Enum.map(&elem(&1, 1)),
      por_tipo |> Map.get(:inexistente, []) |> Enum.map(&elem(&1, 1))
    }
  end

  defp classificar_dependencia(dependencia, indice, substitutas) do
    case Map.fetch(indice, dependencia.depende_de_id) do
      :error -> {:inexistente, dependencia.depende_de_id}
      {:ok, dependida} -> veredito(dependida, substitutas)
    end
  end

  defp veredito(dependida, substitutas) do
    if satisfeita?(dependida, substitutas, []) do
      {:satisfeita, dependida.codigo}
    else
      {:faltando, %{codigo: dependida.codigo, status: dependida.status}}
    end
  end

  # `vistas` corta a recursao numa linhagem de replanejamento que se fecha em circulo. Uma
  # tarefa ja em analise nao pode servir de prova de si mesma.
  #
  # E LISTA, e nao `MapSet`, de proposito: uma linhagem de replanejamento tem um punhado de
  # elos, entao a busca linear nao custa nada — e passar um `MapSet.new()` literal para
  # funcao privada faz o Dialyzer acusar quebra de opacidade, um aviso que so teria a saida
  # de crescer a lista de filtros. Trocar a estrutura resolve; filtrar seria esconder.
  defp satisfeita?(%Tarefa{status: :concluida}, _substitutas, _vistas), do: true

  defp satisfeita?(%Tarefa{status: :cancelada} = tarefa, substitutas, vistas) do
    if tarefa.id in vistas do
      false
    else
      filhas = Map.get(substitutas, tarefa.id, [])

      # Lista vazia e o caso importante: cancelada SEM substituta nao foi replanejada, foi
      # descartada — e quem dependia dela nao tem o que esperar.
      filhas != [] and
        Enum.all?(filhas, &satisfeita?(&1, substitutas, [tarefa.id | vistas]))
    end
  end

  defp satisfeita?(_outra, _substitutas, _vistas), do: false

  @doc """
  Os proximos passos despachaveis, ja com as tres regras de paralelismo aplicadas.

  1. **Verificador exige projeto quieto** — sai sozinho, acompanhado apenas de revisores.
     Bateria completa sobre arvore com edicoes alheias gera reprovacao FALSA, o desperdicio
     mais caro do sistema, porque queima um ciclo inteiro.
  2. **Ate N construtores em paralelo, com `areas` disjuntas** — mesma arvore de trabalho.
     Tarefa **sem `areas` declaradas** pode tocar qualquer coisa e por isso roda sozinha
     entre construtores: conservador de proposito.
  3. **Revisor le o diff commitado** e roda junto com qualquer coisa.

  Aceita `:max_construtores`; sem ele, usa `max_construtores_padrao/0` (D-003).
  """
  @spec proximos([Tarefa.t()], keyword()) :: [Passo.t()]
  def proximos(tarefas, opcoes \\ []) do
    maximo = Keyword.get(opcoes, :max_construtores, max_construtores_padrao())
    candidatos = tarefas |> Enum.flat_map(&passo_de/1) |> ordenar(dependentes(tarefas))

    revisores = Enum.filter(candidatos, &(&1.papel == :revisor))
    verificadores = Enum.filter(candidatos, &(&1.papel == :verificador))

    case verificadores do
      [primeiro | _] -> revisores ++ [primeiro]
      [] -> revisores ++ construtores(candidatos, maximo)
    end
  end

  defp passo_de(tarefa) do
    case Map.fetch(@papel_por_status, tarefa.status) do
      {:ok, papel} -> [%Passo{tarefa: tarefa, papel: papel}]
      :error -> []
    end
  end

  # Quantas tarefas AINDA ABERTAS esperam por cada uma. Concluida e cancelada nao contam:
  # elas ja nao esperam por ninguem, e soma-las faria uma tarefa antiga parecer urgente para
  # sempre.
  defp dependentes(tarefas) do
    tarefas
    |> Enum.reject(&(&1.status in [:concluida, :cancelada]))
    |> Enum.flat_map(& &1.dependencias)
    |> Enum.frequencies_by(& &1.depende_de_id)
  end

  defp ordenar(candidatos, dependentes) do
    Enum.sort_by(candidatos, fn %Passo{tarefa: tarefa} ->
      {
        Map.get(@ordem_prioridade, tarefa.prioridade, 1),
        -Map.get(dependentes, tarefa.id, 0),
        tarefa.codigo
      }
    end)
  end

  defp construtores(candidatos, maximo) do
    candidatos
    |> Enum.filter(&(&1.papel == :construtor))
    |> Enum.reduce_while({[], MapSet.new()}, fn passo, {escolhidos, tomadas} ->
      escolher(passo, escolhidos, tomadas, maximo)
    end)
    |> then(fn {escolhidos, _tomadas} -> Enum.reverse(escolhidos) end)
  end

  defp escolher(passo, escolhidos, tomadas, maximo) do
    caminhos = MapSet.new(passo.tarefa.areas, & &1.caminho)

    cond do
      length(escolhidos) >= maximo ->
        {:halt, {escolhidos, tomadas}}

      # Sem `areas` declaradas: roda sozinha, e encerra a montagem do lote.
      MapSet.size(caminhos) == 0 ->
        if escolhidos == [],
          do: {:halt, {[passo], tomadas}},
          else: {:halt, {escolhidos, tomadas}}

      MapSet.disjoint?(caminhos, tomadas) ->
        {:cont, {[passo | escolhidos], MapSet.union(tomadas, caminhos)}}

      true ->
        {:cont, {escolhidos, tomadas}}
    end
  end

  # Associacao nao carregada viraria Protocol.UndefinedError la dentro, longe da causa. A
  # funcao e pura por contrato: quem chama carrega.
  defp conferir_carregadas(tarefas) do
    Enum.find_value(tarefas, :ok, fn tarefa ->
      cond do
        not is_list(tarefa.dependencias) -> {:erro, {:nao_carregado, :dependencias}}
        not is_list(tarefa.areas) -> {:erro, {:nao_carregado, :areas}}
        true -> nil
      end
    end)
  end

  # Busca em profundidade com tres cores. Cinza reencontrado e o laco; o caminho volta em
  # codigos, na ordem em que se fecha.
  defp conferir_ciclos(tarefas) do
    indice = Map.new(tarefas, &{&1.id, &1})

    Enum.reduce_while(tarefas, {:ok, MapSet.new()}, fn tarefa, {:ok, fechados} ->
      case visitar(tarefa.id, indice, fechados, []) do
        {:ok, fechados} -> {:cont, {:ok, fechados}}
        {:ciclo, caminho} -> {:halt, {:erro, {:ciclo, caminho}}}
      end
    end)
    |> case do
      {:ok, _fechados} -> :ok
      {:erro, motivo} -> {:erro, motivo}
    end
  end

  defp visitar(id, indice, fechados, pilha) do
    cond do
      MapSet.member?(fechados, id) ->
        {:ok, fechados}

      id in pilha ->
        {:ciclo, caminho_do_ciclo(id, pilha, indice)}

      true ->
        descer(id, indice, fechados, pilha)
    end
  end

  defp descer(id, indice, fechados, pilha) do
    vizinhos =
      case Map.fetch(indice, id) do
        {:ok, tarefa} -> Enum.map(tarefa.dependencias, & &1.depende_de_id)
        # Dependencia inexistente nao e ciclo — `promover/1` a reporta como `inexistentes`.
        :error -> []
      end

    Enum.reduce_while(vizinhos, {:ok, fechados}, fn vizinho, {:ok, acumulado} ->
      case visitar(vizinho, indice, acumulado, [id | pilha]) do
        {:ok, acumulado} -> {:cont, {:ok, acumulado}}
        {:ciclo, caminho} -> {:halt, {:ciclo, caminho}}
      end
    end)
    |> case do
      {:ok, fechados} -> {:ok, MapSet.put(fechados, id)}
      {:ciclo, caminho} -> {:ciclo, caminho}
    end
  end

  defp caminho_do_ciclo(id, pilha, indice) do
    volta = pilha |> Enum.reverse() |> Enum.drop_while(&(&1 != id))

    # O `id` repetido no fim nao e ruido: e ele que mostra ONDE o caminho se fecha, e sem
    # ele "T-001, T-002" nao se distingue de uma cadeia normal de duas tarefas.
    Enum.map(volta ++ [id], &codigo(&1, indice))
  end

  defp codigo(id, indice) do
    case Map.fetch(indice, id) do
      {:ok, tarefa} -> tarefa.codigo
      :error -> "##{id}"
    end
  end
end
