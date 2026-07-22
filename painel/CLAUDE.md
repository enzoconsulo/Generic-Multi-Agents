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
- Testes: Vitest (+ supertest); testes que exigem login real do Claude ficam no script
  separado `teste:integracao` (nunca no `npm test`).

## Como rodar
- Instalar dependências (uma vez): `npm install` na raiz do projeto.
- **Desenvolvimento** (recarrega ao salvar): `npm run dev` — sobe o servidor (tsx watch,
  127.0.0.1:8765) e a web (Vite, http://localhost:5173 com proxy de `/api`). Abrir a 5173.
- **Produção local** (build + servir tudo numa porta só): `npm run build` e depois
  `npm start` → abrir **http://127.0.0.1:8765**.

## Como testar
- Suíte completa: `npm test` (Vitest no servidor + na web).
- Testes que exigem login real do Claude: `npm run teste:integracao` (fora do `npm test`).

## Arquitetura em 1 minuto
- `servidor/` — Express 5 (TS estrito, ESM). `src/config.ts` resolve a raiz da fábrica
  (`../../`); `src/agregador-rotas.ts` carrega cada arquivo de `src/rotas/` que exporta
  `{ prefixo, router }`. `src/fabrica/` é o LEITOR somente-leitura (frontmatter de tarefas,
  PLANO, ideias, logs) — fonte de dados de tudo. `src/jobs/` é o motor de fila (locks de
  concorrência, persistência em `dados/`, cancelamento) — pronto, mas o disparo real dos
  fluxos ainda não está ligado à UI.
- `web/` — React 18 + Vite (TS estrito). `src/lib/` (helper de fetch, tipos espelhando a
  API, hook `useDados`, formatação); `src/componentes/` (indicadores reusáveis);
  `src/paginas/inicio` (panorama + ações + projetos) e `src/paginas/projeto` (kanban,
  plano, análise, decisões, progresso). Tema dark em `src/estilos.css`.
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
<coisas que já causaram problema e como evitar>
