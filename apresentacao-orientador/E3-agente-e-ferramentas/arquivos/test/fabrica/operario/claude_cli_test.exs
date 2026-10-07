defmodule Fabrica.Operario.ClaudeCLITest do
  @moduledoc """
  O adaptador padrao de operacao, exercitado SEM tocar a rede e SEM gastar cota.

  O executavel vem de configuracao e aponta para um script falso que imprime eventos JSON
  conhecidos. E isso que mantem o marco da v0.1 de pe: uma suite que chamasse o CLI de
  verdade gastaria cota a cada `mix test`, e o marco cairia junto.
  """

  use ExUnit.Case, async: true

  # `interpretar/1` avisa (Logger.warning) quando o `result` nao traz a quebra por TTL — e
  # quase todo fixture fabricado deste arquivo nao a traz. O aviso so aparece se o teste falhar.
  @moduletag :capture_log

  alias Fabrica.Agente.Laco
  alias Fabrica.Custo.Precos
  alias Fabrica.Ferramentas.Catalogo
  alias Fabrica.Operario.ClaudeCLI
  alias Fabrica.Operario.Consumo
  alias Fabrica.Operario.Requisicao
  alias Fabrica.Operario.Resposta

  # Eventos no formato que o CLI emite: uma linha de JSON por evento.
  defp evento_texto(texto) do
    Jason.encode!(%{
      "type" => "assistant",
      "message" => %{"content" => [%{"type" => "text", "text" => texto}]}
    })
  end

  defp evento_ferramenta(nome, entrada, id \\ "uso-1") do
    Jason.encode!(%{
      "type" => "assistant",
      "message" => %{
        "content" => [%{"type" => "tool_use", "id" => id, "name" => nome, "input" => entrada}]
      }
    })
  end

  defp evento_resultado(opcoes \\ []) do
    Jason.encode!(%{
      "type" => "result",
      "subtype" => Keyword.get(opcoes, :subtype, "success"),
      "is_error" => Keyword.get(opcoes, :erro, false),
      "duration_ms" => 1234,
      "usage" => %{
        "input_tokens" => Keyword.get(opcoes, :entrada, 120),
        "cache_creation_input_tokens" => Keyword.get(opcoes, :escrita, 4_000),
        "cache_read_input_tokens" => Keyword.get(opcoes, :leitura, 90_000),
        "output_tokens" => Keyword.get(opcoes, :saida, 300)
      }
    })
  end

  defp saida(linhas, stderr \\ "") do
    %{stdout: Enum.join(linhas, "\n"), stderr: stderr}
  end

  # `linha/1` devolve `{:ok, linha} | {:erro, motivo}` desde a T-084 (modelo sem traducao e
  # erro nomeado). Os testes que nao sao sobre o modelo so querem a linha.
  defp linha!(requisicao) do
    {:ok, linha} = ClaudeCLI.linha(requisicao)
    linha
  end

  describe "traducao de eventos para o vocabulario do behaviour" do
    test "evento de texto vira bloco de texto" do
      assert {:ok, %Resposta{blocos: [bloco]}} =
               ClaudeCLI.interpretar(saida([evento_texto("ola"), evento_resultado()]))

      assert bloco == %{tipo: :texto, texto: "ola"}
    end

    test "evento de uso de ferramenta vira bloco de uso de ferramenta" do
      linhas = [evento_ferramenta("ler", %{"caminho" => "lib/x.ex"}), evento_resultado()]

      assert {:ok, %Resposta{blocos: [bloco]}} = ClaudeCLI.interpretar(saida(linhas))

      assert bloco.tipo == :uso_de_ferramenta
      assert bloco.nome == "ler"
      assert bloco.argumentos == %{"caminho" => "lib/x.ex"}
      assert bloco.id == "uso-1"
    end

    test "o vocabulario do CLI para AQUI: nada de tool_use vaza" do
      # O resto da fabrica nao pode saber qual adaptador esta rodando.
      linhas = [evento_ferramenta("ler", %{}), evento_resultado()]
      {:ok, resposta} = ClaudeCLI.interpretar(saida(linhas))

      refute inspect(resposta) =~ "tool_use"
      refute inspect(resposta) =~ "input_tokens"
    end

    test "varios eventos viram varios blocos, na ordem" do
      linhas = [
        evento_texto("vou ler"),
        evento_ferramenta("ler", %{}, "a"),
        evento_ferramenta("buscar", %{}, "b"),
        evento_resultado()
      ]

      {:ok, %Resposta{blocos: blocos}} = ClaudeCLI.interpretar(saida(linhas))

      assert length(blocos) == 3
      assert Enum.map(blocos, & &1.tipo) == [:texto, :uso_de_ferramenta, :uso_de_ferramenta]
    end

    test "bloco de tipo desconhecido nao derruba nada" do
      linha =
        Jason.encode!(%{
          "type" => "assistant",
          "message" => %{"content" => [%{"type" => "coisa_nova", "x" => 1}]}
        })

      assert {:ok, %Resposta{blocos: [%{tipo: :desconhecido}]}} =
               ClaudeCLI.interpretar(saida([linha, evento_resultado()]))
    end

    test "linha que nao e JSON e ignorada" do
      # O CLI as vezes escreve texto solto. Derrubar o despacho por uma linha de ruido seria
      # trocar a entrega por rigor formal.
      linhas = ["isto nao e json", evento_texto("ok"), evento_resultado()]

      assert {:ok, %Resposta{blocos: [%{texto: "ok"}]}} = ClaudeCLI.interpretar(saida(linhas))
    end

    test "saida sem evento nenhum devolve erro nomeado" do
      assert {:erro, :saida_ininteligivel} = ClaudeCLI.interpretar(saida(["lixo", "mais lixo"]))
    end
  end

  describe "o bloco de raciocinio tem tipo proprio" do
    test "thinking vira :raciocinio, e nao :desconhecido" do
      # Ele aparece em praticamente toda resposta. Deixa-lo cair em `:desconhecido` encheria o
      # historico de blocos opacos — e faria `:desconhecido` parar de significar "algo que eu
      # nao esperava", que e para o que ele serve.
      linha =
        Jason.encode!(%{
          "type" => "assistant",
          "message" => %{
            "content" => [
              %{"type" => "thinking", "thinking" => "o pedido e simples", "signature" => "abc"}
            ]
          }
        })

      assert {:ok, %Resposta{blocos: [bloco]}} = ClaudeCLI.interpretar(saida([linha]))
      assert bloco.tipo == :raciocinio
      assert bloco.texto == "o pedido e simples"
    end

    test "a assinatura vem junto, porque e ela que permite devolver o bloco ao modelo" do
      linha =
        Jason.encode!(%{
          "type" => "assistant",
          "message" => %{
            "content" => [%{"type" => "thinking", "thinking" => "x", "signature" => "sig-123"}]
          }
        })

      assert {:ok, %Resposta{blocos: [%{assinatura: "sig-123"}]}} =
               ClaudeCLI.interpretar(saida([linha]))
    end

    test "tipo REALMENTE desconhecido continua caindo em :desconhecido" do
      # O par negativo: sem ele, este bloco de testes passaria igual se `:desconhecido`
      # tivesse sumido.
      linha =
        Jason.encode!(%{
          "type" => "assistant",
          "message" => %{"content" => [%{"type" => "coisa_nova_do_futuro", "x" => 1}]}
        })

      assert {:ok, %Resposta{blocos: [%{tipo: :desconhecido}]}} =
               ClaudeCLI.interpretar(saida([linha]))
    end
  end

  describe "motivo de parada" do
    test "uso de ferramenta NO MEIO do caminho, com sessao concluida, vira :fim_do_turno" do
      # O par negativo do defeito medido na T-020 (ciclo 3): um `tool_use` que o proprio CLI
      # ja resolveu nao pode reaparecer como ":uso_de_ferramenta" so porque esta presente em
      # algum evento do stream inteiro. O motivo tem que sair do evento TERMINAL.
      linhas = [evento_ferramenta("ler", %{}), evento_resultado()]

      assert {:ok, %Resposta{motivo_parada: :fim_do_turno}} =
               ClaudeCLI.interpretar(saida(linhas))
    end

    test "so texto vira :fim_do_turno" do
      assert {:ok, %Resposta{motivo_parada: :fim_do_turno}} =
               ClaudeCLI.interpretar(saida([evento_texto("pronto"), evento_resultado()]))
    end

    test "teto de turnos do CLI vira :teto_de_voltas, e nao :teto_de_tokens" do
      # `:teto_de_tokens` e o motivo do MessagesAPI (familia :endpoint_de_modelo). Confundir
      # os dois faz a v0.3 escolher a politica de retrabalho errada para o desfecho errado.
      linhas = [evento_texto("..."), evento_resultado(subtype: "error_max_turns")]

      assert {:ok, %Resposta{motivo_parada: :teto_de_voltas}} =
               ClaudeCLI.interpretar(saida(linhas))
    end

    test "erro do CLI vira :recusa" do
      linhas = [evento_texto("nao posso"), evento_resultado(erro: true)]

      assert {:ok, %Resposta{motivo_parada: :recusa}} = ClaudeCLI.interpretar(saida(linhas))
    end

    test "nenhuma entrada possivel produz :uso_de_ferramenta" do
      # Varre com e sem tool_use, com e sem evento terminal. Sob a familia :agente_completo o
      # CLI ja executou o que tinha para executar — este adaptador nao tem motivo que signifique
      # "falta trabalho a fazer".
      variacoes = [
        [evento_texto("oi"), evento_resultado()],
        [evento_ferramenta("ler", %{}), evento_resultado()],
        [
          evento_ferramenta("ler", %{}),
          evento_ferramenta("buscar", %{}, "b"),
          evento_resultado()
        ],
        [evento_texto("oi")],
        [evento_ferramenta("ler", %{})],
        [evento_texto("..."), evento_resultado(subtype: "error_max_turns")],
        [evento_texto("nao posso"), evento_resultado(erro: true)]
      ]

      for linhas <- variacoes do
        assert {:ok, %Resposta{motivo_parada: motivo}} = ClaudeCLI.interpretar(saida(linhas))

        # Afirmado por inclusao (e nao por exclusao de :uso_de_ferramenta): o proprio checador
        # de tipos do Elixir 1.19 ja prova, a partir do corpo de `motivo_parada/1`, que estes
        # sao os UNICOS atomos possiveis — comparar contra o excluido vira aviso de tipo
        # sempre-falso, que e a prova estatica de que a garantia pegou.
        assert motivo in [:fim_do_turno, :teto_de_voltas, :recusa],
               "linhas #{inspect(linhas)} produziram motivo inesperado: #{inspect(motivo)}"
      end
    end
  end

  describe "prova com o stream REAL (T-018b)" do
    test "amostra com tool_use no meio e sessao concluida produz :fim_do_turno, com os blocos preservados" do
      # A fixture sai do stdout bruto que a T-018b salvou — nao de eventos inventados a mao,
      # que e o que ja falhou tres vezes neste projeto.
      stdout = File.read!("priv/probes/amostras/sessao-com-ferramenta.jsonl")

      assert {:ok, %Resposta{motivo_parada: :fim_do_turno} = resposta} =
               ClaudeCLI.interpretar(%{stdout: stdout, stderr: ""})

      # O REGISTRO do que a sessao fez nao pode desaparecer junto com a conclusao errada.
      assert Enum.any?(resposta.blocos, &(&1.tipo == :uso_de_ferramenta))
    end
  end

  describe "contabilidade" do
    test "o evento de resultado vira Consumo, com a reparticao de cache" do
      linhas = [
        evento_texto("x"),
        evento_resultado(entrada: 100, escrita: 5_000, leitura: 80_000, saida: 250)
      ]

      {:ok, %Resposta{consumo: consumo}} = ClaudeCLI.interpretar(saida(linhas))

      assert %Consumo{} = consumo
      assert consumo.tokens_entrada == 100
      assert consumo.tokens_cache_escrita == 5_000
      assert consumo.tokens_cache_leitura == 80_000
      assert consumo.tokens_saida == 250
      assert consumo.duracao_ms == 1234
    end

    test "resultado SEM `usage.cache_creation` continua :sem_cache, como antes da T-086" do
      # Este fixture fabricado nao traz a quebra por TTL (o `claude` 2.1.287 traz — ver o
      # describe da T-086 abaixo). Sem ela nao ha como saber o multiplicador, e o pedido da
      # T-086 para este caso e o comportamento de antes: `:sem_cache` ("nao sei").
      linhas = [evento_texto("x"), evento_resultado(leitura: 90_000)]
      {:ok, %Resposta{consumo: consumo}} = ClaudeCLI.interpretar(saida(linhas))

      assert consumo.ttl_cache == :sem_cache
      assert consumo.tokens_cache_leitura > 0
    end

    test "sem evento de resultado, o consumo e zerado e nao inventado" do
      {:ok, %Resposta{consumo: consumo}} = ClaudeCLI.interpretar(saida([evento_texto("x")]))

      assert consumo.tokens_entrada == 0
      assert consumo.tokens_saida == 0
    end
  end

  # Streams REAIS do `claude` 2.1.287, gravados em 2026-10-01 (T-086): so as linhas `assistant`
  # e `result`, copiadas sem edicao. Ficaram de fora os `stream_event` (deltas, sem efeito aqui)
  # e o `rate_limit_event` `rejected` que os dois traziam — esse e provado a parte, com a linha
  # crua, no describe da T-087 (`@rate_limit_rejected_real`).
  #
  # haiku (`claude-haiku-4-5-20251001`, gravado pelo orquestrador): 1 turno, prompt curto —
  # 4116 tokens escritos em cache de 1h.
  @stream_real_haiku ~S"""
  {"type":"assistant","message":{"model":"claude-haiku-4-5-20251001","id":"msg_011CfcDegYwkvctXzmstz2hY","type":"message","role":"assistant","content":[{"type":"thinking","thinking":"","signature":"EssDCtABCBIYAipAHTqSDoQtAIiIJnSvtjR+gvVGjoLT/7y2325wqh7eutOvk+CAw5HQnzmnUIFf3//BlLQmwABxi1pXF9ED/UBgZTIZY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMTgAQgh0aGlua2luZ1okMDNjNmZiNjgtNGFiOS00MjQ2LWI0NTEtYjU5Y2Q1ODdlZDg2chDFVo/z6akVqMy9E4asARTiiAEBmgEbChljbGF1ZGUtaGFpa3UtNC01LTIwMjUxMDAxqAH+nfvVBrABAhIMNBCpDO02NbB9aut+Ggw1SY3x5FPO7wYH614iMMxIv7X3QvZ5Ohep21Tf+T0ejM+P78ol/InBnwFHXE90Y3x61AWtaYmV3hvPQptBNCqnAYLfY55HZOdGt5R9XSEBZ8Xv84kIVr3krzWF5EAp7cFiGeI1GJmReuFKP5fEoI32yXe3N6nsZOeewXZ0EuX9A7gyIJLu7FFWUcW9VrgtfTiBgYEQ1q6Km/LYYBAuardgKRKshbDvWj+vdqIbMf+K7JQFClkIpcYZqg2jWNhiiEpmVlKG1EAJkjNKkyo2MNtkYBmJ4nypzN8X3SL3ZasYqPeblgcpOUkZGAE="}],"container":null,"stop_reason":null,"stop_sequence":null,"stop_details":null,"usage":{"input_tokens":9,"cache_creation_input_tokens":4116,"cache_read_input_tokens":0,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":4116},"output_tokens":3,"service_tier":"standard","inference_geo":"not_available"},"input_transformations":[],"diagnostics":null,"context_management":null},"parent_tool_use_id":null,"session_id":"60cb1a63-3c90-5a7d-9d0e-2e259ed13b02","uuid":"a5b06fd3-e37f-4b81-9ff2-17275c444ae1","timestamp":"2026-10-01T21:22:06.734Z","request_id":"req_011CfcDegHpbfcnXKuhxqzDZ","thinking_duration_ms":415}
  {"type":"assistant","message":{"model":"claude-haiku-4-5-20251001","id":"msg_011CfcDegYwkvctXzmstz2hY","type":"message","role":"assistant","content":[{"type":"text","text":"Hey! 👋 What can I help you with today?"}],"container":null,"stop_reason":null,"stop_sequence":null,"stop_details":null,"usage":{"input_tokens":9,"cache_creation_input_tokens":4116,"cache_read_input_tokens":0,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":4116},"output_tokens":3,"service_tier":"standard","inference_geo":"not_available"},"input_transformations":[],"diagnostics":null,"context_management":null},"parent_tool_use_id":null,"session_id":"60cb1a63-3c90-5a7d-9d0e-2e259ed13b02","uuid":"3c127919-49f3-4202-b0b7-5fc8d4052b09","timestamp":"2026-10-01T21:22:06.880Z","request_id":"req_011CfcDegHpbfcnXKuhxqzDZ"}
  {"duration_api_ms":934,"stop_reason":"end_turn","session_id":"60cb1a63-3c90-5a7d-9d0e-2e259ed13b02","total_cost_usd":0.008546,"usage":{"input_tokens":9,"cache_creation_input_tokens":4116,"cache_read_input_tokens":0,"output_tokens":61,"output_tokens_details":{"thinking_tokens":41},"server_tool_use":{"web_search_requests":0,"web_fetch_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":4116,"ephemeral_5m_input_tokens":0},"inference_geo":"not_available","iterations":[{"input_tokens":9,"output_tokens":61,"cache_read_input_tokens":0,"cache_creation_input_tokens":4116,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":4116},"type":"message"}],"speed":"standard","fallback_credit":null},"modelUsage":{"claude-haiku-4-5-20251001":{"inputTokens":9,"outputTokens":61,"cacheReadInputTokens":0,"cacheCreationInputTokens":4116,"webSearchRequests":0,"costUSD":0.008546,"contextWindow":200000,"maxOutputTokens":32000,"thinkingTokens":41,"canonicalModel":"claude-haiku-4-5","provider":"firstParty","costBasis":"list"}},"permission_denials":[],"terminal_reason":"completed","fast_mode_state":"off","fast_mode_disabled_reason":"sdk_opt_in_required","subagent_stats":{"spawned":0,"requested":{"background":0,"foreground":0,"unset":0},"started_in_background":0,"max_depth":0,"spawned_by_subagents":0,"completed":0,"failed":0,"killed":{"parent":0,"user":0,"system":0},"refused":{"depth_limit":0,"concurrency_limit":0,"budget":0},"by_type":{}},"is_error":false,"num_turns":1,"subtype":"success","api_error_status":null,"result":"Hey! 👋 What can I help you with today?","ttft_ms":813,"type":"result","duration_ms":1018,"uuid":"60571196-fe69-462c-b3ad-f7874b3192cd","ttft_stream_ms":397,"time_to_request_ms":73,"time_to_request_phases_ms":{"other":20,"system_prompt":8,"resume_other":1,"process_user_input":1,"input_attachments":6,"input_hooks":2,"transcript_persist":11,"tool_pool_refresh":1,"init_message":4,"engine_pickup":1,"autocompact":1,"query_setup":0,"model_gates":1,"tool_schema_build":2,"message_normalization":1,"client_creation":4,"request_build":9},"turn_start_resume_kind":"none","process_turn_index":0,"time_to_request_loop_lag_ms":22,"time_to_request_cpu_ms":100,"time_to_request_major_faults":0,"first_content_frame_ms":398,"time_to_request_from_spawn_ms":827835,"warm_spare_claimed":false,"time_origin_ms":1790889724588.591,"queued_turn_count":0,"result_index":0}
  """

  # sonnet: `--model claude-sonnet-5-5 --max-turns 1 --tools ""`, de um diretorio temporario
  # fora da fabrica — 1082 escritos em cache de 1h e 1395 lidos.
  @stream_real_sonnet ~S"""
  {"type":"assistant","message":{"model":"claude-sonnet-5-5","id":"msg_011CfcF3ni3WAA87QChgwAqt","type":"message","role":"assistant","content":[{"type":"text","text":"pronto"}],"container":null,"stop_reason":null,"stop_sequence":null,"stop_details":null,"usage":{"input_tokens":2,"cache_creation_input_tokens":1082,"cache_read_input_tokens":1395,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1082},"output_tokens":5,"service_tier":"standard","inference_geo":"not_available"},"input_transformations":[],"diagnostics":null,"context_management":null},"parent_tool_use_id":null,"session_id":"60cb1a63-3c90-5a7d-9d0e-2e259ed13b02","uuid":"5f80f4f8-6765-4364-874d-8b5f332192eb","timestamp":"2026-10-01T21:40:27.178Z","request_id":"req_011CfcF3nUuf6uEbEuckJh83"}
  {"duration_api_ms":916,"stop_reason":"end_turn","session_id":"60cb1a63-3c90-5a7d-9d0e-2e259ed13b02","total_cost_usd":0.004661,"usage":{"input_tokens":2,"cache_creation_input_tokens":1082,"cache_read_input_tokens":1395,"output_tokens":5,"output_tokens_details":{"thinking_tokens":0},"server_tool_use":{"web_search_requests":0,"web_fetch_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":1082,"ephemeral_5m_input_tokens":0},"inference_geo":"not_available","iterations":[{"input_tokens":2,"output_tokens":5,"cache_read_input_tokens":1395,"cache_creation_input_tokens":1082,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1082},"type":"message"}],"speed":"standard","fallback_credit":null},"modelUsage":{"claude-sonnet-5-5":{"inputTokens":2,"outputTokens":5,"cacheReadInputTokens":1395,"cacheCreationInputTokens":1082,"webSearchRequests":0,"costUSD":0.004661,"contextWindow":1000000,"maxOutputTokens":128000,"thinkingTokens":0,"canonicalModel":"claude-sonnet-5-5","provider":"firstParty","costBasis":"list"}},"permission_denials":[],"terminal_reason":"completed","fast_mode_state":"off","fast_mode_disabled_reason":"sdk_opt_in_required","subagent_stats":{"spawned":0,"requested":{"background":0,"foreground":0,"unset":0},"started_in_background":0,"max_depth":0,"spawned_by_subagents":0,"completed":0,"failed":0,"killed":{"parent":0,"user":0,"system":0},"refused":{"depth_limit":0,"concurrency_limit":0,"budget":0},"by_type":{}},"is_error":false,"num_turns":1,"subtype":"success","api_error_status":null,"result":"pronto","ttft_ms":975,"type":"result","duration_ms":1527,"uuid":"cd93c004-c3b9-4f9f-9fbf-b31de49f7dc7","ttft_stream_ms":973,"time_to_request_ms":78,"time_to_request_phases_ms":{"other":24,"system_prompt":13,"resume_other":0,"process_user_input":2,"input_attachments":7,"input_hooks":2,"transcript_persist":4,"tool_pool_refresh":1,"init_message":5,"engine_pickup":1,"autocompact":1,"query_setup":1,"model_gates":0,"tool_schema_build":2,"message_normalization":2,"client_creation":5,"request_build":8},"turn_start_resume_kind":"none","process_turn_index":0,"time_to_request_loop_lag_ms":28,"time_to_request_cpu_ms":107,"time_to_request_major_faults":0,"first_content_frame_ms":974,"time_to_request_from_spawn_ms":1928123,"warm_spare_claimed":false,"time_origin_ms":1790890825138.9204,"queued_turn_count":0,"result_index":0}
  """

  # O que o proprio CLI diz que a sessao custou: o `total_cost_usd` do evento `result`.
  defp custo_relatado(stdout) do
    stdout
    |> String.split("\n", trim: true)
    |> Enum.map(&Jason.decode!/1)
    |> Enum.find(&(&1["type"] == "result"))
    |> Map.fetch!("total_cost_usd")
  end

  # O que a fabrica calcula pelo MESMO caminho do despacho real: `interpretar` -> `Consumo` ->
  # `Precos.estimar` (e o que `Agente.Laco.contabilizar/2` faz, volta a volta).
  defp custo_calculado(stdout, modelo) do
    {:ok, %Resposta{consumo: consumo}} = ClaudeCLI.interpretar(%{stdout: stdout, stderr: ""})
    {:ok, %{total_usd: total}} = Precos.estimar(modelo, consumo)
    total
  end

  defp desvio(calculado, relatado), do: abs(calculado - relatado) / relatado

  # Troca a quebra por TTL do `result` REAL de haiku, mantendo o resto da linha intacto.
  defp haiku_com_ttl(cinco_minutos, uma_hora) do
    [assistente_1, assistente_2, resultado] = String.split(@stream_real_haiku, "\n", trim: true)

    resultado =
      resultado
      |> Jason.decode!()
      |> put_in(["usage", "cache_creation"], %{
        "ephemeral_5m_input_tokens" => cinco_minutos,
        "ephemeral_1h_input_tokens" => uma_hora
      })
      |> put_in(["usage", "cache_creation_input_tokens"], cinco_minutos + uma_hora)
      |> put_in(
        ["modelUsage", "claude-haiku-4-5-20251001", "cacheCreationInputTokens"],
        cinco_minutos + uma_hora
      )
      |> Jason.encode!()

    Enum.join([assistente_1, assistente_2, resultado], "\n")
  end

  describe "o custo de um despacho REAL bate com o total_cost_usd do proprio CLI (T-086)" do
    # Antes da T-086 a escrita de cache saia de graca (`ttl_cache: :sem_cache` -> 0,0x) e o
    # `gasto_usd` que o `Piloto.Servidor` soma contra o teto ficava de 10x a 22x abaixo do real.

    for modelo <- ["haiku-4.5", "claude-haiku-4-5-20251001"] do
      @modelo modelo
      test "haiku (#{modelo}), escrita de cache de 1h: a menos de 1% do total_cost_usd" do
        calculado = custo_calculado(@stream_real_haiku, @modelo)
        relatado = custo_relatado(@stream_real_haiku)

        assert desvio(calculado, relatado) < 0.01,
               "calculado #{calculado} x relatado pelo CLI #{relatado}"
      end
    end

    for modelo <- ["sonnet-5", "claude-sonnet-5-5"] do
      @modelo modelo
      test "sonnet (#{modelo}), escrita de 1h + leitura: a menos de 1% do total_cost_usd" do
        calculado = custo_calculado(@stream_real_sonnet, @modelo)
        relatado = custo_relatado(@stream_real_sonnet)

        assert desvio(calculado, relatado) < 0.01,
               "calculado #{calculado} x relatado pelo CLI #{relatado}"
      end
    end

    test "sessao REAL com ferramenta e varios turnos (T-018b): a menos de 1% tambem" do
      # O `usage` do `result` so conta o laco principal; o `modelUsage` conta TAMBEM as
      # chamadas auxiliares que o CLI faz por conta propria (nesta amostra, +941 de entrada e
      # +15 de saida). Lido so o `usage`, esta sessao sai 4,6% abaixo do `total_cost_usd`.
      stdout = File.read!("priv/probes/amostras/sessao-com-ferramenta.jsonl")

      calculado = custo_calculado(stdout, "haiku-4.5")
      relatado = custo_relatado(stdout)

      assert desvio(calculado, relatado) < 0.01,
             "calculado #{calculado} x relatado pelo CLI #{relatado}"
    end

    test "o TTL vem de usage.cache_creation: so 1h vira :uma_hora, com os tokens do result" do
      {:ok, %Resposta{consumo: consumo}} =
        ClaudeCLI.interpretar(%{stdout: @stream_real_haiku, stderr: ""})

      assert consumo.ttl_cache == :uma_hora
      assert consumo.tokens_cache_escrita == 4_116
      assert consumo.tokens_entrada == 9
      # O `usage` das linhas `assistant` e PARCIAL (output 3) e repetido por bloco: o numero
      # que vale e o do `result` (61).
      assert consumo.tokens_saida == 61
    end

    test "so 5 minutos vira :cinco_minutos" do
      {:ok, %Resposta{consumo: consumo}} =
        ClaudeCLI.interpretar(%{stdout: haiku_com_ttl(4_116, 0), stderr: ""})

      assert consumo.ttl_cache == :cinco_minutos
      assert consumo.tokens_cache_escrita == 4_116
    end

    test "os DOIS TTLs no mesmo despacho: os dois sao cobrados, nunca abaixo do exato, e avisa" do
      cinco_minutos = 1_000
      uma_hora = 3_116
      stdout = haiku_com_ttl(cinco_minutos, uma_hora)

      {calculado, log} =
        ExUnit.CaptureLog.with_log(fn -> custo_calculado(stdout, "haiku-4.5") end)

      # haiku: entrada 1/Mtok -> 5m a 1,25x e 1h a 2,0x; entrada 9 e saida 61 do stream real.
      exato = (9 * 1.0 + cinco_minutos * 1.25 + uma_hora * 2.0 + 61 * 5.0) / 1_000_000

      # O freio do piloto soma este numero contra o teto: errar para BAIXO e gastar acima dele.
      assert calculado >= exato
      assert log =~ "dois TTLs"
    end
  end

  describe "A PAREDE DE COTA" do
    test "evento estruturado de limite vira {:erro, {:cota, reabre_em}}" do
      linha =
        Jason.encode!(%{
          "type" => "result",
          "subtype" => "usage_limit",
          "resetsAt" => "2026-08-28T21:00:00Z"
        })

      assert {:erro, {:cota, reabre_em}} = ClaudeCLI.interpretar(saida([linha]))
      assert %DateTime{} = reabre_em
      assert reabre_em.hour == 21
    end

    test "horario em unix tambem e reconhecido" do
      linha =
        Jason.encode!(%{"type" => "usage_limit", "resets_at" => 1_787_000_000})

      assert {:erro, {:cota, %DateTime{}}} = ClaudeCLI.interpretar(saida([linha]))
    end

    test "mensagem em TEXTO tambem e reconhecida, com o horario extraido" do
      # O CLI sinaliza de mais de uma forma conforme a versao. Perder a parede de cota por
      # causa do formato faria a v0.4 dormir sem saber ate quando.
      texto = "Claude usage limit reached. Your limit will reset at 2026-08-28T22:30:00Z"

      assert {:erro, {:cota, reabre_em}} = ClaudeCLI.interpretar(saida([], texto))
      assert reabre_em.hour == 22
      assert reabre_em.minute == 30
    end

    test "limite sem horario ainda e limite" do
      # Sem horario a v0.4 nao sabe quando rearmar, mas continua sabendo que precisa parar.
      # Devolver :nao aqui faria a fabrica seguir batendo na parede.
      assert {:erro, {:cota, nil}} = ClaudeCLI.interpretar(saida([], "usage limit reached"))
    end

    test "o evento ESTRUTURADO tem precedencia sobre o texto" do
      linha =
        Jason.encode!(%{
          "type" => "result",
          "subtype" => "usage_limit",
          "resetsAt" => "2026-08-28T23:00:00Z"
        })

      assert {:erro, {:cota, reabre_em}} =
               ClaudeCLI.interpretar(saida([linha], "rate limit em algum momento"))

      assert reabre_em.hour == 23
    end

    test "resposta normal NAO e confundida com cota" do
      linhas = [evento_texto("tudo certo"), evento_resultado()]
      assert {:ok, %Resposta{}} = ClaudeCLI.interpretar(saida(linhas))
    end

    # O FORMATO REAL, capturado do CLI na T-018a. Ate ela, `cota/2` procurava
    # `subtype in ["usage_limit","rate_limit"]` ou `type == "usage_limit"` — e o evento real
    # nao tem `subtype` e tem `type: "rate_limit_event"`. O ramo estruturado NUNCA disparava.
    defp evento_de_cota(status, opcoes \\ []) do
      Jason.encode!(%{
        "type" => "rate_limit_event",
        "rate_limit_info" => %{
          "status" => status,
          "rateLimitType" => "five_hour",
          "resetsAt" => Keyword.get(opcoes, :reabre, 1_788_236_400),
          "unifiedWindows" => %{
            "five_hour" => %{"utilization" => 0.67, "resetsAt" => 1_788_236_400},
            "seven_day" => %{"utilization" => 0.6, "resetsAt" => 1_788_490_800}
          }
        }
      })
    end

    test "rate_limit_event com status ALLOWED nao e parede" do
      # Ele vem em TODA resposta saudavel. Trata-lo como parede pararia a fabrica a cada volta.
      linhas = [evento_de_cota("allowed"), evento_texto("pong"), evento_resultado()]

      assert {:ok, %Resposta{}} = ClaudeCLI.interpretar(saida(linhas))
    end

    test "rate_limit_event com status allowed_warning tambem NAO e parede" do
      # Descoberto na amostra real da T-018b: `status: "allowed_warning"` (utilizacao 0.99,
      # `isUsingOverage: false`, so acima do limiar de aviso) e AINDA permitido — comparar por
      # igualdade exata contra "allowed" tratava isso como parede e derrubava a sessao inteira
      # num falso positivo, o que impedia a propria prova desta tarefa com o stream real.
      linhas = [evento_de_cota("allowed_warning"), evento_texto("pong"), evento_resultado()]

      assert {:ok, %Resposta{}} = ClaudeCLI.interpretar(saida(linhas))
    end

    test "rate_limit_event com status diferente de allowed E a parede" do
      # A regra compara contra o status BOM, e nao contra uma lista de status ruins: adivinhar
      # quais existem e o que fez a versao anterior nunca disparar.
      for status <- ["blocked", "rejected", "exceeded", "qualquer_coisa"] do
        linhas = [evento_de_cota(status), evento_resultado()]

        assert {:erro, {:cota, %DateTime{}}} = ClaudeCLI.interpretar(saida(linhas)),
               "status #{status} deveria ser parede"
      end
    end

    test "o horario da parede sai de dentro do rate_limit_info" do
      linhas = [evento_de_cota("blocked", reabre: 1_787_000_000)]

      assert {:erro, {:cota, reabre_em}} = ClaudeCLI.interpretar(saida(linhas))
      assert DateTime.to_unix(reabre_em) == 1_787_000_000
    end

    test "a utilizacao das janelas fica disponivel, e chega de graca" do
      # E o numero que o piloto automatico da v1.0 vai querer para decidir se comeca mais uma
      # rodada — e ele vem em toda resposta, sem custo nenhum.
      stdout = Enum.join([evento_de_cota("allowed"), evento_resultado()], "\n")

      assert %{"five_hour" => %{"utilization" => 0.67}, "seven_day" => _} =
               ClaudeCLI.janelas_de_cota(stdout)
    end

    test "sem rate_limit_event, as janelas sao nil em vez de mapa vazio" do
      # `nil` diz "o CLI nao informou"; `%{}` diria "informou que nao ha janela", que e outra
      # coisa e mandaria o piloto automatico decidir com base em nada.
      assert ClaudeCLI.janelas_de_cota(evento_resultado()) == nil
    end
  end

  # O `rate_limit_event` CRU que o `claude` 2.1.287 emitiu em 2026-10-01 numa chamada que FOI
  # atendida (haiku, `result` success logo depois) — copiado sem edicao do stream real. Janela de
  # 7 dias com utilizacao 1, `overageStatus: rejected`, `isUsingOverage: false` (sem cobranca
  # extra). E o achado 1 da T-084.
  @rate_limit_rejected_real ~S"""
  {"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":1790910000,"rateLimitType":"seven_day","overageStatus":"rejected","overageDisabledReason":"org_level_disabled","isUsingOverage":false,"unifiedWindows":{"five_hour":{"utilization":0,"resetsAt":1790907600},"seven_day":{"utilization":1,"resetsAt":1790910000}}},"uuid":"9cbddf17-e2ae-4b2d-b162-d837700dfcd6","session_id":"60cb1a63-3c90-5a7d-9d0e-2e259ed13b02"}
  """

  # O stream real de haiku com o aviso no lugar em que o CLI o emitiu: depois do ultimo
  # `assistant`, imediatamente antes do `result`.
  defp haiku_com_aviso_rejected do
    [assistente_1, assistente_2, resultado] = String.split(@stream_real_haiku, "\n", trim: true)

    Enum.join(
      [assistente_1, assistente_2, String.trim(@rate_limit_rejected_real), resultado],
      "\n"
    )
  end

  # As mensagens de PAREDE do `claude` 2.1.287, lidas das strings do executavel instalado
  # (`/opt/claude-code/bin/claude`, so leitura; Revisao do Ciclo 2 da T-087 e Ciclo 3). O modelo
  # e `` `You've hit your ${janela}${...}` `` com o nome da janela NO MEIO — o mapa do proprio CLI:
  # five_hour "session limit", seven_day "weekly limit", seven_day_opus "Opus limit",
  # seven_day_sonnet "Sonnet limit", overage "usage credit limit" —, mais os literais de gasto
  # ("monthly spend limit", "channel's monthly spend limit", "team's shared budget", "monthly
  # limit") e o "fast limit". As cinco primeiras sao as que o criterio do Ciclo 3 nomeia; a
  # ultima trava a alternativa "monthly spend limit" sem o prefixo.
  @mensagens_de_parede [
    "You've hit your limit · resets 3am (UTC)",
    "You've hit your weekly limit · resets Oct 2, 3am (UTC)",
    "You've hit your session limit · resets 3am (UTC)",
    "You've hit your Opus limit · resets Oct 2, 3am (UTC)",
    "You've hit your monthly spend limit · your monthly spend limit resets Nov 1",
    "You've hit your Sonnet limit · resets Oct 2, 3am (UTC)",
    "You've hit your usage credit limit",
    "You've hit your fast limit · resets in 2h",
    "You've hit your channel's monthly spend limit.",
    "You've hit your team's shared budget. /model to switch models.",
    "You've hit your monthly limit — raise it below, or it resets next month",
    "Request blocked: monthly spend limit"
  ]

  defp result_de_erro(campos) do
    %{"type" => "result", "subtype" => "success", "is_error" => true}
    |> Map.merge(campos)
    |> Jason.encode!()
  end

  describe "aviso rejected com a chamada ATENDIDA nao e parede (T-087)" do
    # D-015, adendo: o veredito e do `result`, nao do aviso. Parede = a chamada NAO foi atendida.

    test "rejected + result is_error: false com resposta -> sucesso, com a resposta e o consumo" do
      stdout = haiku_com_aviso_rejected()

      assert {:ok, %Resposta{} = resposta} = ClaudeCLI.interpretar(%{stdout: stdout, stderr: ""})

      assert resposta.motivo_parada == :fim_do_turno

      assert %{tipo: :texto, texto: "Hey! 👋 What can I help you with today?"} in resposta.blocos

      # O consumo e o do `result` real — o trabalho foi feito e pago, e entra na conta do piloto.
      assert resposta.consumo.tokens_cache_escrita == 4_116
      assert resposta.consumo.tokens_saida == 61
      assert resposta.consumo.ttl_cache == :uma_hora

      assert desvio(custo_calculado(stdout, "haiku-4.5"), custo_relatado(stdout)) < 0.01
    end

    test "rejected + result de ERRO por limite -> continua parede, com o resetsAt do evento" do
      resultado =
        Jason.encode!(%{
          "type" => "result",
          "subtype" => "success",
          "is_error" => true,
          "result" => "You've hit your limit"
        })

      linhas = [String.trim(@rate_limit_rejected_real), resultado]

      assert {:erro, {:cota, reabre_em}} = ClaudeCLI.interpretar(saida(linhas))
      assert DateTime.to_unix(reabre_em) == 1_790_910_000
    end

    test "rejected SEM result (a chamada nao terminou) -> continua parede, com o resetsAt" do
      [assistente_1 | _] = String.split(@stream_real_haiku, "\n", trim: true)

      for linhas <- [
            [String.trim(@rate_limit_rejected_real)],
            [assistente_1, String.trim(@rate_limit_rejected_real)]
          ] do
        assert {:erro, {:cota, reabre_em}} = ClaudeCLI.interpretar(saida(linhas))
        assert DateTime.to_unix(reabre_em) == 1_790_910_000
      end
    end

    test "o aviso rejected atendido NAO some em silencio: Logger.warning com a janela e o resetsAt" do
      {resultado, log} =
        ExUnit.CaptureLog.with_log(fn ->
          ClaudeCLI.interpretar(%{stdout: haiku_com_aviso_rejected(), stderr: ""})
        end)

      assert {:ok, %Resposta{}} = resultado
      assert log =~ "[warning]"
      assert log =~ "rejected"
      assert log =~ "seven_day"
      assert log =~ "2026-10-02T03:00:00Z"
    end

    test "sem aviso rejected, nenhum warning de cota" do
      {resultado, log} =
        ExUnit.CaptureLog.with_log(fn ->
          ClaudeCLI.interpretar(%{stdout: @stream_real_haiku, stderr: ""})
        end)

      assert {:ok, %Resposta{}} = resultado
      refute log =~ "rejected"
    end

    # O stream que o orquestrador MEDIU no `claude` 2.1.287 em 2026-10-01 (Revisao do Ciclo 1 da
    # T-087): haiku, `--max-turns 1`, Bash — o aviso `rejected`, a ferramenta chamada e executada,
    # e o `result` `error_max_turns` com `is_error: true`, `result: null`, `num_turns: 2` e
    # `total_cost_usd: 0.0042558`. A chamada FOI atendida (duas voltas, pagas) e parou no teto de
    # voltas da PROPRIA fabrica. Os campos do `result` sao os medidos; os tokens sao ilustrativos.
    defp stream_teto_de_voltas(opcoes \\ []) do
      resultado =
        Jason.encode!(%{
          "type" => "result",
          "subtype" => "error_max_turns",
          "is_error" => true,
          "result" => nil,
          "num_turns" => 2,
          "total_cost_usd" => 0.0042558,
          "api_error_status" => nil,
          "duration_ms" => 3_100,
          "usage" => %{
            "input_tokens" => 18,
            "cache_creation_input_tokens" => 1_500,
            "cache_read_input_tokens" => 9_000,
            "output_tokens" => 120,
            "cache_creation" => %{
              "ephemeral_1h_input_tokens" => 1_500,
              "ephemeral_5m_input_tokens" => 0
            }
          }
        })

      aviso =
        if Keyword.get(opcoes, :aviso, true),
          do: [String.trim(@rate_limit_rejected_real)],
          else: []

      Enum.join(
        aviso ++
          [
            evento_ferramenta("Bash", %{"command" => "ls"}),
            evento_texto("Vou listar os arquivos."),
            resultado
          ],
        "\n"
      )
    end

    test "rejected + result error_max_turns (o stream medido) -> :teto_de_voltas com consumo e warning; NAO parede" do
      {resultado, log} =
        ExUnit.CaptureLog.with_log(fn ->
          ClaudeCLI.interpretar(%{stdout: stream_teto_de_voltas(), stderr: ""})
        end)

      assert {:ok, %Resposta{} = resposta} = resultado
      assert resposta.motivo_parada == :teto_de_voltas

      # O trabalho feito chega ao chamador: a ferramenta executada e o texto.
      assert %{tipo: :uso_de_ferramenta, nome: "Bash", argumentos: %{"command" => "ls"}} =
               Enum.find(resposta.blocos, &(&1.tipo == :uso_de_ferramenta))

      assert %{tipo: :texto, texto: "Vou listar os arquivos."} in resposta.blocos

      # E o consumo do `result` entra na conta do piloto, em vez de sumir com um erro de cota.
      assert resposta.consumo.tokens_entrada == 18
      assert resposta.consumo.tokens_cache_escrita == 1_500
      assert resposta.consumo.tokens_cache_leitura == 9_000
      assert resposta.consumo.tokens_saida == 120
      assert resposta.consumo.ttl_cache == :uma_hora

      # O aviso nao some em silencio.
      assert log =~ "[warning]"
      assert log =~ "rejected"
      assert log =~ "seven_day"
      assert log =~ "2026-10-02T03:00:00Z"

      # O caminho e o MESMO que o stream seguiria sem a linha do aviso.
      assert resultado ==
               ClaudeCLI.interpretar(%{stdout: stream_teto_de_voltas(aviso: false), stderr: ""})
    end

    test "rejected + result de ERRO PROPRIO conhecido que NAO e por limite -> segue o caminho de sem o aviso, nunca parede" do
      # O `result` de erro com subtype PROPRIO diz a propria causa. Teto de voltas, erro de
      # execucao, teto de gasto: a chamada chegou ao CLI e terminou por outro motivo — o aviso
      # `rejected` nao muda isso. Com ou sem bloco de `assistant` antes. A forma com `errors` e a
      # que o executavel do 2.1.287 monta para `error_during_execution` (lida das strings dele).
      #
      # Ate o Ciclo 2 este teste tambem tinha `subtype: "success"` + "API Error: 529/500" como
      # atendidos. A trava (a) do Ciclo 3 os move para parede quando o aviso esta presente (ver
      # "trava (a)" abaixo): `success` com `is_error: true` e exatamente a forma da parede real.
      for {subtype, campos} <- [
            {"error_max_turns", %{"result" => nil}},
            {"error_during_execution", %{"result" => nil}},
            {"error_during_execution",
             %{"errors" => ["turn_handoff: the turn was stopped before any of its calls ran"]}},
            {"error_max_budget_usd", %{"result" => nil}}
          ],
          antes <- [[], [evento_texto("...")]] do
        resultado = result_de_erro(Map.put(campos, "subtype", subtype))

        com_aviso = saida([String.trim(@rate_limit_rejected_real)] ++ antes ++ [resultado])
        sem_aviso = saida(antes ++ [resultado])

        assert {:ok, %Resposta{}} = ClaudeCLI.interpretar(com_aviso),
               "#{subtype} / #{inspect(campos)} / #{length(antes)} bloco(s) nao e parede"

        assert ClaudeCLI.interpretar(com_aviso) == ClaudeCLI.interpretar(sem_aviso)
      end
    end

    test "trava (a): com o aviso, is_error: true de subtype que NAO e erro proprio conhecido e parede, sem depender do texto" do
      # A parede real do 2.1.287 chega como `subtype: "success"` + `is_error: true` (Revisao do
      # Ciclo 2). Com o aviso `rejected` presente, so os tres erros PROPRIOS conhecidos ficam
      # atendidos; qualquer outro `is_error: true` e parede, mesmo que o texto nao seja
      # reconhecido — o reconhecedor de texto e a SEGUNDA trava, nao a unica.
      for campos <- [
            %{"subtype" => "success", "result" => "API Error: 529 Overloaded"},
            %{"subtype" => "success", "result" => "API Error: 500 Internal server error"},
            %{"subtype" => "success", "result" => "mensagem que ninguem previu"},
            %{"subtype" => "success", "result" => nil},
            %{"subtype" => nil, "result" => "sem subtype"},
            %{"subtype" => "error_de_uma_versao_futura", "result" => nil}
          ],
          antes <- [[], [evento_texto("...")]] do
        resultado = result_de_erro(campos)

        com_aviso = saida([String.trim(@rate_limit_rejected_real)] ++ antes ++ [resultado])

        assert {:erro, {:cota, reabre_em}} = ClaudeCLI.interpretar(com_aviso),
               "#{inspect(campos)} / #{length(antes)} bloco(s) com aviso: deveria ser parede"

        assert DateTime.to_unix(reabre_em) == 1_790_910_000

        # Sem o aviso nao ha sinal de cota nenhum: o erro segue como resposta (`:recusa`).
        assert {:ok, %Resposta{}} = ClaudeCLI.interpretar(saida(antes ++ [resultado])),
               "#{inspect(campos)} sem aviso nao e parede"
      end
    end

    test "trava (b): cada mensagem de parede do CLI, COM e SEM o aviso -> parede" do
      for mensagem <- @mensagens_de_parede,
          # o CLI escreve a mensagem num `assistant` sintetico E no `result`; com e sem ele
          antes <- [[], [evento_texto(mensagem)]] do
        resultado = result_de_erro(%{"subtype" => "success", "result" => mensagem})

        com_aviso = saida([String.trim(@rate_limit_rejected_real)] ++ antes ++ [resultado])
        sem_aviso = saida(antes ++ [resultado])

        assert {:erro, {:cota, reabre_em}} = ClaudeCLI.interpretar(com_aviso),
               "#{inspect(mensagem)} com aviso: deveria ser parede"

        assert DateTime.to_unix(reabre_em) == 1_790_910_000

        assert {:erro, {:cota, _}} = ClaudeCLI.interpretar(sem_aviso),
               "#{inspect(mensagem)} SEM aviso: deveria ser parede (fallback por texto)"
      end
    end

    test "trava (b) no caminho COM aviso: mensagem de limite dentro de um erro PROPRIO tambem e parede" do
      # `error_during_execution` e atendido pela trava (a) — mas se o erro que ele carrega e a
      # mensagem de limite, a cota barrou a chamada no meio. O reconhecedor le `result` e
      # `errors` (o campo onde o 2.1.287 poe o motivo dos erros proprios), e o `resetsAt` e o do
      # aviso, nao o `nil` que o fallback por texto daria.
      for mensagem <- @mensagens_de_parede,
          campos <- [%{"result" => mensagem}, %{"result" => nil, "errors" => [mensagem]}] do
        resultado = result_de_erro(Map.put(campos, "subtype", "error_during_execution"))
        com_aviso = saida([String.trim(@rate_limit_rejected_real), resultado])

        assert {:erro, {:cota, reabre_em}} = ClaudeCLI.interpretar(com_aviso),
               "#{inspect(campos)}: deveria ser parede"

        assert DateTime.to_unix(reabre_em) == 1_790_910_000
      end
    end

    test "o reconhecedor da mensagem de limite e UM so, usado pelos dois caminhos" do
      fonte = File.read!("lib/fabrica/operario/claude_cli.ex")

      # Uma unica regex fala de limite no modulo — nada de uma lista no `result` e outra no
      # fallback, que foi como a parede de janela escapou de um lado e nao do outro.
      assert length(Regex.scan(~r/~r\/[^\n]*limit/i, fonte)) == 1
      assert fonte =~ "texto_de_limite?(texto) ->"
    end

    test "o proprio stream do CLI nao casa com o reconhecedor (sem parede falsa)" do
      # O aviso cru e os `result` reais trazem `rate_limit_event`, `rate_limit_info`,
      # `rateLimitType`, `depth_limit`, `concurrency_limit` — nenhum deles e mensagem de limite.
      for stdout <- [haiku_com_aviso_rejected(), @stream_real_haiku, @stream_real_sonnet] do
        assert {:ok, %Resposta{}} = ClaudeCLI.interpretar(%{stdout: stdout, stderr: ""})
      end
    end

    test "rejected + result de erro POR LIMITE, em cada forma reconhecida -> parede com o resetsAt do evento" do
      for campos <- [
            %{"result" => "You've hit your limit · resets 3am (UTC)"},
            %{"result" => "Claude AI usage limit reached|1790910000"},
            %{"result" => "5-hour limit reached ∙ resets 3am"},
            %{"result" => ~S(API Error: 429 {"error":{"type":"rate_limit_error"}})},
            %{"result" => "Request rejected", "api_error_status" => 429}
          ],
          antes <- [[], [evento_texto("...")]] do
        resultado =
          %{"type" => "result", "subtype" => "success", "is_error" => true}
          |> Map.merge(campos)
          |> Jason.encode!()

        linhas = [String.trim(@rate_limit_rejected_real)] ++ antes ++ [resultado]

        assert {:erro, {:cota, reabre_em}} = ClaudeCLI.interpretar(saida(linhas)),
               "#{inspect(campos)} e erro por limite: deveria ser parede"

        assert DateTime.to_unix(reabre_em) == 1_790_910_000
      end
    end
  end

  describe "o executavel vem de CONFIGURACAO" do
    test "o padrao e `claude`" do
      original = Application.get_env(:fabrica, :claude_cli)
      Application.delete_env(:fabrica, :claude_cli)
      on_exit(fn -> if original, do: Application.put_env(:fabrica, :claude_cli, original) end)

      assert ClaudeCLI.executavel() == "claude"
    end

    test "a configuracao substitui o padrao — e e assim que o teste nao gasta cota" do
      Application.put_env(:fabrica, :claude_cli, "C:/falso/claude-de-teste")
      on_exit(fn -> Application.delete_env(:fabrica, :claude_cli) end)

      assert ClaudeCLI.executavel() == "C:/falso/claude-de-teste"
    end
  end

  describe "o contrato e o que o cabecalho promete" do
    test "implementa o behaviour Fabrica.Operario" do
      comportamentos =
        ClaudeCLI.module_info(:attributes) |> Keyword.get_values(:behaviour) |> List.flatten()

      assert Fabrica.Operario in comportamentos
    end

    test "o cabecalho registra que este adaptador NAO posiciona pontos de cache, e por que" do
      fonte = File.read!("lib/fabrica/operario/claude_cli.ex")

      assert fonte =~ "nao posiciona pontos de cache"
      assert fonte =~ "cache_control"
      assert fonte =~ "MessagesAPI"
    end

    test "o cabecalho registra a parede de cota como ausente da documentacao do TCC" do
      fonte = File.read!("lib/fabrica/operario/claude_cli.ex")

      assert fonte =~ "parede de cota"
      assert fonte =~ "ausente da documentacao"
    end

    test "a linha de comando leva --verbose, e sem ele o CLI RECUSA a chamada" do
      # Nao e preferencia de formato: `claude --print --output-format stream-json` sem
      # `--verbose` sai com codigo 1 e stdout VAZIO. A T-018 nao o tinha e passou por 26
      # testes verdes, porque todos exercitavam a traducao e nenhum o disparo. O probe real
      # (`priv/probes/cli_real.exs`) e o que fecha essa lacuna; este teste so impede a
      # regressao silenciosa da linha.
      fonte = File.read!("lib/fabrica/operario/claude_cli.ex")

      assert fonte =~ "--verbose"
      assert fonte =~ "--output-format stream-json"
    end

    test "interpretar/1 aceita o resultado COMPLETO do Comando, e nao so duas chaves" do
      # Este teste existe por causa de um defeito de SPEC, e nao de execucao. Ate a T-022a o
      # `@spec` declarava um mapa de exatamente `stdout` e `stderr`, enquanto
      # `Comando.rodar_separado/3` devolve tambem `motivo`, `codigo` e a duracao — e o
      # Dialyzer dizia, com razao, que `conversar/2` chamava esta funcao de um jeito que nunca
      # sucede. Cada teste anterior montava o mapa de duas chaves a mao e por isso nenhum
      # tocava na divergencia.
      resultado_do_comando = %{
        stdout: Enum.join([evento_texto("pronto"), evento_resultado()], "\n"),
        stderr: "",
        motivo: :normal,
        codigo: 0,
        duracao_ms: 4_210
      }

      assert {:ok, %Resposta{} = resposta} = ClaudeCLI.interpretar(resultado_do_comando)
      assert [%{tipo: :texto, texto: "pronto"}] = resposta.blocos
      assert %Consumo{tokens_cache_leitura: 90_000} = resposta.consumo
    end
  end

  describe "a auditoria de confinamento (T-012a) — metade 2, via Confinamento.resolver/2" do
    # Mesma base do `Fabrica.Ferramentas.ConfinamentoTest`: sob `_build`, e nao
    # `System.tmp_dir!/0`, para nao esbarrar na limitacao 8.3 ja documentada em
    # `Fabrica.Ferramentas.Confinamento` (que erra para o lado seguro, mas atrapalharia um
    # teste que quer provar o caminho DENTRO passando).
    setup do
      base = Path.join([File.cwd!(), "_build", "test", "tmp"])
      raiz = Path.join(base, "conf-cli-#{System.unique_integer([:positive])}")
      File.mkdir_p!(raiz)
      on_exit(fn -> File.rm_rf(raiz) end)
      {:ok, raiz: raiz}
    end

    test "tool_use com file_path FORA da raiz faz interpretar/2 devolver o erro nomeado", %{
      raiz: raiz
    } do
      fora = Path.join(Path.dirname(raiz), "fora-#{System.unique_integer([:positive])}.txt")
      linhas = [evento_ferramenta("escrever", %{"file_path" => fora}), evento_resultado()]

      assert {:erro, {:fora_do_confinamento, caminhos}} =
               ClaudeCLI.interpretar(saida(linhas), raiz)

      assert fora in caminhos
    end

    test "o MESMO stream, com o caminho DENTRO da raiz, devolve {:ok, %Resposta{}}", %{
      raiz: raiz
    } do
      dentro = Path.join(raiz, "ok.txt")
      linhas = [evento_ferramenta("escrever", %{"file_path" => dentro}), evento_resultado()]

      assert {:ok, %Resposta{}} = ClaudeCLI.interpretar(saida(linhas), raiz)
    end

    test "travessia (\"..\\fora.txt\") tambem e pega, porque e a MESMA funcao da T-012", %{
      raiz: raiz
    } do
      linhas = [
        evento_ferramenta("escrever", %{"file_path" => "../fora-por-travessia.txt"}),
        evento_resultado()
      ]

      assert {:erro, {:fora_do_confinamento, _caminhos}} =
               ClaudeCLI.interpretar(saida(linhas), raiz)
    end

    test "sem raiz (interpretar/1) a auditoria fica desligada, por nao ter contra o que comparar" do
      linhas = [
        evento_ferramenta("escrever", %{"file_path" => "C:/fora-de-qualquer-raiz.txt"}),
        evento_resultado()
      ]

      assert {:ok, %Resposta{}} = ClaudeCLI.interpretar(saida(linhas))
    end

    test "notebook_path e path sao auditados, e nao so file_path", %{raiz: raiz} do
      fora = Path.join(Path.dirname(raiz), "fora-notebook.ipynb")
      linhas = [evento_ferramenta("editar", %{"notebook_path" => fora}), evento_resultado()]

      assert {:erro, {:fora_do_confinamento, [^fora]}} =
               ClaudeCLI.interpretar(saida(linhas), raiz)
    end

    test "argumento que nao e caminho (ex.: comando de shell) nao entra na auditoria", %{
      raiz: raiz
    } do
      # A lacuna do shell e reconhecida no @moduledoc, nao fingida aqui: `command` nao esta em
      # `@chaves_de_caminho`, entao nada compara este argumento contra a raiz.
      linhas = [
        evento_ferramenta("rodar", %{"command" => "type C:\\fora\\segredo.txt"}),
        evento_resultado()
      ]

      assert {:ok, %Resposta{}} = ClaudeCLI.interpretar(saida(linhas), raiz)
    end

    test "a auditoria usa Fabrica.Ferramentas.Confinamento.resolver/2, e nao regra de caminho propria" do
      fonte = File.read!("lib/fabrica/operario/claude_cli.ex")

      assert fonte =~ "Confinamento.resolver(raiz, caminho)"
      refute fonte =~ "Path.type(caminho)"
      refute Regex.match?(~r/String\.starts_with\?\(caminho/, fonte)
    end
  end

  describe "a lacuna do confinamento de comando de shell esta registrada no cabecalho" do
    test "as tres saidas possiveis estao escritas, e a decisao e do Enzo" do
      fonte = File.read!("lib/fabrica/operario/claude_cli.ex")

      assert fonte =~ "nao permitir a ferramenta de shell"
      assert fonte =~ "opcao D"
      assert fonte =~ "MCP"
      assert fonte =~ "aceitar a lacuna"
    end
  end

  describe "familia — este adaptador roda o proprio laco" do
    test "familia/0 devolve :agente_completo" do
      assert ClaudeCLI.familia() == :agente_completo
    end

    test "Fabrica.Operario.familia/1 resolve para :agente_completo atraves do adaptador" do
      assert Fabrica.Operario.familia(ClaudeCLI) == :agente_completo
    end
  end

  describe "o modelo na fronteira com o CLI (T-084)" do
    # Medido em 2026-10-01 contra o `claude` 2.1.287: `--model sonnet-5` e recusado
    # (`[claude-code:unrecognized_model]`, `is_error: true`). O nome interno e a chave da
    # fabrica (contabilidade, cota, escada); na linha de comando ele vira o ID real.
    for {interno, id} <- [
          {"sonnet-5", "claude-sonnet-5-5"},
          {"opus-5", "claude-opus-5-5"},
          {"haiku-4.5", "claude-haiku-4-5-20251001"}
        ] do
      @interno interno
      @id id

      test "#{interno} vira --model #{id} na linha montada" do
        requisicao = %Requisicao{papel: "construtor", modelo: @interno, mensagens: []}

        assert {:ok, linha} = ClaudeCLI.linha(requisicao)
        assert linha =~ ~r/--model #{Regex.escape(@id)}$/
        refute linha =~ "--model #{@interno}"
      end
    end

    test "modelo_cli/1 e a traducao, e e idempotente sobre o ID real" do
      for {interno, id} <- ClaudeCLI.modelos_cli() do
        assert ClaudeCLI.modelo_cli(interno) == {:ok, id}
        assert ClaudeCLI.modelo_cli(id) == {:ok, id}
      end
    end

    test "a traducao cobre os tres nomes internos que a fabrica usa" do
      assert ClaudeCLI.modelos_cli() |> Map.keys() |> Enum.sort() ==
               ["haiku-4.5", "opus-5", "sonnet-5"]
    end

    test "nome interno desconhecido e erro nomeado — nunca vai cru para o CLI" do
      requisicao = %Requisicao{papel: "construtor", modelo: "sonnet-6", mensagens: []}

      assert ClaudeCLI.linha(requisicao) == {:erro, {:modelo_sem_traducao, "sonnet-6"}}
      assert ClaudeCLI.modelo_cli("sonnet-6") == {:erro, {:modelo_sem_traducao, "sonnet-6"}}
    end

    test "modelo ausente tambem e erro nomeado, e nao `--model ` vazio" do
      requisicao = %Requisicao{papel: "construtor", modelo: nil, mensagens: []}

      assert ClaudeCLI.linha(requisicao) == {:erro, {:modelo_sem_traducao, nil}}
    end

    test "os apelidos curtos do proprio CLI passam como ja traduzidos (as sondas usam `haiku`)" do
      for apelido <- ["haiku", "sonnet", "opus"] do
        requisicao = %Requisicao{papel: "construtor", modelo: apelido, mensagens: []}

        assert {:ok, linha} = ClaudeCLI.linha(requisicao)
        assert linha =~ ~r/--model #{apelido}$/
      end
    end
  end

  describe "permissao headless — a linha montada" do
    test "toda linha leva --permission-mode acceptEdits" do
      requisicao = %Requisicao{papel: "construtor", modelo: "haiku", mensagens: []}

      assert linha!(requisicao) =~ "--permission-mode acceptEdits"
    end

    test "toda linha leva --tools (quem FECHA o vocabulario), nunca --disallowedTools" do
      for papel <- Catalogo.papeis() ++ ["papel-inexistente"] do
        linha = linha!(%Requisicao{papel: papel, modelo: "haiku", mensagens: []})

        assert linha =~ "--tools \"", "#{papel} sem --tools"
        refute linha =~ "--disallowedTools", "#{papel} com --disallowedTools"
      end
    end
  end

  describe "o Bash anunciado e APROVADO no despacho real (T-088)" do
    # Medido em 2026-10-01 contra o `claude` 2.1.287 (haiku, `--max-turns 3`, `mktemp -d`):
    # com `--permission-mode acceptEdits --tools "Bash"` todo comando volta "This command
    # requires approval" e `permission_denials` lista o Bash; somando `--allowedTools "Bash"`, o
    # comando roda (`42`, `permission_denials: []`). `--tools` decide o que EXISTE;
    # `--allowedTools` so APROVA dentro disso — e so para o papel cujo `--tools` ja tem Bash.

    defp allowed_tools(linha) do
      case Regex.scan(~r/--allowedTools "([^"]*)"/, linha, capture: :all_but_first) do
        [] -> nil
        [[valor]] -> valor
        varias -> flunk("--allowedTools repetida na linha: #{inspect(varias)}")
      end
    end

    for papel <- Catalogo.papeis() do
      @papel papel

      test "#{papel}: --allowedTools \"Bash\" se e somente se o --tools dele contem Bash" do
        linha = linha!(%Requisicao{papel: @papel, modelo: "haiku", mensagens: []})
        [_, tools] = Regex.run(~r/--tools "([^"]*)"/, linha)

        if "Bash" in String.split(tools, ",") do
          assert allowed_tools(linha) == "Bash",
                 "#{@papel} tem Bash no --tools mas a linha nao o aprova: #{linha}"
        else
          assert allowed_tools(linha) == nil,
                 "#{@papel} NAO tem Bash no --tools e mesmo assim leva --allowedTools: #{linha}"
        end
      end
    end

    test "o catalogo atual: construtor e verificador aprovam Bash; os demais nao" do
      aprovam =
        for papel <- Catalogo.papeis(),
            allowed_tools(linha!(%Requisicao{papel: papel, modelo: "haiku", mensagens: []})),
            do: papel

      assert aprovam == ["construtor", "verificador"]
    end

    test "papel desconhecido (--tools vazio) nao ganha aprovacao nenhuma" do
      linha = linha!(%Requisicao{papel: "papel-inexistente", modelo: "haiku", mensagens: []})

      assert linha =~ ~s(--tools "")
      refute linha =~ "--allowedTools"
    end

    test "a aprovacao e SO do Bash: nada de Write/Edit/Read aprovados por flag" do
      for papel <- Catalogo.papeis() do
        linha = linha!(%Requisicao{papel: papel, modelo: "haiku", mensagens: []})

        assert allowed_tools(linha) in [nil, "Bash"]
      end
    end

    test "--allowedTools vem logo depois de --tools e antes de --max-turns (flag variadica)" do
      linha = linha!(%Requisicao{papel: "construtor", modelo: "haiku", mensagens: []})

      assert linha =~
               ~s(--tools "Bash,Edit,Glob,Grep,Read,Write" --allowedTools "Bash" --max-turns 30)
    end

    test "o moduledoc diz o que --allowedTools \"Bash\" aprova e o que ele NAO confina" do
      fonte = File.read!("lib/fabrica/operario/claude_cli.ex")

      assert fonte =~ ~s(`--allowedTools "Bash"`)
      assert fonte =~ "NAO confina"
    end
  end

  describe "o Bash do agente real roda CONFINADO no sandbox do proprio claude (T-090)" do
    # Medido pelo orquestrador em 2026-10-02 (`claude` 2.1.287, haiku, `--max-turns 3`,
    # `mktemp -d` em /tmp): com `--settings` levando o bloco abaixo, o shell grava na raiz e as
    # gravacoes fora dela voltam `Read-only file system` — inclusive com
    # `dangerouslyDisableSandbox: true`. Sem `bwrap`/`socat`, o `claude` nem sobe (stderr abaixo).
    # O bloco e escrito AQUI, literal, a partir do criterio — e nao lido do modulo — para que o
    # teste prove o que a tarefa pediu, nao o que o codigo faz.
    @sandbox_esperado %{
      "sandbox" => %{
        "enabled" => true,
        "failIfUnavailable" => true,
        "autoAllowBashIfSandboxed" => true,
        "allowUnsandboxedCommands" => false
      }
    }

    # O argumento de `--settings` na linha, ja sem a citacao do shell (`\"` -> `"`). `nil` se a
    # flag nao esta na linha; falha se ela aparece mais de uma vez.
    defp settings(linha) do
      case Regex.scan(~r/--settings "((?:[^"\\]|\\.)*)"/, linha, capture: :all_but_first) do
        [] -> nil
        [[valor]] -> String.replace(valor, ~s(\\"), ~s("))
        varios -> flunk("--settings repetida na linha: #{inspect(varios)}")
      end
    end

    for papel <- Catalogo.papeis() do
      @papel papel

      test "#{papel}: leva o sandbox se e somente se o --tools dele contem Bash" do
        linha = linha!(%Requisicao{papel: @papel, modelo: "haiku", mensagens: []})
        [_, tools] = Regex.run(~r/--tools "([^"]*)"/, linha)

        if "Bash" in String.split(tools, ",") do
          assert valor = settings(linha),
                 "#{@papel} tem Bash e a linha nao leva --settings: #{linha}"

          assert Jason.decode!(valor) == @sandbox_esperado
        else
          assert settings(linha) == nil,
                 "#{@papel} NAO tem Bash e mesmo assim leva --settings: #{linha}"

          refute linha =~ "sandbox"
        end
      end
    end

    test "o catalogo atual: construtor e verificador sobem confinados; os demais sem o bloco" do
      confinados =
        for papel <- Catalogo.papeis(),
            settings(linha!(%Requisicao{papel: papel, modelo: "haiku", mensagens: []})),
            do: papel

      assert confinados == ["construtor", "verificador"]
    end

    test "papel desconhecido (--tools vazio) nao leva o bloco" do
      linha = linha!(%Requisicao{papel: "papel-inexistente", modelo: "haiku", mensagens: []})

      assert linha =~ ~s(--tools "")
      refute linha =~ "--settings"
    end

    test "sem chave de fuga: o bloco nao depende de configuracao da aplicacao" do
      chaves = [:sandbox, :sandbox_cli, :confinar_shell]
      on_exit(fn -> Enum.each(chaves, &Application.delete_env(:fabrica, &1)) end)
      Enum.each(chaves, &Application.put_env(:fabrica, &1, false))

      linha = linha!(%Requisicao{papel: "construtor", modelo: "haiku", mensagens: []})
      assert Jason.decode!(settings(linha)) == @sandbox_esperado
    end

    # A SAIDA REAL do `claude` que recusa subir por falta de sandbox, com a linha de `linha/1`
    # (`--output-format stream-json`). Capturada SEM modelo e sem credencial no ciclo 2 (2026-10-02,
    # `claude` 2.1.287): `cd <mktemp -d>/raiz && env -i HOME=<mktemp>/home PATH=<dir vazio>
    # /opt/claude-code/bin/claude --print --verbose --output-format stream-json --permission-mode
    # acceptEdits --tools "Bash,Edit,Glob,Grep,Read,Write" --allowedTools "Bash" --max-turns 1
    # --setting-sources user --settings "<bloco>" --model haiku < prompt > out 2> err` -> rc=1,
    # `out` (1042 bytes) e `err` (341 bytes) abaixo, byte a byte. O stdout NAO e vazio: o binario
    # grava a linha `result` de erro antes de escrever o stderr e sair com 1 (Revisao do ciclo 1).
    @stdout_sem_sandbox ~S"""
    {"type":"result","subtype":"error_during_execution","duration_ms":0,"duration_api_ms":0,"is_error":true,"num_turns":0,"stop_reason":null,"session_id":"9f59b5d3-dffb-4d6f-83a2-0dae9867f219","total_cost_usd":0,"usage":{"output_tokens_details":{"thinking_tokens":0},"input_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":0,"server_tool_use":{"web_search_requests":0,"web_fetch_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":0},"inference_geo":"","iterations":[],"speed":"standard","fallback_credit":null},"modelUsage":{},"permission_denials":[],"uuid":"cef4fd6e-ea3f-4f3c-9a31-27173d5484c1","errors":["Sandbox required but unavailable: sandbox is enabled but dependencies are missing: bubblewrap (bwrap) not installed, socat not installed · install missing tools (e.g. apt install bubblewrap socat) or see https://code.claude.com/docs/en/sandboxing. Set sandbox.failIfUnavailable=false to allow unsandboxed execution."],"result_index":0}
    """

    @stderr_sem_sandbox """

    Error: sandbox required but unavailable: sandbox is enabled but dependencies are missing: bubblewrap (bwrap) not installed, socat not installed · install missing tools (e.g. apt install bubblewrap socat) or see https://code.claude.com/docs/en/sandboxing
      sandbox.failIfUnavailable is set — refusing to start without a working sandbox.

    """

    @saida_sem_sandbox %{stdout: @stdout_sem_sandbox, stderr: @stderr_sem_sandbox, codigo: 1}

    test "a fixture e a forma real que o criterio descreve (result de erro, zero voltas)" do
      assert byte_size(@stdout_sem_sandbox) == 1042
      assert byte_size(@stderr_sem_sandbox) == 341

      assert [resultado] =
               @stdout_sem_sandbox |> String.split("\n", trim: true) |> Enum.map(&Jason.decode!/1)

      assert %{"type" => "result", "subtype" => "error_during_execution", "is_error" => true} =
               resultado

      assert %{"num_turns" => 0, "errors" => [erro]} = resultado
      assert erro =~ "Sandbox required but unavailable"
    end

    test "o claude que recusa subir sem sandbox vira {:erro, :sandbox_indisponivel}" do
      assert ClaudeCLI.interpretar(@saida_sem_sandbox) == {:erro, :sandbox_indisponivel}

      assert ClaudeCLI.interpretar(@saida_sem_sandbox, "/tmp/raiz") ==
               {:erro, :sandbox_indisponivel}

      # `responder/2` e o que `conversar/2` devolve: sem sessao, sem consumo, sem envelope.
      assert ClaudeCLI.responder(@saida_sem_sandbox, "/tmp/raiz") ==
               {:erro, :sandbox_indisponivel}
    end

    test "o erro de sandbox nao e sucesso, nem :recusa, nem parede de cota" do
      resultado = ClaudeCLI.interpretar(@saida_sem_sandbox, "/tmp/raiz")

      refute match?({:ok, _}, resultado)
      refute match?({:erro, {:cota, _}}, resultado)
      refute match?({:erro, :saida_ininteligivel}, resultado)
      refute match?({:ok, %Resposta{motivo_parada: :recusa}}, resultado)
    end

    test "o texto so no `errors` do result de zero voltas (stderr perdido) ainda e o erro de sandbox" do
      saida = %{@saida_sem_sandbox | stderr: ""}

      assert ClaudeCLI.interpretar(saida) == {:erro, :sandbox_indisponivel}
    end

    test "sessao que SUBIU (system/init, num_turns >= 1) com o texto em errors e no stderr nao e o erro de sandbox" do
      # `error_during_execution` de uma sessao que rodou e erro PROPRIO conhecido (T-087): segue o
      # caminho normal (`montar/2`), com o consumo — nao e o CLI recusando subir.
      init = Jason.encode!(%{"type" => "system", "subtype" => "init", "session_id" => "s"})

      resultado =
        Jason.encode!(%{
          "type" => "result",
          "subtype" => "error_during_execution",
          "is_error" => true,
          "num_turns" => 2,
          "total_cost_usd" => 0.01,
          "usage" => %{"input_tokens" => 10, "output_tokens" => 5},
          "errors" => ["Sandbox required but unavailable: (o agente leu isto da tarefa)"]
        })

      saida = %{stdout: Enum.join([init, resultado], "\n"), stderr: @stderr_sem_sandbox}

      assert {:ok, %Resposta{}} = ClaudeCLI.interpretar(saida)
      refute ClaudeCLI.interpretar(saida) == {:erro, :sandbox_indisponivel}
    end

    test "o texto do erro DENTRO de uma sessao que terminou nao e o erro de sandbox" do
      # O agente pode LER este proprio texto (ele esta na tarefa e no teste da fabrica-v2) e
      # repeti-lo na resposta, ou um comando pode escreve-lo no stderr. Sessao com `result` subiu.
      saida =
        saida(
          [evento_texto("li: sandbox required but unavailable"), evento_resultado()],
          @stderr_sem_sandbox
        )

      assert {:ok, %Resposta{motivo_parada: :fim_do_turno}} = ClaudeCLI.interpretar(saida)
    end

    if match?({:win32, _}, :os.type()) do
      @tag skip: "no Windows nativo o sandbox do claude nao existe e o .bat cita diferente"
    end

    test "o --settings chega ao executavel como JSON valido pelo caminho real do despacho" do
      raiz =
        Path.join([
          File.cwd!(),
          "_build",
          "test",
          "tmp",
          "cli-t090-#{System.unique_integer([:positive])}"
        ])

      File.mkdir_p!(raiz)
      destino = Path.join(raiz, "argumentos.txt")
      script = Path.join(raiz, "argumentos.sh")

      File.write!(
        script,
        ~s(#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a"; done > "#{destino}"\n)
      )

      File.chmod!(script, 0o755)

      original = Application.get_env(:fabrica, :claude_cli)
      Application.put_env(:fabrica, :claude_cli, script)

      on_exit(fn ->
        File.rm_rf(raiz)

        if original,
          do: Application.put_env(:fabrica, :claude_cli, original),
          else: Application.delete_env(:fabrica, :claude_cli)
      end)

      requisicao = %Requisicao{papel: "construtor", modelo: "haiku", mensagens: []}
      _ = ClaudeCLI.conversar(requisicao, raiz: raiz)

      argumentos = destino |> File.read!() |> String.split("\n", trim: true)
      indice = Enum.find_index(argumentos, &(&1 == "--settings"))

      assert indice, "o executavel nao recebeu --settings: #{inspect(argumentos)}"
      assert Jason.decode!(Enum.at(argumentos, indice + 1)) == @sandbox_esperado
      # As vizinhas continuam inteiras: a citacao do JSON nao engoliu nem partiu outra flag.
      assert Enum.at(argumentos, Enum.find_index(argumentos, &(&1 == "--allowedTools")) + 1) ==
               "Bash"

      assert List.last(argumentos) == "haiku"
    end

    test "o moduledoc diz o que o sandbox confina e o que ele NAO confina" do
      fonte = File.read!("lib/fabrica/operario/claude_cli.ex")

      assert fonte =~ "failIfUnavailable"
      assert fonte =~ "allowUnsandboxedCommands"
      assert fonte =~ "Read-only file system"
      assert fonte =~ ~r/leitura/i
      assert fonte =~ ~r/rede/i
      assert fonte =~ "Windows nativo"
      assert fonte =~ ":sandbox_indisponivel"
      # A frase do estado anterior (T-088) sai: com o sandbox, o `echo` NAO grava fora da raiz.
      refute fonte =~ "mediu um `echo` gravando fora"
    end
  end

  describe "o agente nao herda CLAUDE.md dos diretorios-pai (T-085)" do
    # Medido em 2026-10-01 contra o `claude` 2.1.287 (sonda da palavra secreta, Notas da T-085):
    # sem a flag, o `claude --print` rodado num projeto le o CLAUDE.md de TODO diretorio acima
    # dele — no caso real, a constituicao do ORQUESTRADOR da fabrica-mae (~9k tokens, papel
    # contrario ao do agente). Com `--setting-sources user`, so o nivel do usuario e lido; o
    # contexto do agente passa a ser so o que a fabrica monta (`Despacho`/`Prompt.Prefixo`).
    test "toda linha leva --setting-sources user" do
      requisicao = %Requisicao{papel: "construtor", modelo: "haiku", mensagens: []}

      assert linha!(requisicao) =~ ~r/--setting-sources user(\s|$)/
    end

    test "os niveis project e local ficam de fora, para todo papel" do
      for papel <- ["construtor", "testador", "revisor", "planejador", "papel-inexistente"] do
        linha = linha!(%Requisicao{papel: papel, modelo: "haiku", mensagens: []})

        assert [_, fontes] = Regex.run(~r/--setting-sources (\S+)/, linha)
        assert String.split(fontes, ",") == ["user"]
      end
    end

    test "nunca --bare: ele exige ANTHROPIC_API_KEY e a fabrica roda na cota da assinatura" do
      requisicao = %Requisicao{papel: "construtor", modelo: "haiku", mensagens: []}

      refute linha!(requisicao) =~ "--bare"
    end
  end

  describe "a traducao do catalogo para o vocabulario do CLI" do
    test "e TOTAL: todo papel de Catalogo.papeis/0 tem traducao" do
      for papel <- Catalogo.papeis() do
        ferramentas = ClaudeCLI.ferramentas_cli(papel)

        assert is_list(ferramentas), "papel #{papel} nao produziu lista de ferramentas"
        assert ferramentas != [], "papel #{papel} ficou sem nenhuma ferramenta traduzida"
      end
    end

    test "nenhum papel sem poder :escrever recebe ferramenta de escrita" do
      for papel <- Catalogo.papeis(), not Catalogo.pode_escrever?(papel) do
        ferramentas = ClaudeCLI.ferramentas_cli(papel)

        refute "Write" in ferramentas, "#{papel} nao pode escrever mas recebeu Write"
        refute "Edit" in ferramentas, "#{papel} nao pode escrever mas recebeu Edit"
      end
    end

    test "todo papel com poder :escrever recebe Write e Edit" do
      for papel <- Catalogo.papeis(), Catalogo.pode_escrever?(papel) do
        ferramentas = ClaudeCLI.ferramentas_cli(papel)

        assert "Write" in ferramentas
        assert "Edit" in ferramentas
      end
    end

    test "construtor recebe o vocabulario completo, na linha montada" do
      requisicao = %Requisicao{papel: "construtor", modelo: "haiku", mensagens: []}

      assert linha!(requisicao) =~ ~s(--tools "Bash,Edit,Glob,Grep,Read,Write")
    end

    test "verificador recebe ordem explicita e NAO tem Write/Edit na linha montada" do
      requisicao = %Requisicao{papel: "verificador", modelo: "haiku", mensagens: []}

      assert linha!(requisicao) =~ ~s(--tools "Bash,Glob,Grep,Read")
    end

    test "papel desconhecido vira --tools vazio (desliga tudo), nao erro" do
      requisicao = %Requisicao{papel: "papel-que-nao-existe", modelo: "haiku", mensagens: []}

      assert linha!(requisicao) =~ ~s(--tools "")
    end

    test "registrar_resultado nao tem equivalente no CLI e nao vaza traducao nula" do
      # A lacuna e reconhecida, nao inventada: nenhuma string vazia ou nil entra na lista.
      for papel <- Catalogo.papeis() do
        assert Enum.all?(ClaudeCLI.ferramentas_cli(papel), &(is_binary(&1) and &1 != ""))
      end
    end
  end

  describe "o teto de voltas (T-017a) — imposto pela linha de comando, nunca pelo prompt" do
    test "a linha carrega --max-turns derivado de requisicao.teto_de_voltas" do
      requisicao = %Requisicao{
        papel: "construtor",
        modelo: "haiku",
        mensagens: [],
        teto_de_voltas: 7
      }

      assert linha!(requisicao) =~ "--max-turns 7"
    end

    test "tetos diferentes produzem linhas diferentes" do
      base = %Requisicao{papel: "construtor", modelo: "haiku", mensagens: []}

      linha_1 = linha!(%{base | teto_de_voltas: 1})
      linha_30 = linha!(%{base | teto_de_voltas: 30})

      assert linha_1 =~ "--max-turns 1"
      assert linha_30 =~ "--max-turns 30"
      refute linha_1 == linha_30
    end

    test "o teto padrao (30, de Requisicao) tambem vira flag" do
      requisicao = %Requisicao{papel: "construtor", modelo: "haiku", mensagens: []}

      assert linha!(requisicao) =~ "--max-turns 30"
    end

    test "o texto do prompt nao aparece na linha — o teto e flag, nunca frase, e o texto vai por stdin (T-018d)" do
      requisicao = %Requisicao{
        papel: "construtor",
        modelo: "haiku",
        mensagens: [%{papel: :usuario, conteudo: "responda ok"}],
        teto_de_voltas: 5
      }

      assert ClaudeCLI.texto_do_prompt(requisicao) == "responda ok"
      refute linha!(requisicao) =~ "responda ok"
      assert linha!(requisicao) =~ "--max-turns 5"
    end
  end

  describe "o vocabulario do CLI para NO ClaudeCLI" do
    test "Write, Edit, Bash, Read, Glob e Grep nao aparecem em nenhum outro modulo de lib/" do
      achados =
        ~r/\bWrite\b|\bEdit\b|\bBash\b|\bRead\b|\bGlob\b|\bGrep\b/
        |> Fabrica.Fonte.producao_que_casa()
        |> Enum.reject(&(&1 =~ "claude_cli.ex"))

      assert achados == []
    end
  end

  describe "o prompt sai da linha de comando (T-018d)" do
    # O CAUSADOR (T-020, ciclo 3): um prompt multi-linha, interpolado na linha de comando,
    # desmontava o `.bat` gerado por `Comando.escrever_script/4` e devolvia exit 255 com
    # stdout e stderr VAZIOS. A partir desta tarefa a linha e CONSTANTE em relacao ao
    # conteudo da conversa, e o texto viaja por `stdin` a partir de um arquivo.

    defp windows_cli?, do: match?({:win32, _}, :os.type())

    setup do
      raiz =
        Path.join([
          File.cwd!(),
          "_build",
          "test",
          "tmp",
          "cli-t018d-#{System.unique_integer([:positive])}"
        ])

      File.mkdir_p!(raiz)

      original = Application.get_env(:fabrica, :claude_cli)

      on_exit(fn ->
        File.rm_rf(raiz)

        if original do
          Application.put_env(:fabrica, :claude_cli, original)
        else
          Application.delete_env(:fabrica, :claude_cli)
        end
      end)

      {:ok, raiz: raiz}
    end

    # Um executavel de mentira que copia o `stdin` recebido, byte a byte, para `destino` — a
    # mesma disciplina de `Fabrica.Ferramentas.ComandoTest.copiar_stdin/1` (T-013a), so que
    # grava num ARQUIVO em vez de ecoar no stdout: este teste quer o CONTEUDO que chegou ao
    # processo, e nao a traducao de eventos JSON.
    defp copiar_stdin_para_arquivo(raiz, destino) do
      if windows_cli?() do
        script = Path.join(raiz, "copiar-#{System.unique_integer([:positive])}.ps1")
        destino_ps1 = String.replace(destino, "/", "\\")

        File.write!(script, """
        $in = [Console]::OpenStandardInput()
        $out = [IO.File]::Create('#{destino_ps1}')
        $in.CopyTo($out)
        $out.Flush()
        $out.Close()
        """)

        ~s(powershell -NoProfile -ExecutionPolicy Bypass -File "#{String.replace(script, "/", "\\")}")
      else
        script = Path.join(raiz, "copiar-#{System.unique_integer([:positive])}.sh")
        File.write!(script, "#!/bin/sh\ncat > \"#{destino}\"\n")
        File.chmod!(script, 0o755)
        script
      end
    end

    # Um executavel de mentira que so dorme, ignorando qualquer argumento recebido — usado
    # para forcar o prazo a estourar sem depender de nenhum comportamento do CLI real.
    defp script_que_dorme(raiz, segundos) do
      if windows_cli?() do
        script = Path.join(raiz, "dormir-#{System.unique_integer([:positive])}.ps1")
        File.write!(script, "Start-Sleep -Seconds #{segundos}\n")

        ~s(powershell -NoProfile -ExecutionPolicy Bypass -File "#{String.replace(script, "/", "\\")}")
      else
        script = Path.join(raiz, "dormir-#{System.unique_integer([:positive])}.sh")
        File.write!(script, "#!/bin/sh\nsleep #{segundos}\n")
        File.chmod!(script, 0o755)
        script
      end
    end

    test "dois prompts completamente diferentes produzem a MESMA linha" do
      base = %Requisicao{papel: "construtor", modelo: "haiku", mensagens: []}

      linha_1 =
        linha!(%{base | mensagens: [%{papel: :usuario, conteudo: "pedido A"}]})

      linha_2 =
        linha!(%{
          base
          | mensagens: [%{papel: :usuario, conteudo: "outro pedido, bem diferente\ncom quebra"}]
        })

      assert linha_1 == linha_2
      refute linha_1 =~ "pedido A"
    end

    test "um prompt com quebras de linha, aspas duplas e & chega INTEGRO ao arquivo de entrada",
         %{raiz: raiz} do
      destino = Path.join(raiz, "recebido.txt")
      Application.put_env(:fabrica, :claude_cli, copiar_stdin_para_arquivo(raiz, destino))

      conteudo =
        "linha um\nlinha \"com aspas duplas\"\nlinha com & comercial\nfim sem quebra"

      requisicao = %Requisicao{
        papel: "construtor",
        modelo: "haiku",
        mensagens: [%{papel: :usuario, conteudo: conteudo}]
      }

      ClaudeCLI.conversar(requisicao, raiz: raiz, prazo: 20_000)

      assert File.read!(destino) == conteudo
    end

    test "escapar/1 nao existe mais em lib/, e nenhuma outra funcao substitui aspas do prompt" do
      fonte = File.read!("lib/fabrica/operario/claude_cli.ex")

      refute fonte =~ "defp escapar"
      refute fonte =~ "def escapar"
    end

    test "o arquivo temporario do prompt e apagado mesmo quando o prazo estoura", %{raiz: raiz} do
      Application.put_env(:fabrica, :claude_cli, script_que_dorme(raiz, 5))
      marca = "T-018d-marca-#{System.unique_integer([:positive])}"

      requisicao = %Requisicao{
        papel: "construtor",
        modelo: "haiku",
        mensagens: [%{papel: :usuario, conteudo: marca}]
      }

      assert {:erro, :prazo} = ClaudeCLI.conversar(requisicao, raiz: raiz, prazo: 300)

      # Nao basta checar "nenhum arquivo com o prefixo sobrou": em suite `async: true`, outro
      # teste pode ter um arquivo proprio no ar no instante da checagem. O que prova a limpeza
      # e que NENHUM arquivo restante contem a NOSSA marca.
      sobrou? =
        System.tmp_dir!()
        |> File.ls!()
        |> Enum.filter(&String.starts_with?(&1, "fabrica-cli-prompt-"))
        |> Enum.any?(fn nome ->
          case File.read(Path.join(System.tmp_dir!(), nome)) do
            {:ok, conteudo} -> conteudo =~ marca
            _ -> false
          end
        end)

      refute sobrou?, "o arquivo temporario com o prompt continuou no disco apos o prazo estourar"
    end

    test "o arquivo temporario do prompt e apagado mesmo com executavel inexistente", %{
      raiz: raiz
    } do
      Application.put_env(
        :fabrica,
        :claude_cli,
        "executavel-que-nao-existe-#{System.unique_integer([:positive])}"
      )

      marca = "T-018d-marca-#{System.unique_integer([:positive])}"

      requisicao = %Requisicao{
        papel: "construtor",
        modelo: "haiku",
        mensagens: [%{papel: :usuario, conteudo: marca}]
      }

      assert {:erro, _motivo} = ClaudeCLI.conversar(requisicao, raiz: raiz, prazo: 10_000)

      sobrou? =
        System.tmp_dir!()
        |> File.ls!()
        |> Enum.filter(&String.starts_with?(&1, "fabrica-cli-prompt-"))
        |> Enum.any?(fn nome ->
          case File.read(Path.join(System.tmp_dir!(), nome)) do
            {:ok, conteudo} -> conteudo =~ marca
            _ -> false
          end
        end)

      refute sobrou?,
             "o arquivo temporario com o prompt continuou no disco com executavel ausente"
    end

    test "modelo sem traducao: conversar/2 devolve o erro nomeado SEM chamar o executavel (T-084)",
         %{raiz: raiz} do
      destino = Path.join(raiz, "chamado.txt")
      Application.put_env(:fabrica, :claude_cli, copiar_stdin_para_arquivo(raiz, destino))

      requisicao = %Requisicao{
        papel: "construtor",
        modelo: "modelo-inventado",
        mensagens: [%{papel: :usuario, conteudo: "oi"}]
      }

      assert ClaudeCLI.conversar(requisicao, raiz: raiz, prazo: 10_000) ==
               {:erro, {:modelo_sem_traducao, "modelo-inventado"}}

      refute File.exists?(destino), "o CLI foi chamado com um modelo que ele nao conhece"
    end
  end

  # T-089: o operario REAL com a saida bruta de UM processo do CLI como dado. A `agulha` carrega
  # essa saida, e `ClaudeCLI.responder/2` faz com ela exatamente o que `conversar/2` faz — sem
  # processo, rede ou cota. E o caminho inteiro ate o `gasto_usd` que o evento de fim leva.
  defmodule OperarioCLIGravado do
    @moduledoc false
    @behaviour Fabrica.Operario

    @impl Fabrica.Operario
    def familia, do: ClaudeCLI.familia()

    @impl Fabrica.Operario
    def conversar(_requisicao, opcoes) do
      ClaudeCLI.responder(Keyword.fetch!(opcoes, :agulha), Keyword.fetch!(opcoes, :raiz))
    end
  end

  describe "o erro do operario carrega o consumo ja medido (T-089)" do
    # Antes: `{:fora_do_confinamento, _}` e `:prazo` chegavam ao `Agente.Laco` como erro SEM
    # consumo, e o despacho inteiro valia US$ 0,00 para o teto de gasto do piloto.
    @amostra_t018b "priv/probes/amostras/sessao-com-ferramenta.jsonl"

    setup do
      raiz =
        Path.join([
          File.cwd!(),
          "_build",
          "test",
          "tmp",
          "cli-t089-#{System.unique_integer([:positive])}"
        ])

      File.mkdir_p!(raiz)
      original = Application.get_env(:fabrica, :claude_cli)

      on_exit(fn ->
        File.rm_rf(raiz)

        if original do
          Application.put_env(:fabrica, :claude_cli, original)
        else
          Application.delete_env(:fabrica, :claude_cli)
        end
      end)

      {:ok, raiz: raiz}
    end

    # O stream REAL da T-018b ate a ultima linha `assistant`: o que o arquivo de saida tem
    # quando o processo e morto pelo prazo antes de escrever o `result`.
    defp sem_result(stdout) do
      stdout
      |> String.split("\n", trim: true)
      |> Enum.reject(&(Jason.decode!(&1)["type"] == "result"))
      |> Enum.join("\n")
    end

    defp gasto_no_laco(saida, raiz) do
      {:ok, resumo} =
        Laco.rodar(
          agulha: saida,
          operario: OperarioCLIGravado,
          modelo: "haiku-4.5",
          raiz: raiz,
          ferramentas: %{}
        )

      resumo
    end

    test "fora do confinamento com result: o erro leva o consumo do result, e o gasto e o dele",
         %{raiz: raiz} do
      stdout = File.read!(@amostra_t018b)

      # A traducao segue igual: `interpretar/2` da o veredito, sem consumo (T-012a intocada).
      assert {:erro, {:fora_do_confinamento, _}} =
               ClaudeCLI.interpretar(%{stdout: stdout, stderr: ""}, raiz)

      {:ok, %Resposta{consumo: do_result}} = ClaudeCLI.interpretar(%{stdout: stdout, stderr: ""})

      assert {:erro, {:com_consumo, {:fora_do_confinamento, caminhos}, consumo}} =
               ClaudeCLI.responder(%{stdout: stdout, stderr: ""}, raiz)

      assert Enum.any?(caminhos, &(&1 =~ "nota.txt"))
      assert consumo == do_result

      resumo = gasto_no_laco(%{stdout: stdout, stderr: ""}, raiz)
      assert resumo.desfecho == :erro
      assert desvio(resumo.gasto_usd, custo_relatado(stdout)) < 0.01
    end

    test "prazo depois de linhas assistant com usage: gasto > 0, estimado por esse usage", %{
      raiz: raiz
    } do
      parcial = sem_result(File.read!(@amostra_t018b))

      {resposta, log} =
        ExUnit.CaptureLog.with_log(fn ->
          ClaudeCLI.responder(%{stdout: parcial, stderr: "", motivo: :prazo}, raiz)
        end)

      assert {:erro, {:com_consumo, :prazo, %Consumo{} = consumo}} = resposta

      # Duas chamadas (dois `message.id`), cada uma repetida uma linha por bloco com o MESMO
      # usage: conta-se UMA vez por chamada. Somando linha a linha, a escrita sairia
      # 4 x 7021 + 2 x 494 = 29_072, quase 4x o real.
      assert consumo.tokens_cache_escrita == 7_021 + 494
      assert consumo.tokens_cache_leitura == 16_265 + 23_286
      assert consumo.tokens_entrada == 10 + 8
      assert consumo.tokens_saida == 4 + 2
      assert consumo.ttl_cache == :uma_hora
      assert log =~ "estimado"

      resumo = gasto_no_laco(%{stdout: parcial, stderr: "", motivo: :prazo}, raiz)
      assert resumo.desfecho == :erro
      assert resumo.gasto_usd > 0
      # O `output_tokens` das linhas `assistant` e PARCIAL: a estimativa e piso, nunca teto.
      assert resumo.gasto_usd <= custo_relatado(File.read!(@amostra_t018b))
    end

    test "prazo sem nenhuma linha com usage: 0,0, com Logger.warning", %{raiz: raiz} do
      so_sistema =
        File.read!(@amostra_t018b)
        |> String.split("\n", trim: true)
        |> Enum.filter(&(Jason.decode!(&1)["type"] == "system"))
        |> Enum.join("\n")

      for stdout <- ["", so_sistema, evento_texto("sem usage nenhum")] do
        saida = %{stdout: stdout, stderr: "", motivo: :prazo}

        {resposta, log} =
          ExUnit.CaptureLog.with_log(fn -> ClaudeCLI.responder(saida, raiz) end)

        assert resposta == {:erro, :prazo}
        assert log =~ "prazo"
        assert log =~ "0,0"

        {resumo, _log} = ExUnit.CaptureLog.with_log(fn -> gasto_no_laco(saida, raiz) end)
        assert resumo.desfecho == :erro
        assert resumo.gasto_usd == 0.0
        assert resumo.consumos == []
      end
    end

    test "prazo com o result ja escrito: vale o consumo do result, e nao a estimativa", %{
      raiz: raiz
    } do
      stdout = File.read!(@amostra_t018b)
      {:ok, %Resposta{consumo: do_result}} = ClaudeCLI.interpretar(%{stdout: stdout, stderr: ""})

      assert {:erro, {:com_consumo, :prazo, ^do_result}} =
               ClaudeCLI.responder(%{stdout: stdout, stderr: "", motivo: :prazo}, raiz)
    end

    test "parede de cota NAO ganha envelope: Cota.parede/2 casa {:erro, {:cota, _}}", %{
      raiz: raiz
    } do
      assert {:erro, {:cota, _reabre_em}} =
               ClaudeCLI.responder(%{stdout: "", stderr: "Claude AI usage limit reached"}, raiz)
    end

    test "stream real aceito (nenhum caminho fora da raiz) segue {:ok, %Resposta{}}, sem envelope",
         %{raiz: raiz} do
      assert {:ok, %Resposta{}} =
               ClaudeCLI.responder(%{stdout: @stream_real_haiku, stderr: ""}, raiz)
    end

    test "conversar/2 de verdade: o processo escreve linhas assistant e trava; o prazo as conta",
         %{raiz: raiz} do
      origem = Path.join(raiz, "parcial.jsonl")
      File.write!(origem, sem_result(File.read!(@amostra_t018b)))
      Application.put_env(:fabrica, :claude_cli, imprimir_e_travar(raiz, origem))

      requisicao = %Requisicao{
        papel: "construtor",
        modelo: "haiku",
        mensagens: [%{papel: :usuario, conteudo: "oi"}]
      }

      assert {:erro, {:com_consumo, :prazo, %Consumo{} = consumo}} =
               ClaudeCLI.conversar(requisicao, raiz: raiz, prazo: 2_000)

      assert consumo.tokens_cache_escrita == 7_021 + 494
      assert consumo.tokens_cache_leitura == 16_265 + 23_286
    end

    # Um executavel de mentira que imprime `origem` byte a byte no stdout e TRAVA — o prazo e
    # quem o encerra. Copia de bytes, nao de texto: o stream real tem acentos.
    defp imprimir_e_travar(raiz, origem) do
      if windows_cli?() do
        script = Path.join(raiz, "travar-#{System.unique_integer([:positive])}.ps1")
        origem_ps1 = String.replace(origem, "/", "\\")

        File.write!(script, """
        $in = [IO.File]::OpenRead('#{origem_ps1}')
        $out = [Console]::OpenStandardOutput()
        $in.CopyTo($out)
        $out.Flush()
        $in.Close()
        Start-Sleep -Seconds 30
        """)

        ~s(powershell -NoProfile -ExecutionPolicy Bypass -File "#{String.replace(script, "/", "\\")}")
      else
        script = Path.join(raiz, "travar-#{System.unique_integer([:positive])}.sh")
        File.write!(script, "#!/bin/sh\ncat \"#{origem}\"\nsleep 30\n")
        File.chmod!(script, 0o755)
        script
      end
    end
  end
end
