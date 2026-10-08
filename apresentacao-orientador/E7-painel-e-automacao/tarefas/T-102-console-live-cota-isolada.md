---
id: T-102
titulo: "console_live_test.exs:138 (parede de cota no console) deixa de depender do estado global da Cota compartilhado com outros testes"
projeto: fabrica-v2
versao: v1.0
status: pronta
prioridade: alta
dependencias: []
areas: [test/fabrica_web/live/console_live_test.exs]
tentativas: 0
criada: 2026-10-07
atualizada: 2026-10-07
---

## Objetivo
O teste "parede de cota aparece com o horario de reabertura quando ativa, e some ao rearmar"
(`test/fabrica_web/live/console_live_test.exs:138`) passa sempre que o console está certo e falha
sempre que não está — independente da ordem e da concorrência da suíte.

## Contexto
Em 07/10 ele derrubou a passada mecânica (`mix test`) da T-094 uma vez e da T-095 duas vezes — tarefas
que não tocam o console —, enquanto `mix fabrica.ci` com o projeto quieto passou 6/6 no HEAD `99d7838`.
Mesma família da `busca_test.exs:242` (T-097, já concluída) e da `classe_falha_test.exs:315` (T-098):
falha de isolamento, não de entrega, e cada ocorrência queima um ciclo de quem não tem culpa.

Hipótese a confirmar ANTES de mexer (registre nas Notas): o teste lê/escreve o estado da parede em
`Fabrica.Cota` (processo/estado global, que desde a T-091 sobe na árvore de supervisão), e outros
testes assíncronos — `test/fabrica/piloto/servidor_test.exs`, `test/fabrica/cota_test.exs` — mexem no
mesmo estado ao mesmo tempo. Reproduza rodando o arquivo junto com esses (`mix test <arquivos>
--seed N` em laço) até ver a falha.

Conserto dentro da área: o teste deixa de depender do estado global compartilhado (ex.: `async:
false` só onde há estado global, ou injetar um processo/nome de Cota próprio do teste, se o
LiveView já aceitar), sem enfraquecer a asserção. Se o conserto exigir mudar código de produção
(o LiveView não deixa injetar), PARE e registre como Impedimento com a proposta — não saia da área.

## Critérios de aceite
- [ ] O arquivo passa 20 vezes seguidas sozinho e 10 vezes junto com os testes do piloto e da cota,
      e as Notas registram a causa confirmada.
      `verificar: mix test test/fabrica_web/live/console_live_test.exs`
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução


## Verificação


## Conformidade


## Revisão
