---
id: T-017
titulo: Motor de CI local — estágios instalar/lint/testes/build por projeto
projeto: painel-fabrica
status: backlog
prioridade: media
dependencias: [T-007, T-009]
areas: [servidor/src/ci/, servidor/src/rotas/ci.ts, servidor/test/ci/]
tentativas: 0
criada: 2026-07-21
atualizada: 2026-07-21
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
- [ ] `POST /api/ci/:projeto/rodar` num projeto-fixture com package.json (scripts test
      e build; sem lint) executa os estágios em ordem, marca lint como `pulado` com
      aviso e persiste o resultado com estado e duração por estágio.
- [ ] Fixture com script de teste que sai com código 1: pipeline marca o estágio
      `falhou`, NÃO executa os seguintes e o resultado persistido reflete isso.
- [ ] `GET /api/ci/:projeto` retorna último resultado + histórico;
      `GET /api/ci/:projeto/config` retorna a config (criando defaults deduzidos se não
      existir); `PUT /api/ci/:projeto/config` valida e grava `_gestao/ci.json`.
- [ ] Os logs dos estágios chegam pelo SSE com jobId e estágio identificados (teste
      automatizado consumindo o canal).
- [ ] Cancelar o job de CI durante um estágio encerra o processo npm (sem processo
      órfão perceptível) e marca o job `cancelado`.
- [ ] Com job Claude fake ativo no mesmo projeto, o CI espera (lock testado).
- [ ] `npm test` passa (fixtures com scripts npm reais controlados; sem rede/login).

## Notas de execução


## Verificação


## Revisão

