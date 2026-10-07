defmodule Fabrica.Equipe.ResolucaoTest do
  @moduledoc """
  A equipe sob demanda: versionamento, resolucao e o bloco no despacho.

  O arquivo mistura de proposito dois niveis: `Resolucao` e pura e se testa com structs
  soltas; `Equipe` toca o banco, e e la que o indice unico parcial prova o versionamento.
  Separa-los em dois arquivos esconderia que o segundo existe para servir ao primeiro.
  """

  use Fabrica.DataCase, async: true

  alias Fabrica.Equipe
  alias Fabrica.Equipe.Resolucao
  alias Fabrica.Projetos.Especialista
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Tarefas.Tarefa

  setup do
    projeto =
      %Projeto{}
      |> Projeto.changeset(%{
        nome: "projeto-#{System.unique_integer([:positive])}",
        caminho: "C:/tmp/p"
      })
      |> Repo.insert!()

    %{projeto: projeto}
  end

  defp tarefa!(projeto, atributos) do
    padrao = %{
      projeto_id: projeto.id,
      codigo: "T-#{100 + System.unique_integer([:positive])}",
      titulo: "uma tarefa"
    }

    %Tarefa{}
    |> Tarefa.changeset(Map.merge(padrao, atributos))
    |> Repo.insert!()
  end

  # O aviso de especialista inexistente e desejado — mas em teste ele vira ruido de fundo, e
  # ruido de fundo e como um sinal para de ser lido. Quem VERIFICA o aviso e o teste
  # dedicado; os demais so o silenciam.
  defp capturando(funcao) do
    {resultado, _registro} = ExUnit.CaptureLog.with_log(funcao)
    resultado
  end

  defp especialista(identificador, prompt \\ "prompt de dominio") do
    %Especialista{
      id: System.unique_integer([:positive]),
      identificador: identificador,
      nome: "o #{identificador}",
      prompt: prompt,
      ativo: true
    }
  end

  describe "resolucao — o especialista SOMA, nunca substitui" do
    test "sem referencia, roda no papel generico e isso e normal" do
      assert %Resolucao{papel: :construtor, especialista: nil, motivo: :generico} =
               Resolucao.resolver(:construtor, nil, [especialista("frontend")])
    end

    test "com referencia que existe, devolve o especialista" do
      ativos = [especialista("frontend"), especialista("banco")]

      assert %Resolucao{motivo: :especialista, especialista: %{identificador: "banco"}} =
               Resolucao.resolver(:construtor, "banco", ativos)
    end

    test "o papel vem no resultado, sempre — inclusive quando ha especialista" do
      # A disciplina (commit, estado, confinamento) vem do PAPEL. Um caminho em que o
      # especialista tomasse o lugar dele obrigaria cada especialista a reescrever a
      # disciplina inteira, que e o defeito de ~70% de texto repetido medido na v1.
      for papel <- [:construtor, :verificador, :revisor] do
        assert %Resolucao{papel: ^papel} =
                 Resolucao.resolver(papel, "frontend", [especialista("frontend")])
      end
    end
  end

  describe "resolucao — especialista inexistente cai no generico E registra" do
    test "referencia que nao existe entre os ativos" do
      resolucao =
        capturando(fn ->
          Resolucao.resolver(:construtor, "fantasma", [especialista("frontend")])
        end)

      assert resolucao.especialista == nil
      assert resolucao.papel == :construtor
      assert resolucao.motivo == {:especialista_inexistente, {:identificador, "fantasma"}}
      assert Resolucao.defeituosa?(resolucao)
    end

    test "o defeito SAI EM LOG, e nao so no valor de retorno" do
      # E a metade "E REGISTRA" do criterio. Um defeito de planejamento que so aparece no
      # valor de retorno some quando ninguem inspeciona o retorno — e a fabrica roda sozinha.
      registro =
        ExUnit.CaptureLog.capture_log(fn ->
          Resolucao.resolver(:construtor, "fantasma", [])
        end)

      assert registro =~ "especialista inexistente"
      assert registro =~ "fantasma"
      assert registro =~ "defeito de planejamento"
    end

    test "a resolucao BEM-SUCEDIDA nao polui o log" do
      # Sem isto, o aviso viraria ruido de fundo e pararia de significar alguma coisa.
      registro =
        ExUnit.CaptureLog.capture_log(fn ->
          Resolucao.resolver(:construtor, "frontend", [especialista("frontend")])
          Resolucao.resolver(:construtor, nil, [])
        end)

      refute registro =~ "especialista inexistente"
    end

    test "lista de ativos vazia" do
      resolucao = capturando(fn -> Resolucao.resolver(:construtor, "frontend", []) end)

      assert {:especialista_inexistente, _} = resolucao.motivo
    end

    test "especialista INATIVO nao serve como resolucao" do
      # Se servisse, a versao velha voltaria a rodar pela porta dos fundos e o
      # versionamento nao significaria nada.
      inativo = %{especialista("frontend") | ativo: false}

      assert %Resolucao{motivo: {:especialista_inexistente, _}} =
               capturando(fn -> Resolucao.resolver(:construtor, "frontend", [inativo]) end)
    end

    test "resolucao sem defeito nao e marcada como defeituosa" do
      refute Resolucao.defeituosa?(Resolucao.resolver(:construtor, nil, []))

      refute Resolucao.defeituosa?(
               Resolucao.resolver(:construtor, "frontend", [especialista("frontend")])
             )
    end
  end

  describe "a doutrina montada — o bloco proprio, ao lado do papel" do
    test "sem especialista, so o bloco do papel" do
      texto =
        :construtor
        |> Resolucao.resolver(nil, [])
        |> Resolucao.doutrina("voce implementa uma tarefa de ponta a ponta")

      assert texto == "<seu-papel>\nvoce implementa uma tarefa de ponta a ponta\n</seu-papel>"
      refute texto =~ "<especialista>"
    end

    test "com especialista, os DOIS blocos, nesta ordem" do
      texto =
        :construtor
        |> Resolucao.resolver("banco", [especialista("banco", "migracoes ficam em priv/repo")])
        |> Resolucao.doutrina("voce implementa uma tarefa")

      assert texto =~ "<seu-papel>"
      assert texto =~ "<especialista>"
      assert texto =~ "Voce atua como o banco desta equipe."
      assert texto =~ "migracoes ficam em priv/repo"

      posicao = fn marca -> :binary.match(texto, marca) |> elem(0) end
      assert posicao.("<seu-papel>") < posicao.("<especialista>")
    end

    test "as marcas sao as mesmas da v1, para o transcript ser comparavel" do
      texto =
        :construtor
        |> Resolucao.resolver("banco", [especialista("banco")])
        |> Resolucao.doutrina("papel")

      assert texto =~ "</seu-papel>"
      assert texto =~ "</especialista>"
    end

    test "especialista inexistente produz APENAS o bloco do papel" do
      texto =
        capturando(fn ->
          :construtor
          |> Resolucao.resolver("fantasma", [])
          |> Resolucao.doutrina("papel")
        end)

      refute texto =~ "<especialista>"
    end
  end

  describe "versionamento — alterar o prompt cria linha nova" do
    test "a segunda versao entra e a primeira fica inativa", %{projeto: projeto} do
      {:ok, primeira} =
        Equipe.definir(projeto.id, %{
          identificador: "banco",
          nome: "o do banco",
          prompt: "primeira redacao"
        })

      {:ok, segunda} =
        Equipe.definir(projeto.id, %{
          identificador: "banco",
          nome: "o do banco",
          prompt: "segunda redacao"
        })

      assert segunda.id != primeira.id
      assert segunda.ativo
      refute Repo.get!(Especialista, primeira.id).ativo
    end

    test "o historico fica consultavel, da mais nova para a mais velha", %{projeto: projeto} do
      for redacao <- ["primeira", "segunda", "terceira"] do
        {:ok, _} =
          Equipe.definir(projeto.id, %{identificador: "banco", nome: "b", prompt: redacao})
      end

      prompts = projeto.id |> Equipe.historico("banco") |> Enum.map(& &1.prompt)

      assert prompts == ["terceira", "segunda", "primeira"]
    end

    test "so UMA versao fica ativa, e quem garante e o banco", %{projeto: projeto} do
      for redacao <- ["a", "b", "c"] do
        {:ok, _} =
          Equipe.definir(projeto.id, %{identificador: "banco", nome: "b", prompt: redacao})
      end

      ativas =
        Repo.all(
          from(e in Especialista,
            where: e.projeto_id == ^projeto.id and e.identificador == "banco" and e.ativo
          )
        )

      assert length(ativas) == 1

      # E a prova de que a regra e do ESQUEMA e nao deste modulo: inserir uma segunda ativa
      # por fora e recusado pelo indice parcial.
      assert {:error, changeset} =
               %Especialista{}
               |> Especialista.changeset(%{
                 projeto_id: projeto.id,
                 identificador: "banco",
                 nome: "b",
                 prompt: "por fora"
               })
               |> Repo.insert()

      # O erro cai em `:projeto_id`, e nao em `:identificador`: `unique_constraint/2` com
      # lista usa o PRIMEIRO campo como chave. Vale registrar porque a mensagem e sobre o
      # identificador e o campo e outro — quem for montar formulario a partir disto tropeca.
      assert %{projeto_id: [mensagem]} = errors_on(changeset)
      assert mensagem =~ "ja existe um especialista ativo"
    end

    test "especialistas diferentes nao se desativam", %{projeto: projeto} do
      {:ok, _} = Equipe.definir(projeto.id, %{identificador: "banco", nome: "b", prompt: "x"})
      {:ok, _} = Equipe.definir(projeto.id, %{identificador: "frontend", nome: "f", prompt: "y"})
      {:ok, _} = Equipe.definir(projeto.id, %{identificador: "banco", nome: "b", prompt: "z"})

      identificadores = projeto.id |> Equipe.ativos() |> Enum.map(& &1.identificador)
      assert identificadores == ["banco", "frontend"]
    end

    test "prompt sem os campos obrigatorios devolve erro, e nada e desativado", %{
      projeto: projeto
    } do
      {:ok, original} =
        Equipe.definir(projeto.id, %{identificador: "banco", nome: "b", prompt: "x"})

      assert {:erro, %Ecto.Changeset{}} =
               Equipe.definir(projeto.id, %{identificador: "banco", nome: "b"})

      # A desativacao e a insercao sao a MESMA transacao: falhou a segunda, a primeira
      # continua ativa. Fora de transacao, o projeto ficaria sem especialista nenhum.
      assert Repo.get!(Especialista, original.id).ativo
    end
  end

  describe "Equipe.resolver — a referencia da tarefa ate o ativo" do
    test "tarefa sem especialista roda no generico", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{})

      assert %Resolucao{motivo: :generico} = Equipe.resolver(tarefa, :construtor)
    end

    test "tarefa com especialista resolve para o ATIVO, e nao para a versao apontada", %{
      projeto: projeto
    } do
      # A tarefa foi planejada apontando para a primeira redacao. Desde entao o prompt
      # melhorou. Versionar existe para melhorar, e melhoria que nao alcanca a proxima
      # execucao nao melhorou nada.
      {:ok, velha} =
        Equipe.definir(projeto.id, %{identificador: "banco", nome: "b", prompt: "redacao velha"})

      {:ok, nova} =
        Equipe.definir(projeto.id, %{identificador: "banco", nome: "b", prompt: "redacao nova"})

      tarefa = tarefa!(projeto, %{especialista_id: velha.id})

      assert %Resolucao{especialista: resolvido, motivo: :especialista} =
               Equipe.resolver(tarefa, :construtor)

      assert resolvido.id == nova.id
      assert resolvido.prompt == "redacao nova"
    end

    test "referencia que aponta para linha inexistente cai no generico E registra", %{
      projeto: projeto
    } do
      tarefa = tarefa!(projeto, %{})
      orfa = %{tarefa | especialista_id: 999_999}

      resolucao = capturando(fn -> Equipe.resolver(orfa, :construtor) end)

      assert resolucao.especialista == nil
      assert resolucao.motivo == {:especialista_inexistente, {:id, 999_999}}
      assert Resolucao.defeituosa?(resolucao)
    end

    test "especialista de OUTRO projeto nao atende esta tarefa", %{projeto: projeto} do
      outro =
        %Projeto{}
        |> Projeto.changeset(%{
          nome: "outro-#{System.unique_integer([:positive])}",
          caminho: "C:/o"
        })
        |> Repo.insert!()

      {:ok, alheio} =
        Equipe.definir(outro.id, %{identificador: "banco", nome: "b", prompt: "do outro"})

      tarefa = tarefa!(projeto, %{})
      apontando = %{tarefa | especialista_id: alheio.id}

      # O identificador existe, mas nao neste projeto: cai no generico com o defeito dito.
      assert %Resolucao{motivo: {:especialista_inexistente, {:identificador, "banco"}}} =
               capturando(fn -> Equipe.resolver(apontando, :construtor) end)
    end
  end
end
