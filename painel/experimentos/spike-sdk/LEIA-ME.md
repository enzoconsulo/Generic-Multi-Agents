# Spike T-001 — Claude Agent SDK (login por assinatura, streaming, cancelamento)

Spike ISOLADO (não entra no monorepo nem no build) que prova que o
`@anthropic-ai/claude-agent-sdk` funciona nesta máquina reutilizando o login por
assinatura do Claude Code — sem `ANTHROPIC_API_KEY` no ambiente.

## Como rodar de novo

Pré-requisitos: Node 22+ (validado com v24.18.0; o SDK exige apenas >=18),
Claude Code logado por assinatura nesta máquina, e `ANTHROPIC_API_KEY` AUSENTE
do ambiente (`$env:ANTHROPIC_API_KEY -eq $null` no PowerShell).

```powershell
cd experimentos\spike-sdk
npm install          # instala o SDK pinado (0.3.217)
npm start            # run completa: imprime system/init, resposta, result com custo
npm start -- --abortar   # dispara o AbortController após o 1º evento
```

Saída esperada do `npm start`: linha `system/init` com `session_id` ANTES da
linha `result` (streaming comprovado), texto final `OK`, `total_cost_usd`
preenchido (estimativa informacional — assinatura não é cobrada à parte) e
processo encerrando sozinho (~9s no total).

Saída esperada do `--abortar`: abort disparado logo após o `system/init` e
processo encerrando sozinho em segundos (medido: 6,6s; critério: <60s).

## Resultados registrados (2026-07-21)

| Item | Resultado |
|---|---|
| Autenticação | Binário EMPACOTADO do SDK reutilizou o login por assinatura direto (credential storage de `~/.claude`). Plano B (`pathToClaudeCodeExecutable`) NÃO foi necessário |
| Versão do SDK | `0.3.217` (pinada, sem `^`) |
| Node | Máquina: v24.18.0 · exigido pelo SDK (`engines`): `>=18.0.0` |
| Modelo | Alias `fable` funcionou → resolveu para `claude-fable-5` |
| Streaming | `system/init` (com session_id) chegou ~1,5s antes do `result` |
| Cancelamento | `AbortController.abort()` após o 1º evento → iteração lança erro capturável e o processo encerra sozinho em 6,6s |
| Custo | `total_cost_usd` presente no result (ex.: 0.297 na run completa) — tratar como estimativa |

## Observações / armadilhas anotadas

- Com prompt trivial (`maxTurns: 1`), a run pode COMPLETAR antes de o interrupt
  in-band fazer efeito: no teste de abort, `assistant` e `result` ainda chegaram
  após o `abort()`. O que importa para o painel: o erro de abort é sinalizado na
  iteração e o processo não fica pendurado. Em runs longas o interrupt corta de
  fato o fluxo. Se a iteração terminar SEM o erro de abort (cancelamento não
  exercitado de verdade), o script agora imprime `FALHA: ...` e sai com exit 1
  em vez de parecer ok.
- O plano B, SE algum dia for necessário nesta máquina, NÃO é
  `%USERPROFILE%\.local\bin\claude.exe` (não existe aqui — a instalação do
  Claude Code é via npm): é
  `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe`
  (binário nativo apontado pelo campo `bin` do package.json do pacote global;
  verificado no disco com o pacote v2.1.216 — NÃO existe `cli.js` nele).
- O evento `rate_limit_event` aparece no stream (tipo não documentado na
  pesquisa) — o consumidor de mensagens do painel deve ignorar tipos
  desconhecidos em vez de quebrar.
- `cwd` usado é a própria pasta do spike; o SDK carrega o CLAUDE.md do projeto
  painel-fabrica (raiz do repositório git), não o da raiz da fábrica.
