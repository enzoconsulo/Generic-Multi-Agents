defmodule Fabrica.Tarefas.Area do
  @moduledoc """
  Um ARQUIVO que a tarefa declara que vai tocar. Um por linha, nunca pasta.

  `areas` e o mutex do paralelismo (T-038): duas tarefas so rodam juntas se os conjuntos
  nao se cruzam. Guardar pasta em vez de arquivo tornaria a interseccao uma comparacao de
  prefixo, que produz falso negativo.
  """

  use Ecto.Schema

  import Ecto.Changeset

  alias Fabrica.Tarefas.Tarefa

  @type t :: %__MODULE__{}

  schema "tarefa_areas" do
    field :caminho, :string

    belongs_to :tarefa, Tarefa

    timestamps(type: :utc_datetime_usec)
  end

  @spec changeset(t() | Ecto.Changeset.t(), map()) :: Ecto.Changeset.t()
  def changeset(area, atributos) do
    area
    |> cast(atributos, [:tarefa_id, :caminho])
    |> validate_required([:tarefa_id, :caminho])
    |> assoc_constraint(:tarefa)
    |> unique_constraint([:tarefa_id, :caminho])
  end
end
