---
id: T-061
titulo: A coluna segue o embedder, e a guarda recusa o desencontro antes de gravar
projeto: fabrica-v2
versao: v0.5
status: concluida
prioridade: alta
dependencias: [T-059, T-060]
areas: [priv/repo/migrations/20260915120000_dimensao_do_embedding.exs, lib/fabrica/memoria/ingestao.ex, test/fabrica/memoria/ingestao_test.exs]
tentativas: 1
criada: 2026-09-15
atualizada: 2026-09-22
---

## Objetivo
A coluna `trechos.embedding` passa a nascer com a dimensao do embedder configurado, e a ingestao
recusa o desencontro ANTES de vetorizar — em vez de deixa-lo aparecer como erro do Postgres na hora
de gravar no indice.

## Contexto

Esta e a tarefa que LIGA o que a T-059 e a T-060 construiram. Sem ela, `Fabrica.Memoria.Dimensao`
existe e ninguem a chama — o defeito recorrente catalogado no CLAUDE.md da fabrica (sensor sem
atuador, sete ocorrencias).

### A migracao

Crie **exatamente** `priv/repo/migrations/20260915120000_dimensao_do_embedding.exs` (o gerador
escolheria outro carimbo de tempo e o arquivo cairia fora das `areas` desta tarefa; 20260915120000
e maior que a ultima migracao existente, `20260909070000_criar_trechos`).

O `up` chama `Fabrica.Memoria.Dimensao.alinhar!/0` — nao reescreva o SQL aqui, ele ja esta la e
uma segunda copia e o que o GUIA (secao 4) existe para evitar. O `down` volta a coluna para
`vector(384)`, que e o que a `criar_trechos` criou.

**O que acontece com os bancos que ja existem — diga isso no proprio arquivo da migracao:**

- **Banco de teste** (`fabrica_v2_test`): o alias `test:` do `mix.exs` roda `ecto.create --quiet,
  ecto.migrate --quiet` antes de toda suite, entao a migracao roda sozinha. Como a suite usa
  `Embedder.Falso` com o padrao 384, a coluna continua `vector(384)` e **nada muda** — e esse
  no-op e proposital: e ele que mantem os 978 testes verdes.
- **Banco de desenvolvimento** (`fabrica_v2_dev`): `Repo.aggregate(Fabrica.Memoria.Trecho, :count)`
  foi medido em **0** na D-001 (10/09), entao nao ha corpus a perder hoje. Ainda assim a migracao
  apaga trechos por construcao (`alinhar!/0`), e isso precisa estar escrito no arquivo: vetor de
  768 nao se converte em vetor de 384, e a ingestao reconstroi o corpus dos arquivos.
- **Trocar de modelo depois** nao e migracao nova: e `Dimensao.alinhar!/0` seguido de reindexacao.
  A receita fica no GUIA pela T-064.

### A guarda na ingestao

`Ingestao.processar/3` passa a chamar `Dimensao.conferir/0` **antes** de montar o lote, e devolve
`{:erro, {:dimensao_divergente, coluna, embedder}}` sem chamar o embedder. Hoje o desencontro so
aparece dentro de `definir_embedding/2`, no `UPDATE trechos SET embedding = '...'::vector`, como
erro do Postgres — que nao diz de quem e a culpa e ainda gasta a chamada ao modelo (na placa,
segundos por lote).

Repare no contrato de retorno: `processar/3` hoje devolve um mapa com
`inseridos/atualizados/inalterados/chamadas_embedder`. Decida e registre como o erro entra nesse
contrato (uma tupla `{:erro, _}` a mais, ou excecao) — e mantenha o `@spec` honesto, porque e o
Dialyzer que pega spec mentiroso neste projeto (GUIA, secao 3).

### A armadilha que vai quebrar um teste existente, e ela nao e opcional

`test/fabrica/memoria/ingestao_test.exs` tem o teste de regressao da T-043 — *"falha ao gravar o
embedding nao deixa o trecho com hash gravado (transacao atomica)"* — e ele forca a falha
justamente com **um embedder que devolve vetor de dimensao errada (1, nao 384)**, para o
`UPDATE ... ::vector` estourar no banco. Com a guarda no lugar, esse caminho passa a ser barrado
antes, e o teste para de provar o que provava.

Esse teste trava um achado `[importante]` do revisor da T-043 (trecho com `hash` gravado e
`embedding` NULL, invisivel para a busca para sempre). **Ele nao pode simplesmente sumir**:
reescreva-o para forcar a falha por outro caminho — um embedder que devolve a dimensao CERTA e
falha de outro jeito, ou um vetor com valor que o `::vector` recusa — e mantenha a assercao final
(`Repo.aggregate(Trecho, :count) == 0` e a passada seguinte vendo o trecho como novo). Se voce nao
achar um caminho de falha honesto, isso e um impedimento de especificacao: escreva
`Impedimento: <motivo>` nas Notas em vez de enfraquecer a assercao.

**Stack:** nada novo. Antes de fechar: `mix format`, conferir LF (GUIA, Armadilhas) e
`mix fabrica.ci` completo.

## Criterios de aceite
- [ ] No banco de teste, `Dimensao.conferir/0` devolve `:ok` — a coluna `trechos.embedding` tem a
      dimensao de `Fabrica.Embedder.dimensoes/0`, posta la pela migracao nova, e o teste le a
      coluna do catalogo em vez de afirmar 384 literal.
      `verificar: mix test test/fabrica/memoria/ingestao_test.exs`
- [ ] `Ingestao.processar/3` com embedder de dimensao divergente da coluna devolve erro nomeado e
      **nao chama o embedder** (o contador de chamadas fica em zero), em vez de estourar no
      `UPDATE ... ::vector`.
      `verificar: mix test test/fabrica/memoria/ingestao_test.exs`
- [ ] O teste de regressao da atomicidade da T-043 continua provando que uma falha na escrita do
      embedding nao deixa trecho com `hash` gravado — agora por um caminho de falha que a guarda
      nao barra.
      `verificar: mix test test/fabrica/memoria/ingestao_test.exs`
- [ ] Com `Embedder.Falso` configurado em 768, uma passada completa de ingestao grava, reindexa e a
      busca hibrida da T-044 continua devolvendo o trecho certo — a pilha inteira roda fora de 384.
      `verificar: mix test test/fabrica/memoria/ingestao_test.exs`
- [ ] A checagem de tipos continua limpa com o contrato novo de `processar/3`.
      `verificar: mix dialyzer`
- [ ] A migracao diz, no proprio arquivo, o que acontece com o banco de teste, com o de
      desenvolvimento e com os trechos ja indexados.
      (inspecionavel — sem comando, e o verificador que le)

## Notas de execucao

### Ciclo 1

**O que foi feito:**

1. `priv/repo/migrations/20260915120000_dimensao_do_embedding.exs` (arquivo novo). `up/0` chama
   `Fabrica.Memoria.Dimensao.alinhar!/0` — nenhum SQL reescrito. `down/0` escreve o SQL direto
   (nao ha `alinhar!/0` para "volte a uma dimensao especifica"): derruba o indice HNSW, apaga
   trechos, `ALTER COLUMN ... TYPE vector(384)`, recria o indice. O moduledoc do arquivo explica
   o que acontece nos bancos de teste, dev e num banco com corpus ja indexado (criterio 6).
   Testado manualmente: `mix ecto.migrate` (no-op, coluna ja em 384) e `mix ecto.rollback`
   seguido de `mix ecto.migrate` de novo, os dois limpos.

2. `lib/fabrica/memoria/ingestao.ex`: `processar/3` agora chama uma guarda PRIVADA
   (`conferir_dimensao/1`) antes de montar qualquer lote. Ela le `Dimensao.atual/0` (reaproveita o
   sensor, sem duplicar a consulta ao catalogo) e compara com `embedder.dimensoes()` do embedder
   **realmente em uso nesta chamada** — que pode vir de `opts[:embedder]`, o mesmo padrao que o
   resto do modulo ja segue. Nao usei `Dimensao.conferir/0` diretamente porque ela so enxerga o
   embedder GLOBALMENTE configurado, e isso deixaria o desencontro invisivel quando o teste troca
   o embedder via `opts` sem tocar em config de aplicacao (o proprio motivo de `opts[:embedder]`
   existir). Divergencia devolve `{:erro, {:dimensao_divergente, coluna, embedder}}` SEM chamar
   `embedder.vetorizar/1`. `@spec` de `processar/3` passou a `resultado() | erro_dimensao()`, com
   `erro_dimensao/0` como `@typedoc` novo.

3. `test/fabrica/memoria/ingestao_test.exs`: dois `describe` novos.
   - `"guarda de dimensao (T-061)"`: (a) `Dimensao.atual() == Fabrica.Embedder.dimensoes()` e
     `Dimensao.conferir() == :ok` no banco de teste (le do catalogo, nao afirma 384 literal); (b)
     `EmbedderOutraDimensao` (declara 8, coluna e 384) via `opts[:embedder]` devolve o erro nomeado
     e o contador de chamadas fica em 0.
   - `"a pilha roda fora de 384 (T-061)"`: configura `Embedder.Falso` para 768, chama
     `Dimensao.alinhar!/0`, roda `Ingestao.processar/3` (contrato antigo intacto: 3 inseridos, 1
     chamada ao embedder) e confirma que `Busca.buscar/3` (T-044) acha o trecho certo em primeiro
     lugar — a pilha inteira (ingestao, indice HNSW recriado, busca hibrida) funcionando fora de
     384.

**A armadilha do Contexto — investigada, e o teste de atomicidade NAO precisou mudar.** O
`EmbedderDimensaoErrada` (teste de regressao da T-043) ja `dimensoes/0` **=> 384**, que BATE com a
coluna — a "dimensao errada" do nome e do comentario original se refere ao VETOR que
`vetorizar/1` devolve (1 posicao), nao ao que o modulo DECLARA. A guarda so pode conferir o que
`dimensoes/0` afirma, ANTES de chamar o embedder ("sem chamar o embedder" e o proprio criterio
dela) — ela nao tem como inspecionar o vetor de verdade sem primeiro faze-la. Como declarado e
coluna batem, a guarda deixa passar, o embedder e chamado, devolve `[1.0]`, e o
`UPDATE ... ::vector` da coluna `vector(384)` estoura no banco exatamente como antes. Rodei o
arquivo (ver abaixo) para confirmar empiricamente antes de decidir nao mexer no fixture — so
reescrevi o comentario acima dele para explicar POR QUE esse caminho continua provando o que
provava mesmo com a guarda no ar (a guarda checa a DECLARACAO, nao a saida real).

**Decisoes tomadas:**
- Contrato de retorno de `processar/3`: tupla `{:erro, {:dimensao_divergente, coluna,
  embedder}}` a mais (nao excecao) — mesma forma do erro nomeado de `Dimensao.conferir/0`, para
  quem ja conhece um reconhecer o outro.
- `Dimensao.ex` (T-059) nao foi tocado — fora das `areas` desta tarefa. A guarda em `Ingestao`
  reusa so a funcao publica `Dimensao.atual/0`.

**Testes executados** (NAO rodei a suite completa — regra do meu papel; escopo abaixo cobre a
tarefa):
- `mix test test/fabrica/memoria/` → 33 testes, 0 falhas (inclui `ingestao_test.exs` e
  `dimensao_test.exs`).
- `mix dialyzer` → limpo (criterio 5).
- `mix format --check-formatted`, `mix compile --warnings-as-errors`, `mix credo --strict` (
  projeto inteiro, sem tocar no banco) → limpos.
- LF conferido nos tres arquivos tocados (GUIA, Armadilhas).

**Reproduzir:** `mix test test/fabrica/memoria/ingestao_test.exs test/fabrica/memoria/dimensao_test.exs && mix dialyzer`

**Commit:** `ce27ce9`

## Verificacao


## Conformidade

Conformidade: cumpre

- Coluna nasce alinhada ao embedder configurado, migração nova → `priv/repo/migrations/20260915120000_dimensao_do_embedding.exs` (carimbo exato pedido), `up/0` chama `Fabrica.Memoria.Dimensao.alinhar!/0` sem reescrever SQL, `down/0` espelha exatamente o SQL de `criar_trechos` (mesmos nomes de índice, `vector(384)`) → provado por `test/fabrica/memoria/ingestao_test.exs:301-306` (lê a coluna do catálogo, não afirma 384 literal).
- `Ingestao.processar/3` recusa embedder de dimensão divergente antes de montar o lote, sem chamar o embedder → `lib/fabrica/memoria/ingestao.ex:85-132` (`conferir_dimensao/1` roda antes de `Enum.flat_map`/`gravar_lote`) → provado por `ingestao_test.exs:308-318` (contador de chamadas em 0, `{:erro, {:dimensao_divergente, 384, 8}}`).
- Teste de regressão da atomicidade da T-043 continua provando o mesmo invariante, por um caminho que a guarda não barra → `ingestao_test.exs:235-251` (`EmbedderDimensaoErrada` declara 384 — bate com a coluna, passa pela guarda — mas devolve vetor de 1 posição, estourando no `UPDATE ... ::vector`). A investigação registrada nas Notas de execução (por que o fixture não precisou mudar) é coerente com o código: a guarda só pode conferir o que `dimensoes/0` DECLARA, nunca o vetor real, porque inspecioná-lo exigiria chamar o embedder primeiro.
- Pilha inteira roda fora de 384 → `ingestao_test.exs:321-350` (`Embedder.Falso` em 768, `Dimensao.alinhar!/0`, ingestão grava, `Busca.buscar/3` acha o trecho certo em primeiro lugar).
- Dialyzer limpo com o contrato novo (`resultado() | erro_dimensao()`) → registrado na Verificação do testador (Ciclo 2, PASSOU) e consistente com o `@spec` de `processar/3` e `conferir_dimensao/1` em `ingestao.ex:57,85,122`.
- Migração documenta o comportamento nos três bancos → `@moduledoc` do arquivo novo, seção "## O que acontece em cada banco", cobrindo teste (no-op), desenvolvimento (apaga corpus, corpus é derivável, D-001 mediu 0) e troca de modelo depois de já ter corpus (T-064).
- Escopo: só os três arquivos declarados em `areas` mais os artefatos de processo (`_gestao/MAPA.md`, o próprio arquivo da tarefa) — `Dimensao.ex` (T-059) não foi tocado, por decisão explícita registrada nas Notas. Nenhuma sobra fora do pedido.

## Revisao

Aprovado sem ressalvas. Verifiquei:
- `lib/fabrica/memoria/ingestao.ex` inteiro: a guarda (`conferir_dimensao/1`) roda antes de qualquer `Enum.flat_map`/consulta ao banco/chamada ao embedder — a ordem no `case` garante "sem chamar o embedder" de verdade, não só nos casos que os testes cobrem.
- `lib/fabrica/memoria/dimensao.ex`: `alinhar!/0` é no-op quando `atual() == configurada()` — a migração roda sem custo nos bancos onde o embedder já é 384 (o caso do banco de teste e do dev hoje).
- `priv/repo/migrations/20260915120000_dimensao_do_embedding.exs`: `down/0` espelha exatamente a sequência e os nomes (`trechos_embedding_hnsw_index`, `vector(384)`) de `20260909070000_criar_trechos.exs` — conferi as duas lado a lado, sem divergência.
- O risco óbvio de um teste que muda config global (`Application.put_env(:fabrica, Falso, dimensoes: 768)`) e faz DDL (`ALTER TABLE`) vazar para outros testes: não vaza — `test/fabrica/memoria/dimensao_test.exs` (T-059) já documenta que o sandbox do Ecto desfaz DDL no rollback do fim do teste, e `ingestao_test.exs` segue o mesmo padrão (`async: false`, mesmo módulo de dados). Consistente com o precedente já revisado na T-059.
- O caminho de falha do teste de atomicidade (`EmbedderDimensaoErrada`) continua válido porque a guarda só pode inspecionar o que `dimensoes/0` DECLARA, nunca o vetor que `vetorizar/1` devolve de fato — o comentário atualizado no fixture está correto e o `@spec`/contrato não mentem sobre isso.
- Achado de processo (não bloqueia): as Notas registram apenas `**Commit:** \`ce27ce9\``, um hash só — não há retrabalho anterior de fato (o `tentativas: 1` é o primeiro ciclo do construtor; a seção "## Verificação" com acento, Ciclo 2, é um artefato do testador sem uma "## Verificação" Ciclo 1 correspondente e convive com a seção "## Verificacao" sem acento, vazia, do template — inconsistência de nomenclatura entre os dois portões anteriores, não deste diff. Registro para quem ajustar o template; não é motivo de reprovação aqui.


## Verificação

### Ciclo 2

- **[PASSOU] [executado] A suíte do projeto continua passando (não quebrou o que já existia)**
  Comando: `mix test`
  Saída: Finished in 55.5 seconds (25.5s async, 29.9s sync) / 41 doctests, 1099 tests, 0 failures

- **[PASSOU] [executado] No banco de teste, `Dimensao.conferir/0` devolve `:ok` — a coluna `trechos.embedding` tem a dimensao de `Fabrica.Embedder.dimensoes/0`, posta lá pela migração nova, e o teste lê a coluna do catálogo em vez de afirmar 384 literal.**
  Comando: `mix test test/fabrica/memoria/ingestao_test.exs`
  Saída: Finished in 1.3 seconds / 13 tests, 0 failures

- **[PASSOU] [executado] `Ingestao.processar/3` com embedder de dimensao divergente da coluna devolve erro nomeado e não chama o embedder (o contador de chamadas fica em zero), em vez de estourar no `UPDATE ... ::vector`.**
  Comando: `mix test test/fabrica/memoria/ingestao_test.exs --seed 0`
  Saída: Test "embedder de dimensao divergente da coluna e recusado antes de montar o lote, sem chamar o embedder" → PASSOU

- **[PASSOU] [executado] O teste de regressão da atomicidade da T-043 continua provando que uma falha na escrita do embedding não deixa trecho com `hash` gravado — agora por um caminho de falha que a guarda não barra.**
  Comando: `mix test test/fabrica/memoria/ingestao_test.exs --seed 0`
  Saída: Test "falha ao gravar o embedding nao deixa o trecho com hash gravado (transacao atomica)" → PASSOU

- **[PASSOU] [executado] Com `Embedder.Falso` configurado em 768, uma passada completa de ingestao grava, reindexa e a busca hibrida da T-044 continua devolvendo o trecho certo — a pilha inteira roda fora de 384.**
  Comando: `mix test test/fabrica/memoria/ingestao_test.exs --seed 0`
  Saída: Test "com Embedder.Falso configurado em 768, ingestao grava, reindexa, e a busca hibrida encontra o trecho certo" → PASSOU

- **[PASSOU] [executado] A checagem de tipos continua limpa com o contrato novo de `processar/3`.**
  Comando: `mix dialyzer`
  Saída: Total errors: 2, Skipped: 2, Unnecessary Skips: 0 / done (passed successfully)

- **[PASSOU] [julgado] A migração diz, no próprio arquivo, o que acontece com o banco de teste, com o de desenvolvimento e com os trechos já indexados.**
  Comando: Inspeção direta do arquivo priv/repo/migrations/20260915120000_dimensao_do_embedding.exs
  Base: Arquivo contém `@moduledoc` com seção "## O que acontece em cada banco" explicando: (1) banco de teste: no-op, mantém suite verde com Embedder.Falso padrão 384; (2) banco de desenvolvimento: apaga trechos quando há corpus porque conversão de dimensão exige DELETE (corpus é derivável de arquivos-fonte); (3) trocar de modelo depois: receita em T-064 com `alinhar!/0` manual + reingestão. Documentação clara, completa e conforme solicitado.

Suíte completa: 1099 testes passou, 0 falhou
Graus de prova: 6 executado(s), 1 julgado (de 7)
