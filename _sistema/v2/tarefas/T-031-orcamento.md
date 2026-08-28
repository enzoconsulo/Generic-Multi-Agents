---
id: T-031
titulo: Orcamento com parada limpa: teto por rodada e por tarefa
projeto: fabrica-v2
versao: v0.3
status: backlog
prioridade: alta
dependencias: [T-005, T-022]
areas: [lib/fabrica/orcamento.ex, test/fabrica/orcamento_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Impedir que a rodada COMECE trabalho que nao cabe no orcamento — e nunca cortar agente em
voo.

## Contexto
Doutrina fechada, e ela esta em `DECISOES_FECHADAS.md`: **o teto impede comecar, nao
interrompe**. Interromper no meio paga igual e nao entrega nada (US$ 4,11 medidos num corte
por cota na v1).

Dois tetos, e o segundo e o que responde a queixa real do usuario na v1 ("gastar 70% do
limite e nao entregar UMA tarefa"):

  - **teto da rodada** — antes de despachar, some o gasto ate agora com a estimativa da
    proxima tarefa; se passar, pare limpo e reporte `:orcamento`.
  - **teto por tarefa** — uma fracao do teto da rodada. Tarefa que sozinha ja consumiu
    isso nao recebe outro despacho, mesmo com orcamento de rodada sobrando.

**Autocalibragem:** a estimativa da proxima tarefa e a media do que ESTE job ja mediu, nao
uma constante. A v1 errava aqui de um jeito instrutivo — usava o custo da ETAPA do revisor
e subestimava a tarefa inteira em quatro vezes, sempre para baixo, sempre no sentido de
comecar trabalho que nao cabia. Use `custo por TAREFA concluida`, nunca por etapa.

Modulo puro; quem chama aplica.

## Criterios de aceite
- [ ] O teto da rodada impede COMECAR a proxima tarefa e reporta `:orcamento`, sem cortar nada em voo.
      `verificar: mix test test/fabrica/orcamento_test.exs`
- [ ] O teto por tarefa corta despachos daquela tarefa mesmo com orcamento de rodada sobrando.
      `verificar: mix test test/fabrica/orcamento_test.exs`
- [ ] A estimativa usa o custo por TAREFA concluida medido no proprio job, nao por etapa.
      `verificar: mix test test/fabrica/orcamento_test.exs`
- [ ] Sem medicao propria ainda, a estimativa cai num padrao declarado e o teste trava esse valor.
      `verificar: mix test test/fabrica/orcamento_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

