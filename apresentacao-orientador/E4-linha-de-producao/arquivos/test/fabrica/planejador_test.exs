defmodule Fabrica.PlanejadorTest do
  @moduledoc """
  Trava a T-068: um pedido em linguagem natural vira um grafo de 8 a 12 tarefas, gravado no
  banco numa única transação — ou nada é gravado.
  """

  use Fabrica.DataCase, async: true

  import Ecto.Query, only: [from: 2]

  alias Fabrica.Operario.Falso
  alias Fabrica.Planejador
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Tarefas.Tarefa

  setup do
    raiz = Path.join(System.tmp_dir!(), "planejador-#{System.unique_integer([:positive])}")
    File.mkdir_p!(raiz)
    on_exit(fn -> File.rm_rf(raiz) end)

    projeto =
      %Projeto{}
      |> Projeto.changeset(%{
        nome: "projeto-#{System.unique_integer([:positive])}",
        caminho: raiz
      })
      |> Repo.insert!()

    %{projeto: projeto}
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

  defp bloco_json(mapa) do
    %{tipo: :texto, texto: "Segue o plano:\n\n```json\n#{Jason.encode!(mapa)}\n```\n"}
  end

  defp roteiro!(mapa_ou_texto) do
    blocos =
      case mapa_ou_texto do
        texto when is_binary(texto) -> [%{tipo: :texto, texto: texto}]
        mapa -> [bloco_json(mapa)]
      end

    {:ok, agulha} = Falso.iniciar(roteiro: [Falso.resposta(blocos: blocos)])
    agulha
  end

  defp contar_tarefas(projeto) do
    Repo.aggregate(from(t in Tarefa, where: t.projeto_id == ^projeto.id), :count)
  end

  describe "plano valido" do
    test "grava 8 a 12 tarefas numa unica transacao", %{projeto: projeto} do
      agulha = roteiro!(plano_valido(9))

      assert {:ok, %{projeto: ^projeto, tarefas: tarefas}} =
               Planejador.planejar("construir o modulo X", projeto, agulha: agulha)

      assert length(tarefas) == 9
      assert contar_tarefas(projeto) == 9
      assert Enum.all?(tarefas, &(&1.projeto_id == projeto.id))
      assert Enum.all?(tarefas, &String.match?(&1.codigo, ~r/^T-\d{3,}$/))
    end

    test "cada tarefa carrega areas e criterios gravados", %{projeto: projeto} do
      agulha = roteiro!(plano_valido(8))

      assert {:ok, %{tarefas: tarefas}} =
               Planejador.planejar("construir o modulo Y", projeto, agulha: agulha)

      Enum.each(tarefas, fn tarefa ->
        tarefa = Repo.preload(tarefa, [:areas, :criterios])
        assert tarefa.areas != []
        assert tarefa.criterios != []
        assert Enum.all?(tarefa.areas, &(not String.ends_with?(&1.caminho, "/")))
      end)
    end

    test "dependencias do JSON viram linhas de Fabrica.Tarefas.Dependencia", %{projeto: projeto} do
      tarefas =
        Enum.map(1..8, fn
          1 -> tarefa_json(1, dependencias: [2])
          id -> tarefa_json(id)
        end)

      agulha = roteiro!(%{"tarefas" => tarefas})

      assert {:ok, %{tarefas: gravadas}} =
               Planejador.planejar("construir o modulo Z", projeto, agulha: agulha)

      tarefa_1 = gravadas |> List.first() |> Repo.preload(:dependencias)
      assert length(tarefa_1.dependencias) == 1
    end

    test "codigos gerados continuam a numeracao existente do projeto", %{projeto: projeto} do
      %Tarefa{}
      |> Tarefa.changeset(%{
        projeto_id: projeto.id,
        codigo: "T-005",
        titulo: "tarefa anterior"
      })
      |> Repo.insert!()

      agulha = roteiro!(plano_valido(8))

      assert {:ok, %{tarefas: tarefas}} =
               Planejador.planejar("continuar o projeto", projeto, agulha: agulha)

      codigos = Enum.map(tarefas, & &1.codigo) |> Enum.sort()
      assert codigos == Enum.map(6..13, &"T-#{String.pad_leading(to_string(&1), 3, "0")}")
    end
  end

  describe "resposta que nao fecha em JSON valido" do
    test "sem bloco de codigo json — erro, nada gravado", %{projeto: projeto} do
      agulha = roteiro!("desculpe, nao consigo planejar isto sem mais informacao.")

      assert {:erro, _motivo} = Planejador.planejar("pedido vago", projeto, agulha: agulha)
      assert contar_tarefas(projeto) == 0
    end

    test "JSON malformado dentro do bloco — erro, nada gravado", %{projeto: projeto} do
      agulha = roteiro!("```json\n{invalido\n```")

      assert {:erro, _motivo} = Planejador.planejar("pedido", projeto, agulha: agulha)
      assert contar_tarefas(projeto) == 0
    end

    test "erro do operario propaga sem gravar nada", %{projeto: projeto} do
      {:ok, agulha} = Falso.iniciar(roteiro: [])

      assert {:erro, _motivo} = Planejador.planejar("pedido", projeto, agulha: agulha)
      assert contar_tarefas(projeto) == 0
    end
  end

  describe "plano invalido — nenhuma linha parcial no banco" do
    test "menos de 8 tarefas e recusado", %{projeto: projeto} do
      agulha = roteiro!(plano_valido(3))

      assert {:erro, _motivo} = Planejador.planejar("pedido pequeno", projeto, agulha: agulha)
      assert contar_tarefas(projeto) == 0
    end

    test "mais de 12 tarefas e recusado", %{projeto: projeto} do
      agulha = roteiro!(plano_valido(13))

      assert {:erro, _motivo} = Planejador.planejar("pedido grande", projeto, agulha: agulha)
      assert contar_tarefas(projeto) == 0
    end

    test "area terminando em barra (pasta) e recusada", %{projeto: projeto} do
      tarefas =
        Enum.map(1..8, fn
          1 -> tarefa_json(1, areas: ["lib/pasta/"])
          id -> tarefa_json(id)
        end)

      agulha = roteiro!(%{"tarefas" => tarefas})

      assert {:erro, _motivo} = Planejador.planejar("pedido", projeto, agulha: agulha)
      assert contar_tarefas(projeto) == 0
    end

    test "dependencia com ciclo e recusada", %{projeto: projeto} do
      tarefas =
        Enum.map(1..8, fn
          1 -> tarefa_json(1, dependencias: [2])
          2 -> tarefa_json(2, dependencias: [1])
          id -> tarefa_json(id)
        end)

      agulha = roteiro!(%{"tarefas" => tarefas})

      assert {:erro, motivo} = Planejador.planejar("pedido", projeto, agulha: agulha)
      assert motivo |> inspect() =~ "ciclo"
      assert contar_tarefas(projeto) == 0
    end

    test "dependencia para id inexistente e recusada", %{projeto: projeto} do
      tarefas =
        Enum.map(1..8, fn
          1 -> tarefa_json(1, dependencias: [99])
          id -> tarefa_json(id)
        end)

      agulha = roteiro!(%{"tarefas" => tarefas})

      assert {:erro, _motivo} = Planejador.planejar("pedido", projeto, agulha: agulha)
      assert contar_tarefas(projeto) == 0
    end
  end

  describe "doutrina do planejador" do
    test "cita o formato exato de resposta esperado" do
      texto =
        [:code.priv_dir(:fabrica), "doutrina", "planejador.md"]
        |> Path.join()
        |> File.read!()

      assert texto =~ "```json"
      assert texto =~ "dependencias"
      assert texto =~ "registrar_resultado"
    end
  end
end
