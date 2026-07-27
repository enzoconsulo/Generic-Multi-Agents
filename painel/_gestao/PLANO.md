# Plano — painel-fabrica

Construir primeiro um painel somente-leitura sobre o estado real da fábrica (valor
imediato e fundação de dados), depois o motor de execução de fluxos via Agent SDK
(jobs, SSE, inputs, cadastro, análise) e por fim CI local, robustez e polimento. O spike
de autenticação do SDK abre o projeto por ser o maior risco técnico.

## Fase 1 — Fundação (painel somente-leitura)
Meta: servidor + SPA rodando localmente; home com as 6 ações da fábrica descritas e a
lista real de projetos; página de projeto com kanban de tarefas, plano/marcos, decisões
e progresso — tudo lido dos arquivos da fábrica, sem executar nada. Spike do SDK
validado (autenticação por assinatura + streaming + cancelamento).
Marco: pendente
Tarefas: T-001, T-002, T-003, T-004, T-005, T-006

## Fase 2 — Execução de fluxos (jobs, agentes e cadastro)
Meta: disparar pelas telas os fluxos reais da fábrica com log ao vivo (SSE), fila com
locks de concorrência, inputs pendentes respondidos pela UI, cancelamento,
cadastro/importação de projetos pela web e análise de ponta a ponta persistida em
`_gestao/ANALISE.md` do projeto analisado.
Marco: aprovado 2026-07-27
Tarefas: T-007, T-008, T-009, T-010, T-011, T-012, T-013, T-014, T-015, T-016

## Fase 3 — CI local, robustez e polimento
Meta: pipeline instalar → lint → testes → build por projeto com log ao vivo e config
editável pela UI; watchdog, guardrails e recuperação pós-reinício; UX final consistente
e documentação completa (README + CLAUDE.md do projeto).
Marco: pendente
Tarefas: T-017, T-018, T-019, T-020

<!-- Linha "Marco:": o orquestrador registra ali o resultado da verificação de fase —
     pendente | aprovado AAAA-MM-DD | reprovado AAAA-MM-DD (correções: T-NNN, ...) -->
