# Especificação — painel-fabrica

## Objetivo
Cockpit web local para a fábrica de software multi-agente Gerador_de_projetos: uma
interface bonita, em PT-BR e dark mode, que mostra o estado real da fábrica (projetos,
tarefas, fases, marcos), dispara os fluxos dela por botões claros e concentra tudo que o
usuário precisa fazer — cadastrar projetos, responder inputs, acompanhar logs, rodar CI —
sem nunca manusear pastas ou terminal manualmente.

## Usuários
Um único usuário (Enzo), na própria máquina (Windows 10), navegador local. Não há
multiusuário, não há acesso remoto.

## Escopo
- Página inicial com cards das 6 ações globais da fábrica (/novo-projeto, /ideia,
  /trabalhar, /status, /encerrar-dia, /manutencao), cada um explicando o que a ação faz,
  e lista de projetos com status resumido.
- Visão dedicada por projeto: kanban de tarefas por status, plano com fases e marcos,
  decisões, progresso, análise de código e pipeline CI — nada se mistura entre projetos.
- Execução dos fluxos da fábrica via Claude Agent SDK como jobs assíncronos, com fila,
  locks de concorrência, log ao vivo (SSE), cancelamento e histórico.
- Inputs pendentes: quando um fluxo precisa de dado/aprovação do usuário, o job pausa e
  a UI mostra formulário claro; a resposta volta ao fluxo.
- Cadastro de projetos pela web: criar via fábrica (equivalente a /novo-projeto) ou
  importar pasta existente do disco (o backend copia, garante git + `_gestao/` e dispara
  a análise).
- Análise de ponta a ponta do código de cada projeto, persistida em
  `_gestao/ANALISE.md` do projeto analisado e re-executável para atualizar.
- CI local por projeto: estágios instalar → lint → testes → build, com log ao vivo,
  configuração por arquivo (`_gestao/ci.json`) editável pela UI e status persistido.

## Fora de escopo
- Autenticação, multiusuário, HTTPS, acesso fora de 127.0.0.1.
- Deploy/CD externo (nuvem, domínio, publicação) — custo externo exige o usuário.
- Editor de código no painel (não é IDE) e edição manual de tarefas/status pela UI — o
  estado das tarefas é escrito pelos agentes conforme o protocolo, o painel só exibe.
- Substituir a sessão interativa do Claude Code — o painel dispara fluxos headless; o
  chat continua existindo como alternativa.
- Parsear os transcripts JSONL internos de `~/.claude/` (formato instável; usamos apenas
  o stream/result do SDK).
- Git worktrees ou resolução de conflitos entre agentes (regras da fábrica já cobrem).
- Light mode e i18n — só dark, só PT-BR.
- Retomada automática de sessão interrompida do SDK (persistimos `session_id`+`cwd`
  para retomada manual futura, mas o painel não retoma sozinho).

## Stack
- **Node.js 22+ / TypeScript estrito** em todo o código; monorepo npm workspaces com
  `servidor/` e `web/`.
- **Backend:** Express 5 servindo somente em `127.0.0.1:8765`; SSE nativo (sem lib);
  sem banco de dados — o estado da fábrica é lido dos arquivos (fonte única de verdade)
  e os dados operacionais do painel (jobs, logs, CI) vivem em `dados/` (descartável).
  Frontmatter parseado com `gray-matter`.
- **Integração Claude:** `@anthropic-ai/claude-agent-sdk` com versão pinada (sem `^`),
  conforme pesquisa `_gestao/pesquisas/2026-07-21-claude-code-headless.md`; CLI headless
  como fallback de depuração.
- **Frontend:** React 18 + Vite + TypeScript, react-router; CSS puro com variáveis
  (dark mode padrão), sem framework CSS.
- **Testes:** Vitest (servidor e web) + supertest nas rotas; testes de integração que
  exigem login real ficam em script separado (`teste:integracao`), fora do `npm test`.

Justificativa: este painel será mantido pela própria fábrica (agentes LLM), então vale a
stack mais difundida e previsível — Express e React+Vite são o arroz-com-feijão que todo
executor domina, e Vitest unifica os testes dos dois lados. Alternativas descartadas:
Fastify (bom, mas menos ubíquo e o ganho de performance é irrelevante em localhost),
Svelte/Vue (menos material de referência para os agentes), SPA sem build (kanban + SSE +
formulários ficaria ingovernável em vanilla), SQLite (dependência nativa no Windows sem
necessidade — arquivos JSON/NDJSON bastam e mantêm tudo inspecionável).

## Requisitos funcionais
- RF-01: A página inicial exibe as 6 ações globais como cards com nome, descrição do que
  a ação faz (lida do frontmatter de `.claude/commands/*.md`) e botão de disparo.
- RF-02: A página inicial lista todos os projetos de `projetos/` com contagem de tarefas
  por status, fase atual do plano e estado do marco.
- RF-03: A página de projeto exibe kanban com as tarefas nos status do protocolo
  (backlog, pronta, em-execucao, em-teste, em-revisao, concluida, bloqueada, cancelada),
  detalhe de cada tarefa, e abas Plano (fases/metas/marcos), Decisões, Progresso,
  Análise e Pipeline.
- RF-04: Todo estado exibido é derivado dos arquivos da fábrica no momento da consulta;
  o painel não mantém status paralelo (qualquer cache é reconstruível dos arquivos).
- RF-05: Criar projeto pela web: formulário nome+descrição dispara job equivalente a
  `/novo-projeto`; o projeto aparece na lista ao concluir.
- RF-06: Importar pasta existente: o backend valida o caminho, copia para
  `projetos/<nome>/` (preservando git; ignorando node_modules), cria `_gestao/` mínimo
  quando ausente e dispara a análise automaticamente. Nunca sobrescreve projeto existente.
- RF-07: Análise de ponta a ponta persistida em `_gestao/ANALISE.md` do projeto
  analisado, com estrutura fixa e rodapé (data + commit analisado); botão re-executa e
  atualiza o arquivo.
- RF-08: Cada ação disparada vira um job assíncrono com estados
  (na-fila, executando, aguardando-input, concluido, falhou, cancelado, interrompido),
  log ao vivo via SSE e log histórico consultável.
- RF-09: A fila respeita locks: job global (ex.: /trabalhar sem escopo, /encerrar-dia)
  é exclusivo; jobs do mesmo projeto não rodam juntos; projetos diferentes rodam em
  paralelo até o teto configurável de execuções Claude simultâneas.
- RF-10: Quando um fluxo pede aprovação/dado (canUseTool/AskUserQuestion), o job pausa em
  `aguardando-input`, a UI destaca a pendência com formulário claro e a resposta retorna
  ao fluxo.
- RF-11: Qualquer job pode ser cancelado pela UI (interrupt/AbortController).
- RF-12: Histórico de jobs consultável com resultado, duração, nº de turnos, session_id e
  custo estimado (exibido como estimativa, não fatura).
- RF-13: CI por projeto: estágios instalar → lint → testes → build executados pelo
  backend com log ao vivo por estágio, status/histórico persistidos e configuração em
  `_gestao/ci.json` editável pela UI (defaults deduzidos do package.json).
- RF-14: Toda a UI em PT-BR, dark mode, com estados de carregamento/erro amigáveis.
- RF-15: O servidor escuta exclusivamente em 127.0.0.1.
- RF-16: Ao reiniciar o servidor, jobs órfãos (`executando`/`aguardando-input`) são
  marcados `interrompido` com nota; o painel volta consistente.

## Requisitos não-funcionais
- **Segurança:** bind exclusivo em 127.0.0.1; sem auth (máquina pessoal); nenhum segredo
  em repositório (chaves pedidas via input pendente não são persistidas em git).
- **Manutenibilidade:** TS estrito, módulos pequenos com responsabilidade única, testes
  unitários que rodam sem rede/login (`npm test`), versões do SDK pinadas e atualizadas
  deliberadamente.
- **Portabilidade:** desenvolvimento e verificação em Windows 10 + PowerShell; todos os
  critérios de aceite verificáveis nesse ambiente (curl.exe/navegador/npm).
- **Confiabilidade:** `dados/` é descartável — apagar a pasta não corrompe nada, apenas
  perde histórico operacional; a verdade continua nos arquivos da fábrica.
- **Desempenho:** scan de arquivos sob demanda é suficiente na escala da fábrica
  (dezenas de projetos/centenas de tarefas); sem watchers obrigatórios.

## Riscos
- **Autenticação do SDK com assinatura** (não confirmada na doc): mitigado pelo spike
  T-001 logo no início; plano B pronto — `pathToClaudeCodeExecutable` apontando para o
  `claude.exe` já logado (`%USERPROFILE%\.local\bin\claude.exe`).
- **Churn do SDK** (releases quase diários): versão pinada; upgrade só deliberado, lendo
  CHANGELOG.
- **Runs longas/processo preso:** watchdog por inatividade + guardrails
  maxTurns/maxBudgetUsd + interrupt in-band (T-019); processos de background do agente
  podem segurar o encerramento por minutos — tolerâncias previstas nos testes.
- **Concorrência com a sessão interativa:** os locks do painel não enxergam um
  /trabalhar rodando no chat do Enzo. Mitigação: documentar claramente (não rodar os
  dois ao mesmo tempo no mesmo projeto); detecção automática fora de escopo.
- **O painel operando sobre si mesmo:** disparar /trabalhar no projeto painel-fabrica
  altera o código do servidor em execução. Mitigação: aviso destacado na UI nesse caso.
- **Node 22+ requerido** (CLI npm exige; requisito exato do SDK verificado no spike).
  Se a máquina tiver Node antigo, atualizar é pré-requisito registrado no README.
