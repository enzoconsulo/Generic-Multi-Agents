---
id: T-050
titulo: Piloto automatico: a decisao (funcao pura)
projeto: fabrica-v2
versao: v1.0
status: backlog
prioridade: alta
dependencias: [T-030, T-037]
areas: [lib/fabrica/piloto/decisao.ex, test/fabrica/piloto/decisao_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
A tabela de decisao que diz se o piloto continua, dorme ou para — pura, testavel, e com a
ORDEM dos ramos sendo a propria regra.

## Contexto
Porte de `jobs/piloto/decisao.ts` da v1, que ja e puro e ja tem teste. O piloto encadeia
rodadas sozinho ate um criterio de parada; ele NAO e um motor novo — cada rodada e o mesmo
trabalho montado pelo mesmo caminho do botao. O que ele acrescenta e o dedo que aperta o
botao de novo, e os freios.

Freios obrigatorios (os dois, sempre): **teto de gasto acumulado** e **maximo de rodadas**.
Sem um deles configurado, o piloto nao liga.

Paradas automaticas:
  - acabou tarefa pronta
  - alguma tarefa pediu replanejamento
  - **duas rodadas seguidas sem concluir nada**
  - falha

E uma nao-parada, que e a razao de a cota ser mecanismo de primeira classe: **cota batida
nao para o piloto** — ele dorme e rearma na hora anunciada.

A ORDEM da tabela e a regra: leia o cabecalho antes de inserir um ramo no meio. Uma
condicao avaliada fora de ordem muda o comportamento sem que nenhum teste isolado acuse.

Desligar NAO corta a rodada em voo.

## Criterios de aceite
- [ ] Cada criterio de parada dispara na condicao certa (um teste por criterio).
      `verificar: mix test test/fabrica/piloto/decisao_test.exs`
- [ ] Cota batida faz o piloto DORMIR e rearmar, nunca parar.
      `verificar: mix test test/fabrica/piloto/decisao_test.exs`
- [ ] Sem teto de gasto ou sem maximo de rodadas, o piloto recusa ligar.
      `verificar: mix test test/fabrica/piloto/decisao_test.exs`
- [ ] Desligar o piloto nao corta a rodada em voo.
      `verificar: mix test test/fabrica/piloto/decisao_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

