defmodule Fabrica.Criterios.ClasseFalhaTest do
  @moduledoc """
  O julgamento inteiro da passada mecanica mora em `classificar/1`, e por isso os testes aqui
  sao exaustivos: e funcao pura, entao cada caso custa microssegundos.

  O bloco que carrega o arquivo e **"o caso dificil"**: `Cannot find module` significa coisas
  OPOSTAS conforme o alvo exista ou nao no disco. Errar ali e o que custou 4 ciclos e
  US$ 12,90 na T-030 do banco-imobiliario.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Criterios
  alias Fabrica.Criterios.ClasseFalha

  doctest Fabrica.Criterios.ClasseFalha

  @raiz File.cwd!()

  defp contexto(atributos) do
    padrao = %{
      argv: ["mix", "test"],
      saida: "",
      codigo: 1,
      estourou_prazo: false,
      existe_no_disco: fn _caminho -> false end
    }

    Map.merge(padrao, Map.new(atributos))
  end

  defp criterio(texto, comando), do: %{texto: texto, comando: comando, marcado: false}

  describe "ferramenta quebrada — o comando nao avaliou NADA" do
    test "ENOENT do proprio disparo" do
      assert ClasseFalha.classificar(contexto(codigo: "ENOENT")) == :ferramenta_quebrada
    end

    test "o shell diz que nao conhece o binario, em qualquer idioma" do
      mensagens = [
        "bash: cargo: command not found",
        "'cargo' is not recognized as an internal or external command, operable program",
        "'cargo' nao e reconhecido como um comando interno ou externo",
        "Error: spawn cargo ENOENT"
      ]

      for saida <- mensagens do
        assert ClasseFalha.classificar(contexto(saida: saida)) == :ferramenta_quebrada,
               "deveria ser ferramenta: #{saida}"
      end
    end

    test "codigo de uso indevido UNIVERSAL, sem depender do binario" do
      # 127 e do POSIX e 9009 do cmd.exe: sao do interpretador de comandos, nao do programa.
      for codigo <- [127, 9009] do
        assert ClasseFalha.classificar(contexto(codigo: codigo)) == :ferramenta_quebrada
      end
    end

    test "codigo de uso indevido do BINARIO exige tambem a mensagem" do
      # Fora de contexto, 9 nao significa nada — um programa qualquer pode sair com 9 querendo
      # dizer outra coisa. Por isso o codigo do binario so vale acompanhado do sinal textual.
      com_mensagem =
        contexto(argv: ["node", "--test"], codigo: 9, saida: "node: bad option: --test")

      sem_mensagem =
        contexto(argv: ["node", "--test"], codigo: 9, saida: "3 tests failed")

      assert ClasseFalha.classificar(com_mensagem) == :ferramenta_quebrada
      assert ClasseFalha.classificar(sem_mensagem) == :entrega
    end

    test "opcao invalida, em qualquer binario" do
      # `unrecognized argument` entrou na lista DEPOIS de o teste integrado falhar: e o que o
      # `git` real diz, e a lista portada da v1 so tinha "option". Sinal que falta aqui nao
      # falha ruidosamente — ele classifica criterio quebrado como `:entrega` e devolve a
      # tarefa ao construtor, que e o laco de 4 ciclos da T-030.
      mensagens = [
        "error: unknown option '--jobs'",
        "unrecognized option: --coverage",
        "invalid option -- 'z'",
        "fatal: unrecognized argument: --opcao-invalida",
        "unknown argument: --x",
        "unknown flag: --y",
        "npm ERR! Missing script: \"testes\"",
        "** (Mix) The task \"nao_existe\" could not be found"
      ]

      for saida <- mensagens do
        assert ClasseFalha.classificar(contexto(saida: saida)) == :ferramenta_quebrada,
               "deveria ser ferramenta: #{saida}"
      end
    end

    test "a extensao do Windows nao esconde o binario na tabela de codigos" do
      assert ClasseFalha.classificar(
               contexto(argv: ["node.exe", "--test"], codigo: 9, saida: "bad option")
             ) == :ferramenta_quebrada
    end
  end

  describe "O CASO DIFICIL — a mesma mensagem, dois significados opostos" do
    # `node --test tests` -> o diretorio EXISTE e o runner nao sabe consumi-lo: criterio
    # quebrado. `node --test tests/turno.test.js` -> o arquivo NAO existe porque a tarefa
    # deveria te-lo criado: entrega falhou. O discriminador e o DISCO.
    test "alvo que EXISTE e nao carrega e ferramenta" do
      ctx =
        contexto(
          argv: ["node", "--test", "tests"],
          saida: "Error: Cannot find module 'C:\\p\\tests'",
          existe_no_disco: fn _caminho -> true end
        )

      assert ClasseFalha.classificar(ctx) == :ferramenta_quebrada
    end

    test "alvo que NAO existe e falha de entrega" do
      ctx =
        contexto(
          argv: ["node", "--test", "tests/turno.test.js"],
          saida: "Error: Cannot find module 'C:/p/tests/turno.test.js'",
          existe_no_disco: fn _caminho -> false end
        )

      assert ClasseFalha.classificar(ctx) == :entrega
    end

    test "modulo que NAO e argumento do comando e falha da tarefa, mesmo existindo" do
      # Um modulo que um teste nao conseguiu importar e defeito da entrega. Casar so o nome
      # do argumento — a primeira tentativa da v1 — transformaria toda tarefa que esquece de
      # criar o proprio arquivo num "criterio suspeito", e o portao pararia de pegar o
      # defeito mais comum que existe.
      ctx =
        contexto(
          argv: ["node", "--test", "tests/"],
          saida: "Cannot find module '../src/tabuleiro.js'",
          existe_no_disco: fn _caminho -> true end
        )

      assert ClasseFalha.classificar(ctx) == :entrega
    end

    test "flag nunca conta como alvo" do
      ctx =
        contexto(
          argv: ["node", "--test-reporter", "tests"],
          saida: "can't open file '--test-reporter'",
          existe_no_disco: fn _caminho -> true end
        )

      assert ClasseFalha.classificar(ctx) == :entrega
    end

    test "reconhece o alvo em varios ecossistemas, e nao so no Node" do
      # Reconhecer so o do Node repetiria, num arquivo novo, um defeito que a v1 ja corrigiu
      # duas vezes.
      casos = [
        {["python", "faltando.py"], "python: can't open file 'faltando.py'"},
        {["python", "faltando.py"], "No such file or directory: 'faltando.py'"},
        {["go", "test", "./pacote"], "no Go files in ./pacote"},
        {["node", "app.mjs"], "Cannot find package 'app.mjs'"}
      ]

      for {argv, saida} <- casos do
        ctx = contexto(argv: argv, saida: saida, existe_no_disco: fn _c -> true end)

        assert ClasseFalha.classificar(ctx) == :ferramenta_quebrada,
               "deveria ser ferramenta: #{saida}"
      end
    end

    test "o separador de caminho do Windows nao atrapalha a comparacao" do
      ctx =
        contexto(
          argv: ["node", "--test", "tests/unidade"],
          saida: "Cannot find module 'C:\\projeto\\tests\\unidade'",
          existe_no_disco: fn _caminho -> true end
        )

      assert ClasseFalha.classificar(ctx) == :ferramenta_quebrada
    end
  end

  describe "ambiente — a maquina atrapalhou" do
    test "PRAZO estourado nao e reprovacao de entrega" do
      # E o criterio 4 da tarefa. Um teste lento nao e um teste que reprova, e trata-los
      # igual devolve a tarefa ao construtor por causa de uma maquina ocupada.
      ctx = contexto(estourou_prazo: true, codigo: nil, saida: "")

      assert ClasseFalha.classificar(ctx) == :ambiente
      refute ClasseFalha.conta_ciclo?(:ambiente)
    end

    test "prazo manda MESMO com saida que pareceria reprovacao" do
      # A ordem das checagens e regra, e nao arrumacao: prazo e inequivoco.
      ctx = contexto(estourou_prazo: true, saida: "3 tests, 2 failures")

      assert ClasseFalha.classificar(ctx) == :ambiente
    end

    test "processo morto por sinal" do
      assert ClasseFalha.classificar(contexto(sinal: "SIGKILL")) == :ambiente
    end

    test "crash nativo do Windows chega como NTSTATUS de erro" do
      # 0xC0000409 (stack buffer overrun) e 0xC0000005 (access violation) aparecem sempre que
      # a suite roda com a maquina sem memoria.
      for codigo <- [0xC0000409, 0xC0000005, 0xC0000000] do
        assert ClasseFalha.classificar(contexto(codigo: codigo)) == :ambiente
      end
    end

    test "codigo abaixo do piso NTSTATUS NAO e crash nativo" do
      assert ClasseFalha.classificar(contexto(codigo: 0xBFFFFFFF)) == :entrega
    end

    test "recurso esgotado, em varias stacks" do
      mensagens = [
        "Error: ENOMEM: not enough memory",
        "EMFILE: too many open files",
        "listen EADDRINUSE: address already in use :::4000",
        "EBUSY: resource busy or locked",
        "FATAL ERROR: JavaScript heap out of memory",
        "runtime: out of memory",
        "MemoryError"
      ]

      for saida <- mensagens do
        assert ClasseFalha.classificar(contexto(saida: saida)) == :ambiente,
               "deveria ser ambiente: #{saida}"
      end
    end

    test "recurso esgotado e consultado POR ULTIMO, e a ordem tem consequencia" do
      # A mensagem pode aparecer dentro da saida de uma suite que rodou inteira e reprovou por
      # outro motivo. Se `ambiente` viesse antes de `ferramenta`, um criterio quebrado cuja
      # saida mencionasse EBUSY seria reexecutado para sempre em vez de consertado.
      ctx = contexto(saida: "unknown option '--x'\nAviso: EBUSY em arquivo temporario")

      assert ClasseFalha.classificar(ctx) == :ferramenta_quebrada
    end
  end

  describe "entrega — o comando rodou e o resultado esta errado" do
    test "reprovacao comum de suite" do
      ctx = contexto(saida: "5 tests, 2 failures", codigo: 1)

      assert ClasseFalha.classificar(ctx) == :entrega
      assert ClasseFalha.conta_ciclo?(:entrega)
    end

    test "na duvida, :entrega" do
      # Errar para o lado de reprovar gasta no maximo um ciclo; errar para o lado de nao
      # reprovar deixa defeito passar, e portao que deixa passar nao e portao.
      assert ClasseFalha.classificar(contexto(saida: "", codigo: 1)) == :entrega
      assert ClasseFalha.classificar(contexto(saida: "algo deu errado", codigo: 42)) == :entrega
    end

    test "codigo nulo sem sinal nenhum ainda e entrega" do
      assert ClasseFalha.classificar(contexto(codigo: nil)) == :entrega
    end

    test "contexto sem :sinal e sem :existe_no_disco nao levanta" do
      # Os dois campos sao opcionais de proposito: quem chama nem sempre tem como responder.
      assert ClasseFalha.classificar(%{
               argv: ["mix", "test"],
               saida: "1 failure",
               codigo: 1,
               estourou_prazo: false
             }) == :entrega
    end
  end

  describe "as consequencias sao opostas, e e disso que a tarefa trata" do
    test "so :entrega gasta uma das tres fichas" do
      assert ClasseFalha.conta_ciclo?(:entrega)
      refute ClasseFalha.conta_ciclo?(:ferramenta_quebrada)
      refute ClasseFalha.conta_ciclo?(:ambiente)
    end

    test "so :ambiente vale reexecutar" do
      assert ClasseFalha.reexecuta?(:ambiente)
      refute ClasseFalha.reexecuta?(:ferramenta_quebrada)
      refute ClasseFalha.reexecuta?(:entrega)
    end

    test "cada classe aponta para quem conserta, e sao tres pessoas diferentes" do
      assert ClasseFalha.quem_conserta(:ferramenta_quebrada) == :orquestrador_corrige_criterio
      assert ClasseFalha.quem_conserta(:ambiente) == :maquina
      assert ClasseFalha.quem_conserta(:entrega) == :construtor
    end

    test "a explicacao de ferramenta diz que o CRITERIO precisa de conserto" do
      # E a frase que impede o laco da T-030: sem ela, quem le o relatorio conclui que a
      # entrega falhou e despacha o construtor de novo.
      assert ClasseFalha.explicar(:ferramenta_quebrada) =~ "criterio e que precisa de conserto"
      assert ClasseFalha.explicar(:entrega) =~ "resultado esta errado"
      assert ClasseFalha.explicar(:ambiente) =~ "maquina atrapalhou"
    end
  end

  describe "integrado a passada mecanica" do
    test "tarefa mix inexistente vira :inconclusivo por ferramenta, e NAO gasta ciclo" do
      resultados =
        Criterios.executar([criterio("roda a bateria", "git log --opcao-invalida")], @raiz)

      assert [resultado] = resultados
      assert resultado.estado == :inconclusivo
      assert resultado.classe == :ferramenta_quebrada
      refute Criterios.reprovou?(resultados)
      assert Criterios.ciclos_gastos(resultados) == 0
      assert [_] = Criterios.criterios_quebrados(resultados)
    end

    test "prazo estourado reexecuta UMA vez, e a reexecucao e contada" do
      resultados =
        Criterios.executar([criterio("a suite", "git rev-parse --git-dir")], @raiz, prazo: 1)

      assert [resultado] = resultados
      assert resultado.estado == :inconclusivo
      assert resultado.classe == :ambiente
      assert resultado.reexecutado
      assert Criterios.reexecucoes(resultados) == 1

      # E o ponto todo: prazo estourado NAO devolve a tarefa ao construtor.
      refute Criterios.reprovou?(resultados)
      assert Criterios.ciclos_gastos(resultados) == 0
    end

    test "comando que passa nao reexecuta nem entra em inconclusivo" do
      resultados = Criterios.executar([criterio("repo", "git rev-parse --git-dir")], @raiz)

      assert [%{estado: :passou, reexecutado: false, classe: nil}] = resultados
      assert Criterios.reexecucoes(resultados) == 0
      assert Criterios.inconclusivos(resultados) == []
    end

    test "reprovacao de verdade continua reprovando e gastando ciclo" do
      resultados = Criterios.executar([criterio("objeto", "git cat-file -t 0000000000")], @raiz)

      assert [%{estado: :falhou, classe: :entrega}] = resultados
      assert Criterios.reprovou?(resultados)
      assert Criterios.ciclos_gastos(resultados) == 1
    end

    test "a passada inteira gasta no maximo UM ciclo, mesmo com varias reprovacoes" do
      resultados =
        Criterios.executar(
          [
            criterio("um", "git cat-file -t 0000000000"),
            criterio("dois", "git cat-file -t 1111111111")
          ],
          @raiz
        )

      assert Enum.all?(resultados, &(&1.estado == :falhou))
      assert Criterios.ciclos_gastos(resultados) == 1
    end
  end

  describe "o relatorio conta a diferenca" do
    test "inconclusivo sai como [julgado] com a acao dita, e nao como reprovacao" do
      texto =
        [criterio("bateria", "git log --opcao-invalida")]
        |> Criterios.executar(@raiz)
        |> Criterios.relatorio()

      assert texto =~ "- [julgado] bateria"
      assert texto =~ "criterio e que precisa de conserto"
      assert texto =~ "Nao reprova a tarefa"
      refute texto =~ "**FALHOU**"
    end

    test "a linha de aviso separa o grau da ACAO" do
      # O grau ja esta contado como julgado; o que a linha acrescenta e quem precisa agir — e
      # criterio quebrado nenhum construtor conserta, porque por contrato nao pode altera-lo.
      texto =
        [criterio("bateria", "git log --opcao-invalida")]
        |> Criterios.executar(@raiz)
        |> Criterios.relatorio()

      assert texto =~ "1 criterio(s) INCONCLUSIVO(s)"
      assert texto =~ "por ferramenta_quebrada"
      assert texto =~ "nenhum construtor pode altera-lo"
    end

    test "sem inconclusivo, a linha de aviso NAO aparece" do
      texto =
        [criterio("repo", "git rev-parse --git-dir")]
        |> Criterios.executar(@raiz)
        |> Criterios.relatorio()

      refute texto =~ "INCONCLUSIVO"
    end

    test "a escada continua com TRES degraus, e nao quatro" do
      # A v1 cunhou um quarto rotulo. Aqui isso quebraria a escada que as duas trilhas
      # compartilham — e o sinal nao se perde, ele so mudou de linha.
      texto =
        [criterio("bateria", "git log --opcao-invalida"), criterio("julga", nil)]
        |> Criterios.executar(@raiz)
        |> Criterios.relatorio()

      refute texto =~ "[inconclusivo]"
      assert texto =~ "Graus de prova: 2 julgado(s) (de 2)."
    end
  end
end
