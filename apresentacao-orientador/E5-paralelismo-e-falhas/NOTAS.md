# E5 — Paralelismo e tolerância a falhas

**Plano:** 03/11 – 17/11/2026 · fase Desenvolvimento · no repositório: versão `v0.4`
**Entrega combinada no plano:** Três tarefas em paralelo; encerrar uma no meio não afeta as outras, e ela volta à fila.
**Situação hoje (07/10/2026 11:22):** Construída e provada (adiantada em relação ao calendário)

> Arquivo gerado por `_gerador/gerar.py` a partir do repositório real. Não edite à mão:
> edite `_gerador/conteudo.py` (texto) e rode o gerador de novo.

## O que tem nesta pasta

| item | o que é |
|---|---|
| `slides.html` | a apresentação desta etapa (abra no navegador; ← → navega) |
| `NOTAS.md` | este arquivo: o que está feito, o que falta e a próxima rodada |
| `dados.json` | os números desta etapa, extraídos do repositório |
| `tarefas/` | cópia dos arquivos de tarefa desta etapa (objetivo, critérios, verificação, revisão) |
| `arquivos/` | os 36 arquivos de código/teste desta etapa, no estado do commit `dfd4791` |
| `evidencia-marco.txt` | saída real do teste do marco, rodado nesta máquina na geração |

## O combinado × o feito

| pacote | o que é | tarefas | situação |
|---|---|---|---|
| 5.1 Supervisão | um processo supervisionado por tarefa | T-035, T-036 | T-035 concluída; T-036 concluída |
| 5.2 Fila durável | fila no banco: enfileirar e mudar estado na mesma transação | T-037 | T-037 concluída |
| 5.3 Paralelismo | áreas como exclusão mútua; limite pelo perfil de 8 GB | T-038, T-038a | T-038 concluída; T-038a concluída |
| 5.4 Limite de uso | reconhecer a parede de cota, dormir e rearmar | T-039, T-039a, T-087, T-091 | T-039 concluída; T-039a concluída; T-087 concluída; T-091 concluída |
| 5.5 Recuperação | recuperar trabalho interrompido pela árvore git | T-040 | T-040 concluída |
| Entrega Marco da etapa | três em paralelo; matar uma não derruba as outras | T-041 | T-041 concluída |

## Números (do repositório)

- tarefas: **11/11 concluídas**; aprovadas de primeira: 6; execuções por tarefa (média): 1.55
- commits das tarefas: 35 · testes nos arquivos da etapa: 347 · linhas em `lib/`: 3493
- custo medido nas rodadas do painel: US$ 70,58 em 38 despachos (dólar-equivalente de cota; tarefas feitas no chat não entram)

## Tarefas

| tarefa | título | status | execuções | concluída em | custo medido |
|---|---|---|---|---|---|
| T-035 | ABERTURA da v0.4: conferir concorrencia e numeros medidos | concluída | 1 | — | — |
| T-036 | Arvore de supervisao e registro de processos | concluída | 2 | 2026-09-03 | US$ 7,24 |
| T-037 | Fila duravel: enfileirar e mudar estado na mesma transacao | concluída | 1 | 2026-09-07 | US$ 13,36 |
| T-038 | Paralelismo com `areas` como exclusao mutua verificada | concluída | 2 | 2026-09-08 | US$ 10,66 |
| T-038a | Limite de agentes em voo pelo perfil de maquina (8 GB por padrao) | concluída | 1 | 2026-09-26 | US$ 4,91 |
| T-039 | A parede de cota: reconhecer, dormir e rearmar | concluída | 2 | 2026-09-07 | US$ 6,22 |
| T-039a | A parede de cota le a hora cheia sem minutos (resets 9am) | concluída | 1 | 2026-09-26 | US$ 2,78 |
| T-087 | `rate_limit_event` rejected com a resposta ATENDIDA não é parede de cota | concluída | 3 | 2026-10-01 | — |
| T-091 | Parede de cota real faz o piloto DORMIR e rearmar, não parar por falha | concluída | 1 | 2026-10-02 | — |
| T-040 | Recuperacao apos queda: sobras na arvore git e trabalho parcial | concluída | 2 | 2026-09-09 | US$ 15,07 |
| T-041 | MARCO da v0.4: tres tarefas em paralelo, e matar uma nao derruba as outras | concluída | 1 | 2026-09-09 | US$ 10,34 |

## Requisitos desta etapa

| req | requisito | situação | como se prova |
|---|---|---|---|
| R6 | Executar tarefas independentes em paralelo, sem disputa de arquivo | ok | três agentes em voo confirmados pelo Registry, áreas disjuntas |
| R13 | A queda de um agente não derruba os outros nem perde trabalho | ok | matar um agente: os outros seguem, o morto volta à fila sem perder consumo |

## Destaques (o que vale contar)

- Três agentes reais em voo; matar um não afeta os outros dois, e o morto volta à fila com o motivo.
- Derrubar a aplicação no meio: ao subir, o saneamento commita o trabalho parcial sem dono.
- Parede de cota do fornecedor: pausa as filas e agenda o rearme sem cancelar nada.
- Marco estável: 5 rodadas seguidas sem uma única falha (a estabilidade era o ponto).

## O que está feito / o que falta

**Pendente nesta etapa:**

- nada

**Próxima rodada:**

- Para 17/11: rodar o marco ao vivo (`mix test test/fabrica/marco_v04_test.exs`).

## Como demonstrar ao vivo

Na pasta `projetos/fabrica-v2`, com o Postgres de pé:

```
mix test test/fabrica/marco_v04_test.exs
```

Resultado na geração: **2 testes, 0 falhas** (saída completa em `evidencia-marco.txt`).
