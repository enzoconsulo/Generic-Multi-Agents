---
id: T-059
titulo: A dimensao do indice vira um fato conferivel (Fabrica.Memoria.Dimensao)
projeto: fabrica-v2
versao: v0.5
status: concluida
prioridade: alta
dependencias: [T-043]
areas: [lib/fabrica/memoria/dimensao.ex, test/fabrica/memoria/dimensao_test.exs]
tentativas: 2
criada: 2026-09-15
atualizada: 2026-09-22
---

## Objetivo
Um modulo que responde tres perguntas sobre a dimensao do vetor: qual e a da COLUNA (lida do
catalogo do Postgres), qual e a do EMBEDDER configurado, e o que fazer quando as duas divergem.
Sem isso, "dimensao configuravel" (D-004, decisao 2) nao tem onde se apoiar.

## Contexto

Hoje a dimensao e uma constante escrita em quatro lugares: `vector(384)` na migracao
`priv/repo/migrations/20260909070000_criar_trechos.exs`, e `@dimensoes 384` em `Falso`, `Servico`
e `Local`. A D-004 decidiu que a coluna passa a SEGUIR o embedder configurado —
`Fabrica.Embedder.dimensoes/0` ja existe e ja delega para o adaptador, entao ele e a fonte unica.
O que falta e o outro lado: saber o que a coluna REALMENTE e, e alinha-la.

Esta tarefa entrega so o modulo. Quem o usa vem depois (T-061 grava a migracao e chama a guarda
na ingestao), e e por isso que aqui nao ha migracao nenhuma.

**O que construir** — `Fabrica.Memoria.Dimensao`, em `lib/fabrica/memoria/dimensao.ex`:

- `atual/0` — a dimensao da coluna `trechos.embedding`, **lida do catalogo**, nunca de constante.
  O caminho legivel e `SELECT format_type(atttypid, atttypmod) FROM pg_attribute WHERE attrelid =
  'trechos'::regclass AND attname = 'embedding'`, que devolve `vector(384)`; extraia o numero.
  (Existe o caminho do `atttypmod` cru, mas ele depende de como o pgvector codifica o typmod —
  `format_type` e o contrato publico do Postgres e nao depende disso.)
- `configurada/0` — `Fabrica.Embedder.dimensoes()`.
- `conferir/0` — `:ok` quando batem, `{:erro, {:dimensao_divergente, coluna, embedder}}` quando
  nao. **E esta a guarda que a D-004 pede**: hoje o desencontro so aparece na hora de gravar, no
  `UPDATE ... ::vector` de `Ingestao.definir_embedding/2`, e ali o erro do Postgres nao diz de
  quem e a culpa.
- `alinhar!/0` — leva a coluna a `configurada/0`: derruba o indice HNSW, **apaga os trechos**,
  troca o tipo da coluna, recria o indice. Quando ja batem, **nao faz nada** (nem apaga). Tudo
  numa transacao so.

**Por que `alinhar!/0` apaga o corpus, e por que isso e o certo** (registrado na D-005): vetor de
768 posicoes nao se converte em vetor de 384; e deixar o trecho com `embedding` NULL o tornaria
invisivel para a busca sem nada denunciar — o defeito exato que o revisor da T-043 achou
(`hash` batendo, `embedding` NULL, `processar/3` dando o trecho por `inalterado` para sempre). O
corpus e derivavel: a ingestao o reconstroi dos arquivos. Diga isso no `@moduledoc`, com essa
razao; e o tipo de decisao que, sem motivo escrito, vira folclore.

**Faixa aceita:** o HNSW do pgvector indexa ate 2.000 dimensoes. Dimensao fora de `1..2000` e erro
NOMEADO, recusado antes de montar SQL — nao um erro do Postgres no meio de um `ALTER TABLE`.

**Armadilha do teste, e ela e seria.** O teste de `alinhar!/0` mexe no ESQUEMA do banco de teste
(`ALTER TABLE` + `CREATE INDEX` tomam lock exclusivo em `trechos`). Rode o arquivo com
`async: false` e dentro do sandbox do Ecto — DDL em Postgres e transacional, entao o rollback do
sandbox devolve a coluna ao estado anterior no fim de cada teste. Sem `async: false`, qualquer
teste concorrente que toque `trechos` trava ate o lock sair. Para forcar divergencia, configure um
embedder de teste de outra dimensao com `Application.put_env(:fabrica, :embedder, ...)` e devolva
no `on_exit` — nao precisa (e nao deve) mexer no `Embedder.Falso`, que e area da T-060.

**Stack:** nada novo. `Ecto.Adapters.SQL.query!/3` sobre `Fabrica.Repo`, como `Busca` e `Ingestao`
ja fazem com o tipo `vector`. Nenhuma dependencia nova.

Antes de fechar: `mix format`, conferir fim de linha LF (GUIA, Armadilhas — reaparece em toda
tarefa que edita `.ex`) e `mix fabrica.ci` completo.

## Criterios de aceite
- [ ] `Dimensao.atual/0` devolve a dimensao REAL da coluna `trechos.embedding` lida do catalogo do
      Postgres (hoje, 384) — e o teste prova que nao e constante, comparando com a coluna depois de
      um `alinhar!/0` para outro valor.
      `verificar: mix test test/fabrica/memoria/dimensao_test.exs`
- [ ] `Dimensao.conferir/0` devolve `:ok` quando coluna e `Fabrica.Embedder.dimensoes/0` batem, e
      `{:erro, {:dimensao_divergente, coluna, embedder}}` quando nao.
      `verificar: mix test test/fabrica/memoria/dimensao_test.exs`
- [ ] `Dimensao.alinhar!/0` leva a coluna a dimensao configurada, recria o indice HNSW e apaga os
      trechos; rodado de novo com a coluna ja alinhada, e no-op — nao apaga trecho nenhum.
      `verificar: mix test test/fabrica/memoria/dimensao_test.exs`
- [ ] Dimensao fora de `1..2000` vira erro nomeado antes de montar SQL.
      `verificar: mix test test/fabrica/memoria/dimensao_test.exs`
- [ ] O modulo novo passa no lint estrito do projeto, sem exclusao de check.
      `verificar: mix credo --strict`

## Notas de execucao

### Ciclo 1

Criado `Fabrica.Memoria.Dimensao` (`lib/fabrica/memoria/dimensao.ex`) com as quatro funcoes do
Objetivo:

- `atual/0` — le `format_type(atttypid, atttypmod)` de `pg_attribute` para `trechos.embedding`
  e extrai o numero de dentro de `vector(N)` com regex; nunca uma constante.
- `configurada/0` — delega para `Fabrica.Embedder.dimensoes/0`.
- `conferir/0` — `:ok` ou `{:erro, {:dimensao_divergente, coluna, embedder}}`.
- `alinhar!/0` — no-op quando `atual/0 == configurada/0`; caso contrario, valida a faixa
  `1..2000` (levanta `Fabrica.Memoria.Dimensao.ForaDaFaixa`, exception nomeada, ANTES de montar
  qualquer SQL) e, numa unica `Repo.transaction/1`, derruba o indice HNSW
  (`trechos_embedding_hnsw_index`), apaga os trechos, troca o tipo da coluna e recria o indice.

Teste escrito ANTES do modulo (visto vermelho: `UndefinedFunctionError` nas 6 asserções, depois
verde). `test/fabrica/memoria/dimensao_test.exs` roda com `async: false` (DDL toma lock
exclusivo em `trechos`) e usa dois embedders de teste inline (`EmbedderOutraDimensao`, 8
dimensoes; `EmbedderForaDaFaixa`, 2001) configurados via `Application.put_env(:fabrica,
:embedder, ...)` com `on_exit` — nao mexeu em `Embedder.Falso` (area da T-060). Um teste prova
`atual/0` nao e constante (compara antes e depois de um `alinhar!/0` real para 8 dimensões); um
prova o no-op (coluna ja bate, nada apagado); um prova a exclusão do corpus e a recriação do
índice HNSW (`pg_indexes.indexdef` contem `"hnsw"`); um prova a faixa aceita via `assert_raise`.

Dialyzer apontou `unmatched_return` nos quatro `SQL.query!/2` dentro da transação de
`alinhar!/0` — corrigido prefixando cada chamada com `_ =`, mesmo padrão já usado em
`Ingestao.definir_embedding/2`.

Nenhuma dependência nova. Nenhuma migração tocada (fora do escopo desta tarefa — fica para a
T-061, como o Contexto já avisava).

**Reproduzir:** `mix test test/fabrica/memoria/dimensao_test.exs` (precisa do Postgres no ar:
`C:/pgsql/18/bin/pg_isready.exe -h 127.0.0.1 -p 5432`).

**Commit:** `a7a297f`

**2026-09-15 — promovida a `pronta` pelo orquestrador**: todas as dependencias estao `concluida`.
As tres primeiras da linhagem da D-004 (T-059, T-060, T-062) tem `areas` disjuntas entre si e podem
ir em paralelo, ate o limite de 3 construtores do CLAUDE.md.

## Verificação

### Ciclo 2

- **[PASSOU] [executado] A suíte do projeto continua passando (não quebrou o que já existia)**
  Comando: `mix test`
  Saída: 1090 tests, 0 failures

- **[PASSOU] [executado] `Dimensao.atual/0` devolve a dimensao REAL da coluna `trechos.embedding` lida do catalogo do Postgres (hoje, 384) — e o teste prova que nao e constante**
  Comando: `mix test test/fabrica/memoria/dimensao_test.exs`
  Saída: 6 tests, 0 failures

- **[PASSOU] [executado] `Dimensao.conferir/0` devolve `:ok` quando coluna e `Fabrica.Embedder.dimensoes/0` batem, e `{:erro, {:dimensao_divergente, coluna, embedder}}` quando nao**
  Comando: `mix test test/fabrica/memoria/dimensao_test.exs`
  Saída: incluído acima (6 tests, 0 failures)

- **[PASSOU] [executado] `Dimensao.alinhar!/0` leva a coluna a dimensao configurada, recria o indice HNSW e apaga os trechos; rodado de novo com a coluna ja alinhada, e no-op**
  Comando: `mix test test/fabrica/memoria/dimensao_test.exs`
  Saída: incluído acima (6 tests, 0 failures)

- **[PASSOU] [executado] Dimensao fora de `1..2000` vira erro nomeado antes de montar SQL**
  Comando: `mix test test/fabrica/memoria/dimensao_test.exs`
  Saída: incluído acima (6 tests, 0 failures)

- **[PASSOU] [executado] O modulo novo passa no lint estrito do projeto, sem exclusao de check**
  Comando: `mix credo --strict`
  Saída: 1448 mods/funs, found no issues

Suíte completa: 1090 passou, 0 falhou — `mix test`
Graus de prova: 6 executado(s), 0 para julgamento (de 6).

## Conformidade

### Ciclo 2

Conformidade: cumpre

- `Dimensao.atual/0` lê `format_type(atttypid, atttypmod)` de `pg_attribute` e extrai o número
  de dentro de `vector(N)` por regex, nunca uma constante → `lib/fabrica/memoria/dimensao.ex:38-47`.
  O teste prova que não é constante comparando `atual/0` antes (384) e depois de um `alinhar!/0`
  real para 8 dimensões → `test/fabrica/memoria/dimensao_test.exs:63-71`.
- `Dimensao.configurada/0` delega para `Fabrica.Embedder.dimensoes/0`, a fonte única que a D-004
  pede → `lib/fabrica/memoria/dimensao.ex:50`.
- `Dimensao.conferir/0` devolve `:ok`/`{:erro, {:dimensao_divergente, coluna, embedder}}` →
  `lib/fabrica/memoria/dimensao.ex:57-66`, testado nos dois ramos em
  `test/fabrica/memoria/dimensao_test.exs:74-84`.
- `Dimensao.alinhar!/0` — no-op quando já bate, e quando divergem derruba o índice HNSW, apaga
  os trechos, troca o tipo da coluna e recria o índice, tudo numa `Repo.transaction/1` →
  `lib/fabrica/memoria/dimensao.ex:75-99`. Os dois ramos (troca real e no-op) estão testados em
  `test/fabrica/memoria/dimensao_test.exs:87-118`, inclusive a prova de que o índice recriado é
  HNSW (`pg_indexes.indexdef =~ "hnsw"`).
- Faixa `1..2000` recusada com exceção nomeada (`ForaDaFaixa`) ANTES de montar SQL →
  `lib/fabrica/memoria/dimensao.ex:22-33,101-108`, testado em
  `test/fabrica/memoria/dimensao_test.exs:135-149` (inclusive a prova de que nada mudou —
  `Dimensao.atual() == 384` depois do `assert_raise`).
- Lint estrito: `mix credo --strict` já registrado como PASSOU na Verificação (1448 mods/funs,
  sem achado).
- Escopo respeitado: só `lib/fabrica/memoria/dimensao.ex` e
  `test/fabrica/memoria/dimensao_test.exs` foram tocados (mais `_gestao/MAPA.md`, regenerado, e
  o próprio arquivo da tarefa) — bate com as `areas` declaradas. Nenhuma migração foi criada,
  como o Contexto avisava ("fica para a T-061"). Nenhuma dependência nova.
- Objetivo cumprido no espírito: a dimensão do vetor deixou de ser constante espalhada e passou
  a ser um fato lido do catálogo (`atual/0`) confrontado com a fonte única já existente
  (`Fabrica.Embedder.dimensoes/0`), com uma guarda de detecção (`conferir/0`) e uma operação de
  correção (`alinhar!/0`) — exatamente o que a D-004/D-005 pediam, e nada além disso.

## Revisão

### Ciclo 2

Aprovado sem ressalvas.

Verifiquei o diff inteiro do commit `a7a297f` (módulo, teste e regeneração do MAPA) e a
correção pontual do `2eef2ee` (preenchimento do hash do Commit). Pontos checados especificamente:

- Ordem das operações em `alinhar!/0` (`DROP INDEX` → `DELETE` → `ALTER COLUMN TYPE` → `CREATE
  INDEX`) é segura: o índice é derrubado antes de trocar o tipo da coluna que ele indexa, e a
  tabela já está vazia quando o `ALTER TYPE` roda, então não há conversão de vetor a fazer.
- A validação de faixa (`validar_faixa!/1`) roda antes de qualquer `SQL.query!`, confirmado por
  leitura do código e pelo teste que verifica `Dimensao.atual() == 384` após o `assert_raise`.
- Interpolação de `#{embedder}` no `ALTER TABLE ... TYPE vector(#{embedder})`: `embedder` vem de
  `Fabrica.Embedder.dimensoes/0`, contrato de adaptador (`@callback dimensoes() :: pos_integer()`),
  não de entrada de usuário — sem risco de injeção nas condições em que o `@behaviour` é
  respeitado.
- O teste usa `async: false` e muda `Application.put_env(:fabrica, :embedder, ...)` global. Não é
  race: todo outro arquivo de teste que toca `Fabrica.Embedder.configurado()`
  (`servico_test.exs`, `marco_v01_test.exs`) também roda `async: true`/`async: false` sob a
  garantia do próprio ExUnit de que nenhum outro teste (sync ou async) roda concorrentemente com
  um teste `async: false` — é essa garantia, e não só o lock de DDL citado no moduledoc do
  teste, que torna a mutação de env global segura aqui.
- Nomes de índice e coluna usados em `alinhar!/0` (`trechos_embedding_hnsw_index`, `embedding`)
  batem com os da migração `20260909070000_criar_trechos.exs`.
- Nenhuma rotina artesanal reinventada: usa `Ecto.Adapters.SQL.query!/2` sobre `Fabrica.Repo`,
  mesmo padrão de `Busca` e `Ingestao`; o `_ = SQL.query!(...)` para silenciar
  `unmatched_return` no Dialyzer segue o precedente já usado em
  `Ingestao.definir_embedding/2`.
- Fim de linha LF confirmado nos dois arquivos novos.

