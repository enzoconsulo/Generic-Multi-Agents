defmodule Fabrica.Tarefas.Criterio do
  @moduledoc """
  Um criterio de aceite da tarefa, com o GRAU DE PROVA em que ele e verificado.

  A escada de prova: `:executado` (um comando roda e o codigo de saida decide),
  `:inspecionado` (alguem abre o artefato e confere) e `:julgado` (rubrica). Muitos
  `julgado` num projeto significam portao e meio, nao dois — e isso e sinal de
  planejamento, nao de agente.

  `comando` e nulo exatamente quando o grau nao e `:executado`.
  """

  use Ecto.Schema

  import Ecto.Changeset

  alias Fabrica.Tarefas.Tarefa

  @type t :: %__MODULE__{}

  @graus [:executado, :inspecionado, :julgado]

  @doc "Os graus da escada de prova, do mais forte para o mais fraco."
  @spec graus() :: [atom()]
  def graus, do: @graus

  schema "criterios" do
    field :texto, :string
    field :comando, :string
    field :grau, Ecto.Enum, values: @graus, default: :inspecionado

    belongs_to :tarefa, Tarefa

    timestamps(type: :utc_datetime_usec)
  end

  @spec changeset(t() | Ecto.Changeset.t(), map()) :: Ecto.Changeset.t()
  def changeset(criterio, atributos) do
    criterio
    |> cast(atributos, [:tarefa_id, :texto, :comando, :grau])
    |> validate_required([:tarefa_id, :texto])
    |> assoc_constraint(:tarefa)
    |> validar_comando_combina_com_grau()
  end

  defp validar_comando_combina_com_grau(changeset) do
    case {get_field(changeset, :grau), get_field(changeset, :comando)} do
      {:executado, nil} ->
        add_error(changeset, :comando, "criterio executado precisa de comando")

      {grau, comando} when grau != :executado and is_binary(comando) ->
        add_error(changeset, :grau, "criterio com comando deve ter grau :executado")

      _ ->
        changeset
    end
  end
end
