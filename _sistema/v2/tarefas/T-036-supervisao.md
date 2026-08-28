---
id: T-036
titulo: Arvore de supervisao e registro de processos
projeto: fabrica-v2
versao: v0.4
status: backlog
prioridade: alta
dependencias: [T-015, T-022]
areas: [lib/fabrica/application.ex, lib/fabrica/agente/supervisor.ex, test/fabrica/agente/supervisor_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Cada tarefa em voo vira um processo supervisionado, com endereco e dono — e o estado dela
NAO vive dentro do processo, vive no banco.

## Contexto
E o mapeamento que decide a escolha de Elixir: "agente vira processo supervisionado". Um
agente deixa de ser uma execucao solta que ninguem vigia e passa a ter identificador,
dono, alguem que pode encerra-lo e — o que mais importa — alguem que percebe quando ele
morre.

`DynamicSupervisor` para os agentes em voo, `Registry` para enderecar por
`{:agente, tarefa_id}`. Estrategia `:one_for_one`: a morte de um agente nao toca os outros.

O processo morre a qualquer instante sem que nada se perca, porque o estado esta no banco.
O que o supervisor faz ao perceber a morte NAO e reiniciar cegamente: e devolver a tarefa
para a fila, com o motivo registrado. Reiniciar um agente no meio da conversa gastaria
tudo de novo sem aproveitar nada.

Listar o que esta rodando e consultar o `Registry` — nunca deduzir de arquivo de log. E
isso que a tela da v1.0 vai usar.

## Criterios de aceite
- [ ] Tres agentes rodam sob o supervisor; matar um nao afeta os outros dois.
      `verificar: mix test test/fabrica/agente/supervisor_test.exs`
- [ ] A morte de um agente devolve a tarefa a fila com motivo registrado, sem reiniciar a conversa.
      `verificar: mix test test/fabrica/agente/supervisor_test.exs`
- [ ] Listar agentes em voo consulta o `Registry` e devolve tarefa e papel de cada um.
      `verificar: mix test test/fabrica/agente/supervisor_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

