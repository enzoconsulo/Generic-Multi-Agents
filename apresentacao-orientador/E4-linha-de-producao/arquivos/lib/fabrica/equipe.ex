defmodule Fabrica.Equipe do
  @moduledoc """
  Os especialistas do projeto, como dado VERSIONADO — e a resolucao de quem executa.

  ## Versionar em vez de sobrescrever

  Trocar o prompt de um especialista **insere linha nova e marca a anterior inativa**. Nunca
  um `UPDATE` no texto. E o que permite a pergunta que interessa: *este especialista ficou
  melhor depois que eu mudei o prompt dele?* Sobrescrevendo, a pergunta e irrespondivel — o
  antes some no instante em que o depois aparece.

  A regra nao mora aqui: mora no indice unico PARCIAL do banco
  (`especialistas_ativo_por_projeto`, `where: "ativo"`). Este modulo so a executa. Se alguem
  inserir um segundo ativo por outro caminho, o banco recusa — e e essa a diferenca entre
  "o codigo cuida" e "o esquema garante".

  ## As duas escritas sao uma so transacao

  `definir/2` desativa a anterior e insere a nova num `Ecto.Multi`. Entre as duas cabe uma
  queda, e o estado intermediario e justamente o que o indice parcial proibe: duas ativas com
  o mesmo identificador. Fora de transacao, uma queda no meio deixaria o projeto sem
  especialista ativo nenhum — pior ainda, porque falha em silencio: o despacho seguinte cai
  no generico e ninguem nota.

  ## O que este modulo NAO decide

  Escalonamento de modelo por `tentativas` e da T-030. A resolucao aqui responde *quem*, e
  nao *com quanta forca*.
  """

  import Ecto.Query, only: [from: 2]

  alias Fabrica.Equipe.Resolucao
  alias Fabrica.Projetos.Especialista
  alias Fabrica.Repo
  alias Fabrica.Tarefas.Tarefa

  @doc """
  Define a versao corrente de um especialista: desativa a anterior e insere a nova.

  Idempotente no que importa e nao no que nao importa: chamar duas vezes com o mesmo texto
  cria duas versoes. E deliberado — a fabrica nao tem como saber se a repeticao foi engano ou
  reafirmacao, e uma versao a mais e barata; uma versao perdida, nao.
  """
  @spec definir(pos_integer(), map()) :: {:ok, Especialista.t()} | {:erro, term()}
  def definir(projeto_id, atributos) do
    identificador = Map.get(atributos, :identificador) || Map.get(atributos, "identificador")

    # Transacao com funcao, e nao `Ecto.Multi` — ao contrario de `Tarefas.Transicao`, que e
    # Multi porque a T-037 vai COMPOR com ela. Aqui nao ha o que compor: sao dois passos
    # fechados. E `Multi.new()` cobra um preco por nada — o Dialyzer acusa quebra de
    # opacidade do `MapSet` interno, e a unica saida seria crescer o `.dialyzer_ignore.exs`.
    # Filtro que se evita trocando a estrutura e filtro que nao devia existir.
    Repo.transaction(fn ->
      {_desativadas, _} = Repo.update_all(desativar_query(projeto_id, identificador), [])

      case Repo.insert(novo_changeset(projeto_id, atributos)) do
        {:ok, especialista} -> especialista
        {:error, changeset} -> Repo.rollback(changeset)
      end
    end)
    |> case do
      {:ok, especialista} -> {:ok, especialista}
      {:error, motivo} -> {:erro, motivo}
    end
  end

  defp desativar_query(projeto_id, identificador) do
    from(e in Especialista,
      where: e.projeto_id == ^projeto_id and e.identificador == ^identificador and e.ativo,
      update: [set: [ativo: false, updated_at: ^DateTime.utc_now()]]
    )
  end

  defp novo_changeset(projeto_id, atributos) do
    atributos =
      atributos
      |> Map.new(fn {chave, valor} -> {to_string(chave), valor} end)
      |> Map.put("projeto_id", projeto_id)
      |> Map.put("ativo", true)

    Especialista.changeset(%Especialista{}, atributos)
  end

  @doc "Os especialistas ATIVOS do projeto, em ordem de identificador."
  @spec ativos(pos_integer()) :: [Especialista.t()]
  def ativos(projeto_id) do
    Repo.all(
      from(e in Especialista,
        where: e.projeto_id == ^projeto_id and e.ativo,
        order_by: e.identificador
      )
    )
  end

  @doc "O especialista ativo com este identificador, ou `nil`."
  @spec ativo(pos_integer(), String.t()) :: Especialista.t() | nil
  def ativo(projeto_id, identificador) do
    Repo.one(
      from(e in Especialista,
        where:
          e.projeto_id == ^projeto_id and e.identificador == ^identificador and
            e.ativo
      )
    )
  end

  @doc """
  Cada versao ja escrita deste especialista, **da mais nova para a mais velha**.

  E a consulta que justifica o versionamento existir: sem ela, guardar as linhas antigas
  seria so ocupar disco.
  """
  @spec historico(pos_integer(), String.t()) :: [Especialista.t()]
  def historico(projeto_id, identificador) do
    Repo.all(
      from(e in Especialista,
        where: e.projeto_id == ^projeto_id and e.identificador == ^identificador,
        order_by: [desc: e.id]
      )
    )
  end

  @doc """
  Quem executa esta tarefa neste papel.

  Segue a referencia da tarefa ate o especialista **ativo** de mesmo identificador. Referencia
  que nao chega a lugar nenhum cai no generico com o defeito registrado — nunca falha em
  silencio, e nunca derruba o despacho: uma tarefa sem especialista ainda pode ser feita pelo
  papel generico, e recusa-la seria transformar um defeito de planejamento em trabalho parado.
  """
  @spec resolver(Tarefa.t(), atom()) :: Resolucao.t()
  def resolver(%Tarefa{especialista_id: nil} = tarefa, papel) do
    Resolucao.resolver(papel, nil, ativos(tarefa.projeto_id))
  end

  def resolver(%Tarefa{} = tarefa, papel) do
    case Repo.get(Especialista, tarefa.especialista_id) do
      nil -> Resolucao.inexistente(papel, {:id, tarefa.especialista_id})
      referido -> Resolucao.resolver(papel, referido.identificador, ativos(tarefa.projeto_id))
    end
  end
end
