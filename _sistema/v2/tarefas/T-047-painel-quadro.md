---
id: T-047
titulo: Painel: quadro de tarefas por estado, ao vivo
projeto: fabrica-v2
versao: v1.0
status: backlog
prioridade: alta
dependencias: [T-046]
areas: [lib/fabrica_web/live/quadro_live.ex, test/fabrica_web/live/quadro_live_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
A tela principal: as tarefas do projeto agrupadas pelos seis estados, atualizando sozinha
conforme o motor trabalha.

## Contexto
LiveView sobre o MESMO banco e o mesmo barramento do motor — nao e uma aplicacao separada
lendo arquivos de log, que era o desenho da v1.

Colunas pelos seis estados, mais `bloqueada`. Cada cartao: codigo, titulo, tentativas,
especialista, e o custo acumulado da tarefa.

Assine o barramento (T-052) e atualize por evento, sem polling. Polling numa tela que fica
aberta o dia todo e consulta desperdicada em ciclo infinito.

Estado vazio, carregando e erro precisam existir e serem legiveis — nao deixe a tela em
branco quando nao ha projeto selecionado.

CAPTURE A TELA E OLHE antes de dar por pronta. Tarefa de UI dada por pronta sem ninguem
olhar o PNG e aposta, e ja falhou duas vezes na v1. Grave em `_gestao/evidencias/`.

## Criterios de aceite
- [ ] O quadro renderiza as tarefas agrupadas pelos seis estados, com contagem por coluna.
      `verificar: mix test test/fabrica_web/live/quadro_live_test.exs`
- [ ] Uma transicao emitida no barramento atualiza a tela sem recarregar (teste de LiveView).
      `verificar: mix test test/fabrica_web/live/quadro_live_test.exs`
- [ ] Estados vazio, carregando e erro sao renderizados e legiveis.
      `verificar: mix test test/fabrica_web/live/quadro_live_test.exs`
- [ ] Ha captura de tela em `_gestao/evidencias/` e ela foi olhada (inspecionavel).

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

