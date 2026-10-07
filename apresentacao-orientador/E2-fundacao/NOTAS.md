# E2 — Fundação do sistema

**Plano:** 19/09 – 03/10/2026 · fase Desenvolvimento · no repositório: versão `v0.1`
**Entrega combinada no plano:** Os testes rodam sem internet e sem consumir o serviço do modelo.
**Situação hoje (07/10/2026 07:42):** Concluída — entrega aprovada

> Arquivo gerado por `_gerador/gerar.py` a partir do repositório real. Não edite à mão:
> edite `_gerador/conteudo.py` (texto) e rode o gerador de novo.

## O que tem nesta pasta

| item | o que é |
|---|---|
| `slides.html` | a apresentação desta etapa (abra no navegador; ← → navega) |
| `NOTAS.md` | este arquivo: o que está feito, o que falta e a próxima rodada |
| `dados.json` | os números desta etapa, extraídos do repositório |
| `tarefas/` | cópia dos arquivos de tarefa desta etapa (objetivo, critérios, verificação, revisão) |
| `arquivos/` | os 34 arquivos de código/teste desta etapa, no estado do commit `28f0303` |
| `evidencia-marco.txt` | saída real do teste do marco, rodado nesta máquina na geração |

## O combinado × o feito

| pacote | o que é | tarefas | situação |
|---|---|---|---|
| 2.1 Ambiente | projeto com verificação de qualidade em um comando | T-001, T-007 | T-001 concluída; T-007 concluída |
| 2.2 Banco e custo | esquema do banco e contabilidade em duas unidades | T-002, T-005 | T-002 concluída; T-005 concluída |
| 2.3 Fronteiras | fronteira do modelo e da busca, com substitutos de teste | T-003, T-004 | T-003 concluída; T-004 concluída |
| 2.4 Cópia de segurança | backup e restauração com ida-e-volta provada | T-006 | T-006 concluída |
| Entrega Marco da etapa | a suíte inteira roda sem rede e sem cota | T-009 | T-009 concluída |

## Números (do repositório)

- tarefas: **8/8 concluídas**; aprovadas de primeira: 8; execuções por tarefa (média): 1.0
- commits das tarefas: 8 · testes nos arquivos da etapa: 118 · linhas em `lib/`: 1282
- custo medido nas rodadas do painel: US$ 0,00 em 0 despachos (dólar-equivalente de cota; tarefas feitas no chat não entram)

## Tarefas

| tarefa | título | status | execuções | concluída em | custo medido |
|---|---|---|---|---|---|
| T-001 | Scaffold Phoenix com qualidade, GUIA e commit inicial | concluída | 1 | 2026-08-28 | — |
| T-007 | Verificacao continua local, com Dialyzer em estagio proprio | concluída | 1 | 2026-08-28 | — |
| T-002 | Esquema do banco: projetos, tarefas, ciclos, despachos e custos | concluída | 1 | 2026-08-28 | — |
| T-005 | Contabilidade em duas unidades: cota consumida e dolar-equivalente | concluída | 1 | 2026-08-28 | — |
| T-003 | behaviour Fabrica.Operario e o adaptador Falso | concluída | 1 | 2026-08-28 | — |
| T-004 | behaviour Fabrica.Embedder e o adaptador Falso | concluída | 1 | 2026-08-28 | — |
| T-006 | Backup e restauracao do banco | concluída | 1 | 2026-08-28 | — |
| T-009 | MARCO da v0.1: a suite roda sem rede e sem cota | concluída | 1 | 2026-08-28 | — |

## Requisitos desta etapa

| req | requisito | situação | como se prova |
|---|---|---|---|
| R10 | Contar o custo em cota consumida e em dinheiro | ok | tabela `consumos` alimentada a cada resposta; cota e US$ separados |
| R12 | Testes sem internet e sem consumir o serviço do modelo | ok | teste que FALHA se houver tráfego de rede ou chave de acesso no ambiente |

## Destaques (o que vale contar)

- A suíte roda sem internet e sem chave de acesso — e um teste falha se isso deixar de ser verdade (roda em toda verificação, para sempre).
- Custo contado em duas unidades (cota e dólar), gravado a cada resposta do modelo.
- Fronteiras do modelo e da busca com substitutos para teste: nenhum teste depende do fornecedor.
- Verificação num comando, do estágio mais barato ao mais caro: formato → compilar → estilo → testes → tipos → backup.

## O que está feito / o que falta

**Pendente nesta etapa:**

- nada

**Próxima rodada:**

- Nada pendente nesta etapa — ela segue sendo provada a cada verificação.

## Como demonstrar ao vivo

Na pasta `projetos/fabrica-v2`, com o Postgres de pé:

```
mix test test/fabrica/marco_v01_test.exs
```

Resultado na geração: **15 testes, 0 falhas** (saída completa em `evidencia-marco.txt`).
