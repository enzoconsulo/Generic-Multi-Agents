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
Marco: aprovado 2026-07-27 (retroativo — fase concluída em 2026-07-21)
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
Marco: aprovado 2026-07-27 (ressalva: verificação visual em navegador não feita — sem
navegador no ambiente; ver Verificação da T-020)
Tarefas: T-017, T-018, T-019, T-020

## Evolução contínua (T-021 a T-053) — fora da estrutura de fases

Depois do marco da Fase 3 o painel passou a ser mantido À MÃO pelo orquestrador, tarefa a
tarefa, sem fase declarada: ações por projeto, editor de equipe, watchdog por ação,
resumo dos trechos, custo/desempenho, o pipeline em código (T-051), o retrabalho
diagnosticado (T-053) e as guardas de processo. O registro dessas entregas está em
`PROGRESSO.md`, em `DECISOES.md` e nas armadilhas de `../CLAUDE.md`. Fica anotado aqui para
o plano não parecer interrompido na Fase 3.

## Fase 4 — Verificação honesta
Meta: a verificação da fábrica passa a distinguir **"a entrega falhou"** de **"eu não
consegui medir"** — hoje ela não distingue, e é a causa medida de ~75-80% do gasto de
retrabalho (US$ 51,09 em dois dias para 7 tarefas, contra US$ 1,2-1,9 do ciclo limpo).
Vale para todo projeto e toda stack, nunca para um projeto específico.
Plano detalhado, com o porquê e a evidência de cada item: **`PLANO-FASE-VERIFICACAO.md`**.
Auditoria de origem: `../../_sistema/logs/2026-08-09.md`.
Marco: pendente
Tarefas: T-054 (`inconclusivo`), T-055 (retentativa de ambiente), T-056 (suíte uma vez por
ciclo), T-057 (linha-base do critério), T-058 (replanejar cedo), T-059 (dedupe + doutrina),
T-060 (custo/retrabalho visível), T-061 (memória da máquina)

<!-- Linha "Marco:": o orquestrador registra ali o resultado da verificação de fase —
     pendente | aprovado AAAA-MM-DD | reprovado AAAA-MM-DD (correções: T-NNN, ...) -->
