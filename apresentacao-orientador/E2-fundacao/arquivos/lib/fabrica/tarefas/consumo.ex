defmodule Fabrica.Tarefas.Consumo do
  @moduledoc """
  O que UMA VOLTA consumiu. Uma linha por volta, sempre.

  O total por tarefa e uma soma; o contrario seria impossivel. E guardar so o total
  esconderia a reparticao entrada / leitura de cache / escrita de cache — que e
  exatamente o numero que decide o desenho da v2: a escrita e ~6,7% dos tokens e carrega
  ~50% da conta de entrada (medido sobre os 27 jobs da v1 com contabilidade completa).

  Duas unidades, e nao uma: `custo_usd` e estimativa contabil, `cota_unidades` e o que a
  operacao real gasta sob assinatura. A aritmetica delas e a T-005.
  """

  use Ecto.Schema

  import Ecto.Changeset

  alias Fabrica.Tarefas.Despacho

  @type t :: %__MODULE__{}

  schema "consumos" do
    field :volta, :integer
    field :tokens_entrada, :integer, default: 0
    field :tokens_cache_escrita, :integer, default: 0
    field :tokens_cache_leitura, :integer, default: 0
    field :tokens_saida, :integer, default: 0
    field :custo_usd, :decimal, default: Decimal.new(0)
    field :cota_unidades, :decimal, default: Decimal.new(0)
    field :duracao_ms, :integer

    belongs_to :despacho, Despacho

    timestamps(type: :utc_datetime_usec)
  end

  @tokens [:tokens_entrada, :tokens_cache_escrita, :tokens_cache_leitura, :tokens_saida]
  @campos [:despacho_id, :volta, :custo_usd, :cota_unidades, :duracao_ms] ++ @tokens

  @doc "Os quatro campos de token, na ordem em que a contabilidade os reparte."
  @spec campos_de_token() :: [atom()]
  def campos_de_token, do: @tokens

  @spec changeset(t() | Ecto.Changeset.t(), map()) :: Ecto.Changeset.t()
  def changeset(consumo, atributos) do
    consumo
    |> cast(atributos, @campos)
    |> validate_required([:despacho_id, :volta])
    |> validate_number(:volta, greater_than_or_equal_to: 1)
    |> validar_tokens_nao_negativos()
    |> assoc_constraint(:despacho)
    |> unique_constraint([:despacho_id, :volta])
    |> check_constraint(:volta, name: :volta_positiva)
  end

  defp validar_tokens_nao_negativos(changeset) do
    Enum.reduce(@tokens, changeset, fn campo, acumulado ->
      validate_number(acumulado, campo, greater_than_or_equal_to: 0)
    end)
  end
end
