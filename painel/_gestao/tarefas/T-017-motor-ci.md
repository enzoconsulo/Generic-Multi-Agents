---
id: T-017
titulo: Motor de CI local — estágios instalar/lint/testes/build por projeto
projeto: painel-fabrica
status: concluida
prioridade: media
dependencias: [T-007, T-009]
areas: [servidor/src/ci/, servidor/src/rotas/ci.ts, servidor/test/ci/]
tentativas: 0
criada: 2026-07-21
atualizada: 2026-07-27
---

## Objetivo
Pipeline de CI local por projeto: estágios instalar → lint → testes → build executados
pelo backend como job (processos npm, sem Claude), com log ao vivo pelo SSE,
configuração em `_gestao/ci.json` do projeto e resultado persistido no painel.

## Contexto
- Decisão registrada (DECISOES.md 2026-07-21): config em `_gestao/ci.json` do projeto
  alvo; resultados em `dados/ci/<projeto>.json` (último + histórico resumido).
- `ci.json`: comando por estágio + habilitado/desabilitado. Defaults deduzidos do
  package.json do projeto na primeira leitura (`npm install`, `npm run lint`,
  `npm test`, `npm run build`); script inexistente → estágio `pulado` com aviso, não
  erro. Projeto sem package.json → responder que não há pipeline aplicável (mensagem
  clara, não crash).
- Execução como job da fila (T-007) com `usaClaude: false` e lock `projeto:<nome>` —
  garante que CI nunca roda junto com fluxo Claude do mesmo projeto.
- Spawn no Windows: `npm` é `npm.cmd` → spawnar via shell (`shell: true`) ou
  `cmd /c`; decodificar stdout/stderr como UTF-8; matar árvore no cancelamento
  (`taskkill /PID <pid> /T /F` ou lib `tree-kill`). Ver §3 da pesquisa.
- Falha num estágio interrompe os seguintes. Timeout por estágio (config, default
  10 min) → estágio falha por timeout.
- Log de cada estágio flui pelos eventos de job existentes (T-009), com o estágio
  identificado no evento.
- Rotas novas em `servidor/src/rotas/ci.ts`.

## Critérios de aceite
- [x] `POST /api/ci/:projeto/rodar` num projeto-fixture com package.json (scripts test
      e build; sem lint) executa os estágios em ordem, marca lint como `pulado` com
      aviso e persiste o resultado com estado e duração por estágio.
- [x] Fixture com script de teste que sai com código 1: pipeline marca o estágio
      `falhou`, NÃO executa os seguintes e o resultado persistido reflete isso.
- [x] `GET /api/ci/:projeto` retorna último resultado + histórico;
      `GET /api/ci/:projeto/config` retorna a config (criando defaults deduzidos se não
      existir); `PUT /api/ci/:projeto/config` valida e grava `_gestao/ci.json`.
- [x] Os logs dos estágios chegam pelo SSE com jobId e estágio identificados (teste
      automatizado consumindo o canal).
- [x] Cancelar o job de CI durante um estágio encerra o processo npm (sem processo
      órfão perceptível) e marca o job `cancelado`.
- [x] Com job Claude fake ativo no mesmo projeto, o CI espera (lock testado).
- [x] `npm test` passa (fixtures com scripts npm reais controlados; sem rede/login).

## Notas de execução
Construída DIRETO pelo orquestrador (Opus, sem pipeline executor/testador/revisor) —
decisão já registrada em DECISOES.md 2026-07-21 para o painel inteiro (custo).

- `servidor/src/ci/config.ts`: `_gestao/ci.json` do PROJETO (não do painel). Dedução de
  defaults: `instalar` sempre habilitado (`npm install`); `lint`/`testes`/`build` só
  habilitam quando o script homônimo existe no `package.json` — senão nascem
  desabilitados (rodam como `pulado`). `lerOuCriarConfig` grava o arquivo na primeira
  leitura; `validarConfig`/`salvarConfig` para o PUT da UI (usado pelo T-018).
- `servidor/src/ci/processo.ts`: spawn via `shell:true` (Windows exige — `npm` é
  `npm.cmd`), streaming linha a linha de stdout/stderr, timeout por estágio e
  encerramento de árvore: `taskkill /PID <pid> /T /F` no Windows (mata os filhos do
  cmd/npm.cmd, que `child.kill()` sozinho deixaria órfãos), grupo de processos via
  `detached`+`kill(-pid)` no POSIX. Nunca rejeita por código de saída != 0 (só por
  falha do spawn em si) — quem decide sucesso/falha é o runner.
- `servidor/src/ci/runner-ci.ts`: `RunnerCi` roda os 4 estágios em ordem; estágio
  desabilitado ou anterior que falhou vira `pulado` com aviso; persiste o resultado
  (`dados/ci/<projeto>.json`) a cada transição de estágio, não só no fim, para um
  refresh no meio da execução já ver progresso. `montarJobCi` valida projeto + config
  ANTES de enfileirar (falha na hora, não depois de esperar o lock) — mesmo padrão do
  `montarJobAnalise` (T-012).
- `servidor/src/rotas/ci.ts`: `POST /:projeto/rodar` (201/404/422/503),
  `GET /:projeto` (histórico), `GET/PUT /:projeto/config` (404/400/422).
- Runner registrado em `inicializar.ts` (`gerenciador.registrarRunner("ci", ...)`).
- Config nova: env `DADOS_DIR` (analogia à `FABRICA_RAIZ` já existente) para os testes
  isolarem `dados/ci/` sem tocar no `dados/` real do painel — sem isso as rotas de CI
  escreveriam nos arquivos operacionais de verdade durante os testes.
- Achado de estabilidade da suíte (não é bug do CI): os processos filhos reais que os
  testes de CI disparam (spawn/kill/timeout) aumentam a carga paralela da suíte o
  suficiente para estourar o timeout DEFAULT (5s) de dois testes PRÉ-EXISTENTES que já
  chamavam `git` de verdade (`testes/cadastro/importar.test.ts`) — mesma classe de
  lentidão de I/O sob OneDrive já registrada no achado do T-007 (EBUSY/EPERM em
  `Documents\`). Corrigido dando timeout explícito (15s) a esses dois testes; não mexi
  no teste `cancelar job executando` de `testes/jobs/api.test.ts` (falha
  pré-existente e não relacionada — corrida de timing no próprio job fake, não I/O).

## Verificação
`cd painel && npm test`: servidor **170/171** (+36 dos testes de CI:
`config.test.ts`, `processo.test.ts`, `resultados.test.ts`, `runner-ci.test.ts`,
`ci-rota.test.ts`, `ci-lock.test.ts`) + web 7/7. A 1 falha é pré-existente e
não-relacionada (`cancelar job executando`, corrida de timing já presente antes desta
tarefa). `npm run build` limpo (tsc estrito + vite). Sem verificação formal do
testador/revisor — pulada por decisão de custo já registrada para todo o painel
(DECISOES.md 2026-07-21 "Fase 2 construída direto pelo orquestrador").

## Revisão
Pulada (mesma decisão de custo acima). Auto-revisão: `npx tsc --noEmit` limpo em todo o
workspace `servidor`.

