---
id: T-017
titulo: Teto de chamadas de ferramenta por papel
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-015]
areas: [lib/fabrica/agente/orcamento_ferramentas.ex, test/fabrica/agente/orcamento_ferramentas_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Um teto de chamadas de ferramenta por papel, medido e nao chutado, que MEDE o estouro e o
registra — sem cortar o despacho no meio.

## Contexto
A v1 tem isso (`despachante.ts`, `orcamentoDeFerramentas` e `limiarDeDebate`), medido sobre
135 etapas reais dos proprios logs, sem gastar um centavo de modelo. Porte os numeros
lendo `<fabrica-v1>/painel/servidor/src/pipeline/despachante.ts` — nao os invente.

**MEDE E NAO CORTA, DE PROPOSITO**, e isto esta em `DECISOES_FECHADAS.md` como caso que
PARECE defeito e nao e: cortar exigiria converter chamadas em voltas, e despacho
interrompido no meio custa igual sem entregar nada (US$ 4,11 medidos num corte por cota).
E a mesma doutrina do teto de orcamento: nunca cortar no meio, so nao COMECAR o que nao
cabe.

A lacuna real da v1, e que a v2 deve fechar: la a medicao nao alimentava decisao nenhuma.
Aqui ela alimenta duas — o diagnostico da v0.3 (um despacho que estourou o teto de
ferramentas e sinal de tarefa mal dimensionada) e a estimativa do proximo despacho.

Grave o estouro em `despachos`, com o teto e o realizado.

## Criterios de aceite
- [ ] O teto por papel vem dos numeros medidos da v1, com a fonte citada no cabecalho do arquivo (inspecionavel).
- [ ] Estourar o teto REGISTRA o estouro e NAO interrompe o despacho.
      `verificar: mix test test/fabrica/agente/orcamento_ferramentas_test.exs`
- [ ] O estouro fica legivel em `despachos` (teto e realizado), disponivel para o diagnostico da v0.3.
      `verificar: mix test test/fabrica/agente/orcamento_ferramentas_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

