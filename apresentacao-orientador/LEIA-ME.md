# Apresentação ao orientador

| O quê | Onde |
|---|---|
| **Apresentação principal** (19 slides, com notas do apresentador) | `apresentacao-principal.pptx` |
| **Guia do merge de etapa** (para você ou um chat novo seguir) | `../TCC-MERGE-DE-ETAPA.md` |
| **Apresentação de cada etapa** (Word em paisagem, 8–14 páginas, uma ideia por página — é o material principal de cada apresentação) | `relatorios-por-etapa/E1…E7.docx` — os mesmos que estão em `docs/etapas/` de cada branch |
| **Roteiro de estudo de cada etapa** (página HTML para estudar antes de apresentar: conceitos, diagramas, perguntas prováveis) | `roteiros-de-estudo/index.html` — fonte em `roteiros-de-estudo/fonte/E*.md` |
| **Repositório do TCC** (código em inglês, uma branch por etapa) | `projetos/fabrica-tcc/` |

## O repositório `projetos/fabrica-tcc`

```
main ── etapa/e1-planejamento ── etapa/e2-fundacao ── etapa/e3-agente ── etapa/e4-linha-de-producao
        ── etapa/e5-paralelismo ── etapa/e6-memoria ── etapa/e7-painel
```

- Cada branch nasce da anterior e tem um commit (ou poucos) por tarefa, em inglês, com a chave da
  tarefa no fim: `feat(tools): confine every file and command path to the project root (FAB-302)`.
- Cada branch fecha com a verificação completa verde (`mix factory.ci`, 6 estágios).
- **No dia da apresentação de uma etapa:** `git checkout main && git merge --no-ff etapa/eN-...`.
  Como as branches são encadeadas, cada merge traz só o que a etapa acrescentou.
- Ainda não tem remoto. Para publicar: crie o repositório vazio no GitHub e rode
  `git remote add origin <url>` e `git push origin main etapa/e1-planejamento` (as demais branches
  quando quiser — elas aparecem no GitHub como branches à parte).

| Branch | Commits na etapa | Tarefas | Situação da entrega |
|---|---|---|---|
| `etapa/e1-planejamento` | 6 | FAB-101…105 | entregue; projetos de teste a validar |
| `etapa/e2-fundacao` | 11 | FAB-201…205 | entregue |
| `etapa/e3-agente` | 14 | FAB-301…306 | entregue |
| `etapa/e4-linha-de-producao` | 17 | FAB-401…408 | entregue |
| `etapa/e5-paralelismo` | 11 | FAB-501…506 | entregue |
| `etapa/e6-memoria` | 10 | FAB-601…606 | **marco bloqueado** |
| `etapa/e7-painel` | 15 | FAB-701…708 | **marco em andamento** |

Dentro do repositório:

- `docs/planejamento/` — requisitos, arquitetura (com diagramas), critérios, projetos de teste, plano, estado da arte.
- `docs/tasks/pt/` e `docs/tasks/en/` — as tarefas no estilo Jira, uma página curta cada, com status.
- `docs/etapas/` — o relatório Word da etapa (cada branch tem os das etapas até ela).

## Roteiro sugerido (≈ 10 min)

| Tempo | Slides | O que mostrar |
|---|---|---|
| 1 min | 1–3 | a tese (a regra mora na estrutura) e a régua de 8 critérios |
| 1 min | 4–7 | o plano em cascata, as branches, o panorama e onde cada etapa entra no sistema |
| 5 min | 8–14 | uma etapa por slide: proposta do plano × o que foi entregue — foco na etapa do dia |
| 2 min | 15–17 | crescimento, retrabalho e os requisitos |
| 1 min | 18–19 | o que não está pronto e o próximo passo |

Demonstrações (na pasta do repositório, com o Postgres de pé):

```
mix test test/factory/milestone_e2_test.exs     # E2 — sem rede e sem cota
mix run priv/probes/milestone_e3_agent.exs      # E3 — agente real (~17 mil tokens da cota)
mix test test/factory/milestone_e4_test.exs     # E4 — reprovada, refeita, concluída
mix test test/factory/milestone_e5_test.exs     # E5 — três em paralelo, matar um
mix factory.ci                                  # tudo
```

## Regerar

`_gerador_tcc/` guarda o catálogo de tarefas, os textos de cada etapa e os geradores
(Word, apresentação, quadro de tarefas). O plano e o estado da execução estão em `PLANO-REPO-TCC.md`.
O material anterior (deck em HTML e notas longas por etapa) foi retirado desta pasta e continua no
histórico do git (commit `cc664b7`).
