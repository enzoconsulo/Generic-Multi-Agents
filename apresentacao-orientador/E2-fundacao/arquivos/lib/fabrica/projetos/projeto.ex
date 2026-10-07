defmodule Fabrica.Projetos.Projeto do
  @moduledoc """
  Um projeto que a fabrica constroi.

  O campo `dominio` e o que ROTEIA o pipeline inteiro: `"software"` usa a trilha de
  software; qualquer outro valor usa a trilha generica. Ausencia de dominio e software,
  sempre — dai o default.
  """

  use Ecto.Schema

  import Ecto.Changeset

  alias Fabrica.Projetos.Especialista
  alias Fabrica.Tarefas.Tarefa

  @type t :: %__MODULE__{}

  schema "projetos" do
    field :nome, :string
    field :caminho, :string
    field :dominio, :string, default: "software"

    has_many :especialistas, Especialista
    has_many :tarefas, Tarefa

    timestamps(type: :utc_datetime_usec)
  end

  @campos [:nome, :caminho, :dominio]

  @doc "Changeset de projeto. `dominio` e texto livre de proposito: dominio nao e lista fechada."
  @spec changeset(t() | Ecto.Changeset.t(), map()) :: Ecto.Changeset.t()
  def changeset(projeto, atributos) do
    projeto
    |> cast(atributos, @campos)
    |> validate_required([:nome, :caminho])
    |> validate_length(:nome, min: 1, max: 100)
    |> unique_constraint(:nome)
  end
end
