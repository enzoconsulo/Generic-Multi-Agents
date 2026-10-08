# E7 — Painel e automação

**Plano:** 03/12 – 17/12/2026 · fase Desenvolvimento · no repositório: versão `v1.0`
**Entrega combinada no plano:** Um projeto inteiro acompanhado na tela, do pedido à entrega, com o custo em tempo real.
**Situação hoje (07/10/2026 21:24):** Telas e automação construídas — marco final em andamento

> Arquivo gerado por `_gerador/gerar.py` a partir do repositório real. Não edite à mão:
> edite `_gerador/conteudo.py` (texto) e rode o gerador de novo.

## O que tem nesta pasta

| item | o que é |
|---|---|
| `slides.html` | a apresentação desta etapa (abra no navegador; ← → navega) |
| `NOTAS.md` | este arquivo: o que está feito, o que falta e a próxima rodada |
| `dados.json` | os números desta etapa, extraídos do repositório |
| `tarefas/` | cópia dos arquivos de tarefa desta etapa (objetivo, critérios, verificação, revisão) |
| `arquivos/` | os 49 arquivos de código/teste desta etapa, no estado do commit `d68f2f3` |
| `evidencias/` | capturas de tela das telas desta etapa |

## O combinado × o feito

| pacote | o que é | tarefas | situação |
|---|---|---|---|
| 7.1 Medidas de execução | barramento de eventos e telemetria por despacho | T-050 | T-050 concluída |
| 7.2 Quadro e console | quadro por estado e console do agente, ao vivo, com custo | T-051, T-052 | T-051 concluída; T-052 concluída |
| 7.3 Parar e retomar | um botão que encerra um processo supervisionado | T-053 | T-053 concluída |
| 7.4 Rodadas automáticas | piloto automático com teto de gasto | T-054, T-055 | T-054 concluída; T-055 concluída |
| 7.x Entregas não-código | trilha genérica e escada de prova | T-056 | T-056 concluída |
| 7.5 Segredos | varredura de segredos antes de publicar | T-057 | T-057 concluída |
| Integração Agente real de ponta a ponta | a fila sobe o agente real; custo real bate com o fornecedor | T-066, T-067, T-070, T-071, T-072, T-073, T-074, T-084, T-085, T-086, T-088, T-089 | T-066 concluída; T-067 concluída; T-070 concluída; T-071 concluída; T-072 concluída; T-073 concluída; T-074 concluída; T-084 concluída; T-085 concluída; T-086 concluída; T-088 concluída; T-089 concluída |
| Abertas Corretivas (rodando hoje) | prontas para o motor | T-092, T-093, T-094, T-095, T-096, T-097, T-098, T-102 | T-092 pronta; T-093 pronta; T-094 concluída; T-095 concluída; T-096 concluída; T-097 concluída; T-098 pronta; T-102 pronta |
| Abertura Conferir o plano | o que a tela precisa mostrar e a medição final | T-049 | T-049 backlog |
| Entrega Marco final | um projeto inteiro, sem intervenção | T-058 | T-058 bloqueada |

## Números (do repositório)

- tarefas: **24/30 concluídas**; aprovadas de primeira: 14; execuções por tarefa (média): 1.5
- commits das tarefas: 98 · testes nos arquivos da etapa: 471 · linhas em `lib/`: 7105
- custo medido nas rodadas do painel: US$ 195,96 em 111 despachos (dólar-equivalente de cota; tarefas feitas no chat não entram)

## Tarefas

| tarefa | título | status | execuções | concluída em | custo medido |
|---|---|---|---|---|---|
| T-050 | Barramento de eventos e telemetria por despacho | concluída | 2 | 2026-09-07 | US$ 12,28 |
| T-051 | Painel: quadro de tarefas por estado, ao vivo | concluída | 2 | 2026-09-08 | US$ 10,78 |
| T-052 | Painel: console ao vivo do agente e custo da rodada | concluída | 1 | 2026-09-16 | US$ 6,64 |
| T-053 | Parar e retomar: um botao que encerra um processo supervisionado | concluída | 1 | 2026-09-16 | US$ 7,48 |
| T-054 | Piloto automatico: a decisao (funcao pura) | concluída | 1 | 2026-09-16 | US$ 4,37 |
| T-055 | Piloto automatico: a mecanica e a tela | concluída | 2 | 2026-09-16 | US$ 16,63 |
| T-056 | A trilha generica e a escada de prova com rotulo obrigatorio | concluída | 1 | 2026-09-21 | US$ 13,63 |
| T-057 | Varredura de segredos antes de publicar | concluída | 2 | 2026-09-21 | US$ 7,98 |
| T-066 | Fabrica.Despacho: monta a mensagem inicial de um agente, a partir da tarefa e do papel | concluída | 2 | 2026-09-22 | US$ 10,55 |
| T-067 | A doutrina de construtor, testador e revisor, escrita para o agente real desta fábrica | concluída | 2 | 2026-09-22 | US$ 6,75 |
| T-070 | A cola: Fila.Trabalho.perform/1 sobe o agente real e fecha o laço com o Piloto | concluída | 3 | 2026-09-25 | US$ 25,98 |
| T-071 | A bateria voltou a ficar VERMELHA no Dialyzer: zerar os 12 erros acumulados | concluída | 1 | 2026-09-22 | US$ 5,74 |
| T-072 | pg_restore ao vivo (backup_test) corrompe a suite concorrente — isolar num estagio proprio | concluída | 1 | 2026-10-02 | US$ 6,07 |
| T-073 | Ferramentas REAIS do agente: ler/listar/buscar/escrever/editar/rodar, confinadas a raiz+areas | concluída | 1 | 2026-09-26 | US$ 7,05 |
| T-074 | registrar_resultado chamavel de verdade NO MEIO do laco, antes do ciclo_id existir | concluída | 1 | 2026-09-26 | US$ 8,53 |
| T-084 | O nome interno do modelo vira o ID que o `claude` de hoje aceita — no `--model` e na tabela de preços | concluída | 1 | 2026-10-01 | — |
| T-085 | O agente real não herda o CLAUDE.md dos diretórios-pai — o prefixo da fábrica é o único contexto | concluída | 1 | 2026-10-01 | — |
| T-086 | O custo de um despacho real conta a escrita de cache — o teto de gasto do piloto passa a frear de verdade | concluída | 1 | 2026-10-01 | — |
| T-088 | O Bash que o despacho real anuncia passa a ser APROVADO — o agente consegue rodar teste | concluída | 2 | 2026-10-01 | — |
| T-089 | Despacho que termina em erro ainda conta o que gastou — o consumo já medido não é descartado | concluída | 1 | 2026-10-01 | — |
| T-092 | O envelope `{:com_consumo, ...}` da T-089 chega ao contrato do Operario e à sonda do confinamento | pronta | 1 | — | — |
| T-093 | Fallback por texto da parede de cota lê só result/errors/stderr, não o stdout inteiro | pronta | 1 | — | — |
| T-094 | Piloto dormindo pela cota acorda no REARME da Cota, sem laço quente entre `reabre_em` e a folga | concluída | 1 | 2026-10-07 | US$ 13,60 |
| T-095 | Despacho que não rodou (parede de cota, sem sandbox) não é JULGADO em nenhum papel — nem avança a tarefa, nem gasta ciclo, nem aprova por omissão | concluída | 3 | 2026-10-07 | US$ 13,40 |
| T-096 | Parede de cota não conta como rodada sem concluir, e o piloto religado respeita o sono salvo | concluída | 1 | 2026-10-07 | US$ 3,77 |
| T-097 | Busca filtrada por projeto não perde trecho para tuplas mortas do índice HNSW (busca_test.exs:242) | concluída | 2 | 2026-10-07 | US$ 7,29 |
| T-098 | classe_falha_test.exs:315 (prazo estourado reexecuta UMA vez) deixa de depender do relógio | pronta | 1 | — | — |
| T-102 | console_live_test.exs:138 (parede de cota no console) deixa de depender do estado global da Cota compartilhado com outros testes | pronta | 1 | — | — |
| T-049 | ABERTURA da v1.0: o que a tela precisa mostrar, e a medicao final | backlog | 1 | — | — |
| T-058 | MARCO da v1.0: um projeto inteiro, sem intervencao | bloqueada | 1 | 2026-09-21 | US$ 7,44 |

## Requisitos desta etapa

| req | requisito | situação | como se prova |
|---|---|---|---|
| R8 | Mostrar andamento, custo e saída dos agentes, ao vivo | parcial | quadro, console e custo ao vivo existem; falta o projeto inteiro acompanhado (marco) |

## Destaques (o que vale contar)

- Quadro de tarefas e console do agente ao vivo, com o custo da rodada (capturas de tela nesta pasta).
- Piloto automático com teto de gasto e de rodadas; parar/retomar num botão.
- Custo real do despacho bate com o do fornecedor (desvio 0,0%) — antes saía de 3,6× a 27× abaixo.
- O agente real sobe pela fila, com o shell confinado em sandbox e sem herdar instruções de fora do projeto.

## O que está feito / o que falta

**Pendente nesta etapa:**

- Marco final (projeto inteiro sem intervenção) bloqueado até as corretivas abertas fecharem.
- Abertura da etapa (conferir o plano contra o código) ainda não feita.

**Próxima rodada:**

- A fábrica roda hoje as corretivas prontas.
- Depois: abertura da E7 e o marco final com teto de gasto autorizado.
