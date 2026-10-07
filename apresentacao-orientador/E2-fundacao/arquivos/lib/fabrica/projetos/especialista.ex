defmodule Fabrica.Projetos.Especialista do
  @moduledoc """
  Um especialista da equipe do projeto — dado VERSIONADO.

  Trocar o prompt nao sobrescreve: insere linha nova e marca a anterior `ativo: false`.
  E isso que permite comparar o desempenho do mesmo especialista antes e depois de uma
  mudanca. O indice unico parcial (`where: "ativo"`) e quem garante a regra; este modulo
  so a descreve.
  """

  use Ecto.Schema

  import Ecto.Changeset

  alias Fabrica.Projetos.Projeto

  @type t :: %__MODULE__{}

  schema "especialistas" do
    field :identificador, :string
    field :nome, :string
    field :prompt, :string
    field :ativo, :boolean, default: true

    belongs_to :projeto, Projeto

    timestamps(type: :utc_datetime_usec)
  end

  @campos [:projeto_id, :identificador, :nome, :prompt, :ativo]

  @spec changeset(t() | Ecto.Changeset.t(), map()) :: Ecto.Changeset.t()
  def changeset(especialista, atributos) do
    especialista
    |> cast(atributos, @campos)
    |> validate_required([:projeto_id, :identificador, :nome, :prompt])
    |> assoc_constraint(:projeto)
    |> unique_constraint([:projeto_id, :identificador],
      name: :especialistas_ativo_por_projeto,
      message: "ja existe um especialista ativo com este identificador no projeto"
    )
  end
end
