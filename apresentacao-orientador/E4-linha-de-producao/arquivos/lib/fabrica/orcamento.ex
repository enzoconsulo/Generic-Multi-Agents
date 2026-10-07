defmodule Fabrica.Orcamento do
  @moduledoc """
  Impede que a rodada COMECE trabalho que nao cabe. Nunca corta agente em voo.

  Doutrina fechada em `DECISOES_FECHADAS.md`: **o teto impede comecar, nao interrompe.**
  Interromper no meio paga igual e nao entrega nada (US$ 4,11 medidos num corte por cota na
  v1). Por isso nenhuma funcao aqui recebe "o que esta em execucao agora" — so o que ja foi
  gasto e o que a proxima tarefa deve custar. Nao ha ONDE cortar porque o modulo nunca
  enxerga um despacho em andamento.

  Modulo puro: sem banco, sem processo, sem efeito. Quem chama busca os numeros (gasto ate
  agora, gasto da tarefa, custo de cada tarefa concluida neste job) e aplica a decisao.

  ## Dois tetos, dois papeis

  | teto | o que impede | responde a |
  |---|---|---|
  | **da rodada** | comecar a proxima tarefa se `gasto + estimativa` passar do teto | orcamento estourar sem aviso |
  | **por tarefa** | despachar de novo a MESMA tarefa, mesmo com rodada de sobra | "gastar 70% do limite e nao entregar UMA tarefa" — a queixa real do usuario na v1 |

  O teto por tarefa e uma FRACAO do teto da rodada (`fracao_padrao_por_tarefa/0`), nao um
  numero fixo: assim ele acompanha o teto que o usuario declarar para a rodada, em vez de
  destoar quando a rodada muda de tamanho.

  ## A estimativa se autocalibra

  A estimativa da proxima tarefa e a MEDIA do que este job ja mediu — `custo por TAREFA
  CONCLUIDA`, nunca por etapa. A v1 errava exatamente aqui, de um jeito instrutivo: usava o
  custo da etapa do revisor (a mais barata) e subestimava a tarefa inteira em ate quatro
  vezes, sempre para baixo, sempre no sentido de comecar trabalho que nao cabia.

  Sem medicao propria ainda (job no comeco, zero tarefas concluidas), a estimativa cai no
  padrao declarado: **US$ 7,8241** por tarefa concluida, medido sobre 47 tarefas concluidas
  da v1 (`priv/linha-de-base/LINHA_DE_BASE.md`, secao 2). Nao e fatura — e estimativa
  contabil de tokens, a mesma ressalva que vale para todo dolar que esta fabrica registra.
  """

  @estimativa_padrao 7.8241

  @fracao_padrao_por_tarefa 0.3

  @typedoc "Por que o despacho nao pode comecar."
  @type motivo :: :orcamento | :orcamento_tarefa

  @typedoc "A decisao: comeca, ou para limpo com o motivo."
  @type decisao :: :ok | {:parar, motivo()}

  @doc "O padrao declarado, para quando o job ainda nao mediu nada — US$ 7,8241 (v1, 47 tarefas)."
  @spec estimativa_padrao() :: float()
  def estimativa_padrao, do: @estimativa_padrao

  @doc "A fracao do teto da rodada que o teto por tarefa usa quando o chamador nao declara outra."
  @spec fracao_padrao_por_tarefa() :: float()
  def fracao_padrao_por_tarefa, do: @fracao_padrao_por_tarefa

  @doc """
  Quanto deve custar a proxima tarefa — a media do custo por TAREFA CONCLUIDA neste job.

  `custos_de_tarefas_concluidas` e uma lista de UM numero por tarefa (o total dela, soma de
  todas as etapas), nunca um numero por etapa: e essa a diferenca que a v1 errou. Lista
  vazia (job sem tarefa concluida ainda) cai no padrao declarado.

  ## Exemplos

      iex> Fabrica.Orcamento.estimar_proxima_tarefa([4.0, 6.0])
      5.0

      iex> Fabrica.Orcamento.estimar_proxima_tarefa([])
      7.8241
  """
  @spec estimar_proxima_tarefa([number()]) :: float()
  def estimar_proxima_tarefa([]), do: @estimativa_padrao

  def estimar_proxima_tarefa(custos_de_tarefas_concluidas) do
    soma = Enum.sum(custos_de_tarefas_concluidas)
    soma / length(custos_de_tarefas_concluidas)
  end

  @doc """
  A proxima tarefa CABE no teto da rodada?

  Soma o que ja foi gasto na rodada com a estimativa da proxima tarefa: se passar do teto,
  nao cabe. Nao ha meio-termo — a tarefa so comeca se o pior caso razoavel (a media medida)
  couber inteira.
  """
  @spec cabe_na_rodada?(number(), number(), number()) :: boolean()
  def cabe_na_rodada?(gasto_ate_agora, estimativa_proxima, teto_rodada) do
    gasto_ate_agora + estimativa_proxima <= teto_rodada
  end

  @doc """
  Decide se a proxima tarefa pode comecar, dado o teto da rodada.

  `custos_de_tarefas_concluidas` alimenta `estimar_proxima_tarefa/1`. Devolve `:ok` (pode
  despachar) ou `{:parar, :orcamento}` (para limpo — nada em voo e afetado, porque esta
  funcao e chamada ANTES de existir despacho algum).

  ## Exemplos

      iex> Fabrica.Orcamento.avaliar_rodada(60.0, 100.0, [10.0, 10.0])
      :ok

      iex> Fabrica.Orcamento.avaliar_rodada(95.0, 100.0, [10.0])
      {:parar, :orcamento}
  """
  @spec avaliar_rodada(number(), number(), [number()]) :: decisao()
  def avaliar_rodada(gasto_ate_agora, teto_rodada, custos_de_tarefas_concluidas \\ []) do
    estimativa = estimar_proxima_tarefa(custos_de_tarefas_concluidas)

    if cabe_na_rodada?(gasto_ate_agora, estimativa, teto_rodada) do
      :ok
    else
      {:parar, :orcamento}
    end
  end

  @doc """
  O teto que UMA tarefa sozinha pode consumir — uma fracao do teto da rodada.

  Existe porque o teto da rodada, sozinho, deixa passar o cenario que a queixa real do
  usuario na v1 descreve: uma tarefa consome 70% do limite e nao entrega nada, enquanto o
  orcamento da RODADA ainda tem sobra. Este teto responde a isso mesmo com rodada de folga.

  ## Exemplos

      iex> Fabrica.Orcamento.teto_por_tarefa(100.0)
      30.0

      iex> Fabrica.Orcamento.teto_por_tarefa(100.0, 0.5)
      50.0
  """
  @spec teto_por_tarefa(number(), number()) :: float()
  def teto_por_tarefa(teto_rodada, fracao \\ @fracao_padrao_por_tarefa) do
    teto_rodada * fracao
  end

  @doc "A tarefa, sozinha, ainda cabe no proprio teto?"
  @spec cabe_na_tarefa?(number(), number()) :: boolean()
  def cabe_na_tarefa?(gasto_da_tarefa, teto_da_tarefa) do
    gasto_da_tarefa < teto_da_tarefa
  end

  @doc """
  Decide se a MESMA tarefa pode receber outro despacho, dado o que ela ja gastou.

  Independente do teto da rodada, de proposito: uma tarefa pode estourar o proprio teto com
  a rodada inteira de folga, e e exatamente esse caso que este teto existe para pegar.

  ## Exemplos

      iex> Fabrica.Orcamento.avaliar_tarefa(20.0, 30.0)
      :ok

      iex> Fabrica.Orcamento.avaliar_tarefa(31.0, 30.0)
      {:parar, :orcamento_tarefa}
  """
  @spec avaliar_tarefa(number(), number()) :: decisao()
  def avaliar_tarefa(gasto_da_tarefa, teto_da_tarefa) do
    if cabe_na_tarefa?(gasto_da_tarefa, teto_da_tarefa) do
      :ok
    else
      {:parar, :orcamento_tarefa}
    end
  end
end
