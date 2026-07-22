# Pesquisa — Claude Code headless para o backend do painel-fabrica (2026-07-21)

**Recomendação: use o Claude Agent SDK para TypeScript (`@anthropic-ai/claude-agent-sdk`)
como integração principal do backend Node, com SSE para transmitir o progresso à SPA.**
O CLI headless (`claude -p --output-format stream-json`) fica como referência de
depuração/fallback — os dois expõem o MESMO motor e os mesmos eventos, mas o SDK elimina
as duas maiores dores do caso concreto: pegadinhas de `child_process` no Windows
(spawn/kill/encoding) e o tratamento de aprovações/inputs no meio do fluxo (callback
`canUseTool` + tool `AskUserQuestion`, essenciais para o requisito "inputs pedidos pela UI").

Versões verificadas hoje (fontes oficiais): Claude Code CLI ~**v2.1.215+** e SDK TS
**v0.3.216** (release de 20/jul, paridade com Claude Code v2.1.216 — o versionamento do
SDK acompanha o CLI: SDK 0.3.NNN empacota Claude Code 2.1.NNN). Manutenção ativa com
releases quase diários.

---

## 1. Como funciona o modo headless do CLI (`claude -p`)

`claude -p "<prompt>"` roda uma sessão completa não interativa (mesmo loop agêntico,
mesmas tools) e sai ao final. Todos os flags do CLI funcionam com `-p`.

### Flags que importam para o painel

| Flag | O que faz |
|---|---|
| `-p, --print` | Modo não interativo (obrigatório para headless) |
| `--output-format` | `text` \| `json` (resultado único com metadados) \| `stream-json` (NDJSON em tempo real) |
| `--verbose` | Necessário junto com `stream-json` em `-p` para receber o turn-by-turn (os exemplos oficiais sempre combinam os dois) |
| `--include-partial-messages` | Emite eventos `stream_event` com deltas de texto token a token (requer `-p` + `stream-json`) |
| `--input-format stream-json` | Permite ENVIAR mensagens de usuário via stdin durante a sessão (multi-turn numa sessão viva) |
| `--permission-mode` | `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`, `manual` |
| `--dangerously-skip-permissions` | Equivale a `--permission-mode bypassPermissions` |
| `--allowedTools` / `--disallowedTools` | Sintaxe de regras de permissão, ex.: `"Bash(git diff *),Read,Edit"` (o espaço antes de `*` importa) |
| `--max-turns` | Limite de turnos agênticos; sem limite por padrão |
| `--max-budget-usd` | Teto de gasto por invocação (só em `-p`) |
| `--continue, -c` | Retoma a conversa mais recente do diretório atual |
| `--resume, -r <id\|nome>` | Retoma sessão específica; DEVE rodar do mesmo diretório (lookup é escopado ao diretório do projeto + worktrees git) |
| `--session-id <uuid>` | Pré-define o ID da sessão (útil para o painel rastrear) |
| `--fork-session` | Ao retomar, cria novo ID em vez de continuar no original |
| `--no-session-persistence` | Não grava a sessão em disco (runs descartáveis) |
| `--add-dir <paths>` | Diretórios adicionais de leitura/edição |
| `--model` | Alias (`fable`, `opus`, `sonnet`, `haiku`) ou nome completo — em headless NÃO herda o modelo da sessão interativa; passe explicitamente |
| `--agents <json>` | Define subagentes dinamicamente (além dos de `.claude/agents/`) |
| `--forward-subagent-text` | (v2.1.211+) emite também texto/thinking dos subagentes no stream — sem ele só saem `tool_use`/`tool_result` deles |
| `--bare` | Modo mínimo: NÃO carrega CLAUDE.md, skills, agents, hooks, MCP e **nem o login OAuth** (exige `ANTHROPIC_API_KEY`). **Não usar no painel** — a fábrica depende de tudo isso |

**Diretório de trabalho:** não existe flag `--cwd`; o diretório de trabalho é o cwd do
processo. Programaticamente: opção `cwd` do `child_process.spawn` (ou `options.cwd` no SDK).
Para fluxos da fábrica (`/trabalhar` etc.), o cwd deve ser a RAIZ de
`Gerador_de_projetos` — é isso que carrega CLAUDE.md, `.claude/agents/`,
`.claude/commands/` e o allowlist de `.claude/settings.json`, exatamente como a sessão
interativa do Enzo. Skills/commands funcionam em `-p`: basta incluir `/trabalhar` no
texto do prompt que o CLI expande antes de rodar.

### Eventos do `stream-json` (NDJSON, 1 JSON por linha)

| `type` | Conteúdo |
|---|---|
| `system` / subtype `init` | 1º evento: `session_id`, modelo, tools, MCP servers, plugins, `capabilities` (v2.1.205+) |
| `system` / subtype `api_retry` | Retry de erro de API: `attempt`, `max_retries`, `retry_delay_ms`, `error_status`, `error` |
| `assistant` | Mensagens do assistente, incluindo blocos `tool_use`. Campo `parent_tool_use_id`: `null` = conversa principal; preenchido = mensagem de subagente (é o ID do tool_use que o criou) — é assim que o painel separa executor/testador/revisor no stream |
| `user` | `tool_result`s devolvidos ao modelo |
| `stream_event` | Deltas parciais (só com `--include-partial-messages`), ex.: `.event.delta.type == "text_delta"` |
| `hook_started` / `hook_progress` / `hook_response` | Progresso de hooks SessionStart/Setup (v2.1.204+) |
| `result` | SEMPRE a última linha: texto final em `result`, `total_cost_usd` (+ breakdown por modelo), `num_turns`, `is_error`, `session_id`, durações |

**Resultado final e custo:** com `--output-format json` (sem stream) vem tudo num único
objeto: `.result`, `.session_id`, `.total_cost_usd`, usage. Com `stream-json`, é a última
linha (`type: "result"`). `--json-schema` valida saída estruturada em
`.structured_output` — útil para o fluxo "analisar projeto" retornar JSON tipado.

---

## 2. Comparativo e veredito

Terceira opção considerada e descartada de cara: API Anthropic pura (Client SDK
`@anthropic-ai/sdk`) — exigiria reimplementar tool loop, tools de arquivo, subagentes e
permissões; e não usa a assinatura Claude existente. Sobram duas opções sérias:

| Critério | **Agent SDK TS (recomendado)** | CLI via `child_process` |
|---|---|---|
| Maturidade / manutenção | Oficial, releases quase diários, paridade 1:1 com o CLI (v0.3.216 ↔ CC 2.1.216) | O próprio CLI; idem |
| Streaming | `for await` sobre mensagens tipadas (`SDKMessage`); `includePartialMessages` p/ deltas | Parse manual de NDJSON no stdout (readline + JSON.parse; linhas grandes, backpressure) |
| Cancelamento | `AbortController` + `query.interrupt()` — controle IN-BAND via stdin, funciona igual no Windows | `subprocess.kill('SIGTERM')`: no Windows Node usa TerminateProcess (abrupto); shutdown gracioso não garantido |
| Aprovações / input do usuário no meio do fluxo | Callback `canUseTool` + tool `AskUserQuestion` → rotear para a UI e devolver a resposta. Encaixe perfeito no requisito "inputs pedidos pela UI" | Só via `--permission-prompt-tool` (exige montar um MCP server) ou stdin `--input-format stream-json` — muito mais trabalho |
| CLAUDE.md / agents / commands / settings do diretório | Carrega por padrão (`settingSources` default = todas as fontes); mesmo comportamento do CLI normal | Carrega por padrão em `-p` (não usar `--bare`) |
| Autenticação existente (assinatura, sem API key) | O binário empacotado lê o credential storage padrão (`~/.claude`); se falhar, `pathToClaudeCodeExecutable` aponta para o `claude.exe` já logado do usuário. **Confirmar no spike T-001** | Usa direto a instalação autenticada — zero dúvida |
| Windows | SDK resolve o binário `win32-x64` sozinho e gerencia o spawn; sem lidar com shims `.cmd`/PATH | Pegadinhas de spawn/kill/encoding por sua conta (ver §3) |
| Reprodutibilidade | Versão pinada no package.json — comportamento estável | CLI nativo AUTO-ATUALIZA em background; comportamento pode mudar sob seus pés (ex.: `--bare` vai virar default de `-p`, ver §Armadilhas) |
| Dependência extra | ~1 pacote npm (com binário por plataforma como optional dependency) | Nenhuma |

**Veredito:** para "backend Node local que dispara fluxos e transmite progresso", o SDK
domina em 6 dos 8 critérios; o único ponto real a favor do CLI (autenticação garantida)
tem escape trivial no SDK (`pathToClaudeCodeExecutable`). A própria doc oficial posiciona:
CLI para uso interativo/one-off, **SDK para custom applications e automação** — e diz
explicitamente que rodar o CLI com `-p` é o caminho "para outras linguagens" (sem SDK).

### Uso concreto do SDK no backend

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

const q = query({
  prompt: "/trabalhar",                          // commands/skills expandem no prompt
  options: {
    cwd: "C:\\Users\\enzoconsulo\\Documents\\Gerador_de_projetos", // raiz da fábrica
    model: "opus",                               // headless não herda modelo; explicitar
    permissionMode: "acceptEdits",
    // allowlist adicional além do .claude/settings.json, se preciso:
    // allowedTools: ["Bash(git *)", "Read", "Edit"],
    maxTurns: 200,
    includePartialMessages: true,                // deltas p/ UI "digitando"
    abortController,                             // botão "parar" da UI
    canUseTool: async (tool, input) => {         // aprovação não coberta → pergunta à UI
      const ok = await perguntarNaUI(tool, input);
      return ok ? { behavior: "allow", updatedInput: input }
                : { behavior: "deny", message: "negado pelo usuário" };
    },
    // pathToClaudeCodeExecutable:
    //   `${process.env.USERPROFILE}\\.local\\bin\\claude.exe`,  // se auth do bundle falhar
  },
});

for await (const msg of q) {
  sse.send(msg);                                          // repassar à SPA
  if (msg.type === "system" && msg.subtype === "init") salvarSessionId(msg.session_id);
  if (msg.type === "result") registrar(msg.total_cost_usd, msg.num_turns, msg.is_error);
}
```

Mensagens do SDK espelham os eventos do stream-json: `SDKSystemMessage` (init),
`SDKAssistantMessage`, `SDKUserMessage`, `SDKPartialAssistantMessage` (stream_event) e
`SDKResultMessage` (`total_cost_usd`, `num_turns`, `is_error`, `session_id`, `result`).
Retomada: `options.resume = sessionId` (mesmo `cwd`!). Métodos do objeto `Query`:
`interrupt()`, `setPermissionMode()`, `setModel()`, `close()`.

**Permissões para autonomia máxima:** começar com `permissionMode: "acceptEdits"` +
allowlist de `.claude/settings.json` (carregado por padrão) + `canUseTool` roteando o
resto para a UI. Se as pausas incomodarem, subir para `bypassPermissions` (máquina local,
uso pessoal) — registrar em DECISOES.md. Em `acceptEdits`, comando de shell fora do
allowlist SEM `canUseTool` aborta a run — por isso o callback é importante.

---

## 3. Especificidades Windows (10, PowerShell/Git Bash)

Com o SDK, quase tudo abaixo é gerenciado por ele; fica registrado para o fallback CLI e
para depuração:

- **Caminho do executável:** instalação nativa (recomendada, auto-atualiza) coloca
  `claude.exe` em `%USERPROFILE%\.local\bin\claude.exe` (caminho confirmado na doc de
  setup/uninstall). Instalação npm cria shim `claude.cmd` no diretório global do npm.
- **`spawn` de `.cmd`/`.bat` exige `shell: true`** desde a mitigação de segurança do Node
  (CVE-2024-27980; sem shell, dá `EINVAL`/`ENOENT`). Regra prática: spawnar o **caminho
  completo do `claude.exe`** com `shell: false` (evita camada de cmd.exe, escaping e
  processos fantasmas). Comportamento do Node, não da Anthropic.
- **Encoding:** ler stdout como stream de bytes e decodificar UTF-8 explicitamente
  (`readline` sobre o stream). Sem `shell`, o codepage do console (cp850/1252) não
  interfere no pipe.
- **Kill/sinais:** Windows não tem sinais POSIX; `subprocess.kill('SIGTERM')` vira
  TerminateProcess (abrupto) e pode deixar processos filhos (bash do Git) órfãos — usar
  `taskkill /PID <pid> /T /F` ou lib `tree-kill` se for pelo CLI. A doc oficial descreve
  o shutdown gracioso via SIGTERM (aborta turno, mata árvore do Bash, roda hooks
  SessionEnd, exit 143), mas isso pressupõe semântica POSIX — no Windows, o caminho
  confiável é o do SDK: `AbortController`/`interrupt()` (controle in-band via stdin).
- **Git Bash:** com Git for Windows instalado, o Claude Code usa Git Bash como Bash tool
  (senão, PowerShell tool). Se não achar: `CLAUDE_CODE_GIT_BASH_PATH` em settings. A
  fábrica já opera assim hoje; nada muda em headless.
- **Timeouts:** não há timeout default; fluxos da fábrica podem levar dezenas de minutos.
  Implementar watchdog próprio (ex.: sem evento novo por N min → interrupt) + guardrails
  `maxTurns`/`maxBudgetUsd`. Processos de background iniciados pelo agente são encerrados
  ~5s após o result (subagentes em background: espera de até 10 min,
  `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS` ajusta).
- **Stdin:** pipe de stdin em `-p` tem teto de 10 MB (v2.1.128+); conteúdo grande vai por
  arquivo referenciado no prompt.

---

## 4. Concorrência e sessões

- **Armazenamento:** transcripts JSONL em `~/.claude/projects/<cwd-com-não-alfanuméricos-vira-hífen>/<session-id>.jsonl`.
  Formato interno, muda entre versões — NÃO parsear esses arquivos; usar o stream/result.
- **Paralelismo:** cada run headless cria sessão e arquivo próprios — várias instâncias em
  paralelo no MESMO diretório são seguras no nível de sessão. A única colisão documentada
  é retomar a MESMA sessão em dois processos sem `--fork-session` (transcripts
  entrelaçam). Conflito de agentes editando os mesmos ARQUIVOS é outra história — já
  coberta pelas regras da fábrica (áreas disjuntas, testador com projeto quieto); o
  painel deve respeitá-las, não resolvê-las.
- **Isolamento por projeto:** um `cwd` por fluxo. Fluxos de orquestração (`/trabalhar`)
  → raiz da fábrica; ações num projeto específico → `projetos/<nome>` se fizer sentido.
  Consequência de design: **retomar sessão exige o mesmo `cwd` da criação** — o painel
  deve persistir o par `(session_id, cwd)`.
- Sessões de `-p`/SDK não aparecem no picker interativo, mas `--resume <session-id>`
  funciona. `--session-id <uuid>` permite ao painel definir o ID antes de rodar;
  `--no-session-persistence` para runs descartáveis (ex.: análises rápidas).

---

## 5. SSE vs WebSocket para a SPA local

**Recomendação: SSE (Server-Sent Events).** O tráfego é essencialmente unidirecional
(backend → UI); comandos e respostas de aprovação da UI vão por `fetch POST` normal.
SSE dá de graça: reconexão automática com `Last-Event-ID` (retomar o stream após F5),
HTTP puro (sem upgrade, sem lib no front — `EventSource` nativo), e mapeamento 1:1 dos
eventos do SDK para eventos SSE. WebSocket só compensaria com tráfego bidirecional
intenso ou binário — não é o caso.

Cuidados: (a) HTTP/1.1 limita ~6 conexões por origem no navegador → usar UM endpoint SSE
multiplexado (eventos carregam `runId`) em vez de um stream por run; (b) heartbeat
(comentário `:ping` a cada ~15s) para detectar conexão morta; (c) `Cache-Control:
no-cache` e flush por evento (em localhost não há proxy bufferizando, mas custa nada).

---

## 6. Armadilhas conhecidas da opção recomendada (SDK)

1. **Autenticação por assinatura via binário empacotado:** a doc diz que a auth é do
   credential storage padrão do Claude Code, mas não afirma preto no branco que o binário
   do SDK reusa o login existente da conta em todos os cenários; a doc também veta
   oferecer login claude.ai em produtos de TERCEIROS (não é o caso — ferramenta pessoal).
   **Primeira tarefa do projeto deve ser um spike** que valida `query()` com a conta do
   Enzo; plano B pronto: `pathToClaudeCodeExecutable` → `%USERPROFILE%\.local\bin\claude.exe`.
2. **Churn de versões:** releases quase diários; pinar a versão exata no `package.json`
   e atualizar deliberadamente (ler CHANGELOG), nunca `^`.
3. **`--bare` vai virar default do `-p`** em release futura (aviso oficial). Afeta só o
   fallback CLI, mas se um dia for usado: sem flags explícitos, deixaria de carregar
   CLAUDE.md/agents/commands E o login OAuth silenciosamente. No SDK, o equivalente é
   garantir `settingSources` com todas as fontes (hoje é o default).
4. **Modelo não herda:** headless não usa o modelo da sessão interativa; sem
   `options.model` explícito, vai no default do CLI. A fábrica quer Fable/Opus — passar sempre.
5. **Texto de subagentes ausente do stream por default:** para o painel mostrar o que
   executor/testador/revisor estão "dizendo" (não só tool calls), é preciso
   `--forward-subagent-text` / equivalente (v2.1.211+) e agrupar por `parent_tool_use_id`.
6. **Runs longas seguram o processo:** subagente em background pode segurar o encerramento
   por até 10 min após o result; prever isso no watchdog do painel.
7. **`total_cost_usd` com assinatura é estimativa** informacional (não cobrança à parte);
   exibir como referência, não como fatura.

## Não confirmado nas fontes (registrado como incerteza)

- Reuso garantido do login por assinatura pelo binário empacotado do SDK (ver armadilha 1).
- Requisito mínimo exato de Node.js do SDK TS (página npm inacessível — 403; o CLI via
  npm exige Node 22+, o SDK provavelmente menos; verificar no spike).
- Comportamento exato de `kill('SIGTERM')` do Node sobre o `claude.exe` no Windows
  (a doc descreve SIGTERM em termos POSIX); mitigado usando `interrupt()`/AbortController.

## Fontes (oficiais, acessadas em 2026-07-21)

- Headless / eventos stream-json / custo: https://code.claude.com/docs/en/headless
- Referência de flags do CLI: https://code.claude.com/docs/en/cli-reference
- Agent SDK overview (capacidades, settingSources, SDK vs CLI): https://code.claude.com/docs/en/agent-sdk/overview
- Referência TypeScript do SDK (Options, SDKMessage, Query, binário empacotado): https://code.claude.com/docs/en/agent-sdk/typescript
- Sessões (armazenamento, escopo de resume, concorrência): https://code.claude.com/docs/en/sessions
- Setup/Windows (instalador nativo, caminho do claude.exe, Git Bash): https://code.claude.com/docs/en/setup
- Releases do SDK TS (v0.3.216, 20/jul): https://github.com/anthropics/claude-agent-sdk-typescript/releases

Complementares (não oficiais, usadas só para triangular pegadinhas Windows):
- https://code.claude.com/docs/en/troubleshoot-install
- https://github.com/anthropics/claude-code/issues/58510 (spawn ENOENT de .cmd no Windows)
