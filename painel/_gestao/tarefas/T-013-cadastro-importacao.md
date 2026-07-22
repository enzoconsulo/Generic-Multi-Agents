---
id: T-013
titulo: Cadastro de projetos pela web — criar via fábrica e importar pasta existente
projeto: painel-fabrica
status: backlog
prioridade: media
dependencias: [T-011, T-012]
areas: [servidor/src/projetos/, servidor/src/rotas/cadastro.ts, servidor/test/cadastro/]
tentativas: 0
criada: 2026-07-21
atualizada: 2026-07-21
---

## Objetivo
O usuário nunca manuseia pastas: criar projeto novo já existe via ação novo-projeto
(T-011); esta tarefa adiciona a importação de pasta existente — o backend valida,
copia para `projetos/<nome>/`, garante git + `_gestao/` mínimos e dispara a análise
automaticamente.

## Contexto
- Decisão registrada (DECISOES.md 2026-07-21): importar = COPIAR para dentro de
  `projetos/` (nunca symlink/caminho externo).
- `POST /api/projetos/importar` `{ caminho, nome? }`:
  1. Validar: caminho absoluto, existe, é diretório, NÃO está dentro da própria
     `projetos/` (se já estiver, responder orientando que o projeto já é da fábrica) e
     não é a raiz da fábrica nem ancestral dela;
  2. Nome: do request ou derivado da pasta, normalizado para kebab-case; se
     `projetos/<nome>` já existe → 409, NUNCA sobrescrever;
  3. Copiar recursivamente ignorando `node_modules` (preservar `.git` se houver;
     senão `git init` + commit inicial `chore: importado pelo painel-fabrica`);
  4. Criar o que faltar de `_gestao/` a partir de `_sistema/templates/` da fábrica
     (DECISOES.md, PROGRESSO.md com entrada datada "importado pelo painel", pastas
     `tarefas/` e `pesquisas/`, CLAUDE.md do projeto a partir do template) — sem
     sobrescrever nada existente;
  5. Enfileirar automaticamente o job de análise (T-012) do projeto importado.
- Cópia pode demorar: executar como job NÃO-Claude (`usaClaude: false`, lock
  `projeto:<nome>`) para aparecer no console com progresso; a análise entra na fila na
  sequência.
- Testes: pasta temporária como origem + fábrica falsa temporária como destino
  (override `FABRICA_RAIZ`); incluir origem com `.git` e origem sem `.git`.

## Critérios de aceite
- [ ] Importar pasta de teste (fora da fábrica) resulta em `projetos/<nome>/` com o
      conteúdo copiado SEM `node_modules`, com `.git` (preservado ou inicializado) e
      `_gestao/` completo criado sem sobrescrever arquivos que já existiam.
- [ ] Job de análise do projeto importado entra na fila automaticamente (visível em
      `GET /api/jobs`).
- [ ] Caminho inexistente ou relativo → 400; nome já usado → 409; tentar importar a
      raiz da fábrica ou algo dentro de `projetos/` → 400 com explicação em PT-BR.
- [ ] Projeto importado aparece em `GET /api/projetos` imediatamente após a cópia.
- [ ] `npm test` passa (tudo com pastas temporárias; sem rede/login).

## Notas de execução


## Verificação


## Revisão

