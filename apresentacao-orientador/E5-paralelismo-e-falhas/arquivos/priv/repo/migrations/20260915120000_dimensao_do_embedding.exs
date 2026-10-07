defmodule Fabrica.Repo.Migrations.DimensaoDoEmbedding do
  @moduledoc """
  A coluna `trechos.embedding` passa a nascer com a dimensao do embedder CONFIGURADO no momento
  em que esta migracao roda, em vez de ficar travada em `vector(384)` (D-004, decisao 2; D-005,
  item 1). O `up` chama `Fabrica.Memoria.Dimensao.alinhar!/0` — o SQL de DROP/DELETE/ALTER/CREATE
  ja esta la, e reescreve-lo aqui seria a segunda copia que o GUIA (secao 4) existe para evitar.

  ## O que acontece em cada banco

  - **Banco de teste** (`fabrica_v2_test`): o alias `test:` do `mix.exs` roda
    `ecto.create --quiet, ecto.migrate --quiet` antes de toda suite, entao esta migracao roda
    sozinha. A suite usa `Embedder.Falso` com o padrao 384, que JA e a dimensao que
    `criar_trechos` deu a coluna — entao `alinhar!/0` acha as duas dimensoes iguais e e um
    NO-OP completo (nao apaga trechos, nao derruba indice). E esse no-op que mantem a suite
    inteira verde.
  - **Banco de desenvolvimento** (`fabrica_v2_dev`): enquanto o embedder configurado continuar
    384 (o padrao hoje), tambem e no-op. Se um embedder de outra dimensao ja estiver configurado
    no momento em que esta migracao rodar, `alinhar!/0` APAGA os trechos ja indexados — vetor de
    768 posicoes nao se converte em vetor de 384, entao nao ha como manter os dois num so
    `ALTER TABLE`. O corpus e DERIVAVEL: a proxima passada de `Fabrica.Memoria.Ingestao` o
    reconstroi dos arquivos-fonte. Medido na D-001 (10/09):
    `Repo.aggregate(Fabrica.Memoria.Trecho, :count)` = 0 neste banco, entao nao ha nada a perder
    no momento em que esta migracao entra em producao.
  - **Trocar de modelo DEPOIS que este banco ja tem corpus indexado** nao e migracao nova: rodar
    `mix ecto.migrate` de novo nao faz nada (esta migracao ja rodou uma vez). E chamar
    `Fabrica.Memoria.Dimensao.alinhar!/0` de novo — agora com o embedder novo configurado —
    seguido de uma passada de ingestao para reconstruir o corpus na dimensao nova. A receita fica
    no GUIA pela T-064.
  """

  use Ecto.Migration

  def up do
    Fabrica.Memoria.Dimensao.alinhar!()
  end

  # Nao ha um `Dimensao.alinhar!/0` para "volte a uma dimensao ESPECIFICA": ele so sabe alinhar
  # ao embedder configurado AGORA, que pode nao ser 384 no momento do rollback. Por isso o down
  # escreve o SQL direto, espelhando a mesma sequencia que `alinhar!/0` usa (indice fora, trechos
  # fora, tipo trocado, indice de volta), so que com o alvo fixo que `criar_trechos` criou.
  def down do
    execute("DROP INDEX IF EXISTS trechos_embedding_hnsw_index")
    execute("DELETE FROM trechos")
    execute("ALTER TABLE trechos ALTER COLUMN embedding TYPE vector(384)")

    execute(
      "CREATE INDEX trechos_embedding_hnsw_index ON trechos USING hnsw (embedding vector_cosine_ops)"
    )
  end
end
