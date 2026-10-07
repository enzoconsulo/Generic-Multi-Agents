# E6 — Memória do projeto

**Plano:** 18/11 – 02/12/2026 · fase Desenvolvimento · no repositório: versão `v0.5`
**Entrega combinada no plano:** O agente cita a decisão anterior, com a fonte certa, em vez de decidir de novo.
**Situação hoje (07/10/2026 11:22):** Peças construídas — marco bloqueado

> Arquivo gerado por `_gerador/gerar.py` a partir do repositório real. Não edite à mão:
> edite `_gerador/conteudo.py` (texto) e rode o gerador de novo.

## O que tem nesta pasta

| item | o que é |
|---|---|
| `slides.html` | a apresentação desta etapa (abra no navegador; ← → navega) |
| `NOTAS.md` | este arquivo: o que está feito, o que falta e a próxima rodada |
| `dados.json` | os números desta etapa, extraídos do repositório |
| `tarefas/` | cópia dos arquivos de tarefa desta etapa (objetivo, critérios, verificação, revisão) |
| `arquivos/` | os 29 arquivos de código/teste desta etapa, no estado do commit `ced37e9` |

## O combinado × o feito

| pacote | o que é | tarefas | situação |
|---|---|---|---|
| 6.1 Medição da busca | medir memória e tempo antes de escolher onde a busca roda | T-042 | T-042 concluída |
| 6.2 Histórico | guardar o histórico a cada commit | T-043 | T-043 concluída |
| 6.3 Busca híbrida | por significado e por termo exato, escolhida por medição | T-044, T-065 | T-044 concluída; T-065 concluída |
| 6.4 Contexto com fonte | o bloco recuperado com a fonte citada | T-046, T-101 | T-046 concluída; T-101 pronta |
| 6.5 Avaliação | recall e MRR do conjunto de avaliação | T-047 | T-047 concluída |
| Busca local Modelo de embedding | embedding local (Ollama) com dimensão conferida | T-045, T-059, T-060, T-061, T-062, T-063, T-064 | T-045 concluída; T-059 concluída; T-060 concluída; T-061 concluída; T-062 concluída; T-063 concluída; T-064 concluída |
| Entrega Marco da etapa | o agente cita a decisão anterior | T-048 | T-048 bloqueada |

## Números (do repositório)

- tarefas: **13/15 concluídas**; aprovadas de primeira: 7; execuções por tarefa (média): 1.69
- commits das tarefas: 48 · testes nos arquivos da etapa: 181 · linhas em `lib/`: 1511
- custo medido nas rodadas do painel: US$ 155,95 em 87 despachos (dólar-equivalente de cota; tarefas feitas no chat não entram)

## Tarefas

| tarefa | título | status | execuções | concluída em | custo medido |
|---|---|---|---|---|---|
| T-042 | ABERTURA da v0.5: decidir o embedding com medicao, nao com palpite | concluída | 2 | 2026-09-11 | US$ 25,32 |
| T-043 | Ingestao da historia do projeto ao commitar | concluída | 1 | 2026-09-09 | US$ 14,70 |
| T-044 | Busca hibrida com fusao reciproca de postos | concluída | 1 | 2026-09-10 | US$ 4,78 |
| T-065 | A fusao deixa de ser fixa — vetor puro x hibrido, escolhido por numero | concluída | 3 | 2026-09-26 | US$ 26,55 |
| T-046 | O bloco de contexto recuperado, com a fonte citada | concluída | 2 | 2026-09-12 | US$ 6,80 |
| T-101 | O bloco de memória recuperado chega ao prompt do agente: Fabrica.Despacho anexa Fabrica.Memoria.Contexto | pronta | 1 | — | — |
| T-047 | Avaliacao da qualidade da recuperacao | concluída | 2 | 2026-09-25 | US$ 20,96 |
| T-045 | Embedder.Servico e Embedder.Local | concluída | 4 | 2026-09-12 | US$ 24,64 |
| T-059 | A dimensao do indice vira um fato conferivel (Fabrica.Memoria.Dimensao) | concluída | 2 | 2026-09-22 | US$ 4,44 |
| T-060 | Embedder.Falso segue a dimensao configurada | concluída | 1 | 2026-09-22 | US$ 3,07 |
| T-061 | A coluna segue o embedder, e a guarda recusa o desencontro antes de gravar | concluída | 1 | 2026-09-22 | US$ 5,14 |
| T-062 | Embedder.Ollama — o adaptador do modelo local | concluída | 1 | 2026-09-24 | US$ 3,77 |
| T-063 | O contrato do embedder ganha o TIPO do texto (documento x consulta) | concluída | 1 | 2026-09-25 | US$ 5,86 |
| T-064 | O probe real do Ollama, e o embedder local ligado em desenvolvimento | concluída | 1 | 2026-09-25 | US$ 5,06 |
| T-048 | MARCO da v0.5: o agente cita a decisao anterior | bloqueada | 1 | — | US$ 4,86 |

## Requisitos desta etapa

| req | requisito | situação | como se prova |
|---|---|---|---|
| R7 | Consultar o histórico do projeto antes de decidir, citando a fonte | pendente | busca e bloco com fonte existem, mas o bloco ainda não chega ao prompt do agente |
| R9 | Rodar em 8 GB de memória e 4 núcleos | parcial | busca escolhida por medição; o pico com 3 em paralelo ainda não foi medido |

## Destaques (o que vale contar)

- Decisão por medição, não palpite: o modelo local via Bumblebee/EXLA não tem binário para Windows — a busca local foi para o Ollama.
- Busca híbrida (significado + termo exato) com o modo padrão escolhido pela medição local de recall.
- Cada commit do projeto vira histórico consultável, e o bloco recuperado traz a fonte citada.

## O que está feito / o que falta

**Pendente nesta etapa:**

- Marco bloqueado: o bloco recuperado ainda não é injetado no prompt do agente — a peça que falta virou a T-101.

**Próxima rodada:**

- T-101 (criada em 07/10, na fila da fábrica): liga `Fabrica.Memoria.Contexto` ao despacho do agente.
- Rodar o marco: agente real cita uma decisão anterior com a fonte certa.
