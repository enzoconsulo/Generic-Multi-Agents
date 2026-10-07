defmodule Fabrica.PlanejarTest do
  @moduledoc """
  Trava a T-069: `mix fabrica.planejar` e a UNICA intervencao humana que o marco da v1.0
  exige — cria/reaproveita o projeto, chama `Fabrica.Planejador.planejar/2` (T-068) e
  promove para `pronta` toda tarefa recem-criada sem dependencia pendente.
  """

  use Fabrica.DataCase, async: true

  alias Fabrica.Operario.Falso
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Repo
  alias Fabrica.Tarefas.Tarefa
  alias Mix.Tasks.Fabrica.Planejar

  setup do
    raiz = Path.join(System.tmp_dir!(), "fabrica-planejar-#{System.unique_integer([:positive])}")
    on_exit(fn -> File.rm_rf(raiz) end)

    %{raiz: raiz, nome: "projeto-#{System.unique_integer([:positive])}"}
  end

  defp tarefa_json(id, opcoes \\ []) do
    %{
      "id" => id,
      "titulo" => Keyword.get(opcoes, :titulo, "tarefa #{id}"),
      "objetivo" => Keyword.get(opcoes, :objetivo, "existir a parte #{id} do sistema"),
      "contexto" => Keyword.get(opcoes, :contexto, "depende do que ja existe"),
      "areas" => Keyword.get(opcoes, :areas, ["lib/exemplo_#{id}.ex"]),
      "criterios" =>
        Keyword.get(opcoes, :criterios, [
          %{
            "texto" => "a parte #{id} funciona",
            "comando" => "mix test test/exemplo_#{id}_test.exs"
          }
        ]),
      "dependencias" => Keyword.get(opcoes, :dependencias, [])
    }
  end

  defp plano_valido(quantidade) do
    tarefas = Enum.map(1..quantidade, &tarefa_json/1)
    %{"tarefas" => tarefas}
  end

  defp roteiro!(mapa) do
    texto = "Segue o plano:\n\n```json\n#{Jason.encode!(mapa)}\n```\n"

    {:ok, agulha} =
      Falso.iniciar(roteiro: [Falso.resposta(blocos: [%{tipo: :texto, texto: texto}])])

    agulha
  end

  describe "executar/3 — plano valido" do
    test "cria o projeto e grava as tarefas", %{raiz: raiz, nome: nome} do
      agulha = roteiro!(plano_valido(8))

      assert {:ok, relatorio} =
               Planejar.executar("construir o modulo X", nome, agulha: agulha, caminho: raiz)

      assert relatorio.tarefas == 8
      assert relatorio.projeto.nome == nome
      assert File.dir?(raiz)
      assert Repo.get_by(Projeto, nome: nome)
    end

    test "ao menos uma tarefa sem dependencias fica pronta", %{raiz: raiz, nome: nome} do
      tarefas =
        Enum.map(1..8, fn
          1 -> tarefa_json(1, dependencias: [2])
          id -> tarefa_json(id)
        end)

      agulha = roteiro!(%{"tarefas" => tarefas})

      assert {:ok, relatorio} =
               Planejar.executar("construir o modulo Y", nome, agulha: agulha, caminho: raiz)

      assert relatorio.prontas > 0

      projeto = Repo.get_by(Projeto, nome: nome)

      prontas =
        Tarefa
        |> Ecto.Query.where(projeto_id: ^projeto.id, status: :pronta)
        |> Repo.all()

      assert length(prontas) == relatorio.prontas
      assert prontas != []
    end

    test "tarefa com dependencia pendente nao fica pronta", %{raiz: raiz, nome: nome} do
      tarefas =
        Enum.map(1..8, fn
          1 -> tarefa_json(1, dependencias: [2])
          id -> tarefa_json(id)
        end)

      agulha = roteiro!(%{"tarefas" => tarefas})

      assert {:ok, relatorio} =
               Planejar.executar("construir o modulo W", nome, agulha: agulha, caminho: raiz)

      # 8 tarefas, uma delas (a #1) depende de outra ainda em backlog: no maximo 7 prontas.
      assert relatorio.prontas < relatorio.tarefas
    end

    test "projeto ja existente e reaproveitado, sem duplicar", %{raiz: raiz, nome: nome} do
      File.mkdir_p!(raiz)

      projeto =
        %Projeto{} |> Projeto.changeset(%{nome: nome, caminho: raiz}) |> Repo.insert!()

      agulha = roteiro!(plano_valido(8))

      assert {:ok, relatorio} =
               Planejar.executar("continuar o projeto", nome, agulha: agulha, caminho: raiz)

      assert relatorio.projeto.id == projeto.id
      assert Repo.aggregate(Ecto.Query.where(Projeto, nome: ^nome), :count) == 1
    end
  end

  describe "executar/3 — plano invalido" do
    test "erro do planejador propaga, sem criar tarefas", %{raiz: raiz, nome: nome} do
      agulha = roteiro!(plano_valido(3))

      assert {:erro, _motivo} =
               Planejar.executar("pedido pequeno", nome, agulha: agulha, caminho: raiz)

      projeto = Repo.get_by(Projeto, nome: nome)
      assert Repo.aggregate(Ecto.Query.where(Tarefa, projeto_id: ^projeto.id), :count) == 0
    end
  end

  describe "run/1 — uso pela CLI" do
    test "sem --projeto, recusa com mensagem clara (Mix.Error), sem estourar" do
      assert_raise Mix.Error, ~r/--projeto/, fn ->
        Planejar.run(["pedido de teste"])
      end
    end

    test "sem o pedido, recusa com mensagem clara" do
      assert_raise Mix.Error, ~r/uso:/, fn ->
        Planejar.run(["--projeto", "algum-nome"])
      end
    end
  end
end
