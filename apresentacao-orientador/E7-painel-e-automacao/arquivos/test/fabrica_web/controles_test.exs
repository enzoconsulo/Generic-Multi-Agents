defmodule FabricaWeb.Componentes.ControlesTest do
  @moduledoc """
  Os quatro criterios da T-053: Parar mata o processo e devolve a tarefa a fila com motivo
  `:cortado_pelo_operador`; o corte NAO conta ciclo; Retomar reenfileira commitando trabalho
  parcial antes; e a confirmacao mostra o gasto acumulado antes de cortar.

  `FabricaWeb.Componentes.Controles` e um `Phoenix.LiveComponent` com eventos proprios
  (`phx-target={@myself}`) — testado isolado via `live_isolated/3` sobre um host minimo
  definido aqui, o padrao recomendado para componente que nao vive atras de rota nenhuma.
  """

  use FabricaWeb.ConnCase

  import Ecto.Query, only: [from: 2]
  import Phoenix.LiveViewTest

  alias Fabrica.Agente.Supervisor, as: AgenteSupervisor
  alias Fabrica.Eventos
  alias Fabrica.Ferramentas.Comando
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Repo
  alias Fabrica.Tarefas.Area
  alias Fabrica.Tarefas.Ciclo
  alias Fabrica.Tarefas.Consumo
  alias Fabrica.Tarefas.Despacho
  alias Fabrica.Tarefas.Tarefa

  @moduletag :capture_log

  defmodule ProvaLive do
    @moduledoc false
    use FabricaWeb, :live_view

    @impl true
    def mount(_params, %{"tarefa_id" => tarefa_id}, socket) do
      {:ok, assign(socket, tarefa_id: tarefa_id)}
    end

    @impl true
    def render(assigns) do
      ~H"""
      <.live_component module={FabricaWeb.Componentes.Controles} id="controles" tarefa_id={@tarefa_id} />
      """
    end
  end

  defp unico, do: System.unique_integer([:positive])

  defp raiz_git do
    raiz = Path.join([File.cwd!(), "_build", "test", "tmp", "controles-#{unico()}"])

    File.mkdir_p!(raiz)
    {:ok, _} = git(raiz, ["init"])
    {:ok, _} = git(raiz, ["config", "user.email", "fabrica@teste.local"])
    {:ok, _} = git(raiz, ["config", "user.name", "Fabrica de Teste"])

    on_exit(fn -> File.rm_rf(raiz) end)
    raiz
  end

  defp git(raiz, argumentos), do: Comando.rodar(raiz, "git", argumentos)

  defp projeto_fixture(atributos \\ %{}) do
    padrao = %{nome: "projeto-#{unico()}", caminho: "C:/tmp/sem-git-#{unico()}"}

    %Projeto{}
    |> Projeto.changeset(Map.merge(padrao, atributos))
    |> Repo.insert!()
  end

  defp tarefa_fixture(projeto, atributos \\ %{}) do
    padrao = %{
      projeto_id: projeto.id,
      codigo: "T-#{100 + unico()}",
      titulo: "tarefa de teste",
      status: :em_execucao,
      tentativas: 1
    }

    %Tarefa{}
    |> Tarefa.changeset(Map.merge(padrao, atributos))
    |> Repo.insert!()
  end

  defp area_fixture(tarefa, caminho) do
    %Area{}
    |> Area.changeset(%{tarefa_id: tarefa.id, caminho: caminho})
    |> Repo.insert!()

    tarefa
  end

  defp gastar(tarefa, custo_usd) do
    ciclo =
      Repo.insert!(
        Ciclo.changeset(%Ciclo{}, %{tarefa_id: tarefa.id, numero: 1, papel: "construtor"})
      )

    despacho =
      Repo.insert!(
        Despacho.changeset(%Despacho{}, %{
          ciclo_id: ciclo.id,
          operario: "claude_cli",
          modelo: "sonnet"
        })
      )

    Repo.insert!(
      Consumo.changeset(%Consumo{}, %{despacho_id: despacho.id, volta: 1, custo_usd: custo_usd})
    )

    tarefa
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

  defp montar(conn, tarefa) do
    live_isolated(conn, ProvaLive, session: %{"tarefa_id" => tarefa.id})
  end

  # Sobe um agente que so termina quando alguem manda `:termine` — o bastante para aparecer
  # em `Agente.Supervisor.listar/0` e ser cortado de proposito pelo teste.
  defp preso_ate_ordem do
    fn ->
      receive do
        :termine -> :ok
      end
    end
  end

  describe "Parar" do
    test "mostra o gasto acumulado antes de cortar", %{conn: conn} do
      projeto = projeto_fixture()
      tarefa = tarefa_fixture(projeto)
      gastar(tarefa, Decimal.new("1.2345"))

      {:ok, pid} = AgenteSupervisor.iniciar(tarefa.id, :construtor, preso_ate_ordem())
      {:ok, view, _html} = montar(conn, tarefa)

      view |> element("#controles-parar-#{tarefa.id}") |> render_click()

      assert has_element?(view, "#controles-gasto-#{tarefa.id}")
      assert render(view) =~ "1.2345"

      send(pid, :termine)
    end

    test "encerra o processo e devolve a tarefa a fila com motivo :cortado_pelo_operador", %{
      conn: conn
    } do
      projeto = projeto_fixture()
      tarefa = tarefa_fixture(projeto)

      {:ok, pid} = AgenteSupervisor.iniciar(tarefa.id, :construtor, preso_ate_ordem())
      {:ok, view, _html} = montar(conn, tarefa)

      Eventos.assinar()
      referencia = Process.monitor(pid)

      view |> element("#controles-parar-#{tarefa.id}") |> render_click()
      view |> element("#controles-confirmar-parar-#{tarefa.id}") |> render_click()

      assert_receive {:DOWN, ^referencia, :process, ^pid, _motivo}

      assert_receive {:fabrica, [:fabrica, :tarefa, :transicao], _medidas, metadados}
      assert metadados.tarefa_id == tarefa.id
      assert metadados.motivo == :cortado_pelo_operador

      refute Enum.any?(AgenteSupervisor.listar(), &(&1.tarefa_id == tarefa.id))
      assert render(view) =~ "devolvida a fila"
    end

    test "nao conta ciclo — tentativas e a contagem de ciclos ficam intactas", %{conn: conn} do
      projeto = projeto_fixture()
      tarefa = tarefa_fixture(projeto, %{tentativas: 1})

      {:ok, pid} = AgenteSupervisor.iniciar(tarefa.id, :construtor, preso_ate_ordem())
      {:ok, view, _html} = montar(conn, tarefa)

      referencia = Process.monitor(pid)
      view |> element("#controles-parar-#{tarefa.id}") |> render_click()
      view |> element("#controles-confirmar-parar-#{tarefa.id}") |> render_click()
      assert_receive {:DOWN, ^referencia, :process, ^pid, _motivo}

      recarregada = Repo.get!(Tarefa, tarefa.id)
      assert recarregada.tentativas == 1
      assert recarregada.status == :em_execucao
      assert Repo.aggregate(from(c in Ciclo, where: c.tarefa_id == ^tarefa.id), :count) == 0
    end

    test "cancelar a confirmacao nao encerra nada", %{conn: conn} do
      projeto = projeto_fixture()
      tarefa = tarefa_fixture(projeto)

      {:ok, pid} = AgenteSupervisor.iniciar(tarefa.id, :construtor, preso_ate_ordem())
      {:ok, view, _html} = montar(conn, tarefa)

      view |> element("#controles-parar-#{tarefa.id}") |> render_click()
      view |> element("#controles-cancelar-parar-#{tarefa.id}") |> render_click()

      refute has_element?(view, "#controles-confirmar-#{tarefa.id}")
      assert has_element?(view, "#controles-parar-#{tarefa.id}")
      assert Enum.any?(AgenteSupervisor.listar(), &(&1.tarefa_id == tarefa.id))

      send(pid, :termine)
    end
  end

  describe "Retomar" do
    test "reenfileira e commita trabalho parcial antes, quando ha algum", %{conn: conn} do
      raiz = raiz_git()
      projeto = projeto_fixture(%{caminho: raiz})
      tarefa = tarefa_fixture(projeto, %{status: :em_teste, tentativas: 1})
      tarefa = area_fixture(tarefa, "lib/parcial.ex")

      escrever(raiz, "lib/parcial.ex", "defmodule Parcial, do: :ok")

      {:ok, view, _html} = montar(conn, tarefa)

      assert has_element?(view, "#controles-retomar-#{tarefa.id}")
      view |> element("#controles-retomar-#{tarefa.id}") |> render_click()

      recarregada = Repo.get!(Tarefa, tarefa.id)
      assert recarregada.status == :em_execucao

      assert log(raiz) =~ "recuperacao"
      assert {:ok, %{codigo: 0, stdout: status}} = git(raiz, ["status", "--porcelain"])
      assert String.trim(status) == ""

      assert render(view) =~ "commitado"
    end

    test "nao aparece enquanto o agente ainda esta em voo", %{conn: conn} do
      projeto = projeto_fixture()
      tarefa = tarefa_fixture(projeto)

      {:ok, pid} = AgenteSupervisor.iniciar(tarefa.id, :construtor, preso_ate_ordem())
      {:ok, view, _html} = montar(conn, tarefa)

      refute has_element?(view, "#controles-retomar-#{tarefa.id}")

      send(pid, :termine)
    end
  end
end
