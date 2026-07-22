# Decisões — painel-fabrica

Registro apenas-adição (nunca apagar; decisão revertida ganha nova entrada dizendo isso).
Formato de cada entrada:

## AAAA-MM-DD — <título da decisão>
**Decisão:** <o que foi decidido>
**Motivo:** <por quê; qual alternativa foi descartada e por quê>
**Quem:** <planejador | executor (T-NNN) | orquestrador | usuário>

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
