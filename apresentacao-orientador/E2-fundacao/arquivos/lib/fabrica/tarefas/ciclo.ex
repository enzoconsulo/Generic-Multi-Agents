defmodule Fabrica.Tarefas.Ciclo do
  @moduledoc """
  Uma passagem da tarefa por um papel do pipeline. LINHA NOVA a cada retrabalho.

  Nunca sobrescrita: e o que permite perguntar depois quanto custou cada ciclo
  separadamente. Relatorio que substitui o anterior apaga a evidencia de que a tarefa
  girou, que e justamente o numero da tese.

  `papel` e `desfecho` sao texto, e nao enum, DE PROPOSITO: o vocabulario de papeis das
  duas trilhas e a lista de desfechos sao definidos na v0.3 (T-028, T-029). Cunhar os
  valores aqui seria adivinhar, e enum errado e mais caro que texto.
  """

  use Ecto.Schema

  import Ecto.Changeset

  alias Fabrica.Tarefas.Despacho
  alias Fabrica.Tarefas.Tarefa

  @type t :: %__MODULE__{}

  schema "ciclos" do
    field :numero, :integer
    field :papel, :string
    field :desfecho, :string
    field :relatorio, :string

    belongs_to :tarefa, Tarefa
    has_many :despachos, Despacho

    timestamps(type: :utc_datetime_usec)
  end

  @spec changeset(t() | Ecto.Changeset.t(), map()) :: Ecto.Changeset.t()
  def changeset(ciclo, atributos) do
    ciclo
    |> cast(atributos, [:tarefa_id, :numero, :papel, :desfecho, :relatorio])
    |> validate_required([:tarefa_id, :numero, :papel])
    |> validate_number(:numero, greater_than_or_equal_to: 1)
    |> assoc_constraint(:tarefa)
    |> unique_constraint([:tarefa_id, :numero, :papel])
    |> check_constraint(:numero, name: :numero_positivo)
  end
end
