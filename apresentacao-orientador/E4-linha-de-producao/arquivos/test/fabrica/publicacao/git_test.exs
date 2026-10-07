defmodule Fabrica.Publicacao.GitTest do
  @moduledoc """
  A armadilha da v1: um commit escopado que nao pega o que foi escrito fora das `areas`.
  Este teste trava o OPOSTO — nenhuma escrita fora das `areas` some em silencio, e nenhum
  commit sai `add -A`.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Ferramentas.Comando
  alias Fabrica.Publicacao.Git

  @moduletag :capture_log

  setup do
    raiz =
      Path.join([
        File.cwd!(),
        "_build",
        "test",
        "tmp",
        "git-#{System.unique_integer([:positive])}"
      ])

    File.mkdir_p!(raiz)
    {:ok, _} = git(raiz, ["init"])
    {:ok, _} = git(raiz, ["config", "user.email", "fabrica@teste.local"])
    {:ok, _} = git(raiz, ["config", "user.name", "Fabrica de Teste"])

    on_exit(fn -> File.rm_rf(raiz) end)
    {:ok, raiz: raiz}
  end

  defp git(raiz, argumentos), do: Comando.rodar(raiz, "git", argumentos)

  defp escrever(raiz, caminho, conteudo) do
    absoluto = Path.join(raiz, caminho)
    File.mkdir_p!(Path.dirname(absoluto))
    File.write!(absoluto, conteudo)
  end

  defp log(raiz) do
    {:ok, %{stdout: saida}} = git(raiz, ["log", "-1", "--pretty=%s"])
    String.trim(saida)
  end

  describe "mensagem/2" do
    test "monta a mensagem canonica T-NNN: titulo" do
      assert Git.mensagem("T-032", "Geracao do markdown") == "T-032: Geracao do markdown"
    end
  end

  describe "alteracoes_fora/2" do
    test "vazio quando so as areas declaradas mudaram", %{raiz: raiz} do
      escrever(raiz, "lib/a.ex", "conteudo a")
      escrever(raiz, "_gestao/tarefas/T-001-x.md", "tarefa")

      assert {:ok, []} =
               Git.alteracoes_fora(raiz, ["lib/a.ex", "_gestao/tarefas/T-001-x.md"])
    end

    test "aponta o caminho que mudou fora das areas", %{raiz: raiz} do
      escrever(raiz, "lib/a.ex", "declarado")
      escrever(raiz, "lib/b.ex", "NAO declarado")

      assert {:ok, ["lib/b.ex"]} = Git.alteracoes_fora(raiz, ["lib/a.ex"])
    end

    test "arquivo NAO rastreado fora das areas tambem conta", %{raiz: raiz} do
      escrever(raiz, "lib/a.ex", "v1")
      {:ok, _} = git(raiz, ["add", "--", "lib/a.ex"])
      {:ok, _} = git(raiz, ["commit", "-m", "base"])

      escrever(raiz, "lib/a.ex", "v2 declarado")
      escrever(raiz, "lib/solto.ex", "escrito por engano, fora da area")

      assert {:ok, ["lib/solto.ex"]} = Git.alteracoes_fora(raiz, ["lib/a.ex"])
    end
  end

  describe "commitar/3" do
    test "commita as areas mais o arquivo da tarefa, com a mensagem T-NNN: titulo", %{
      raiz: raiz
    } do
      escrever(raiz, "lib/a.ex", "codigo")
      escrever(raiz, "_gestao/tarefas/T-050-algo.md", "tarefa")

      caminhos = ["lib/a.ex", "_gestao/tarefas/T-050-algo.md"]
      mensagem = Git.mensagem("T-050", "Titulo da tarefa")

      assert {:ok, _} = Git.commitar(raiz, caminhos, mensagem)
      assert log(raiz) == mensagem

      assert {:ok, %{codigo: 0, stdout: status}} = git(raiz, ["status", "--porcelain"])
      assert String.trim(status) == ""
    end

    test "recusa e REPORTA quando ha alteracao fora das areas, sem commitar nada", %{
      raiz: raiz
    } do
      escrever(raiz, "lib/a.ex", "declarado")
      escrever(raiz, "lib/fora.ex", "fora da area, por engano")

      assert {:erro, {:alteracoes_fora_das_areas, ["lib/fora.ex"]}} =
               Git.commitar(raiz, ["lib/a.ex"], "T-050: titulo")

      assert {:ok, %{codigo: 128}} = git(raiz, ["rev-parse", "HEAD"])

      assert {:ok, %{codigo: 0, stdout: status}} =
               git(raiz, ["status", "--porcelain", "--untracked-files=all"])

      assert status =~ "lib/a.ex"
      assert status =~ "lib/fora.ex"
    end

    test "nao faz `git add -A`: arquivo fora das areas fica de fora mesmo quando o commit passa",
         %{raiz: raiz} do
      escrever(raiz, "lib/a.ex", "declarado")
      {:ok, _} = Git.commitar(raiz, ["lib/a.ex"], "T-050: primeiro commit")

      escrever(raiz, "lib/a.ex", "declarado de novo")
      escrever(raiz, "lib/nao_declarado.ex", "nunca deveria ir junto")

      assert {:erro, {:alteracoes_fora_das_areas, ["lib/nao_declarado.ex"]}} =
               Git.commitar(raiz, ["lib/a.ex"], "T-050: segundo commit")

      assert log(raiz) == "T-050: primeiro commit"
    end
  end

  describe "hash/1" do
    test "devolve o hash curto do commit mais recente", %{raiz: raiz} do
      escrever(raiz, "lib/a.ex", "codigo")
      {:ok, _} = Git.commitar(raiz, ["lib/a.ex"], "T-050: titulo")

      assert {:ok, hash} = Git.hash(raiz)
      assert String.match?(hash, ~r/^[0-9a-f]{7,}$/)
    end
  end
end
