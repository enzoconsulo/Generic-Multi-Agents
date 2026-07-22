---
id: T-001
titulo: Spike do Agent SDK — validar login por assinatura, streaming e cancelamento
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: []
areas: [experimentos/spike-sdk/]
tentativas: 2
criada: 2026-07-21
atualizada: 2026-07-21
---

## Objetivo
Provar que o `@anthropic-ai/claude-agent-sdk` roda na máquina do usuário reutilizando o
login por assinatura (sem `ANTHROPIC_API_KEY`), streama mensagens tipadas e cancela via
AbortController — e registrar qual caminho de autenticação funcionou (binário empacotado
do SDK ou plano B `pathToClaudeCodeExecutable`).

## Contexto
- LEIA `_gestao/pesquisas/2026-07-21-claude-code-headless.md` inteira antes de começar —
  em especial as seções "Uso concreto do SDK", "Armadilhas" e "Não confirmado".
- O spike é ISOLADO: vive em `experimentos/spike-sdk/` com package.json próprio; não
  entra no monorepo nem no build (T-002 não depende dele em código, só da conclusão).
- Pinar a versão exata do SDK (sem `^`) — anotar qual foi.
- Prompt trivial e inofensivo (ex.: "Responda apenas com a palavra OK"), `maxTurns: 1`,
  modelo explícito (testar alias `fable`; se indisponível, `opus` — anotar), cwd = a
  própria pasta do spike. NÃO usar a raiz da fábrica como cwd (evita carregar o
  CLAUDE.md do orquestrador à toa) e NÃO deixar o spike editar arquivo nenhum.
- Se a auth do binário empacotado falhar, testar plano B:
  `pathToClaudeCodeExecutable: %USERPROFILE%\.local\bin\claude.exe`.
- Anotar também a versão de Node exigida/aceita pelo SDK (incerteza registrada na
  pesquisa).

## Critérios de aceite
- [ ] `experimentos/spike-sdk/` contém package.json próprio com o SDK pinado (sem `^`)
      e script `start`.
- [ ] Em PowerShell com `ANTHROPIC_API_KEY` AUSENTE do ambiente
      (`$env:ANTHROPIC_API_KEY -eq $null`), `npm start` na pasta do spike conclui com
      sucesso: imprime o texto da resposta, o `session_id` e o `total_cost_usd` do
      evento result.
- [ ] O streaming é demonstrado: o script imprime o evento `system/init` (com
      session_id) ANTES do result.
- [ ] `npm start -- --abortar` dispara o AbortController após o primeiro evento e o
      processo encerra sozinho em menos de 60 segundos (sem processo pendurado).
- [ ] Conclusão registrada em `_gestao/DECISOES.md`: caminho de autenticação que
      funcionou (empacotado ou pathToClaudeCodeExecutable), versão pinada do SDK,
      versão do Node da máquina e alias de modelo usado.
- [ ] `experimentos/spike-sdk/LEIA-ME.md` documenta como rodar o spike de novo.

## Notas de execução

### Ciclo 1 (2026-07-21, executor)

**Resultado: todos os objetivos do spike validados na primeira tentativa.**

O que foi feito:
- Criado `experimentos/spike-sdk/` isolado: `package.json` (SDK pinado em
  `0.3.217`, sem `^`, script `start`), `index.mjs` (script do spike), `.gitignore`
  (node_modules) e `LEIA-ME.md` (como rodar + resultados + armadilhas).
- Conclusões registradas em `_gestao/DECISOES.md` (entrada "Spike T-001").

Execução real (PowerShell, `$env:ANTHROPIC_API_KEY -eq $null` confirmado antes):
- `npm start` → sucesso com o binário EMPACOTADO do SDK (login por assinatura
  reutilizado; plano B `pathToClaudeCodeExecutable` NÃO necessário).
  `system/init` com session_id aos 7,0s, `result` aos 8,5s (streaming provado),
  texto final `OK`, `total_cost_usd=0.2974`, exit code 0, processo encerrou
  sozinho em ~9s.
- `npm start -- --abortar` → AbortController disparado após o 1º evento
  (system/init aos 2,7s); erro de abort capturado na iteração; processo
  encerrou sozinho em 6,6s totais (critério <60s), exit code 0.

Dados que a tarefa pedia para anotar:
- Autenticação que funcionou: **binário empacotado do SDK** (não foi preciso plano B).
- Versão pinada do SDK: **0.3.217**.
- Node: máquina **v24.18.0**; `engines` do SDK exige apenas **>=18.0.0**.
- Modelo: alias **`fable`** funcionou headless → resolveu para `claude-fable-5`.

Achados extras (relevantes para o backend do painel):
- Nesta máquina NÃO existe `%USERPROFILE%\.local\bin\claude.exe` (instalação do
  Claude Code é via npm); o plano B, se um dia necessário, seria
  `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\cli.js`.
- O stream emite tipos de evento não documentados na pesquisa (ex.:
  `rate_limit_event`) — o consumidor do painel deve ignorar tipos desconhecidos.
- Em run trivial, o `result` pode chegar mesmo após `abort()` (a run já tinha
  completado no CLI); o essencial — erro sinalizado + processo sem handle
  pendurado — funciona.

Como rodar/testar: ver `experimentos/spike-sdk/LEIA-ME.md`.

Commit: `5186de5aeaaafc26a452c2826dc7ad3183e351f3`
(`T-001: spike do Agent SDK — assinatura, streaming e cancelamento validados`)

### Ciclo 2 (2026-07-21, executor — retrabalho da Revisão/Ciclo 1)

Correções aplicadas exatamente conforme os achados da revisão; spike NÃO
reexecutado (instrução do orquestrador: consome assinatura — só documentação e
ajustes triviais no script). Sintaxe validada com `node --check` (exit 0).

1. **[importante] Caminho do plano B corrigido nos três lugares.** Verifiquei eu
   mesmo no disco antes de escrever: o pacote global
   `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code` (v2.1.216) NÃO contém
   `cli.js` em lugar nenhum; o executável real é `bin\claude.exe` (binário
   nativo, alvo do campo `bin` do package.json do pacote). Também confirmei que
   o sdk.mjs 0.3.217 spawna binário nativo diretamente (as mensagens de erro
   internas pedem `pathToClaudeCodeExecutable` como override de binário), então
   apontar para o `.exe` é o uso correto. Corrigido em:
   - `_gestao/DECISOES.md` (entrada "Spike T-001", com nota da correção);
   - `experimentos/spike-sdk/LEIA-ME.md` (seção "Observações / armadilhas");
   - `experimentos/spike-sdk/index.mjs` (comentário do plano B).
2. **[menor] `init_antes_do_result` agora mede ORDEM de verdade:** novo flag
   `initAntesDoResult` capturado no 1º evento `result` (`= viuInit` naquele
   momento); o `ok` final passou a ser `viuResult && initAntesDoResult`.
3. **[menor] `--abortar` não termina mais "ok silencioso":** se a iteração
   encerrar sem o erro de abort (`cancelamentoConfirmado === false`), o script
   imprime `FALHA: ... Cancelamento NAO demonstrado.` e sai com exit 1;
   comportamento documentado no LEIA-ME.md.

Arquivos alterados: `_gestao/DECISOES.md`, `experimentos/spike-sdk/index.mjs`,
`experimentos/spike-sdk/LEIA-ME.md`, este arquivo de tarefa.

Commit do retrabalho: `e91678ad823a62ae4279a50d65d1cbb9d89a4d70`
(`T-001: retrabalho ciclo 2 — corrige caminho do plano B e achados menores do spike`)

## Verificação

### Ciclo 1 (2026-07-21, testador)

Ambiente: Windows 10 + PowerShell; confirmado ANTES das execuções que
`$env:ANTHROPIC_API_KEY -eq $null` (saída: "ANTHROPIC_API_KEY: NULA"). Node v24.18.0.
Conforme instrução do orquestrador (custo real por execução), cada rodada do spike foi
executada exatamente UMA vez.

1. **package.json próprio com SDK pinado e script `start` — PASSOU.**
   `experimentos/spike-sdk/package.json` contém `"@anthropic-ai/claude-agent-sdk":
   "0.3.217"` (sem `^`) e `"start": "node index.mjs"`. Confirmação da instalação:
   `npm ls @anthropic-ai/claude-agent-sdk` na pasta do spike →
   `@anthropic-ai/claude-agent-sdk@0.3.217`.

2. **`npm start` sem API key conclui com sucesso — PASSOU.**
   Comando: `npm start` em `experimentos/spike-sdk/` (chave ausente confirmada).
   Saída relevante: `assistant: OK` e `texto final: OK` (texto da resposta),
   `session_id=111c1783-4157-4a03-a75d-74d4d3819f7e`, `total_cost_usd=0.015638`
   no evento result (`subtype=success`, `is_error=false`). Exit code 0; processo
   encerrou sozinho em 6,6s. Autenticação pelo binário empacotado do SDK
   (nenhum plano B configurado no script — linha comentada).

3. **Streaming: `system/init` antes do result — PASSOU.**
   Na mesma execução: `[2.6s] system/init session_id=111c1783-... modelo=claude-fable-5`
   impresso ANTES de `[4.6s] result ...`. O próprio script confirmou
   `init_antes_do_result=true`.

4. **`npm start -- --abortar` cancela e encerra em <60s — PASSOU.**
   Comando: `npm start -- --abortar`. Saída: `[2.6s] system/init` (1º evento) →
   `[2.6s] --abortar: disparando AbortController agora...` →
   `[4.8s] cancelamento confirmado (Error)`. Duração total medida por Stopwatch:
   **6,1s** (critério <60s), exit code 0, sem processo pendurado. Observação: como
   já documentado nas Notas de execução, a run trivial completou antes do interrupt
   fazer efeito (assistant/result ainda chegaram), mas o erro de abort foi sinalizado
   na iteração e o processo encerrou sozinho — o que o critério exige.

5. **Conclusão registrada em `_gestao/DECISOES.md` — PASSOU.**
   Entrada "2026-07-21 — Spike T-001: SDK autentica por assinatura via binário
   empacotado; versão pinada 0.3.217" contém os quatro itens exigidos: caminho de
   autenticação (binário empacotado; plano B desnecessário, com caminho correto
   anotado), versão pinada (0.3.217), Node (máquina v24.18.0 / engines >=18.0.0)
   e alias de modelo (`fable` → `claude-fable-5`).

6. **`experimentos/spike-sdk/LEIA-ME.md` documenta como rodar de novo — PASSOU.**
   Arquivo presente com pré-requisitos (Node, login por assinatura, chave ausente),
   comandos (`npm install`, `npm start`, `npm start -- --abortar`), saídas esperadas
   e armadilhas. Reproduzi as instruções literalmente nos itens 2–4 e bateram.

Suíte do projeto: `npm test` na raiz do monorepo → 1 arquivo, 2 testes, todos
passaram, exit code 0 (suíte criada pela T-002, posterior a esta tarefa — nada
quebrado).

Placar: 6 PASSOU, 0 FALHOU → status `em-revisao`.

### Ciclo 2 (2026-07-21, testador — verificação do retrabalho da Revisão/Ciclo 1)

Escopo do ciclo: verificar FACTUALMENTE as correções do commit `e91678a` (caminho do
plano B + 2 achados menores do index.mjs). Spike NÃO reexecutado — decisão registrada
abaixo. Ambiente: Windows 10 + PowerShell, Node v24.18.0.

1. **[importante] Caminho do plano B corrigido — PASSOU (verificado no disco).**
   Comandos: `Test-Path` + `Get-ChildItem -Recurse -Filter cli.js` + leitura do
   package.json do pacote global. Resultados:
   - `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe` EXISTE
     (binário nativo, 258.288.288 bytes, modificado 2026-07-21 18:15);
   - `cli.js` NÃO existe em lugar nenhum do pacote (busca recursiva: NENHUM);
   - versão do pacote: `2.1.216`; campo `bin`: `{"claude":"bin/claude.exe"}`.
   Ou seja: cada afirmação da documentação corrigida bate com o disco. Conferido nos
   TRÊS lugares apontados pela revisão: `_gestao/DECISOES.md` (entrada "Spike T-001",
   linhas 84–89), `experimentos/spike-sdk/LEIA-ME.md` (seção "Observações", linhas
   49–54) e `experimentos/spike-sdk/index.mjs` (comentário, linhas 43–49) — os três
   agora afirmam `...\claude-code\bin\claude.exe` e a inexistência do `cli.js`.

2. **[menor] Flag `init_antes_do_result` mede ordem real — PASSOU (leitura + sintaxe).**
   `index.mjs:73`: `if (!viuResult) initAntesDoResult = viuInit;` — captura no 1º
   evento `result` se o init JÁ tinha chegado (ordem, não presença);
   `index.mjs:120`: `ok = viuResult && initAntesDoResult`; rótulo impresso agora
   condiz com o que é medido. `node --check index.mjs` → exit 0.

3. **[menor] `--abortar` sem erro de abort falha explicitamente — PASSOU (leitura +
   sintaxe).** `index.mjs:104-113`: `if (jaAbortou && !cancelamentoConfirmado)` →
   imprime `FALHA: ... Cancelamento NAO demonstrado.` e `process.exitCode = 1`;
   `cancelamentoConfirmado` só vira `true` no catch do erro de abort
   (`index.mjs:94-96`). Comportamento documentado no LEIA-ME.md (linhas 46–48).

Critérios de aceite no estado atual da árvore:
- Critério 1 (package.json pinado sem `^` + script start) — PASSOU: relido,
  `"@anthropic-ai/claude-agent-sdk": "0.3.217"` e `"start": "node index.mjs"` intactos.
- Critérios 5 e 6 (DECISOES.md e LEIA-ME.md) — PASSOU: relidos na íntegra; continuam
  cobrindo os quatro itens exigidos, agora com o caminho do plano B correto.
- Critérios 2, 3 e 4 (runtime: `npm start`, streaming, `--abortar`) — PASSOU no ciclo 1
  (6/6 com execução real); NÃO reexecutados neste ciclo (instrução do orquestrador:
  consome assinatura; reexecutar só se indispensável). Julguei dispensável porque o
  diff do ciclo 2 no script é estaticamente verificável e, aplicado ao comportamento
  observado no ciclo 1, produz os mesmos vereditos: run normal teve init (2,6s) antes
  do result (4,6s) → `initAntesDoResult=true` → `ok=true`/exit 0; run de abort teve
  `cancelamento confirmado (Error)` → `cancelamentoConfirmado=true` → sem branch de
  FALHA → exit 0.

Suíte completa do monorepo: `npm test` na raiz → servidor 5 testes passaram
(tsc --noEmit + vitest), web 7 testes passaram; exit 0. Nada quebrado.

Nenhum arquivo auxiliar de teste criado (nada a limpar).

Placar do ciclo 2: 3 correções verificadas PASSOU, 6 critérios de aceite PASSOU,
0 FALHOU → status `em-revisao`.

## Revisão

### Ciclo 1 (2026-07-21, revisor)

**REPROVADA — 1 achado importante.** Diff revisado inteiro (commit `5186de5`); spike NÃO
reexecutado (custo), conforme despacho. Foco: veracidade do que o spike AFIRMA e
documenta, pois DECISOES.md/LEIA-ME orientarão o backend.

Achados:

- [importante] `_gestao/DECISOES.md` (entrada "Spike T-001"), `experimentos/spike-sdk/LEIA-ME.md`
  (seção "Observações / armadilhas") e comentário em `experimentos/spike-sdk/index.mjs:41-45` —
  **o caminho documentado do plano B NÃO existe nesta máquina.** Os três lugares afirmam
  como fato que o plano B "seria `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\cli.js`".
  Verifiquei no disco: o pacote global `@anthropic-ai/claude-code` (v2.1.216, instalado
  às 18:15 de 2026-07-21 — ANTES do commit da tarefa, 18:46) não contém `cli.js` em
  lugar NENHUM; o executável real é `bin\claude.exe` (binário nativo) e há um
  `cli-wrapper.cjs` na raiz do pacote. Cenário concreto de falha: a auth do binário
  empacotado falha após um update, o desenvolvedor do backend segue a DECISOES.md e
  configura `pathToClaudeCodeExecutable` com o caminho documentado → arquivo inexistente,
  o SDK não consegue spawnar, e a documentação escrita exatamente para essa emergência
  aponta o caminho errado. Correção: verificar o caminho real no disco e corrigir a
  afirmação nos três lugares (DECISOES.md, LEIA-ME.md, comentário do index.mjs) — sem
  precisar reexecutar o spike.

Notas menores (NÃO reprovam):

- [menor] `experimentos/spike-sdk/index.mjs:104` — o flag impresso como
  `init_antes_do_result` é calculado como `viuInit && viuResult` (presença de ambos,
  não ordem). A evidência real de ordenação são os timestamps das linhas de log (e foi
  isso que o testador usou); o rótulo do flag apenas promete mais do que verifica.
- [menor] `experimentos/spike-sdk/index.mjs:96-101` — no modo `--abortar`, se a iteração
  terminar SEM lançar erro (caso que as próprias notas dizem ser possível: run trivial
  completa antes do interrupt), o script encerra com exit 0 sem nenhuma linha de
  "cancelamento confirmado" — a run pareceria ok sem o caminho de abort ter sido
  exercitado.

O que conferi e está correto:

- SDK pinado `0.3.217` sem `^` no package.json; package-lock resolve exatamente 0.3.217.
- Alegação do LEIA-ME de que o SDK carrega o CLAUDE.md do projeto (settingSources
  omitido): consistente com o `sdk.d.ts` da versão instalada ("When omitted, all sources
  are loaded... Must include 'project' to load CLAUDE.md files").
- `%USERPROFILE%\.local\bin\claude.exe` de fato não existe (essa metade da nota do plano
  B está correta) e a instalação do Claude Code é mesmo via npm (`%APPDATA%\npm\claude.ps1`).
- Alegações de streaming, cancelamento, custo, alias `fable`→`claude-fable-5` e versões
  de Node: coerentes com o código do spike e com a execução real do testador (6/6).
- Isolamento respeitado: spike fora do monorepo/build, `.gitignore` de node_modules,
  prompt trivial, `maxTurns: 1`, cwd na própria pasta, ferramentas de escrita bloqueadas.

Status: `em-revisao` → `em-execucao` (corrigir apenas o achado importante nos três
arquivos de documentação).

### Ciclo 2 (2026-07-21, revisor)

**Aprovado sem ressalvas.** Diff do commit `e91678a` revisado inteiro (4 arquivos);
spike NÃO reexecutado, conforme despacho. Os 3 achados do ciclo 1 foram atendidos:

1. **[importante] Caminho do plano B — ATENDIDO.** Corrigido nos três lugares
   (`_gestao/DECISOES.md` entrada "Spike T-001"; `LEIA-ME.md` seção "Observações";
   `index.mjs:43-49`, inclusive a template string comentada, que agora aponta
   `...\claude-code\bin\claude.exe`). Verifiquei eu mesmo no disco neste ciclo:
   `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe` existe
   (Test-Path True) e `cli.js` não existe (Test-Path False) — cada afirmação da
   documentação corrigida é factual.
2. **[menor] Flag de ordem — ATENDIDO.** `index.mjs:73` captura
   `initAntesDoResult = viuInit` no 1º `result` (antes de setar `viuResult`) e
   `index.mjs:120` usa `ok = viuResult && initAntesDoResult`: o rótulo
   `init_antes_do_result` agora mede ordem real, com exit 1 se violada.
3. **[menor] Abort silencioso — ATENDIDO.** `index.mjs:104-113`: com `--abortar`,
   iteração encerrada sem erro de abort (`cancelamentoConfirmado === false`)
   imprime `FALHA: ...` e sai com exit 1; comportamento documentado no LEIA-ME.md.

Também conferi que o diff não introduz defeito novo: lógica dos flags correta
(captura antes da atribuição de `viuResult`), branch de FALHA só dispara quando o
abort foi de fato disparado (`jaAbortou`), escapes `\\` corretos na template string
comentada, e nenhuma referência remanescente ao caminho errado fora do histórico
do ciclo 1 nesta tarefa (grep por `cli.js` no projeto). Único caso residual —
stream encerrar sem emitir evento nenhum em modo `--abortar` sairia com exit 0 —
é implausível para o spike e fica visível na linha final
(`abortado apos primeiro evento=false`); não reprova.

Status: `em-revisao` → `concluida`.
