defmodule Fabrica.Tarefas.Tarefa do
  @moduledoc """
  A unidade de trabalho da fabrica.

  O `status` e um `Ecto.Enum` com os seis estados do protocolo mais os dois terminais.
  Ser enum e a diferenca entre "o prompt pede" e "o sistema recusa": um status inventado
  nao chega ao banco, e nem precisa de teste em cada caminho de escrita.

  NENHUMA logica de transicao mora aqui — isto e so o esquema. A maquina de estados,
  quem pode ir de onde para onde, e a T-022.
  """

  use Ecto.Schema

  import Ecto.Changeset

  alias Fabrica.Projetos.Especialista
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Tarefas.Area
  alias Fabrica.Tarefas.Ciclo
  alias Fabrica.Tarefas.Criterio
  alias Fabrica.Tarefas.Dependencia

  @type t :: %__MODULE__{}

  @estados [:backlog, :pronta, :em_execucao, :em_teste, :em_revisao, :concluida]
  @terminais [:bloqueada, :cancelada]

  @doc "Os seis estados do pipeline, na ordem em que a tarefa os percorre."
  @spec estados() :: [atom()]
  def estados, do: @estados

  @doc "Os estados terminais, que nao levam a lugar nenhum."
  @spec terminais() :: [atom()]
  def terminais, do: @terminais

  schema "tarefas" do
    field :codigo, :string
    field :titulo, :string
    field :objetivo, :string
    field :contexto, :string
    field :status, Ecto.Enum, values: @estados ++ @terminais, default: :backlog
    field :prioridade, Ecto.Enum, values: [:alta, :media, :baixa], default: :media
    field :tentativas, :integer, default: 0

    belongs_to :projeto, Projeto
    belongs_to :especialista, Especialista
    belongs_to :replanejada_de, __MODULE__

    has_many :areas, Area
    has_many :criterios, Criterio
    has_many :ciclos, Ciclo
    has_many :dependencias, Dependencia

    timestamps(type: :utc_datetime_usec)
  end

  @campos [
    :projeto_id,
    :codigo,
    :titulo,
    :objetivo,
    :contexto,
    :status,
    :prioridade,
    :tentativas,
    :especialista_id,
    :replanejada_de_id
  ]

  @spec changeset(t() | Ecto.Changeset.t(), map()) :: Ecto.Changeset.t()
  def changeset(tarefa, atributos) do
    tarefa
    |> cast(atributos, @campos)
    |> validate_required([:projeto_id, :codigo, :titulo])
    |> validate_format(:codigo, ~r/^T-\d{3,}[a-z]*$/i,
      message: "deve ser T-NNN, com sufixo de letra opcional para replanejamento"
    )
    |> validate_number(:tentativas, greater_than_or_equal_to: 0)
    |> assoc_constraint(:projeto)
    |> assoc_constraint(:especialista)
    |> unique_constraint([:projeto_id, :codigo])
    |> check_constraint(:tentativas, name: :tentativas_nao_negativas)
  end
end
