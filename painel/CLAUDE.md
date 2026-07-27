# painel-fabrica

Interface web local ("cockpit") para orquestrar a fábrica de software multi-agente:
painel por projeto, ações da fábrica via botões, análise de código persistida e CI/CD
visível — o usuário nunca manuseia pastas manualmente.

Este painel é a **ferramenta de sistema** (cockpit) da fábrica Gerador_de_projetos e vive
na raiz dela (`<fabrica>/painel/`), versionado no repositório do sistema — não é um projeto
comum sob `projetos/`. Gestão (especificação, plano, tarefas, decisões) em `_gestao/`; o
protocolo de tarefas está em `../_sistema/PROTOCOLO_TAREFAS.md`. Trabalhe em português (BR).

## Stack
- Node.js 22+ / TypeScript estrito; monorepo npm workspaces: `servidor/` e `web/`.
- Backend: Express 5, escutando SOMENTE em 127.0.0.1:8765; SSE nativo (sem lib);
  sem banco — estado lido dos arquivos da fábrica; dados operacionais em `dados/`
  (descartável, fora do git). Frontmatter com `gray-matter`.
- Integração Claude: `@anthropic-ai/claude-agent-sdk` com versão PINADA (sem `^`) —
  ver `_gestao/pesquisas/2026-07-21-claude-code-headless.md` e DECISOES.md.
- Frontend: React 18 + Vite + TS, react-router; CSS puro com variáveis, dark mode
  padrão, tudo em PT-BR.
- Testes: Vitest (+ supertest). `npm test` NUNCA usa rede nem login (SDK falsificado,
  relógio injetado no watchdog). `teste:integracao` roda o teste PAGO do `canUseTool`
  contra o SDK real (`servidor/integracao/`, fora de `testes/` para não cair no `npm test`).

## Como rodar
- Instalar dependências (uma vez): `npm install` na raiz do projeto.
- **Desenvolvimento** (recarrega ao salvar): `npm run dev` — sobe o servidor (tsx watch,
  127.0.0.1:8765) e a web (Vite, http://localhost:5173 com proxy de `/api`). Abrir a 5173.
- **Produção local** (build + servir tudo numa porta só): `npm run build` e depois
  `npm start` → abrir **http://127.0.0.1:8765**.

## Como testar
- Suíte completa: `npm test` (tsc estrito + Vitest no servidor e na web). Sem rede/login.
- `npm run teste:integracao`: **gasta a assinatura de verdade** (~US$0,01 no Haiku) e
  exige Claude Code logado. Valida o `canUseTool` ponta a ponta contra o SDK real:
  pendência criada → job pausa → resposta destrava → fluxo conclui. Validado em
  2026-07-27.

## Arquitetura em 1 minuto
- `servidor/` — Express 5 (TS estrito, ESM). `src/config.ts` resolve a raiz da fábrica
  (`../`, sobrescrevível por `FABRICA_RAIZ`) e o `dados/` (`DADOS_DIR`);
  `src/agregador-rotas.ts` carrega cada arquivo de `src/rotas/` que exporta
  `{ prefixo, router }`. `src/fabrica/` é o LEITOR somente-leitura (frontmatter de tarefas,
  PLANO, ideias, logs) — fonte de dados de tudo. `src/jobs/` é o motor de fila (locks,
  persistência em `dados/`, cancelamento, inputs pendentes) com `claude/` (runner do Agent
  SDK) e `robustez/` (watchdog de inatividade + guardrails por ação). `src/ci/` é o motor
  de CI local: `ecossistemas.ts` detecta a stack por arquivo-marcador (Node, Python, Go,
  Rust, .NET, Maven, Gradle) e deduz os comandos; `config.ts` grava em `_gestao/ci.json`
  do projeto; `processo.ts` roda com timeout e kill de árvore.
  `src/acoes/` traduz ação da fábrica → job e guarda o prompt da análise.
- `web/` — React 18 + Vite (TS estrito). `src/lib/` (helper de fetch, tipos espelhando a
  API, `useDados`, `useJobsAoVivo` = o canal SSE, formatação); `src/componentes/`;
  `src/paginas/inicio` (panorama + ações + projetos), `src/paginas/projeto` (ações, CI/CD,
  kanban, plano, análise, decisões, progresso) e `src/paginas/jobs` (console ao vivo).
  Tema dark em `src/estilos.css`.
- Estado é sempre derivado dos arquivos da fábrica na hora da consulta; `dados/` guarda só
  histórico operacional (descartável, fora do git).

## Convenções
- Rotas do servidor: cada arquivo em `servidor/src/rotas/` exporta `{ prefixo, router }`
  e é carregado dinamicamente pelo agregador — tarefa nova adiciona ARQUIVO novo, nunca
  edita arquivo compartilhado (preserva paralelismo de `areas`).
- Páginas da SPA: cada página vive em `web/src/paginas/<nome>/`; o esqueleto de rotas e
  placeholders é criado na fundação para as tarefas de UI só tocarem a própria pasta.
- Raiz da fábrica resolvida a partir da localização do painel (`../../`), sobrescrevível
  por env `FABRICA_RAIZ` (testes usam fábricas falsas em pastas temporárias).
- O painel NUNCA escreve status de tarefa/projeto: quem escreve nos arquivos da fábrica
  são os fluxos Claude disparados; exceções deliberadas: `_gestao/ANALISE.md` (via job de
  análise), `_gestao/ci.json` (editor de CI) e a importação de projetos.
- Textos de UI e mensagens de erro sempre em PT-BR.

## Armadilhas conhecidas
Coisas que JÁ causaram problema aqui — cada uma custou uma sessão para descobrir.

- **`gray-matter` sem options envenena o cache.** Chame SEMPRE `matter(texto, {})`: sem o
  objeto de options ele cacheia ANTES do parse, e um YAML inválido faz as chamadas
  seguintes com o mesmo conteúdo retornarem "sucesso" com `data` vazio.
- **`_gestao/` pode não existir.** Nem todo diretório sob `projetos/` passou pelo
  `/novo-projeto` ou pela importação — pasta clonada à mão é projeto válido para o leitor.
  Quem escreve em `_gestao/` precisa de `mkdir` recursivo antes (isso já derrubou a config
  de CI com ENOENT/500).
- **Corrigir o teste até passar esconde o bug.** O ENOENT acima ficou mascarado porque o
  fixture do teste foi "consertado" criando a pasta, em vez de o código ser corrigido. Se
  um teste falha, primeiro pergunte se ele está certo e o código errado.
- **Falha que se repete em TODA execução não é flaky.** Um teste de cancelamento foi
  dispensado como "flaky pré-existente" por horas; na verdade usava um runner fake de ~2ms
  e perdia sempre a corrida com o HTTP do supertest. Abra o teste antes de rotular.
- **I/O sob OneDrive é lento e intermitente** (o repo vive em `Documents\`). Já causou
  EBUSY/EPERM na persistência e timeouts em cascata na suíte. Por isso `testTimeout` global
  de 15s no `servidor/vitest.config.ts` e persistência não-fatal na fila.
- **Windows: `npm` é `npm.cmd`.** Spawn precisa de `shell: true`, e matar o processo não
  basta — o `node.exe` filho fica órfão. Use `taskkill /PID <pid> /T /F` (é o que
  `ci/processo.ts` faz).
- **Eventos emitidos no construtor do gerenciador se perdem**: o hub SSE só conecta depois
  (`inicializar.ts`). Por isso o saneamento de boot é publicado por
  `publicarSaneamentoDeBoot()`, chamado APÓS `hub.conectar`.
- **`sessionId` só no fim é inútil.** Ele é gravado no `system/init` via `ctx.anotar` —
  esperar o `result` significaria ter o dado só quando a retomada não importa mais.
- **Uma conexão SSE por página.** `Projeto.tsx` chama `useJobsAoVivo()` uma vez e passa o
  estado para baixo (ex.: `SecaoCi`). Abrir uma segunda quebra a decisão de canal único.
- **Navegador NÃO dá caminho absoluto de pasta.** `webkitdirectory` e
  `showDirectoryPicker()` entregam os arquivos e escondem onde eles estão. Por isso o
  seletor de pasta da importação roda no BACKEND (`projetos/seletor-pasta.ts`) — só é
  possível porque o painel é local. Ao mexer nele: `-STA` obrigatório, `OutputEncoding`
  UTF-8 (acento no caminho), Form `TopMost` como owner (senão abre atrás do navegador) e
  cadeado liberado em `finally`.
- **A fábrica constrói QUALQUER stack — não presuma Node.** Já aconteceu duas vezes: o CI
  só sabia `npm` (projeto Python/Go/Rust ficava sem pipeline) e a importação só ignorava
  `node_modules` (arrastava `.venv/`, `target/`). Ao tocar em CI/importação, use
  `ci/ecossistemas.ts` e `PASTAS_IGNORADAS` em vez de cravar um comando de ecossistema.
- **Comando "seguro" não testa permissão.** `echo`/`ls` são auto-aprovados pelo
  classificador ANTES de chegar ao `canUseTool` — testar com eles dá falso negativo ("o
  callback está quebrado"). Gatilho confiável: ação genuinamente barrada, como escrever
  num caminho FORA do cwd (o SDK documenta isso em `blockedPath`).
- **Um `/trabalhar` no chat e outro no painel se atropelam.** Os locks do painel não
  enxergam sessões interativas do terminal.
