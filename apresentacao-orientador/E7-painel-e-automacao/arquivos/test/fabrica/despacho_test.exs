defmodule Fabrica.DespachoTest do
  @moduledoc """
  Trava a T-066: a mensagem inicial de um agente monta as quatro faixas do
  `Fabrica.Prompt.Prefixo`, na ordem certa, a partir de uma tarefa real e de um papel.

  E o primeiro teste desta fabrica que chama `Ferramentas.Catalogo`, `Equipe.Resolucao`,
  `Indice.Mapa` e `Prompt.Prefixo` JUNTOS — as quatro pecas que ja existiam prontas e
  testadas isoladamente, mas que ninguem tinha chamado para uma tarefa de verdade (D-006).
  """

  use Fabrica.DataCase, async: true

  import ExUnit.CaptureLog

  alias Fabrica.Despacho
  alias Fabrica.Projetos.Especialista
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Tarefas.Area
  alias Fabrica.Tarefas.Criterio
  alias Fabrica.Tarefas.Tarefa

  @preloads [:projeto, :especialista, :areas, :criterios]

  setup do
    raiz = Path.join(System.tmp_dir!(), "despacho-#{System.unique_integer([:positive])}")
    File.mkdir_p!(Path.join(raiz, "lib"))

    File.write!(Path.join(raiz, "lib/exemplo.ex"), """
    defmodule Exemplo do
      @moduledoc "Um exemplo do projeto que o agente vai construir."
      @doc "Soma dois numeros."
      def somar(a, b), do: a + b
    end
    """)

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

  defp tarefa!(projeto, atributos \\ %{}) do
    padrao = %{
      projeto_id: projeto.id,
      codigo: "T-#{100 + System.unique_integer([:positive])}",
      titulo: "construir a funcionalidade X",
      objetivo: "existir o endpoint Y",
      contexto: "o projeto ja tem o schema Z pronto"
    }

    %Tarefa{}
    |> Tarefa.changeset(Map.merge(padrao, atributos))
    |> Repo.insert!()
  end

  defp recarregar(tarefa), do: tarefa |> Repo.reload!() |> Repo.preload(@preloads)

  defp area!(tarefa, caminho) do
    %Area{} |> Area.changeset(%{tarefa_id: tarefa.id, caminho: caminho}) |> Repo.insert!()
  end

  defp criterio!(tarefa, atributos) do
    %Criterio{}
    |> Criterio.changeset(Map.put(atributos, :tarefa_id, tarefa.id))
    |> Repo.insert!()
  end

  defp especialista!(projeto, atributos) do
    %Especialista{}
    |> Especialista.changeset(Map.put(atributos, :projeto_id, projeto.id))
    |> Repo.insert!()
  end

  # Os prefixos montados em teste sao curtos de proposito (a tarefa e minuscula), e por
  # isso disparam o aviso de minimo cacheavel do `Fabrica.Prompt.Prefixo` — esperado, e nao
  # o assunto destes testes. Capturar mantem a saida da suite legivel sem desligar o aviso.
  defp montar!(tarefa, papel, texto_do_papel, opcoes \\ []) do
    {resultado, _registro} =
      ExUnit.CaptureLog.with_log(fn -> Despacho.montar(tarefa, papel, texto_do_papel, opcoes) end)

    resultado
  end

  describe "as quatro faixas, na ordem do Prompt.Bloco" do
    test "ferramentas, doutrina, indice e tarefa — tarefa por ultimo e sem ponto de cache", %{
      projeto: projeto
    } do
      tarefa = tarefa!(projeto) |> recarregar()

      assert {:ok, prefixo} = montar!(tarefa, :construtor, "voce implementa a tarefa")

      assert Enum.map(prefixo.blocos, & &1.especie) == [:ferramentas, :doutrina, :indice, :tarefa]

      marca = Map.new(prefixo.blocos, &{&1.especie, &1.ponto_de_cache})
      assert marca[:ferramentas]
      assert marca[:doutrina]
      assert marca[:indice]
      refute marca[:tarefa]
    end

    test "a faixa de ferramentas vem do Catalogo do papel", %{projeto: projeto} do
      tarefa = tarefa!(projeto) |> recarregar()

      assert {:ok, prefixo} = montar!(tarefa, :verificador, "voce verifica a tarefa")

      bloco = Enum.find(prefixo.blocos, &(&1.especie == :ferramentas))

      assert bloco.texto =~ "rodar"
      refute bloco.texto =~ "escrever", "verificador nao recebe ferramenta de escrita"
    end

    test "a faixa de doutrina carrega o texto_do_papel recebido como parametro", %{
      projeto: projeto
    } do
      tarefa = tarefa!(projeto) |> recarregar()

      assert {:ok, prefixo} =
               montar!(tarefa, :construtor, "DOUTRINA-DO-CONSTRUTOR")

      bloco = Enum.find(prefixo.blocos, &(&1.especie == :doutrina))
      assert bloco.texto =~ "DOUTRINA-DO-CONSTRUTOR"
      assert bloco.texto =~ "<seu-papel>"
    end

    test "a faixa de indice vem do indice do PROJETO da tarefa, nao desta fabrica-v2", %{
      projeto: projeto
    } do
      tarefa = tarefa!(projeto) |> recarregar()

      assert {:ok, prefixo} = montar!(tarefa, :construtor, "papel")

      bloco = Enum.find(prefixo.blocos, &(&1.especie == :indice))
      assert bloco.texto =~ "Exemplo"
      assert bloco.texto =~ "somar"
      refute bloco.texto =~ "Fabrica.Despacho", "nao e o indice desta fabrica-v2"
    end

    test "a faixa de tarefa carrega objetivo, contexto, areas e criterios", %{projeto: projeto} do
      tarefa = tarefa!(projeto)
      area!(tarefa, "lib/exemplo.ex")

      criterio!(tarefa, %{
        texto: "o endpoint responde 200",
        comando: "mix test test/exemplo_test.exs",
        grau: :executado
      })

      tarefa = recarregar(tarefa)

      assert {:ok, prefixo} = montar!(tarefa, :construtor, "papel")

      bloco = Enum.find(prefixo.blocos, &(&1.especie == :tarefa))

      assert bloco.texto =~ tarefa.codigo
      assert bloco.texto =~ "existir o endpoint Y"
      assert bloco.texto =~ "o projeto ja tem o schema Z pronto"
      assert bloco.texto =~ "lib/exemplo.ex"
      assert bloco.texto =~ "o endpoint responde 200"
      assert bloco.texto =~ "mix test test/exemplo_test.exs"
    end
  end

  describe "papel desconhecido — erro, nunca ferramentas vazias em silencio" do
    test "devolve {:erro, :papel_desconhecido}", %{projeto: projeto} do
      tarefa = tarefa!(projeto) |> recarregar()

      assert montar!(tarefa, :fantasma, "papel") == {:erro, :papel_desconhecido}
    end
  end

  describe "tarefa com especialista da equipe" do
    test "a doutrina inclui o bloco <especialista>", %{projeto: projeto} do
      especialista =
        especialista!(projeto, %{
          identificador: "banco",
          nome: "o do banco",
          prompt: "migracoes ficam em priv/repo"
        })

      tarefa = tarefa!(projeto, %{especialista_id: especialista.id}) |> recarregar()

      assert {:ok, prefixo} = montar!(tarefa, :construtor, "voce implementa a tarefa")

      bloco = Enum.find(prefixo.blocos, &(&1.especie == :doutrina))
      assert bloco.texto =~ "<especialista>"
      assert bloco.texto =~ "migracoes ficam em priv/repo"
    end

    test "sem especialista, so o bloco do papel", %{projeto: projeto} do
      tarefa = tarefa!(projeto) |> recarregar()

      assert {:ok, prefixo} = montar!(tarefa, :construtor, "voce implementa a tarefa")

      bloco = Enum.find(prefixo.blocos, &(&1.especie == :doutrina))
      refute bloco.texto =~ "<especialista>"
    end

    test "especialista inativo cai no generico e registra o defeito", %{projeto: projeto} do
      especialista =
        especialista!(projeto, %{identificador: "banco", nome: "b", prompt: "x"})

      Repo.update!(Ecto.Changeset.change(especialista, ativo: false))

      tarefa = tarefa!(projeto, %{especialista_id: especialista.id}) |> recarregar()

      registro =
        capture_log(fn ->
          assert {:ok, prefixo} = Despacho.montar(tarefa, :construtor, "papel")
          bloco = Enum.find(prefixo.blocos, &(&1.especie == :doutrina))
          refute bloco.texto =~ "<especialista>"
        end)

      assert registro =~ "especialista inexistente"
    end
  end
end
