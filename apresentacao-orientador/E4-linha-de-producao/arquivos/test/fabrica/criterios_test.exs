defmodule Fabrica.CriteriosTest do
  @moduledoc """
  A passada mecanica: leitura, allowlist, deduplicacao e relatorio.

  Os testes que EXECUTAM de verdade usam `git` em modo leitura — rapido, deterministico e ja
  presente em toda maquina onde esta fabrica roda. Dublar a execucao aqui provaria menos: o
  ponto da passada mecanica e justamente que ela roda o comando de verdade, de graca, antes de
  gastar despacho.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Criterios
  alias Fabrica.Criterios.Allowlist

  doctest Fabrica.Criterios.Allowlist
  doctest Fabrica.Criterios

  @raiz File.cwd!()

  defp criterio(texto, comando \\ nil) do
    %{texto: texto, comando: comando, marcado: false}
  end

  describe "allowlist — permitir o conhecido" do
    test "binario da lista passa, e o argv volta ja quebrado" do
      assert {:ok, ["mix", "test"]} = Allowlist.avaliar("mix test")
      assert {:ok, ["npm", "run", "build"]} = Allowlist.avaliar("npm run build")
    end

    test "binario fora da lista e recusado com motivo nomeado" do
      for comando <- ["curl http://x", "wget x", "rm -rf /", "powershell -c x", "bash -c x"] do
        assert {:recusado, :binario_nao_permitido} = Allowlist.avaliar(comando),
               "#{comando} deveria ser recusado"
      end
    end

    test "a extensao do Windows nao muda o binario" do
      # Sem isto, `mix.bat` seria recusado como desconhecido em TODA maquina Windows — que e
      # onde esta fabrica roda.
      assert {:ok, _} = Allowlist.avaliar("mix.bat test")
      assert {:ok, _} = Allowlist.avaliar("NPM.CMD test")
    end

    test "comando vazio ou ausente e :sem_comando, e nao um binario invalido" do
      # A distincao importa no relatorio: criterio SEM comando e normal (vai para julgamento);
      # criterio com comando recusado e defeito de planejamento.
      assert {:recusado, :sem_comando} = Allowlist.avaliar(nil)
      assert {:recusado, :sem_comando} = Allowlist.avaliar("")
      assert {:recusado, :sem_comando} = Allowlist.avaliar("   ")
    end

    test "npx esta FORA, e e a unica divergencia da lista da v1" do
      # `npx <pacote>` baixa da rede e executa codigo que nao esta no projeto: um binario
      # permitido que vira porta para qualquer outro anula a allowlist inteira.
      assert {:recusado, :binario_nao_permitido} = Allowlist.avaliar("npx cowsay oi")
      refute "npx" in Allowlist.binarios()
    end
  end

  describe "allowlist — git so em modo leitura" do
    test "os subcomandos de leitura passam" do
      for subcomando <- Allowlist.git_leitura() do
        assert {:ok, _} = Allowlist.avaliar("git #{subcomando}"),
               "git #{subcomando} deveria passar"
      end
    end

    test "os que ESCREVEM sao recusados, com motivo proprio" do
      for subcomando <- ~w[push reset clean checkout commit rm mv] do
        assert {:recusado, :git_nao_leitura} = Allowlist.avaliar("git #{subcomando}"),
               "git #{subcomando} deveria ser recusado"
      end
    end

    test "git sem subcomando nenhum e recusado" do
      assert {:recusado, :git_nao_leitura} = Allowlist.avaliar("git")
    end
  end

  describe "allowlist — um comando, nunca um script" do
    test "encadeamento e recusado" do
      for comando <- ["mix test && git push", "mix test || echo x", "mix test ; rm -rf ."] do
        assert {:recusado, :encadeamento_proibido} = Allowlist.avaliar(comando),
               "#{comando} deveria ser recusado"
      end
    end

    test "cano e recusado" do
      assert {:recusado, :encadeamento_proibido} = Allowlist.avaliar("mix test | grep ok")
    end

    test "redirecionamento e recusado" do
      assert {:recusado, :encadeamento_proibido} = Allowlist.avaliar("mix test > saida.txt")
      assert {:recusado, :encadeamento_proibido} = Allowlist.avaliar("mix test < entrada.txt")
    end

    test "substituicao de comando e recusada, nas duas formas" do
      assert {:recusado, :encadeamento_proibido} = Allowlist.avaliar("mix test $(whoami)")
      assert {:recusado, :encadeamento_proibido} = Allowlist.avaliar("mix test `whoami`")
    end

    test "quebra de linha e recusada: e encadeamento disfarcado" do
      assert {:recusado, :encadeamento_proibido} = Allowlist.avaliar("mix test\ngit push")
    end

    test "a recusa vem ANTES da checagem de binario" do
      # Um comando encadeado cujo primeiro binario e permitido nao pode passar pela porta do
      # binario: o que importa e que ha mais de um comando ali.
      assert {:recusado, :encadeamento_proibido} = Allowlist.avaliar("mix test && curl x")
    end
  end

  describe "leitura dos criterios" do
    test "le texto, comando e marcacao" do
      secao = """
      - [ ] A suite passa.
            `verificar: mix test`
      - [x] O formato esta certo.
            `verificar: mix format --check-formatted`
      """

      assert [primeiro, segundo] = Criterios.ler(secao)
      assert primeiro.texto == "A suite passa."
      assert primeiro.comando == "mix test"
      refute primeiro.marcado
      assert segundo.marcado
      assert segundo.comando == "mix format --check-formatted"
    end

    test "criterio sem comando e normal, e nao defeito" do
      assert [%{comando: nil, texto: "O relatorio explica a decisao."}] =
               Criterios.ler("- [ ] O relatorio explica a decisao.")
    end

    test "le a CONTINUACAO indentada — foi o que truncou 11 criterios na v1" do
      secao = """
      - [ ] O jogo emite ao jogador da vez uma
            notificacao com as opcoes disponiveis.
            `verificar: mix test test/jogo_test.exs`
      """

      assert [criterio] = Criterios.ler(secao)
      assert criterio.texto =~ "notificacao com as opcoes"
      assert criterio.comando == "mix test test/jogo_test.exs"
    end

    test "a continuacao para no proximo criterio" do
      secao = """
      - [ ] Primeiro
            continuacao do primeiro
      - [ ] Segundo
      """

      assert [primeiro, segundo] = Criterios.ler(secao)
      assert primeiro.texto == "Primeiro continuacao do primeiro"
      assert segundo.texto == "Segundo"
    end

    test "a continuacao para quando a indentacao acaba" do
      secao = """
      - [ ] Primeiro
            continuacao
      texto solto que nao e continuacao
      """

      assert [criterio] = Criterios.ler(secao)
      refute criterio.texto =~ "texto solto"
    end

    test "secao vazia ou ausente devolve lista vazia, sem levantar" do
      assert Criterios.ler("") == []
      assert Criterios.ler(nil) == []
      assert Criterios.ler("## Criterios de aceite\n\nnada aqui") == []
    end

    test "linha malformada nao derruba a leitura das outras" do
      # Parser rigido transformaria erro de digitacao do planejador em tarefa que nao roda.
      secao = """
      - [ ] Valido `verificar: mix test`
      - [] sem espaco no marcador
      - [ ] Outro valido
      """

      textos = secao |> Criterios.ler() |> Enum.map(& &1.texto)
      assert textos == ["Valido", "Outro valido"]
    end
  end

  describe "execucao — o comando roda de verdade" do
    test "comando que passa vira :passou" do
      assert [%{estado: :passou}] =
               Criterios.executar([criterio("repo existe", "git rev-parse --git-dir")], @raiz)
    end

    test "comando que falha vira :falhou, com a saida anexada" do
      [resultado] =
        Criterios.executar([criterio("objeto existe", "git cat-file -t 0000000000")], @raiz)

      assert resultado.estado == :falhou
      assert resultado.saida != ""
    end

    test "criterio sem comando nao executa e guarda o motivo" do
      assert [%{estado: :nao_executado, recusa: :sem_comando}] =
               Criterios.executar([criterio("alguem julga isto")], @raiz)
    end

    test "comando recusado nao executa, e o motivo distingue do sem-comando" do
      assert [%{estado: :nao_executado, recusa: :binario_nao_permitido}] =
               Criterios.executar([criterio("baixa coisas", "curl http://x")], @raiz)
    end

    test "a saida e cortada, para o relatorio nao virar parede de texto" do
      [resultado] =
        Criterios.executar([criterio("log gigante", "git log --format=%H%n%B")], @raiz)

      assert byte_size(resultado.saida) <= 2_100
    end
  end

  describe "deduplicacao dentro do lote" do
    test "dois criterios com o mesmo comando executam UMA vez" do
      criterios = [
        criterio("primeiro", "git rev-parse --git-dir"),
        criterio("segundo", "git rev-parse --git-dir")
      ]

      assert [primeiro, segundo] = Criterios.executar(criterios, @raiz)

      refute primeiro.espelho
      assert segundo.espelho
      assert segundo.estado == primeiro.estado
      # O texto continua sendo o DO SEGUNDO: o veredito e herdado, o criterio nao.
      assert segundo.texto == "segundo"
    end

    test "comandos diferentes nao se espelham" do
      criterios = [
        criterio("um", "git rev-parse --git-dir"),
        criterio("dois", "git status --short")
      ]

      assert [%{espelho: false}, %{espelho: false}] = Criterios.executar(criterios, @raiz)
    end

    test "a chave normaliza extensao e as formas do script de teste" do
      assert Criterios.chave_de_comando(["npm", "run", "test"]) == "npm test"
      assert Criterios.chave_de_comando(["npm", "t"]) == "npm test"
      assert Criterios.chave_de_comando(["yarn", "run", "lint"]) == "yarn lint"
      assert Criterios.chave_de_comando(["MIX.EXE", "test"]) == "mix test"
    end

    test "a chave e CONSERVADORA: na duvida, executa" do
      # Reconhecer que estes dois cobrem o mesmo exigiria interpretar o manifesto do
      # ecossistema. Chave que erra dizendo "e o mesmo" faz um criterio herdar veredito de
      # outro, e isso e pior que rodar duas vezes.
      refute Criterios.chave_de_comando(["mix", "test"]) ==
               Criterios.chave_de_comando(["mix", "test", "test/"])

      # E `npm run` so encolhe quando ha exatamente um script; com argumentos, nao mexe.
      assert Criterios.chave_de_comando(["npm", "run", "test", "--", "-w"]) ==
               "npm run test -- -w"
    end
  end

  describe "o relatorio" do
    test "cada criterio sai rotulado, e a linha Graus de prova fecha" do
      criterios = [
        criterio("a suite passa", "git rev-parse --git-dir"),
        criterio("alguem julga isto")
      ]

      texto = criterios |> Criterios.executar(@raiz) |> Criterios.relatorio()

      assert texto =~ "### Passada mecanica (sem modelo)"
      assert texto =~ "- [executado] a suite passa"
      assert texto =~ "- [julgado] alguem julga isto"
      assert texto =~ "Graus de prova: 1 executado(s), 1 julgado(s) (de 2)."
    end

    test "o veredito aparece em negrito, para ser achavel na leitura rapida" do
      texto =
        [criterio("passa", "git rev-parse --git-dir")]
        |> Criterios.executar(@raiz)
        |> Criterios.relatorio()

      assert texto =~ "**PASSOU**"
    end

    test "a saida do que falhou entra, em bloco de codigo" do
      texto =
        [criterio("falha", "git cat-file -t 0000000000")]
        |> Criterios.executar(@raiz)
        |> Criterios.relatorio()

      assert texto =~ "**FALHOU**"
      assert texto =~ "```"
    end

    test "o espelho e anunciado, e NAO repete a parede de saida" do
      # Sem o aviso, o relatorio afirmaria duas verificacoes onde houve uma.
      texto =
        [
          criterio("um", "git cat-file -t 0000000000"),
          criterio("dois", "git cat-file -t 0000000000")
        ]
        |> Criterios.executar(@raiz)
        |> Criterios.relatorio()

      assert texto =~ "mesmo comando ja executado acima"
      assert length(String.split(texto, "```")) == 3
    end

    test "o motivo da recusa aparece, e distingue de sem-comando" do
      texto =
        [criterio("baixa", "curl http://x"), criterio("julga")]
        |> Criterios.executar(@raiz)
        |> Criterios.relatorio()

      assert texto =~ "comando recusado: binario_nao_permitido"
      assert texto =~ "sem comando declarado"
    end

    test "aceita [inspecionado], que vem do VERIFICADOR e nao daqui" do
      # A escada so vale se as duas metades couberem na mesma conta: se o verificador tivesse
      # um formato proprio, ninguem somaria os dois.
      do_verificador = %{
        texto: "a tela mostra o tabuleiro",
        comando: nil,
        estado: :inspecionado,
        recusa: nil,
        saida: "conferido na captura em _gestao/evidencias/",
        espelho: false
      }

      texto = Criterios.relatorio([do_verificador])

      assert texto =~ "- [inspecionado] a tela mostra o tabuleiro"
      assert texto =~ "Graus de prova: 1 inspecionado(s) (de 1)."
    end

    test "grau com ZERO nao entra na linha" do
      # Linha que diz "0 inspecionado" em toda rodada vira ruido e para de ser lida
      # justamente quando o numero deixa de ser zero.
      texto =
        [criterio("passa", "git rev-parse --git-dir")]
        |> Criterios.executar(@raiz)
        |> Criterios.relatorio()

      refute texto =~ "0 inspecionado"
      refute texto =~ "0 julgado"
      assert texto =~ "Graus de prova: 1 executado(s) (de 1)."
    end

    test "lista vazia devolve texto vazio, e nao um cabecalho orfao" do
      assert Criterios.relatorio([]) == ""
    end
  end

  describe "o que a passada decide" do
    test "reprovou? e verdadeiro so quando um comando falhou DE VERDADE" do
      passou = Criterios.executar([criterio("a", "git rev-parse --git-dir")], @raiz)
      falhou = Criterios.executar([criterio("b", "git cat-file -t 0000000000")], @raiz)
      julgado = Criterios.executar([criterio("c")], @raiz)
      recusado = Criterios.executar([criterio("d", "curl x")], @raiz)

      refute Criterios.reprovou?(passou)
      assert Criterios.reprovou?(falhou)
      refute Criterios.reprovou?(julgado)

      # Comando recusado NAO reprova a tarefa: e defeito de planejamento, e devolver a tarefa
      # ao construtor por causa dele e o laco que custou US$ 12,90 na v1.
      refute Criterios.reprovou?(recusado)
    end

    test "recusados/1 lista o defeito de PLANEJAMENTO, sem os sem-comando" do
      resultados =
        Criterios.executar(
          [criterio("a", "curl x"), criterio("b"), criterio("c", "git push")],
          @raiz
        )

      assert [%{recusa: :binario_nao_permitido}, %{recusa: :git_nao_leitura}] =
               Criterios.recusados(resultados)
    end

    test "passar na mecanica NAO aprova a tarefa" do
      # Nao ha funcao `aprovou?`, e isso e deliberado: os criterios de julgamento continuam
      # por conferir, e uma funcao com esse nome convidaria a pular o verificador.
      refute function_exported?(Criterios, :aprovou?, 1)
    end
  end
end
