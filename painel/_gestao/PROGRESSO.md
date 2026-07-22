# Progresso — painel-fabrica

Diário do projeto, entradas mais recentes NO TOPO. Formato:

## AAAA-MM-DD
<o que avançou, estado atual, próximos passos visíveis — 3–6 linhas>

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
