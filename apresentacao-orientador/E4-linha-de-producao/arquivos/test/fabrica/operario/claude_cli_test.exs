defmodule Fabrica.Operario.ClaudeCLITest do
  @moduledoc """
  O adaptador padrao de operacao, exercitado SEM tocar a rede e SEM gastar cota.

  O executavel vem de configuracao e aponta para um script falso que imprime eventos JSON
  conhecidos. E isso que mantem o marco da v0.1 de pe: uma suite que chamasse o CLI de
  verdade gastaria cota a cada `mix test`, e o marco cairia junto.
  """

  use ExUnit.Case, async: true

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

    test "o TTL fica :sem_cache porque o CLI nao o expoe" do
      # `:sem_cache` aqui significa "nao sei", e nao "nao houve" — a reparticao acima mostra
      # que houve. Quem sabe o TTL e o MessagesAPI, e e mais uma razao de ele existir.
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

  describe "permissao headless — a linha montada" do
    test "toda linha leva --permission-mode acceptEdits" do
      requisicao = %Requisicao{papel: "construtor", modelo: "haiku", mensagens: []}

      assert ClaudeCLI.linha(requisicao) =~ "--permission-mode acceptEdits"
    end

    test "toda linha leva --tools, nunca --allowedTools nem --disallowedTools" do
      requisicao = %Requisicao{papel: "construtor", modelo: "haiku", mensagens: []}
      linha = ClaudeCLI.linha(requisicao)

      assert linha =~ "--tools \""
      refute linha =~ "--allowedTools"
      refute linha =~ "--disallowedTools"
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

      assert ClaudeCLI.linha(requisicao) =~ ~s(--tools "Bash,Edit,Glob,Grep,Read,Write")
    end

    test "verificador recebe ordem explicita e NAO tem Write/Edit na linha montada" do
      requisicao = %Requisicao{papel: "verificador", modelo: "haiku", mensagens: []}

      assert ClaudeCLI.linha(requisicao) =~ ~s(--tools "Bash,Glob,Grep,Read")
    end

    test "papel desconhecido vira --tools vazio (desliga tudo), nao erro" do
      requisicao = %Requisicao{papel: "papel-que-nao-existe", modelo: "haiku", mensagens: []}

      assert ClaudeCLI.linha(requisicao) =~ ~s(--tools "")
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

      assert ClaudeCLI.linha(requisicao) =~ "--max-turns 7"
    end

    test "tetos diferentes produzem linhas diferentes" do
      base = %Requisicao{papel: "construtor", modelo: "haiku", mensagens: []}

      linha_1 = ClaudeCLI.linha(%{base | teto_de_voltas: 1})
      linha_30 = ClaudeCLI.linha(%{base | teto_de_voltas: 30})

      assert linha_1 =~ "--max-turns 1"
      assert linha_30 =~ "--max-turns 30"
      refute linha_1 == linha_30
    end

    test "o teto padrao (30, de Requisicao) tambem vira flag" do
      requisicao = %Requisicao{papel: "construtor", modelo: "haiku", mensagens: []}

      assert ClaudeCLI.linha(requisicao) =~ "--max-turns 30"
    end

    test "o texto do prompt nao aparece na linha — o teto e flag, nunca frase, e o texto vai por stdin (T-018d)" do
      requisicao = %Requisicao{
        papel: "construtor",
        modelo: "haiku",
        mensagens: [%{papel: :usuario, conteudo: "responda ok"}],
        teto_de_voltas: 5
      }

      assert ClaudeCLI.texto_do_prompt(requisicao) == "responda ok"
      refute ClaudeCLI.linha(requisicao) =~ "responda ok"
      assert ClaudeCLI.linha(requisicao) =~ "--max-turns 5"
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
        ClaudeCLI.linha(%{base | mensagens: [%{papel: :usuario, conteudo: "pedido A"}]})

      linha_2 =
        ClaudeCLI.linha(%{
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
  end
end
