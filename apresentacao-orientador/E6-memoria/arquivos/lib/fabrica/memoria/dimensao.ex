defmodule Fabrica.Memoria.Dimensao do
  @moduledoc """
  A dimensao do vetor como FATO CONFERIVEL, nao constante espalhada (D-004, decisao 2; D-005,
  item 1).

  Responde tres perguntas: qual e a dimensao REAL da coluna `trechos.embedding` (`atual/0`, lida
  do catalogo do Postgres — nunca de um numero fixo no codigo), qual e a do embedder configurado
  (`configurada/0`, que delega para `Fabrica.Embedder.dimensoes/0`), e o que fazer quando as duas
  divergem (`conferir/0` para so DETECTAR, `alinhar!/0` para CORRIGIR).

  ## Por que `alinhar!/0` apaga os trechos

  Vetor de 768 posicoes nao se converte em vetor de 384 — nao ha reinterpretacao possivel entre
  duas dimensoes diferentes. A alternativa seria trocar o tipo da coluna e deixar `embedding`
  NULL nos trechos existentes, mas isso os tornaria invisiveis para a busca por similaridade SEM
  nada denunciar — exatamente o defeito que o revisor da T-043 achou (`hash` batendo, `embedding`
  NULL, `Ingestao.processar/3` dando o trecho por `inalterado` para sempre, porque a comparacao
  de hash nao enxerga a coluna vetorial). O corpus indexado por `Fabrica.Memoria.Ingestao` e
  DERIVAVEL: ele e reconstruido dos arquivos-fonte na proxima passada de ingestao. Apagar e
  reconstruir e mais seguro do que reter um estado inconsistente e silencioso.

  Por isso `alinhar!/0` so mexe em alguma coisa quando `atual/0` e `configurada/0` DIVERGEM —
  quando ja batem, e no-op completo, sem apagar nada.
  """

  alias Ecto.Adapters.SQL
  alias Fabrica.Repo

  @indice_hnsw "trechos_embedding_hnsw_index"
  @faixa_aceita 1..2000

  defmodule ForaDaFaixa do
    @moduledoc """
    Dimensao fora do que o indice HNSW do pgvector suporta (ate 2.000 dimensoes). Erro NOMEADO,
    levantado antes de montar qualquer SQL — nao um erro de Postgres no meio de um `ALTER TABLE`.
    """

    defexception [:dimensao, :faixa]

    @impl true
    def message(%{dimensao: dimensao, faixa: faixa}) do
      "dimensao #{dimensao} fora da faixa aceita pelo indice HNSW (#{inspect(faixa)})"
    end
  end

  @doc """
  A dimensao REAL da coluna `trechos.embedding`, lida do catalogo do Postgres — nunca de uma
  constante. `format_type/2` e o contrato publico do Postgres para descrever um tipo de coluna
  (devolve algo como `"vector(384)"`); o `atttypmod` cru existe, mas depende de como o pgvector o
  codifica internamente, e por isso nao e usado aqui.
  """
  @spec atual() :: pos_integer()
  def atual do
    %{rows: [[descricao]]} =
      SQL.query!(Repo, """
      SELECT format_type(atttypid, atttypmod)
        FROM pg_attribute
       WHERE attrelid = 'trechos'::regclass AND attname = 'embedding'
      """)

    [numero] = Regex.run(~r/\((\d+)\)/, descricao, capture: :all_but_first)
    String.to_integer(numero)
  end

  @doc "A dimensao do embedder configurado (`Fabrica.Embedder.dimensoes/0`)."
  @spec configurada() :: pos_integer()
  def configurada, do: Fabrica.Embedder.dimensoes()

  @doc """
  `:ok` quando a coluna e o embedder configurado tem a mesma dimensao, ou
  `{:erro, {:dimensao_divergente, coluna, embedder}}` quando nao. E a guarda que a D-004 pede: sem
  ela, o desencontro so aparece na hora de gravar, no `UPDATE ... ::vector` de
  `Fabrica.Memoria.Ingestao.definir_embedding/2`, e ali o erro do Postgres nao diz de quem e a
  culpa.
  """
  @spec conferir() :: :ok | {:erro, {:dimensao_divergente, pos_integer(), pos_integer()}}
  def conferir do
    coluna = atual()
    embedder = configurada()

    if coluna == embedder do
      :ok
    else
      {:erro, {:dimensao_divergente, coluna, embedder}}
    end
  end

  @doc """
  Leva a coluna `trechos.embedding` a `configurada/0`: derruba o indice HNSW, apaga os trechos,
  troca o tipo da coluna, recria o indice — tudo numa unica transacao. Quando a coluna ja bate
  com o embedder configurado, e no-op (nem apaga trechos).

  Levanta `Fabrica.Memoria.Dimensao.ForaDaFaixa` se a dimensao configurada estiver fora de
  `#{inspect(@faixa_aceita)}`, ANTES de montar qualquer SQL.
  """
  @spec alinhar!() :: :ok
  def alinhar! do
    embedder = configurada()

    if atual() == embedder do
      :ok
    else
      validar_faixa!(embedder)

      {:ok, :ok} =
        Repo.transaction(fn ->
          _ = SQL.query!(Repo, "DROP INDEX IF EXISTS #{@indice_hnsw}")
          _ = SQL.query!(Repo, "DELETE FROM trechos")

          _ =
            SQL.query!(
              Repo,
              "ALTER TABLE trechos ALTER COLUMN embedding TYPE vector(#{embedder})"
            )

          _ =
            SQL.query!(
              Repo,
              "CREATE INDEX #{@indice_hnsw} ON trechos USING hnsw (embedding vector_cosine_ops)"
            )

          :ok
        end)

      :ok
    end
  end

  defp validar_faixa!(dimensao) do
    if dimensao in @faixa_aceita do
      :ok
    else
      raise ForaDaFaixa, dimensao: dimensao, faixa: @faixa_aceita
    end
  end
end
