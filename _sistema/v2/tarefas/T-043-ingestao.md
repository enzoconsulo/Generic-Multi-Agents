---
id: T-043
titulo: Ingestao da historia do projeto ao commitar
projeto: fabrica-v2
versao: v0.5
status: backlog
prioridade: alta
dependencias: [T-004, T-032]
areas: [lib/fabrica/memoria/ingestao.ex, lib/fabrica/memoria/trecho.ex, test/fabrica/memoria/ingestao_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Ao commitar, cortar e indexar a HISTORIA do projeto — decisoes com motivo, achados de
revisao, relatorios de verificacao, tarefas concluidas.

## Contexto
O corpus indexado NAO e o codigo: disso o indice denso (T-010) ja da conta, de graca e com
exatidao. E a historia — o material que a v1 produzia em volume e depois nao conseguia
consultar, porque estava espalhado por dezenas de arquivos que ninguem ia abrir.

Corte por ESTRUTURA (secao de markdown, bloco de codigo), nunca por contagem cega de
caracteres — um trecho cortado no meio de uma frase perde justamente o que o tornava
recuperavel. Em Elixir isso e trabalho proprio ou `TextChunker`.

Tabela `trechos`: projeto_id, fonte (arquivo e secao), corpo, embedding `vector(384)`, e
uma coluna `busca` do tipo `tsvector` GERADA a partir do corpo. Indices: HNSW com
`vector_cosine_ops` no embedding, GIN na busca.

Roda FORA do caminho quente — no commit, nao no despacho. Em lote, nunca um a um.

Reindexacao incremental: so o que mudou desde o ultimo commit indexado. Guarde o hash do
commit indexado por projeto. Reindexar tudo a cada commit tornaria a fase inviavel em
projeto grande.

## Criterios de aceite
- [ ] Ao commitar, os trechos novos e alterados sao indexados; os inalterados nao sao retocados.
      `verificar: mix test test/fabrica/memoria/ingestao_test.exs`
- [ ] O corte respeita a estrutura: nenhuma secao de markdown e cortada no meio de uma frase.
      `verificar: mix test test/fabrica/memoria/ingestao_test.exs`
- [ ] Os indices HNSW e GIN existem e sao usados (EXPLAIN registrado no teste).
      `verificar: mix test test/fabrica/memoria/ingestao_test.exs`
- [ ] A ingestao roda em lote, com uma unica chamada ao embedder por commit.
      `verificar: mix test test/fabrica/memoria/ingestao_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

