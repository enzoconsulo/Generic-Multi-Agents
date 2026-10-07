defmodule Fabrica.Operario.MessagesAPITest do
  @moduledoc """
  O adaptador que persegue a metade da conta que sobrou — testado SEM tocar a rede.

  A montagem do corpo e funcao publica de proposito: e isso que permite provar as tres
  armadilhas de cache sem gastar um centavo. A parte que fala HTTP usa `Req.Test`.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Operario.Bloco
  alias Fabrica.Operario.Consumo
  alias Fabrica.Operario.MessagesAPI
  alias Fabrica.Operario.Requisicao
  alias Fabrica.Operario.Resposta

  defp prefixo(textos) do
    # `Fabrica.Operario.Bloco` (o da requisicao), e nao `Fabrica.Prompt.Bloco` (o do
    # montador). Sao dois tipos com o mesmo nome curto e campos diferentes; o do operario
    # e o que atravessa a fronteira do adaptador.
    Enum.map(textos, &%Bloco{texto: &1, ponto_de_cache: true})
  end

  defp requisicao(atributos \\ %{}) do
    struct(
      %Requisicao{
        modelo: "opus-5",
        prefixo: prefixo(["doutrina do papel", "# MAPA do projeto"]),
        mensagens: [%{papel: :usuario, conteudo: "faca a T-019"}],
        ferramentas: ["ler", "escrever"]
      },
      atributos
    )
  end

  defp mensagens_longas(quantas) do
    Enum.map(1..quantas, fn n ->
      %{papel: if(rem(n, 2) == 0, do: :assistente, else: :usuario), conteudo: "volta #{n}"}
    end)
  end

  defp pontos_de_cache(corpo) do
    [corpo.tools, corpo.system, corpo.messages]
    |> List.flatten()
    |> Enum.map(&conteudo_marcado/1)
    |> List.flatten()
    |> Enum.count(& &1)
  end

  defp conteudo_marcado(%{content: conteudo}) when is_list(conteudo) do
    Enum.map(conteudo, &Map.has_key?(&1, :cache_control))
  end

  defp conteudo_marcado(item) when is_map(item), do: [Map.has_key?(item, :cache_control)]
  defp conteudo_marcado(_), do: [false]

  describe "a ordem do corpo, imposta pela API" do
    test "o corpo tem tools, system e messages" do
      corpo = MessagesAPI.montar(requisicao())

      assert Map.has_key?(corpo, :tools)
      assert Map.has_key?(corpo, :system)
      assert Map.has_key?(corpo, :messages)
      assert corpo.model == "opus-5"
    end

    test "cada faixa cai no CAMPO certo, que e o que define a ordem do prefixo" do
      # A primeira versao deste teste conferia a posicao das chaves no JSON serializado, e
      # estava errada por dois motivos. Um pratico: mapa do Elixir nao preserva ordem de
      # insercao, entao a assercao media o acaso. Outro conceitual, que e o que importa: a
      # ordem `tools -> system -> messages` e definida sobre os CAMPOS, e nao sobre a posicao
      # deles no texto do JSON. Sao campos distintos do corpo, nao uma sequencia — e a API
      # monta o prefixo de cache na ordem dela, nao na ordem em que o JSON foi escrito.
      #
      # O que precisa ser verdade, e e o que este teste afirma: cada faixa cai no campo certo,
      # e o ponto de cache fecha a faixa certa.
      corpo = MessagesAPI.montar(requisicao())

      assert Enum.map(corpo.tools, & &1.name) == ["ler", "escrever"]
      assert Enum.map(corpo.system, & &1.text) == ["doutrina do papel", "# MAPA do projeto"]
      assert Enum.map(corpo.messages, & &1.role) == ["user"]

      assert Map.has_key?(List.last(corpo.tools), :cache_control)
      assert Map.has_key?(List.last(corpo.system), :cache_control)
      refute Map.has_key?(List.last(corpo.messages), :cache_control)
    end

    test "as ferramentas viram o formato da API" do
      corpo = MessagesAPI.montar(requisicao())

      assert [%{name: "ler"}, %{name: "escrever", cache_control: _}] = corpo.tools
    end

    test "o prefixo vira blocos de system" do
      corpo = MessagesAPI.montar(requisicao())

      assert [%{type: "text", text: "doutrina do papel"}, %{text: "# MAPA do projeto"}] =
               corpo.system
    end
  end

  describe "pontos de cache: no maximo 4, com ttl de 1h nas faixas estaveis" do
    test "o ULTIMO bloco de cada faixa estavel leva o ponto" do
      # Marcar o do meio pagaria escrita sem fechar uma faixa.
      corpo = MessagesAPI.montar(requisicao())

      refute Map.has_key?(List.first(corpo.system), :cache_control)
      assert %{cache_control: %{ttl: "1h"}} = List.last(corpo.system)

      refute Map.has_key?(List.first(corpo.tools), :cache_control)
      assert %{cache_control: %{ttl: "1h"}} = List.last(corpo.tools)
    end

    test "o TTL e de 1 hora, e nao de 5 minutos" do
      # Escrita a 2,0x em vez de 1,25x, mas sobrevive ao intervalo entre etapas — e a
      # bateria de um verificador leva minutos.
      corpo = MessagesAPI.montar(requisicao())

      assert List.last(corpo.system).cache_control.ttl == "1h"
      assert List.last(corpo.tools).cache_control.ttl == "1h"
    end

    test "nunca passa de 4 pontos, nem com historico enorme" do
      corpo = MessagesAPI.montar(requisicao(%{mensagens: mensagens_longas(200)}))

      assert pontos_de_cache(corpo) <= 4
    end

    test "prefixo vazio nao gera bloco de system nem ponto" do
      corpo = MessagesAPI.montar(requisicao(%{prefixo: [], ferramentas: []}))

      assert corpo.system == []
      assert corpo.tools == []
    end
  end

  describe "ARMADILHA 1: a janela de 20 blocos" do
    test "historico com mais de 20 blocos recebe ponto de cache INTERMEDIARIO" do
      # O ponto caminha no maximo 20 blocos para tras. Sem intermediario, o ponto seguinte
      # nao acha o anterior e o cache erra EM SILENCIO — sem erro, sem aviso, so a conta
      # subindo. A v1 tem rodada com 472 chamadas de ferramenta.
      curto = MessagesAPI.montar(requisicao(%{mensagens: mensagens_longas(5)}))
      longo = MessagesAPI.montar(requisicao(%{mensagens: mensagens_longas(60)}))

      marcados_no_curto = Enum.count(curto.messages, &(conteudo_marcado(&1) == [true]))
      marcados_no_longo = Enum.count(longo.messages, &(conteudo_marcado(&1) == [true]))

      assert marcados_no_curto == 0, "historico curto nao precisa de intermediario"
      assert marcados_no_longo > 0, "historico longo PRECISA de ponto intermediario"
    end

    test "a janela e menor que os 20 que a API permite" do
      # Marcar exatamente em 20 nao deixa folga nenhuma: um bloco a mais e o cache erra.
      assert MessagesAPI.janela_de_blocos() < 20
    end

    test "os intermediarios respeitam o teto que sobra depois das faixas estaveis" do
      # Perder o ponto do prefixo custaria mais que perder um intermediario, entao as faixas
      # estaveis tem precedencia.
      corpo = MessagesAPI.montar(requisicao(%{mensagens: mensagens_longas(300)}))

      intermediarios = Enum.count(corpo.messages, &(conteudo_marcado(&1) == [true]))

      assert intermediarios <= 2
      assert pontos_de_cache(corpo) <= 4
    end
  end

  describe "ARMADILHA 3: mensagem de sistema no meio da conversa" do
    test "a instrucao por tarefa entra em `messages`, e NAO no system de topo" do
      # Editar o `system` de topo invalidaria todo o historico cacheado — e o historico e
      # justamente a parte grande.
      corpo = MessagesAPI.montar(requisicao(), instrucao_da_tarefa: "foque no criterio 2")

      assert Enum.any?(corpo.messages, &(&1.role == "system"))
      assert Enum.any?(corpo.messages, &(&1[:content] == "foque no criterio 2"))

      refute Enum.any?(corpo.system, &(&1.text =~ "criterio 2"))
    end

    test "sem instrucao por tarefa, nenhuma mensagem de sistema e inserida" do
      corpo = MessagesAPI.montar(requisicao())

      refute Enum.any?(corpo.messages, &(&1.role == "system"))
    end

    test "o system de topo e IDENTICO com e sem instrucao por tarefa" do
      # E esta a propriedade que importa: a instrucao variavel nao pode mexer no que esta
      # cacheado.
      sem = MessagesAPI.montar(requisicao())
      com = MessagesAPI.montar(requisicao(), instrucao_da_tarefa: "algo diferente")

      assert sem.system == com.system
      assert sem.tools == com.tools
    end
  end

  describe "estabilidade byte a byte" do
    test "montar duas vezes a mesma requisicao produz o MESMO corpo" do
      # Sem isto, cada despacho escreve prefixo novo e o adaptador perde a razao de existir.
      assert MessagesAPI.montar(requisicao()) == MessagesAPI.montar(requisicao())
    end

    test "o JSON serializado tambem e identico" do
      um = requisicao() |> MessagesAPI.montar() |> Jason.encode!()
      outro = requisicao() |> MessagesAPI.montar() |> Jason.encode!()

      assert um == outro
    end
  end

  describe "traducao da resposta, com stub de HTTP" do
    test "resposta de texto vira Resposta e Consumo" do
      corpo = %{
        "content" => [%{"type" => "text", "text" => "pronto"}],
        "stop_reason" => "end_turn",
        "usage" => %{
          "input_tokens" => 50,
          "cache_creation_input_tokens" => 3_000,
          "cache_read_input_tokens" => 70_000,
          "output_tokens" => 120
        }
      }

      stub = fn conn -> Req.Test.json(conn, corpo) end

      assert {:ok, %Resposta{} = resposta} =
               MessagesAPI.conversar(requisicao(), plug: stub)

      assert [%{tipo: :texto, texto: "pronto"}] = resposta.blocos
      assert resposta.motivo_parada == :fim_do_turno
      assert %Consumo{tokens_cache_leitura: 70_000, ttl_cache: :uma_hora} = resposta.consumo
    end

    test "o TTL do Consumo e :uma_hora porque fomos NOS que o pedimos" do
      # Diferente do CLI, aqui o TTL e sabido — e essa e uma das razoes de este adaptador
      # existir.
      stub = fn conn -> Req.Test.json(conn, %{"content" => [], "usage" => %{}}) end

      {:ok, resposta} = MessagesAPI.conversar(requisicao(), plug: stub)
      assert resposta.consumo.ttl_cache == :uma_hora
    end

    test "pedido de ferramenta vira :uso_de_ferramenta" do
      corpo = %{
        "content" => [
          %{"type" => "tool_use", "id" => "u1", "name" => "ler", "input" => %{"c" => "x.ex"}}
        ],
        "stop_reason" => "tool_use",
        "usage" => %{}
      }

      stub = fn conn -> Req.Test.json(conn, corpo) end

      {:ok, resposta} = MessagesAPI.conversar(requisicao(), plug: stub)

      assert resposta.motivo_parada == :uso_de_ferramenta
      assert [%{tipo: :uso_de_ferramenta, nome: "ler"}] = resposta.blocos
    end

    test "429 vira {:erro, {:cota, reabre_em}}" do
      corpo = %{"error" => %{"resets_at" => "2026-08-29T02:00:00Z"}}
      stub = fn conn -> conn |> Plug.Conn.put_status(429) |> Req.Test.json(corpo) end

      assert {:erro, {:cota, reabre_em}} = MessagesAPI.conversar(requisicao(), plug: stub)
      assert reabre_em.hour == 2
    end

    test "outro erro de HTTP volta nomeado, com o status" do
      stub = fn conn -> conn |> Plug.Conn.put_status(500) |> Req.Test.json(%{"erro" => "x"}) end

      assert {:erro, {:http, 500, _}} = MessagesAPI.conversar(requisicao(), plug: stub)
    end
  end

  describe "credencial e contrato" do
    test "implementa o behaviour Fabrica.Operario" do
      comportamentos =
        MessagesAPI.module_info(:attributes)
        |> Keyword.get_values(:behaviour)
        |> List.flatten()

      assert Fabrica.Operario in comportamentos
    end

    test "este e o UNICO modulo de producao que le ANTHROPIC_API_KEY" do
      # A exclusividade e a garantia: uma credencial lida em varios lugares e uma credencial
      # que alguem vai ler sem querer no caminho da suite.
      # A busca ignora docstring e comentario: o `@moduledoc` do `Operario.ClaudeCLI` CITA a
      # variavel para dizer que NAO a usa ("roda na assinatura, sem ANTHROPIC_API_KEY"), e
      # essa frase e valiosa. Contar mencao em prosa acusaria justamente quem documenta a
      # decisao direito — foi o mesmo tropeco da T-018, agora do outro lado.
      sem_prosa = fn arquivo ->
        arquivo
        |> File.read!()
        |> String.replace(
          ~r/@(module)?doc\s+"""
.*?"""/s,
          ""
        )
        |> String.replace(~r/^\s*#.*$/m, "")
      end

      leem =
        "lib/**/*.ex"
        |> Path.wildcard()
        |> Enum.filter(&(sem_prosa.(&1) =~ "ANTHROPIC_API_KEY"))

      assert leem == ["lib/fabrica/operario/messages_api.ex"]
    end

    test "nenhuma credencial e lida durante a suite" do
      # O stub responde sem que a chamada saia da maquina, e a variavel nem esta definida.
      assert System.get_env("ANTHROPIC_API_KEY") == nil

      stub = fn conn -> Req.Test.json(conn, %{"content" => [], "usage" => %{}}) end
      assert {:ok, _} = MessagesAPI.conversar(requisicao(), plug: stub)
    end

    test "o cabecalho registra que ESTE adaptador custa dinheiro de verdade" do
      fonte = File.read!("lib/fabrica/operario/messages_api.ex")

      assert fonte =~ "custa dinheiro de verdade"
      assert fonte =~ "cache_read_input_tokens"
    end
  end
end
