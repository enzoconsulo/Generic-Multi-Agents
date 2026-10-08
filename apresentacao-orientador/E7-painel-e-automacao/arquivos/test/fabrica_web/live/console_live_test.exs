defmodule FabricaWeb.ConsoleLiveTest do
  @moduledoc """
  Os tres criterios verificaveis da T-052: a lista "em voo" vem do `Registry` e some quando
  o agente termina, o custo aparece POR TAREFA com a reparticao de cache, e a parede de cota
  aparece (e some) por evento — sem depender de `Fabrica.Cota` estar de pe.
  """

  use FabricaWeb.ConnCase

  import Phoenix.LiveViewTest

  alias Fabrica.Agente.Supervisor, as: AgenteSupervisor
  alias Fabrica.Eventos
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Repo
  alias Fabrica.Tarefas.Ciclo
  alias Fabrica.Tarefas.Consumo
  alias Fabrica.Tarefas.Despacho
  alias Fabrica.Tarefas.Tarefa

  defp projeto_fixture do
    numero = System.unique_integer([:positive])

    %Projeto{}
    |> Projeto.changeset(%{nome: "Projeto #{numero}", caminho: "C:/projetos/p#{numero}"})
    |> Repo.insert!()
  end

  defp tarefa_fixture(projeto, atributos \\ %{}) do
    numero = System.unique_integer([:positive])

    base = %{
      projeto_id: projeto.id,
      codigo: "T-#{String.pad_leading(to_string(numero), 3, "0")}",
      titulo: "Tarefa #{numero}",
      status: :em_execucao,
      tentativas: 0
    }

    %Tarefa{}
    |> Tarefa.changeset(Map.merge(base, atributos))
    |> Repo.insert!()
  end

  defp gastar(tarefa, atributos) do
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

    base = %{despacho_id: despacho.id, volta: 1}

    Repo.insert!(Consumo.changeset(%Consumo{}, Map.merge(base, atributos)))

    tarefa
  end

  # Sobe um agente que so termina quando alguem manda `:termine_normal` — serve para
  # mante-lo vivo o bastante para aparecer em `listar/0` e depois desaparecer de proposito.
  defp esperar_por_ordem do
    fn ->
      receive do
        :termine_normal -> :ok
      end
    end
  end

  describe "em voo" do
    test "vem do Registry e some quando o agente termina", %{conn: conn} do
      projeto = projeto_fixture()
      tarefa = tarefa_fixture(projeto)

      {:ok, pid} = AgenteSupervisor.iniciar(tarefa.id, :construtor, esperar_por_ordem())

      {:ok, view, _html} = live(conn, ~p"/console")
      send(view.pid, :atualizar_em_voo)

      assert has_element?(view, "#agente-#{tarefa.id}")
      assert render(view) =~ tarefa.codigo

      referencia = Process.monitor(pid)
      send(pid, :termine_normal)
      assert_receive {:DOWN, ^referencia, :process, ^pid, :normal}

      send(view.pid, :atualizar_em_voo)

      refute has_element?(view, "#agente-#{tarefa.id}")
    end

    test "mostra o estado vazio quando nao ha agente algum para a tarefa", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/console")

      assert has_element?(view, "#em-voo-vazio")
    end
  end

  describe "custo por tarefa" do
    test "aparece por tarefa, com a reparticao escrita/leitura de cache visivel", %{conn: conn} do
      projeto = projeto_fixture()
      tarefa = tarefa_fixture(projeto)

      gastar(tarefa, %{
        tokens_entrada: 1000,
        tokens_cache_escrita: 321,
        tokens_cache_leitura: 4500,
        tokens_saida: 77,
        custo_usd: Decimal.new("0.1234")
      })

      {:ok, view, _html} = live(conn, ~p"/console")

      assert has_element?(view, "#custo-#{tarefa.id}")

      html = render(view)
      assert html =~ tarefa.codigo
      assert html =~ "321"
      assert html =~ "4500"
      assert html =~ "0.1234"
    end

    test "mostra o estado vazio quando nenhuma tarefa gastou nada", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/console")

      assert has_element?(view, "#custo-vazio")
    end
  end

  describe "parede de cota" do
    # O LiveView le o `Fabrica.Cota` GLOBAL no mount (`cota_agora/0`, sem nome injetavel) —
    # este teste nao bate a parede nele (usa `Eventos.cota_parede/cota_rearme` direto no
    # barramento), mas a primeira asserção, abaixo, reflete o estado AMBIENTE desse processo.
    # Rearma ANTES de montar para nao depender de outro teste ter deixado a parede batida
    # (T-102; memoria de sessao `parede-cota-vaza-cota-global-na-suite`).
    setup do
      if pid = Process.whereis(Fabrica.Cota) do
        if Fabrica.Cota.batida?(pid), do: :ok = Fabrica.Cota.rearmar(pid)
      end

      :ok
    end

    test "aparece com o horario de reabertura quando ativa, e some ao rearmar", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/console")

      refute has_element?(view, "#cota-parede")

      reabre_em = DateTime.add(DateTime.utc_now(), 3600, :second)
      Eventos.cota_parede(%{reabre_em: reabre_em})

      assert has_element?(view, "#cota-parede")
      assert render(view) =~ Calendar.strftime(reabre_em, "%H:%M")

      Eventos.cota_rearme()

      refute has_element?(view, "#cota-parede")
    end
  end

  describe "console do agente selecionado" do
    test "mostra a volta e a ferramenta chamada depois de selecionar o agente", %{conn: conn} do
      projeto = projeto_fixture()
      tarefa = tarefa_fixture(projeto)

      {:ok, pid} = AgenteSupervisor.iniciar(tarefa.id, :construtor, esperar_por_ordem())

      {:ok, view, _html} = live(conn, ~p"/console")
      send(view.pid, :atualizar_em_voo)

      assert has_element?(view, "#console-selecionar")

      view
      |> element("#agente-#{tarefa.id} button")
      |> render_click()

      refute has_element?(view, "#console-selecionar")
      assert has_element?(view, "#console-vazio")

      Eventos.despacho_volta(
        %{
          tokens_entrada: 10,
          tokens_cache_escrita: 2,
          tokens_cache_leitura: 100,
          tokens_saida: 5,
          custo_usd: 0.01
        },
        %{tarefa_id: tarefa.id, volta: 1, ferramenta: "Bash"}
      )

      html = render(view)
      refute html =~ "console-vazio"
      assert html =~ "volta 1"
      assert html =~ "Bash"

      send(pid, :termine_normal)
    end
  end
end
