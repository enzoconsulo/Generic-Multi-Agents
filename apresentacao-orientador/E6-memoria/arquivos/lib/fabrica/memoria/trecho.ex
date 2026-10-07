defmodule Fabrica.Memoria.Trecho do
  @moduledoc """
  Um trecho indexado da HISTORIA do projeto — nao do codigo, disso o indice denso (T-010) ja
  da conta. `fonte` identifica arquivo+secao (ex.: `"_gestao/DECISOES.md#6.2 — o banco e a
  verdade"`), e `hash` e o sha256 hexadecimal do `corpo`: e comparando hashes que
  `Fabrica.Memoria.Ingestao` decide, sem reprocessar nada, se um trecho mudou desde a ultima
  indexacao.

  As colunas `embedding` (`vector(384)`, pgvector) e `busca` (`tsvector` GERADA a partir do
  corpo) existem na tabela mas NAO estao mapeadas neste schema:

    * `busca` e preenchida pelo proprio Postgres (`GENERATED ALWAYS AS ... STORED`) — nenhum
      codigo Elixir escreve nela;
    * `embedding` e escrita por SQL bruto em `Fabrica.Memoria.Ingestao.definir_embedding/2`,
      porque o Postgrex nao tem extensao para o tipo `vector` do pgvector: o valor entra como
      literal de texto (`'[...]'::vector`) colado no SQL, nunca como parametro `$N`
      interpolado pelo Ecto.
  """

  use Ecto.Schema

  import Ecto.Changeset

  alias Fabrica.Projetos.Projeto

  @type t :: %__MODULE__{}

  schema "trechos" do
    field :fonte, :string
    field :corpo, :string
    field :hash, :string

    belongs_to :projeto, Projeto

    timestamps(type: :utc_datetime_usec)
  end

  @campos [:projeto_id, :fonte, :corpo, :hash]

  @doc "Changeset de trecho. `hash` e calculado por quem chama — ver `hash/1`."
  @spec changeset(t() | Ecto.Changeset.t(), map()) :: Ecto.Changeset.t()
  def changeset(trecho, atributos) do
    trecho
    |> cast(atributos, @campos)
    |> validate_required(@campos)
    |> foreign_key_constraint(:projeto_id)
    |> unique_constraint([:projeto_id, :fonte], name: :trechos_projeto_fonte_index)
  end

  @doc "O sha256 hexadecimal (minusculo) do corpo — o que detecta trecho novo ou alterado."
  @spec hash(String.t()) :: String.t()
  def hash(corpo) when is_binary(corpo) do
    :crypto.hash(:sha256, corpo) |> Base.encode16(case: :lower)
  end
end
