---
id: T-022
titulo: Os seis estados e a transicao transacional
projeto: fabrica-v2
versao: v0.3
status: concluida
prioridade: alta
dependencias: [T-002, T-005]
areas: [lib/fabrica/tarefas/maquina.ex, lib/fabrica/tarefas/transicao.ex, test/fabrica/tarefas/transicao_test.exs, test/fabrica/tarefas/maquina_test.exs, _gestao/GUIA.md]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-31
---

## Objetivo
A maquina de estados da tarefa: quais transicoes existem, e a garantia de que cada uma
grava estado, relatorio e custo NA MESMA TRANSACAO — ou nao grava nada.

## Contexto
Transicoes legais, e so estas:

    backlog     -> pronta         (dependencias todas concluidas)
    pronta      -> em_execucao    (despacho do construtor)
    em_execucao -> em_teste       (construtor terminou)
    em_teste    -> em_revisao     (verificador aprovou)
    em_teste    -> em_execucao    (verificador reprovou)
    em_revisao  -> concluida      (revisor aprovou)
    em_revisao  -> em_execucao    (revisor reprovou)
    qualquer    -> bloqueada      (esgotou ciclos)
    qualquer    -> cancelada      (replanejamento)

Toda transicao ilegal devolve `{:erro, {:transicao_invalida, de, para}}`. A funcao que
decide e PURA (`Maquina.pode?/2`); a que executa faz o `Ecto.Multi`.

A transacao carrega TRES coisas juntas: o novo status, a linha nova em `ciclos` com o
relatorio da etapa, e as linhas de `consumos` do despacho. Nao existe tarefa que mudou de
estado sem deixar registrado por que, nem custo gasto que nao esteja ligado a um resultado.

`tentativas` e incrementado pelo SISTEMA no momento em que a tarefa e entregue a um
construtor — nunca pelo agente. Na v1 o agente as vezes esquecia e a mesma tarefa girava:
uma rodada mediu 41 despachos e US$ 22,55.

O teste que importa: forcar um erro no meio do Multi e conferir que NADA foi gravado —
nem o status, nem o ciclo, nem o consumo.

## Criterios de aceite
- [x] Cada transicao legal e aceita e cada ilegal e recusada com erro nomeado (uma por teste).
      `verificar: mix test test/fabrica/tarefas/transicao_test.exs`
- [x] Erro no meio da transacao nao grava NADA: status, ciclo e consumos ficam como estavam.
      `verificar: mix test test/fabrica/tarefas/transicao_test.exs`
- [x] `tentativas` e incrementado pelo sistema ao entregar a tarefa ao construtor, nunca pelo agente.
      `verificar: mix test test/fabrica/tarefas/transicao_test.exs`
- [x] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao

**Dois modulos, e a fronteira entre eles e o ponto da tarefa.** `Maquina` e pura — o mapa de
transicoes e nada mais. `Transicao` grava. A separacao paga em teste: as 64 combinacoes de
oito estados sao varridas sem banco, uma por teste, em milissegundos; e nao existe caminho
pelo qual alguem escreva estado sem passar pela pergunta, porque quem escreve chama quem
pergunta.

**O que "qualquer -> bloqueada / cancelada" quer dizer.** O plano usa a palavra "qualquer" e
ela e ambigua nos extremos. Decidi, e registrei no `@moduledoc`:

- `concluida` NAO e origem de nada — desfazer o que passou pelos dois portoes nao e
  transicao, e tarefa nova.
- `bloqueada -> cancelada` E legal, e nao por simetria: e o caminho da autocorrecao que a
  fabrica ja pratica (esgotou os 3 ciclos -> bloqueia -> planejador reescreve -> a original
  vira `cancelada` e as substitutas nascem com `replanejada_de`). Sem esta aresta o
  replanejamento nao teria como fechar a original.
- `cancelada` NAO e origem de nada.

Resultado: 18 legais, 46 ilegais. A lista de legais no teste foi transcrita do PLANO, nao
copiada do modulo — teste que le a tabela da producao so prova que dois arquivos concordam, e
concordariam igualmente se ambos estivessem errados.

**O off-by-one de `tentativas`, explicitado.** O campo conta *quantas vezes a tarefa ja foi
entregue a um construtor*, e o incremento acontece ao ENTRAR em `em_execucao` — venha ela de
`pronta` (primeira vez) ou de `em_teste`/`em_revisao` (retrabalho). Consequencia, que e a que
o resto da fabrica le: na hora de escolher o modelo do PROXIMO despacho, `tentativas >= 1`
significa que ja houve execucao anterior. E exatamente a regra da v1, agora impossivel de
esquecer.

**`ciclos.numero` e lido ANTES do incremento** (`max(tentativas, 1)`). Assim o laudo do
verificador que REPROVA cai no ciclo que acabou de falhar, e nao no que ainda vai comecar; e
os tres papeis de uma mesma passagem compartilham o numero, que e o que o indice unico
`(tarefa, numero, papel)` espera.

**Leitura com `FOR UPDATE` dentro da transacao.** O `status` conferido e o `tentativas`
incrementado precisam ser os do banco no instante da escrita, e nao os de uma struct que o
chamador carregou faz tempo. Ha dois testes so para isso, e o segundo e o que importa: com
struct velha, um incremento ingenuo devolveria 1 de novo a cada entrega, e a tarefa giraria
para sempre sem esgotar ciclo — a falha de US$ 22,55 medida na v1.

**`acrescentar/4` nasceu de um aviso do Dialyzer e ficou por merito proprio.** Tentei
eliminar um `call_without_opaque` extraindo o corpo de `montar/3` para uma funcao que recebe
o Multi pronto. **Nao resolveu** — o aviso so mudou de linha (ver Verificacao). Mantive a
funcao mesmo assim: e por ela que a T-037 vai enfileirar e mudar estado na mesma transacao
sem duplicar isto, e ha dois testes provando que o trabalho de fora cai junto quando a
transicao e ilegal.

**Dois testes meus estavam errados, e a correcao foi no teste nos dois casos:**

1. *"le o estado do banco"* afirmava que `pronta -> em_execucao` seria recusada depois de um
   `backlog -> pronta`. E legal. A premissa estava quebrada; reescrevi para um caso em que a
   struct velha (`backlog`) permitiria e o banco (`cancelada`) recusa.
2. *"so a Transicao menciona tentativas"* acusou quatro modulos que citam a palavra em prosa
   justamente para dizer que NAO a escrevem. Ajustei o DETECTOR, nao o texto: ele procura a
   atribuicao (`tentativas:` como chave de mapa) e acha exatamente um lugar em toda a
   producao. Foi a licao dos tres falsos positivos da v0.1, aplicada de primeira desta vez —
   com auto-teste do detector ao lado.

**A revisao do proprio diff achou uma borda, e ela e do tipo que so aparece em producao.**
`conferir_opcoes/1` usava `Keyword.has_key?`, que responde "sim" para `papel: nil`. Nesse caso
a conferencia deixava passar um `:despacho`, e o Multi estourava com `MatchError` procurando
um `:ciclo` que `talvez_ciclo/2` nao criou — erro de programacao disfarcado de falha de banco,
o pior lugar para se descobrir. O que decide agora e o VALOR da opcao, nao a presenca da
chave, e ha teste para o caso.

**Duas armadilhas novas de ambiente, agora no GUIA:** o `mix format` grava CRLF nesta maquina
e o `credo --strict` reprova por Consistency — nao e evento raro, reaparece em toda tarefa que
edita `.ex`. E `banco-v2.ps1 subir` reporta "NAO subiu" durante recuperacao de queda, com o
servidor subindo sozinho ~45 s depois (fsync da arvore inteira, medido em 44,25 s).

**ACHADO FORA DO ESCOPO, e ele importa: `mix fabrica.ci` ja estava VERMELHO no HEAD.** Rodei
a bateria completa e o estagio `tipos` reprovou com 8 erros. Fiz `git stash` e rodei de novo
sem o meu trabalho: **7 erros ja existiam** na T-019. A T-018 registra em Notas que "o
`mix fabrica.ci` completo continua verde"; a T-019 so registra `mix verificar`, que NAO inclui
`tipos`. Ou seja: a bateria existe, o estagio e declarado nao-opcional no `ci.json`, e ninguem
a rodou por uma tarefa inteira. **E o defeito recorrente desta fabrica outra vez — sensor sem
atuador — na forma "a verificacao existe e o laco nao a le".** Diagnostiquei os oito e abri a
`T-022a` para conserta-los; nenhum e bug de execucao. Nao consertei aqui de proposito: sao
tres arquivos fora das `areas` desta tarefa, e um deles (`claude_cli`) pede decisao sobre o
contrato do `Comando`.

## Verificacao

**Criterio 1 — cada transicao legal e aceita e cada ilegal e recusada com erro nomeado (uma
por teste).** `verificar: mix test test/fabrica/tarefas/transicao_test.exs` -> **exit 0**

As 64 combinacoes viram 64 testes gerados em `test/fabrica/tarefas/maquina_test.exs`: 18
`... e aceita` e 46 `... e recusada com erro nomeado`, mais tres testes que impedem a
varredura de passar por vazio (as listas somam 8x8, sao disjuntas, e os estados da Maquina
sao os do esquema). Estado desconhecido devolve `{:erro, {:transicao_invalida, ...}}` em vez
de estourar.

**Criterio 2 — erro no meio da transacao nao grava NADA.**
`verificar: mix test test/fabrica/tarefas/transicao_test.exs` -> **exit 0**

Dois testes, e sao duas naturezas diferentes de falha, de proposito:

- *changeset invalido* (consumo com `volta: 0`): o teste inspeciona o `changes_so_far` do
  `Ecto.Multi` e prova que `tarefa`, `ciclo` e `despacho` CHEGARAM a ser aplicados dentro da
  transacao — e depois prova que o banco nao ficou com nenhum deles. E a diferenca entre "deu
  erro" e "desfez", e e a unica forma de este teste reprovar se alguem trocar o Multi por
  chamadas em sequencia.
- *violacao de indice unico* (dois laudos do mesmo papel no mesmo ciclo): a falha so acontece
  na ida ao banco, caminho que o primeiro teste nao cobre. O `status` volta ao que era.

**Criterio 3 — `tentativas` e incrementado pelo sistema ao entregar ao construtor, nunca pelo
agente.** `verificar: mix test test/fabrica/tarefas/transicao_test.exs` -> **exit 0**

Seis testes: entrar em `em_execucao` gasta uma tentativa; os tres caminhos ate la gastam
igual; **nenhuma outra transicao mexe no contador** (seis pares conferidos); o incremento e
transacional (falhou o consumo, nao gastou tentativa); e existe **um unico lugar em toda a
producao que escreve o campo** — `transicao.ex` —, com auto-teste do detector ao lado. A
outra metade da regra (o agente nao tem ferramenta de escrever estado) ja e travada pela
T-016 no catalogo, e o teste aponta para la em vez de duplicar.

**Criterio 4 — `mix verificar` continua passando.** `verificar: mix verificar` -> **exit 0**

    535 mods/funs, found no issues.
    2 doctests, 513 tests, 0 failures

Eram 412 testes antes da tarefa; a T-022 acrescentou 101.

**Bateria completa (`mix fabrica.ci`) — REPROVA no estagio `tipos`, e ja reprovava antes.**
8 erros do Dialyzer, dos quais **7 sao anteriores a esta tarefa** (conferido com `git stash`:
o HEAD da T-019 ja tinha os 7). O 8o e meu e e da mesma classe de um dos 7 — a opacidade de
`MapSet` dentro de `Ecto.Multi`, falso positivo conhecido. Detalhe e conserto na `T-022a`.

## Conformidade

A tarefa pediu tres coisas e as tres estao entregues, nos termos em que foram pedidas:

1. **"quais transicoes existem"** — as nove linhas do plano viraram 18 arestas legais, com as
   tres leituras de "qualquer" decididas e justificadas por escrito (nao por simetria).
2. **"a funcao que decide e PURA; a que executa faz o `Ecto.Multi`"** — dois modulos, e a
   pureza e verificavel: `maquina_test.exs` roda sem `DataCase`.
3. **"a transacao carrega TRES coisas juntas"** — status, ciclo e consumos, mais o despacho
   que liga consumo a ciclo (o esquema da T-002 exige o intermediario; sem ele os consumos
   nao teriam onde pendurar).

**O que foi acrescentado alem do pedido, e por que:** `acrescentar/4` (composicao de Multi) e
o bloqueio `FOR UPDATE`. O primeiro nasceu de uma tentativa de conserto e ficou porque a T-037
depende dele. O segundo nao e escopo extra: sem ele, "a transacao carrega as tres juntas"
seria verdade para uma transicao isolada e falsa para duas simultaneas, e a frase perderia o
sentido. A serializacao da FILA continua sendo da T-037, e esta dito no `@moduledoc`.

**Nada foi escrito fora das `areas`** — que foram ampliadas ANTES de comecar, para incluir
`maquina_test.exs` e o `GUIA.md`.

## Revisao

Revisao do proprio diff, nesta sessao em que o Enzo pediu execucao direta. Achados, todos
tratados antes de fechar:

- **Borda real:** `papel: nil` furava a conferencia de opcoes (corrigida, com teste — ver
  Notas). Era a unica forma conhecida de esta tarefa estourar com erro nao-nomeado.
- **Dois testes que nao testavam o que diziam:** um com premissa quebrada, outro com detector
  impreciso. Corrigidos no TESTE e no DETECTOR, nunca contorcendo a producao.
- **Regressao herdada, fora do escopo:** `mix fabrica.ci` vermelho desde a T-019,
  diagnosticado e transformado na `T-022a` em vez de consertado as pressas aqui.

Sem achado de correcao, seguranca ou caso de borda pendente no codigo entregue.
