defmodule Fabrica.Custo.Precos do
  @moduledoc """
  A tabela de precos e a aritmetica de custo de uma volta.

  ## Precos conferidos em 2026-08-28

  Preco muda, e **preco velho sem data e pior que preco ausente** — por isso a data esta no
  topo deste modulo e sai em `conferido_em/0`, para o relatorio poder cita-la.

  | modelo | entrada (USD/Mtok) | saida (USD/Mtok) |
  |---|---|---|
  | `opus-5` | 5 | 25 |
  | `sonnet-5` | 2 | 10 |
  | `haiku-4.5` | 1 | 5 |

  ## Os multiplicadores de cache

    * **leitura: 0,1x** o preco de entrada;
    * **escrita: 1,25x** com TTL de 5 minutos, **2,0x** com TTL de 1 hora.

  O TTL fica gravado na linha de consumo. Sem ele nao ha como saber depois qual
  multiplicador aplicar, e a conta vira chute — a v1 teve de inferir o multiplicador real
  comparando 12 jobs contra o custo do SDK, e chegou a "entre 1,25x e 2,0x, mais perto de
  1,75x", que e a assinatura de uma MISTURA dos dois TTLs.

  ## Duas unidades, e por que

  A fabrica **nao paga por token — consome cota**. Todo valor em dolar aqui e
  **estimativa contabil, nao fatura**. Sob o `Operario.ClaudeCLI` o que aperta e a parede de
  cota; sob o `Operario.MessagesAPI` o que aperta e dinheiro. Ter as duas e o que torna a
  Parte V do TCC honesta.
  """

  @conferido_em ~D[2026-08-28]

  # USD por milhao de tokens.
  @tabela %{
    "opus-5" => %{entrada: 5.0, saida: 25.0},
    "sonnet-5" => %{entrada: 2.0, saida: 10.0},
    "haiku-4.5" => %{entrada: 1.0, saida: 5.0}
  }

  # Os ids longos que o CLI devolve apontam para as mesmas linhas da tabela. Ficam aqui, e
  # nao espalhados por quem chama, para "modelo sem preco" continuar significando "modelo
  # que ninguem precificou" — e nao "modelo escrito de outro jeito".
  #
  # `claude-sonnet-5-5` e `claude-opus-5-5` (T-084): os IDs que o `claude` 2.1.287 devolve no
  # `modelUsage` em 2026-10-01 — e os que `Operario.ClaudeCLI.modelos_cli/0` manda no
  # `--model`. Ha teste que trava as duas pontas: ID traduzido la tem de ter linha aqui. Os
  # VALORES da tabela nao mudaram com eles (seguem os conferidos em `@conferido_em`).
  @apelidos %{
    "claude-opus-5" => "opus-5",
    "claude-opus-5-5" => "opus-5",
    "claude-sonnet-5" => "sonnet-5",
    "claude-sonnet-5-5" => "sonnet-5",
    "claude-haiku-4-5-20251001" => "haiku-4.5",
    "haiku-4-5" => "haiku-4.5",
    # Os apelidos CURTOS do proprio CLI (T-086, achado menor da T-084): `ClaudeCLI` os aceita
    # (`apelidos_do_cli/0`, as sondas usam) e o CLI os resolve para o modelo mais novo da
    # familia — em 2026-10-01, os mesmos IDs de cima. Escolhido cair na linha do nome interno, e
    # nao `:modelo_sem_preco`: o `Agente.Laco` conta modelo sem preco como 0,0, e o teto do
    # piloto pararia de frear em silencio. O risco que fica: o apelido passar a apontar para um
    # modelo de outro preco sem aviso — por isso a fabrica nao os GERA, so as sondas.
    "sonnet" => "sonnet-5",
    "opus" => "opus-5",
    "haiku" => "haiku-4.5"
  }

  @multiplicador_leitura 0.1
  @multiplicadores_escrita %{sem_cache: 0.0, cinco_minutos: 1.25, uma_hora: 2.0}

  # Pesos de cota. NAO sao numero publicado por fornecedor nenhum: sao uma convencao desta
  # fabrica, para que "quanto de cota esta rodada consumiu" seja comparavel entre rodadas.
  # Uma unidade = mil tokens de entrada em Haiku. A leitura de cache tambem consome cota, e
  # muito menos — o mesmo 0,1x.
  @peso_de_cota %{"opus-5" => 5.0, "sonnet-5" => 2.0, "haiku-4.5" => 1.0}

  alias Fabrica.Operario.Consumo

  @typedoc "A reparticao de um custo, que e o que o total esconderia."
  @type reparticao :: %{
          entrada_cheia_usd: float(),
          leitura_usd: float(),
          escrita_usd: float(),
          saida_usd: float(),
          total_usd: float(),
          cota_unidades: float()
        }

  @doc "A data em que esta tabela foi conferida. Cite-a sempre que citar um valor."
  @spec conferido_em() :: Date.t()
  def conferido_em, do: @conferido_em

  @doc "Os modelos com preco declarado."
  @spec modelos() :: [String.t()]
  def modelos, do: Map.keys(@tabela)

  @doc """
  Estima o custo de UMA volta, com a reparticao aberta.

  Devolve `{:erro, :modelo_sem_preco}` para modelo desconhecido, em vez de contar zero em
  silencio. Zero silencioso e o pior desfecho possivel aqui: some da soma sem aparecer em
  lugar nenhum, e a conta fecha errada parecendo certa.
  """
  @spec estimar(String.t(), Consumo.t()) :: {:ok, reparticao()} | {:erro, :modelo_sem_preco}
  def estimar(modelo, %Consumo{} = consumo) do
    case preco(modelo) do
      nil ->
        {:erro, :modelo_sem_preco}

      %{entrada: entrada, saida: saida} ->
        entrada_cheia = por_milhao(consumo.tokens_entrada, entrada)
        leitura = por_milhao(consumo.tokens_cache_leitura, entrada * @multiplicador_leitura)
        escrita = por_milhao(consumo.tokens_cache_escrita, entrada * escrita_x(consumo))
        saida_usd = por_milhao(consumo.tokens_saida, saida)

        {:ok,
         %{
           entrada_cheia_usd: arredondar(entrada_cheia),
           leitura_usd: arredondar(leitura),
           escrita_usd: arredondar(escrita),
           saida_usd: arredondar(saida_usd),
           total_usd: arredondar(entrada_cheia + leitura + escrita + saida_usd),
           cota_unidades: cota(modelo, consumo)
         }}
    end
  end

  @doc """
  Resume um conjunto de voltas devolvendo a REPARTICAO, e nao so o total.

  Isto nao e conveniencia — e o achado que decide o desenho da v2: **a escrita de cache e
  ~6,7% dos tokens e carrega ~50% da conta de entrada**. Um total esconderia exatamente o
  numero que justifica o `Operario.MessagesAPI`. Por isso a funcao devolve as quatro parcelas
  e a fracao que a escrita representa da entrada.
  """
  @spec resumir([{String.t(), Consumo.t()}]) ::
          {:ok, map()} | {:erro, {:modelo_sem_preco, [String.t()]}}
  def resumir(voltas) do
    desconhecidos =
      voltas
      |> Enum.map(fn {modelo, _} -> modelo end)
      |> Enum.uniq()
      |> Enum.reject(&preco/1)

    if desconhecidos == [] do
      {:ok, somar(voltas)}
    else
      {:erro, {:modelo_sem_preco, Enum.sort(desconhecidos)}}
    end
  end

  defp somar(voltas) do
    zero = %{
      entrada_cheia_usd: 0.0,
      leitura_usd: 0.0,
      escrita_usd: 0.0,
      saida_usd: 0.0,
      total_usd: 0.0,
      cota_unidades: 0.0
    }

    somado =
      Enum.reduce(voltas, zero, fn {modelo, consumo}, acumulado ->
        {:ok, parcela} = estimar(modelo, consumo)
        Map.new(acumulado, fn {chave, valor} -> {chave, valor + parcela[chave]} end)
      end)

    entrada_total = somado.entrada_cheia_usd + somado.leitura_usd + somado.escrita_usd

    somado
    |> Map.new(fn {chave, valor} -> {chave, arredondar(valor)} end)
    |> Map.merge(%{
      voltas: length(voltas),
      entrada_total_usd: arredondar(entrada_total),
      fracao_escrita_da_entrada: fracao(somado.escrita_usd, entrada_total)
    })
  end

  @doc """
  A cota que UMA volta consumiu, na unidade desta fabrica.

  **Nao e numero publicado por fornecedor nenhum.** E uma convencao daqui, para que
  "quanto de cota esta rodada consumiu" seja comparavel entre rodadas: uma unidade = mil
  tokens de entrada em Haiku, e os demais modelos pesam proporcionalmente ao preco de
  entrada. Leitura de cache pesa 0,1x, como no dolar.
  """
  @spec cota(String.t(), Consumo.t()) :: float()
  def cota(modelo, %Consumo{} = consumo) do
    peso = Map.get(@peso_de_cota, canonico(modelo), 1.0)

    tokens =
      consumo.tokens_entrada +
        consumo.tokens_cache_escrita +
        consumo.tokens_cache_leitura * @multiplicador_leitura +
        consumo.tokens_saida

    arredondar(tokens / 1_000 * peso)
  end

  @doc "O multiplicador de escrita de cache do TTL desta volta."
  @spec escrita_x(Consumo.t()) :: float()
  def escrita_x(%Consumo{ttl_cache: ttl}), do: Map.get(@multiplicadores_escrita, ttl, 1.25)

  @doc "O preco de um modelo, aceitando os IDs longos e os apelidos curtos do CLI. `nil` se nao houver."
  @spec preco(String.t()) :: %{entrada: float(), saida: float()} | nil
  def preco(modelo) when is_binary(modelo), do: Map.get(@tabela, canonico(modelo))
  def preco(_), do: nil

  defp canonico(modelo), do: Map.get(@apelidos, modelo, modelo)

  defp por_milhao(tokens, preco), do: tokens / 1_000_000 * preco

  defp fracao(_parte, todo) when todo == 0.0, do: 0.0
  defp fracao(parte, todo), do: Float.round(parte / todo, 4)

  defp arredondar(valor), do: Float.round(valor * 1.0, 8)
end
