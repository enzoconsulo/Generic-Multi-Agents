defmodule Fabrica.Equipe.Resolucao do
  @moduledoc """
  QUEM executa a tarefa: o papel generico, e o especialista que se soma a ele. **Pura.**

  A v1 chama a equipe sob demanda de *"provavelmente o coracao do sistema"*: a fabrica nao
  tem um programador generico esperando na fila — o planejador sintetiza 2 a 5 especialistas
  a partir do proprio pedido, e cada tarefa nasce apontando para o da area que ela toca.

  ## O especialista SOMA, nunca substitui

  Na v1 havia tres passos de resolucao, porque o SDK podia injetar um subagente pelo nome.
  Na v2 nao ha a quem oferecer subagente: quem despacha e a maquina de estados, e ela monta a
  requisicao inteira. Sobra o passo que a v1 ja executava **em 51 de 51 despachos medidos**
  — o papel generico com o prompt do especialista COLADO num bloco proprio.

  Entao aqui a resolucao tem duas saidas e nada mais: papel sozinho, ou papel + bloco
  `<especialista>`. Nao existe caminho em que o especialista tome o lugar do papel: a
  disciplina (commit, estado, confinamento) vem do papel, e um especialista que a substituisse
  teria de reescreve-la — que e exatamente o defeito medido a seguir.

  ## O prompt do especialista e DOMINIO PURO

  Medido na v1: os tres especialistas do banco-imobiliario gastavam **~70% do texto**
  repetindo o construtor — commit, status, Notas, "leia o protocolo". Duas dessas repeticoes
  ainda mandavam o agente para fora do alcance dele, porque o `cwd` e o projeto.

  Escreva so o que o generico nao teria como saber: arquivos da area, invariantes, o comando
  que prova um criterio dela, e as armadilhas ja pagas.

  ## Onde o bloco entra, e por que isso e uma decisao de custo

  Na faixa **`:doutrina`** do `Fabrica.Prompt.Prefixo` — a faixa 2, que leva ponto de cache.
  O prompt do especialista e estavel por projeto e papel, entao ele pertence a parte que se
  escreve uma vez e se le muitas. E o outro lado da moeda dos 70% acima: texto inchado nessa
  faixa nao e so ruido no prompt, e escrita de cache paga em todo despacho — e a escrita
  carrega ~50% da conta de entrada.

  ## Especialista referenciado que nao existe

  Cai no generico **e registra**. Apontar para especialista inexistente e defeito de
  planejamento, e defeito de planejamento so aparece se alguem escrever: some em silencio
  numa fabrica que roda sozinha. O `motivo` volta no resultado (para o relatorio) e sai em
  log (para a rodada).
  """

  require Logger

  alias Fabrica.Projetos.Especialista

  @typedoc """
  Como se chegou a quem vai executar.

    * `:generico` — a tarefa nao pede especialista, e isso e normal.
    * `:especialista` — achou o ativo, e o bloco entra.
    * `{:especialista_inexistente, referencia}` — a tarefa aponta para quem nao existe.
      Roda no generico assim mesmo, com o defeito registrado.
  """
  @type motivo :: :generico | :especialista | {:especialista_inexistente, term()}

  @type t :: %__MODULE__{
          papel: atom(),
          especialista: Especialista.t() | nil,
          motivo: motivo()
        }

  defstruct [:papel, :especialista, :motivo]

  @doc """
  Resolve o executor a partir do papel e da referencia declarada pela tarefa.

  `referencia` e o `identificador` do especialista (ou `nil`). A busca e sempre pelo
  **ativo**: uma tarefa planejada ha semanas aponta para quem faz o trabalho, nao para a
  redacao que o prompt tinha naquele dia. Versionar existe para melhorar, e melhoria que nao
  alcanca a proxima execucao nao melhorou nada — o historico continua consultavel em
  `Fabrica.Equipe.historico/2`.
  """
  @spec resolver(atom(), String.t() | nil, [Especialista.t()]) :: t()
  def resolver(papel, referencia, ativos \\ [])

  def resolver(papel, nil, _ativos) do
    %__MODULE__{papel: papel, especialista: nil, motivo: :generico}
  end

  def resolver(papel, referencia, ativos) do
    case Enum.find(ativos, &(&1.identificador == referencia and &1.ativo)) do
      nil -> inexistente(papel, {:identificador, referencia})
      especialista -> %__MODULE__{papel: papel, especialista: especialista, motivo: :especialista}
    end
  end

  @doc false
  @spec inexistente(atom(), term()) :: t()
  def inexistente(papel, referencia) do
    Logger.warning(
      "tarefa aponta para especialista inexistente (#{inspect(referencia)}); " <>
        "despachando no papel generico #{papel}. E defeito de planejamento."
    )

    %__MODULE__{papel: papel, especialista: nil, motivo: {:especialista_inexistente, referencia}}
  end

  @doc """
  O texto da faixa `:doutrina`: o papel generico e, quando ha, o bloco do especialista.

  `texto_do_papel` vem de fora de proposito — a doutrina de cada papel nao e assunto deste
  modulo, e recebe-la como argumento e o que deixa a montagem testavel sem arrastar o
  catalogo inteiro para dentro do teste.

  As marcas sao `<seu-papel>` e `<especialista>`, os mesmos nomes que a v1 usa, para que um
  transcript da v2 seja comparavel a um da v1 sem tradutor no meio.
  """
  @spec doutrina(t(), String.t()) :: String.t()
  def doutrina(%__MODULE__{especialista: nil}, texto_do_papel) do
    bloco("seu-papel", texto_do_papel)
  end

  def doutrina(%__MODULE__{especialista: especialista}, texto_do_papel) do
    corpo = "Voce atua como #{especialista.nome} desta equipe.\n\n#{especialista.prompt}"

    bloco("seu-papel", texto_do_papel) <> "\n\n" <> bloco("especialista", corpo)
  end

  defp bloco(marca, conteudo) do
    "<#{marca}>\n#{String.trim(conteudo)}\n</#{marca}>"
  end

  @doc "Houve defeito de planejamento nesta resolucao?"
  @spec defeituosa?(t()) :: boolean()
  def defeituosa?(%__MODULE__{motivo: {:especialista_inexistente, _}}), do: true
  def defeituosa?(%__MODULE__{}), do: false
end
