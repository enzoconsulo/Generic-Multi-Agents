---
id: T-007
titulo: Núcleo de jobs — modelo, fila com locks, persistência e API básica
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: [T-002]
areas: [servidor/src/jobs/, servidor/src/rotas/jobs.ts, servidor/testes/jobs/]
tentativas: 2
criada: 2026-07-21
atualizada: 2026-07-21
---

## Objetivo
Motor de jobs do painel: modelo de job com estados, fila que respeita locks de
concorrência (global / por projeto / teto de execuções Claude), persistência em
`dados/jobs/` e API de consulta/cancelamento. Runner plugável — nesta tarefa só existe
um runner fake para testes; o runner Claude real chega na T-008.

## Contexto
- Modelo de concorrência DECIDIDO em `_gestao/DECISOES.md` (2026-07-21): job declara
  escopo `global` (exclusivo total) ou `projeto:<nome>` (exclusivo por projeto);
  projetos diferentes em paralelo até o teto configurável de jobs Claude simultâneos
  (default 2, em `servidor/src/config.ts`). Jobs não-Claude (futuro CI) contam no lock
  de projeto mas não no teto Claude — modelar o job com flag `usaClaude`.
- Estados: `na-fila | executando | aguardando-input | concluido | falhou | cancelado |
  interrompido`. Job: id (curto, único), tipo, título em PT-BR, escopo de lock,
  usaClaude, prompt/params, criadoEm/iniciadoEm/terminadoEm, resultado/erro.
- Interface `Runner`: recebe o job + emissor de eventos + AbortSignal; o runner FAKE
  (usado em testes) emite eventos sintéticos com delays e respeita abort.
- Persistência: `dados/jobs/<id>.json` (metadados, atualizados a cada transição).
  `dados/` é descartável — criar sob demanda, nunca versionar.
- Eventos de job vão para um EventEmitter interno (a T-009 pluga o SSE nele; nesta
  tarefa basta o emissor existir e ser testável).
- Rota nova em `servidor/src/rotas/jobs.ts` (convenção do agregador).

## Critérios de aceite
- [ ] Testes unitários da fila: (a) job global só executa quando nada mais roda e
      bloqueia tudo enquanto executa; (b) dois jobs do MESMO projeto nunca executam
      juntos; (c) jobs de projetos diferentes executam juntos respeitando o teto Claude
      (com teto=2, o 3º espera); (d) cancelar job `na-fila` remove da fila; (e)
      cancelar job `executando` aciona o AbortSignal e o estado final é `cancelado`.
- [ ] `GET /api/jobs` lista jobs (filtro `?estado=` opcional); `GET /api/jobs/:id`
      retorna o job ou 404; `POST /api/jobs/:id/cancelar` funciona nos dois estados
      canceláveis.
- [ ] Metadados persistidos em `dados/jobs/<id>.json`; após reiniciar o processo, o
      histórico segue consultável via API (teste automatizado recriando a instância).
- [ ] `npm test` passa; nenhum teste depende de rede ou login.

## Notas de execução

### Ciclo 1 (2026-07-21)

**O que foi feito** — motor de jobs completo com Node built-ins (zero dependência nova):

- `servidor/src/jobs/tipos.ts` — modelo: `Job` (id 8-hex, tipo, título PT-BR, escopo,
  `usaClaude`, params, timestamps, resultado/erro), 7 estados do RF-08, conjuntos
  `ESTADOS_TERMINAIS`/`ESTADOS_CANCELAVEIS`, `EventoJob` (canal único para a T-009),
  interfaces `Runner` e `ContextoExecucao` (emissor + AbortSignal).
- `servidor/src/jobs/fila.ts` — `GerenciadorJobs`: fila FIFO com locks (global exclusivo
  total; exclusivo por projeto; teto Claude só para `usaClaude`), runners plugáveis por
  tipo (`registrarRunner` — a T-008 pluga o real), cancelamento (na-fila = imediato;
  executando = abort + estado final `cancelado` quando o runner assentar), erros tipados
  `ErroJobNaoEncontrado`/`ErroJobNaoCancelavel` para a rota, EventEmitter público
  `emissor` (evento `"evento"`, payload `EventoJob`).
- `servidor/src/jobs/persistencia.ts` — grava/carrega `dados/jobs/<id>.json` (síncrono;
  ver DECISOES.md); arquivo malformado é avisado e pulado.
- `servidor/src/jobs/runner-fake.ts` — runner fake p/ testes: passos sintéticos com
  delay (`node:timers/promises` + signal), evento `log` por passo, `falharCom` opcional.
- `servidor/src/jobs/instancia.ts` — singleton `obterGerenciador()` +
  `reiniciarGerenciador()` (testes simulam restart); rotas resolvem a instância a cada
  request, nunca guardam referência.
- `servidor/src/rotas/jobs.ts` — contrato `{ prefixo, router }` do agregador:
  `GET /api/jobs` (`?estado=` validado, 400 se inválido), `GET /api/jobs/:id` (404),
  `POST /api/jobs/:id/cancelar` (200 imediato / 202 assíncrono / 404 / 409).
- `servidor/src/config.ts` — adicionados `tetoJobsClaude` (env `TETO_JOBS_CLAUDE`,
  default 2, validada) e `dirDados` (raiz do painel + `dados/`).
- Decisões de caminho registradas em `_gestao/DECISOES.md` (entrada "Núcleo de jobs
  (T-007)": anti-starvation do global, persistência síncrona, boot saneador →
  `interrompido`, cancelamento prevalece sobre o desfecho do runner).

**Como testar** — `cd servidor && npx vitest run testes/jobs` (20 testes, 3 arquivos:
`fila.test.ts` cobre os critérios a–e + falha + eventos + validações;
`persistencia.test.ts` cobre gravação por transição, restart e boot saneador;
`api.test.ts` cobre as rotas + restart via API). `npx tsc --noEmit` limpo. Nenhum teste
usa rede/login; todos usam diretórios temporários do SO.

**Execução real (fora do vitest):** motor exercitado via tsx num processo Node real
gravando no `dados/jobs/` de produção (3 jobs fake: teto 2 segurou o 3º; cancelamento de
na-fila ok); em seguida o servidor foi REINICIADO de verdade (porta 8766) e
`GET /api/jobs`, filtro `?estado=cancelado`, `GET /api/jobs/:id` e o 409 do cancelar
responderam certo sobre o histórico persistido — critério de restart validado também
manualmente, além do teste automatizado.

**Observações para as próximas tarefas:** o teste `api.test.ts` confirma que o módulo
carregado dinamicamente pelo agregador compartilha o mesmo grafo de módulos do teste
(singleton único sob Vitest). A T-009 pluga o SSE em `obterGerenciador().emissor`
(evento `"evento"`); transições já carregam snapshot do job em `dados.job`.

**Commit:** `ba2a9bf` — T-007: núcleo de jobs — modelo, fila com locks, persistência e
API básica (13 arquivos, commit seletivo: só as áreas da T-007 + gestão; T-003 rodava em
paralelo na mesma árvore e nada dela foi incluído).

### Ciclo 2 (2026-07-21) — correções da Revisão (ciclo 1)

**Causa raiz única atacada:** I/O falível sem tratamento no caminho quente da fila.

- **Achado 1 (fila.ts, cadeia final de `iniciar` sem catch):** `mudarEstado` agora é
  não-lançante — persistência passa por `persistir()` (try/catch + `console.warn`;
  estado em memória é a fonte imediata, boot saneador conserta o disco depois) e
  `emitirEvento` captura listener que lança (`console.error`; protege o SSE da T-009).
  A transição terminal ganhou `try { ... } finally { this.agendar() }` (reagendamento
  NUNCA é pulado) e a cadeia termina em `.catch` de última instância — unhandled
  rejection impossível a partir da fila.
- **Achado 2 (`criarJob` inseria antes de persistir):** ordem invertida — `salvarJob`
  roda ANTES de `jobs.set`/`fila.push`. Disco quebrado ou params não serializáveis
  (BigInt/circular) devolvem o erro ao chamador SEM job fantasma; de quebra, todo job
  em memória é garantidamente serializável para as transições seguintes.
- **Menor 1 (guard no `agendar`):** o passe pula job cuja `estado !== "na-fila"` —
  listener reentrante que cancela job enfileirado durante o próprio passe não faz
  job cancelado iniciar.
- **Menor 2 (escrita atômica):** `salvarJob` grava `<id>.json.tmp` + `renameSync` —
  crash no meio da escrita não deixa JSON truncado; sobra `.tmp` é ignorada pela carga
  (`carregarJobs` só lê `.json`).
- **Menor 3 (`aguardando-input`):** contrato documentado em comentário no `cancelar`
  da fila: a T-008 DEVE manter a entrada em `execucoes` enquanto o job aguarda input,
  senão o abort vira no-op e o 202 promete cancelamento que nunca assenta. Nada na
  T-007 gera esse estado — fica como responsabilidade explícita da T-008.
- Semântica registrada em `_gestao/DECISOES.md` (entrada "Núcleo de jobs (T-007,
  ciclo 2): I/O falível é fatal só na criação").

**Arquivos:** `servidor/src/jobs/fila.ts` e `servidor/src/jobs/persistencia.ts`
(correções); `servidor/testes/jobs/robustez.test.ts` (NOVO — 4 testes de regressão:
criação com persistência falhando não deixa fantasma; listener que lança não derruba
nem trava a fila, com espera por polling; falha de disco no assentamento não estagna a
fila, sabotando o destino com um diretório para forçar EPERM real; job cancelado por
listener reentrante durante o passe de agendamento nunca inicia);
`servidor/testes/jobs/persistencia.test.ts` (sem resíduo `.tmp` após transições;
sobra `.json.tmp` de crash ignorada na carga).

**Como testar:** `cd servidor && npx vitest run testes/jobs` → 4 arquivos, **24/24**
verdes (~1,4s de testes). `npx tsc --noEmit` limpo.

**Execução real (fora do vitest):** script tsx efêmero num processo Node real (v24,
default `--unhandled-rejections=throw`): criação com BigInt rejeitada com 0 jobs
listados; listener sabotado + destino de persistência trocado por diretório
(EPERM real de rename no Windows) → job assentou `concluido` em memória, job seguinte
do mesmo projeto rodou até o fim, processo sobreviveu sem crash. Servidor real também
subiu na porta 8767 e `GET /api/jobs` devolveu 200 com o histórico persistido do
ciclo 1 (boot com a escrita atômica nova lendo os arquivos antigos). Processo
encerrado, porta liberada, script temporário apagado.

**Commit:** `d862ccc` — T-007: robustez do núcleo de jobs — I/O falível fora do
caminho quente (ciclo 2). 6 arquivos, commit seletivo: só as áreas da T-007 +
gestão da própria tarefa (modificações alheias de T-001..T-004 na árvore NÃO
incluídas).

## Verificação

### Ciclo 1 (2026-07-21) — testador

Veredito: **APROVADA** — 4 critérios, 4 PASSOU. Ambiente: Windows 10 + PowerShell,
commit `ba2a9bf`. Nota: `areas` do frontmatter corrigida de `servidor/test/jobs/` para
`servidor/testes/jobs/` (convenção real do repositório; autorizado no despacho).

**Critério 1 — testes unitários da fila (a)–(e): PASSOU.**
`cd servidor && npx vitest run testes/jobs` → 3 arquivos, **20/20 verdes** (~2,3s).
`fila.test.ts` cobre literalmente cada item: (a) global só inicia com máquina vazia,
bloqueia tudo enquanto roda e barra os enfileirados depois dele (anti-starvation);
(b) 2 jobs do mesmo projeto serializados (runner manual prova ordem de início);
(c) teto=2: alfa+beta executam, gama (3º Claude) espera e entra quando a vaga libera;
não-Claude (delta) roda junto ignorando o teto (`executandoAgora === 3`); (d) cancelar
na-fila remove da fila e o job nunca executa (`iniciados` não o contém); (e) cancelar
executando aborta via AbortSignal (fake de ~5s termina `cancelado` em instantes,
`executandoAgora === 0`). Extras verificados nos mesmos testes: falha com mensagem,
eventos no canal único (`na-fila → executando → concluido` + logs), rejeição de tipo
sem runner e escopo inválido, 409 lógico para cancelar terminal.

**Critério 2 — API GET/GET:id/POST cancelar: PASSOU.**
Além do `api.test.ts` (7/7, via supertest), exercitei o servidor REAL
(`PORTA=8766 npx tsx src/index.ts` + curl):
- `GET /api/jobs` → 200 com a lista (4 jobs, mais recentes primeiro).
- `GET /api/jobs?estado=cancelado` → 200 só com o job cancelado;
  `?estado=fritando` → 400 com mensagem PT-BR listando os estados válidos;
  bordas: `?estado=` vazio → 400; `?estado=na-fila&estado=executando` (query
  duplicada vira array) → 400 — nada quebra com entrada torta.
- `GET /api/jobs/4a755a1e` → 200 com o job; `GET /api/jobs/nao-existe` → 404 JSON.
- `POST /api/jobs/:id/cancelar` nos DOIS estados canceláveis, via HTTP real (processo
  auxiliar com runner fake registrado, 2 jobs do mesmo projeto): na-fila → **200** com
  `estado: "cancelado"` imediato; executando → **202** com job ainda `executando`, e o
  estado final `cancelado` assentou em <1s (fake levaria 60s — AbortSignal respeitado
  de verdade). Erros: cancelar inexistente → 404; cancelar `concluido` → 409; cancelar
  `interrompido` → 409.

**Critério 3 — persistência + restart: PASSOU.**
- Automatizado: `persistencia.test.ts` (4/4) grava na criação, atualiza a cada
  transição (executando/concluido com `resultado`), instância nova no mesmo diretório
  recupera o histórico; `api.test.ts` repete via API com `reiniciarGerenciador`.
- Real: processo NOVO do servidor (tsx, porta 8766) leu o `dados/jobs/` de produção
  gravado pelo processo do Ciclo 1 — `GET /api/jobs` devolveu o histórico completo,
  filtro e busca por id funcionando sobre ele.
- Boot saneador validado no servidor real: forjei `dados/jobs/deadbe0f.json` com
  `estado: "executando"` (processo "caiu"); ao subir, a API o devolveu como
  `interrompido` com `erro: "Processo do painel reiniciou antes de o job terminar"` e
  o arquivo no disco foi reescrito igual. (Arquivo forjado removido após o teste.)

**Critério 4 — `npm test` passa, sem rede/login: PASSOU.**
`npm test` na raiz do monorepo → servidor: `tsc --noEmit` limpo + **49/49** testes;
web: **7/7**. Total 56/56, ~6s. Grep por `http://|fetch(|anthropic|login` em
`servidor/testes/` → zero ocorrências; jobs usam runners fake/manuais e diretórios
temporários do SO (supertest é servidor efêmero em loopback, sem rede externa).

**Notas (não bloqueiam):**
- `dados/jobs/` de produção mantém os 3 jobs fake da validação manual do executor
  (`2a8be82a`, `4a755a1e`, `64de21b5`). `dados/` é descartável e está no .gitignore —
  sem risco de contaminação de commit; quem quiser zera a pasta.
- Ao final: portas 8765/8766 livres, processos encerrados, artefatos do testador
  (script `tmp-t007-verificacao.ts` e job forjado) apagados; árvore git ficou apenas
  com as modificações de gestão pré-existentes.

## Revisão

### Ciclo 1 (2026-07-21) — revisor

Veredito: **REPROVADA** — 2 achados `importante` (mesma causa raiz: I/O falível sem
tratamento no caminho quente da fila). Diff revisado por inteiro (commit `ba2a9bf`,
13 arquivos), com leitura cruzada de `app.ts`, `index.ts` e `agregador-rotas.ts`.

**Achados que reprovam:**

1. `[importante]` `servidor/src/jobs/fila.ts:211-232` — a cadeia assíncrona final de
   `iniciar` não tem NENHUM catch: o último `.then` chama `mudarEstado` → `salvarJob`
   (`writeFileSync`, que lança em disco cheio/EPERM/EBUSY) e `emitirEvento` (listeners
   síncronos — a T-009 vai plugar o SSE exatamente aí). Qualquer throw nesse handler
   vira *unhandled rejection* e, no Node 22 (default `--unhandled-rejections=throw`,
   sem `process.on("unhandledRejection")` em `index.ts`), **derruba o processo
   inteiro do painel**. Cenário concreto: o painel vive em `Documents\` (alvo clássico
   de OneDrive/antivírus no Windows); o runner assenta no instante em que o sync segura
   `dados/jobs/<id>.json` → `writeFileSync` lança EBUSY → o servidor morre, matando
   todos os jobs Claude em andamento. Agravante mesmo sem crash: o throw acontece
   ANTES de `this.agendar()` (l.231) e do `emitirEvento` — fila estagnada (lock já
   liberado, mas ninguém agenda) e UI/SSE nunca sabem que o job terminou. Correção
   esperada: envolver a transição terminal em try/catch (persistência falhou → logar e
   seguir; estado em memória é a fonte imediata) e garantir que `agendar()` sempre rode.

2. `[importante]` `servidor/src/jobs/fila.ts:110-124` (`criarJob`) — o job entra em
   `this.jobs` e `this.fila` ANTES do `salvarJob`. Se a persistência lançar (disco
   cheio; ou `params` não serializável — `BigInt`/referência circular, que
   `JSON.stringify` rejeita e ninguém valida), o chamador recebe a exceção ("criação
   falhou"), mas o **job fantasma permanece agendável e executa** no próximo
   `agendar()` disparado por qualquer evento da fila. Cenário concreto: ação da
   fábrica cria job com disco cheio → usuário vê 500 → tenta de novo → o fantasma
   TAMBÉM roda → job Claude executado em duplicata (custo real). E com `params`
   contendo BigInt, o `salvarJob` da transição para `executando` lança de novo —
   dentro da cadeia do achado 1 → crash do processo. Correção esperada: persistir
   antes de inserir na fila (ou desfazer a inserção no catch) e/ou validar
   serializabilidade dos `params` na entrada.

**Notas menores (NÃO reprovam; corrigir se barato ou herdar nas próximas tarefas):**

- `fila.ts:174-192` — `agendar` não confere `job.estado === "na-fila"` antes de
  `iniciar`: um listener síncrono do emissor que cancele um job enfileirado durante o
  mesmo passe de agendamento faria um job já `cancelado` iniciar (terminal →
  executando). Hoje só alcançável com listener reentrante; guard de uma linha.
- `persistencia.ts:12-15` — `writeFileSync` direto, sem temp+rename: crash no meio da
  escrita deixa JSON truncado e no boot o job é "avisado e pulado" — some do
  histórico em vez de virar `interrompido`.
- `fila.ts:158-159` — cancelar job `aguardando-input` sem entrada em `execucoes`:
  `?.abort()` é no-op silencioso e a rota devolve 202 prometendo um cancelamento que
  nunca assenta. Inalcançável na T-007 (nada gera esse estado); contrato a fechar na
  T-008.

**O que verifiquei e está correto:** locks sem corrida de duplo-start (JS
single-thread + `agendar` totalmente síncrono + splice da fila antes de qualquer
emit em `iniciar`); anti-starvation do global correta (barra só os enfileirados
depois dele; os anteriores drenam, sem deadlock — todo assentamento chama
`agendar`); "cancelamento prevalece" resolve deterministicamente a janela
runner-assenta-antes-do-abort (decisão registrada em DECISOES.md);
`execucoes`/`cancelamentosPedidos` limpos no assentamento (sem leak); rotas traduzem
os erros tipados certo (404/409; throw síncrono cai no error handler do Express 5);
validação de `?estado=` cobre array e vazio; IDs 8-hex com checagem de colisão; boot
saneador reescreve o disco; `aguardarEstado` dos testes remove listeners (sem leak de
EventEmitter na suíte); nenhum segredo, nenhuma injeção (params nunca viram
caminho/comando; id de rota só é usado como chave de Map).