defmodule Fabrica.Custo.PrecosTest do
  @moduledoc """
  Trava a aritmetica de custo e — o mais importante — a REPARTICAO.

  Um total esconderia exatamente o numero que decide o desenho da v2: a escrita de cache e
  ~6,7% dos tokens e carrega ~50% da conta de entrada. Se algum dia alguem simplificar o
  resumo para devolver so `total_usd`, e aqui que deve doer.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Custo.Consumo, as: Custo
  alias Fabrica.Custo.Precos
  alias Fabrica.Operario.ClaudeCLI
  alias Fabrica.Operario.Consumo

  defp consumo(opcoes \\ []) do
    %Consumo{
      tokens_entrada: Keyword.get(opcoes, :entrada, 0),
      tokens_cache_escrita: Keyword.get(opcoes, :escrita, 0),
      tokens_cache_leitura: Keyword.get(opcoes, :leitura, 0),
      tokens_saida: Keyword.get(opcoes, :saida, 0),
      ttl_cache: Keyword.get(opcoes, :ttl, :uma_hora),
      duracao_ms: Keyword.get(opcoes, :duracao_ms, 10)
    }
  end

  describe "tabela de precos" do
    test "traz a data em que foi conferida" do
      # Preco velho SEM data e pior que preco ausente: parece atual.
      assert %Date{} = Precos.conferido_em()
    end

    test "os tres modelos do plano estao precificados" do
      assert Enum.sort(Precos.modelos()) == ["haiku-4.5", "opus-5", "sonnet-5"]
    end

    test "os ids longos do CLI apontam para a mesma linha" do
      assert Precos.preco("claude-haiku-4-5-20251001") == Precos.preco("haiku-4.5")
      assert Precos.preco("claude-sonnet-5") == Precos.preco("sonnet-5")
    end
  end

  describe "os IDs que o CLI devolve hoje (T-084, `claude` 2.1.287, 2026-10-01)" do
    # O `modelUsage` do CLI volta com o ID real, nao com o nome interno. Sem estas linhas, todo
    # despacho real daria `:modelo_sem_preco` mesmo com o despacho funcionando.
    for {id, interno} <- [
          {"claude-sonnet-5-5", "sonnet-5"},
          {"claude-opus-5-5", "opus-5"},
          {"claude-haiku-4-5-20251001", "haiku-4.5"}
        ] do
      @id id
      @interno interno

      test "#{id} e precificado na linha de #{interno}" do
        c = consumo(entrada: 1_000, escrita: 2_000, leitura: 30_000, saida: 400)

        assert Precos.preco(@id) != nil
        assert Precos.preco(@id) == Precos.preco(@interno)
        assert Precos.estimar(@id, c) == Precos.estimar(@interno, c)
      end
    end

    test "o resumo de voltas com os IDs reais nao acusa modelo sem preco" do
      voltas =
        for id <- ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5-20251001"],
            do: {id, consumo(entrada: 1_000)}

      assert {:ok, %{voltas: 3}} = Precos.resumir(voltas)
    end

    test "todo ID que o ClaudeCLI manda no --model cai na linha do nome interno de origem" do
      # A trava entre as duas pontas: se alguem trocar o ID em `ClaudeCLI.modelos_cli/0` sem
      # ensinar o preco, e aqui que doi — e nao no primeiro despacho real.
      for {interno, id} <- ClaudeCLI.modelos_cli() do
        assert Precos.preco(id) == Precos.preco(interno),
               "#{id} (traducao de #{interno}) nao esta na mesma linha de preco"
      end
    end
  end

  describe "estimar uma volta" do
    test "entrada a preco cheio: 1M de tokens em opus custa os 5 dolares da tabela" do
      {:ok, r} = Precos.estimar("opus-5", consumo(entrada: 1_000_000))

      assert r.entrada_cheia_usd == 5.0
      assert r.total_usd == 5.0
    end

    test "saida usa o preco de saida, que e outro" do
      {:ok, r} = Precos.estimar("opus-5", consumo(saida: 1_000_000))
      assert r.saida_usd == 25.0
    end

    test "leitura de cache custa 0,1x a entrada" do
      {:ok, r} = Precos.estimar("opus-5", consumo(leitura: 1_000_000))

      assert r.leitura_usd == 0.5
      assert r.entrada_cheia_usd == 0.0
    end

    test "escrita de cache com TTL de 1 hora custa 2,0x a entrada" do
      {:ok, r} = Precos.estimar("opus-5", consumo(escrita: 1_000_000, ttl: :uma_hora))
      assert r.escrita_usd == 10.0
    end

    test "escrita de cache com TTL de 5 minutos custa 1,25x a entrada" do
      {:ok, r} = Precos.estimar("opus-5", consumo(escrita: 1_000_000, ttl: :cinco_minutos))
      assert r.escrita_usd == 6.25
    end

    test "o TTL da volta e o que decide o multiplicador" do
      # E por isso que o TTL e gravado na linha de consumo: sem ele, a conta vira chute. A
      # v1 teve de INFERIR o multiplicador comparando 12 jobs contra o custo do SDK.
      assert Precos.escrita_x(consumo(ttl: :uma_hora)) == 2.0
      assert Precos.escrita_x(consumo(ttl: :cinco_minutos)) == 1.25
    end

    test "haiku e cinco vezes mais barato que opus na entrada" do
      {:ok, opus} = Precos.estimar("opus-5", consumo(entrada: 1_000_000))
      {:ok, haiku} = Precos.estimar("haiku-4.5", consumo(entrada: 1_000_000))

      assert opus.entrada_cheia_usd / haiku.entrada_cheia_usd == 5.0
    end

    test "uma volta com as quatro parcelas soma o total" do
      {:ok, r} =
        Precos.estimar(
          "sonnet-5",
          consumo(entrada: 1_000_000, leitura: 1_000_000, escrita: 1_000_000, saida: 1_000_000)
        )

      # entrada 2,00 + leitura 0,20 + escrita 4,00 (2,0x) + saida 10,00
      assert r.entrada_cheia_usd == 2.0
      assert r.leitura_usd == 0.2
      assert r.escrita_usd == 4.0
      assert r.saida_usd == 10.0
      assert r.total_usd == 16.2
    end

    test "consumo zerado custa zero, sem divisao por nada" do
      {:ok, r} = Precos.estimar("haiku-4.5", consumo())
      assert r.total_usd == 0.0
    end
  end

  describe "modelo desconhecido" do
    test "devolve erro nomeado em vez de contar zero em silencio" do
      assert {:erro, :modelo_sem_preco} =
               Precos.estimar("modelo-que-nao-existe", consumo(entrada: 1_000))
    end

    test "zero silencioso seria o pior desfecho, e o teste diz por que" do
      # Um zero somado a um total desaparece: a conta fecha errada PARECENDO certa. Por isso
      # o contrato e erro, e nao um valor neutro.
      {:erro, motivo} = Precos.estimar("gpt-invencionice", consumo(entrada: 10_000_000))
      assert motivo == :modelo_sem_preco
    end

    test "o resumo tambem recusa, e diz QUAIS modelos faltam" do
      voltas = [
        {"opus-5", consumo(entrada: 100)},
        {"modelo-a", consumo(entrada: 100)},
        {"modelo-b", consumo(entrada: 100)}
      ]

      assert {:erro, {:modelo_sem_preco, ["modelo-a", "modelo-b"]}} = Precos.resumir(voltas)
    end
  end

  describe "resumo: a REPARTICAO, e nao so o total" do
    test "devolve as quatro parcelas separadas" do
      voltas = [
        {"sonnet-5", consumo(entrada: 1_000_000)},
        {"sonnet-5", consumo(leitura: 1_000_000)},
        {"sonnet-5", consumo(escrita: 1_000_000, ttl: :uma_hora)},
        {"sonnet-5", consumo(saida: 1_000_000)}
      ]

      {:ok, r} = Precos.resumir(voltas)

      assert r.entrada_cheia_usd == 2.0
      assert r.leitura_usd == 0.2
      assert r.escrita_usd == 4.0
      assert r.saida_usd == 10.0
      assert r.total_usd == 16.2
      assert r.voltas == 4
    end

    test "expoe a fracao que a ESCRITA representa da conta de entrada" do
      # Este e o numero que justifica o Operario.MessagesAPI, e o unico que um total
      # esconderia. Na v1 ele vale ~50%.
      voltas = [
        {"sonnet-5", consumo(entrada: 0, leitura: 1_000_000, escrita: 100_000)}
      ]

      {:ok, r} = Precos.resumir(voltas)

      # leitura 0,20 · escrita 0,40 → entrada total 0,60, escrita e 2/3 dela
      assert r.entrada_total_usd == 0.6
      assert r.fracao_escrita_da_entrada == 0.6667
    end

    test "reproduz a forma da conta da v1: pouca escrita, muita conta" do
      # 6,66% dos tokens de entrada em escrita, e ela carrega ~metade da conta.
      voltas = [{"sonnet-5", consumo(leitura: 933_400, escrita: 66_600, ttl: :uma_hora)}]

      {:ok, r} = Precos.resumir(voltas)

      fracao_tokens = 66_600 / 1_000_000
      assert_in_delta fracao_tokens, 0.0666, 0.001
      assert r.fracao_escrita_da_entrada > 0.4, "a escrita tem de dominar a conta de entrada"
    end

    test "lista vazia resume em zeros, sem quebrar" do
      {:ok, r} = Precos.resumir([])

      assert r.total_usd == 0.0
      assert r.voltas == 0
      assert r.fracao_escrita_da_entrada == 0.0
    end

    test "modelos diferentes na mesma soma sao precificados cada um pelo seu" do
      voltas = [
        {"opus-5", consumo(entrada: 1_000_000)},
        {"haiku-4.5", consumo(entrada: 1_000_000)}
      ]

      {:ok, r} = Precos.resumir(voltas)
      assert r.entrada_cheia_usd == 6.0
    end
  end

  describe "a segunda unidade: cota" do
    test "cota e contada mesmo onde o dolar e estimativa" do
      assert Precos.cota("haiku-4.5", consumo(entrada: 1_000)) == 1.0
    end

    test "opus pesa cinco vezes mais que haiku na cota" do
      c = consumo(entrada: 1_000)
      assert Precos.cota("opus-5", c) / Precos.cota("haiku-4.5", c) == 5.0
    end

    test "leitura de cache pesa 0,1x tambem na cota" do
      assert Precos.cota("haiku-4.5", consumo(leitura: 10_000)) == 1.0
    end

    test "modelo sem peso declarado nao zera a cota" do
      # Zerar aqui esconderia consumo real. Na duvida, peso 1.
      assert Precos.cota("modelo-novo", consumo(entrada: 1_000)) == 1.0
    end

    test "a estimativa devolve as duas unidades juntas" do
      {:ok, r} = Precos.estimar("sonnet-5", consumo(entrada: 1_000))

      assert r.total_usd > 0.0
      assert r.cota_unidades == 2.0
    end
  end

  # Um `result` no formato do `claude` 2.1.287. `cache_creation: nil` produz o formato SEM a
  # quebra por TTL (o de antes); os numeros de base sao os do despacho real de haiku da T-086.
  defp resultado_do_cli(opcoes) do
    uso =
      %{
        "input_tokens" => Keyword.get(opcoes, :entrada, 9),
        "cache_creation_input_tokens" => Keyword.get(opcoes, :escrita, 4_116),
        "cache_read_input_tokens" => Keyword.get(opcoes, :leitura, 0),
        "output_tokens" => Keyword.get(opcoes, :saida, 61)
      }

    uso =
      case Keyword.fetch!(opcoes, :cache_creation) do
        nil -> uso
        {cinco, hora} -> Map.put(uso, "cache_creation", cache_creation(cinco, hora))
      end

    linha = Jason.encode!(%{"type" => "result", "subtype" => "success", "usage" => uso})
    {:ok, resposta} = ClaudeCLI.interpretar(%{stdout: linha, stderr: ""})
    resposta.consumo
  end

  defp cache_creation(cinco, hora) do
    %{"ephemeral_5m_input_tokens" => cinco, "ephemeral_1h_input_tokens" => hora}
  end

  describe "escrita de cache cobrada pelo TTL que o CLI informa (T-086)" do
    test "1 hora: os numeros do despacho real de haiku reproduzem o costUSD do CLI, exato" do
      # `claude` 2.1.287: entrada 9, escrita 4116 (toda em 1h), saida 61 -> costUSD 0.008546.
      {:ok, r} = Precos.estimar("haiku-4.5", resultado_do_cli(cache_creation: {0, 4_116}))

      assert_in_delta r.escrita_usd, 4_116 * 2.0 / 1_000_000, 1.0e-12
      assert r.total_usd == 0.008546
    end

    test "5 minutos: a MESMA escrita sai a 1,25x a entrada" do
      {:ok, r} = Precos.estimar("haiku-4.5", resultado_do_cli(cache_creation: {4_116, 0}))

      assert_in_delta r.escrita_usd, 4_116 * 1.25 / 1_000_000, 1.0e-12
    end

    test "o multiplicador de cada TTL e o da tabela: 1h / 5m = 2,0 / 1,25" do
      {:ok, cinco} = Precos.estimar("sonnet-5", resultado_do_cli(cache_creation: {4_116, 0}))
      {:ok, hora} = Precos.estimar("sonnet-5", resultado_do_cli(cache_creation: {0, 4_116}))

      assert Float.round(hora.escrita_usd / cinco.escrita_usd, 6) == Float.round(2.0 / 1.25, 6)
    end

    test "nenhum dos dois TTLs sai de graca, e o despacho misto nunca fica abaixo do exato" do
      {consumo, log} =
        ExUnit.CaptureLog.with_log(fn ->
          resultado_do_cli(escrita: 4_116, cache_creation: {1_000, 3_116})
        end)

      assert log =~ "dois TTLs"

      {:ok, r} = Precos.estimar("haiku-4.5", consumo)

      assert r.escrita_usd >= (1_000 * 1.25 + 3_116 * 2.0) / 1_000_000
    end

    test "resultado SEM cache_creation continua precificado como hoje" do
      # O formato sem a quebra por TTL: `:sem_cache`, e a escrita a 0,0x — exatamente o que
      # este mesmo resultado custava antes da T-086 (entrada + saida; nao ha leitura).
      {consumo, log} = ExUnit.CaptureLog.with_log(fn -> resultado_do_cli(cache_creation: nil) end)
      {:ok, r} = Precos.estimar("haiku-4.5", consumo)

      # "Como hoje" no preco, mas nao em silencio: escrita a 0,0x e o que a T-086 existe para
      # tirar do despacho real, e se este formato voltar alguem precisa ver.
      assert log =~ "sem usage.cache_creation"

      assert consumo.ttl_cache == :sem_cache
      assert r.escrita_usd == 0.0
      assert r.total_usd == (9 * 1.0 + 61 * 5.0) / 1_000_000
    end

    test "resultado com cache_creation ZERADO (so leitura) custa o mesmo que antes" do
      # Numeros reais de um sonnet so de leitura (2026-10-01): costUSD 0.0065986.
      consumo =
        resultado_do_cli(
          entrada: 2,
          escrita: 0,
          leitura: 32_773,
          saida: 4,
          cache_creation: {0, 0}
        )

      {:ok, r} = Precos.estimar("claude-sonnet-5-5", consumo)

      assert r.escrita_usd == 0.0
      assert r.total_usd == 0.0065986
    end
  end

  describe "os apelidos curtos do CLI tem preco (achado menor da T-084)" do
    # `ClaudeCLI` aceita `sonnet`/`opus`/`haiku` (as sondas usam). Sem linha aqui, quem
    # configurasse `modelo: "sonnet"` teria custo 0,0 por volta (`Agente.Laco` conta
    # `:modelo_sem_preco` como zero) e o teto do piloto pararia de frear em silencio.
    for {apelido, interno} <- [{"sonnet", "sonnet-5"}, {"opus", "opus-5"}, {"haiku", "haiku-4.5"}] do
      @apelido apelido
      @interno interno

      test "#{apelido} cai na linha de #{interno}" do
        c = consumo(entrada: 1_000, escrita: 2_000, leitura: 30_000, saida: 400)

        assert Precos.preco(@apelido) == Precos.preco(@interno)
        assert Precos.estimar(@apelido, c) == Precos.estimar(@interno, c)
      end
    end

    test "todo apelido curto que o ClaudeCLI aceita tem preco" do
      for apelido <- ClaudeCLI.apelidos_do_cli() do
        assert {:ok, ^apelido} = ClaudeCLI.modelo_cli(apelido)
        assert Precos.preco(apelido) != nil, "#{apelido} passa no ClaudeCLI e nao tem preco"
      end
    end
  end

  describe "ponte para a linha do banco" do
    test "converte o consumo relatado nos atributos de `consumos`" do
      {:ok, atributos} =
        Custo.para_registro("sonnet-5", consumo(entrada: 1_000, leitura: 9_000, saida: 500),
          despacho_id: 7,
          volta: 3
        )

      assert atributos.despacho_id == 7
      assert atributos.volta == 3
      assert atributos.tokens_entrada == 1_000
      assert atributos.tokens_cache_leitura == 9_000
      assert Decimal.gt?(atributos.custo_usd, 0)
      assert Decimal.gt?(atributos.cota_unidades, 0)
    end

    test "volta e despacho vem de FORA, porque sao do sistema" do
      # O agente nao numera a propria volta, pela mesma razao que nao escreve o proprio
      # status. Faltar o campo e erro de programacao, e deve estourar.
      assert_raise KeyError, fn ->
        Custo.para_registro("sonnet-5", consumo(), despacho_id: 1)
      end
    end

    test "modelo sem preco impede a gravacao, em vez de gravar zero" do
      assert {:erro, :modelo_sem_preco} =
               Custo.para_registro("nao-existe", consumo(), despacho_id: 1, volta: 1)
    end

    test "soma tokens sem tocar em preco" do
      soma = Custo.somar_tokens([consumo(entrada: 10, leitura: 90), consumo(entrada: 5)])

      assert soma.tokens_entrada == 15
      assert soma.tokens_cache_leitura == 90
      assert soma.voltas == 2
    end

    test "a razao leitura:escrita e o resumo de se o cache esta trabalhando" do
      # Na v1 ela e 14:1. Se cair na v2, o prefixo deixou de ser estavel em algum lugar.
      voltas = [consumo(leitura: 1_400_000, escrita: 100_000)]
      assert Custo.razao_cache(voltas) == 14.0
    end

    test "sem escrita nenhuma, a razao e nil e nao uma divisao por zero" do
      assert Custo.razao_cache([consumo(leitura: 100)]) == nil
    end
  end
end
