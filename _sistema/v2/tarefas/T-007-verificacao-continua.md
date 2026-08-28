---
id: T-007
titulo: Verificacao continua local, com Dialyzer em estagio proprio
projeto: fabrica-v2
versao: v0.1
status: backlog
prioridade: alta
dependencias: [T-001]
areas: [lib/mix/tasks/fabrica.ci.ex, _gestao/ci.json, test/mix/ci_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Um comando unico que roda a bateria completa do projeto em estagios nomeados, com o
resultado de cada um separado — e o `_gestao/ci.json` que declara esses estagios, no mesmo
formato que a fabrica ja usa.

## Contexto
A v1 aprendeu isto por estrago (`_sistema/DECISOES_FECHADAS.md`, "Disciplina de
verificacao"): o comando de verificacao de um projeto precisa ser DECLARADO em
`_gestao/ci.json`, e nao redigido de cabeca em cada tarefa. Foi um `node --test` escrito a
mao que custou 4 ciclos e US$ 12,90 na T-030 do banco-imobiliario.

Estagios, nesta ordem (o primeiro que falhar interrompe):

    formato    mix format --check-formatted
    compilar   mix compile --warnings-as-errors
    lint       mix credo --strict
    testes     mix test
    tipos      mix dialyzer

`tipos` fica por ultimo e e o unico que pode ser pulado com `--rapido`, porque a
construcao da PLT demora minutos na primeira vez. Ele NAO pode ser removido: a checagem de
tipos e uma das formas de "mover a regra para o compilador" que a tese do TCC afirma.

Grave `_gestao/ci.json` com esses estagios e seus comandos. E este arquivo — nao a memoria
de quem escreve a tarefa — que as tarefas seguintes copiam para a linha `verificar:`.

## Criterios de aceite
- [ ] `mix fabrica.ci` roda os cinco estagios e imprime o resultado de cada um, nomeado.
      `verificar: mix fabrica.ci --rapido`
- [ ] Um estagio que falha interrompe os seguintes e o comando sai com codigo diferente de zero.
      `verificar: mix test test/mix/ci_test.exs`
- [ ] `_gestao/ci.json` existe e declara os cinco estagios com os comandos reais (inspecionavel).
- [ ] `mix fabrica.ci --rapido` pula o estagio `tipos` e roda os outros quatro.
      `verificar: mix fabrica.ci --rapido`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

