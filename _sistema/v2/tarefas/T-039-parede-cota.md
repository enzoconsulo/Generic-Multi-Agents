---
id: T-039
titulo: A parede de cota: reconhecer, dormir e rearmar
projeto: fabrica-v2
versao: v0.4
status: backlog
prioridade: alta
dependencias: [T-018, T-037]
areas: [lib/fabrica/cota.ex, test/fabrica/cota_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Reconhecer que a cota da assinatura acabou, extrair o horario de reabertura, dormir ate la e
rearmar sozinho — sem perder o trabalho em fila.

## Contexto
ESTE MECANISMO NAO EXISTE EM DOCUMENTO NENHUM DO TCC, e e estrutural: a fabrica nao paga
por token, consome cota. Sem ele, bater a parede simplesmente derruba a rodada. Na v1 ele e
cidadao de primeira classe (`ehLimiteDeUso`, `horaDeReabertura`, o rearme do piloto) — porte
a logica lendo `<fabrica-v1>/painel/servidor/src/jobs/claude/runner-claude.ts` e
`jobs/piloto/reabertura.ts`.

Tres partes:

  1. **Reconhecer** — o `Operario.ClaudeCLI` ja traduz para `{:erro, {:cota, reabre_em}}`
     (T-016). Aqui isso vira estado do sistema, nao erro de um despacho.
  2. **Dormir** — pausar as filas do Oban, sem cancelar o que esta enfileirado. O trabalho
     fica; so nao sai.
  3. **Rearmar** — agendar a retomada para o horario informado, com folga. Se o horario nao
     vier, use recuo exponencial com teto de 1 hora.

O horario vem em formato humano ("5:30pm (America/Sao_Paulo)"), nao ISO. Faca o parse com
tolerancia e, quando falhar, caia no recuo exponencial — nunca trave por nao entender uma
string.

Deixe isso VISIVEL: uma consulta responde "a cota esta batida agora? ate quando?". E o que a
tela da v1.0 mostra e o que evita o usuario achar que a fabrica travou.

## Criterios de aceite
- [ ] Erro de cota pausa as filas sem cancelar trabalho enfileirado.
      `verificar: mix test test/fabrica/cota_test.exs`
- [ ] O horario de reabertura em formato humano e interpretado corretamente (varios formatos testados).
      `verificar: mix test test/fabrica/cota_test.exs`
- [ ] Horario ilegivel cai em recuo exponencial com teto, em vez de travar.
      `verificar: mix test test/fabrica/cota_test.exs`
- [ ] A consulta de estado responde se a cota esta batida e ate quando.
      `verificar: mix test test/fabrica/cota_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

