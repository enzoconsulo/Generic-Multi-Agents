defmodule Fabrica.Repo.Migrations.CriarTrechos do
  use Ecto.Migration

  # SQL bruto do `up` ao `down`: as colunas `embedding` (vector, do pgvector) e `busca`
  # (tsvector GERADA a partir do corpo) nao tem tipo correspondente na DSL de
  # `Ecto.Migration` — forcar `add/3` para elas so esconderia o SQL real sob uma sintaxe que
  # nao o representa.
  def up do
    execute("CREATE EXTENSION IF NOT EXISTS vector")

    execute("""
    CREATE TABLE trechos (
      id bigserial PRIMARY KEY,
      projeto_id bigint NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
      fonte text NOT NULL,
      corpo text NOT NULL,
      hash text NOT NULL,
      embedding vector(384),
      busca tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', corpo)) STORED,
      inserted_at timestamp(6) NOT NULL,
      updated_at timestamp(6) NOT NULL
    )
    """)

    execute("CREATE UNIQUE INDEX trechos_projeto_fonte_index ON trechos (projeto_id, fonte)")

    # HNSW + `vector_cosine_ops`: a busca semantica da v0.5 compara por cosseno (os vetores
    # de `Embedder.Falso` ja saem normalizados para norma 1, de proposito).
    execute(
      "CREATE INDEX trechos_embedding_hnsw_index ON trechos USING hnsw (embedding vector_cosine_ops)"
    )

    execute("CREATE INDEX trechos_busca_gin_index ON trechos USING gin (busca)")
  end

  def down do
    execute("DROP TABLE IF EXISTS trechos")
  end
end
