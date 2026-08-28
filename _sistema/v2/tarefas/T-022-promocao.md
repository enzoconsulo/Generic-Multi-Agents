---
id: T-022
titulo: Promocao por dependencias e ordenacao da fila
projeto: fabrica-v2
versao: v0.3
status: backlog
prioridade: alta
dependencias: [T-021]
areas: [lib/fabrica/tarefas/fila.ex, test/fabrica/tarefas/fila_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Decidir, deterministicamente, quais tarefas passam de `backlog` para `pronta` e em que
ordem despachar as prontas.

## Contexto
Funcoes PURAS sobre uma lista de tarefas — sem I/O. E o porte de `pipeline/maquina.ts` da
v1 (`promoverProntas`, `proximosPassos`), que ja e puro e ja tem teste: traduza os casos
de teste junto com o codigo.

`promover/1` — uma tarefa vira `pronta` quando TODAS as suas dependencias estao
`concluida`. Dependencia `cancelada` conta como satisfeita se houver substituta concluida
(replanejamento); dependencia `bloqueada` NAO satisfaz.

`proximos/2` — ordena por prioridade, depois por codigo. Devolve no maximo 3 passos
paralelos, e so entre tarefas cujas `areas` sejam DISJUNTAS. Duas tarefas que tocam o
mesmo arquivo nunca saem juntas.

Ciclo de dependencias e defeito de planejamento, nao situacao normal: detecte e devolva
`{:erro, {:ciclo, caminho}}` em vez de travar.

## Criterios de aceite
- [ ] Tarefa com todas as dependencias concluidas e promovida; com uma pendente, nao.
      `verificar: mix test test/fabrica/tarefas/fila_test.exs`
- [ ] Duas tarefas com `areas` que se cruzam nunca saem no mesmo lote de paralelismo.
      `verificar: mix test test/fabrica/tarefas/fila_test.exs`
- [ ] Ciclo de dependencias e detectado e reportado com o caminho, sem travar.
      `verificar: mix test test/fabrica/tarefas/fila_test.exs`
- [ ] As funcoes sao puras: nenhum acesso a banco no caminho (inspecionavel).

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

