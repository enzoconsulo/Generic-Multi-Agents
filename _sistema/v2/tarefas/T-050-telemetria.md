---
id: T-050
titulo: Barramento de eventos e telemetria por despacho
projeto: fabrica-v2
versao: v1.0
status: backlog
prioridade: alta
dependencias: [T-015, T-036]
areas: [lib/fabrica/eventos.ex, lib/fabrica/telemetria.ex, test/fabrica/eventos_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Cada despacho emite eventos — inicio, fim, modelo, voltas, tokens escritos e lidos, custo e
desfecho — num barramento que a tela assina.

## Contexto
"A contabilidade nao depende de alguem lembrar de gravar": o evento sai do proprio caminho
de execucao, via `:telemetry`, e o Phoenix PubSub distribui.

Eventos, no minimo: `[:fabrica, :despacho, :inicio | :volta | :fim]`,
`[:fabrica, :tarefa, :transicao]`, `[:fabrica, :cota, :parede | :rearme]`.

ARMADILHA DA v1, e ela e a razao de a contabilidade nao poder viver so no fim: jobs cortados
no meio nunca recebiam o evento final, e o painel marcava US$ 0,00 justamente nos jobs mais
caros. Por isso o evento e por VOLTA, nao por despacho — o que ja gastou fica registrado
mesmo se o despacho morrer no proximo segundo.

Emita tambem a reparticao de cache (escrita/leitura) em cada volta: e o numero que decide o
desenho, e ele precisa estar visivel na tela, nao so no banco.

## Criterios de aceite
- [ ] Cada volta emite evento com a reparticao de cache; um despacho cortado deixa o registro do que ja gastou.
      `verificar: mix test test/fabrica/eventos_test.exs`
- [ ] Transicao de tarefa e parede de cota emitem eventos proprios.
      `verificar: mix test test/fabrica/eventos_test.exs`
- [ ] Um assinante recebe os eventos na ordem em que foram emitidos.
      `verificar: mix test test/fabrica/eventos_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

