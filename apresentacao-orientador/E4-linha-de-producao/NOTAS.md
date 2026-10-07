# E4 — Linha de produção de tarefas

**Plano:** 19/10 – 02/11/2026 · fase Desenvolvimento · no repositório: versão `v0.3`
**Entrega combinada no plano:** Uma tarefa percorre os seis estados, é reprovada de propósito, é refeita e conclui.
**Situação hoje (07/10/2026 07:42):** Construída e provada (adiantada em relação ao calendário)

> Arquivo gerado por `_gerador/gerar.py` a partir do repositório real. Não edite à mão:
> edite `_gerador/conteudo.py` (texto) e rode o gerador de novo.

## O que tem nesta pasta

| item | o que é |
|---|---|
| `slides.html` | a apresentação desta etapa (abra no navegador; ← → navega) |
| `NOTAS.md` | este arquivo: o que está feito, o que falta e a próxima rodada |
| `dados.json` | os números desta etapa, extraídos do repositório |
| `tarefas/` | cópia dos arquivos de tarefa desta etapa (objetivo, critérios, verificação, revisão) |
| `arquivos/` | os 48 arquivos de código/teste desta etapa, no estado do commit `8cba027` |
| `evidencia-marco.txt` | saída real do teste do marco, rodado nesta máquina na geração |

## O combinado × o feito

| pacote | o que é | tarefas | situação |
|---|---|---|---|
| 4.1 Seis estados | máquina de estados; estado, relatório e custo numa transação | T-021, T-022, T-022a | T-021 concluída; T-022 concluída; T-022a concluída |
| 4.2 Fila e equipe | promoção por dependências; especialistas sob demanda | T-023, T-024 | T-023 concluída; T-024 concluída |
| 4.3 Critérios de aceite | critérios executados sozinhos, com allowlist | T-025, T-026, T-027 | T-025 concluída; T-026 concluída; T-027 concluída |
| 4.4 Os dois portões | verificador e revisor; o revisor sem ferramenta de escrita | T-028, T-075, T-077, T-078 | T-028 concluída; T-075 concluída; T-077 concluída; T-078 concluída |
| 4.5 Diagnóstico | decidir COMO refazer; escada de falha; teto de gasto | T-029, T-030, T-031, T-032 | T-029 concluída; T-030 concluída; T-031 concluída; T-032 concluída |
| R1 Do pedido às tarefas | planejador: pedido em linguagem natural → grafo de tarefas | T-068, T-069 | T-068 concluída; T-069 concluída |
| Entrega Marco da etapa | seis estados, reprovação de propósito, refeita, concluída | T-034 | T-034 concluída |

## Números (do repositório)

- tarefas: **19/19 concluídas**; aprovadas de primeira: 19; execuções por tarefa (média): 1.0
- commits das tarefas: 39 · testes nos arquivos da etapa: 454 · linhas em `lib/`: 5282
- custo medido nas rodadas do painel: US$ 59,09 em 36 despachos (dólar-equivalente de cota; tarefas feitas no chat não entram)

## Tarefas

| tarefa | título | status | execuções | concluída em | custo medido |
|---|---|---|---|---|---|
| T-021 | ABERTURA da v0.3: conferir o plano contra o codigo que existe | concluída | 1 | — | — |
| T-022 | Os seis estados e a transicao transacional | concluída | 1 | 2026-08-31 | — |
| T-022a | A bateria completa esta vermelha desde a T-019 — os 8 erros do Dialyzer | concluída | 1 | 2026-08-31 | — |
| T-023 | Promocao por dependencias e ordenacao da fila | concluída | 1 | 2026-08-31 | — |
| T-024 | Equipe sob demanda: especialistas versionados e resolucao do construtor | concluída | 1 | 2026-08-31 | — |
| T-025 | Criterios executaveis: leitura, allowlist e passada mecanica | concluída | 1 | 2026-08-31 | — |
| T-026 | Classe de falha: o comando quebrou, ou a entrega falhou? | concluída | 1 | 2026-08-31 | — |
| T-027 | O criterio implicito da suite e a deteccao de ecossistema | concluída | 1 | 2026-08-31 | — |
| T-028 | Os dois portoes, e a ausencia da ferramenta de corrigir | concluída | 1 | 2026-08-31 | — |
| T-075 | Portoes.Revisor ganha ler_conformidade/1 — hoje o revisor NUNCA reprova por conformidade | concluída | 1 | 2026-09-27 | US$ 15,77 |
| T-077 | Doutrina do revisor ensina o formato `[conformidade] ...` que ler_conformidade/1 procura | concluída | 1 | 2026-10-01 | — |
| T-078 | O portão do revisor lê os achados também do `registrar_resultado` — onde a doutrina manda escrevê-los | concluída | 1 | 2026-10-01 | — |
| T-029 | Diagnostico de reprovacao: decidir COMO refazer, nao so que refazer | concluída | 1 | 2026-08-31 | — |
| T-030 | A escada de resposta ao fracasso, e o limite de 3 ciclos | concluída | 1 | 2026-08-31 | — |
| T-031 | Orcamento com parada limpa: teto por rodada e por tarefa | concluída | 1 | 2026-09-04 | US$ 4,41 |
| T-032 | Geracao do markdown a partir do banco, e o commit da tarefa | concluída | 1 | 2026-09-02 | US$ 10,74 |
| T-068 | Fabrica.Planejador: traduz um pedido em linguagem natural num grafo de tarefas | concluída | 1 | 2026-09-22 | US$ 11,62 |
| T-069 | mix fabrica.planejar: a única intervenção humana que o marco da v1.0 exige | concluída | 1 | 2026-09-25 | US$ 4,84 |
| T-034 | MARCO da v0.3: uma tarefa percorre os seis estados e conclui | concluída | 1 | 2026-09-08 | US$ 11,71 |

## Requisitos desta etapa

| req | requisito | situação | como se prova |
|---|---|---|---|
| R1 | Transformar a descrição de um projeto em especificação, plano e tarefas | parcial | `mix fabrica.planejar` gera as tarefas; falta rodar num pedido real de ponta a ponta |
| R2 | Levar cada tarefa por seis estados, registrando relatório e custo | ok | histórico medido: pronta → execução → teste → execução → teste → revisão → concluída |
| R3 | Julgar toda entrega duas vezes: se funciona e se é o que foi pedido | ok | dois portões independentes; reprovação por conformidade sem defeito nenhum |
| R4 | Devolver a entrega reprovada com o que faltou e decidir como refazer | ok | diagnóstico decide como refazer; 2º ciclo sobe de modelo |
| R5 | Limitar o retrabalho: replanejar uma vez e, se falhar, passar ao humano | ok | escada de 4 degraus; contador no banco |
| R14 | Nenhuma rodada passa do teto de gasto | ok | teto por rodada e por tarefa: impede começar, nunca corta no meio |

## Destaques (o que vale contar)

- O marco é um teste permanente: uma tarefa criada do zero é reprovada de propósito (entrega errada, não comando quebrado), refeita e concluída.
- Na reprovação o modelo sobe sozinho: 1º ciclo no modelo padrão, 2º no reforçado — decidido pela escada, não a dedo.
- Custo por ciclo consultável separadamente: US$ 0,0257 + US$ 0,0744 = US$ 0,1001 (no teste do marco).
- Os critérios de aceite são comandos que o sistema roda sozinho, antes de gastar um agente.

## O que está feito / o que falta

**Pendente nesta etapa:**

- R1 ainda não foi exercitado de ponta a ponta com um pedido real (isso é o marco final, E7/E8).

**Próxima rodada:**

- Para a apresentação de 02/11: rodar o marco ao vivo (`mix test test/fabrica/marco_v03_test.exs`).

## Como demonstrar ao vivo

Na pasta `projetos/fabrica-v2`, com o Postgres de pé:

```
mix test test/fabrica/marco_v03_test.exs
```

Resultado na geração: **1 testes, 0 falhas** (saída completa em `evidencia-marco.txt`).
