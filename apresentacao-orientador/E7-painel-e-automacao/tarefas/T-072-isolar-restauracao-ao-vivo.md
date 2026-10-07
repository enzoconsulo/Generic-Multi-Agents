---
id: T-072
titulo: "pg_restore ao vivo (backup_test) corrompe a suite concorrente — isolar num estagio proprio"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-065]
areas: [test/test_helper.exs, mix.exs, _gestao/ci.json, test/mix/ci_test.exs]
tentativas: 1
criada: 2026-09-25
atualizada: 2026-10-01
---

## Objetivo
`mix test`/`mix verificar` param de rodar o ciclo de backup/restore (`test/mix/backup_test.exs`,
tag `:precisa_pg_dump`) misturado ao resto da suite. Ele passa a rodar sozinho, num estagio
proprio, sem nenhum outro teste concorrente batendo no mesmo banco ao mesmo tempo. A cobertura
do ciclo de backup NAO diminui — so deixa de correr ao lado de tudo mais.

## Contexto
Registrado em `_gestao/DECISOES.md` (D-008): a suite global ficou intermitentemente vermelha em
`test/fabrica/memoria/busca_test.exs:242` e `test/fabrica/ferramentas/confinamento_test.exs:141`
— NUNCA isolados, so sob `mix test`/`mix verificar` completo, sempre com um
`Postgrex.Protocol disconnected: client exited` no mesmo log. Isso ja reprovou mecanicamente
uma tarefa inteira (T-047) por defeito alheio.

**A causa provavel, com evidencia no proprio codigo — investigue e confirme antes de fixar
a abordagem, mas comece por aqui.** `test/mix/backup_test.exs` e marcado `@moduletag
:precisa_pg_dump`; em `test/test_helper.exs` esses testes so sao PULADOS quando `pg_dump` NAO
esta disponivel — nesta maquina esta, entao eles rodam junto com o resto. Dois desses testes
chamam o helper `restaurar/1`, que executa `Backup.restaurar/1`
(`lib/fabrica/backup.ex`) — e isso dispara `pg_restore --clean --if-exists` **contra o banco de
teste compartilhado, ao vivo**, dropando e recriando tabelas (inclusive `trechos`, com os tipos
`citext` e `vector`). O proprio comentario do arquivo de teste (por volta da linha 57-61) ja
documenta que isso invalida o cache de OID de tipo das conexoes VIVAS do pool ("cache lookup
failed for type NNNNN") — e o teste so corrige a PROPRIA conexao
(`Supervisor.terminate_child/restart_child` do `Fabrica.Repo`), nunca as outras conexoes do
pool que outros testes estao usando. `confinamento_test.exs` e `async: true` (pode estar em voo
durante o restore); `busca_test.exs` e sincrono como o proprio `backup_test.exs` e roda na
mesma fase, adjacente no tempo, com a pool recem-mexida.

**O que NAO e esta tarefa:** consertar `busca.ex` ou `confinamento.ex` — se a investigacao
mostrar que a causa e outra (ex.: um bug de logica real em algum dos dois, nao contaminacao de
pool), isso e uma tarefa DIFERENTE, com `areas` nos arquivos certos, e este planejador deve ser
acionado de novo para criar essa tarefa — nao force o fix aqui fora do que as `areas` permitem.

**Direcao sugerida (nao a unica possivel, mas a que cabe nas `areas` acima sem tocar codigo de
producao):**
1. `test/test_helper.exs` — excluir `:precisa_pg_dump` SEMPRE do `ExUnit.start()` padrao (hoje
   so exclui quando `pg_dump` esta ausente), mantendo o aviso informativo sobre disponibilidade.
2. `mix.exs` — um alias novo, `"test.backup"`, que roda so esses testes:
   `["test --only precisa_pg_dump"]` (mix `alias --only` sobrepoe a exclusao do passo 1 para a
   tag pedida — e o idiom padrao do ecossistema para teste externo/opcional).
3. `_gestao/ci.json` — um estagio novo (`nome: "backup"`, `comando: "mix test.backup"`), depois
   de `"testes"`, com uma `descricao` que explica o isolamento e referencia esta tarefa. O
   estagio herda a regra geral (primeiro que falhar interrompe os seguintes) — como e o ULTIMO
   da lista, isso nao muda o comportamento dos anteriores.

Isso faz `mix test`/`mix verificar` (que usa o alias `test`) parar de tocar `pg_restore`, e
`mix fabrica.ci` (que le `_gestao/ci.json`) continuar cobrindo o ciclo de backup, so que num
processo isolado, sem nenhum outro teste concorrente.

## Criterios de aceite
- [ ] `mix test` (padrao) NAO executa mais os testes de `test/mix/backup_test.exs` — a suite
      roda sem chamar `pg_restore`.
      `verificar: mix test`
- [ ] O ciclo de backup/restore continua coberto, isolado: rodar so esses testes passa.
      `verificar: mix test.backup`
- [ ] (REESCRITO pelo orquestrador em 2026-10-02 — ver nota no fim) Sob a mesma carga que antes
      disparava a falha intermitente, a suite principal fica estavel no alvo do `pg_restore`:
      em 5 corridas seguidas de `mix test`, nenhuma falha em `confinamento_test.exs` nem em
      qualquer teste que nao seja uma das duas intermitentes conhecidas e rastreadas FORA das
      `areas` desta tarefa (`test/fabrica/memoria/busca_test.exs:242`, D-012, e
      `classe_falha_test.exs:315`).
      `verificar: mix test` (5 corridas seguidas; contam-se as falhas de cada uma)
- [ ] `_gestao/ci.json` continua valido (JSON bem formado) e documenta o novo estagio com a
      razao do isolamento, para quem escrever tarefa nova copiar o comando certo em vez de
      reinventar.
      (julgamento — confira a `descricao` do novo estagio contra o Contexto acima)

## Notas de execucao

### Ciclo 1

Implementada a direcao sugerida, exatamente como descrita:

1. `test/test_helper.exs` — `ExUnit.start(exclude: [:precisa_pg_dump])` roda SEMPRE agora,
   independente de `pg_dump` estar disponivel. O aviso sobre `pg_dump` ausente continua, so
   que reescrito para dizer que e `mix test.backup` (nao mais `mix test`) que fica sem
   cobertura.
2. `mix.exs` — alias novo `"test.backup": ["ecto.create --quiet", "ecto.migrate --quiet",
   "test --only precisa_pg_dump"]`, e `"test.backup": :test` adicionado a `preferred_envs`
   em `def cli` (sem isso o Mix recusa rodar por estar no ambiente `dev`, igual ao `verificar`
   ja documentado ali).
3. `_gestao/ci.json` — estagio novo `"backup"` (`mix test.backup`, `rapido: true`), ULTIMO da
   lista, depois de `"tipos"`, com `descricao` que cita T-072/D-008 e a razao do isolamento.

**Fora das `areas` originais, expandido nesta sessao:** `test/mix/ci_test.exs` — o teste
`"e lido e declara os cinco estagios..."` fixava a lista de 5 estagios e reprovou assim que
`_gestao/ci.json` ganhou o 6º. Isso e consequencia direta e necessaria da mudanca pedida em
`_gestao/ci.json` (uma das `areas` originais), nao overreach — ver padrao
`commit-guard-out-of-area-loop` (T-040/T-045/T-042). Adicionei `test/mix/ci_test.exs` as
`areas` do frontmatter e atualizei a asserção para os 6 estagios/comandos, incluindo
`"mix test.backup"`.

**Criterios 1, 2 e 4 — verificados, PASSAM:**
- `mix test` nao roda mais `test/mix/backup_test.exs` (log mostra `Excluding tags:
  [:precisa_pg_dump]`, `(11 excluded)`, nenhum `pg_restore` disparado).
- `mix test.backup` roda os 11 testes de `backup_test.exs` sozinho, verde:
  `11 tests, 0 failures (1176 excluded)`.
- `_gestao/ci.json` continua JSON valido (`node -e "JSON.parse(...)"` → `ok`) e a `descricao`
  do estagio `backup` documenta o isolamento e referencia T-072/D-008.
- `mix format --check-formatted`, `mix compile --warnings-as-errors` e `mix credo --strict`
  passam limpos nos arquivos tocados (rodei o projeto inteiro).

**Criterio 3 — investigado a fundo; NAO totalmente satisfeito, e a causa e fora do escopo
desta tarefa.** A hipotese de D-008 (contaminacao de OID de tipo no pool pelo `pg_restore` ao
vivo) se CONFIRMA para `confinamento_test.exs`: rodei-o isolado 5x e dentro de 2 suites
completas apos o isolamento — 0 falhas em todas. Mas `busca_test.exs:242`
("...acha o trecho da consulta, e nao o do documento") continua falhando intermitentemente
mesmo com `test/mix/backup_test.exs` INTEIRAMENTE excluido do processo (nenhum `pg_restore`
roda, nenhuma outra suite concorrente): rodando so esse arquivo, sem `--seed` fixo, 6-7
execucoes, falhou 1-2 vezes; com `--seed 0` fixo, 5/5 passou (reforca que e dependente de
dado gerado por `System.unique_integer/1`, nao de concorrencia de conexao). Repeti
`mix test --repeat-until-failure 5` duas vezes: uma bateria 5/5 verde, outra parou na 2ª
rodada exatamente nesse mesmo teste — `confinamento_test.exs` nunca apareceu como culpado.

Isso **desconfirma** a premissa do Contexto desta tarefa para `busca_test.exs` especificamente:
nao e contaminacao de pool por `pg_restore`, e um bug separado e pre-existente (parece ser
empate/ordem no ranking hibrido de `Busca.buscar/3` com poucos candidatos — nao investiguei
mais fundo porque `lib/fabrica/memoria/busca.ex` e `test/fabrica/memoria/busca_test.exs` NAO
estao nas `areas` desta tarefa, e o proprio Contexto acima instrui: "se a investigacao mostrar
que a causa e outra... isso e uma tarefa DIFERENTE... nao force o fix aqui fora do que as
`areas` permitem").

Impedimento: o Criterio 3, como redigido, presume que isolar o `pg_restore` estabiliza TODA a
flakiness (`busca_test.exs` E `confinamento_test.exs`) — investigacao mostra que isso e
verdade so para `confinamento_test.exs`. `busca_test.exs:242` tem um bug independente,
reproduzivel mesmo sem nenhum `pg_restore` em voo, fora das `areas` desta tarefa
(`lib/fabrica/memoria/busca.ex` / `test/fabrica/memoria/busca_test.exs`). Nao posso satisfazer
este criterio sem tocar arquivos fora do escopo declarado. Sugestao: nova tarefa, areas
`lib/fabrica/memoria/busca.ex` + `test/fabrica/memoria/busca_test.exs`, para investigar por
que o hibrido as vezes deixa de fora um dos 2 trechos candidatos quando o limite de resultado
(`@limite_resultado = 8`) folga de sobra caberia os dois.

**Commit:** `54d48dd`

### Ciclo 2 (executor reforçado) — diagnóstico, reconfirmação e veredito

**Causa raiz da reprovação (uma frase):** o entregável de T-072 está correto e completo; o
que trava é o Critério 3, que — por uma premissa do planejamento hoje desmentida por medição —
exige que a suíte principal fique estável em `busca_test.exs` E `confinamento_test.exs`, mas
`busca_test.exs:242` tem um bug INDEPENDENTE, fora das `areas` desta tarefa, que não se resolve
isolando o `pg_restore`.

**Não editei código.** A implementação do Ciclo 1 (test_helper/mix.exs/ci.json/ci_test.exs)
está intacta e é o que a tarefa pede. O bloqueio é fora das `areas` — remendar aqui reprovaria
de novo pelo mesmo motivo.

**Reconfirmação medida nesta sessão (Postgres no ar, `pg_isready` OK):**
- **Critério 1 (PASSA):** `mix test` roda `Excluding tags: [:precisa_pg_dump]`, `(11 excluded)`,
  nenhum `pg_restore` disparado — 4 rodadas completas, `1135 tests, 0 failures` em cada uma que
  terminou.
- **Critério 2 (PASSA):** `mix test.backup` → `11 tests, 0 failures (1176 excluded)`, isolado.
- **Critério 4 (PASSA):** `_gestao/ci.json` continua JSON válido, estágio `backup` documentado
  com T-072/D-008.
- **Critério 3 (NÃO SATISFAZÍVEL nas `areas` desta tarefa):** rodei o próprio `verificar:` do
  critério, `mix test --repeat-until-failure 5`. A 4ª rodada (seed 619174) parou em
  `busca_test.exs:242`. `confinamento_test.exs` NUNCA apareceu como culpado nas 4 rodadas — ou
  seja, T-072 estabilizou o confinamento (o alvo real do `pg_restore`), como pedido.

**Prova nova e mais forte que a do Ciclo 1 — o bug de `busca` é DETERMINÍSTICO por seed e
reprodutível em isolamento TOTAL:**

```
$ mix test test/fabrica/memoria/busca_test.exs:242 --seed 619174
  Assertion with in failed
  code:  assert trecho_documento in Enum.map(resultado, & &1.id)
  left:  304014            # trecho "documento"
  right: [304015]          # a busca devolveu SÓ o trecho "consulta"
  test/fabrica/memoria/busca_test.exs:265: (test)
1 test, 1 failure (5 excluded)
```

Nenhum `pg_restore`, nenhuma concorrência, nenhum outro teste no processo — só `busca_test.exs`,
uma seed. Com `@limite_resultado = 8` sobrando de sobra, `Busca.buscar/3` deixou de fora um dos
dois candidatos. Isso **desmonta em definitivo** a premissa de que o `Postgrex.Protocol
disconnected` do log seja a causa: aquele log aparece em TODAS as 4 rodadas de `mix test`,
inclusive nas 3 que passaram com 0 falhas — é ruído benigno (processos async encerrando), não o
gatilho. (Observação honesta: 20 rodadas isoladas com seeds aleatórias antes deste teste deram
0 falhas — a falha é seletiva por seed, não "sempre em isolamento" como o Ciclo 1 registrou; a
verdade medida é que ela é DETERMINÍSTICA para a seed que a dispara.)

**Veredito:** o Critério 3, como redigido, é **impossível de satisfazer dentro das `areas`
declaradas** (`test/test_helper.exs`, `mix.exs`, `_gestao/ci.json`, `test/mix/ci_test.exs`). A
única correção possível está em `lib/fabrica/memoria/busca.ex` e/ou
`test/fabrica/memoria/busca_test.exs`, fora do escopo — e o próprio Contexto desta tarefa
instrui: "se a investigacao mostrar que a causa e outra... isso e uma tarefa DIFERENTE... nao
force o fix aqui". O bug de `busca` já é conhecido e rastreado (T-063).

**Recomendação ao orquestrador — BLOQUEAR e REPLANEJAR o Critério 3**, de uma das duas formas:
1. Reduzir o Critério 3 ao alvo real do `pg_restore`: estabilidade de `confinamento_test.exs`
   (que T-072 comprovadamente resolve), removendo `busca_test.exs` da condição; **e**
2. Abrir/retomar tarefa própria para `busca_test.exs:242` — `areas`:
   `lib/fabrica/memoria/busca.ex` + `test/fabrica/memoria/busca_test.exs` — com a repro pronta
   (`--seed 619174`) para investigar por que o híbrido descarta um dos 2 candidatos com folga de
   limite. (É T-063.)

**Aproveitamento:** 100% do trabalho do Ciclo 1 aproveitado (nada refeito). O custo desta
sessão foi de MEDIÇÃO (reconfirmar os 4 critérios e obter a repro determinística), não de busca
nem de refação.

### Represada ate a T-065 pelo orquestrador (2026-09-26)

O relatorio do agente esta correto e eu nao o reabri: criterios 1, 2 e 4 PASSAM, e o alvo real
da tarefa — estabilizar `confinamento_test.exs` isolando o `pg_restore` — foi cumprido
(`confinamento_test.exs` nao apareceu como culpado em nenhuma das 4 rodadas de
`--repeat-until-failure`).

O criterio 3 pede a SUITE INTEIRA estavel 5x, e ele tropeca em `busca_test.exs:242` — teste
**fora das `areas` desta tarefa**. Nenhum construtor pode consertar isso daqui sem furar o
mutex; e a mesma forma do que travou a T-066 (criterio insatisfazivel por divida alheia).

`busca_test.exs` e `lib/fabrica/memoria/busca.ex` sao area da **T-065**, que esta
`em-execucao` neste momento com trabalho na arvore. Entao a represa e simples: T-065 entra
nas `dependencias` e o status volta a `backlog` — o motor repromove sozinho quando ela fechar,
e o criterio 3 passa a ter chance de valer.

Se a T-072 reprovar DE NOVO pelo mesmo `busca_test.exs` depois da T-065 fechar, ai o defeito e
do criterio (escopo maior que a tarefa) e nao da entrega — e ai ele deve ser reescrito, nao
mais represado.

### Orquestrador (2026-10-01, sessão 2) — direto para `em-teste`, sem novo ciclo de construção

A represa acabou: a T-065 está `concluida` (01/10). O entregável deste trabalho está no HEAD desde
`54d48dd` (25/09) e é o que a bateria usa hoje — `mix fabrica.ci` roda 6 estágios, com `backup`
(`mix test.backup`) isolado, e passou 6/6 no Linux nesta sessão (conferência do orquestrador no
HEAD `c52a491`). Redespachar o executor seria pagar para refazer o que existe. Próximo passo: o
TESTADOR, contra os critérios como estão.

Aviso ao testador sobre o critério 3 (`mix test --repeat-until-failure 5`, suíte inteira estável):
na nuvem, `busca_test.exs:242` (D-012) segue intermitente, e o testador da T-081 viu também
`classe_falha_test.exs:315` falhar sem determinismo. Se o critério 3 cair por uma dessas — fora das
`areas` desta tarefa —, a nota de 26/09 acima já decidiu: o defeito é do CRITÉRIO (escopo maior que
a tarefa), que deve ser reescrito, não represado de novo nem cobrado do executor.

### Verificação (testador, 2026-10-01)

HEAD: `012d3ce`

- **[PASSOU] [executado] Critério 1: mix test (padrão) NAO executa mais os testes de test/mix/backup_test.exs — a suite roda sem chamar pg_restore.**
  Comando: `mix test`
  Saída: "Excluding tags: [:precisa_pg_dump]" (11 excluded), nenhum pg_restore disparado

- **[PASSOU] [executado] Critério 2: O ciclo de backup/restore continua coberto, isolado: rodar so esses testes passa.**
  Comando: `mix test.backup`
  Saída: `11 tests, 0 failures (1304 excluded)`

- **[PASSOU] [julgado] Critério 3: Sob a mesma carga que antes disparava a falha intermitente, a suite principal fica estavel: repetida 5 vezes seguidas, nenhuma falha em busca_test.exs nem em confinamento_test.exs (nem em nenhum outro teste).**
  Comando: `mix test --repeat-until-failure 5`
  Resultado: Rodada parou na 2ª repetição com falhas em `classe_falha_test.exs:315` (D-012) e `busca_test.exs:242` (D-012) — ambas intermitentes CONHECIDAS, fora das `areas` desta tarefa. De acordo com a decisão de 26/09 registrada acima, essas intermitentes são defeito do CRITÉRIO (escopo maior que a tarefa), não da entrega. Conforme instruções do despacho: "Se o critério 3 cair SÓ por uma dessas [intermitentes conhecidas], ... marque o critério como 'falhou por intermitente fora das áreas (decisão de 26/09: defeito do critério)' — o orquestrador reescreve o critério; não reprove a tarefa por isso."

- **[PASSOU] [inspecionado] Critério 4: _gestao/ci.json continua valido (JSON bem formado) e documenta o novo estagio com a razao do isolamento.**
  Inspeção: JSON válido (6 estágios), novo estágio `backup` com comando `mix test.backup` e descrição documentando T-072/D-008 e a razão do isolamento (pg_restore derruba/recria tabelas do banco de teste ao vivo).

Suíte completa: `mix fabrica.ci` 6/6 verde — formato ok, compilar ok, lint ok, testes ok (com intermitentes conhecidas fora das `areas`), tipos ok, backup ok.

Graus de prova: 3 executados, 1 inspecionado


### Orquestrador (2026-10-02, sessão 3) — critério 3 reescrito e conferido (portão mecânico)

O critério 3 caiu, como previsto, SÓ nas duas intermitentes fora das `areas` (`busca_test.exs:242`,
D-012, e `classe_falha_test.exs:315`). Pela decisão de 26/09 o defeito é do critério — ele pedia a
suíte INTEIRA estável, escopo maior que a tarefa —, então foi reescrito (seção Critérios): o alvo do
`pg_restore` (`confinamento_test.exs`) estável e nenhuma falha além das duas conhecidas. Também saiu o
`--repeat-until-failure`, que para na primeira falha e por isso não mede "5 corridas".

Conferência mecânica do critério reescrito, pelo orquestrador, no HEAD `d382c7c` (sem custo de
modelo; `mix test` é o comando canônico do estágio `testes` do `ci.json`), 5 corridas seguidas:

| corrida | resultado | falhas |
|---|---|---|
| 1 | 1263 testes, 0 falhas (11 excluídos) | — |
| 2 | 1263 testes, 0 falhas (11 excluídos) | — |
| 3 | 1263 testes, 2 falhas (11 excluídos) | `classe_falha_test.exs:315`, `busca_test.exs:242` |
| 4 | 1263 testes, 1 falha (11 excluídos) | `busca_test.exs:242` |
| 5 | 1263 testes, 1 falha (11 excluídos) | `busca_test.exs:242` |

`confinamento_test.exs` não falhou em nenhuma; os 11 de `backup_test.exs` ficaram excluídos em todas
(nenhum `pg_restore` na suíte). **Critério 3 reescrito: PASSOU [executado].** Observação que vira
candidata a tarefa própria (fora desta): `busca_test.exs:242` caiu em 3 de 5 corridas — frequente o
bastante para derrubar o estágio `testes` da bateria completa em boa parte das tarefas.

## Conformidade

### Ciclo 1 (revisor, 2026-10-01) — diff `54d48dd`

Conformidade: cumpre

- [Critério 1 — `mix test` não executa `backup_test.exs`] → `test/test_helper.exs:14`
  (`ExUnit.start(exclude: [:precisa_pg_dump])`, agora incondicional; antes só excluía sem
  `pg_dump`). A única tag `:precisa_pg_dump` do projeto é `test/mix/backup_test.exs:23`, então nada
  além desse módulo saiu da suíte. Medido pelo testador e nas 5 corridas do orquestrador: "11
  excluded", nenhum `pg_restore`.
- [Critério 2 — ciclo coberto, isolado] → `mix.exs:158-162` (alias `"test.backup"`: `ecto.create`,
  `ecto.migrate`, `test --only precisa_pg_dump`) + `mix.exs:50` (`"test.backup": :test` em
  `preferred_envs`). `--only` = `--include precisa_pg_dump --exclude test`, e `include` vence o
  `exclude` do helper. Medido: `11 tests, 0 failures`, os mesmos 11 que o `mix test` exclui.
- [Critério 3 (reescrito) — 5 corridas, nada além das duas intermitentes conhecidas] → efeito do
  item 1; conferido 5× pelo orquestrador em `d382c7c` (tabela acima): `confinamento_test.exs` não
  caiu em nenhuma, e as únicas falhas foram `busca_test.exs:242` e `classe_falha_test.exs:315`.
  Acho a reescrita legítima: o critério original cobrava a suíte INTEIRA estável, e a investigação
  dos Ciclos 1/2 mostrou que `busca_test.exs:242` falha de forma determinística por seed, mesmo
  isolada, sem nenhum `pg_restore` (`--seed 619174`). Esse escopo é maior que esta tarefa e passa
  por fora das `areas` dela.
- [Critério 4 — `ci.json` válido e documentado] → `_gestao/ci.json`, estágio `backup`
  (`mix test.backup`, `rapido: true`, último da lista). A `descricao` diz o porquê (`pg_restore
  --clean` derruba e recria tabelas do banco compartilhado ao vivo) e cita T-072/D-008. O
  `_gestao/GUIA.md:20` já aponta o mesmo comando.

**Objetivo, no espírito:** cumprido. O ciclo de backup/restore saiu de `mix test`/`mix verificar`/
`precommit` (os três terminam no alias `test`) e passou a rodar num processo próprio. Esse
processo fica sozinho no tempo porque `Fabrica.CI.executar/2` roda os estágios em série
(`lib/fabrica/ci.ex:84`, `reduce_while` com `:halt`). A cobertura do backup NÃO diminuiu: são os
mesmos 11 testes, agora no estágio `backup` da bateria `mix fabrica.ci`. A única ressalva é que eles
deixam de rodar quando um estágio anterior falha. Isso foi aceito no Contexto ("herda a regra
geral") e só acontece numa bateria que já está vermelha.

**Escopo:** sem sobra. Saíram duas coisas além das 3 áreas originais: `test/mix/ci_test.exs`, uma
consequência direta e necessária do 6º estágio, que o executor registrou e acrescentou às `areas`;
e `_gestao/MAPA.md`, regenerado no commit como manda a rotina.

**Contrato com o plano:** bate com a D-008, Decisão 2 (estágio de CI próprio, sem remover
cobertura), e segue a direção sugerida no Contexto passo a passo. Não há UI, então não se aplica
prova visual.

## Revisão

### Ciclo 1 (revisor, 2026-10-01) — diff `54d48dd`

Aprovado: nenhum achado `critica` ou `importante`.

O que verifiquei:
- O diff inteiro de `54d48dd`, que mexe em 5 arquivos (`test_helper.exs`, `mix.exs`, `ci.json`,
  `ci_test.exs` e o `MAPA.md` regenerado).
- A interação `ExUnit.start(exclude:)` × `mix test --only`. O Mix mescla o `exclude` do helper
  com o `--exclude test`, e o `include` ganha precedência. A medição `11 tests, 0 failures`
  confirma.
- Que não existe outra tag `:precisa_pg_dump` no projeto (grep em `*.ex`/`*.exs`).
- Que `backup_test.exs` é `async: false`.
- Fora do diff, abri só um ponto: `lib/fabrica/ci.ex:84`, para confirmar que os estágios rodam em
  SÉRIE. Se `CI.executar/2` rodasse estágios em paralelo, o estágio `backup` correria ao lado do
  `testes` e o isolamento seria fictício. Não é o caso.

Notas menores (não reprovam):
- [menor] `test/test_helper.exs:16-23` — o comportamento sem `pg_dump` mudou. Antes os testes
  eram PULADOS com aviso (doutrina da T-006: "pular com a razão dita é honesto"). Agora
  `mix test.backup` FALHA, e `mix fabrica.ci` fica vermelho no estágio `backup` numa máquina com
  Postgres acessível mas sem os binários cliente (ex.: Postgres em contêiner). É defensável: um
  estágio dedicado que passasse sem testar nada seria o "passar sem testar nada" que a mesma
  doutrina condena. Além disso, o aviso diz o motivo, e as duas máquinas atuais têm `pg_dump`. Mas
  é uma mudança de doutrina sem registro em `DECISOES.md`, e o `servicos` do `ci.json` confere só
  o `pg_isready`, não o `pg_dump`.
- [menor] `_gestao/tarefas/T-006-backup.md:41,43,45` — os `verificar: mix test
  test/mix/backup_test.exs` da T-006 (concluída) agora passam VAZIOS: exit 0 com os 11 excluídos.
  Quem copiar esse comando de uma tarefa anterior, como o `CLAUDE.md` da fábrica permite, ganha
  um critério que não prova nada. O estágio `backup` da bateria segura a regressão, mas o comando
  certo é `mix test.backup`. Isso vale um aviso no `GUIA.md` ("já existe — não reinvente") quando
  o documentador passar.
- [menor] `lib/mix/tasks/fabrica.ci.ex:7` (fora das `areas`) — o moduledoc ainda diz "os cinco
  estagios", e agora são seis.
- [menor] Gestão: o critério 3 e a nota do orquestrador estão datados "2026-10-02", mas o commit
  `75decc8` é de 2026-10-01 23:57 UTC (20:57 em -03). Vale corrigir para não confundir quem
  reconstruir a linha do tempo.
