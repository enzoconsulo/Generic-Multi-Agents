defmodule Fabrica.Tarefas.Dependencia do
  @moduledoc """
  Uma aresta do grafo de dependencias: `tarefa_id` depende de `depende_de_id`.

  E tabela de ligacao, e nao lista serializada num campo, porque "quais tarefas destravam
  se esta concluir?" precisa ser consulta e nao varredura.
  """

  use Ecto.Schema

  import Ecto.Changeset

  alias Fabrica.Tarefas.Tarefa

  @type t :: %__MODULE__{}

  schema "tarefa_dependencias" do
    belongs_to :tarefa, Tarefa
    belongs_to :depende_de, Tarefa

    timestamps(type: :utc_datetime_usec)
  end

  @spec changeset(t() | Ecto.Changeset.t(), map()) :: Ecto.Changeset.t()
  def changeset(dependencia, atributos) do
    dependencia
    |> cast(atributos, [:tarefa_id, :depende_de_id])
    |> validate_required([:tarefa_id, :depende_de_id])
    |> assoc_constraint(:tarefa)
    |> assoc_constraint(:depende_de)
    |> unique_constraint([:tarefa_id, :depende_de_id])
    |> check_constraint(:depende_de_id,
      name: :dependencia_nao_reflexiva,
      message: "uma tarefa nao pode depender de si mesma"
    )
  end
end
