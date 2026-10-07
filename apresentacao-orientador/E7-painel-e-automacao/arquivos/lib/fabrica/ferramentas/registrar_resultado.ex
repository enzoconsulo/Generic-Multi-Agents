defmodule Fabrica.Ferramentas.RegistrarResultado do
  @moduledoc """
  A UNICA forma de um agente reportar o que fez.

  ## A regra, e a razao de ela ser codigo e nao pedido

  O banco e a verdade. O agente **nao escreve estado**: ele chama esta ferramenta, e quem
  muda status e conta tentativas e o sistema. **A ferramenta de mudar status nao existe para
  agente nenhum** — nao e uma regra pedida no prompt, e uma impossibilidade.

  A v1 ja tinha pago para descobrir metade disso: o protocolo dela marca
  `ultima-reprovacao: # NAO ESCREVA. Campo do MOTOR`. Um campo que so uma frase protege e um
  campo que sera escrito, mais cedo ou mais tarde, por um agente distraido ou por um prompt
  novo que ninguem conferiu contra o antigo. Aqui o campo nao chega ao banco porque nao ha
  caminho de codigo que o leve.

  ## O motivo economico, que e o menos obvio

  Hoje o agente gasta VOLTAS lendo o arquivo da tarefa e reescrevendo secoes dele. Uma
  chamada estruturada e **uma volta**. E volta e o termo dominante da conta — o custo de um
  despacho e numero de voltas vezes contexto de cada volta.

  ## Campos ignorados sao ignorados COM AVISO

  Se o agente mandar `status` ou `tentativas`, o campo nao entra e o aviso volta para ele na
  mesma resposta. Ignorar em silencio seria pior que aceitar: o agente seguiria acreditando
  que mudou o estado, e a divergencia so apareceria muito depois, sem rastro de onde nasceu.

  ## O problema de TIMING que a T-074 fecha, e a saida escolhida

  `registrar/2` grava num `ciclo_id` que precisa JA EXISTIR — mas a linha de `ciclos` so
  nasce dentro do `Multi` de `Fabrica.Tarefas.Transicao.aplicar/3`, ao FIM do despacho
  (`talvez_ciclo/2`). A doutrina manda o agente chamar `registrar_resultado` NO MEIO do laco,
  quando esse `ciclo_id` ainda nao existe. Duas saidas foram descartadas: ampliar
  `Fabrica.Tarefas.Transicao` para criar o ciclo mais cedo (quebraria "estado, relatorio e
  custo na MESMA transacao" do `@moduledoc` dela) e um `ciclo_id` fabricado/zero (um relato
  gravado sob um id que nao e o do ciclo real seria pior que a auauncia).

  A saida: **um coletor em memoria** (`iniciar_coletor/0`), vivo so durante o laco. Cada
  chamada durante o laco vai para `anexar/2` — nao toca o banco, so acumula. Quem despacha
  (`Fabrica.Fila.Trabalho`) le tudo com `relatos/1` DEPOIS que o laco termina, funde com
  `formatar_relatos/1` e passa o texto como `:relatorio` para a MESMA transacao que
  `Transicao.aplicar/3` ja monta para o ciclo — sem abrir uma segunda transacao, e sem que o
  relato exista em lugar nenhum se o agente morrer antes do laco terminar (nada chama
  `despachar/3` nesse caso, e o coletor e so memoria de um processo que morre com ele).
  """

  import Ecto.Query, only: [from: 2]

  alias Ecto.Multi
  alias Fabrica.Repo
  alias Fabrica.Tarefas.Ciclo

  # O que o agente PODE reportar. Tudo o que nao esta aqui e ignorado, e a lista e explicita
  # de proposito: uma allowlist recusa o que ninguem previu, uma denylist so recusa o que
  # alguem lembrou de proibir.
  @campos_aceitos ~w[resumo arquivos comandos commit impedimento]a

  # O que o agente NAO pode reportar, nomeado para o aviso poder dizer QUAL campo caiu.
  @campos_do_sistema ~w[status tentativas desfecho ciclo numero aprovado concluida]a

  @typedoc "O que volta para o agente na mesma resposta da ferramenta."
  @type retorno :: %{gravado: boolean(), avisos: [String.t()]}

  @doc "Os campos que o agente pode reportar."
  @spec campos_aceitos() :: [atom()]
  def campos_aceitos, do: @campos_aceitos

  @doc "Os campos que pertencem ao SISTEMA e nunca ao agente."
  @spec campos_do_sistema() :: [atom()]
  def campos_do_sistema, do: @campos_do_sistema

  @doc """
  Grava o relatorio do agente no ciclo corrente, dentro de uma transacao.

  A transacao existe porque, na v0.3, esta gravacao acontece JUNTO com a transicao de estado
  e com o custo (T-022). Deixa-la fora seria abrir a janela em que o relatorio existe e a
  transicao nao — ou o contrario.
  """
  @spec registrar(pos_integer(), map()) :: {:ok, retorno()} | {:erro, term()}
  def registrar(ciclo_id, reportado) when is_map(reportado) do
    {aceito, avisos} = separar(reportado)

    Multi.new()
    |> Multi.run(:ciclo, fn repo, _ -> buscar_ciclo(repo, ciclo_id) end)
    |> Multi.update(:gravar, fn %{ciclo: ciclo} ->
      Ciclo.changeset(ciclo, %{relatorio: formatar(aceito)})
    end)
    |> Repo.transaction()
    |> case do
      {:ok, _} -> {:ok, %{gravado: true, avisos: avisos}}
      {:error, _etapa, motivo, _} -> {:erro, motivo}
    end
  end

  @doc """
  Inicia um coletor em memoria para relatos chamados DURANTE o laco, antes de existir
  `ciclo_id` (ver @moduledoc "O problema de TIMING"). Nao toca o banco.
  """
  @spec iniciar_coletor() :: {:ok, pid()}
  def iniciar_coletor, do: Agent.start_link(fn -> [] end)

  @doc """
  Aceita um relato chamado durante o laco. So acumula no coletor, na ORDEM da chamada — o
  `retorno()` e o MESMO formato de `registrar/2`, para o agente nao perceber diferenca de
  contrato entre chamar isto ou a gravacao final.
  """
  @spec anexar(pid(), map()) :: retorno()
  def anexar(coletor, reportado) when is_map(reportado) do
    {aceito, avisos} = separar(reportado)
    Agent.update(coletor, &(&1 ++ [aceito]))
    %{gravado: true, avisos: avisos}
  end

  @doc "Os relatos aceitos no coletor, na ordem em que foram chamados."
  @spec relatos(pid()) :: [map()]
  def relatos(coletor), do: Agent.get(coletor, & &1)

  @doc "Encerra o coletor. Chamar depois de ler `relatos/1` — o processo nao precisa sobreviver."
  @spec encerrar_coletor(pid()) :: :ok
  def encerrar_coletor(coletor), do: Agent.stop(coletor)

  @doc """
  Funde os relatos acumulados por `anexar/2` num so texto, na ORDEM em que o agente chamou.

  Cada chamada e uma secao completa e separada — nao um merge campo a campo, porque o agente
  pode reportar aspectos DIFERENTES em cada chamada (ex.: um resumo por etapa do trabalho).
  """
  @spec formatar_relatos([map()]) :: String.t()
  def formatar_relatos([]), do: ""

  def formatar_relatos(relatos) do
    relatos
    |> Enum.map(&formatar/1)
    |> Enum.reject(&(&1 == ""))
    |> Enum.join("\n\n---\n\n")
  end

  @doc """
  Separa o que o agente pode reportar do que ele nao pode, com um aviso por campo recusado.

  Pura de proposito: e aqui que mora a regra, e ela precisa ser testavel sem banco.
  """
  @spec separar(map()) :: {map(), [String.t()]}
  def separar(reportado) do
    normalizado = Map.new(reportado, fn {chave, valor} -> {atomizar(chave), valor} end)

    aceito = Map.take(normalizado, @campos_aceitos)

    avisos =
      normalizado
      |> Map.keys()
      |> Enum.filter(&(&1 in @campos_do_sistema))
      |> Enum.sort()
      |> Enum.map(&aviso/1)

    {aceito, avisos}
  end

  defp aviso(campo) do
    "o campo `#{campo}` foi IGNORADO: ele pertence ao sistema, nao ao agente. " <>
      "Quem muda status e conta tentativas e a fabrica, a partir do que os portoes decidem. " <>
      "Reporte o que voce fez; o estado e consequencia disso, e nao declaracao sua."
  end

  defp atomizar(chave) when is_atom(chave), do: chave

  defp atomizar(chave) when is_binary(chave) do
    # `to_existing_atom` e nao `to_atom`: um agente que mandasse mil chaves inventadas
    # esgotaria a tabela de atomos do runtime, que nao e coletada.
    String.to_existing_atom(chave)
  rescue
    ArgumentError -> :__desconhecido__
  end

  defp buscar_ciclo(repo, ciclo_id) do
    case repo.one(from(c in Ciclo, where: c.id == ^ciclo_id)) do
      nil -> {:error, {:ciclo_ausente, ciclo_id}}
      ciclo -> {:ok, ciclo}
    end
  end

  # O relatorio vira texto legivel por humano, porque e ele que a T-032 publica no markdown
  # commitado. As chaves saem ORDENADAS: o markdown e commitado, e ordem instavel geraria
  # diff onde nada mudou.
  defp formatar(aceito) do
    @campos_aceitos
    |> Enum.filter(&Map.has_key?(aceito, &1))
    |> Enum.map_join("\n\n", fn campo -> "## #{campo}\n#{texto(Map.get(aceito, campo))}" end)
  end

  defp texto(valor) when is_binary(valor), do: valor
  defp texto(valor) when is_list(valor), do: Enum.map_join(valor, "\n", &"- #{texto(&1)}")
  defp texto(valor), do: inspect(valor)
end
