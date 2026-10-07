---
id: T-056
titulo: A trilha generica e a escada de prova com rotulo obrigatorio
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-025, T-028, T-013b]
areas: [lib/fabrica/trilhas.ex, lib/fabrica/criterios/grau.ex, test/fabrica/trilhas_test.exs]
tentativas: 1
criada: 2026-08-28
atualizada: 2026-09-21
---

## Objetivo
Rotear o pipeline inteiro pelo `dominio` do projeto, e obrigar o verificador a declarar em
que degrau cada criterio foi provado.

## Contexto
A fabrica constroi qualquer artefato; software e o mais calibrado, nao o unico. O eixo que
separa os dois casos nao e "e codigo?", e sim **como se prova que ficou pronto**. Em software
a prova vem de graca; fora dele nao vem — e e ai que o desenho poderia degenerar, com o
verificador virando um segundo revisor e dois julgamentos subjetivos custando em dobro.

`dominio` ausente ou `software` -> trilha de software, SEMPRE. Qualquer outro valor ->
trilha generica. Nenhum agente de software le a doutrina generica: a generalizacao nao passa
pelo caminho quente.

Escada de prova, e o rotulo e OBRIGATORIO:
  - `executado` — um comando roda e o resultado e o veredito
  - `inspecionado` — um script abre o artefato entregue e afirma fatos sobre ele
  - `julgado` — so quando os dois primeiros sao genuinamente impossiveis, e ai contra rubrica
    de itens BINARIOS declarada na tarefa

Duas pecas completam o desenho, e as duas sao regra do planejador:
  - **a primeira tarefa instala o verificador**, antes de qualquer parte do artefato;
  - **a fonte e texto versionado; o binario e gerado por comando.** Commitar o binario como
    fonte apagaria o portao da revisao, porque ninguem revisa diff de arquivo binario.

## Criterios de aceite
- [ ] `dominio` ausente ou `software` roteia para a trilha de software; qualquer outro, para a generica.
      `verificar: mix test test/fabrica/trilhas_test.exs`
- [ ] O verificador nao consegue fechar sem rotular TODOS os criterios (rotulo ausente e erro).
      `verificar: mix test test/fabrica/trilhas_test.exs`
- [ ] Criterio marcado `julgado` exige a secao de rubrica com itens binarios na tarefa.
      `verificar: mix test test/fabrica/trilhas_test.exs`
- [ ] A proporcao de criterios `julgados` por projeto e consultavel.
      `verificar: mix test test/fabrica/trilhas_test.exs`

## Notas de execucao
Represada em 09/09 pelo orquestrador: depende da T-013b. O coletor de `Comando.rodar/4` perde
a saida do processo em ~7,5% das execucoes sob carga, o que faz a suite ficar vermelha ao acaso
e classifica criterio quebrado como `:entrega` — reprovacao falsa que queima um ciclo. Verificar
qualquer coisa antes disso e apostar num portao que mente. O motor repromove sozinho quando a
T-013b concluir.

### Ciclo 1

**Achado antes de escrever: o campo `dominio` e o esquema `grau` ja existiam.** `dominio` em
`Fabrica.Projetos.Projeto` (default `"software"`, ausencia == software) e o `grau` (Enum
`:executado | :inspecionado | :julgado`, default `"inspecionado"`) em `Fabrica.Tarefas.Criterio`
vieram desde a T-002 (esquema do banco) — a escada ja estava prevista na modelagem, so faltava
quem a FIZESSE VALER. Isso decidiu a fronteira: os dois modulos novos sao PUROS (nenhum toca
`Repo`), na mesma linha de `Fabrica.Tarefas.Fila` e `Fabrica.Criterios` — operam sobre dados ja
carregados, e quem for persistir (fora do escopo desta tarefa) chama a partir de fora.

**`lib/fabrica/trilhas.ex` — `Fabrica.Trilhas`.**
- `de/1`: `nil` ou `"software"` -> `:software`; qualquer outro -> `:generica` (criterio 1).
- `agente/2`: qual agente atende `:construtor | :verificador | :revisor` em cada trilha —
  tabela de `_sistema/DOMINIOS.md` (`executor/testador/revisor` para software;
  `construtor/conferente/revisor-generico` para a generica). Acrescentado alem do minimo do
  criterio 1 porque o Objetivo pede "rotear o pipeline inteiro", e `Fabrica.Tarefas.Fila` ja
  documentava que os PAPEIS (`:construtor/:verificador/:revisor`) sao os mesmos nas duas
  trilhas e so o agente que atende cada um muda — este e o lugar onde essa tabela devia morar.
- `doutrina/1`: o arquivo de doutrina de cada trilha, so para referencia.

**`lib/fabrica/criterios/grau.ex` — `Fabrica.Criterios.Grau`.**
- `fechar/2`: recebe a lista de avaliacoes (`%{texto:, grau:}`, com `grau: nil` representando
  "nao rotulado" — distinto do default do ESQUEMA, que e so aplicado na persistencia) e o texto
  da tarefa. Erro `{:rotulo_ausente, [textos]}` se algum `grau` nao esta na escada
  (`Fabrica.Tarefas.Criterio.graus/0`) — cobre `nil` e qualquer atomo invalido (criterio 2).
  Erro `{:rubrica_ausente, [textos]}` se ha `:julgado` e a tarefa nao tem secao `## Rubrica`
  com pelo menos um item de lista (`- ` ou `* `) — criterio 3. So os julgados SEM rubrica entram
  na lista de erro, mesmo quando ha outros criterios rotulados na mesma avaliacao.
- `rubrica/1`: extrai os itens da secao `## Rubrica` (do cabecalho ate o proximo `## ` ou o fim
  do texto); lista vazia cobre as duas formas de "nao ha rubrica utilizavel" — secao ausente e
  secao presente mas sem item nenhum.
- `proporcao_julgados/1`: fracao de `:julgado` numa lista qualquer de mapas com `:grau` — o
  numero que a doutrina pede ("muitos julgado num projeto e portao e meio, nao dois") vira
  consultavel (criterio 4). `0.0` para lista vazia, para nao inflar por divisao por zero.

**Por que "rotulo ausente" nao podia ser testado contra `Fabrica.Tarefas.Criterio` direto.** A
coluna `grau` no banco e `NOT NULL DEFAULT 'inspecionado'` — nunca chega `nil` do Postgres. A
ausencia que o criterio 2 pede e um fato sobre o momento ANTES da persistencia: o verificador
decidindo o rotulo. Por isso `avaliacao()` e um tipo proprio (`grau: atom() | nil`), e nao o
schema do Ecto — testar contra o schema so provaria que o default do banco funciona, que e
outra coisa.

**Reproduzir:** `mix test test/fabrica/trilhas_test.exs` (21 tests, 12 doctests, 0 failures) —
cobre as duas trilhas, `nil` e string invalida, todos os casos de `fechar/2` (rotulado,
ausente, atomo invalido, lista vazia, julgado com/sem rubrica, rubrica vazia, mistura de
criterios), `rubrica/1` isolado e `proporcao_julgados/1` nos extremos. `mix credo
lib/fabrica/trilhas.ex lib/fabrica/criterios/grau.ex` -> 0 issues.

**Fora do escopo desta tarefa, de proposito:** ligar `Trilhas.agente/2` ao despacho real (qual
prompt/catalogo carrega para cada papel) e persistir `grau` a partir de `Grau.fechar/2` no
`Fabrica.Portoes.Verificador` — nenhum dos dois arquivos esta em `areas`, e mexer neles seria
trabalho fora da area declarada. Sugestao para tarefa futura: o verificador
(`Portoes.Verificador`) e quem deveria chamar `Grau.fechar/2` antes de aprovar, e o catalogo de
papeis (`Ferramentas.Catalogo`) ainda nao tem os papeis `"conferente"`/`"revisor-generico"` que
`Trilhas.agente(:generica, ...)` ja nomeia — precisam nascer quando a trilha generica for
efetivamente despachada.

**Commit:** `c3eea89`

### Ciclo 2

**Reprovação mecânica foi causada pelo Postgres fora do ar, não por defeito de código.** A
2ª passada mecânica registrada em `## Verificação` falha com `tcp connect (127.0.0.1:5432):
connection refused - :econnrefused` em `mix test` e no comando do critério (que também
dispara `mix test`) — sintoma exatamente da assinatura conhecida: `mix test` roda
`ecto.create --quiet` antes (alias em `mix.exs`), e o banco desta máquina não é serviço do
Windows (README.md, seção "Pré-requisitos") — ele sobe sob demanda com
`_sistema/ferramentas/banco-v2.ps1 subir`. `netstat -ano` confirmou nada escutando em 5432
no início deste ciclo.

Subi o banco (`banco-v2.ps1 subir` → `no ar - 127.0.0.1:5432`) e reexecutei, sem tocar em
nenhum arquivo de `areas`:
- `mix test test/fabrica/trilhas_test.exs` → **12 doctests, 21 tests, 0 failures** (mesmo
  resultado da 1ª passada mecânica do ciclo 1 — nada mudou no código desde então).
- `mix test` (suíte completa) → **41 doctests, 1047 tests, 0 failures**.

Nenhuma linha de `lib/fabrica/trilhas.ex`, `lib/fabrica/criterios/grau.ex` ou
`test/fabrica/trilhas_test.exs` foi alterada neste ciclo — não havia o que corrigir no
código; o portão mentiu porque a infraestrutura que ele depende (Postgres) estava fora do
ar no momento da passada. Commit deste ciclo é só a atualização desta seção de Notas.

**Sobre a nota "Fora das `areas`: `priv/piloto/`" registrada pelo motor:** os dois arquivos
(`6444.json`, `6446.json`) são artefatos não rastreados de execução de piloto, não criados
por esta tarefa nem por este ciclo — nenhum deles está em `areas`, e `git status` no início
deste ciclo já os mostrava como `??` antes de qualquer ação minha. Não fazem parte do
Objetivo nem dos Critérios de T-056; deixados como estão (fora do commit desta tarefa) para
quem for dono daquele diretório investigar.

**Reproduzir:** `mix test test/fabrica/trilhas_test.exs` (com o banco no ar via
`_sistema/ferramentas/banco-v2.ps1 subir`).

**Commit:** `15e479b`

### Ciclo 3

**Causa raiz (uma frase):** a reprovação foi de novo MECÂNICA por Postgres indisponível —
mesma assinatura `:econnrefused`/`connection not available` das passadas anteriores —, e
NÃO por defeito de código. Nenhuma linha de `lib/fabrica/trilhas.ex`,
`lib/fabrica/criterios/grau.ex` ou `test/fabrica/trilhas_test.exs` foi tocada neste ciclo.

**O que estava diferente desta vez:** o banco não estava só parado, estava TRAVADO. A porta
5432 aparecia `LISTENING` no `netstat`, mas as conexões caíam (`connection not available ...
dropped from queue after 4000ms`). O dono do socket (postmaster PID 11876) já era um processo
DEFUNTO — `Get-Process -Id 11876` não o encontrava —, e havia um `postgres.exe` filho órfão
(PID 5296) segurando o data dir. Por isso `banco-v2.ps1 subir` não subia ("NAO subiu") e
`conferir` dizia "banco parado": a ferramenta não limpa esse estado porque, pelo seu próprio
arquivo de estado, o banco já estava "parado".

**Como destravei (só infraestrutura, nenhum arquivo do projeto):**
1. `banco-v2.ps1 derrubar` → "ja estava parado" (não limpou o órfão, como esperado).
2. `taskkill /PID 5296 /T /F` → matei o `postgres.exe` órfão pelo PID ESPECÍFICO (não é o
   node do painel; não foi `taskkill /IM`). Porta 5432 liberada.
3. `banco-v2.ps1 subir` → entrou em crash recovery ("the database system is starting up")
   por causa do desligamento sujo; esperei a recuperação terminar.
4. `banco-v2.ps1 conferir` → `pgvector 0.8.6` operante.

**Verificação, com o banco no ar (postmaster PID 3180):**
- `mix test test/fabrica/trilhas_test.exs` → **12 doctests, 21 tests, 0 failures**.
- `mix test` (suíte completa) → **41 doctests, 1062 tests, 0 failures**.

**Sobre `priv/piloto/` (fora das `areas`):** os `6444.json`/`6446.json` continuam sendo
artefatos não rastreados de execução de piloto, `??` no `git status` desde antes deste ciclo,
não criados por esta tarefa. Não estão em `areas`, não entram no commit de T-056 e não foram
tocados por mim — deixados como estão para quem for dono daquele diretório.

**Aproveitamento:** 100% do código dos ciclos anteriores aproveitado; 0% refeito. O custo
deste ciclo foi diagnóstico + destravar a infraestrutura, não codificação.

**Reproduzir:** com o banco no ar, `mix test test/fabrica/trilhas_test.exs`.

### Ciclo 4

**Causa raiz (uma frase):** a reprovação registrada em `## Verificação` é de novo MECÂNICA
por Postgres indisponível — as três passadas do relatório falham com `:econnrefused` (banco
parado) e depois `connection not available ... dropped from queue after 4000ms` (banco
travado), a assinatura conhecida —, e NÃO por defeito de código.

**Diagnóstico deste ciclo (só infraestrutura):** no início, a porta 5432 já estava
`LISTENING` (postmaster PID 3180) e o banco aceitava conexões — o travamento das passadas
anteriores já não valia. Confirmei sem tocar em nenhum arquivo de `areas`:
- `mix test test/fabrica/trilhas_test.exs` → **12 doctests, 21 tests, 0 failures**.
- `mix test` (suíte completa) → **41 doctests, 1062 tests, 0 failures** (a única linha
  `[error]` é um log de desconexão no teardown — `client ... exited` —, não uma falha; o
  resumo fecha em 0 failures).

Nenhuma linha de `lib/fabrica/trilhas.ex`, `lib/fabrica/criterios/grau.ex` ou
`test/fabrica/trilhas_test.exs` foi alterada. O código dos ciclos anteriores está correto e
cobre os quatro critérios; a reprovação foi do portão mentindo por infraestrutura fora do ar
no momento da passada, não do artefato.

**Aproveitamento:** 100% do código dos ciclos anteriores aproveitado; 0% refeito. O custo
deste ciclo foi só diagnóstico + confirmação da suíte com o banco no ar.

**Sobre `priv/piloto/` (fora das `areas`):** `6444.json`/`6446.json` continuam sendo
artefatos não rastreados de execução de piloto (`??` no `git status` desde antes deste
ciclo), não criados por esta tarefa nem tocados por mim. Não estão em `areas`, não entram no
commit de T-056 — deixados como estão para quem for dono daquele diretório.

**Recomendação ao orquestrador:** T-056 já falhou quatro vezes pelo MESMO motivo mecânico
(Postgres fora do ar/travado no instante da verificação), nunca por código. O artefato está
pronto e provado. A ação de valor não é mais um ciclo de retrabalho, e sim garantir o banco
no ar ANTES da passada mecânica (`_sistema/ferramentas/banco-v2.ps1 subir`/`conferir`) —
enquanto a verificação disparar com 5432 parado, qualquer tarefa que toque o banco reprova
falso e queima ciclo.

**Reproduzir:** com o banco no ar, `mix test test/fabrica/trilhas_test.exs`.

### Ciclo 5

**Causa raiz (uma frase):** de novo reprovação MECÂNICA por Postgres indisponível — não por
defeito de código; nenhuma linha de `lib/fabrica/trilhas.ex`, `lib/fabrica/criterios/grau.ex`
ou `test/fabrica/trilhas_test.exs` foi tocada.

**O estado do banco desta vez (orfão de postmaster morto, igual ao ciclo 3):** a porta 5432
aparecia `LISTENING`, mas conexões NOVAS caíam com `connection not available ... dropped from
queue after 4000ms`. Diagnóstico por PID:
- `Get-NetTCPConnection -LocalPort 5432` → socket atribuído ao **PID 3180**;
  `Get-Process -Id 3180` → **NÃO EXISTE** (postmaster defunto segurando o socket).
- único `postgres.exe` vivo era **PID 12724**, um `--forkchild=io_worker` cujo
  `ParentProcessId` era 3180 (morto) — órfão segurando o data dir, o que impedia
  `banco-v2.ps1 subir` de subir um postmaster limpo.

**Como destravei (só infraestrutura, PID específico — não `taskkill /IM`, não o node do painel):**
1. `taskkill /PID 12724 /T /F` → matei só o `io_worker` órfão do postmaster morto (não há
   cliente conectado através de um postmaster defunto; matá-lo só liberou o data dir).
2. `banco-v2.ps1 subir` → entrou em crash recovery ("the database system is starting up")
   por causa do desligamento sujo; esperei a recuperação (`pg_isready` acusou pronto após
   ~12s).
3. `banco-v2.ps1 conferir` → `pgvector 0.8.6 operante`.

**Verificação, com o banco no ar:**
- `mix test test/fabrica/trilhas_test.exs` → **12 doctests, 21 tests, 0 failures**.
- `mix test` (suíte completa) → **41 doctests, 1062 tests, 0 failures** (a única linha
  `[error]` é log de desconexão no teardown — `client ... exited` —, não uma falha).

**Aproveitamento:** 100% do código dos ciclos anteriores aproveitado; 0% refeito. O custo
deste ciclo foi diagnóstico + destravar a infraestrutura, não codificação.

**Sobre `priv/piloto/` (fora das `areas`):** `6444.json`/`6446.json` continuam artefatos
não rastreados de execução de piloto (`??` no `git status` desde antes deste ciclo), não
criados por esta tarefa nem tocados por mim. Não estão em `areas`, não entram no commit de
T-056 — deixados como estão para quem for dono daquele diretório.

**Reproduzir:** com o banco no ar, `mix test test/fabrica/trilhas_test.exs`.

### Ciclo 6

**Causa raiz (uma frase):** sexta reprovação MECÂNICA pela MESMA assinatura de Postgres
indisponível — a passada em `## Verificação` falha primeiro com `:econnrefused` (5432 parado)
e depois com `connection not available ... dropped from queue after 4000ms` (postmaster
travado) —, NÃO por defeito de código; nenhuma linha de `lib/fabrica/trilhas.ex`,
`lib/fabrica/criterios/grau.ex` ou `test/fabrica/trilhas_test.exs` foi tocada.

**Diagnóstico deste ciclo (só infraestrutura):** no início, 5432 já estava `LISTENING` com o
postmaster **vivo** (PID 11272 — `Get-Process` confirmou; não era socket órfão de defunto como
nos ciclos 3 e 5). `banco-v2.ps1 conferir` → `pgvector 0.8.6 operante`, conexões aceitas. Não
precisei destravar nada.

**Verificação, com o banco no ar:**
- `mix test test/fabrica/trilhas_test.exs` → **12 doctests, 21 tests, 0 failures**.
- `mix test` (suíte completa) → **41 doctests, 1062 tests, 0 failures** (a única linha
  `[error]` é log de desconexão no teardown — `client ... exited` —, não uma falha).

**Aproveitamento:** 100% do código dos ciclos anteriores aproveitado; 0% refeito. O artefato
cobre os quatro critérios de aceite e está correto desde o ciclo 1 (`c3eea89`). O custo deste
ciclo foi só diagnóstico + confirmação da suíte com o banco no ar.

**Recomendação ao orquestrador (a ação de valor, não mais um retrabalho):** T-056 já reprovou
SEIS vezes pelo mesmo motivo mecânico — o portão mecânico dispara com o Postgres desta máquina
parado/travado (banco sob demanda via `_sistema/ferramentas/banco-v2.ps1`, não serviço do
Windows). O executor não tem como remediar isto de dentro das `areas`: o alias `test` em
`mix.exs` roda `ecto.create`/`ecto.migrate` antes de qualquer teste (poluindo até uma suíte
PURA como esta), e nem `mix.exs` nem o gestor do banco estão em `areas`. Enquanto a passada
mecânica não garantir `banco-v2.ps1 subir`/`conferir` ANTES de rodar, esta e qualquer tarefa
que toque o banco vão reprovar falso e queimar ciclo. O artefato está pronto e provado; a
correção é do harness de verificação, não do código.

**Sobre `priv/piloto/` (fora das `areas`):** `6444.json`/`6446.json` continuam artefatos não
rastreados de execução de piloto (`??` no `git status` desde antes deste ciclo), não criados
por esta tarefa nem tocados por mim. Não estão em `areas`, não entram no commit de T-056 —
deixados como estão para quem for dono daquele diretório.

**Reproduzir:** com o banco no ar, `mix test test/fabrica/trilhas_test.exs`.

### Ciclo 7

**Causa raiz (uma frase):** sétima reprovação MECÂNICA pela MESMA assinatura de Postgres
indisponível (a passada em `## Verificação` cai com `:econnrefused` e depois `connection not
available ... dropped from queue after 4000ms`) — NÃO por defeito de código; nenhuma linha de
`lib/fabrica/trilhas.ex`, `lib/fabrica/criterios/grau.ex` ou `test/fabrica/trilhas_test.exs`
foi tocada, e as três continuam no HEAD `c3eea89` (ciclo 1).

**O que MUDOU e por que este ciclo não é só mais uma repetição:** o orquestrador corrigiu o
lado do HARNESS — o commit `93e40ec` ("ci.json declara o Postgres como servico da bateria")
acrescentou o bloco `servicos` em `_gestao/ci.json` que `checar`/`subir` o Postgres ANTES da
passada mecânica (`pg_isready` + `banco-v2.ps1 subir`). O próprio comentário do ci.json nomeia
esta tarefa: "A T-056 queimou SEIS ciclos assim, com o artefato correto desde o 1o commit". Ou
seja, a causa sistêmica (portão rodava com 5432 no chão) agora tem remédio commitado no lugar
onde ela vivia — que não é nenhuma das `areas` de T-056, e por isso o executor nunca teve como
consertá-la de dentro do confinamento.

**Verificação deste ciclo, com o banco no ar (`pg_isready` → `accepting connections`, sem
precisar destravar nada):**
- `mix test test/fabrica/trilhas_test.exs` → **12 doctests, 21 tests, 0 failures**.
- `mix test` (suíte completa) → **41 doctests, 1062 tests, 0 failures** (a única linha
  `[error]` é log de desconexão no teardown — `client ... exited` —, não uma falha).

**Aproveitamento:** 100% do código dos ciclos anteriores aproveitado; 0% refeito — o custo deste
ciclo foi só diagnóstico + confirmação da suíte com o banco no ar, dentro do orçamento reduzido
de retrabalho. O artefato cobre os quatro critérios de aceite e está correto desde `c3eea89`.

**Sobre `priv/piloto/` (fora das `areas`):** o `git status` deste ciclo mostra só `?? priv/piloto/`
(diretório colapsado — variante T-043 do commit-guard). São artefatos não rastreados de execução
de piloto (`6444.json`/`6446.json`), `??` desde antes deste ciclo, não criados nem tocados por
esta tarefa nem por mim. Não estão em `areas`, não entram no commit de T-056; tocá-los seria eu
mesmo introduzir alteração fora da área. Deixados como estão para o dono daquele diretório.

**Recomendação ao orquestrador:** o remédio já está no lugar (`93e40ec`). Basta a passada
mecânica desta vez honrar o bloco `servicos` do ci.json (subir/checar o Postgres antes de `mix
test`); com 5432 no ar a suíte é verde e determinística. O artefato está pronto e provado — a
ação de valor é liberar para `em-teste`/revisão, não mais um ciclo de retrabalho de código.

**Reproduzir:** com o banco no ar, `mix test test/fabrica/trilhas_test.exs`.

### Ciclo 8

**Causa raiz (uma frase):** oitava reprovação MECÂNICA pela MESMA assinatura de Postgres
indisponível — a passada em `## Verificação` tem uma primeira execução VERDE (5 executado,
0 falha) e depois duas que caem com `:econnrefused` (5432 parado) e `connection not
available ... dropped from queue after 4000ms` (postmaster travado) —, NÃO por defeito de
código; nenhuma linha de `lib/fabrica/trilhas.ex`, `lib/fabrica/criterios/grau.ex` ou
`test/fabrica/trilhas_test.exs` foi tocada, e as três seguem idênticas ao HEAD `c3eea89`
(`git diff c3eea89 HEAD` nas três áreas: vazio).

**Diagnóstico deste ciclo (só infraestrutura):** no início, `pg_isready -h 127.0.0.1 -p
5432` → `accepting connections` (exit 0) — banco vivo, não precisei destravar nada.
Confirmei sem tocar em nenhum arquivo de `areas`:
- `mix test test/fabrica/trilhas_test.exs` → **12 doctests, 21 tests, 0 failures**.
- `mix test` (suíte completa) → **41 doctests, 1062 tests, 0 failures** (a única linha
  `[error]` é log de desconexão no teardown — `client ... exited` —, não uma falha).

**Aproveitamento:** 100% do código dos ciclos anteriores aproveitado; 0% refeito. O custo
deste ciclo foi só diagnóstico + confirmação da suíte com o banco no ar, dentro do orçamento
reduzido de retrabalho. O artefato cobre os quatro critérios de aceite e está correto desde
`c3eea89`.

**Recomendação ao orquestrador (a ação de valor, não mais um retrabalho):** T-056 já
reprovou OITO vezes pelo mesmo motivo mecânico, e o próprio `## Verificação` deste ciclo
mostra a prova cabal — a PRIMEIRA passada mecânica saiu VERDE (5 executado, 0 falha) e as
seguintes só falharam quando o Postgres caiu no meio da bateria. O remédio de harness já
está commitado (`93e40ec`, bloco `servicos` do `ci.json` que faz `pg_isready`+`banco-v2.ps1
subir` ANTES da passada). O executor não tem como remediar de dentro das `areas`: o alias
`test` em `mix.exs` roda `ecto.create` antes de qualquer teste, poluindo até uma suíte PURA
como esta, e nem `mix.exs` nem o gestor do banco estão em `areas`. A ação de valor é honrar
o bloco `servicos` do ci.json na passada (garantir 5432 no ar e ESTÁVEL do início ao fim da
bateria) e liberar para revisão — não mais um ciclo de retrabalho de código.

**Sobre `priv/piloto/` (fora das `areas`):** `git status` mostra só `?? priv/piloto/`
(diretório colapsado). São artefatos não rastreados de execução de piloto, `??` desde antes
deste ciclo, não criados nem tocados por esta tarefa nem por mim. Não estão em `areas`, não
entram no commit de T-056; tocá-los seria eu introduzir alteração fora da área. Deixados
como estão para o dono daquele diretório.

**Reproduzir:** com o banco no ar, `mix test test/fabrica/trilhas_test.exs`.

### Intervencao do orquestrador (2026-09-21) — destravada para o portao

**O que estava acontecendo.** Esta tarefa ficou presa num laco fechado entre jobs. O codigo
esta correto e completo desde o ciclo 1 (`c3eea89`); sete construtores seguidos confirmaram
isso de forma independente, e nenhum deles moveu o status — corretamente, porque nao havia
o que construir. O motor, vendo o status parado, encerrava a rodada por `sem-progresso`, o
saneamento devolvia a tarefa a `pronta`, e o job seguinte redespachava igual. Rodadas de
21/09 as 06:45, 06:56, 07:29, 08:54 e 12:45 UTC: 0 tarefas concluidas, ~US$ 15 no total.

**As causas sistemicas foram consertadas fora daqui** (raiz da fabrica, commits `407694a` e
seguintes), porque nenhuma delas cabia nas `areas` desta tarefa:

1. `ECONNREFUSED` entrou em `SINAIS_DE_AMBIENTE` — banco no chao agora e `inconclusivo`
   (nao reprova, nao aprova), nao mais classe `falha`, que devolvia a tarefa ao construtor.
2. Pre-voo declarativo: `_gestao/ci.json` declara o Postgres, e a rodada o sobe (ou nem
   comeca) ANTES de despachar qualquer agente.
3. `manter-postgres.ps1` passou a enxergar socket orfao de postmaster defunto — o estado em
   que o banco desta maquina de fato morre, e para o qual o vigia era cego.
4. O motor agora COBRA o ciclo quando o construtor termina sem mover o status. Era o elo que
   fazia o laco ser infinito: `tentativas` parado significa que o teto de 3 ciclos nunca
   chega, entao nunca havia bloqueio nem autocorrecao.

**O que foi feito nesta tarefa, e por que.** `status: pronta` -> `em-teste` e
`tentativas: 2` -> `1`, com `ultima-reprovacao` removido. A tarefa teve UM ciclo de
construcao real (o que produziu `c3eea89`); os seis seguintes foram diagnostico de
infraestrutura, nao construcao, e contá-los como tentativas puniria a tarefa por uma falha
da maquina. Nenhuma linha de codigo foi tocada nesta intervencao.

**Criterios conferidos com o banco no ar, antes de promover:**
- `mix test test/fabrica/trilhas_test.exs` -> **12 doctests, 21 tests, 0 failures**
- `mix test` (suite completa) -> **41 doctests, 1062 tests, 0 failures**

O artefato vai agora aos dois portoes, que e onde ele deveria ter chegado em 09/09. O
verificador roda os quatro criterios; o revisor julga o diff de `c3eea89`.

## Verificacao

### Ciclo 9 — Verificação (Testador)

**Estado inicial do banco:** Postgres escutando em 127.0.0.1:5432 (PID 13248 vivo), `netstat` confirmou `LISTENING`.

**Verificação dos critérios de aceite:**

- **[PASSOU] [executado] Critério 1: `dominio` ausente ou `software` roteia para a trilha de software; qualquer outro, para a generica.**
  Comando: `mix test test/fabrica/trilhas_test.exs`
  Resultado: 12 doctests + 21 tests = 0 failures. Os 3 casos de `Fabrica.Trilhas.de/1` (nil → :software, "software" → :software, "apresentacao" → :generica) cobertos pelos doctests.

- **[PASSOU] [executado] Critério 2: O verificador não consegue fechar sem rotular TODOS os critérios (rotulo ausente e erro).**
  Comando: `mix test test/fabrica/trilhas_test.exs` (mesmo)
  Resultado: 0 failures. Testes do bloco "Grau.fechar/2 — o verificador nao fecha sem rotular TODOS os criterios" (6 testes) cobrem nil, atomo invalido, lista vazia.

- **[PASSOU] [executado] Critério 3: Criterio marcado `julgado` exige a secao de rubrica com itens binarios na tarefa.**
  Comando: `mix test test/fabrica/trilhas_test.exs` (mesmo)
  Resultado: 0 failures. Testes do bloco "Grau.fechar/2 — julgado exige a secao de rubrica com itens binarios" (5 testes) cobrem presença/ausência de rubrica, rubrica vazia, e mistura com outros criterios.

- **[PASSOU] [executado] Critério 4: A proporcao de criterios `julgados` por projeto e consultavel.**
  Comando: `mix test test/fabrica/trilhas_test.exs` (mesmo)
  Resultado: 0 failures. Testes do bloco "Grau.proporcao_julgados/1 — a proporcao e consultavel" (4 testes) cobrem 0.0 (lista vazia), 0.0 (nenhum julgado), 0.5 (metade), 1.0 (todos).

**Suíte completa:** `mix test` → 41 doctests, 1062 tests, 0 failures. Nenhuma falha alheia ao escopo.

**Graus de prova:** 5 executados (todos os critérios rodaram um comando; o veredito é saída de teste), 0 inspecionados, 0 julgados.

**Status a registrar:** `em-revisao` (todos os critérios PASSARAM).

## Conformidade

Conformidade: cumpre

- `dominio` ausente ou `software` roteia para a trilha de software; qualquer outro, para a
  generica → `Fabrica.Trilhas.de/1` (`lib/fabrica/trilhas.ex:44-47`), 3 clausulas de pattern
  match (`nil`, `"software"`, qualquer outro), testado em
  `test/fabrica/trilhas_test.exs:19-31` e nos doctests do modulo.
- O verificador nao consegue fechar sem rotular TODOS os criterios (rotulo ausente e erro)
  → `Fabrica.Criterios.Grau.fechar/2` + `exigir_rotulo/1` + `sem_rotulo/1`
  (`lib/fabrica/criterios/grau.ex:57-70`) — `grau: nil` e qualquer atomo fora de
  `Criterio.graus/0` viram `{:erro, {:rotulo_ausente, [textos]}}`; testado em
  `test/fabrica/trilhas_test.exs:47-63` (nil, atomo invalido, todos sem rotulo, lista vazia).
- Criterio `julgado` exige a secao de rubrica com itens binarios na tarefa →
  `exigir_rubrica/2` + `rubrica/1` (`lib/fabrica/criterios/grau.ex:72-79,88-105`) — sem a
  secao `## Rubrica` ou com ela vazia, todo `:julgado` sem prova entra em
  `{:erro, {:rubrica_ausente, [...]}}`; testado em
  `test/fabrica/trilhas_test.exs:65-108` (presente, ausente, vazia, mistura com outros
  criterios).
- A proporcao de criterios `julgados` por projeto e consultavel →
  `Fabrica.Criterios.Grau.proporcao_julgados/1` (`lib/fabrica/criterios/grau.ex:119-124`) —
  `0.0` para lista vazia (sem divisao por zero), fracao correta nos demais casos; testado em
  `test/fabrica/trilhas_test.exs:132-149` (vazio, nenhum, metade, todos).

**Objetivo:** cumprido no espirito — o roteamento por `dominio` e o rotulo obrigatorio da
escada de prova sao exatamente o que o Objetivo pede, e os dois modulos sao PUROS (sem tocar
`Repo`), coerente com a fronteira que as Notas de execucao do Ciclo 1 justificam (mesma
linha de `Fabrica.Tarefas.Fila`/`Fabrica.Criterios`).

**Escopo:** `Trilhas.agente/2` e `doutrina/1` vao alem do minimo do criterio 1, mas as Notas
de execucao justificam a extensao pelo proprio texto do Objetivo ("rotear o pipeline
inteiro") e pela tabela que `Fabrica.Tarefas.Fila` ja antecipava — nao e sobra
desconectada, e testada (`test/fabrica/trilhas_test.exs:33-44`) e pequena (11 linhas de
tabela + 2 funcoes de uma linha). Registro como nota, nao como achado de nao-conformidade.

**Contrato com o plano:** `areas` respeitadas — `git diff c3eea89 HEAD -- lib/fabrica/trilhas.ex
lib/fabrica/criterios/grau.ex test/fabrica/trilhas_test.exs` vazio, confirmando que nenhum
ciclo de retrabalho (2 a 9) tocou codigo fora do que foi commitado no Ciclo 1. Nao ha
decisao em `_gestao/DECISOES.md` que este diff contrarie.

**Prova visual:** nao aplicavel — tarefa sem interface.

**Sobre `priv/piloto/` fora das `areas`:** confirmado que sao artefatos de runtime nao
criados por esta tarefa (`.gitignore` corrigido pelo orquestrador no commit `d6a8bfc`,
fora do diff revisado aqui). Nao afeta a conformidade do codigo de T-056.

## Revisao

**Aprovado sem ressalvas.** Revisei o diff completo do commit `c3eea89` (unico commit de
codigo desta tarefa; `lib/fabrica/criterios/grau.ex` novo, `lib/fabrica/trilhas.ex` novo,
`test/fabrica/trilhas_test.exs` novo — 441 linhas). Confirmado que nenhum dos 8 ciclos de
retrabalho subsequentes alterou uma linha sequer nesses tres arquivos (`git diff c3eea89 HEAD`
vazio nas `areas`), coerente com o relato de cada ciclo.

- **Correcao:** `sem_rotulo/1` usa `Enum.reject(&(&1.grau in @graus))`, que mantem
  exatamente os graus INVALIDOS (incluindo `nil`) — logica correta e testada
  (`grau: nil`, atomo inventado, mistura). `exigir_rubrica/2` filtra os `:julgado` e so
  reporta erro para eles quando `rubrica/1` da lista vazia — nao ha caminho em que um
  criterio `:executado`/`:inspecionado` va parar na lista de erro por causa de rubrica
  ausente (`lib/fabrica/criterios/grau.ex:72-79`), confirmado no teste
  "criterio executado nao precisa de rubrica, mesmo sem a secao existir".
- **Fonte unica:** `@graus Criterio.graus()` em `grau.ex:24` reusa a lista definida em
  `Fabrica.Tarefas.Criterio.graus/0` (`lib/fabrica/tarefas/criterio.ex:21-25`) em vez de
  duplicar `[:executado, :inspecionado, :julgado]` — evita a divergencia de duas fontes de
  verdade que a doutrina de bibliotecas adverte.
- **Casos de borda:** lista vazia de avaliacoes (`fechar([], "")` → `{:ok, []}`), rubrica
  presente porem vazia (linhas em branco), `\r\n` na quebra de linha (`secao/2` usa
  `~r/\r?\n/`) — todos cobertos por teste.
- **Integracao:** os dois modulos sao puros (nenhuma chamada a `Repo`), como as Notas de
  execucao registram; nao ha ponto de acoplamento com `Fabrica.Portoes.Verificador` para
  quebrar, porque essa ligacao esta explicitamente fora do escopo desta tarefa.
- **Roda artesanal:** nenhuma — `rubrica/1` faz parsing de markdown simples (secao +
  itens de lista) com regex direta, sem reinventar um parser; nao ha lib de markdown
  adotada em `DECISOES.md` para este caso pontual.

Sem achados `critica` ou `importante`. Nota `menor`: o campo `Commit:` das Notas de execucao
tem 9 hashes registrados ao longo dos ciclos (um por ciclo de diagnostico de infra, mesmo
sem mudanca de codigo) — nao atrapalhou a localizacao do commit relevante (`c3eea89`, citado
explicitamente em varios ciclos), mas vale o orquestrador observar que ciclos de puro
diagnostico nao precisariam gerar commit proprio.



## Notas de execução

**Fora das `areas` (detectado pelo motor):** priv/piloto/

Estes arquivos foram alterados por esta etapa e estão FORA das `areas` que a
tarefa declarou. Não entram no commit da tarefa, então não aparecem no diff que
o revisor julga — confira se a alteração era legítima (e a `area` é que estava
incompleta) ou se é sobra que precisa ser desfeita.

**Fora das `areas` (detectado pelo motor):** priv/piloto/

Estes arquivos foram alterados por esta etapa e estão FORA das `areas` que a
tarefa declarou. Não entram no commit da tarefa, então não aparecem no diff que
o revisor julga — confira se a alteração era legítima (e a `area` é que estava
incompleta) ou se é sobra que precisa ser desfeita.

**Fora das `areas` (detectado pelo motor):** priv/piloto/

Estes arquivos foram alterados por esta etapa e estão FORA das `areas` que a
tarefa declarou. Não entram no commit da tarefa, então não aparecem no diff que
o revisor julga — confira se a alteração era legítima (e a `area` é que estava
incompleta) ou se é sobra que precisa ser desfeita.

**Fora das `areas` (detectado pelo motor):** priv/piloto/

Estes arquivos foram alterados por esta etapa e estão FORA das `areas` que a
tarefa declarou. Não entram no commit da tarefa, então não aparecem no diff que
o revisor julga — confira se a alteração era legítima (e a `area` é que estava
incompleta) ou se é sobra que precisa ser desfeita.

**Fora das `areas` (detectado pelo motor):** priv/piloto/

Estes arquivos foram alterados por esta etapa e estão FORA das `areas` que a
tarefa declarou. Não entram no commit da tarefa, então não aparecem no diff que
o revisor julga — confira se a alteração era legítima (e a `area` é que estava
incompleta) ou se é sobra que precisa ser desfeita.

**Fora das `areas` (detectado pelo motor):** priv/piloto/

Estes arquivos foram alterados por esta etapa e estão FORA das `areas` que a
tarefa declarou. Não entram no commit da tarefa, então não aparecem no diff que
o revisor julga — confira se a alteração era legítima (e a `area` é que estava
incompleta) ou se é sobra que precisa ser desfeita.

**Fora das `areas` (detectado pelo motor):** priv/piloto/

Estes arquivos foram alterados por esta etapa e estão FORA das `areas` que a
tarefa declarou. Não entram no commit da tarefa, então não aparecem no diff que
o revisor julga — confira se a alteração era legítima (e a `area` é que estava
incompleta) ou se é sobra que precisa ser desfeita.

**Fora das `areas` (detectado pelo motor):** priv/piloto/

Estes arquivos foram alterados por esta etapa e estão FORA das `areas` que a
tarefa declarou. Não entram no commit da tarefa, então não aparecem no diff que
o revisor julga — confira se a alteração era legítima (e a `area` é que estava
incompleta) ou se é sobra que precisa ser desfeita.

**Fora das `areas` (detectado pelo motor):** priv/piloto/

Estes arquivos foram alterados por esta etapa e estão FORA das `areas` que a
tarefa declarou. Não entram no commit da tarefa, então não aparecem no diff que
o revisor julga — confira se a alteração era legítima (e a `area` é que estava
incompleta) ou se é sobra que precisa ser desfeita.










## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] `dominio` ausente ou `software` roteia para a trilha de software; qualquer outro, para a generica. — `mix test test/fabrica/trilhas_test.exs` → **PASSOU**
- [executado] O verificador nao consegue fechar sem rotular TODOS os criterios (rotulo ausente e erro). — `mix test test/fabrica/trilhas_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Criterio marcado `julgado` exige a secao de rubrica com itens binarios na tarefa. — `mix test test/fabrica/trilhas_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A proporcao de criterios `julgados` por projeto e consultavel. — `mix test test/fabrica/trilhas_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)

Graus de prova: 5 executado(s), 0 para julgamento (de 5).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **FALHOU**

```
03:26:56.372 [error] Postgrex.Protocol (#PID<0.198.0> ("db_conn_1")) failed to connect: ** (DBConnection.ConnectionError) tcp connect (127.0.0.1:5432): connection refused - :econnrefused

03:26:56.616 [error] :gen_statem #PID<0.198.0> terminating
** (DBConnection.ConnectionError) tcp connect (127.0.0.1:5432): connection refused - :econnrefused
    (db_connection 2.10.2) lib/db_connection/connection.ex:121: DBConnection.Connection.handle_event/4
    (stdlib 7.1) gen_statem.erl:3750: :gen_statem.loop_state_callback/11
    (stdlib 7.1) proc_lib.erl:333: :proc_lib.init_p_do_apply/3
Process Label: "db_conn_1"
Queue: [internal: {:connect, :init}]
Postponed: []
State: Postgrex.Protocol
Callback mode: :handle_event_function, state_enter: false

03:26:58.778 [error] Postgrex.Protocol (#PID<0.204.0> ("db_conn_1")) failed to connect: ** (DBConnection.ConnectionError) tcp connect (127.0.0.1:5432): connection refused - :econnrefused

03:26:58.778 [error] :gen_statem #PID<0.204.0> terminating
** (DBConnection.ConnectionError) tcp connect (127.0.0.1:5432): connection refused - :econnrefused
    (db_connection 2.10.2) lib/db_connection/connection.ex:121: DBConnection.Connection.handle_event/4
    (stdlib 7.1) gen_statem.erl:3750: :gen_statem.loop_state_callback/11
    (stdlib 7.1) proc_lib.erl:333: :proc_lib.init_p_do_apply/3
Process Label: "db_conn_1"
Queue: [internal: {:connect, :init}]
Postponed: []
State: Postgrex.Protocol
Callback mode: :handle_event_function, state_enter: false

** (Mix) The database for Fabrica.Repo couldn't be created: killed
```

- [executado] `dominio` ausente ou `software` roteia para a trilha de software; qualquer outro, para a generica. — `mix test test/fabrica/trilhas_test.exs` → **FALHOU**

```
03:27:05.327 [error] Postgrex.Protocol (#PID<0.198.0> ("db_conn_1")) failed to connect: ** (DBConnection.ConnectionError) tcp connect (127.0.0.1:5432): connection refused - :econnrefused

03:27:05.351 [error] :gen_statem #PID<0.198.0> terminating
** (DBConnection.ConnectionError) tcp connect (127.0.0.1:5432): connection refused - :econnrefused
    (db_connection 2.10.2) lib/db_connection/connection.ex:121: DBConnection.Connection.handle_event/4
    (stdlib 7.1) gen_statem.erl:3750: :gen_statem.loop_state_callback/11
    (stdlib 7.1) proc_lib.erl:333: :proc_lib.init_p_do_apply/3
Process Label: "db_conn_1"
Queue: [internal: {:connect, :init}]
Postponed: []
State: Postgrex.Protocol
Callback mode: :handle_event_function, state_enter: false

03:27:07.861 [error] Postgrex.Protocol (#PID<0.204.0> ("db_conn_1")) failed to connect: ** (DBConnection.ConnectionError) tcp connect (127.0.0.1:5432): connection refused - :econnrefused

03:27:07.861 [error] :gen_statem #PID<0.204.0> terminating
** (DBConnection.ConnectionError) tcp connect (127.0.0.1:5432): connection refused - :econnrefused
    (db_connection 2.10.2) lib/db_connection/connection.ex:121: DBConnection.Connection.handle_event/4
    (stdlib 7.1) gen_statem.erl:3750: :gen_statem.loop_state_callback/11
    (stdlib 7.1) proc_lib.erl:333: :proc_lib.init_p_do_apply/3
Process Label: "db_conn_1"
Queue: [internal: {:connect, :init}]
Postponed: []
State: Postgrex.Protocol
Callback mode: :handle_event_function, state_enter: false

** (Mix) The database for Fabrica.Repo couldn't be created: killed
```

- [executado] O verificador nao consegue fechar sem rotular TODOS os criterios (rotulo ausente e erro). — `mix test test/fabrica/trilhas_test.exs` → **FALHOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Criterio marcado `julgado` exige a secao de rubrica com itens binarios na tarefa. — `mix test test/fabrica/trilhas_test.exs` → **FALHOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A proporcao de criterios `julgados` por projeto e consultavel. — `mix test test/fabrica/trilhas_test.exs` → **FALHOU** (mesmo comando já executado acima; veredito reaproveitado)

Graus de prova: 5 executado(s), 0 para julgamento (de 5).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **FALHOU**

```
** (Mix) The database for Fabrica.Repo couldn't be created: [Elixir.Ecto.Adapters.SQL.Supervisor] connection not available and request was dropped from queue after 4000ms. This means requests are coming in and your connection pool cannot serve them fast enough. You can address this by:

  1. Ensuring your database is available and that you can connect to it
  2. Tracking down slow queries and making sure they are running fast enough
  3. Increasing the pool_size (although this increases resource consumption)
  4. Allowing requests to wait longer by increasing :queue_target and :queue_interval

See DBConnection.start_link/2 for more information
```

- [executado] `dominio` ausente ou `software` roteia para a trilha de software; qualquer outro, para a generica. — `mix test test/fabrica/trilhas_test.exs` → **FALHOU**

```
** (Mix) The database for Fabrica.Repo couldn't be created: [Elixir.Ecto.Adapters.SQL.Supervisor] connection not available and request was dropped from queue after 4000ms. This means requests are coming in and your connection pool cannot serve them fast enough. You can address this by:

  1. Ensuring your database is available and that you can connect to it
  2. Tracking down slow queries and making sure they are running fast enough
  3. Increasing the pool_size (although this increases resource consumption)
  4. Allowing requests to wait longer by increasing :queue_target and :queue_interval

See DBConnection.start_link/2 for more information
```

- [executado] O verificador nao consegue fechar sem rotular TODOS os criterios (rotulo ausente e erro). — `mix test test/fabrica/trilhas_test.exs` → **FALHOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Criterio marcado `julgado` exige a secao de rubrica com itens binarios na tarefa. — `mix test test/fabrica/trilhas_test.exs` → **FALHOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A proporcao de criterios `julgados` por projeto e consultavel. — `mix test test/fabrica/trilhas_test.exs` → **FALHOU** (mesmo comando já executado acima; veredito reaproveitado)

Graus de prova: 5 executado(s), 0 para julgamento (de 5).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] `dominio` ausente ou `software` roteia para a trilha de software; qualquer outro, para a generica. — `mix test test/fabrica/trilhas_test.exs` → **PASSOU**
- [executado] O verificador nao consegue fechar sem rotular TODOS os criterios (rotulo ausente e erro). — `mix test test/fabrica/trilhas_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Criterio marcado `julgado` exige a secao de rubrica com itens binarios na tarefa. — `mix test test/fabrica/trilhas_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A proporcao de criterios `julgados` por projeto e consultavel. — `mix test test/fabrica/trilhas_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)

Graus de prova: 5 executado(s), 0 para julgamento (de 5).



