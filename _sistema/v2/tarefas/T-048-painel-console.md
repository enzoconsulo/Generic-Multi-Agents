---
id: T-048
titulo: Painel: console ao vivo do agente e custo da rodada
projeto: fabrica-v2
versao: v1.0
status: backlog
prioridade: alta
dependencias: [T-046, T-047]
areas: [lib/fabrica_web/live/console_live.ex, test/fabrica_web/live/console_live_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Ver o que o agente esta fazendo agora, volta a volta, e quanto a rodada ja gastou —
enquanto acontece, nao depois.

## Contexto
"O painel nao e enfeite: e o instrumento que torna o custo visivel enquanto ele acontece."

Tres blocos:
  - **em voo** — quem esta rodando agora, consultando o `Registry` (nao deduzindo de log)
  - **console** — as voltas do agente selecionado, com a ferramenta chamada em cada uma
  - **custo** — o gasto da rodada, POR TAREFA e nao so por execucao, com a reparticao de
    cache (escrita/leitura) visivel

A distincao "por tarefa, nao por execucao" e o que faltou na v1: o teto se calibrava pelo
custo de uma etapa e subestimava a tarefa inteira em quatro vezes — sempre para baixo,
sempre no sentido de comecar trabalho que nao cabia.

Mostre a parede de cota quando ela estiver batida, com o horario de reabertura. Sem isso o
usuario acha que a fabrica travou.

Console de agente pode produzir muita linha: limite o que fica em memoria na tela e ofereca
o registro completo por consulta.

## Criterios de aceite
- [ ] A lista de agentes em voo vem do `Registry` e some quando o agente termina.
      `verificar: mix test test/fabrica_web/live/console_live_test.exs`
- [ ] O custo aparece POR TAREFA, com a reparticao escrita/leitura de cache visivel.
      `verificar: mix test test/fabrica_web/live/console_live_test.exs`
- [ ] A parede de cota aparece na tela com o horario de reabertura quando ativa.
      `verificar: mix test test/fabrica_web/live/console_live_test.exs`
- [ ] Ha captura de tela em `_gestao/evidencias/` e ela foi olhada (inspecionavel).

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

