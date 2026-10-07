defmodule Fabrica.Criterios.SuiteTest do
  @moduledoc """
  O criterio que ninguem escreve, e a deteccao que o encontra.

  Cada teste monta um projeto de mentira num diretorio temporario com **apenas os
  arquivos-marcador** — nao ha codigo real em lugar nenhum, porque o que esta em teste e a
  deteccao, e nao a suite dos ecossistemas.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Criterios
  alias Fabrica.Criterios.Suite
  alias Fabrica.Ecossistemas

  doctest Fabrica.Criterios.Suite

  # Um projeto de mentira, apagado ao fim do teste.
  defp projeto(arquivos) do
    raiz = Path.join(System.tmp_dir!(), "suite-#{System.unique_integer([:positive])}")
    File.mkdir_p!(raiz)
    on_exit(fn -> File.rm_rf(raiz) end)

    Enum.each(arquivos, fn {caminho, conteudo} ->
      alvo = Path.join(raiz, caminho)
      File.mkdir_p!(Path.dirname(alvo))
      File.write!(alvo, conteudo)
    end)

    raiz
  end

  defp ci_json(comando) do
    Jason.encode!(%{
      "ecossistema" => "qualquer",
      "estagios" => [
        %{"nome" => "formato", "comando" => "mix format --check-formatted"},
        %{"nome" => "testes", "comando" => comando}
      ]
    })
  end

  describe "deteccao por arquivo-marcador — um teste por ecossistema" do
    test "mix.exs e Elixir" do
      raiz = projeto([{"mix.exs", ""}])

      assert %{id: :elixir, testes: "mix test"} = Ecossistemas.detectar(raiz)
      assert {:ok, "mix test", {:detectado, :elixir}} = Suite.comando(raiz)
    end

    test "package.json e Node" do
      raiz = projeto([{"package.json", "{}"}])

      assert %{id: :node} = Ecossistemas.detectar(raiz)
      assert {:ok, "npm test", {:detectado, :node}} = Suite.comando(raiz)
    end

    test "pyproject.toml e Python" do
      raiz = projeto([{"pyproject.toml", ""}])

      assert %{id: :python} = Ecossistemas.detectar(raiz)
      assert {:ok, "pytest", {:detectado, :python}} = Suite.comando(raiz)
    end

    test "Cargo.toml e Rust" do
      raiz = projeto([{"Cargo.toml", ""}])

      assert %{id: :rust} = Ecossistemas.detectar(raiz)
      assert {:ok, "cargo test", {:detectado, :rust}} = Suite.comando(raiz)
    end

    test "go.mod e Go" do
      raiz = projeto([{"go.mod", ""}])

      assert %{id: :go} = Ecossistemas.detectar(raiz)
      assert {:ok, "go test ./...", {:detectado, :go}} = Suite.comando(raiz)
    end

    test "*.csproj e .NET, e o marcador e EXTENSAO e nao nome exato" do
      raiz = projeto([{"Api.csproj", ""}])

      assert %{id: :dotnet} = Ecossistemas.detectar(raiz)
      assert {:ok, "dotnet test", {:detectado, :dotnet}} = Suite.comando(raiz)
    end

    test "Python tambem por requirements.txt e setup.py" do
      # Um ecossistema pode ter mais de um marcador, e reconhecer so o mais moderno deixaria
      # de fora projeto antigo — que e justamente o que se importa da v1.
      for marcador <- ["requirements.txt", "setup.py"] do
        raiz = projeto([{marcador, ""}])
        assert %{id: :python} = Ecossistemas.detectar(raiz), "deveria detectar por #{marcador}"
      end
    end
  end

  describe "a ordem de prioridade" do
    test "Elixir vence Node, e essa ordem diverge da v1 por um motivo concreto" do
      # A v1 poe Node primeiro. A propria fabrica v2 e um projeto Elixir COM package.json
      # (assets do Phoenix): com a ordem da v1 ela se detectaria como Node e rodaria um
      # `npm test` que nao existe. Projeto que nao reconhece a si mesmo e mau sinal.
      raiz = projeto([{"mix.exs", ""}, {"package.json", "{}"}])

      assert %{id: :elixir} = Ecossistemas.detectar(raiz)
    end

    test "a propria fabrica v2 se detecta como Elixir" do
      # O caso real, e nao um projeto de mentira.
      assert %{id: :elixir} = Ecossistemas.detectar(File.cwd!())
    end

    test "o catalogo esta na ordem declarada pelo plano" do
      ids = Enum.map(Ecossistemas.catalogo(), & &1.id)

      assert ids == [:elixir, :node, :python, :rust, :go, :dotnet]
    end

    test "Node vence Python quando so esses dois estao presentes" do
      raiz = projeto([{"package.json", "{}"}, {"pyproject.toml", ""}])

      assert %{id: :node} = Ecossistemas.detectar(raiz)
    end
  end

  describe "ci.json VENCE a deteccao" do
    test "declaracao ganha de palpite" do
      # Um projeto pode ter mix.exs e mesmo assim rodar a suite por um alias proprio. O
      # palpite nunca saberia disso; o arquivo diz.
      raiz = projeto([{"mix.exs", ""}, {"_gestao/ci.json", ci_json("mix verificar")}])

      assert {:ok, "mix verificar", :declarado} = Suite.comando(raiz)
    end

    test "vence mesmo quando o ecossistema nao seria reconhecido" do
      raiz = projeto([{"_gestao/ci.json", ci_json("./roda-testes.sh")}])

      assert Ecossistemas.detectar(raiz) == nil
      assert {:ok, "./roda-testes.sh", :declarado} = Suite.comando(raiz)
    end

    test "ci.json com JSON quebrado NAO impede a suite: cai na deteccao" do
      # Trocar "o palpite talvez erre o comando" por "ninguem roda a suite" seria pior.
      raiz = projeto([{"mix.exs", ""}, {"_gestao/ci.json", "{ isto nao e json"}])

      assert {:ok, "mix test", {:detectado, :elixir}} = Suite.comando(raiz)
    end

    test "ci.json sem estagio de testes cai na deteccao" do
      so_formato = Jason.encode!(%{"estagios" => [%{"nome" => "formato", "comando" => "x"}]})
      raiz = projeto([{"mix.exs", ""}, {"_gestao/ci.json", so_formato}])

      assert {:ok, "mix test", {:detectado, :elixir}} = Suite.comando(raiz)
    end

    test "estagio de testes com comando vazio cai na deteccao" do
      raiz = projeto([{"mix.exs", ""}, {"_gestao/ci.json", ci_json("   ")}])

      assert {:ok, "mix test", {:detectado, :elixir}} = Suite.comando(raiz)
    end

    test "ci.json sem a chave estagios cai na deteccao" do
      raiz = projeto([{"mix.exs", ""}, {"_gestao/ci.json", Jason.encode!(%{"nada" => true})}])

      assert {:ok, "mix test", {:detectado, :elixir}} = Suite.comando(raiz)
    end
  end

  describe "projeto sem ecossistema reconhecido nao quebra" do
    test "devolve erro nomeado, e nao levanta" do
      raiz = projeto([{"LEIAME.txt", "um projeto de nada"}])

      assert Ecossistemas.detectar(raiz) == nil
      assert {:erro, :sem_ecossistema} = Suite.comando(raiz)
      assert Suite.criterio(raiz) == nil
    end

    test "diretorio que nem existe tambem nao levanta" do
      assert Ecossistemas.detectar("C:/caminho/que/nao/existe") == nil
      assert {:erro, :sem_ecossistema} = Suite.comando("C:/caminho/que/nao/existe")
    end

    test "acrescentar/2 devolve a lista INTACTA — e essa e a resposta certa" do
      raiz = projeto([{"LEIAME.txt", ""}])
      escritos = [%{texto: "alguem julga", comando: nil, marcado: false, implicito: false}]

      assert Suite.acrescentar(escritos, raiz) == escritos
    end

    test "diretorio vazio nao e ecossistema" do
      assert Ecossistemas.detectar(projeto([])) == nil
    end
  end

  describe "o criterio implicito" do
    test "nasce marcado como implicito, e o texto diz de onde veio" do
      raiz = projeto([{"mix.exs", ""}])
      criterio = Suite.criterio(raiz)

      assert criterio.implicito
      assert criterio.comando == "mix test"
      assert criterio.texto =~ "detectado: Elixir / Mix"
      refute criterio.marcado
    end

    test "quando declarado, o texto aponta o ARQUIVO e nao o palpite" do
      # Quem le o relatorio precisa saber se confia numa declaracao ou numa heuristica.
      raiz = projeto([{"mix.exs", ""}, {"_gestao/ci.json", ci_json("mix verificar")}])

      assert Suite.criterio(raiz).texto =~ "declarado em _gestao/ci.json"
    end

    test "entra no FIM da lista: o que alguem escreveu vem primeiro" do
      raiz = projeto([{"mix.exs", ""}])
      escritos = [%{texto: "primeiro", comando: nil, marcado: false, implicito: false}]

      assert [%{texto: "primeiro"}, %{implicito: true}] = Suite.acrescentar(escritos, raiz)
    end
  end

  describe "o implicito no relatorio" do
    test "aparece marcado [implicito], para nao parecer que alguem o escreveu" do
      # Sem a marca, o proximo planejador escreve o criterio de novo por achar que sumiu — e
      # e justamente escreve-lo a mao que cria a segunda chance de errar o comando.
      #
      # A raiz e um projeto de MENTIRA com o comando declarado, e nao a fabrica: o implicito
      # de um projeto Elixir e `mix test`, entao rodar a passada sobre a propria fabrica
      # dispararia a suite de dentro da suite. Ver a armadilha no GUIA.
      raiz = projeto([{"_gestao/ci.json", ci_json("git rev-parse --git-dir")}])

      texto =
        [%{texto: "escrito por alguem", comando: "git status --short", marcado: false}]
        |> Suite.acrescentar(raiz)
        |> Criterios.executar(raiz)
        |> Criterios.relatorio()

      assert texto =~ "escrito por alguem"
      assert texto =~ "[implicito] A suite do projeto passa"
      refute texto =~ "[implicito] escrito por alguem"
    end

    test "criterio escrito a mao NAO ganha a marca" do
      texto =
        [%{texto: "escrito", comando: "git rev-parse --git-dir", marcado: false}]
        |> Criterios.executar(File.cwd!())
        |> Criterios.relatorio()

      refute texto =~ "[implicito]"
    end

    test "a marca sobrevive a deduplicacao, do lado certo" do
      # O espelho herda o VEREDITO, nao a identidade: se a tarefa ja declara `mix test` e o
      # implicito repete o mesmo comando, quem carrega a marca e o implicito.
      raiz = File.cwd!()
      comando = "git rev-parse --git-dir"

      resultados =
        [
          %{texto: "escrito", comando: comando, marcado: false, implicito: false},
          %{texto: "a suite", comando: comando, marcado: false, implicito: true}
        ]
        |> Criterios.executar(raiz)

      assert [%{implicito: false, espelho: false}, %{implicito: true, espelho: true}] = resultados
    end

    test "a suite implicita nao custa uma execucao a mais quando a tarefa ja a declara" do
      raiz = File.cwd!()
      comando = "git rev-parse --git-dir"

      texto =
        [
          %{texto: "a bateria", comando: comando, marcado: false, implicito: false},
          %{texto: "a suite", comando: comando, marcado: false, implicito: true}
        ]
        |> Criterios.executar(raiz)
        |> Criterios.relatorio()

      assert texto =~ "mesmo comando ja executado acima"
      assert texto =~ "Graus de prova: 2 executado(s) (de 2)."
    end
  end
end
