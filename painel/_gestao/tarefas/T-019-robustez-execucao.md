---
id: T-019
titulo: Robustez de execução — watchdog, guardrails e recuperação pós-reinício
projeto: painel-fabrica
status: concluida
prioridade: media
dependencias: [T-008, T-010]
areas: [servidor/src/jobs/robustez/, servidor/test/robustez/]
tentativas: 0
criada: 2026-07-21
atualizada: 2026-07-27
---

## Objetivo
Blindar o motor de jobs para sessões longas: watchdog de inatividade que interrompe jobs
travados, guardrails configuráveis (maxTurns / orçamento), e recuperação limpa no boot
do servidor (jobs órfãos marcados `interrompido`, pendências fechadas).

## Contexto
- Módulo novo em `servidor/src/jobs/robustez/` plugando nos pontos existentes de
  T-007/T-008/T-010 — evitar reescrever os módulos já testados; se precisar de hook
  novo no núcleo, mudança mínima e cirúrgica.
- Watchdog: sem NENHUM evento novo de um job Claude por N minutos (config, default 15)
  → `interrupt()`/abort + estado `interrompido` com motivo "inatividade". Atenção à
  armadilha da pesquisa: subagentes em background podem segurar o encerramento por até
  10 min após o result — o watchdog conta a partir do último evento, não do início.
- Guardrails nas options do SDK por tipo de ação (config): `maxTurns` (fluxos longos
  como /trabalhar precisam de teto alto — default 200) e `maxBudgetUsd` opcional
  (default: sem teto; é estimativa informacional).
- Recuperação no boot: jobs persistidos como `executando`/`aguardando-input` sem
  processo vivo (qualquer um, após restart) → `interrompido` com nota "servidor
  reiniciou durante a execução"; inputs pendentes do job fechados; evento SSE emitido.
- **Achado da revisão do T-017/T-018 (2026-07-27) — incluir no escopo:** o saneador de
  boot do gerenciador conserta o estado dos JOBS, mas não o resultado de CI persistido.
  `dados/ci/<projeto>.json` é gravado com `estado: "executando"` no início do pipeline e
  só reescrito ao fim; se o processo cair no meio, o arquivo fica dizendo "executando"
  para sempre e a aba CI/CD (T-018) exibe esse estado velho. O boot deve reconciliar:
  resultado de CI não-terminal cujo `jobId` não está executando → `cancelado`/
  `interrompido` com nota.
- Expor no metadado do job (`GET /api/jobs/:id`): `session_id` e `cwd` quando
  existirem — instrução de retomada MANUAL documentada na resposta/README (retomada
  automática está fora de escopo).

## Critérios de aceite
- [x] Teste com runner fake que emite um evento e silencia: watchdog (limite encurtado
      no teste) dispara, job termina `interrompido` com motivo de inatividade e o
      abort foi acionado.
- [x] Teste de boot: persistir job `executando` e um input pendente, recriar a
      instância do servidor → job vira `interrompido` com nota, pendência não aparece
      mais em `GET /api/inputs`, evento SSE de transição emitido.
- [x] Builder de options do SDK aplica maxTurns/maxBudgetUsd/watchdog da config por
      tipo de ação (teste unitário puro do builder).
- [x] `GET /api/jobs/:id` de um job que rodou de verdade (ou fake com metadados
      simulados) inclui `session_id` e `cwd`.
- [x] `npm test` passa sem rede/login.

## Notas de execução
Construída DIRETO pelo orquestrador (Opus), sem pipeline — decisão de custo geral do painel.

**Mudanças cirúrgicas no núcleo** (a tarefa autoriza "se precisar de hook novo, mínima"):
- `fila.ts` ganhou `interromper(id, motivo)`, irmão de `cancelar` mas terminando em
  `interrompido` com o motivo — cancelar é ação do USUÁRIO, interromper é decisão do
  SISTEMA, e misturar os dois na UI apagaria a diferença. Se ambos forem pedidos, o
  cancelamento do usuário prevalece (testado).
- `ContextoExecucao` ganhou `anotar({ sessionId, cwd })`, que grava no job e persiste na
  hora. **Ponto central da tarefa:** antes o `sessionId` só existia no resultado do job
  CONCLUÍDO — ou seja, nunca nos casos em que retomar à mão importa. Agora o
  `runner-claude` anota no `system/init`.
- Saneamento de boot: já marcava job pendurado como `interrompido` (T-007), mas (a) as
  pendências de input abertas seguiam "aguardando resposta" para sempre no metadado —
  agora são fechadas com nota; e (b) as transições não eram observáveis, porque o
  construtor roda ANTES de o hub SSE conectar. Resolvido com `publicarSaneamentoDeBoot()`,
  que o `inicializar.ts` chama depois de `hub.conectar` (idempotente).

**Módulo novo `src/jobs/robustez/`:**
- `watchdog.ts` — vigia jobs Claude em execução; conta do ÚLTIMO evento, não do início
  (fluxo longo é normal; silêncio é que denuncia travamento). Duas decisões deliberadas:
  `aguardando-input` NÃO conta como inatividade (esperar humano não é travar — mataria
  justamente o fluxo da T-010), e jobs não-Claude ficam de fora (o CI já tem timeout por
  estágio, T-017; duas proteções concorrentes só gerariam interrupção falsa). Relógio
  injetável e `varrer()` público: os testes controlam o tempo, sem timer real.
- `guardrails.ts` — tabela data-driven por ação (`/trabalhar` 200 turnos e watchdog mais
  paciente; `/status` 40 e menos paciente; ação desconhecida cai no padrão, isto é, nasce
  protegida e não ilimitada). `maxBudgetUsd` fica `null` de propósito: a assinatura não
  cobra por chamada, então é informacional. Plugado no `montarJobAcao` — nenhum fluxo sobe
  mais sem teto; um `maxTurns` explícito do disparo continua vencendo.
- Reconciliação do CI órfão (achado da revisão do T-017/T-018):
  `reconciliarResultadosOrfaos` em `ci/resultados.ts`, chamada no boot. Resultado deixado
  como `executando` vira `interrompido` (estado novo) e os estágios não terminados viram
  `cancelado`; os já concluídos são preservados. Refletido na UI (rótulo + cor).

## Verificação
`cd painel && npm test`: **servidor 195/195** (+23: `watchdog.test.ts` 6,
`recuperacao-boot.test.ts` 8, `guardrails.test.ts` 7, `metadados-retomada.test.ts` 2) **+
web 14/14**. `npm run build` limpo (tsc estrito + vite). Sem rede/login em nenhum teste
(watchdog com relógio injetado; runner Claude falsificado). Sem verificação formal do
testador/revisor — decisão de custo já registrada para todo o painel.

Não exercitado ao vivo: o watchdog em produção só dispara após 15–20 min de silêncio real
de um fluxo pago; a prova é a suíte determinística. A reconciliação de CI no boot também
não foi vista com o painel de verdade caindo no meio de um pipeline.

## Revisão
Pulada (decisão de custo). Auto-revisão: `npx tsc --noEmit` limpo nos dois workspaces; o
compilador pegou os 3 contextos falsos de teste que precisavam do `anotar` novo.

