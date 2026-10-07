defmodule Fabrica.Ferramentas.GuardasTest do
  @moduledoc """
  Uma forma conhecida de matar o runtime por teste, e a assimetria recusar × avisar.

  As duas guardas sao puras, entao da para testa-las exaustivamente — e e nelas que mora
  todo o julgamento, o que torna a exaustividade barata e obrigatoria.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Ferramentas.Guardas

  describe "guarda de processos: recusa cada forma de matar o runtime" do
    test "taskkill por nome de imagem do beam" do
      assert {:recusado, :mataria_o_runtime, _} =
               Guardas.avaliar_processo("taskkill /F /IM beam.exe")
    end

    test "taskkill por nome do erl" do
      assert {:recusado, :mataria_o_runtime, _} = Guardas.avaliar_processo("taskkill /IM erl.exe")
    end

    test "Stop-Process por nome do beam" do
      assert {:recusado, :mataria_o_runtime, _} =
               Guardas.avaliar_processo("Stop-Process -Name beam")
    end

    test "pkill beam" do
      assert {:recusado, :mataria_o_runtime, _} = Guardas.avaliar_processo("pkill beam.smp")
    end

    test "killall erl" do
      assert {:recusado, :mataria_o_runtime, _} = Guardas.avaliar_processo("killall erl")
    end

    test "taskkill por nome do proprio mix" do
      assert {:recusado, :mataria_o_runtime, _} = Guardas.avaliar_processo("taskkill /IM mix.bat")
    end

    test "epmd tambem derruba o no" do
      # Sem o daemon de nomes o no perde a identidade, mesmo continuando "vivo".
      assert {:recusado, :mataria_o_runtime, _} = Guardas.avaliar_processo("pkill epmd")
    end

    test "morte indiscriminada por curinga" do
      assert {:recusado, :morte_indiscriminada, _} =
               Guardas.avaliar_processo("taskkill /F /IM *")
    end

    test "kill -9 -1 mata tudo do usuario" do
      assert {:recusado, :morte_indiscriminada, _} = Guardas.avaliar_processo("kill -9 -1")
    end

    test "a recusa explica o que aconteceria, e nao so que foi recusada" do
      {:recusado, _, explicacao} = Guardas.avaliar_processo("taskkill /F /IM beam.exe")

      assert explicacao =~ "o agente morre junto"
      assert String.length(explicacao) > 40
    end
  end

  describe "guarda de processos: prova de propriedade" do
    test "PERMITE matar um PID que a fabrica lancou" do
      assert :permitido = Guardas.avaliar_processo("taskkill /PID 4242 /T /F", [4242])
    end

    test "permite matar varios PIDs, se todos forem da fabrica" do
      assert :permitido = Guardas.avaliar_processo("taskkill /PID 100 /PID 200", [100, 200, 300])
    end

    test "recusa PID que a fabrica NAO lancou" do
      assert {:recusado, :sem_prova_de_propriedade, explicacao} =
               Guardas.avaliar_processo("taskkill /PID 9999 /T /F", [4242])

      assert explicacao =~ "9999"
    end

    test "recusa quando UM dos PIDs e alheio" do
      # Basta um alheio: um comando com varios alvos nao pode ser meio permitido.
      assert {:recusado, :sem_prova_de_propriedade, _} =
               Guardas.avaliar_processo("taskkill /PID 100 /PID 9999", [100])
    end

    test "recusa encerramento sem PID nenhum" do
      assert {:recusado, :sem_alvo, _} = Guardas.avaliar_processo("taskkill /F", [4242])
    end

    test "sem lista de lancados, nenhum PID e proprio" do
      assert {:recusado, :sem_prova_de_propriedade, _} =
               Guardas.avaliar_processo("taskkill /PID 4242")
    end

    test "kill -TERM com PID da fabrica passa" do
      assert :permitido = Guardas.avaliar_processo("kill -TERM 555", [555])
    end
  end

  describe "guarda de processos: o que NAO e encerramento passa" do
    test "comando comum nao e barrado" do
      assert :permitido = Guardas.avaliar_processo("mix test")
      assert :permitido = Guardas.avaliar_processo("git status")
      assert :permitido = Guardas.avaliar_processo("npm install")
    end

    test "palavra que apenas CONTEM um nome de runtime nao dispara o detector de runtime" do
      # `beam` dentro de `beamer`, `erl` dentro de `superlativo`. Um detector que acusa o
      # inocente deixa de ser levado a serio na segunda vez.
      #
      # O MOTIVO e o que este teste olha, e nao o veredito: `taskkill /IM beamer.exe`
      # continua sendo recusado — e certo que seja, porque e morte por nome, sem PID. O que
      # ele NAO pode ser e `:mataria_o_runtime`, que seria o detector confundindo `beamer`
      # com `beam`.
      assert {:recusado, :sem_alvo, _} = Guardas.avaliar_processo("taskkill /IM beamer.exe", [])
      assert :permitido = Guardas.avaliar_processo("echo superlativo")
    end

    test "mencionar beam sem matar nada passa" do
      assert :permitido = Guardas.avaliar_processo("echo 'o beam roda aqui'")
    end
  end

  describe "guarda de ferramental: AVISA, nunca recusa" do
    test "o retorno e uma lista de avisos, e nao um veredito" do
      # A assimetria e a regra: recusar aqui transformaria um palpite sobre intencao numa
      # parede, e palpite sobre intencao erra.
      avisos = Guardas.avaliar_ferramental("curl https://exemplo.com/x.json")

      assert is_list(avisos)
      assert length(avisos) == 1
      refute match?({:recusado, _, _}, avisos)
    end

    test "o aviso diz o que usar no lugar, e nao so que esta errado" do
      [aviso] = Guardas.avaliar_ferramental("curl https://exemplo.com")

      assert aviso.use =~ "Operario"
      assert aviso.use =~ "T-019"
      assert aviso.texto =~ "RODOU assim mesmo"
    end

    test "avisa sobre estagio solto da bateria" do
      [aviso] = Guardas.avaliar_ferramental("mix credo --strict")
      assert aviso.use =~ "ci.json"
    end

    test "avisa sobre encerramento de processo a mao" do
      [aviso] = Guardas.avaliar_ferramental("taskkill /PID 123")
      assert aviso.use =~ "ArvoreProcessos"
    end

    test "avisa sobre commit fora do fluxo" do
      [aviso] = Guardas.avaliar_ferramental("git commit -m 'x'")
      assert aviso.use =~ "T-032"
    end

    test "comando limpo nao gera aviso nenhum" do
      assert [] = Guardas.avaliar_ferramental("mix fabrica.ci --rapido")
      assert [] = Guardas.avaliar_ferramental("ls -la")
    end

    test "um comando pode disparar mais de um aviso" do
      avisos = Guardas.avaliar_ferramental("curl https://x.com && git commit -m y")
      assert length(avisos) == 2
    end

    test "o catalogo declara ferramenta, substituto e motivo em todas as entradas" do
      for entrada <- Guardas.catalogo() do
        assert entrada.pistas != []
        assert String.trim(entrada.ferramenta) != ""
        assert String.trim(entrada.use) != ""
        assert String.trim(entrada.motivo) != ""
      end
    end
  end

  describe "as duas guardas sao PURAS" do
    test "o codigo nao faz I/O nenhum" do
      fonte = File.read!("lib/fabrica/ferramentas/guardas.ex")

      for proibido <- ~w[File System.cmd Port :file :os IO Process Application Ecto] do
        padrao = ~r/(?<![A-Za-z0-9_.])#{Regex.escape(proibido)}[.(]/

        refute Regex.match?(padrao, fonte),
               "Guardas usa #{proibido}. As duas guardas sao puras: e por isso que da " <>
                 "para testa-las exaustivamente, e e nelas que mora todo o julgamento."
      end
    end

    test "a mesma entrada da sempre a mesma saida" do
      comando = "taskkill /PID 4242 /T /F"

      assert Guardas.avaliar_processo(comando, [4242]) ==
               Guardas.avaliar_processo(comando, [4242])

      assert Guardas.avaliar_ferramental("curl x") == Guardas.avaliar_ferramental("curl x")
    end

    test "o detector de I/O funciona, e nao passa por vazio" do
      # Sem isto o teste acima poderia estar verde por um erro de padrao.
      padrao = ~r/(?<![A-Za-z0-9_.])File[.(]/

      assert Regex.match?(padrao, "File.read!(x)")
      refute Regex.match?(padrao, "MeuFile.read!(x)")
    end
  end
end
