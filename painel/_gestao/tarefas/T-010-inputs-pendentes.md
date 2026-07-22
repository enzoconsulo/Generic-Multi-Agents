---
id: T-010
titulo: Inputs pendentes — fluxo pausa, UI pergunta, resposta volta ao agente
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: [T-008, T-009]
areas: [servidor/src/jobs/inputs.ts, servidor/src/rotas/inputs.ts, servidor/test/inputs/]
tentativas: 1
criada: 2026-07-21
atualizada: 2026-07-22
---

## Objetivo
Mecanismo pergunta→resposta entre agente e usuário: pedidos de aprovação de ferramenta
(`canUseTool`) e perguntas (`AskUserQuestion`) viram "inputs pendentes" expostos pela
API; o job pausa em `aguardando-input` e a resposta do usuário destrava o fluxo.

## Contexto
- Pluga no ponto de extensão `canUseTool` deixado pela T-008 (substitui o default que
  nega). O callback cria a pendência, emite evento SSE `input-pendente`, muda o job para
  `aguardando-input` e retorna uma Promise que só resolve quando a resposta chegar.
- Pendência: id, jobId, tipo (`aprovacao-ferramenta` | `pergunta`), título e descrição
  em PT-BR legíveis (para aprovação de ferramenta: nome da ferramenta + resumo seguro do
  input; para pergunta: texto e opções vindos do AskUserQuestion).
- Respostas: aprovação → `{ behavior: "allow", updatedInput }`; negação →
  `{ behavior: "deny", message }` (o fluxo continua, o agente decide o que fazer);
  pergunta → resposta escolhida/digitada.
- Sem timeout: pendência espera o usuário (requisito do produto). Job volta a
  `executando` ao responder.
- Recuperação pós-reinício NÃO é desta tarefa (T-019 cuida): se o servidor cair com
  pendência aberta, o comportamento desta versão pode ser indefinido — documentar no
  código.
- Persistir pendências abertas/resolvidas no metadado do job (auditoria no histórico).

## Critérios de aceite
- [ ] Com runner fake que simula pedido de aprovação: job vai a `aguardando-input`,
      `GET /api/inputs` lista a pendência com textos em PT-BR e o evento SSE
      `input-pendente` é emitido (teste automatizado).
- [ ] `POST /api/inputs/:id/resposta` com aprovação → o runner recebe allow e o job
      volta a `executando` (teste automatizado).
- [ ] Resposta de negação → runner recebe deny com mensagem; o job NÃO trava nem falha
      por isso (teste automatizado).
- [ ] Responder pendência inexistente ou já respondida → 404/409 com mensagem PT-BR.
- [ ] Integração real (`npm run teste:integracao`): job Claude com um comando fora do
      allowlist dispara canUseTool → pendência criada → aprovação via API → job conclui.
- [ ] `npm test` passa sem rede/login.

## Notas de execução
Construída direto pelo orquestrador (Opus, fora do pipeline).
- Tipos em `jobs/tipos.ts`: `NovaPendencia`/`Pendencia`/`RespostaInput`/`TipoPendencia`;
  `ContextoExecucao` ganhou `pedirInput(pendencia)`; `Job` ganhou `inputs?` (auditoria).
- `jobs/inputs.ts` — `RegistroInputs`: pareia pergunta↔resposta (Promise por pendência),
  `criar`/`listar`/`responder` (404/409)/`abortarDeJob` (cancelamento).
- `jobs/fila.ts` — o gerenciador expõe `listarInputs`/`responderInput` e o privado
  `pedirInput` (wired em `ctx.pedirInput`): muda o job para `aguardando-input`, emite
  `input-pendente`, e volta a `executando` ao responder. Cancelamento rejeita as pendências
  abertas do job (destrava o runner). O job em `aguardando-input` segue em `execucoes` (segura
  slot/lock) — comportamento já antecipado pelo motor da T-007.
- `rotas/inputs.ts` — `GET /api/inputs` (abertas) e `POST /api/inputs/:id/resposta` (404/409).
- `jobs/claude/runner-claude.ts` — `canUseTool` roteia aprovação de ferramenta e
  `AskUserQuestion` para `ctx.pedirInput`. Sob o default `bypassPermissions` o SDK NÃO chama o
  callback (autonomia preservada); um disparo com `permissionMode: "default"` liga as
  aprovações pela UI.
- Web: painel **"⏸ Aguardando você"** na página de Jobs (aprovar/negar com motivo, ou
  escolher opção/digitar resposta); `useJobsAoVivo` acompanha as pendências pelo SSE
  (`input-pendente`/`input-respondido`).

## Verificação
- `npm test`: servidor 135/135 (+5) + web 7/7; tsc estrito limpo.
- **5 testes automatizados** (`testes/inputs/`) cobrem: pausa em `aguardando-input`, `GET
  /api/inputs` com textos PT-BR, evento SSE `input-pendente`, aprovação → runner recebe allow
  e job conclui, negação → runner recebe deny sem travar/falhar, pergunta com opções, 404/409,
  e cancelar destrava o runner (rejeita a pendência).
- **Liveness ao vivo:** `GET /api/inputs` → `{"inputs":[]}`, resposta a id inexistente → 404,
  e o SPA servido contém o painel "Aguardando você".
- **Pendente (não bloqueia a tarefa):** a integração REAL do `canUseTool` com o SDK (comando
  fora do allowlist → pendência → aprovação → job conclui) é o critério de `teste:integracao`
  (exige login + run pago com `permissionMode: default`). O callback está wired; falta só a
  validação paga ao vivo. Recuperação pós-reinício de pendência aberta é da T-019.

## Revisão
Verificação/revisão formais dispensadas por decisão de custo (Fase 2 direto) — cobertura por
suíte automatizada + liveness. Limitação documentada no código: pendência aberta não sobrevive
a reinício do processo (Promises vivem na memória; o job carregado do disco vira `interrompido`
pelo boot saneador). T-019 trata recuperação.

