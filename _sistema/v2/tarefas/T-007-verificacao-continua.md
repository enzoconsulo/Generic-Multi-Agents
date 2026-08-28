---
id: T-007
titulo: Verificacao continua local, com Dialyzer em estagio proprio
projeto: fabrica-v2
versao: v0.1
status: concluida
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
Feito em 2026-08-28. Commit do projeto: `00e781a`. 5 arquivos (4 novos + `mix.exs`), 13
testes.

**O que foi feito.** `_gestao/ci.json` com os cinco estagios; `lib/fabrica/ci.ex` com a
leitura e a regra de execucao; `lib/mix/tasks/fabrica.ci.ex` como casca; 13 testes em
`test/mix/ci_test.exs`.

**A execucao esta partida em duas metades, de proposito.** `Fabrica.CI.executar/2` RECEBE a
funcao que roda um estagio; `rodar_estagio/1` e a metade que fala com o sistema. E isso que
torna a regra "o primeiro que falhar interrompe os seguintes" testavel sem esperar minutos
pela PLT e — mais importante — sem precisar de um comando que falhe de verdade para provar a
interrupcao.

**Estagio pulado APARECE no relatorio**, marcado `PULADO`, na posicao dele. Nao some de
proposito: estagio que desaparece da saida e estagio que ninguem percebe que parou de rodar.
E o mesmo defeito de "sensor sem atuador" visto pelo avesso.

**Windows: `mix` e um `.bat`,** e `System.cmd("mix", ...)` nao o encontra. A chamada passa
por `cmd /c`. Sem isso a tarefa funcionaria num CI Linux e falharia justamente na maquina
onde a v2 e desenvolvida.

**`mix.exs` ganhou `dialyzer: [plt_add_apps: [:mix, :ex_unit]]`.** Sem `:mix` na PLT, o
Dialyzer reportava seis `unknown_function` para `Mix.shell/0` e `Mix.raise/1` — funcoes que
existem. Ou seja, o estagio `tipos` reprovava por ignorancia da PLT, e nao por defeito no
codigo. Com a correcao: `Total errors: 0`. A PLT ficou construida, o que destrava o criterio
2 da T-009 (que roda `mix fabrica.ci` completo).

**O MECANISMO SE PROVOU PELO CAMINHO REAL, e nao so por teste.** A primeira execucao de
`mix fabrica.ci --rapido` REPROVOU no estagio `lint`, por dois apontamentos do Credo dentro
do proprio `ci.ex` (`cond` com uma condicao so, e aninhamento profundo). Ele imprimiu a
saida do estagio quebrado, informou `2 estagio(s) nem chegaram a rodar` e saiu com codigo 1.
Isso vale mais que o teste verde: a doutrina da fabrica e que teste e documentacao nao provam
alcancabilidade — usar pelo caminho real, prova.

**DOIS TESTES MEUS ESTAVAM ERRADOS, e o conserto foi neles.** No teste do modo rapido eu
chamava o helper `chamados/0` duas vezes; ele DRENA a caixa de mensagens, entao a segunda
chamada devolvia `[]` e o `refute "tipos" in chamados()` passava por vazio — nao podia falhar
nunca. Passou a ler uma vez so, numa variavel. E havia uma variavel nao usada gerando aviso.

**ACHADO SOBRE O CRITERIO 1, que nao virou mudanca.** O texto diz "roda os CINCO estagios e
imprime o resultado de cada um", mas o comando dele e `mix fabrica.ci --rapido`, que roda
quatro e pula o `tipos`. Rodei o comando como esta escrito (passou) e, alem dele, rodei
`mix fabrica.ci` completo para provar o que o texto pede. Nao reescrevi o criterio. E o mesmo
padrao ja anotado na T-002.

## Verificacao

**Criterio 1 — `mix fabrica.ci` roda os estagios e imprime o resultado de cada um, nomeado.**
`verificar: mix fabrica.ci --rapido` → **exit 0**

    bateria de verificacao — 5 estagios declarados
    modo rapido: o estagio `tipos` sera pulado

      formato    ok        2.6s
      compilar   ok        2.9s
      lint       ok        4.3s
      testes     ok        6.7s
      tipos      PULADO       —

    bateria passou: 4 estagio(s) ok, 1 pulado(s)

Como o comando do criterio nao exercita os cinco (ver Notas), rodei tambem o completo:

    mix fabrica.ci → exit 0
      formato ok 2.7s · compilar ok 2.7s · lint ok 4.3s · testes ok 6.7s · tipos ok 14.9s
      bateria passou: 5 estagio(s) ok, 0 pulado(s)

**Criterio 2 — um estagio que falha interrompe os seguintes e o comando sai com codigo
diferente de zero.** `verificar: mix test test/mix/ci_test.exs` → **exit 0**

    13 tests, 0 failures

O teste `para no primeiro erro e devolve :erro` monta quatro estagios, faz o segundo falhar,
e afirma que os DOIS seguintes nem foram chamados e que o relatorio tem so duas linhas. O
codigo de saida diferente de zero foi observado no caminho real: a reprovacao no `lint`
descrita nas Notas saiu com `exit=1`.

**Criterio 3 — `_gestao/ci.json` existe e declara os cinco estagios com os comandos reais.**
INSPECIONADO, e tambem travado por teste
(`e lido e declara os cinco estagios, na ordem, com os comandos reais`):

    formato   mix format --check-formatted
    compilar  mix compile --warnings-as-errors
    lint      mix credo --strict
    testes    mix test
    tipos     mix dialyzer

Ha teste afirmando que so `tipos` tem `rapido: false` e que todo estagio traz descricao
nao vazia.

**Criterio 4 — `mix fabrica.ci --rapido` pula o estagio `tipos` e roda os outros quatro.**
Provado nas duas pontas: na saida real acima (`tipos PULADO`, "4 estagio(s) ok, 1 pulado(s)")
e no teste `pula o estagio nao-rapido e roda os outros`, que confere a lista exata de
chamados (`formato, compilar, lint, testes`) e a ausencia de `tipos`.

## Conformidade


## Revisao
