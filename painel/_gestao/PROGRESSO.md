# Progresso — painel-fabrica

Diário do projeto, entradas mais recentes NO TOPO. Formato:

## AAAA-MM-DD
<o que avançou, estado atual, próximos passos visíveis — 3–6 linhas>

## 2026-07-27 (T-021 — seletor nativo de pasta)
**T-021 — escolher a pasta pelo diálogo do Windows na importação (concluída).** Pedido do
usuário: não querer colar caminho à mão. A parte não-óbvia é que **o navegador não resolve
isso** — `webkitdirectory` e `showDirectoryPicker()` entregam os arquivos mas escondem o
caminho absoluto, e a importação copia no servidor. O que destrava é o painel ser LOCAL:
quem abre o diálogo é o backend (`powershell.exe -STA` + `FolderBrowserDialog`). Botão
"Escolher…" ao lado do campo, que continua funcionando para colar. Guardas: 409 se já há
diálogo aberto, 501 fora do Windows (a UI esconde o botão), cadeado liberado em `finally`
para um diálogo que falha não travar o botão para sempre. Provado ao vivo: o diálogo
ABRIU de verdade (processo aguardando clique) e a segunda chamada devolveu 409 sobre HTTP.
Suíte: **servidor 209/209** (+5) **+ web 14/14**.

## 2026-07-27 (canUseTool validado — pendência de 6 dias fechada)
**A integração real do `canUseTool` com o SDK, pendente desde 2026-07-21, foi VALIDADA em
execução paga.** O `teste:integracao` deixou de ser um `echo` placeholder e virou o teste
de verdade (`servidor/integracao/canusetool.ts`, fora de `testes/`). Provado ponta a
ponta: `permissionMode: "default"` → SDK chama o callback → runner cria a pendência → job
pausa em `aguardando-input` → resposta "aprovado" destrava → fluxo conclui e o arquivo é
escrito. **Armadilha que custou uma rodada:** a 1ª tentativa usava `echo` via Bash e saiu
INCONCLUSIVA — comando trivialmente seguro é auto-aprovado pelo classificador antes de
chegar ao `canUseTool`. O gatilho confiável é escrever FORA do cwd (o SDK documenta em
`blockedPath`). Registrado em DECISOES.md e nas armadilhas do CLAUDE.md, porque quem for
escrever o próximo teste de permissão vai instintivamente usar `echo` e concluir errado
que o callback está quebrado. **Custo real: US$ 0,048 (~R$ 0,27) nas duas rodadas.**

## 2026-07-27 (T-020 — projeto completo)
**T-020 — polimento e documentação (concluída). As 20 tarefas do painel estão fechadas;
Fase 3 aprovada.** Achado real de UX: a tela de Jobs não tinha estado de erro — com o
backend fora ela dizia "Nenhuma execução ainda", mandando o usuário procurar o problema
no lugar errado; o hook SSE passou a expor `carregando`/`erro`. Estado vazio da home
trocado por orientação com os dois caminhos de primeiro passo. Documentação: o CLAUDE.md
afirmava que os jobs "ainda não estão ligados à UI" (falso desde a Fase 2) e que os testes
com login real ficam em `teste:integracao` — que **é um placeholder que não roda nada**;
corrigido nos dois arquivos. README do painel tinha 3 linhas: reescrito com requisitos,
como rodar/testar, envs, arquitetura e avisos operacionais (inclusive retomada manual via
`sessionId` + `cwd`). "Armadilhas conhecidas" saiu do placeholder para 10 armadilhas
reais, cada uma de um bug que custou tempo. Zero literais em inglês na UI.
Suíte: **servidor 195/195 + web 14/14**, build limpo. Guardrail da T-019 provado ao vivo
(`/status` sai com `maxTurns: 40`). **Pendências que sobrevivem ao projeto:** verificação
visual em navegador (não há navegador no ambiente) e a validação PAGA do `canUseTool`.

## 2026-07-27 (T-019)
**T-019 — robustez de execução (concluída).** Módulo novo `servidor/src/jobs/robustez/`:
**watchdog** de inatividade que interrompe fluxo Claude travado (conta do último evento,
não do início; `aguardando-input` não conta — esperar humano não é travar; jobs não-Claude
ficam de fora porque o CI já tem timeout próprio), **guardrails** por ação data-driven
(`/trabalhar` 200 turnos, `/status` 40, desconhecida cai no padrão — nenhum fluxo sobe sem
teto) e **recuperação de boot** completa: job pendurado → `interrompido` com transição
agora publicada no SSE (antes era emitida no construtor, sem ninguém escutando), pendência
de input aberta é fechada (parava de mentir "aguardando resposta" para sempre) e histórico
de CI deixado como `executando` é reconciliado para `interrompido`. Núcleo ganhou
`interromper()` (irmão de `cancelar`, mas decisão do sistema, não do usuário) e
`ctx.anotar()`, que grava `sessionId`/`cwd` no `system/init` — antes o `sessionId` só
existia no job concluído, isto é, nunca quando a retomada manual importa.
Suíte: **servidor 195/195** (+23) **+ web 14/14**. Build limpo. **Falta só a T-020**
(polimento + docs) para fechar a Fase 3 e o projeto.

## 2026-07-27 (revisão)
**Revisão dedicada do T-016/T-017/T-018 (a pedido do usuário, modelo mais forte).** Achou
e corrigiu 1 bug real, 1 regressão de UX, 1 fragilidade e 1 teste quebrado:
(1) `ci/config.ts` gravava `_gestao/ci.json` sem garantir a pasta → **ENOENT/500** em
projeto sem `_gestao/` (pasta clonada à mão); o teste original tinha sido "consertado"
criando a pasta no fixture, **mascarando o bug** — agora há `mkdir` recursivo, fixture
sem `_gestao/` e teste de regressão. (2) `useDados` zerava os dados em toda recarga: o
refetch automático fazia a página inteira piscar "Carregando…" e desmontava filhos
(perdia o editor de `ci.json` aberto) — agora só a troca de caminho zera. (3)
`recarregar` estabilizada com `useCallback` (entrava em deps de efeito e disparava a cada
evento SSE). (4) O teste de cancelamento tido como "flaky pré-existente" a sessão inteira
era um teste mal escrito (runner fake de ~2ms perdendo corrida com o HTTP do supertest) —
trocado para o runner manual. Marcos das Fases 1 e 2 registrados no PLANO.md.
**Suíte: 172/172 servidor + 14/14 web — verde de ponta a ponta pela primeira vez.**

## 2026-07-27 (continuação 2)
**T-018 — UI de CI/CD (concluída). Fase 3 completa: T-016, T-017 e T-018 fechados nesta
sessão.** Nova seção "CI/CD" na página do projeto (não é aba — a T-006 não implementou
sistema de abas): 4 estágios como cartões com estado visual e duração, log ao vivo por
estágio enquanto roda (reusa o SSE único da T-016/T-014 — `useJobsAoVivo` ganhou o slice
`estagiosCi`), destaque vermelho + tail do log em estágio que falha, editor de
`_gestao/ci.json` (checkbox + comando por estágio, timeout), histórico das últimas
execuções. Resolvido na raiz um 3º teste flaky por I/O sob OneDrive: `testTimeout: 15000`
global no vitest do servidor, em vez de caçar teste a teste. Suíte: **servidor 170/171**
(1 falha pré-existente não-relacionada) **+ web 14/14**. Build limpo. Smoke em
rede/bundle (sem navegador neste ambiente). Falta na Fase 3: T-019 (robustez — inclui
recuperar pendências de INPUT após restart, deixado de fora de propósito na T-010) e
T-020 (polimento + docs).

## 2026-07-27 (continuação)
**T-016 — ações por projeto na UI (concluída).** Página do projeto ganhou seção "Ações":
botões "Trabalhar neste projeto" e "Ver status agora" (mesmo padrão de card-expansível
da T-015), lock ao vivo (`jobAtivoDoProjeto`, via o SSE já existente da T-014) que
desabilita Trabalhar/Status/Analisar enquanto um job do projeto está ativo, com aviso
"Projeto ocupado por…" e link para `/jobs`. Refetch automático do kanban/plano/análise
quando um job do projeto termina, sem F5. Suíte: **web 14/14** (+7) + servidor
inalterado. Build limpo. Smoke feito por rede/bundle (sem navegador disponível neste
ambiente — ver nota na tarefa). Próximo: T-018 (UI de CI/CD), agora desbloqueada.

## 2026-07-27
**T-017 — motor de CI local (concluída).** Pipeline `instalar→lint→testes→build` por
projeto, rodando como job NÃO-Claude (`usaClaude:false`, escopo `projeto:<nome>` — nunca
roda junto com um fluxo Claude do mesmo projeto): `_gestao/ci.json` do projeto (defaults
deduzidos do `package.json`, script ausente = estágio `pulado` com aviso, nunca erro),
log ao vivo por estágio no SSE existente, resultado persistido em
`dados/ci/<projeto>.json` (último + histórico). Spawn próprio com timeout por estágio e
encerramento de árvore (`taskkill /T` no Windows) — sem dependência nova. Rotas
`POST /api/ci/:projeto/rodar`, `GET /api/ci/:projeto`, `GET/PUT /api/ci/:projeto/config`.
Nova env `DADOS_DIR` (mesmo padrão da `FABRICA_RAIZ`) isola os testes do `dados/` real.
Suíte: **servidor 170/171** (+36; a 1 falha é pré-existente, corrida de timing
não-relacionada) **+ web 7/7**. Retomando a Fase 3 (CI/CD): a instrução de continuação
pulava o T-016, mas o T-018 depende dele — intercalado antes do T-018 (ver DECISOES.md).

## 2026-07-22
**Agentes dinâmicos validados ponta a ponta com modelo real (Haiku), pelo painel.** Criado
projeto-teste descartável (`projetos/teste-todo-cli`, CLI Node), rodado o planejador de
verdade (gerou equipe coerente `domain`+`cli-core` e tarefas com `agente:`) e o `/trabalhar`
pelo painel. O teste pegou um bug de comportamento na fábrica (o `/trabalhar` headless não
sabia que rodava "via painel" e ignorava os especialistas) — corrigido em
`.claude/commands/trabalhar.md` (seleção determinística por `equipe.json`) e **re-validado:
T-002→`Agent → domain`, T-003→`Agent → cli-core`**, com código funcional (16 testes passando).
**Melhoria no painel:** o runner agora loga QUAL especialista foi despachado (`Agent → domain`
em vez de só `Task`) — descoberto que a ferramenta de despacho aqui é `Agent`, não `Task`.
Suíte: **servidor 101/101** (+2) **+ web 7/7**.

**T-012 — ação de ANÁLISE por projeto (concluída).** `POST /api/acoes/analisar {projeto}`
cria um job com cwd no projeto que lê o código de ponta a ponta e gera/atualiza
`_gestao/ANALISE.md` (prompt versionado em `servidor/src/acoes/prompts/analise.md`: 5 seções
+ rodapé data/commit + atualização incremental). Botão **Analisar/Reanalisar** na página do
projeto (picker de modelo + estimativa + link pro console). Smoke ao vivo (Haiku): análise do
`teste-todo-cli` com as 5 seções e rodapé por US$0,09; re-análise preserva a estrutura. Suíte:
**servidor 114/114** (+13) **+ web 7/7**.

**T-013 — cadastro/importação de projetos pela web (concluída).** Criar projeto novo já era
`/novo-projeto`; adicionada a IMPORTAÇÃO de pasta existente: `POST /api/projetos/importar`
cria um job NÃO-Claude que copia a pasta para `projetos/<nome>/` (ignorando `node_modules`,
preservando `.git` ou `git init`+commit), gera `_gestao/` mínimo dos templates (sem
sobrescrever) e enfileira a análise (lock por projeto serializa cópia→análise). Form
**"Importar pasta existente"** na home. Smoke ao vivo: pasta de teste importada com
`node_modules` ignorado, git inicializado, `_gestao/` criado, listada na API e análise
enfileirada. Suíte: **servidor 130/130** (+16) **+ web 7/7**.

**T-010 — inputs pela UI (concluída).** Mecanismo pergunta→resposta: quando um fluxo precisa
de aprovação de ferramenta (`canUseTool`) ou faz uma pergunta (`AskUserQuestion`), o job pausa
em `aguardando-input`, a pendência aparece em `GET /api/inputs` (+ evento SSE `input-pendente`)
e a resposta (`POST /api/inputs/:id/resposta`) destrava o fluxo. Registro de pendências
(`jobs/inputs.ts`), métodos no gerenciador, `ctx.pedirInput` no runner, e painel **"⏸
Aguardando você"** na página de Jobs (aprovar/negar/escolher, ao vivo pelo SSE). Autonomia
preservada: sob o `bypassPermissions` padrão o SDK não chama o callback; um disparo com
`permissionMode: default` liga as aprovações pela UI. Suíte: **servidor 135/135** (+5) **+ web
7/7**. Integração real do canUseTool com o SDK fica para `teste:integracao` (run pago).
Próximo: Fase 3 (CI/CD, T-017–020).

## 2026-07-21
Projeto criado e Fase 1 (fundação) quase fechada num único dia de trabalho. Pesquisa
técnica (Agent SDK), especificação, plano de 3 fases e backlog de 20 tarefas prontos.
Executadas com pipeline completo (executor→testador→revisor):
- T-001 spike do Agent SDK — **concluida** (login por assinatura validado headless,
  SDK 0.3.217, alias `fable`).
- T-002 esqueleto do monorepo — **concluida** (Express 5 + SPA React/Vite dark, scripts,
  Vitest; error handler e helper de API endurecidos na revisão).
- T-003 leitor do estado da fábrica — **concluida** (parsers de tarefa/plano/ideia/log
  com robustez a arquivo malformado; achada a armadilha do cache do gray-matter).
- T-004 API REST de leitura — **em-teste**, suíte verde; falta só a verificação formal.
- T-007 núcleo de jobs (fila com locks, persistência, cancelamento) — **em-teste**,
  suíte verde; falta só a verificação formal.
Suíte completa passando ao pausar: servidor 67/67, web 7/7.

**Sessão pausada a pedido do usuário (controle de custo)** e migrada para Opus 4.8.
Recomendado rodar os agentes num modelo mais econômico (Sonnet/Opus) em vez do Fable/xhigh.

**Depois da pausa — interface de leitura construída direto pelo orquestrador** (a pedido
do usuário, fora do pipeline de agentes, para conter custo): T-005 (home: panorama +
catálogo das 6 ações + projetos) e T-006 (visão por projeto: kanban de tarefas com
detalhe, plano com marcos, análise, decisões, progresso) marcadas **concluida**.
Verificação formal (testador/revisor) pulada por decisão de custo; conferido via
`npm run build` (tsc estrito + vite, 0 erro) e smoke test ao vivo do servidor + SPA + API.
**O painel já abre e é usável em modo leitura** (`npm run build && npm start` →
http://127.0.0.1:8765).

**Núcleo da Fase 2 construído direto (Opus, sem pipeline) — os botões DISPARAM de
verdade:** runner do Agent SDK (T-008), canal SSE ao vivo (T-009), rotas de ação (T-011),
página de Jobs com console em tempo real (T-014) e disparo pelos cards da home (T-015),
todos concluída. Também fechadas T-004 e T-007 (código verificado por suíte + integração
real). Suíte: servidor 87/87, web 7/7. **Prova real:** `/status painel-fabrica` disparado
pela API rodou headless (haiku), concluiu em ~63s (~US$0,14, 30 turnos) devolvendo o
painel de status real, com 35 eventos SSE ao vivo. Guardrails de custo: modelo escolhido
no disparo (default econômico `sonnet`), aviso na ação pesada, cancelamento por abort.

Falta na Fase 2: inputs pendentes via UI (T-010, hoje bypass local), ação de análise que
gera ANALISE.md (T-012), cadastro/importação de projetos (T-013) e ações por projeto
(T-016). Fase 3 (CI, robustez, polimento) intacta.

**Painel movido para a raiz da fábrica** (`<fabrica>/painel/`) como ferramenta de sistema,
versionado no repo da raiz (git antes parecia "vazio"). E **refino de UX + custo:**
estratégias de modelo data-driven com **Fable→Opus** (fallback nativo do SDK) além dos
modelos individuais; **estimativa de custo** (peso da ação × tier do modelo) na hora de
disparar; home e Jobs mais claros (o que cada ação faz, selo de peso, legenda do console).
Suíte: 90/90 (servidor) + 7/7 (web); fluxo `fable-opus` validado ao vivo (fable + fallback
opus passados ao SDK, disparo e cancelamento).

**Agentes dinâmicos sob demanda ("Equipe do projeto")** — as 4 fases do design
`_gestao/pesquisas/2026-07-21-agentes-dinamicos.md`: o planejador gera `equipe.json`
(especialistas de construção sintetizados da ideia); tarefas ganham `agente:`; o painel
injeta a equipe em `options.agents` do SDK ao rodar `/trabalhar <projeto>`; o `/trabalhar`
despacha por especialista (fallback executor); a página do projeto exibe a equipe. Testador
e revisor seguem fixos. Suíte: 99/99 (servidor) + 7/7 (web). Validado ao vivo com projeto
de exemplo: injeção dos especialistas nos params e exibição na API. Falta na Fase 2: T-010
(inputs pela UI), T-012 (análise/ANALISE.md), T-013 (cadastro/importação).
