---
id: T-030
titulo: A escada de resposta ao fracasso, e o limite de 3 ciclos
projeto: fabrica-v2
versao: v0.3
status: backlog
prioridade: alta
dependencias: [T-029]
areas: [lib/fabrica/retrabalho/escada.ex, test/fabrica/retrabalho/escada_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Os quatro degraus: sobe de modelo, troca de especialista, replaneja, bloqueia. Cada um so e
usado depois que o anterior falhou de verdade.

## Contexto
O gatilho e sempre FATO REGISTRADO, nunca palpite sobre dificuldade:

  1. **1a reprovacao -> sobe de modelo.** Insistir no mesmo modelo paga construtor,
     verificador e revisor de novo e queima uma das tres tentativas.
  2. **2a reprovacao sob o MESMO especialista -> troca de especialista** (vai para o
     reforcado generico). Ele foi escolhido no planejamento, antes de se saber onde a
     tarefa iria falhar; duas reprovacoes sob o mesmo prompt de dominio sao evidencia de
     que a especializacao esta enviesando o ataque. Registre a troca e o motivo.
  3. **3 ciclos esgotados -> replanejamento.** O planejador quebra a tarefa em 2–3 menores,
     que entram na fila como novas; a original vira `cancelada` com referencia. E o
     reconhecimento de que o problema pode ser de DIMENSIONAMENTO, nao de execucao.
  4. **Esgotou de novo -> bloqueia.** Autocorrecao vale UMA vez por linhagem: tarefa que ja
     nasceu de replanejamento (tem `replanejada_de`) nao replaneja outra vez.

`tentativas` conta EXECUCOES, nao reprovacoes — e quem conta e o sistema (T-022).

Ha um teto que o motor impoe sozinho, sem confiar em ninguem: **maximo de despachos por
tarefa numa rodada**. A v1 mediu 41 despachos e US$ 22,55 numa rodada so quando o contador
nao era incrementado. Mesmo com o contador correto, o teto fica — defesa em profundidade.

## Criterios de aceite
- [ ] Cada degrau dispara na condicao certa, e nao antes (um teste por degrau).
      `verificar: mix test test/fabrica/retrabalho/escada_test.exs`
- [ ] Tarefa com `replanejada_de` preenchido bloqueia em vez de replanejar de novo.
      `verificar: mix test test/fabrica/retrabalho/escada_test.exs`
- [ ] A troca de especialista e registrada com o motivo.
      `verificar: mix test test/fabrica/retrabalho/escada_test.exs`
- [ ] O teto de despachos por tarefa por rodada corta mesmo quando `tentativas` esta correto.
      `verificar: mix test test/fabrica/retrabalho/escada_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

