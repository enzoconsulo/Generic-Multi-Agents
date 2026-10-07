defmodule FabricaWeb.QuadroLiveTest do
  use FabricaWeb.ConnCase

  import Phoenix.LiveViewTest

  alias Fabrica.Eventos
  alias Fabrica.Projetos.Especialista
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Repo
  alias Fabrica.Tarefas.Ciclo
  alias Fabrica.Tarefas.Consumo
  alias Fabrica.Tarefas.Despacho
  alias Fabrica.Tarefas.Tarefa

  defp projeto_fixture(atributos \\ %{}) do
    numero = System.unique_integer([:positive])

    base = %{nome: "Projeto #{numero}", caminho: "C:/projetos/p#{numero}"}

    %Projeto{}
    |> Projeto.changeset(Map.merge(base, atributos))
    |> Repo.insert!()
  end

  defp especialista_fixture(projeto, atributos \\ %{}) do
    numero = System.unique_integer([:positive])

    base = %{
      projeto_id: projeto.id,
      identificador: "construtor-#{numero}",
      nome: "Construtora #{numero}",
      prompt: "faca o trabalho"
    }

    %Especialista{}
    |> Especialista.changeset(Map.merge(base, atributos))
    |> Repo.insert!()
  end

  defp tarefa_fixture(projeto, atributos) do
    numero = System.unique_integer([:positive])

    base = %{
      projeto_id: projeto.id,
      codigo: "T-#{String.pad_leading(to_string(numero), 3, "0")}",
      titulo: "Tarefa #{numero}",
      status: :backlog,
      tentativas: 0
    }

    %Tarefa{}
    |> Tarefa.changeset(Map.merge(base, atributos))
    |> Repo.insert!()
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
      Consumo.changeset(%Consumo{}, %{
        despacho_id: despacho.id,
        volta: 1,
        custo_usd: custo_usd
      })
    )

    tarefa
  end

  describe "sem projeto selecionado" do
    test "mostra o estado vazio, legivel, e lista os projetos existentes", %{conn: conn} do
      projeto = projeto_fixture()

      {:ok, view, _html} = live(conn, ~p"/quadro")

      assert has_element?(view, "#quadro-vazio")
      assert render(view) =~ projeto.nome
    end
  end

  describe "projeto inexistente" do
    test "mostra o estado de erro, legivel", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/quadro?projeto_id=999999")

      assert has_element?(view, "#quadro-erro")
    end

    test "id malformado (nao numerico) tambem mostra o estado de erro, sem derrubar a tela",
         %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/quadro?projeto_id=abc")

      assert has_element?(view, "#quadro-erro")
    end
  end

  describe "com projeto selecionado" do
    test "renderiza as tarefas agrupadas pelos seis estados mais bloqueada, com contagem",
         %{conn: conn} do
      projeto = projeto_fixture()
      especialista = especialista_fixture(projeto)

      tarefa_fixture(projeto, %{status: :backlog})
      tarefa_fixture(projeto, %{status: :pronta})

      tarefa_em_execucao =
        tarefa_fixture(projeto, %{
          status: :em_execucao,
          tentativas: 2,
          especialista_id: especialista.id
        })

      tarefa_fixture(projeto, %{status: :em_teste})
      tarefa_fixture(projeto, %{status: :em_revisao})
      tarefa_fixture(projeto, %{status: :concluida})
      tarefa_fixture(projeto, %{status: :bloqueada})

      {:ok, view, _html} = live(conn, ~p"/quadro?projeto_id=#{projeto.id}")

      html = render_async(view)

      for estado <- Tarefa.estados() ++ [:bloqueada] do
        assert has_element?(view, "#coluna-#{estado}")
      end

      assert has_element?(view, "#coluna-backlog .badge", "1")
      assert has_element?(view, "#coluna-em_execucao .badge", "1")
      assert has_element?(view, "#coluna-bloqueada .badge", "1")

      assert html =~ tarefa_em_execucao.codigo
      assert html =~ especialista.nome
      assert html =~ "2"
    end

    test "mostra o custo acumulado da tarefa, somado das voltas", %{conn: conn} do
      projeto = projeto_fixture()
      tarefa = tarefa_fixture(projeto, %{status: :em_execucao})
      gastar(tarefa, Decimal.new("0.42"))

      {:ok, view, _html} = live(conn, ~p"/quadro?projeto_id=#{projeto.id}")

      assert render_async(view) =~ "0.42"
    end

    test "uma transicao emitida no barramento atualiza a tela sem recarregar", %{conn: conn} do
      projeto = projeto_fixture()
      tarefa = tarefa_fixture(projeto, %{status: :backlog})

      {:ok, view, _html} = live(conn, ~p"/quadro?projeto_id=#{projeto.id}")

      render_async(view)

      assert has_element?(view, "#coluna-backlog .badge", "1")
      assert has_element?(view, "#coluna-pronta .badge", "0")

      tarefa
      |> Tarefa.changeset(%{status: :pronta})
      |> Repo.update!()

      Eventos.tarefa_transicao(%{tarefa_id: tarefa.id, de: :backlog, para: :pronta})

      assert has_element?(view, "#coluna-backlog .badge", "0")
      assert has_element?(view, "#coluna-pronta .badge", "1")
    end
  end
end
