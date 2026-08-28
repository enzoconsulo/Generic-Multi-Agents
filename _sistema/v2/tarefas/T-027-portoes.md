---
id: T-027
titulo: Os dois portoes, e a ausencia da ferramenta de corrigir
projeto: fabrica-v2
versao: v0.3
status: backlog
prioridade: alta
dependencias: [T-021, T-024, T-025]
areas: [lib/fabrica/portoes/verificador.ex, lib/fabrica/portoes/revisor.ex, test/fabrica/portoes_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Os dois julgamentos independentes: o verificador responde "funciona?" executando os
criterios; o revisor responde "e o que foi pedido, e esta correto?". Nenhum dos dois tem a
ferramenta de escrever.

## Contexto
"Quem implementa nunca e quem aprova" deixa de ser recomendacao de conduta e vira
impossibilidade: o catalogo de ferramentas do verificador e do revisor NAO CONTEM
`escrever` nem `editar`. E o principio do menor poder aplicado a agentes.

**Verificador** — recebe os criterios e o resultado da passada mecanica JA PRONTO (a T-025
rodou de graca), executa o que sobrou, e rotula cada criterio no grau de prova. Roda no
modelo barato: verificar e mecanico.

**Revisor** — recebe o DIFF commitado e nenhum fonte inteiro. Responde duas perguntas
separadas, em duas secoes:
  - **Conformidade**: cada criterio mapeado ao que o cumpre, e o objetivo julgado.
    Reprovar por conformidade NAO exige achar defeito nenhum — entrega que passa em todos os
    criterios e nao tem bug ainda pode nao ser a tarefa. Criterio frouxo nao e licenca para
    entregar outra coisa.
  - **Revisao**: defeitos reais no diff, cada um como `[gravidade] arquivo:linha — problema`.

O formato dos achados importa: e dele que a T-030 extrai a politica de retrabalho.

## Criterios de aceite
- [ ] O catalogo de ferramentas do verificador e do revisor nao contem escrita (teste negativo).
      `verificar: mix test test/fabrica/portoes_test.exs`
- [ ] O revisor recebe o diff e nenhum fonte inteiro (teste sobre o contexto montado).
      `verificar: mix test test/fabrica/portoes_test.exs`
- [ ] Reprovacao por conformidade sem nenhum defeito encontrado e um desfecho valido e representavel.
      `verificar: mix test test/fabrica/portoes_test.exs`
- [ ] Os achados do revisor saem no formato `[gravidade] arquivo:linha — problema`.
      `verificar: mix test test/fabrica/portoes_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

