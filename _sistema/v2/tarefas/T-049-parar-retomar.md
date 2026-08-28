---
id: T-049
titulo: Parar e retomar: um botao que encerra um processo supervisionado
projeto: fabrica-v2
versao: v1.0
status: backlog
prioridade: alta
dependencias: [T-034, T-047]
areas: [lib/fabrica_web/live/componentes/controles.ex, test/fabrica_web/controles_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Cortar um agente pela tela — e o supervisor devolve a tarefa a fila, sem deixar trabalho pela
metade nem arquivo editado sem dono.

## Contexto
"Parar custa um botao. Cortar um agente e encerrar um processo supervisionado." Na v1
cancelar no meio deixava trabalho solto na arvore de arquivos; aqui a recuperacao (T-042)
cuida do que sobrou.

Parar = `DynamicSupervisor.terminate_child/2`. O supervisor devolve a tarefa a fila com
motivo `:cortado_pelo_operador` — que e distinto de `:falha` e nao conta ciclo. Cortar por
decisao do operador nao e reprovacao da tarefa.

Retomar = reenfileirar a tarefa. Se havia trabalho parcial na arvore, a recuperacao commita
antes de reenfileirar, para o proximo despacho comecar de um estado limpo.

Confirmacao antes de cortar, mostrando o que ja foi gasto — a informacao que faz a decisao
ser informada em vez de reflexa.

## Criterios de aceite
- [ ] Parar encerra o processo e devolve a tarefa a fila com motivo `:cortado_pelo_operador`.
      `verificar: mix test test/fabrica_web/controles_test.exs`
- [ ] Corte pelo operador NAO conta ciclo.
      `verificar: mix test test/fabrica_web/controles_test.exs`
- [ ] Retomar reenfileira, e trabalho parcial e commitado antes.
      `verificar: mix test test/fabrica_web/controles_test.exs`
- [ ] A confirmacao mostra o gasto acumulado da tarefa antes de cortar.
      `verificar: mix test test/fabrica_web/controles_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

