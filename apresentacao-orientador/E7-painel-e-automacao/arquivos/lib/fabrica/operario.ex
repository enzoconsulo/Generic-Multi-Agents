defmodule Fabrica.Operario do
  @moduledoc """
  A fronteira que separa a GOVERNANCA da fabrica do fornecedor do modelo.

  Tudo o que a v2 defende — os portoes, o limite de ciclos, a contabilidade por volta —
  vale igual por tras deste contrato, seja quem for que responda do outro lado. E por isso
  que ele existe ja na v0.1, e nao na v0.2: o marco desta versao e a suite rodando SEM
  REDE, e isso exige o contrato ja existindo com o `Falso` implementando-o.

  Tres adaptadores estao previstos:

    * `Fabrica.Operario.Falso` — duble deterministico, sem rede e sem custo (v0.1);
    * `Fabrica.Operario.ClaudeCLI` — o PADRAO de operacao, roda na assinatura (T-018);
    * `Fabrica.Operario.MessagesAPI` — HTTP direto, com controle de cache e TTL (T-019).

  A funcao e sincrona e e UMA so. Quem repete, quem conta volta e quem decide parar e o
  laco (T-015) — nao o adaptador.
  """

  alias Fabrica.Operario.Consumo
  alias Fabrica.Operario.Requisicao
  alias Fabrica.Operario.Resposta

  @doc """
  Faz UMA volta: manda a requisicao, devolve a resposta com o consumo daquela volta.

  Devolve `{:erro, termo}` em vez de levantar. Erro de operario e informacao de
  governanca — o laco precisa distinguir cota de recusa de falha de rede, e excecao
  perderia essa distincao no caminho.
  """
  @callback conversar(requisicao :: Requisicao.t(), opcoes :: keyword()) ::
              {:ok, Resposta.t()} | {:erro, term()}

  @doc """
  A familia do adaptador — a decisao que separa quem RODA o proprio laco de ferramentas de
  quem so responde como um endpoint de modelo puro.

    * `:agente_completo` — o adaptador tem laco, ferramentas e permissoes proprios (ex.:
      `claude --print`). A fabrica manda UMA requisicao e para: nao executa ferramenta
      nenhuma, porque o adaptador ja executou.
    * `:endpoint_de_modelo` — o adaptador so fala com o modelo. A fabrica executa as
      ferramentas e governa o laco, como faz hoje.

  Callback OPCIONAL. Use `Fabrica.Operario.familia/1` para resolve-la, e nao este callback
  direto — e ele quem aplica o padrao.
  """
  @callback familia() :: :agente_completo | :endpoint_de_modelo

  @optional_callbacks familia: 0

  @doc "O operario configurado, ou o `Falso` — que e o default e o que a suite usa."
  @spec configurado() :: module()
  def configurado do
    Application.get_env(:fabrica, :operario, Fabrica.Operario.Falso)
  end

  @doc """
  A familia do adaptador dado, com o padrao seguro `:endpoint_de_modelo`.

  O padrao NAO e preguica: um adaptador que esquece de declarar `familia/0` cai no caminho
  ESTRITO, em que a fabrica executa as ferramentas e o confinamento e o orcamento dela
  valem. Um adaptador desconhecido tratado como agente completo, ao contrario, deixaria de
  aplicar essa governanca justamente quando ninguem garantiu que o adaptador a aplica
  sozinho — falhar para o lado seguro e a escolha certa aqui.
  """
  @spec familia(module()) :: :agente_completo | :endpoint_de_modelo
  def familia(modulo) do
    if Code.ensure_loaded?(modulo) and function_exported?(modulo, :familia, 0) do
      modulo.familia()
    else
      :endpoint_de_modelo
    end
  end

  @doc "Conversa com o operario configurado."
  @spec conversar(Requisicao.t(), keyword()) :: {:ok, Resposta.t()} | {:erro, term()}
  def conversar(requisicao, opcoes \\ []) do
    configurado().conversar(requisicao, opcoes)
  end

  defmodule Bloco do
    @moduledoc """
    Um bloco do prefixo, com a marca de ponto de cache.

    `ponto_de_cache: true` diz ao adaptador que ESTE bloco fecha um trecho estavel. So o
    `MessagesAPI` sabe agir sobre isso; o `ClaudeCLI` nao posiciona pontos de cache, e o
    `Falso` so os carrega. A marca vive na requisicao, e nao no adaptador, para o teste de
    bytes do prefixo (T-011) poder existir sem rede.
    """

    @type t :: %__MODULE__{texto: String.t(), ponto_de_cache: boolean()}

    defstruct texto: "", ponto_de_cache: false
  end

  defmodule Consumo do
    @moduledoc """
    O que UMA volta consumiu. Os mesmos seis numeros da tabela `consumos`.

    A reparticao entrada / leitura / escrita e obrigatoria, e nao um total: a escrita de
    cache e ~6,7% dos tokens e carrega ~50% da conta de entrada. Um total esconderia
    exatamente o numero que decide o desenho da v2.
    """

    @type t :: %__MODULE__{
            tokens_entrada: non_neg_integer(),
            tokens_cache_escrita: non_neg_integer(),
            tokens_cache_leitura: non_neg_integer(),
            tokens_saida: non_neg_integer(),
            duracao_ms: non_neg_integer() | nil,
            ttl_cache: :sem_cache | :cinco_minutos | :uma_hora
          }

    defstruct tokens_entrada: 0,
              tokens_cache_escrita: 0,
              tokens_cache_leitura: 0,
              tokens_saida: 0,
              duracao_ms: nil,
              ttl_cache: :sem_cache
  end

  defmodule Requisicao do
    @moduledoc """
    Tudo o que o adaptador precisa para fazer uma volta.

    `prefixo` e a parte ESTAVEL (ferramentas, doutrina do papel, indice do projeto), em
    blocos ordenados do mais estavel para o mais volatil; `mensagens` e o historico da
    conversa. A separacao existe porque e ela que torna o cache possivel — editar o
    prefixo invalida tudo o que vem depois.

    `vocabulario`, quando presente, e uma lista EXPLICITA de nomes internos do catalogo
    (`Fabrica.Ferramentas.Catalogo`, ex.: `["escrever"]`) que o `Fabrica.Operario.ClaudeCLI`
    usa NO LUGAR do vocabulario do `papel` (T-100). Existe para a tarefa cujo trabalho real
    nao precisa de `rodar` (Bash) poder subir com menos privilegio do que o papel dela teria
    por padrao — sem isso, so dava para escolher o vocabulario pelo papel inteiro. `nil`
    (o padrao) mantem o comportamento de sempre: o vocabulario sai do `papel`.
    """

    alias Fabrica.Operario.Bloco

    @type mensagem :: %{papel: :usuario | :assistente | :sistema, conteudo: term()}

    @type t :: %__MODULE__{
            modelo: String.t(),
            papel: String.t(),
            vocabulario: [String.t()] | nil,
            prefixo: [Bloco.t()],
            mensagens: [mensagem()],
            ferramentas: [map()],
            teto_de_voltas: pos_integer()
          }

    defstruct modelo: "haiku-4.5",
              papel: "construtor",
              vocabulario: nil,
              prefixo: [],
              mensagens: [],
              ferramentas: [],
              teto_de_voltas: 30
  end

  defmodule Resposta do
    @moduledoc """
    O que voltou de UMA volta.

    `motivo_parada` e o que o laco le para decidir se repete. `:uso_de_ferramenta` significa
    que ha trabalho a fazer antes da proxima volta; os demais encerram.

    `:teto_de_tokens` e `:teto_de_voltas` sao o MESMO estouro de orcamento, com nomes
    diferentes porque quem impoe o teto e diferente: `:teto_de_tokens` vem de um adaptador
    da familia `:endpoint_de_modelo` (o `MessagesAPI`, que negocia `max_tokens` por
    requisicao); `:teto_de_voltas` vem de um adaptador `:agente_completo` (o `ClaudeCLI`, que
    negocia turnos internos do proprio CLI). Um adaptador nunca emite o motivo do outro.
    """

    alias Fabrica.Operario.Consumo

    @type motivo_parada ::
            :fim_do_turno
            | :uso_de_ferramenta
            | :teto_de_tokens
            | :teto_de_voltas
            | :recusa

    @type t :: %__MODULE__{
            blocos: [map()],
            motivo_parada: motivo_parada(),
            consumo: Consumo.t()
          }

    defstruct blocos: [], motivo_parada: :fim_do_turno, consumo: %Consumo{}
  end
end
