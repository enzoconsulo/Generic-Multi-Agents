defmodule Fabrica.Prompt.PrefixoTest do
  @moduledoc """
  Trava a alavanca de custo numero um da v2.

  O teste que mais importa aqui e o que monta o prefixo DUAS VEZES e falha se os bytes
  divergirem. Ele protege a economia inteira: sem bytes identicos entre despachos, cada um
  volta a escrever prefixo novo, e o `Operario.MessagesAPI` perde a razao de existir.
  """

  use ExUnit.Case, async: true

  import ExUnit.CaptureLog

  alias Fabrica.Prompt.Bloco
  alias Fabrica.Prompt.Prefixo

  # Grande o bastante para passar do minimo do Haiku (4096 tokens ~ 16 mil caracteres) e
  # nao disparar o aviso nos testes que nao sao sobre ele.
  defp doutrina_longa, do: String.duplicate("doutrina do papel construtor. ", 700)

  # Monta um prefixo curto engolindo o aviso de minimo cacheavel — que nesses testes e
  # esperado e nao e o assunto. Capturar mantem a saida da suite legivel SEM desligar o
  # aviso, que e o que importa: um aviso desligado para o teste ficar bonito nao avisa
  # mais ninguem em producao.
  defp prefixo_curto(partes) do
    {montado, _registro} =
      with_log(fn -> Prefixo.montar("opus-5", partes) end)

    montado
  end

  defp partes(extra \\ []) do
    Keyword.merge(
      [
        ferramentas: ["ler", "escrever", "editar"],
        doutrina: doutrina_longa(),
        indice: "# MAPA\n- `lib/fabrica.ex`",
        tarefa: "T-011: montar o prefixo"
      ],
      extra
    )
  end

  describe "bytes identicos — a propriedade que sustenta a economia" do
    test "montar duas vezes, em momentos diferentes, produz bytes IDENTICOS" do
      primeiro = Prefixo.montar("opus-5", partes())
      Process.sleep(5)
      segundo = Prefixo.montar("opus-5", partes())

      assert primeiro.texto == segundo.texto
      assert primeiro.pontos_de_cache == segundo.pontos_de_cache
    end

    test "nada volatil entra: sem data, sem hash, sem contador" do
      %{texto: texto} = Prefixo.montar("opus-5", partes())

      refute texto =~ Date.to_iso8601(Date.utc_today())
      refute texto =~ ~r/\b[0-9a-f]{7,40}\b/
      refute texto =~ "gerado em"
    end

    test "a ordem e ferramentas, doutrina, indice, tarefa — e nao a de insercao" do
      # A ordem e imposta pela API, nao por convencao: um byte alterado invalida tudo o que
      # vem DEPOIS. O mais estavel tem de vir primeiro.
      # `capture_log` porque o prefixo e curto de proposito e o aviso de minimo cacheavel
      # dispara, com razao. Capturar mantem a saida da suite legivel sem desligar o aviso.
      %{texto: texto} =
        prefixo_curto(
          tarefa: "ZZZ-TAREFA",
          indice: "CCC-INDICE",
          doutrina: "BBB-DOUTRINA",
          ferramentas: "AAA-FERRAMENTAS"
        )

      assert :binary.match(texto, "AAA") < :binary.match(texto, "BBB")
      assert :binary.match(texto, "BBB") < :binary.match(texto, "CCC")
      assert :binary.match(texto, "CCC") < :binary.match(texto, "ZZZ")
    end

    test "parte ausente simplesmente nao vira bloco" do
      %{blocos: blocos} = prefixo_curto(ferramentas: "so isto")

      assert length(blocos) == 1
      assert hd(blocos).especie == :ferramentas
    end
  end

  describe "toda colecao e ordenada antes de serializar" do
    test "mapa embaralhado produz sempre o mesmo texto" do
      # Um mapa do Elixir nao promete ordem de iteracao estavel. Uma unica chave fora de
      # lugar troca os bytes do prefixo e erra o cache de todo despacho seguinte.
      uma_ordem = %{zebra: 1, alfa: 2, meio: 3, beta: 4}
      outra_ordem = %{beta: 4, meio: 3, alfa: 2, zebra: 1}

      assert Bloco.serializar(uma_ordem) == Bloco.serializar(outra_ordem)
    end

    test "o texto serializado sai em ordem alfabetica de chave" do
      texto = Bloco.serializar(%{zebra: 1, alfa: 2, meio: 3})

      assert texto == "alfa: 2\nmeio: 3\nzebra: 1"
    end

    test "keyword e tratada como mapa, e tambem sai ordenada" do
      assert Bloco.serializar(zebra: 1, alfa: 2) == Bloco.serializar(alfa: 2, zebra: 1)
    end

    test "mapa aninhado tambem e ordenado" do
      um = Bloco.serializar(%{fora: %{zebra: 1, alfa: 2}})
      outro = Bloco.serializar(%{fora: %{alfa: 2, zebra: 1}})

      assert um == outro
    end

    test "prefixo montado com mapa embaralhado da bytes identicos" do
      uma = Prefixo.montar("opus-5", partes(ferramentas: %{ler: 1, escrever: 2, editar: 3}))
      outra = Prefixo.montar("opus-5", partes(ferramentas: %{editar: 3, ler: 1, escrever: 2}))

      assert uma.texto == outra.texto
    end

    test "lista mantem a ordem dada — ela E a informacao" do
      # Ordenar uma lista seria mudar o conteudo, nao normaliza-lo. O determinismo aqui vem
      # de quem monta a lista, e por isso o mapa e o caso que precisa de ordenacao.
      assert Bloco.serializar(["c", "a", "b"]) == "c\na\nb"
    end
  end

  describe "pontos de cache" do
    test "nunca passa de 4, mesmo com mais blocos marcados" do
      %{pontos_de_cache: pontos} = Prefixo.montar("opus-5", partes())

      assert pontos <= Prefixo.maximo_de_pontos()
    end

    test "os blocos estaveis sao marcados e o da tarefa NAO" do
      %{blocos: blocos} = Prefixo.montar("opus-5", partes())
      marca = Map.new(blocos, &{&1.especie, &1.ponto_de_cache})

      assert marca[:ferramentas]
      assert marca[:doutrina]
      assert marca[:indice]

      # Marcar o bloco da tarefa pagaria escrita a cada despacho sem nunca render leitura:
      # ele muda sempre, por definicao.
      refute marca[:tarefa]
    end

    test "com MAIS blocos marcados do que a API aceita, o excedente perde a marca" do
      extras =
        Enum.map(1..6, fn n ->
          %Bloco{especie: :doutrina, texto: "bloco extra #{n}", ponto_de_cache: true}
        end)

      resultado = Prefixo.montar("opus-5", partes(blocos: extras))

      assert length(resultado.blocos) == 10, "os blocos continuam todos la"
      assert resultado.pontos_de_cache == 4, "so a MARCA e limitada, nao o conteudo"
    end

    test "quem perde a marca e o mais VOLATIL, nao o primeiro" do
      # O ponto de cache vale mais no fim de um trecho estavel longo: cortar do inicio
      # jogaria fora justamente o trecho que mais se repete entre despachos.
      extras =
        Enum.map(1..3, fn n ->
          %Bloco{especie: :indice, texto: "indice extra #{n}", ponto_de_cache: true}
        end)

      %{blocos: blocos} = Prefixo.montar("opus-5", partes(blocos: extras))

      marcados = Enum.filter(blocos, & &1.ponto_de_cache)
      ultimo_marcado = List.last(marcados)
      posicao_do_ultimo = Enum.find_index(blocos, &(&1 == ultimo_marcado))

      assert length(marcados) == 4
      assert posicao_do_ultimo < length(blocos) - 1, "os ultimos blocos ficaram sem marca"
      assert Enum.take(blocos, 4) |> Enum.all?(& &1.ponto_de_cache)
    end

    test "blocos extras entram na posicao da especie deles, nao no fim" do
      extra = %Bloco{especie: :ferramentas, texto: "FERRAMENTA-EXTRA", ponto_de_cache: false}

      %{texto: texto} =
        prefixo_curto(doutrina: "DOUTRINA", blocos: [extra], tarefa: "TAREFA")

      assert :binary.match(texto, "FERRAMENTA-EXTRA") < :binary.match(texto, "DOUTRINA")
      assert :binary.match(texto, "DOUTRINA") < :binary.match(texto, "TAREFA")
    end
  end

  describe "minimo cacheavel — por modelo, e nao monotonico" do
    test "a tabela e a que a API publica" do
      assert Prefixo.minimo_cacheavel("opus-5") == 512
      assert Prefixo.minimo_cacheavel("sonnet-5") == 1024
      assert Prefixo.minimo_cacheavel("haiku-4.5") == 4096
    end

    test "haiku exige MAIS que opus — a ordem nao e a intuitiva" do
      # E o detalhe que faz um verificador em Haiku nao cachear em silencio: o modelo mais
      # barato e o mais exigente.
      assert Prefixo.minimo_cacheavel("haiku-4.5") > Prefixo.minimo_cacheavel("opus-5")
    end

    test "modelo desconhecido cai num padrao conservador" do
      assert Prefixo.minimo_cacheavel("modelo-novo") == 1024
    end

    test "prefixo curto gera AVISO com o numero do minimo" do
      registro =
        capture_log(fn ->
          Prefixo.montar("haiku-4.5", ferramentas: "curto demais")
        end)

      assert registro =~ "4096"
      assert registro =~ "haiku-4.5"
      assert registro =~ "nao vai cachear"
    end

    test "o aviso e AVISO, nao erro: o prefixo curto ainda e montado" do
      # Prefixo curto e ineficiente, nao invalido. Derrubar o despacho por causa disso
      # trocaria um desperdicio por um prejuizo maior.
      resultado =
        capture_log(fn ->
          assert %{texto: texto, cacheavel: false} =
                   Prefixo.montar("haiku-4.5", ferramentas: "curto")

          assert texto =~ "curto"
        end)

      assert resultado =~ "ABAIXO do minimo"
    end

    test "prefixo grande o bastante NAO gera aviso" do
      registro = capture_log(fn -> Prefixo.montar("haiku-4.5", partes()) end)

      assert registro == ""
    end

    test "o mesmo prefixo cacheia em opus e nao cacheia em haiku" do
      curto = [ferramentas: String.duplicate("x", 3_000)]

      capture_log(fn ->
        assert Prefixo.montar("opus-5", curto).cacheavel
        refute Prefixo.montar("haiku-4.5", curto).cacheavel
      end)
    end
  end

  describe "estimativa de tokens" do
    test "e estimativa, e esta declarada como tal" do
      assert Prefixo.estimar_tokens(String.duplicate("a", 400)) == 100
    end

    test "texto vazio estima zero" do
      assert Prefixo.estimar_tokens("") == 0
    end
  end
end
