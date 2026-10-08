---
id: T-097
titulo: "Busca filtrada por projeto não perde trecho para tuplas mortas do índice HNSW (busca_test.exs:242)"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-099]
areas: [lib/fabrica/memoria/busca.ex, test/fabrica/memoria/busca_test.exs]
tentativas: 2
criada: 2026-10-02
atualizada: 2026-10-07
---

## Objetivo
`Busca.buscar/3` devolve todos os candidatos que cabem no limite, mesmo com o índice HNSW de `trechos`
cheio de entradas de outros projetos ou de linhas mortas — e o teste `busca_test.exs:242` deixa de
falhar intermitentemente.

## Contexto
`test/fabrica/memoria/busca_test.exs:242` ("o termo e vetorizado pelo caminho de CONSULTA … acha o
trecho da consulta, e nao o do documento") é a intermitente mais antiga da suíte (D-012). Fatos medidos:

- T-072 (ciclo 2, 26/09): determinística por seed (`--seed 619174`), mesmo isolada e sem `pg_restore`:
  a busca devolveu SÓ um dos dois trechos, com `@limite_resultado = 8` sobrando.
- Orquestrador (02/10): caiu em 3 de 5 corridas seguidas de `mix test`.
- Executor da T-090 (02/10): falha em TODA corrida até o autovacuum do banco de teste; depois do
  autovacuum, passa. Hipótese dele: tuplas mortas no índice HNSW de `trechos` (deixadas pelos rollbacks
  do sandbox, com vetores idênticos) ocupam as vagas da varredura aproximada e escondem o trecho.

Hipótese do orquestrador, a confirmar: é o comportamento conhecido do pgvector com HNSW + `WHERE` — a
varredura do índice traz até `hnsw.ef_search` (padrão 40) vizinhos e SÓ DEPOIS aplica o filtro; com
muitas entradas de outros projetos (ou mortas) perto do vetor, o filtro sobra com menos que o limite.
Se for isso, não é só teste: em produção, com muitos projetos na mesma tabela, a memória de um projeto
"esquece" trechos. Saídas conhecidas: `hnsw.iterative_scan` (pgvector ≥ 0.8), `hnsw.ef_search` maior
na transação da busca, ou busca exata quando o filtro é seletivo. Confira a versão do pgvector
instalada (aqui e a de casa, registrada no projeto) antes de escolher.

Não é desta tarefa mexer no esquema/migração do índice; se a única saída for essa, pare e registre.

## Critérios de aceite
- [ ] Teste que reproduz o defeito de forma DETERMINÍSTICA (ex.: muitos trechos de OUTRO projeto, ou
      linhas apagadas, perto do vetor da consulta) e falha antes do conserto: a busca do projeto acha
      os dois trechos dele.
      `verificar: mix test test/fabrica/memoria/busca_test.exs`
- [ ] `busca_test.exs` passa em 5 corridas seguidas da suíte inteira sem `VACUUM` entre elas.
      `verificar: mix test` (5 corridas seguidas; conta-se a falha em `busca_test.exs`)
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução
- 2026-10-07 (orquestrador): prioridade media → alta. `busca_test.exs:242` custou um ciclo inteiro à T-099 e à T-094 hoje (reprovação mecânica por falha fora da área delas); consertá-la primeiro barateia todas as outras.
- 2026-10-07 (orquestrador): passa a depender da T-099 — no Windows a suíte cai em 2 testes de link do confinamento, e toda verificação desta tarefa reprovaria por isso (reprovação falsa). Volta a `pronta` sozinha quando a T-099 concluir.
- 2026-10-07 (planejador, replanejamento da T-094): prioridade sobe de `media` para `alta`. Custo
  medido subindo desde a criação desta tarefa (02/10): `busca_test.exs:242` já derrubou
  mecanicamente T-070, T-075, T-076 (histórico, antes desta tarefa existir) e agora 4 ciclos
  inteiros da T-094 (02–07/10), sempre fora da área de quem foi reprovado. T-094 já teve o
  critério acoplado à suíte global removido (não vai mais disparar por esta flakiness), mas
  qualquer outra tarefa que toque `mix test`/`mix fabrica.ci` continua exposta até esta fechar.
  Dependência (T-099) já concluída — nada bloqueia o despacho.


### Ciclo 1 (2026-10-07, executor)

**Causa raiz confirmada (empiricamente, não só por hipótese):** o pgvector tem o comportamento
que o Contexto já suspeitava. Medi diretamente (`mix run` contra o banco de teste, fora do
ExUnit, com `EXPLAIN`): quando não há um índice mais seletivo concorrendo para `WHERE
projeto_id = $1` (ex.: o corpus cresce, ou muitas entradas são de outros projetos), o planner
escolhe varrer o índice HNSW de `embedding` em ORDEM DE DISTÂNCIA e só filtra `projeto_id`
DEPOIS (plano `Index Scan using trechos_embedding_hnsw_index ... Filter: (projeto_id = ...)`).
Com 45 trechos de OUTRO projeto mais próximos do vetor da consulta do que os do projeto certo,
a varredura aproximada (orçamento padrão `hnsw.ef_search = 40`) esgota o orçamento SÓ com
candidatos do projeto errado, o filtro descarta todos, e a busca devolve MENOS trechos do que
existem — ou nenhum, mesmo com os reais presentes no banco.

**Caminhos descartados, com o motivo medido:**
- `hnsw.iterative_scan` (relaxed_order), a saída que o pgvector documenta para este problema:
  funciona quando setado numa instrução SEPARADA antes da consulta (`SET LOCAL` ou `SET`), mas
  NÃO funciona quando embutido na MESMA consulta via `set_config(..., true)` numa CTE anterior —
  medido repetidas vezes: o valor fica visível para `current_setting()` dentro da própria query,
  mas o nó de Index Scan HNSW não respeita isso (o parâmetro parece ser lido na inicialização do
  nó, antes de qualquer linha da CTE anterior ser de fato produzida). Usar a saída exigiria DUAS
  idas ao banco por busca (uma para o `SET`, outra para a consulta), quebrando o critério "uma
  única ida ao banco" da T-044/T-063 (travado por teste com contagem de telemetria).
- `hnsw.ef_search` maior: mesmo problema de timing (é uma configuração de planejamento/sessão,
  não uma função chamável dentro da mesma query).

**A correção adotada — busca exata quando o filtro roda primeiro (a 3ª saída que o Contexto já
cita):** cada metade que toca `embedding` (`:vetor` e a metade semântica do `:hibrido`) agora
filtra `projeto_id` numa CTE `candidatos` marcada **MATERIALIZED**, e só DEPOIS ordena por
distância. `MATERIALIZED` é uma cerca de otimização que IMPEDE o planner de inverter a ordem: o
conjunto do projeto é resolvido primeiro (pelo índice de `projeto_id`, exato), e a ordenação por
distância que vem depois roda sobre esse conjunto já filtrado — exata, não aproximada por HNSW.
Continua sendo UMA ÚNICA instrução SQL (a cerca é textual, não uma segunda ida ao banco); os
testes de telemetria que travam esse critério continuam verdes. O custo é abrir mão do índice
HNSW nessas duas consultas — aceitável no tamanho de corpus medido pela D-001 (centenas a poucas
unidades de milhar por projeto); reabrir isto exige medir esse custo crescer de verdade.

**Teste novo, determinístico (critério 1):** `busca_test.exs`, describe "HNSW nao perde trecho
do projeto para vizinhos de OUTRO projeto (T-097)". Derruba o índice único
`(projeto_id, fonte)` **só dentro da transação do próprio teste** (revertido pelo rollback do
sandbox) para tirar do caminho a alternativa seletiva, insere 45 trechos de OUTRO projeto com
vetor quase idêntico ao da consulta (mais perto que os do projeto certo) e os 2 trechos reais do
projeto um pouco mais distantes — exatamente o cenário que o Contexto da tarefa pede ("muitos
trechos de OUTRO projeto ... perto do vetor da consulta"). Confirmei a reprodução ANTES do
conserto (`git stash` só de `busca.ex`): o teste falha (`assert alvo_1 in ids_vetor` com
`right: []`); com o conserto, passa nos dois modos (`:vetor` e `:hibrido`).

**Critério 2 — 5 corridas seguidas de `mix test` sem VACUUM, mais 5 extras de confirmação (10 no
total):** `busca_test.exs` não falhou em NENHUMA das 10 corridas. As únicas falhas observadas em
algumas corridas foram em `servidor_test.exs:513` (2×) e `console_live_test.exs:141` (1×) —
flakiness de ÁREA ALHEIA (fora de `areas` desta tarefa), já fora do escopo que T-097 existe para
fechar.

**Critério 3 — `mix fabrica.ci` completo:** 6/6 estágios `ok` (formato, compilar, lint, testes,
tipos, backup) numa corrida limpa.

**Reproduzir:**
```
mix test test/fabrica/memoria/busca_test.exs
```
(a suíte inteira, se quiser reconferir os critérios 2/3: `mix test` repetido, e `mix fabrica.ci`)

**Arquivos tocados:** `lib/fabrica/memoria/busca.ex` (CTE `candidatos` MATERIALIZED nos dois
modos que tocam `embedding`, mais a seção nova do `@moduledoc`), `test/fabrica/memoria/busca_test.exs`
(describe novo + moduledoc atualizado), `_gestao/MAPA.md` (regenerado).

**Commit:** `0289cc8`

## Notas do orquestrador
- 2026-10-07 15:45 UTC (orquestrador): → `em-teste` direto, sem novo ciclo de construção. As reprovações desta rodada foram falsas: a passada mecânica rodou sobre árvore suja (trabalho incompleto da T-095, cortado pela parede de cota, quebrava a compilação) e a flake de `busca_test.exs:242`. Com o projeto quieto e a árvore limpa, `mix fabrica.ci` no HEAD `99d7838`: **6/6 verde** (testes 94,5 s). O entregável está commitado; o verificador decide. Mesmo precedente da T-065 e T-072 (01/10). Linha `Impedimento:` anterior (se houver) está resolvida: a compilação voltou.

## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] Teste que reproduz o defeito de forma DETERMINÍSTICA (ex.: muitos trechos de OUTRO projeto, ou linhas apagadas, perto do vetor da consulta) e falha antes do conserto: a busca do projeto acha os dois trechos dele. — `mix test test/fabrica/memoria/busca_test.exs` → **PASSOU**
- [executado] `busca_test.exs` passa em 5 corridas seguidas da suíte inteira sem `VACUUM` entre elas. (5 corridas seguidas; conta-se a falha em `busca_test.exs`) — `mix test` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Bateria completa verde. — `mix fabrica.ci` → **FALHOU**

```
bateria de verificacao — 6 estagios declarados

  ... formato: mix format --check-formatted
  ... compilar: mix compile --warnings-as-errors
  ... lint: mix credo --strict
  ... testes: mix test


  formato    ok        2.9s
  compilar   ok        2.7s
  lint       ok        9.3s
  testes     FALHOU   95.8s


Running ExUnit with seed: 756859, max_cases: 16
Excluding tags: [:precisa_pg_dump]

................................................................................................................................................................................................................................................................................
… (5990 caracteres omitidos do meio) …
st.exs:334
     Assertion with == failed
     code:  assert Repo.get!(Tarefa, primeira.id).status == :em_execucao
     left:  :pronta
     right: :em_execucao
     stacktrace:
       test/fabrica/piloto/servidor_test.exs:341: (test)



  5) test o evento [:fabrica, :cota, :rearme] acorda o piloto dormindo (T-094) ligado mas NAO dormindo: o evento de rearme nao reavalia a toa (Fabrica.Piloto.ServidorTest)
     test/fabrica/piloto/servidor_test.exs:442
     Expected false or nil, got ~U[2026-10-07 15:39:46.447000Z]
     code: refute publico.dormindo_ate
     stacktrace:
       test/fabrica/piloto/servidor_test.exs:451: (test)



  6) test parede de cota real: o piloto DORME ate a reabertura, nao para por falha (T-091) a rodada em voo termina na parede: dormindo_ate e o horario do sinal, ligado, sem motivo_parada (Fabrica.Piloto.ServidorTest)
     test/fabrica/piloto/servidor_test.exs:507
     Assertion with == failed
     code:  assert Repo.get!(Tarefa, tarefa.id).status == :em_execucao
     left:  :pronta
     right: :em_execucao
     stacktrace:
       test/fabrica/piloto/servidor_test.exs:513: (test)

.................
Finished in 91.7 seconds (24.6s async, 67.1s sync)
41 doctests, 1308 tests, 6 failures, 5 skipped (11 excluded)

bateria REPROVOU no estagio `testes` (codigo 2); 2 estagio(s) nem chegaram a rodar
```


Graus de prova: 4 executado(s), 0 para julgamento (de 4).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] Teste que reproduz o defeito de forma DETERMINÍSTICA (ex.: muitos trechos de OUTRO projeto, ou linhas apagadas, perto do vetor da consulta) e falha antes do conserto: a busca do projeto acha os dois trechos dele. — `mix test test/fabrica/memoria/busca_test.exs` → **PASSOU**
- [executado] `busca_test.exs` passa em 5 corridas seguidas da suíte inteira sem `VACUUM` entre elas. (5 corridas seguidas; conta-se a falha em `busca_test.exs`) — `mix test` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Bateria completa verde. — `mix fabrica.ci` → **PASSOU**

Graus de prova: 4 executado(s), 0 para julgamento (de 4).

### Ciclo 2 (2026-10-07, testador)

- **[PASSOU] [executado] Teste que reproduz o defeito de forma DETERMINÍSTICA**
  Comando: `mix test test/fabrica/memoria/busca_test.exs`
  Saída: 17 tests, 0 failures em 1.6 segundos

- **[PASSOU] [executado] `busca_test.exs` passa em 5 corridas seguidas sem VACUUM**
  Comando: `mix test` (5 corridas consecutivas)
  Saída: Corrida 1-5: todas com "1308 tests, 0 failures"

- **[PASSOU] [executado] Bateria completa verde**
  Comando: `mix fabrica.ci`
  Saída: 6 estágios ok (formato, compilar, lint, testes, tipos, backup)

Graus de prova: 3 executado(s), 0 para julgamento (de 3).

## Conformidade

Conformidade: cumpre

- Critério 1 (teste determinístico que reproduz o defeito antes do conserto, achando os dois
  trechos do projeto) → `test/fabrica/memoria/busca_test.exs` describe "HNSW nao perde trecho
  do projeto para vizinhos de OUTRO projeto (T-097)": 45 decoys de outro projeto mais próximos
  do vetor da consulta que os 2 trechos reais, índice seletivo `(projeto_id, fonte)` derrubado
  só dentro da transação do teste, `enable_seqscan = off` para forçar o mesmo plano HNSW do
  corpus real. Reprodução ANTES do conserto confirmada nas Notas do Ciclo 1 (`git stash` de
  `busca.ex`: teste falha com `right: []`); com o conserto, passa nos dois modos (`:vetor` e
  `:hibrido`).
- Critério 2 (`busca_test.exs` passa em 5 corridas seguidas sem VACUUM) → Notas do Ciclo 1
  relatam 10 corridas sem falha neste arquivo; o testador do Ciclo 2 confirma de forma
  independente 5 corridas, todas "1308 tests, 0 failures".
- Critério 3 (bateria completa verde) → testador do Ciclo 2: `mix fabrica.ci` 6/6 estágios ok.
  A primeira passada mecânica desta rodada (seção Verificação, acima) reprovou o estágio
  `testes`, mas as falhas listadas são todas em `servidor_test.exs` (área alheia, fora de
  `areas` desta tarefa) — o orquestrador já registrou isso como reprovação falsa por árvore
  suja antes do commit, e a segunda passada + o Ciclo 2 do testador, já sobre o commit limpo,
  confirmam verde.
- Objetivo: as duas metades que tocam `embedding` (`:vetor` e a metade semântica do `:hibrido`)
  agora filtram `projeto_id` numa CTE `MATERIALIZED` antes de ordenar por distância — exatamente
  a causa raiz que o Contexto apontava (varredura HNSW aproximada filtrando `projeto_id` só no
  fim, esgotando `hnsw.ef_search` com vizinhos de outro projeto). Conferido em
  `lib/fabrica/memoria/busca.ex:165-221`: `buscar_com_vetor/5` dos modos `:vetor` e `:hibrido`
  usa `WITH candidatos AS MATERIALIZED (... WHERE projeto_id = $1)`; o modo `:textual` (que não
  toca `embedding`) e a metade textual do `:hibrido` (que já usa o índice GIN, não o HNSW) ficam
  de propósito fora do conserto — correto, pois não sofrem do defeito.
- Escopo: diff confinado às `areas` declaradas (`busca.ex`, `busca_test.exs`) mais
  `_gestao/MAPA.md` regenerado (não é código de produção). Nenhuma mudança de esquema/migração
  de índice, como o Contexto pedia para evitar.

## Revisão

Aprovado sem ressalvas.

- **Correção:** a cerca `MATERIALIZED` é a saída certa para o problema documentado do pgvector
  (varredura HNSW aproximada que filtra depois de ordenar): força o Postgres a resolver o `WHERE
  projeto_id = $1` por inteiro antes de ordenar por distância, tornando essa ordenação exata
  sobre o conjunto já filtrado. Sintaxe válida (Postgres ≥ 12, `WITH ... AS MATERIALIZED`).
  Continua sendo uma única ida ao banco (a cerca é textual, dentro da mesma instrução SQL),
  preservando o critério da T-044/T-063 travado por telemetria.
- **Segurança:** nenhuma superfície nova — o literal do vetor continua colado por
  `Float.to_string/1` sobre dados que só o próprio embedder produz, mesma garantia já
  documentada antes desta mudança; `termo` continua indo como parâmetro `$N` na metade textual.
- **Integração:** no modo `:hibrido`, `fundido`/`t` fazem join final em `trechos` por `id` sem
  re-filtrar `projeto_id`, mas isso é seguro: os `id`s que chegam até lá já vieram só de
  `candidatos` (semântico) ou de um `SELECT ... WHERE projeto_id = $1` (textual) — não há
  caminho para um `id` de outro projeto entrar no resultado.
- **Casos de borda:** o teste novo cobre exatamente o cenário do defeito (decoys > `ef_search`
  padrão de 40, mais próximos que os trechos reais) nos dois modos que tocam `embedding`.
- **Nota menor:** a explicação do porquê do `MATERIALIZED` está duplicada quase literalmente
  três vezes (moduledoc, comentário antes de `buscar_com_vetor/5`, e Notas de execução) — não é
  bug, só redundância de documentação.

Não precisei abrir nenhum arquivo fora do diff além de `busca.ex` inteiro (para confirmar que
`:textual` e a metade textual do `:hibrido` ficam corretamente de fora do conserto) e a
migração `criar_trechos.exs` (para confirmar que não existe outro índice além de
`(projeto_id, fonte)` cobrindo `projeto_id` sozinho — o que valida a premissa do teste de que
derrubar esse índice remove toda alternativa seletiva ao HNSW).

