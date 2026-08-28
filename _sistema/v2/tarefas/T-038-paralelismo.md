---
id: T-038
titulo: Paralelismo com `areas` como exclusao mutua verificada
projeto: fabrica-v2
versao: v0.4
status: backlog
prioridade: alta
dependencias: [T-023, T-037]
areas: [lib/fabrica/fila/exclusao.ex, test/fabrica/fila/exclusao_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Rodar ate tres construtores ao mesmo tempo no mesmo projeto, somente quando as `areas`
declaradas nao se cruzam — e a verificacao feita pelo MOTOR, nunca confiada ao texto do
despacho.

## Contexto
ARMADILHA DA v1, documentada e paga: `areas` e o mutex do paralelismo, mas na v1 ele so
descrevia o que a TAREFA declarava — o despacho era texto livre, e uma linha de "contexto
extra" furava o mutex sem que nada acusasse. Aconteceu em 14/08: uma tarefa recebeu ordem de
mexer num arquivo que era `area` de outra, e a checagem de disjuncao, olhando as areas
declaradas, disse "ok".

Na v2 a verificacao acontece em DOIS momentos:

  1. **antes de despachar** — as areas das tarefas candidatas sao disjuntas?
  2. **na ferramenta de escrita** — o caminho que o agente esta gravando pertence as areas
     DESTA tarefa? Se nao, recusa com erro nomeado.

O segundo e o que a v1 nao tinha, e e ele que torna a regra uma propriedade em vez de uma
promessa.

Regra que fecha o desenho: **verificador exige projeto quieto.** Nunca despache verificador
com construtor ativo no MESMO projeto.

## Criterios de aceite
- [ ] Duas tarefas com areas que se cruzam nunca sao despachadas juntas.
      `verificar: mix test test/fabrica/fila/exclusao_test.exs`
- [ ] A ferramenta de escrita RECUSA caminho fora das `areas` da tarefa corrente, com erro nomeado.
      `verificar: mix test test/fabrica/fila/exclusao_test.exs`
- [ ] Verificador nao e despachado enquanto ha construtor ativo no mesmo projeto.
      `verificar: mix test test/fabrica/fila/exclusao_test.exs`
- [ ] Ate 3 construtores rodam juntos quando as areas sao disjuntas.
      `verificar: mix test test/fabrica/fila/exclusao_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

