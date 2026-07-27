---
id: T-019
titulo: Robustez de execução — watchdog, guardrails e recuperação pós-reinício
projeto: painel-fabrica
status: backlog
prioridade: media
dependencias: [T-008, T-010]
areas: [servidor/src/jobs/robustez/, servidor/test/robustez/]
tentativas: 0
criada: 2026-07-21
atualizada: 2026-07-21
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
- [ ] Teste com runner fake que emite um evento e silencia: watchdog (limite encurtado
      no teste) dispara, job termina `interrompido` com motivo de inatividade e o
      abort foi acionado.
- [ ] Teste de boot: persistir job `executando` e um input pendente, recriar a
      instância do servidor → job vira `interrompido` com nota, pendência não aparece
      mais em `GET /api/inputs`, evento SSE de transição emitido.
- [ ] Builder de options do SDK aplica maxTurns/maxBudgetUsd/watchdog da config por
      tipo de ação (teste unitário puro do builder).
- [ ] `GET /api/jobs/:id` de um job que rodou de verdade (ou fake com metadados
      simulados) inclui `session_id` e `cwd`.
- [ ] `npm test` passa sem rede/login.

## Notas de execução


## Verificação


## Revisão

