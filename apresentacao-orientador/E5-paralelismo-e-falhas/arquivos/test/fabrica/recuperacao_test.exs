defmodule Fabrica.RecuperacaoTest do
  @moduledoc """
  Os tres criterios da T-040: tarefa orfa (sem processo vivo) volta ao estado anterior com
  motivo registrado; alteracao nao commitada nas `areas` de uma tarefa orfa e recuperada em
  commit marcado; e o saneamento reporta sempre, mesmo quando nao ha nada a fazer.

  A maioria dos testes passa `tarefas:` explicitamente, em vez de deixar `sanear/1` ler o
  banco inteiro: `Fabrica.BackupTest` (`async: false`) grava, DE PROPOSITO, uma tarefa real
  fora do sandbox para provar o ciclo de `pg_dump`/`pg_restore` — e ela sobrevive entre
  execucoes de `mix test`. Escopar `:tarefas` evita que o relatorio desta suite dependa do
  banco de teste estar "limpo" de uma tarefa que nao e desta suite.
  """

  use Fabrica.DataCase, async: true

  alias Fabrica.Ferramentas.Comando
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Recuperacao
  alias Fabrica.Tarefas.Area
  alias Fabrica.Tarefas.Ciclo
  alias Fabrica.Tarefas.Tarefa

  @moduletag :capture_log

  defp raiz_git do
    raiz = Path.join([File.cwd!(), "_build", "test", "tmp", "recuperacao-#{unico()}"])

    File.mkdir_p!(raiz)
    {:ok, _} = git(raiz, ["init"])
    {:ok, _} = git(raiz, ["config", "user.email", "fabrica@teste.local"])
    {:ok, _} = git(raiz, ["config", "user.name", "Fabrica de Teste"])

    on_exit(fn -> File.rm_rf(raiz) end)
    raiz
  end

  defp git(raiz, argumentos), do: Comando.rodar(raiz, "git", argumentos)

  defp unico, do: System.unique_integer([:positive])

  defp projeto!(atributos \\ %{}) do
    padrao = %{nome: "projeto-#{unico()}", caminho: "C:/tmp/sem-git-#{unico()}"}

    %Projeto{}
    |> Projeto.changeset(Map.merge(padrao, atributos))
    |> Repo.insert!()
  end

  defp tarefa!(projeto, atributos) do
    padrao = %{
      projeto_id: projeto.id,
      codigo: "T-#{100 + unico()}",
      titulo: "uma tarefa"
    }

    %Tarefa{}
    |> Tarefa.changeset(Map.merge(padrao, atributos))
    |> Repo.insert!()
    |> Repo.preload([:areas, :projeto])
  end

  defp area!(tarefa, caminho) do
    %Area{}
    |> Area.changeset(%{tarefa_id: tarefa.id, caminho: caminho})
    |> Repo.insert!()

    Repo.preload(tarefa, :areas, force: true)
  end

  defp escrever(raiz, caminho, conteudo) do
    absoluto = Path.join(raiz, caminho)
    File.mkdir_p!(Path.dirname(absoluto))
    File.write!(absoluto, conteudo)
  end

  defp log(raiz) do
    {:ok, %{stdout: saida}} = git(raiz, ["log", "-1", "--pretty=%s"])
    String.trim(saida)
  end

  defp contar(esquema, tarefa_id) do
    Repo.aggregate(from(c in esquema, where: c.tarefa_id == ^tarefa_id), :count)
  end

  describe "tarefa orfa volta ao estado anterior, com motivo" do
    test "em_teste sem despacho vivo volta para em_execucao, gasta tentativa e grava o ciclo" do
      projeto = projeto!()
      tarefa = tarefa!(projeto, %{status: :em_teste, tentativas: 1})

      relatorio = Recuperacao.sanear(vivos: [], tarefas: [tarefa])

      assert [achado] = relatorio.orfas
      assert achado.tarefa_id == tarefa.id
      assert achado.status_encontrado == :em_teste
      assert achado.status_apos == :em_execucao
      assert achado.motivo =~ "em_execucao"

      recarregada = Repo.get!(Tarefa, tarefa.id)
      assert recarregada.status == :em_execucao
      assert recarregada.tentativas == 2

      ciclo = Repo.one!(from(c in Ciclo, where: c.tarefa_id == ^tarefa.id))
      assert ciclo.papel == "verificador"
      assert ciclo.desfecho == "recuperacao"
    end

    test "em_revisao sem despacho vivo volta para em_execucao, com papel revisor" do
      projeto = projeto!()
      tarefa = tarefa!(projeto, %{status: :em_revisao, tentativas: 1})

      relatorio = Recuperacao.sanear(vivos: [], tarefas: [tarefa])

      assert [achado] = relatorio.orfas
      assert achado.status_apos == :em_execucao
      assert Repo.get!(Tarefa, tarefa.id).status == :em_execucao

      ciclo = Repo.one!(from(c in Ciclo, where: c.tarefa_id == ^tarefa.id))
      assert ciclo.papel == "revisor"
    end

    test "em_execucao sem despacho vivo fica em em_execucao — ja e despachavel, sem transicao" do
      projeto = projeto!()
      tarefa = tarefa!(projeto, %{status: :em_execucao, tentativas: 1})

      relatorio = Recuperacao.sanear(vivos: [], tarefas: [tarefa])

      assert [achado] = relatorio.orfas
      assert achado.status_encontrado == :em_execucao
      assert achado.status_apos == :em_execucao

      recarregada = Repo.get!(Tarefa, tarefa.id)
      assert recarregada.status == :em_execucao
      assert recarregada.tentativas == 1
      assert contar(Ciclo, tarefa.id) == 0
    end

    test "tarefa com despacho vivo nao e tratada como orfa" do
      projeto = projeto!()
      tarefa = tarefa!(projeto, %{status: :em_teste, tentativas: 1})

      relatorio = Recuperacao.sanear(vivos: [tarefa.id], tarefas: [tarefa])

      assert relatorio.orfas == []
      assert Repo.get!(Tarefa, tarefa.id).status == :em_teste
    end

    test "tarefas fora dos estados transitorios nunca aparecem no relatorio" do
      projeto = projeto!()

      candidatas =
        for status <- [:backlog, :pronta, :concluida], do: tarefa!(projeto, %{status: status})

      relatorio = Recuperacao.sanear(vivos: [], tarefas: candidatas)

      assert relatorio.orfas == []
      assert relatorio.nada_a_fazer? == true
    end

    test "o Registry real e a fonte padrao de :vivos, quando a opcao nao e passada" do
      projeto = projeto!()
      tarefa = tarefa!(projeto, %{status: :em_teste, tentativas: 1})

      {:ok, pid} =
        Fabrica.Agente.Supervisor.iniciar(tarefa.id, :verificador, fn ->
          receive do
            :termine -> :ok
          end
        end)

      relatorio = Recuperacao.sanear(tarefas: [tarefa])

      refute Enum.any?(relatorio.orfas, &(&1.tarefa_id == tarefa.id))
      assert Repo.get!(Tarefa, tarefa.id).status == :em_teste

      send(pid, :termine)
    end
  end

  describe "trabalho nao commitado nas areas de uma tarefa orfa" do
    test "e recuperado num commit marcado como recuperacao" do
      raiz = raiz_git()
      projeto = projeto!(%{caminho: raiz})
      tarefa = tarefa!(projeto, %{status: :em_execucao, tentativas: 1})
      tarefa = area!(tarefa, "lib/parcial.ex")

      escrever(raiz, "lib/parcial.ex", "defmodule Parcial, do: :ok")

      relatorio = Recuperacao.sanear(vivos: [], tarefas: [tarefa])

      assert [achado] = relatorio.orfas
      assert achado.commit != nil
      assert log(raiz) =~ "recuperacao"
      assert log(raiz) =~ tarefa.codigo

      assert {:ok, %{codigo: 0, stdout: status}} = git(raiz, ["status", "--porcelain"])
      assert String.trim(status) == ""
    end

    test "nao ha nada a recuperar quando as areas ja estao limpas" do
      raiz = raiz_git()
      projeto = projeto!(%{caminho: raiz})
      tarefa = tarefa!(projeto, %{status: :em_execucao, tentativas: 1})
      tarefa = area!(tarefa, "lib/parcial.ex")

      escrever(raiz, "lib/parcial.ex", "defmodule Parcial, do: :ok")
      {:ok, _} = git(raiz, ["add", "--", "lib/parcial.ex"])
      {:ok, _} = git(raiz, ["commit", "-m", "ja commitado antes da queda"])

      relatorio = Recuperacao.sanear(vivos: [], tarefas: [tarefa])

      assert [achado] = relatorio.orfas
      assert achado.commit == nil
      assert log(raiz) == "ja commitado antes da queda"
    end

    test "tarefa sem areas declaradas nao tenta commitar nada" do
      raiz = raiz_git()
      projeto = projeto!(%{caminho: raiz})
      tarefa = tarefa!(projeto, %{status: :em_execucao, tentativas: 1})

      relatorio = Recuperacao.sanear(vivos: [], tarefas: [tarefa])

      assert [achado] = relatorio.orfas
      assert achado.commit == nil
    end
  end

  describe "o saneamento reporta sempre" do
    test "nenhuma tarefa orfa ainda produz um relatorio explicito de nada a fazer" do
      assert %{orfas: [], nada_a_fazer?: true} = Recuperacao.sanear(vivos: [], tarefas: [])
    end

    test "havendo orfas, nada_a_fazer? e falso e cada uma aparece no relatorio" do
      projeto = projeto!()
      tarefa = tarefa!(projeto, %{status: :em_teste, tentativas: 1})

      relatorio = Recuperacao.sanear(vivos: [], tarefas: [tarefa])

      assert relatorio.nada_a_fazer? == false
      assert relatorio.orfas != []
    end
  end
end
