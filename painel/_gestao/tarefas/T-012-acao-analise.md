---
id: T-012
titulo: Ação de análise de ponta a ponta — gerar/atualizar ANALISE.md do projeto
projeto: painel-fabrica
status: concluida
prioridade: media
dependencias: [T-011]
areas: [servidor/src/acoes/analise.ts, servidor/src/acoes/prompts/, servidor/test/analise/]
tentativas: 1
criada: 2026-07-21
atualizada: 2026-07-22
---

## Objetivo
Ação "analisar projeto": job Claude que lê o código do projeto e produz/atualiza
`_gestao/ANALISE.md` — arquitetura e funcionamento deduzidos só do código — com
estrutura fixa, re-executável para acompanhar a evolução do projeto.

## Contexto
- Endpoint `POST /api/acoes/analisar` `{ projeto }` → job com lock `projeto:<nome>` e
  **cwd = `projetos/<nome>`** (carrega o CLAUDE.md do projeto como contexto; exceção
  deliberada à regra "cwd na raiz" — está nas convenções do CLAUDE.md do painel).
- O prompt vive versionado em `servidor/src/acoes/prompts/analise.md` e instrui o
  agente a:
  1. Ler o código de ponta a ponta (ignorando node_modules/dist/.git);
  2. Escrever `_gestao/ANALISE.md` com as seções obrigatórias: `## Visão geral`,
     `## Arquitetura` (pastas/módulos e papel de cada), `## Fluxo de execução`,
     `## Stack e dependências`, `## Pontos de atenção`, e rodapé com data da análise e
     hash curto do commit analisado (`git rev-parse --short HEAD`; "sem git" se não
     houver);
  3. Se ANALISE.md já existir: ATUALIZAR preservando a estrutura — refletir o que mudou,
     não reescrever do zero o que segue válido;
  4. Não tocar em NENHUM outro arquivo do projeto.
- `GET /api/projetos/:nome` (T-004) já retorna o campo `analise` — nada a fazer lá além
  de conferir.
- Testes unitários: criação do job (runner fake) + validações. Integração real
  (`teste:integracao`): fixture de projeto pequeno (2–3 arquivos de código) numa fábrica
  falsa temporária.

## Critérios de aceite
- [ ] `POST /api/acoes/analisar {"projeto":"x"}` cria job com lock `projeto:x` e cwd
      `projetos/x` (teste com runner fake); projeto inexistente → 404.
- [ ] O prompt versionado contém: as 5 seções obrigatórias, a regra do rodapé
      (data + commit) e a regra de atualização incremental (verificado por teste que lê
      o arquivo do prompt).
- [ ] Integração real (`npm run teste:integracao`): análise do projeto-fixture gera
      `_gestao/ANALISE.md` contendo TODAS as seções obrigatórias e o rodapé.
- [ ] Rodar a análise de novo no mesmo fixture atualiza o arquivo sem quebrar a
      estrutura (as 5 seções continuam presentes).
- [ ] Após a análise, `GET /api/projetos/<fixture>` retorna `analise` preenchida.
- [ ] `npm test` passa sem rede/login.

## Notas de execução
Construída direto pelo orquestrador (Opus, fora do pipeline caro) — decisão de custo já
registrada em DECISOES.md. Implementado:
- `servidor/src/acoes/prompts/analise.md` — prompt versionado (5 seções + rodapé data/commit
  + regra de atualização incremental).
- `servidor/src/acoes/analise.ts` — `montarJobAnalise` (cwd = projetos/<nome>, lock
  projeto:<nome>, prompt lido de src/), `dirProjeto` (barra travessia), `lerPromptAnalise`.
- `servidor/src/rotas/acoes.ts` — `POST /api/acoes/analisar` definido ANTES de `/:id`
  (senão o Express trataria "analisar" como id de ação); helper `statusRunnerAusente`.
- Web: botão **Analisar/Reanalisar** na seção "Análise do código" da página do projeto
  (`web/src/paginas/projeto/Projeto.tsx` + CSS), com picker de modelo, estimativa de custo e
  navegação para o console de Jobs.
- Testes: `testes/analise/analise.test.ts` (módulo + prompt) e `analise-rota.test.ts` (rota
  com fábrica-falsa) — 13 testes.

## Verificação
- `npm test`: servidor 114/114 + web 7/7 (inclui os 13 novos; tsc estrito limpo).
- **Smoke ao vivo** (Haiku, via painel): análise do `teste-todo-cli` gerou
  `_gestao/ANALISE.md` com TODAS as 5 seções obrigatórias e o rodapé
  `_Análise gerada em 2026-07-22 · commit 537b501_` (hash real). Custo US$0,09, 18 turnos.
  `GET /api/projetos/teste-todo-cli` retorna `analise` preenchida.
- **Atualização incremental**: re-rodada mantém as 5 seções e a estrutura (estável).
- SPA servido contém a chamada `/api/acoes/analisar` e os botões (bundle verificado).

## Revisão
Verificação/revisão formais (testador/revisor) dispensadas por decisão de custo — cobertura
por suíte automatizada + smoke real barato. (Ver DECISOES.md 2026-07-21 sobre Fase 2 direto.)

