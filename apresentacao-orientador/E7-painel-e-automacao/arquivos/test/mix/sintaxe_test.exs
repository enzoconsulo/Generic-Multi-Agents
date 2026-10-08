defmodule Mix.Tasks.Fabrica.SintaxeTest do
  @moduledoc """
  Prova que `mix fabrica.sintaxe` confere sintaxe SEM executar o arquivo: valido sai 0 e
  confirma; invalido sai != 0 citando a falha (arquivo/linha), sem stacktrace cru.
  """

  use ExUnit.Case, async: true

  import ExUnit.CaptureIO

  alias Mix.Tasks.Fabrica.Sintaxe

  defp fixture(conteudo) do
    caminho =
      Path.join(System.tmp_dir!(), "fabrica-sintaxe-#{System.unique_integer([:positive])}.exs")

    File.write!(caminho, conteudo)
    on_exit(fn -> File.rm(caminho) end)
    caminho
  end

  describe "arquivo sintaticamente valido" do
    test "sai sem levantar e confirma o caminho" do
      caminho = fixture("defmodule Foo, do: :ok\n")

      saida = capture_io(fn -> Sintaxe.run([caminho]) end)

      assert saida =~ "sintaxe valida"
      assert saida =~ caminho
    end

    # Esta e a sonda real que motivou a tarefa (T-092/D-022): precisa parsear sem rodar,
    # porque rodar gastaria cota real do `claude`.
    test "a sonda real priv/probes/confinamento_cli.exs parseia sem ser executada" do
      saida = capture_io(fn -> Sintaxe.run(["priv/probes/confinamento_cli.exs"]) end)

      assert saida =~ "sintaxe valida"
    end
  end

  describe "arquivo com erro de sintaxe proposital" do
    test "sai com codigo != 0 e a mensagem cita a falha, sem stacktrace cru" do
      caminho = fixture("defmodule Foo do\n  def bar(x) do\n    x +\n  end\nend\n")

      {motivo, saida} =
        with_io(:stderr, fn -> catch_exit(Sintaxe.run([caminho])) end)

      assert motivo == {:shutdown, 1}
      # O Windows normaliza unidade/barras do caminho (ex.: `C:\...` -> `c:/...`) ao reportar
      # a localizacao; comparar pelo nome do arquivo evita falso negativo so de grafia.
      assert saida =~ Path.basename(caminho)
      refute saida =~ "** (SyntaxError)", "stacktrace cru, nao a mensagem formatada"
      refute saida =~ "** (TokenMissingError)", "stacktrace cru, nao a mensagem formatada"
      refute saida =~ "lib/elixir", "nao e para citar o fonte do PROPRIO parser"
    end
  end

  describe "arquivo inexistente" do
    test "sai com codigo != 0 sem levantar excecao crua" do
      {motivo, saida} =
        with_io(:stderr, fn -> catch_exit(Sintaxe.run(["nao/existe/arquivo.exs"])) end)

      assert motivo == {:shutdown, 1}
      assert saida =~ "nao/existe/arquivo.exs"
    end
  end

  describe "argumentos invalidos" do
    test "sem exatamente um caminho, levanta Mix.Error" do
      assert_raise Mix.Error, fn -> Sintaxe.run([]) end
      assert_raise Mix.Error, fn -> Sintaxe.run(["a.exs", "b.exs"]) end
    end
  end
end
