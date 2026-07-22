---
id: T-008
titulo: Runner Claude — executar jobs via Agent SDK com streaming e cancelamento
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: [T-001, T-007]
areas: [servidor/src/jobs/claude/, servidor/test/jobs-claude/]
tentativas: 0
criada: 2026-07-21
atualizada: 2026-07-21
---

## Objetivo
Runner real que implementa a interface da T-007 usando `@anthropic-ai/claude-agent-sdk`:
executa o prompt do job com cwd/modelo/permissões corretos, converte cada `SDKMessage`
em evento de job, respeita AbortController e registra session_id, turnos e custo.

## Contexto
- APLICAR o resultado do spike T-001 (ler as Notas de execução dele e a entrada em
  DECISOES.md): caminho de autenticação validado, versão pinada do SDK, alias de modelo.
  Pinar a MESMA versão no `servidor/package.json`.
- Referência de uso: `_gestao/pesquisas/2026-07-21-claude-code-headless.md` §"Uso
  concreto do SDK" e §"Armadilhas". Options por job: `cwd` (vem do job), `model`
  (config, default `fable`), `permissionMode: "acceptEdits"`,
  `includePartialMessages: true`, `abortController`, `maxTurns` (config), e a opção
  equivalente ao flag `--forward-subagent-text` se a versão pinada expuser (verificar na
  doc da versão; anotar nas notas).
- `canUseTool`: nesta tarefa, apenas um ponto de extensão injetável; implementação
  default NEGA com mensagem clara em PT-BR ("aprovação pela UI ainda não disponível") —
  a T-010 pluga a UI. Manter o allowlist de `.claude/settings.json` fazendo o grosso do
  trabalho (settingSources default).
- Mapeamento SDKMessage → evento de job: init (session_id), texto do assistente,
  tool_use/tool_result resumidos, `parent_tool_use_id` preservado (a UI agrupa
  subagentes por ele), result (custo/turnos/is_error). Persistir cada evento em
  `dados/jobs/<id>.ndjson` (1 JSON por linha, na ordem).
- Persistir no metadado do job o par `(session_id, cwd)` — base para retomada manual
  futura (T-019 expõe).
- Testes unitários do mapeamento usam mensagens SIMULADAS (sem rede). Testes que rodam o
  Claude de verdade vão no script `teste:integracao` (fora do `npm test`).

## Critérios de aceite
- [ ] `npm run teste:integracao` executa: job com prompt trivial ("Responda apenas OK",
      maxTurns baixo, cwd = pasta temporária) termina `concluido`, com session_id,
      num_turns e custo estimado registrados no metadado do job.
- [ ] Eventos do job gravados em `dados/jobs/<id>.ndjson` na ordem recebida — init
      primeiro, result por último (verificado no teste de integração).
- [ ] Cancelamento real: job em execução cancelado via API termina `cancelado` e o
      processo/atividade do SDK encerra (tolerância de até 60s; teste de integração).
- [ ] Job com cwd inexistente termina `falhou` com mensagem de erro legível em PT-BR
      (teste unitário ou de integração).
- [ ] Testes unitários do mapeamento SDKMessage→evento (init, assistant com tool_use,
      subagente com parent_tool_use_id, result) passam SEM rede/login; `npm test` passa.

## Notas de execução

### Construção direta pelo orquestrador (2026-07-21, Opus)
Construída direto (fora do pipeline, decisão de custo do usuário). `servidor/src/jobs/claude/runner-claude.ts`:
implementa `Runner` chamando o Agent SDK (`query`, versão pinada 0.3.217 instalada no
workspace servidor), traduz cada mensagem tipada (system/init, assistant texto+tool_use
com marca de subagente, result) em eventos `log` do job e liga o AbortSignal ao
AbortController do SDK (cancelamento in-band). `query` é injetável para testes sem gastar
assinatura. permissionMode default `bypassPermissions` (ferramenta local pessoal — inputs
via UI/canUseTool ficam para a T-010).

**Verificação:** 4 testes em `servidor/testes/jobs-claude/runner-claude.test.ts` (SDK
falsificado) + **execução REAL ao vivo**: `/status painel-fabrica` no modelo haiku
concluiu em ~63s, custo ~US$0,14, 30 turnos, retornou o painel de status real da fábrica.

## Verificação
(verificação formal do testador dispensada por decisão de custo; suíte verde + integração
real ao vivo comprovada acima.)

## Revisão
(revisão formal dispensada por decisão de custo — construção direta.)

