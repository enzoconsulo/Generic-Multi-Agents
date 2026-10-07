defmodule Mix.Tasks.Fabrica.Planejar do
  @shortdoc "Traduz um pedido em tarefas despachaveis: a unica intervencao humana do marco"

  @moduledoc """
  Cria (ou reaproveita) um projeto e chama `Fabrica.Planejador.planejar/2` (T-068) para
  transformar um pedido em linguagem natural num grafo de tarefas.

      mix fabrica.planejar "<pedido>" --projeto <nome>

  E o UNICO ponto de entrada humano que o critério 1 da T-058 exige: depois dela, o piloto
  (T-054/T-055) assume o despacho sozinho.

  ## O caminho do projeto

  Projeto que ja existe (mesmo `nome`) e reaproveitado tal como esta — o `caminho` que ele
  ja tem nunca e trocado. Projeto NOVO nasce ao lado desta fabrica, em `../<nome>` a partir
  do diretorio de trabalho atual, e o diretorio e criado se ainda nao existir (o planejador
  precisa de uma raiz de verdade para montar o indice do projeto).

  ## Depois de planejar

  Toda tarefa recem-criada sem dependencia pendente vira `pronta`
  (`Fabrica.Tarefas.Fila.promover/1` + `Fabrica.Tarefas.Transicao.aplicar/3`), e a task
  imprime quantas tarefas nasceram e quantas ja estao despachaveis — a confirmacao de que o
  pedido virou trabalho, sem consultar o banco a mao.

  **Esta task CONSOME COTA da assinatura ao rodar contra o `claude` real; nao gera fatura**
  (mesma nota ja registrada na T-020 para o `ClaudeCLI`). Os testes automatizados usam
  `Fabrica.Operario.Falso`, nunca o operario real.
  """

  use Mix.Task

  alias Fabrica.Planejador
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Repo
  alias Fabrica.Tarefas.Fila
  alias Fabrica.Tarefas.Transicao

  @impl Mix.Task
  def run(argumentos) do
    Mix.Task.run("app.start")

    {opcoes, resto} = OptionParser.parse!(argumentos, strict: [projeto: :string])

    pedido = List.first(resto) || uso!()
    nome = Keyword.get(opcoes, :projeto) || uso!()

    case executar(pedido, nome) do
      {:ok, relatorio} -> imprimir(relatorio)
      {:erro, motivo} -> Mix.raise("planejamento falhou: #{inspect(motivo)}")
    end
  end

  @spec uso!() :: no_return()
  defp uso!, do: Mix.raise("uso: mix fabrica.planejar \"<pedido>\" --projeto <nome>")

  @doc """
  Cria/reaproveita o projeto `nome` e planeja `pedido`. Publico para o teste chamar direto,
  sem passar pelo parsing de argumentos de `run/1`.

  `opcoes` aceita `:caminho` (raiz do projeto, so usada quando o projeto ainda nao existe) e
  repassa o resto (`:agulha`, `:modelo`, `:teto_de_voltas`, `:raiz`) para
  `Fabrica.Planejador.planejar/2`.

  Devolve `{:ok, %{projeto: projeto, tarefas: total_de_tarefas, prontas: total_pronto}}` ou
  `{:erro, motivo}`, sem promover nada quando o planejamento falha.
  """
  @spec executar(String.t(), String.t(), keyword()) :: {:ok, map()} | {:erro, term()}
  def executar(pedido, nome, opcoes \\ []) do
    {caminho, opcoes_do_planejador} = Keyword.pop(opcoes, :caminho)
    projeto = obter_ou_criar_projeto(nome, caminho)

    case Planejador.planejar(pedido, projeto, opcoes_do_planejador) do
      {:ok, %{tarefas: tarefas}} ->
        prontas = promover(tarefas)
        {:ok, %{projeto: projeto, tarefas: length(tarefas), prontas: prontas}}

      {:erro, motivo} ->
        {:erro, motivo}
    end
  end

  defp obter_ou_criar_projeto(nome, caminho) do
    case Repo.get_by(Projeto, nome: nome) do
      nil ->
        caminho = caminho || caminho_padrao(nome)
        File.mkdir_p!(caminho)
        Repo.insert!(Projeto.changeset(%Projeto{}, %{"nome" => nome, "caminho" => caminho}))

      projeto ->
        projeto
    end
  end

  defp caminho_padrao(nome), do: Path.expand(Path.join([File.cwd!(), "..", nome]))

  # `tarefas` ja vem com `:areas`, `:criterios` e `:dependencias` pre-carregados
  # (`Fabrica.Planejador.gravar/2`), e toda dependencia do plano aponta para outra tarefa do
  # MESMO lote — o planejador ja recusou dependencia para fora e ciclo antes de gravar. Por
  # isso `Fila.promover/1` roda so sobre este lote, sem precisar reconsultar o projeto.
  defp promover(tarefas) do
    case Fila.promover(tarefas) do
      {:ok, %{promover: promoveis}} ->
        Enum.each(promoveis, &Transicao.aplicar(&1, :pronta))
        length(promoveis)

      {:erro, _motivo} ->
        0
    end
  end

  defp imprimir(relatorio) do
    Mix.shell().info(
      "projeto #{relatorio.projeto.nome}: #{relatorio.tarefas} tarefa(s) criada(s), " <>
        "#{relatorio.prontas} pronta(s) para despacho"
    )
  end
end
