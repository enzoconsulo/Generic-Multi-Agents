---
id: T-010
titulo: Inputs pendentes — fluxo pausa, UI pergunta, resposta volta ao agente
projeto: painel-fabrica
status: backlog
prioridade: alta
dependencias: [T-008, T-009]
areas: [servidor/src/jobs/inputs.ts, servidor/src/rotas/inputs.ts, servidor/test/inputs/]
tentativas: 0
criada: 2026-07-21
atualizada: 2026-07-21
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


## Verificação


## Revisão

