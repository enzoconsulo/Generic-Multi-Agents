# Decisões — painel-fabrica

Registro apenas-adição (nunca apagar; decisão revertida ganha nova entrada dizendo isso).
Formato de cada entrada:

## AAAA-MM-DD — <título da decisão>
**Decisão:** <o que foi decidido>
**Motivo:** <por quê; qual alternativa foi descartada e por quê>
**Quem:** <planejador | executor (T-NNN) | orquestrador | usuário>

## 2026-07-27 — Seletor de pasta roda no BACKEND (o navegador não dá caminho absoluto)
**Decisão:** o botão "Escolher…" da importação abre um `FolderBrowserDialog` do Windows
disparado pelo SERVIDOR (`powershell.exe -STA`), não pelo navegador.
**Motivo:** o navegador não tem como resolver isso. `<input type="file" webkitdirectory>`
e `showDirectoryPicker()` entregam os ARQUIVOS mas escondem o caminho absoluto por
segurança — viria `meu-projeto/src/app.js` sem dizer se está em `C:\dev` ou `D:\trabalho`,
e a importação (T-013) copia no servidor, então precisa do caminho absoluto. Fazer upload
de tudo pelo navegador resolveria, mas mudaria o modelo inteiro da importação e seria
lento em repositório grande. O que destrava é o painel ser LOCAL: o servidor roda na
própria máquina do usuário (127.0.0.1), então ele pode abrir o diálogo nativo.
**Segurança avaliada:** página maliciosa consegue disparar o POST e fazer aparecer um
diálogo (chateação), mas NÃO consegue ler a resposta (sem CORS o navegador bloqueia) e
nenhum caminho vaza sem o usuário escolher a pasta com as próprias mãos.
**Armadilhas que custaram atenção:** `-STA` é obrigatório para Windows Forms;
`-NonInteractive` (que eu tinha posto) é o oposto do que se quer aqui; sem
`[Console]::OutputEncoding = UTF8` o caminho com acento volta corrompido; sem um Form
`TopMost` como owner o diálogo nasce ATRÁS do navegador e parece que o clique não fez
nada; e o cadeado de concorrência tem que liberar em `finally` — no callback de sucesso,
um diálogo que falha travaria o botão para sempre.
**Quem:** usuário (pediu) + orquestrador (T-021)

## 2026-07-27 — Auditoria de genericidade: CI e importação deixam de presumir Node
**Contexto:** auditoria pedida pelo usuário — "está genérico e age como equipe real para
QUALQUER tipo de projeto?". O sistema de EQUIPE passou (ver abaixo); o PAINEL não.
**Dois furos corrigidos:**
1. **CI era 100% npm.** `deduzirDefaults` lia só `package.json` e um projeto sem ele
   recebia `422 — nenhum pipeline aplicável`. Ou seja: Python, Go, Rust, .NET e Java
   simplesmente NÃO tinham CI, contradizendo a premissa da fábrica. Criado
   `ci/ecossistemas.ts`: detecção por arquivo-marcador (`package.json`, `pyproject.toml`/
   `requirements.txt`/`setup.py`, `go.mod`, `Cargo.toml`, `.csproj`/`.sln`, `pom.xml`,
   `build.gradle`), cada um com os comandos da própria toolchain. Regra de habilitação:
   só nasce LIGADO o que a toolchain garante (`go test`, `cargo test`, `dotnet test`…);
   ferramenta de terceiro que pode não estar instalada (ruff, clippy, golangci-lint) vem
   com o comando PREENCHIDO e DESLIGADO — o usuário liga num clique, em vez de tomar
   falha de CI na primeira execução por binário ausente. Node mantém a detecção fina por
   script (`npm run <x>` falha se o script não existe).
   **Ecossistema desconhecido deixou de ser erro:** devolve config vazia e editável, com
   `ecossistema: null` e uma dica na UI. Dead-end virou ponto de partida.
2. **Importação ignorava só `node_modules`.** Um projeto Python arrastava o `.venv/`
   inteiro; um Rust, o `target/` (gigabytes). Criada `PASTAS_IGNORADAS` cobrindo os
   caches/deps dos ecossistemas suportados. **Critério explícito:** só entra o que é
   INEQUIVOCAMENTE regenerável pelo gerenciador de pacotes — por isso `build/`, `dist/`,
   `bin/` e `obj/` NÃO entram (em muitos projetos são fonte de verdade, e perder fonte na
   cópia é pior que copiar artefato à toa). `target/` é exceção justificada: só existe por
   causa do Cargo e costuma ser o maior diretório do repo. Coberto por teste que verifica
   as duas metades (lixo ignorado E `build/` preservado).
**O que a auditoria APROVOU sem mudanças:** o sistema de agentes sob demanda. `lerEquipe`
é tolerante (arquivo ausente é normal, malformado não derruba, ids/prompts validados),
`agentesValidos` filtra os quebrados, `agentesParaAcao` injeta em `options.agents` só no
`/trabalhar <projeto>`, e o planejador manda criar 2–5 especialistas "genéricos ao TIPO de
projeto (web, CLI, pipeline, lib…)" com testador/revisor fixos fora da equipe. Isso já
tinha sido provado ao vivo em 2026-07-22 (especialistas `domain` e `cli-core` despachados
corretamente num CLI Node).
**Quem:** orquestrador

## 2026-07-27 — `canUseTool` VALIDADO em execução paga; `echo` não serve de gatilho
**Decisão:** a integração real do `canUseTool` (T-010), pendente desde 2026-07-21, foi
validada com o SDK de verdade — e o `teste:integracao`, que era um `echo` placeholder,
virou esse teste (`servidor/integracao/canusetool.ts`, fora de `testes/` para nunca cair
no `npm test`). **Provado ponta a ponta:** com `permissionMode: "default"`, o SDK chama o
callback → o runner cria a pendência → o job pausa em `aguardando-input` → responder
destrava → o fluxo conclui e a ferramenta aprovada roda de fato.
**Armadilha achada no caminho (custou uma rodada paga):** a 1ª tentativa pedia
`echo CANUSETOOL_OK` via Bash e saiu **INCONCLUSIVA** — o comando rodou, mas o callback
NUNCA foi chamado. Comando trivialmente seguro é auto-aprovado pelo classificador de
permissões antes de chegar ao `canUseTool`. O gatilho confiável é uma ação genuinamente
barrada: escrever num caminho FORA do diretório de trabalho — que o próprio SDK documenta
no campo `blockedPath` do `CanUseTool` ("quando um comando tenta acessar caminho fora dos
diretórios permitidos"). Com `Write` num diretório externo, a pendência apareceu na hora.
**Motivo do registro:** quem for escrever o próximo teste de permissão vai instintivamente
usar `echo`/`ls` (parecem inofensivos, logo "seguros para testar") e vai concluir
erradamente que o `canUseTool` está quebrado. O script imprime INCONCLUSIVO em vez de
falso sucesso justamente para esse caso.
**Custo real:** US$ 0,037 (rodada inconclusiva) + US$ 0,011 (rodada que provou) =
**US$ 0,048 (~R$ 0,27)**, no Haiku.
**Quem:** orquestrador + usuário (autorizou o gasto)

## 2026-07-27 — Marco da Fase 3 aprovado COM ressalva; documentação passa a admitir o que falta
**Decisão:** as 20 tarefas estão `concluida` e o `Marco:` da Fase 3 foi registrado como
**aprovado 2026-07-27, com ressalva explícita**: a verificação visual em navegador (parte
do critério 1 da T-020) não foi feita, porque não há navegador neste ambiente
(sem Playwright/chromium-cli). Aprovar sem a ressalva seria registrar como verificado algo
que ninguém olhou. Junto: a documentação passou a declarar que `teste:integracao` é um
placeholder vazio e que o `canUseTool` NUNCA rodou pago — antes o CLAUDE.md afirmava o
contrário, o que faria a próxima sessão confiar numa cobertura inexistente.
**Motivo:** documentação que mente é pior que documentação ausente — a próxima sessão
(ou o próximo agente) toma decisão em cima dela. O mesmo vale para marco de fase: o valor
da linha `Marco:` é dizer à sessão seguinte o que de fato foi verificado.
**Quem:** orquestrador (T-020)

## 2026-07-27 — Robustez (T-019): interromper ≠ cancelar; watchdog conta silêncio, não duração
**Decisão:** quatro escolhas de desenho na T-019.
(1) *`interromper` é irmão de `cancelar`, não o mesmo:* estado final `interrompido` com
motivo, não `cancelado`. Cancelar é ação do USUÁRIO, interromper é decisão do SISTEMA
(watchdog); colapsar os dois faria a UI mentir sobre quem matou o fluxo. Se ambos forem
pedidos, o cancelamento do usuário prevalece.
(2) *Watchdog conta a partir do ÚLTIMO EVENTO, não do início:* um `/trabalhar` legítimo
dura horas — duração não é sintoma, silêncio é. E `aguardando-input` **não** conta como
inatividade: o job está esperando um humano, e matar por isso destruiria justamente o
fluxo da T-010. Jobs não-Claude ficam fora da vigilância: o CI já tem timeout por estágio
(T-017) e `npm install` silencioso é normal — duas proteções concorrentes gerariam
interrupção falsa.
(3) *`sessionId` gravado no `system/init`, não no fim:* antes ele só existia no resultado
do job CONCLUÍDO, ou seja, nunca nos casos em que a retomada manual importa. Novo
`ctx.anotar()` grava e persiste na hora.
(4) *Saneamento de boot publicado separado do construtor:* as transições dos jobs órfãos
eram emitidas no construtor, antes de o hub SSE conectar — ninguém escutava.
`publicarSaneamentoDeBoot()` é chamado pelo `inicializar.ts` depois de `hub.conectar`.
Junto: pendências de input abertas passam a ser FECHADAS no boot (antes o metadado do job
seguia dizendo "aguardando resposta" para sempre) e resultados de CI deixados como
`executando` são reconciliados para `interrompido` (achado da revisão anterior).
**Motivo:** o pior estado do painel é um fluxo travado segurando o lock de um projeto —
nada mais daquele projeto anda até alguém perceber à mão. Guardrails por ação
(data-driven, como as estratégias de modelo) garantem que nenhum fluxo suba sem teto de
turnos; `maxBudgetUsd` fica `null` de propósito (assinatura não cobra por chamada, o
número é informacional).
**Quem:** orquestrador (T-019)

## 2026-07-27 — Revisão do T-016/T-017/T-018 (segunda passada, modelo mais forte)
**Decisão:** revisão dedicada do que foi construído na sessão, a pedido do usuário. Três
correções aplicadas, uma delas de bug real:
1. **Bug (corrigido):** `ci/config.ts` gravava `_gestao/ci.json` sem garantir que a pasta
   `_gestao/` existisse → **ENOENT/500** em qualquer projeto sob `projetos/` que não
   tenha passado pelo `/novo-projeto` ou pela importação (pasta clonada à mão, que o
   leitor aceita como projeto válido). Pior: na construção original o teste de rota foi
   "consertado" criando `_gestao/` no fixture, o que MASCAROU o bug em vez de expô-lo.
   Agora `escrever()` faz `mkdir` recursivo, o fixture da rota voltou a NÃO ter
   `_gestao/` (exercita o caso real) e há teste de regressão dedicado em `config.test.ts`.
2. **UX (corrigido):** `useDados` zerava `dados` em TODA recarga, então o refetch
   automático da T-016/T-018 fazia a página inteira piscar "Carregando…" a cada job que
   terminava — e desmontava os filhos, perdendo estado local (ex.: editor de `ci.json`
   aberto com alterações não salvas). Agora só a troca de `caminho` zera; recarga
   preserva o que está na tela.
3. **Correção de fragilidade:** `recarregar` era recriada a cada render, e entra em array
   de dependências de efeito na T-016/T-018 — os efeitos rodavam em toda renderização
   (a cada evento SSE) em vez de só quando os jobs mudam. Estabilizada com `useCallback`.
   Também trocado o tipo hand-rolled de `resolverProjetoOu404` (`rotas/ci.ts`) pelos
   tipos `Request`/`Response` do Express.
4. **Teste quebrado (corrigido) — o "flaky pré-existente" não era flaky:** durante toda a
   sessão o teste `POST /api/jobs/:id/cancelar em job executando … (202)` foi dispensado
   como "corrida de timing pré-existente e não-relacionada". Investigado agora: ele usava
   o runner FAKE (`passos: 2, delayMs: 1` → ~2ms de vida) e a ida-e-volta HTTP do
   supertest demora muito mais, então o job já estava `concluido` quando o POST chegava e
   a rota respondia 409. O teste perdia essa corrida SEMPRE — não era intermitente, era
   um teste mal escrito. Trocado para o runner MANUAL (fica pendurado até o teste mandar
   e rejeita no abort — exatamente o caminho que o teste quer exercitar). **Suíte agora
   172/172 + 14/14, verde de ponta a ponta pela primeira vez.**
**Lição registrada:** rotular uma falha recorrente como "flaky/pré-existente" sem abrir o
teste escondeu por horas um defeito de 3 linhas. Falha que se repete em toda execução não
é flaky.
**Motivo:** o usuário pediu conferência por ter construído num modelo mais fraco. O
achado nº 1 confirma que a desconfiança era justificada — "corrigir o teste até passar"
é exatamente o modo de falha a vigiar.
**Quem:** orquestrador

## 2026-07-27 — Marco da Fase 1 registrado retroativamente
**Decisão:** `Marco:` da Fase 1 estava `pendente` desde 2026-07-21 embora T-001..T-006
estejam todas `concluida` — a linha nunca foi preenchida ao fechar a fase. Registrado
**aprovado 2026-07-27 (retroativo)**. Sem isso, o leitor da fábrica (`faseAtual` = a
primeira fase com marco `pendente`) reportaria a Fase 1 como a fase corrente do painel,
com a Fase 2 já aprovada logo abaixo — estado impossível.
**Motivo:** a meta da Fase 1 (painel somente-leitura rodando sobre os arquivos reais +
spike do SDK) está comprovada pelo próprio painel em uso desde então; o que faltava era
o registro. Marcado como retroativo em vez de datar 2026-07-21 para não fingir que a
verificação aconteceu na época.
**Quem:** orquestrador

## 2026-07-27 — Marco da Fase 2 aprovado (verificação por orquestrador, sem testador)
**Decisão:** T-016 era a última tarefa pendente de `Tarefas:` da Fase 2 no PLANO.md (não
da Fase 3, como o encadeamento do `proximo_prompt.txt` presumia — checado no PLANO.md
antes de seguir para o T-017). `Marco:` da Fase 2 marcado **aprovado 2026-07-27**, com
base na evidência cumulativa já registrada tarefa a tarefa (não um novo disparo pago):
disparo real de `/status` via Haiku com SSE ao vivo (T-008/T-009/T-011), inputs pela UI
provados com `canUseTool`/pausas reais (T-010), análise real gerando `ANALISE.md`
(T-012), importação real de pasta com git+`_gestao/` (T-013), cancelamento testado
(T-007/fila), e o smoke de rede/bundle do T-016. Verificação FORMAL do testador (que só
opera em `projetos/`) não se aplica ao painel — mesma exceção documentada desde
"Painel movido para a raiz" (2026-07-21): mantido à mão, fora do pipeline.
**Motivo:** protocolo pede verificação de marco ao fechar a última tarefa da fase; para
o painel isso é o próprio orquestrador avaliando a evidência já reunida, não um novo
gasto — regra de custo do usuário (evitar pipeline caro sem necessidade).
**Quem:** orquestrador

## 2026-07-27 — UI de CI/CD (T-018): reusa o único SSE existente, sem aba (T-006 não tem abas)
**Decisão:** `SecaoCi` (nova, `web/src/paginas/projeto/ci/PainelCi.tsx`) recebe o estado
ao vivo (`jobs`/`logs`/`estagiosCi`) de `Projeto.tsx` via props, em vez de chamar
`useJobsAoVivo()` de novo — a página do projeto já abre UMA conexão SSE (T-016); uma
segunda violaria a decisão "SSE único multiplexado" de 2026-07-21. `useJobsAoVivo.ts`
ganhou um novo slice de estado `estagiosCi` (jobId→estágio→estado ao vivo), capturando
os eventos `ci-estagio-inicio`/`ci-estagio` que o hook antes descartava — sem isso não
dava pra saber que um estágio foi `pulado` antes de o job terminar (estágio pulado não
gera log nenhum, então só olhar `logs` não distingue "ainda não chegou" de "pulado").
`LinhaLog` ganhou `estagio`/`fluxo` opcionais pelo mesmo motivo (log inline por
estágio). Mudança aditiva e retrocompatível — `Jobs.tsx` (T-014) ignora os campos novos.
A T-018 também constatou que a T-006 não implementou sistema de abas (ficou lista
vertical de seções) — `SecaoCi` entra como mais uma seção, não uma aba; e que o arquivo
`lib/sse.ts` citado no contexto da tarefa nunca existiu (o hook real é
`useJobsAoVivo.ts`, da própria T-014).
**Motivo:** preservar a arquitetura de canal único; extensão do hook compartilhado é
mais barata e mais correta que abrir uma segunda conexão ou inferir estado por
heurística de log.
**Quem:** orquestrador (T-018)

## 2026-07-27 — `testTimeout` global (15s) no servidor: raiz do 3º teste-de-I/O flaky
**Decisão:** `servidor/vitest.config.ts` ganhou `testTimeout: 15000` (era o default de
5s do Vitest). Motivo imediato: um 3º teste pré-existente diferente
(`cadastro-rota.test.ts`, T-013) estourou o default sob a carga paralela extra dos
testes de CI/UI — mesma causa dos dois already corrigidos individualmente no T-017
(OneDrive/antivírus em `Documents\`, achado original do T-007). Revertidos os timeouts
individuais que tinham acabado de ser cravados nesse teste; os do T-017
(`importar.test.ts`, `ci-rota.test.ts`) ficaram como estão (não fazem mal redundantes).
**Motivo:** corrigir teste a teste sempre que a suíte cresce e aumenta a carga paralela
é fadado a se repetir; a causa é ambiental (I/O sob OneDrive), não do teste — resolver
na configuração do runner é mais robusto que caçar cada novo caso.
**Quem:** orquestrador (T-018)

## 2026-07-27 — Ações por projeto (T-016): job ativo por escopo, refetch por transição vista
**Decisão:** `AcoesProjeto.tsx` exporta `jobAtivoDoProjeto(jobs, projeto)` — função pura
que filtra `jobs` (do `useJobsAoVivo`, já existente da T-014) por
`escopo === "projeto:<nome>"` e estado não-terminal, priorizando o que já está
executando/aguardando-input sobre os que só esperam na fila. O refetch automático do
detalhe do projeto (kanban/plano/análise) usa um `useRef<Map<jobId, estadoVisto>>` para
comparar o estado de cada job do escopo do projeto contra o que foi visto na renderização
anterior; só dispara `recarregar()` numa transição real não-terminal→terminal — cobre
job disparado por fora (CLI) sem duplicar refetch a cada evento SSE não-relacionado.
O alerta especial "painel-fabrica" foi implementado mesmo sabendo que a página nunca é
alcançável hoje (o painel não é mais um projeto sob `projetos/`, decisão de 2026-07-21)
— defensivo e sem custo, cobre se um dia existir um projeto de verdade com esse nome.
**Motivo:** reaproveitar o hook SSE já existente (T-014) em vez de abrir uma segunda
conexão/mecanismo; padrão de card-expansível idêntico ao da T-015 (`CartaoAcao`) para
consistência visual e de UX em toda a SPA.
**Quem:** orquestrador (T-016)

## 2026-07-27 — Ordem da Fase 3 corrigida: T-016 antes do T-018 (dependência esquecida)
**Decisão:** ao retomar a Fase 3 (CI/CD), o T-018 (UI de CI/CD) declara `dependencias:
[T-016, T-017]` no frontmatter, mas o T-016 (ações por projeto) ainda estava em
`backlog` — a instrução de retomada da sessão anterior (`proximo_prompt.txt`) listava
só T-017→T-018→T-019→T-020, pulando o T-016. Intercalei o T-016 entre o T-017 e o T-018
para respeitar a regra de ouro nº 6 (só promove `pronta` com dependências concluídas).
**Motivo:** dependência real no frontmatter das tarefas, não uma preferência de
sequenciamento — sem o T-016 pronto, a aba de CI da T-018 não teria onde encaixar na
página do projeto.
**Quem:** orquestrador

## 2026-07-27 — Motor de CI (T-017): config no projeto, resultado no painel, spawn+kill próprios
**Decisão:** `_gestao/ci.json` (estágios `instalar→lint→testes→build`, comando +
habilitado por estágio, timeout) vive no PROJETO; resultado da execução
(`dados/ci/<projeto>.json`, último + histórico capado em 20) vive no PAINEL — já
decidido em 2026-07-21, implementação confirma o desenho. Defaults deduzidos do
`package.json`: `instalar` sempre ligado, os demais só quando o script homônimo existe
(senão nascem desabilitados = rodam `pulado`, nunca erro). Spawn próprio
(`node:child_process`, sem `tree-kill` nem outra lib nova) com `shell:true` — Windows
exige (`npm` é `npm.cmd`) — e encerramento de árvore via `taskkill /PID <pid> /T /F` no
Windows / `kill(-pid)` de grupo no POSIX; nunca `child.kill()` sozinho, que deixaria o
`node.exe` filho do `npm.cmd` órfão. Job tipo `"ci"`, `usaClaude:false`, escopo
`projeto:<nome>` — mesmo lock que o job Claude e o de importação, então CI nunca roda
junto com um fluxo do mesmo projeto (fila da T-007 já garante, sem lógica nova).
**Motivo:** artefato que descreve o projeto pertence ao projeto (git, visível aos
agentes); resultado de execução é operacional (painel). `taskkill /T` em vez de
`tree-kill`: comando nativo do Windows já resolve a árvore, dependência nova seria
redundante (mesmo princípio do SQLite descartado em 2026-07-21). Nova env `DADOS_DIR`
(mesmo padrão da `FABRICA_RAIZ`) para os testes não escreverem no `dados/` real do
painel.
**Quem:** orquestrador (T-017)

## 2026-07-22 — Runner loga o especialista despachado; ferramenta de despacho é `Agent`
**Decisão:** o runner (`servidor/src/jobs/claude/runner-claude.ts`) passa a extrair o
`subagent_type` do input das ferramentas de despacho e a incluí-lo no log
(`Agent → domain`, `Agent → testador`), em vez de só o nome cru da ferramenta. Reconhece
tanto `Agent` (o nome real no Claude Code, descoberto no teste ponta a ponta) quanto `Task`
(usado por outros SDKs). Forma inesperada → cai no nome cru, sem quebrar.
**Motivo:** o log antes mostrava só `(subagente) Task`, sem dizer QUEM estava trabalhando —
contra o requisito de "visão profunda" da equipe. O teste real dos agentes dinâmicos revelou
que a ferramenta de despacho aqui se chama `Agent`, então o gancho anterior (mirado em `Task`)
nunca dispararia. Corrigido e coberto por 2 testes novos (servidor 99→101).
**Relacionado (fábrica, fora do painel):** o mesmo teste pegou um bug no
`.claude/commands/trabalhar.md` — o orquestrador headless condicionava usar o especialista a
"rodar pelo painel", coisa que ele não consegue verificar, e caía no executor genérico.
Corrigido para seleção determinística por `_gestao/equipe.json`. Re-validado: T-002→`domain`,
T-003→`cli-core`. (Ver `_sistema/logs/2026-07-22.md`.)
**Quem:** orquestrador

## 2026-07-21 — Stack do painel: Express 5 + React/Vite + TypeScript, sem banco
**Decisão:** Monorepo npm workspaces com `servidor/` (Express 5, TS estrito, bind
exclusivo em 127.0.0.1:8765) e `web/` (React 18 + Vite + TS, CSS puro com variáveis,
dark mode padrão). Testes com Vitest (+ supertest). Sem banco de dados: estado da
fábrica lido dos arquivos; dados operacionais do painel (jobs, logs, CI) em `dados/`
(pasta descartável, fora do git). Frontmatter via `gray-matter`.
**Motivo:** o painel será mantido pela própria fábrica — stack mais difundida = menos
erro dos agentes. Descartados: Fastify (ganho irrelevante em localhost, menos ubíquo),
Svelte/Vue (menos referência para agentes), SPA sem build (inviável para kanban + SSE +
formulários), SQLite (dependência nativa no Windows sem necessidade; JSON/NDJSON são
inspecionáveis e suficientes).
**Quem:** planejador

## 2026-07-21 — Integração com a fábrica via Claude Agent SDK (versão pinada)
**Decisão:** fluxos da fábrica executados pelo `@anthropic-ai/claude-agent-sdk` com
versão exata pinada (sem `^`); CLI headless (`claude -p --output-format stream-json`)
apenas como fallback de depuração. Modelo sempre explícito nas options (headless não
herda; default configurável, inicial `fable`). Cancelamento via
AbortController/interrupt (nunca kill de processo no Windows). A primeira tarefa do
projeto (T-001) é um spike validando o reuso do login por assinatura; plano B:
`pathToClaudeCodeExecutable` → `%USERPROFILE%\.local\bin\claude.exe`.
**Motivo:** conclusão da pesquisa `_gestao/pesquisas/2026-07-21-claude-code-headless.md`
(mensagens tipadas, canUseTool/AskUserQuestion para inputs pela UI, cancelamento in-band
no Windows). Descartada: API Anthropic pura (reimplementaria tool loop e não usa a
assinatura).
**Quem:** planejador

## 2026-07-21 — SSE único multiplexado (não WebSocket, não um stream por job)
**Decisão:** um único endpoint `GET /api/eventos` (SSE) multiplexado — cada evento
carrega `jobId`; heartbeat `:ping` ~15s; buffer de replay em memória com
`Last-Event-ID`. Comandos e respostas da UI vão por POST normal.
**Motivo:** tráfego é unidirecional (backend→UI); SSE dá reconexão nativa e dispensa
libs. Um stream por job estouraria o limite de ~6 conexões HTTP/1.1 do navegador.
Descartado: WebSocket (só compensaria com bidirecional intenso).
**Quem:** planejador

## 2026-07-21 — Modelo de concorrência da fila de jobs
**Decisão:** cada job declara escopo de lock: `global` (exclusivo — nada mais roda:
/trabalhar sem projeto, /encerrar-dia, /manutencao, /ideia, /status, /novo-projeto) ou
`projeto:<nome>` (exclusivo por projeto: /trabalhar <nome>, análise, CI). Projetos
diferentes rodam em paralelo até o teto configurável de execuções Claude simultâneas
(default 2). O "máx. 3 executores / testador quieto" é responsabilidade do /trabalhar
(orquestrador dentro do fluxo), não da fila do painel.
**Motivo:** espelha as regras da fábrica no nível certo (o painel enfileira FLUXOS, não
agentes) e evita corrida na mesma árvore de trabalho. Limitação registrada: os locks não
enxergam sessões interativas do chat — documentado como risco na especificação.
**Quem:** planejador

## 2026-07-21 — Arquivos da fábrica são a fonte de verdade; `dados/` é descartável
**Decisão:** o painel nunca armazena status de tarefa/projeto próprio: toda visão é
derivada dos arquivos da fábrica no momento da consulta (descrições das ações lidas do
frontmatter de `.claude/commands/*.md`). O que o painel persiste em `dados/` é apenas
histórico operacional (metadados/logs de jobs, resultados de CI) — apagável sem corromper
nada.
**Motivo:** restrição de arquitetura da fábrica (regra de ouro nº 4/6 do CLAUDE.md raiz);
evita o clássico estado duplicado divergente.
**Quem:** planejador

## 2026-07-21 — Análise persistida em `_gestao/ANALISE.md`; CI configurado em `_gestao/ci.json`
**Decisão:** a análise de ponta a ponta é gravada em `_gestao/ANALISE.md` do projeto
analisado (estrutura fixa + rodapé com data e commit; atualização incremental na
re-execução, com cwd no próprio projeto). A configuração de CI de cada projeto vive em
`_gestao/ci.json` (estágios instalar → lint → testes → build; defaults deduzidos do
package.json), editável pela UI; o resultado das execuções fica em `dados/ci/` do painel.
**Motivo:** artefatos que descrevem o projeto pertencem ao projeto (versionados no git
dele, visíveis aos agentes); resultados de execução são operacionais e ficam no painel.
**Quem:** planejador

## 2026-07-21 — Spike T-001: SDK autentica por assinatura via binário empacotado; versão pinada 0.3.217
**Decisão:** o `@anthropic-ai/claude-agent-sdk` fica pinado em `0.3.217` e usa o
binário EMPACOTADO do próprio SDK — o reuso do login por assinatura foi validado
na máquina do usuário SEM `ANTHROPIC_API_KEY` no ambiente (spike em
`experimentos/spike-sdk/`, resultados no LEIA-ME.md). O plano B
(`pathToClaudeCodeExecutable`) NÃO é necessário; se um dia for, o caminho nesta
máquina é `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe`
— binário nativo apontado pelo campo `bin` do package.json do pacote npm global
(verificado no disco com o pacote v2.1.216; NÃO existe `cli.js` nele — caminho
corrigido no ciclo 2 da T-001 após revisão). `%USERPROFILE%\.local\bin\claude.exe`
da pesquisa NÃO existe aqui. Modelo: alias `fable` funciona headless (resolve para `claude-fable-5`).
Node da máquina: v24.18.0; o SDK exige apenas `>=18.0.0` (`engines`), então o
requisito real do projeto continua sendo o Node 22+ já definido na especificação.
**Motivo:** era a incerteza nº 1 da pesquisa
`_gestao/pesquisas/2026-07-21-claude-code-headless.md` (armadilha 1 e seção "Não
confirmado"); o spike confirmou o caminho simples. Streaming (`system/init` antes
do `result`) e cancelamento via AbortController (processo encerra sozinho em
~6,6s) também validados. Achado extra: o stream emite eventos não documentados
(ex.: `rate_limit_event`) — consumidores devem ignorar tipos desconhecidos.
**Quem:** executor (T-001)

## 2026-07-21 — Núcleo de jobs (T-007): semântica da fila, persistência e boot
**Decisão:** quatro escolhas de implementação do motor de jobs. (1) *Anti-starvation do
global:* um job `global` aguardando na fila barra os jobs enfileirados DEPOIS dele —
senão jobs de projeto o adiariam para sempre; os enfileirados antes seguem normalmente.
(2) *Persistência síncrona:* `dados/jobs/<id>.json` é escrito com `writeFileSync` a cada
transição — garante ordem no disco sem fila de escrita (arquivos minúsculos, transições
raras; irrelevante para o event loop nessa escala). (3) *Boot saneador:* ao criar o
gerenciador, jobs carregados do disco em estado não-terminal viram `interrompido` com
nota — antecipa o RF-16 no nível do núcleo (o disco nunca fica dizendo "executando" para
sempre). (4) *Cancelamento prevalece:* se o cancelamento foi pedido com o job executando,
o estado final é `cancelado` independentemente de como a promessa do runner assentar
(runner que ignora o abort e resolve não "desfaz" o pedido do usuário — determinístico
para UI e testes).
**Motivo:** pontos que o contexto da T-007 deixava em aberto; escolhas pela previsibilidade
(fila justa, ordem de escrita garantida, estado consistente pós-crash) sem dependências
novas — tudo com built-ins do Node.
**Quem:** executor (T-007)

## 2026-07-21 — Semântica do leitor do estado da fábrica (T-003)
**Decisão:** o leitor (`servidor/src/fabrica/`) preserva valores brutos e nunca lança:
item malformado retorna com `erros: string[]` preenchido. Contagem por status considera
só os 8 status válidos do protocolo (status desconhecido fica fora da contagem,
sinalizado em `erros` da tarefa). Fase atual = primeira fase com `Marco: pendente`
(contrato) e, se nenhuma, a primeira `reprovado` — fase reprovada segue em andamento até
reaprovar. O gray-matter é chamado SEMPRE com objeto de options (`matter(texto, {})`):
sem options ele cacheia o objeto ANTES do parse, e um YAML inválido envenena o cache —
as chamadas seguintes com o mesmo conteúdo retornam "sucesso" com data vazio.
**Motivo:** robustez exigida pela tarefa (arquivo quebrado não pode derrubar o painel) e
bug real flagrado nos testes (cache do gray-matter). Alternativa descartada: normalizar
status inválido para um valor padrão — esconderia o problema em vez de exibi-lo.
**Quem:** executor (T-003)

## 2026-07-21 — Catálogo de ações (T-004): extração tolerante quando o YAML do comando é inválido
**Decisão:** o catálogo (`servidor/src/fabrica/catalogo-acoes.ts`) lê `description` e
`argument-hint` de `.claude/commands/<id>.md` na hora, via gray-matter; quando o YAML
falha, os campos são recuperados linha a linha do bloco de frontmatter (texto literal,
trim). Fallback inteiro em PT-BR só quando o arquivo falta/está ilegível ou o
frontmatter não rende nem uma linha `description:`. Arquivo válido é fonte dos DOIS
campos: `argument-hint` ausente = ação sem argumentos (`argumentos: null`), não
fallback.
**Motivo:** os arquivos REAIS `trabalhar.md` e `status.md` da fábrica têm
`argument-hint: [nome-do-projeto] (vazio = ...)` — YAML inválido para o js-yaml
("[...]" vira sequência flow com sufixo), mas aceito pelo consumidor real (Claude
Code). Só fallback violaria o critério "descrições batendo com os arquivos" e
esconderia a fonte de verdade. Editar os arquivos da fábrica está fora do confinamento
do projeto. Descartada: parser YAML alternativo leniente (dependência nova para um
formato que é só `chave: valor`).
**Quem:** executor (T-004)

## 2026-07-21 — Núcleo de jobs (T-007, ciclo 2): I/O falível é fatal só na criação
**Decisão:** três regras de robustez no motor de jobs, atendendo à revisão do ciclo 1.
(1) *Persistência fatal SÓ na criação:* `criarJob` persiste ANTES de inserir o job na
fila — disco/params quebrados devolvem erro ao chamador sem deixar job fantasma
agendável. Nas transições seguintes a persistência é NÃO-fatal: falha vira aviso no
console e o estado em memória segue valendo (o boot saneador conserta o disco no
próximo reinício). (2) *Emissão não-fatal:* listener do emissor que lança (ex.: SSE da
T-009) é capturado e logado — nunca derruba o processo nem pula o reagendamento; a
cadeia final do `iniciar` ainda tem `finally { agendar() }` + `.catch` de última
instância (unhandled rejection mataria o processo no Node 22+). (3) *Escrita atômica:*
`salvarJob` grava em `<id>.json.tmp` e renomeia — crash no meio nunca deixa JSON
truncado (sobra `.tmp`, que a carga ignora).
**Motivo:** achados importantes da Revisão (ciclo 1): cadeia final de `iniciar` sem
catch derrubava o painel inteiro em EBUSY/EPERM (OneDrive/antivírus em `Documents\`) e
`criarJob` inserindo antes de persistir criava job fantasma que executava depois do
erro. Alternativa descartada: fila de escrita assíncrona com retry — complexidade
desproporcional para arquivos minúsculos com escrita síncrona já decidida.
**Quem:** executor (T-007)

## 2026-07-21 — Importar projeto = copiar para dentro de `projetos/`
**Decisão:** importar pasta existente copia o conteúdo para `projetos/<nome>/`
(preservando `.git` se houver, senão `git init`; ignorando `node_modules`), cria
`_gestao/` mínimo a partir dos templates quando ausente e dispara a análise
automaticamente. Nunca sobrescreve projeto existente (409).
**Motivo:** a fábrica inteira assume projetos sob `projetos/` (agentes, comandos,
confinamento). Registrar caminhos externos criaria uma segunda classe de projeto que
nenhum fluxo suporta. Descartado: symlink/registro de caminho externo.
**Quem:** planejador

## 2026-07-21 — Fase 2 construída direto pelo orquestrador (fora do pipeline), com controle de custo
**Decisão:** o disparo real das ações (runner do Agent SDK, SSE, rotas de ação, UI de
jobs e de disparo) foi implementado diretamente pelo orquestrador no Opus, sem o pipeline
executor→testador→revisor, a pedido do usuário para conter custo depois do incidente de
gasto (~R$550 numa noite em Fable/xhigh). Verificação por suíte automatizada (SDK
falsificado) + uma execução real barata (/status no haiku). Guardrails de custo: modelo
escolhido na UF a cada disparo, default econômico `sonnet` (env `MODELO_PADRAO`), aviso na
ação pesada (/trabalhar), cancelamento via AbortController.
**Motivo:** entregar valor visível rápido e barato; o rigor formal do pipeline custaria
muito mais. Registrado nas tarefas T-008/T-009/T-011/T-014/T-015 que a verificação/revisão
formais foram dispensadas.
**Quem:** orquestrador

## 2026-07-21 — permissionMode `bypassPermissions` no runner (ferramenta local pessoal)
**Decisão:** o runner Claude roda com `permissionMode: "bypassPermissions"` por padrão.
Sem isso, ferramentas fora do allowlist pausariam esperando aprovação que o headless não
tem como pedir, travando o fluxo. Inputs/aprovações roteados para a UI (callback
`canUseTool` + AskUserQuestion) ficam para a T-010.
**Motivo:** é ferramenta local pessoal do Enzo operando a própria fábrica (a pesquisa
sanciona bypass para uso local); o alvo é autonomia máxima. Enquanto a T-010 não existe, a
alternativa (acceptEdits sem canUseTool) abortaria fluxos que usam shell fora do allowlist.
**Quem:** orquestrador

## 2026-07-21 — Agent SDK instalado no workspace `servidor` (pinado 0.3.217)
**Decisão:** `@anthropic-ai/claude-agent-sdk` fixado em `0.3.217` (sem `^`) como
dependência do workspace `servidor` (antes só existia no spike isolado).
**Motivo:** o runner de produção precisa do SDK; versão pinada = comportamento
reproduzível (a pesquisa alerta para o churn quase diário de releases).
**Quem:** orquestrador

## 2026-07-21 — Painel movido de projetos/painel-fabrica para a raiz (<fabrica>/painel)
**Decisão:** o painel deixou de ser um projeto sob `projetos/` e passou a ser **ferramenta
de sistema** em `<fabrica>/painel/`, versionada no repositório da raiz da fábrica (junto
com `_sistema/`, `.claude/`). `config.ts` passou a resolver `fabricaRaiz` um nível acima
(`resolve(raizPainel, "..")`). Histórico git anterior (15 commits do repo próprio)
preservado num bundle fora do repo; o `.git` aninhado foi removido.
**Motivo:** pedido do usuário — o painel opera a fábrica principal, então faz sentido
morar com o sistema e ficar visível no git da raiz (antes `projetos/` era gitignorado e o
git da raiz parecia "vazio", o que confundiu). **Consequências aceitas:** (a) o painel
não aparece mais na própria lista de projetos; (b) a fábrica NÃO consegue mais manter o
painel pelo pipeline executor/testador/revisor (que só opera em `projetos/`) — passa a ser
mantido à mão pelo orquestrador. Alternativa descartada: manter em `projetos/` com um
ponteiro no README da raiz.
**Quem:** usuário + orquestrador

## 2026-07-21 — Estratégias de modelo data-driven (com fallback Fable→Opus) + estimativa de custo
**Decisão:** o disparo deixou de escolher um modelo "cru" e passou a escolher uma
ESTRATÉGIA nomeada, definida numa lista data-driven em `config.ts` (`ESTRATEGIAS_MODELO`)
— nada de modelo hardcoded no fluxo. Cada estratégia é `{ id, rotulo, modelo, fallback,
custo, descricao }`. A `fable-opus` usa o suporte NATIVO do SDK (`fallbackModel`, string no
`Options` do `query()`): prioriza Fable e cai para Opus quando o primário está sem
limite/sobrecarregado, re-tentando o primário a cada turno. A UI mostra a descrição da
estratégia e uma ESTIMATIVA de custo qualitativa = peso da ação (leve/médio/pesado, em
`catalogo-acoes.ts`) + tier de custo do modelo. Custo REAL continua vindo do evento
`result` do SDK.
**Motivo:** pedido do usuário — opção inteligente Fable→Opus sem hardcodar, e deixar claro
o custo antes de gastar. Data-driven para editar sem tocar em lógica. Default econômico
(`sonnet`, env `ESTRATEGIA_PADRAO`).
**Quem:** usuário + orquestrador

## 2026-07-21 — Agentes dinâmicos sob demanda no /trabalhar ("Equipe do projeto")
**Decisão:** implementado o design de `_gestao/pesquisas/2026-07-21-agentes-dinamicos.md`.
Cada projeto pode ter `_gestao/equipe.json` (gerado pelo planejador a partir da ideia):
especialistas de CONSTRUÇÃO. As tarefas ganham o campo opcional `agente:`. Ao disparar
`/trabalhar <projeto>`, o painel lê a equipe e injeta em `options.agents` do SDK; o
`/trabalhar` despacha cada tarefa ao seu especialista (fallback: executor genérico).
Testador e revisor seguem fixos e genéricos. Validado ao vivo: injeção correta dos
especialistas nos params do job. Toca a fábrica (planejador, comando /trabalhar, template
e protocolo de tarefa) e o painel (leitor de equipe, injeção, exibição).
**Motivo:** pedido do usuário — orquestração genérica que cria/ordena sub-agentes sob
demanda por projeto. Especialistas só na construção = agentes dinâmicos onde importa sem
arriscar a estabilidade da verificação. File-based (equipe.json versionado) e nativo
(`options.agents`). Alternativa descartada: agentes de arquivo em projetos/<nome>/.claude/
(não carregam com cwd na raiz da fábrica).
**Quem:** usuário + orquestrador

## 2026-07-28 — Ações por projeto e a 4ª exceção à regra de escrita (T-033/T-034/T-035)
**Decisão:** a página de um projeto ganhou 8 ações em três grupos — cinco de especialista
(documentar, pesquisar, revisar, replanejar, testar), duas de zeladoria com escopo do
projeto (conferir integridade, atualizar progresso) e uma de equipe (recriar equipe).
Motor data-driven em `acoes/acoes-projeto.ts`: ação nova = uma entrada na tabela + um
prompt versionado em `prompts/projeto/<id>.md`. Rota própria, guardrail por ação e lock
`projeto:<nome>`.

O `cwd` desses fluxos é a **raiz da fábrica**, não a pasta do projeto — o oposto da
análise (T-012). Os `.claude/agents/` só carregam a partir da raiz (é a mesma constatação
que já tinha descartado `projetos/<nome>/.claude/` na decisão de 2026-07-21), então é de
lá que dá para despachar o agente REAL. O preço é que o confinamento deixa de vir de
graça pelo `cwd` e passa a ser explícito no texto do despacho.

Editar `_gestao/equipe.json` pela web é a **quarta exceção deliberada** à regra "o painel
nunca escreve nos arquivos da fábrica", junto de `ANALISE.md`, `ci.json` e a importação de
projetos. A validação da escrita reusa as regras da leitura (`fabrica/equipe.ts`), com
teste que grava e relê para provar que não divergiram.
**Motivo:** pedido do usuário — dar visibilidade e gestão fina por projeto, mantendo a
auto-estruturação pela equipe de especialistas. Antes só existiam os dois extremos
(/ideia planeja tudo, /trabalhar executa tudo) e os agentes eram inalcançáveis
isoladamente; `/manutencao` e `/encerrar-dia` nem aceitavam projeto.
**Quem:** usuário + orquestrador

## 2026-07-29 — Onde cortar custo e, principalmente, onde NÃO cortar (T-042)
**Decisão:** o corte de custo tem escopo fechado em três frentes, e o resto do gasto fica
declarado como legítimo — para não virar alvo da próxima rodada de "otimização".

*Cortado:*
1. **`effort: medium` só nas três ações mecânicas** — `/status`, `projeto:conferir` e
   `projeto:progresso`. Validar frontmatter, ler estado e consolidar um arquivo de texto
   não usam profundidade de raciocínio.
2. **Requisição idêntica em voo vira uma só** (`useDados`). Sem TTL, de propósito: cache
   com validade serviria dado velho depois de uma gravação (equipe editada, `ci.json`
   salvo), e trocar 3 requisições locais por uma tela que mente é mau negócio.
3. **Canal SSE único de verdade** (`useJobsAoVivo`). A regra "uma conexão por página"
   existia desde a T-016 e estava quebrada: o `App` assina para o selo do cabeçalho e a
   página assinava de novo. O estado saiu do hook e foi para o módulo, com
   `useSyncExternalStore` — a conta deixou de depender da disciplina de quem chama.

*Declarado legítimo — não cortar sem medir de novo:*
- **`effort` padrão (`high`) em todo fluxo de julgamento**: executor, testador, revisor,
  planejador, documentador, pesquisador, marco de fase, análise. O gasto que mais pesa
  nesta fábrica é RETRABALHO (log de 2026-07-28), e um ciclo reprovado custa mais que a
  diferença de esforço de vários fluxos. Economizar aí é trocar centavos por dólares.
- **`maxBudgetUsd: null`**: informacional por decisão da T-019, não esquecimento.
- **Suíte completa uma vez por ciclo no testador**: duplicação já foi eliminada; o que
  sobrou é verificação real.
- **Resumidor em haiku com `tools: []`** (T-039): já está no piso, US$ 0,0019 por resumo.
- **Custo por ação exibido no cartão** (T-040): a leitura da lista de jobs é uma passada
  só; o valor de saber o preço antes de clicar paga o resto.

**Medido, não estimado** (página do projeto, build de produção, navegador real):
requisições ao abrir **15 → 8**, sem nenhuma duplicata (`/api/fabrica` 4→1,
`/api/acoes-projeto` 2→1, `/api/eventos` 2→1, `/api/jobs` 2→1, `/api/inputs` 2→1).
Página de Jobs: 3 requisições. Custo por cartão: **6–7× mais rápido** (1000 jobs,
6,83 ms → 0,98 ms por render), com conferência de equivalência de valor em cada tamanho.
**Motivo:** pedido do usuário de equilibrar custo e desempenho sem perder desempenho. A
metade "não cortar" é a parte que costuma faltar: sem ela, a próxima auditoria refaz o
trabalho e acaba cortando onde dói.
**Quem:** usuário + orquestrador
