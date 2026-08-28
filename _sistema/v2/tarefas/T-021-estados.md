---
id: T-021
titulo: Os seis estados e a transicao transacional
projeto: fabrica-v2
versao: v0.3
status: backlog
prioridade: alta
dependencias: [T-002, T-005]
areas: [lib/fabrica/tarefas/maquina.ex, lib/fabrica/tarefas/transicao.ex, test/fabrica/tarefas/transicao_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
A maquina de estados da tarefa: quais transicoes existem, e a garantia de que cada uma
grava estado, relatorio e custo NA MESMA TRANSACAO — ou nao grava nada.

## Contexto
Transicoes legais, e so estas:

    backlog     -> pronta         (dependencias todas concluidas)
    pronta      -> em_execucao    (despacho do construtor)
    em_execucao -> em_teste       (construtor terminou)
    em_teste    -> em_revisao     (verificador aprovou)
    em_teste    -> em_execucao    (verificador reprovou)
    em_revisao  -> concluida      (revisor aprovou)
    em_revisao  -> em_execucao    (revisor reprovou)
    qualquer    -> bloqueada      (esgotou ciclos)
    qualquer    -> cancelada      (replanejamento)

Toda transicao ilegal devolve `{:erro, {:transicao_invalida, de, para}}`. A funcao que
decide e PURA (`Maquina.pode?/2`); a que executa faz o `Ecto.Multi`.

A transacao carrega TRES coisas juntas: o novo status, a linha nova em `ciclos` com o
relatorio da etapa, e as linhas de `consumos` do despacho. Nao existe tarefa que mudou de
estado sem deixar registrado por que, nem custo gasto que nao esteja ligado a um resultado.

`tentativas` e incrementado pelo SISTEMA no momento em que a tarefa e entregue a um
construtor — nunca pelo agente. Na v1 o agente as vezes esquecia e a mesma tarefa girava:
uma rodada mediu 41 despachos e US$ 22,55.

O teste que importa: forcar um erro no meio do Multi e conferir que NADA foi gravado —
nem o status, nem o ciclo, nem o consumo.

## Criterios de aceite
- [ ] Cada transicao legal e aceita e cada ilegal e recusada com erro nomeado (uma por teste).
      `verificar: mix test test/fabrica/tarefas/transicao_test.exs`
- [ ] Erro no meio da transacao nao grava NADA: status, ciclo e consumos ficam como estavam.
      `verificar: mix test test/fabrica/tarefas/transicao_test.exs`
- [ ] `tentativas` e incrementado pelo sistema ao entregar a tarefa ao construtor, nunca pelo agente.
      `verificar: mix test test/fabrica/tarefas/transicao_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

