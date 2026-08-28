---
id: T-037
titulo: Fila duravel: enfileirar e mudar estado na mesma transacao
projeto: fabrica-v2
versao: v0.4
status: backlog
prioridade: alta
dependencias: [T-022, T-036]
areas: [lib/fabrica/fila/trabalho.ex, priv/repo/migrations, test/fabrica/fila/trabalho_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Trocar a fila em memoria por Oban, para que enfileirar um trabalho e mudar o estado da
tarefa acontecam na MESMA transacao.

## Contexto
E o que impede o estado classico "a tarefa consta como em execucao, mas ninguem esta
executando". Um trabalho guardado em memoria some quando o programa reinicia; a fila do
Oban vive no mesmo banco das tarefas, entao ou os dois valem, ou nenhum vale.

Configure filas separadas por papel — `construtor`, `verificador`, `revisor` — com
concorrencia propria. O verificador roda 1-wide de proposito: a bateria completa sobre uma
arvore com edicoes alheias gera reprovacao falsa, o desperdicio mais caro do sistema.

`unique` por `{tarefa_id, papel}` para impedir despacho duplicado da mesma etapa.

Trabalho interrompido pelo desligamento volta a ser despachavel na subida — sem
intervencao. Teste isso de verdade: enfileire, derrube o Oban no meio, suba, confira que o
trabalho voltou.

NAO reintroduza retentativa automatica generica. A retentativa desta fabrica e a escada da
T-031, que e deliberada e conta ciclo. Uma retentativa cega do Oban por cima disso faria a
tarefa girar sem que `tentativas` subisse — que e exatamente o defeito que custou 41
despachos na v1.

## Criterios de aceite
- [ ] Enfileirar e transicionar acontecem numa transacao: erro em qualquer um dos dois nao grava nenhum.
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] Trabalho interrompido volta a ser despachavel apos reinicio, sem intervencao.
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] `unique` impede duas etapas iguais da mesma tarefa na fila ao mesmo tempo.
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] A fila do verificador roda 1-wide; a do construtor, ate 3 (inspecionavel na config).

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

