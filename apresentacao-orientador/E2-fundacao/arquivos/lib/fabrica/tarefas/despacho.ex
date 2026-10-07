defmodule Fabrica.Tarefas.Despacho do
  @moduledoc """
  Uma ida ao operario dentro de um ciclo: qual adaptador, qual modelo, quantas voltas.

  O consumo NAO mora aqui — mora em `Fabrica.Tarefas.Consumo`, uma linha por volta.
  """

  use Ecto.Schema

  import Ecto.Changeset

  alias Fabrica.Tarefas.Ciclo
  alias Fabrica.Tarefas.Consumo

  @type t :: %__MODULE__{}

  schema "despachos" do
    field :operario, :string
    field :modelo, :string
    field :voltas, :integer, default: 0
    field :iniciado_em, :utc_datetime_usec
    field :terminado_em, :utc_datetime_usec
    field :desfecho, :string

    belongs_to :ciclo, Ciclo
    has_many :consumos, Consumo

    timestamps(type: :utc_datetime_usec)
  end

  @campos [:ciclo_id, :operario, :modelo, :voltas, :iniciado_em, :terminado_em, :desfecho]

  @spec changeset(t() | Ecto.Changeset.t(), map()) :: Ecto.Changeset.t()
  def changeset(despacho, atributos) do
    despacho
    |> cast(atributos, @campos)
    |> validate_required([:ciclo_id, :operario, :modelo])
    |> validate_number(:voltas, greater_than_or_equal_to: 0)
    |> assoc_constraint(:ciclo)
    |> check_constraint(:voltas, name: :voltas_nao_negativas)
  end
end
