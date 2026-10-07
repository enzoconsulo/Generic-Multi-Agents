---
id: T-035
titulo: "ABERTURA da v0.4: conferir concorrencia e numeros medidos"
projeto: fabrica-v2
versao: v0.4
status: concluida
prioridade: alta
dependencias: [T-034]
areas: [_gestao/PROGRESSO.md, _sistema/v2/tarefas]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-09-13
---

## Objetivo
Antes de implementar a concorrencia, confrontar o plano com o que a v0.3 mediu de verdade —
e com o que as bibliotecas de fila e supervisao oferecem hoje. Nenhum codigo de producao.

## Contexto
**Releia:** `_sistema/PLANO_V2.md` (bloco da v0.4) e `_sistema/DECISOES_FECHADAS.md`,
especialmente o item sobre `git worktree` por verificador, que e uma otimizacao JA
DESCARTADA com medicao — nao a reinvente aqui.

**Confira e ajuste:**

  1. **Os custos que a v0.3 mediu de verdade.** O teto por tarefa e a estimativa da proxima
     foram escritos com numeros da v1. Agora existem numeros da v2. Se divergirem muito,
     corrija os defaults das tarefas desta versao — e registre os dois numeros lado a lado.
  2. **O paralelismo acontece de fato?** A v1 mediu que quase nunca havia duas tarefas
     despachaveis com `areas` disjuntas ao mesmo tempo: em 43 rodadas, o 3-wide de
     construtores nao ocorreu uma vez. Se o mesmo valer aqui, o valor desta versao esta na
     SUPERVISAO e na RECUPERACAO, nao na vazao — e a tarefa de paralelismo pode encolher.
     Meca antes de decidir.
  3. **A versao atual do Oban** e a API dela. Fila durable e area que muda entre versoes
     maiores; confira a documentacao corrente antes de escrever a migracao.
  4. **O formato da mensagem de cota do CLI.** A T-018 extraiu o horario de reabertura de um
     formato observado em 2026. Confirme que ele continua o mesmo — e, se nao, ajuste o
     parse ANTES de a v0.4 depender dele.
  5. **A memoria disponivel na maquina onde isto vai rodar.** Tres agentes em paralelo mais
     Postgres mais a suite de um projeto e o pico de consumo do sistema inteiro. Meca o
     pico real na v0.3 e decida o limite de concorrencia com esse numero, nao com o 3
     escrito no plano.

**Registre em `_gestao/PROGRESSO.md`** o que foi conferido, o que mudou e por que.

## Criterios de aceite
- [x] Os custos medidos na v0.3 foram comparados com os defaults do plano, e os dois numeros estao registrados.
- [x] Foi medido se o paralelismo de construtores acontece de fato, e a conclusao esta registrada.
- [x] O formato da mensagem de cota do CLI foi reconferido contra a realidade atual.
- [x] O limite de concorrencia foi decidido a partir do pico de memoria MEDIDO, nao do numero do plano.

## Notas de execucao
BLOQUEADA em 09/09 pelo orquestrador, ANTES de gastar despacho. Dois motivos independentes,
e nenhum deles o construtor pode resolver de dentro do ciclo:

1. FORA DO CONFINAMENTO. A tarefa manda reler `_sistema/PLANO_V2.md` e
   `_sistema/DECISOES_FECHADAS.md`, e declara `_sistema/v2/tarefas` como area de escrita.
   Esses caminhos existem — mas na RAIZ DA FABRICA, fora de `projetos/fabrica-v2/`, que e o
   confinamento do agente. Ele nao tem como ler o que a tarefa manda reler, e o que escrevesse
   em `_sistema/` nem entraria no commit (`commitarTarefa` commita as `areas` resolvidas
   contra o projeto). Escreveria de olhos fechados e passaria no portao por julgamento — os
   quatro criterios sao todos de julgamento, sem um `verificar:` que desminta.

2. FORA DE HORA. E a ABERTURA da v0.4 — o reconhecimento que decide COMO construi-la. A v0.4
   ja esta construida: T-036, T-037, T-038, T-039 e T-040 concluidas, e a T-041 e o marco
   dela. Conferir agora "se o paralelismo acontece de fato" para "decidir se a tarefa de
   paralelismo pode encolher" e reconhecimento depois da batalha.

O QUE AINDA VALE, e por isso isto e bloqueio e nao cancelamento: os itens 1, 2 e 5 (custo real
medido da v0.3 contra os defaults do plano; se o 3-wide de construtores ocorre mesmo; pico de
memoria real com tres agentes + Postgres + suite) continuam sendo perguntas boas — agora como
RETROSPECTIVA, alimentando a v0.5, e respondiveis com dados que so existem na raiz da fabrica
(`painel/dados/jobs/`). Isso e replanejamento, que por decisao do usuario (09/09) fica com ele.
Reescrever a tarefa dentro do confinamento, ou assumi-la no chat, sao os dois caminhos.

### Feita no chat pelo orquestrador, a pedido do Enzo (2026-09-13), como RETROSPECTIVA

O Enzo escolheu o segundo caminho. Sem codigo de producao, e sem gastar despacho: tudo medido a
partir do disco — os 45 jobs de `/trabalhar fabrica-v2` do painel da v1 (`painel/dados/jobs/`,
03 a 12/09), o `painel/dados/pulso.log` (16.535 amostras de memoria, uma a cada 30 s) e duas
execucoes cronometradas da suite. Resultado completo, com as tabelas, em `_gestao/PROGRESSO.md`
(v0.4, "Retrospectiva da T-035"); decisao do limite em `_gestao/DECISOES.md` (D-003).

1. **Custos.** Default da v2 (`@estimativa_padrao`, herdado da v1): US$ 7,82. Medido por tarefa
   concluida: media 9,96, mediana 10,34; razao contabil 11,04. O default fica ~22-29% abaixo — o
   lado ruim. E `@fracao_padrao_por_tarefa` 0,3 sobre o teto de rodada mais usado (US$ 8) da US$
   2,40, abaixo da tarefa mais barata medida (4,13). Registrado lado a lado; NAO alterado aqui
   (sem codigo, e o numero certo depende da janela da comparacao final) — vira entrada da T-049.
2. **Paralelismo.** 148 despachos, zero sobreposicoes: o motor da v1 despacha so `passos[0]`. Mas
   em 13/09 havia 7 tarefas prontas com `areas` disjuntas duas a duas — oportunidade real, ao
   contrario da v1. A T-038 nao encolhe; o limite passa a vir da memoria (item 5).
3. **Oban.** `mix.lock` com 2.24.1, a estavel mais recente no hex.pm (03/09/2026). Nada a ajustar.
4. **Mensagem de cota.** 18 mensagens reais; 17 com `H:MM`, uma com hora cheia (`resets 9am`),
   que o parser da T-039 devolve como `nil`. Corretiva criada: T-039a.
5. **Memoria.** Rodada serial acrescenta ~0,9 GB; suite completa: BEAM 169 MB + Postgres ate 601
   MB; um `claude` ~375 MB. Pior caso da configuracao atual (7 agentes) ~4 GB so da fabrica — nao
   cabe com folga no perfil alvo de 8 GB. Decisao D-003: no perfil alvo, `construtor: 2,
   verificador: 1, revisor: 1`; implementacao na T-038a.

## Verificacao
Sem `verificar:` — os quatro criterios sao de julgamento. Verificacao mecanica e portao do meio
pulados por decisao do orquestrador: tarefa de medicao e registro, sem codigo executavel (CLAUDE.md
da fabrica, secao Pipeline). Nenhum arquivo de `lib/`, `test/` ou `config/` foi alterado.

## Conformidade
Conformidade: cumpre (declarada pelo orquestrador, que executou a tarefa no chat a pedido do Enzo;
nao passou por revisor).

- Criterio 1 → PROGRESSO, "Retrospectiva da T-035", item 1: default 7,82 ao lado de media 9,96,
  mediana 10,34 e razao 11,04.
- Criterio 2 → item 2: 148 despachos, 0 sobreposicoes; 7 prontas disjuntas em 13/09.
- Criterio 3 → item 4: 18 mensagens reais conferidas; divergencia da hora cheia virou T-039a.
- Criterio 4 → item 5 e D-003: limite decidido pelos numeros medidos, nao pelo 3 do plano.

## Revisao
Sem revisor: executada pelo orquestrador no chat, a pedido explicito do Enzo (2026-09-13).
