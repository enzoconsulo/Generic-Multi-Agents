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
