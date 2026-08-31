---
id: T-023
titulo: Promocao por dependencias e ordenacao da fila
projeto: fabrica-v2
versao: v0.3
status: concluida
prioridade: alta
dependencias: [T-022]
areas: [lib/fabrica/tarefas/fila.ex, test/fabrica/tarefas/fila_test.exs, _gestao/GUIA.md]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-31
---

## Objetivo
Decidir, deterministicamente, quais tarefas passam de `backlog` para `pronta` e em que
ordem despachar as prontas.

## Contexto
Funcoes PURAS sobre uma lista de tarefas — sem I/O. E o porte de `pipeline/maquina.ts` da
v1 (`promoverProntas`, `proximosPassos`), que ja e puro e ja tem teste: traduza os casos
de teste junto com o codigo.

`promover/1` — uma tarefa vira `pronta` quando TODAS as suas dependencias estao
`concluida`. Dependencia `cancelada` conta como satisfeita se houver substituta concluida
(replanejamento); dependencia `bloqueada` NAO satisfaz.

`proximos/2` — ordena por prioridade, depois por codigo. Devolve no maximo 3 passos
paralelos, e so entre tarefas cujas `areas` sejam DISJUNTAS. Duas tarefas que tocam o
mesmo arquivo nunca saem juntas.

Ciclo de dependencias e defeito de planejamento, nao situacao normal: detecte e devolva
`{:erro, {:ciclo, caminho}}` em vez de travar.

## Criterios de aceite
- [x] Tarefa com todas as dependencias concluidas e promovida; com uma pendente, nao.
      `verificar: mix test test/fabrica/tarefas/fila_test.exs`
- [x] Duas tarefas com `areas` que se cruzam nunca saem no mesmo lote de paralelismo.
      `verificar: mix test test/fabrica/tarefas/fila_test.exs`
- [x] Ciclo de dependencias e detectado e reportado com o caminho, sem travar.
      `verificar: mix test test/fabrica/tarefas/fila_test.exs`
- [x] As funcoes sao puras: nenhum acesso a banco no caminho (inspecionavel).

## Notas de execucao

**A fonte da v1 foi lida, e ela e mais rica que o resumo do plano.**
`painel/servidor/src/pipeline/maquina.ts` tem 418 linhas e o teste dela 403; portei
`promoverProntas` e `proximosPassos` com os casos de teste junto, como a tarefa mandou. Tres
coisas que estao la e nao estao no resumo desta tarefa, e que mantive:

1. **`travadas` separa `faltando` de `inexistentes`.** Dependencia que aponta para tarefa que
   nao existe e erro de frontmatter e **nunca fecha sozinha**; misturada com "ainda nao
   terminou", ela deixa a tarefa presa para sempre sem ninguem saber por que.
2. **O desempate por quem destrava mais.** O resumo diz "prioridade, depois codigo"; a v1
   ordena por prioridade, depois por **dependentes ainda abertos**, e so entao codigo. O
   comentario la explica: sem o do meio, a ordenacao cai no codigo, que e ordem de CRIACAO,
   e numa fase madura isso inverte a fila — a tarefa que abre caminho para outras tres
   costuma ter sido criada depois delas.
3. **Tarefa sem `areas` declaradas roda sozinha** entre construtores. Conservador de
   proposito: sem areas ela pode tocar qualquer arquivo, e o custo do engano e reprovacao
   falsa.

**DUAS DIVERGENCIAS DELIBERADAS da v1, e a primeira conserta um defeito dela.**

**Dependencia `cancelada`.** A v1 a trata como faltando — ha teste afirmando isso, com este
nome: *"dependencia cancelada trava, e aparece como faltando"*. Mas o proprio protocolo da
fabrica CANCELA a tarefa original quando o replanejamento a substitui (CLAUDE.md,
"Autocorrecao"). Ou seja: **na v1, quem dependia de uma tarefa replanejada ficava preso em
`backlog` para sempre**, e nada acusava. O plano da T-023 corrige, e a correcao esta
implementada com regressao recursiva pela linhagem (`replanejada_de_id`).

Nao fui checar se isso ja aconteceu na v1 — seria pagar por medicao que nao muda a decisao,
ja que a v2 corrige de qualquer forma. Mas o sintoma, se alguem quiser procurar depois, e
tarefa em `backlog` com dependencia `cancelada` e substitutas concluidas.

**`bloqueada` nao satisfaz, nem com substituta pronta.** Ha teste so para isso. Bloqueio e
trabalho parado a espera do usuario, nao trabalho encerrado — enquanto a original nao virar
`cancelada`, o replanejamento nao terminou.

**Uma decisao que o plano deixou ambigua, e resolvi pelo lado caro de errar.** O texto diz
*"conta como satisfeita se houver substituta concluida"*. Ao pe da letra, UMA substituta
pronta bastaria — e um replanejamento que quebrou a tarefa em tres liberaria os dependentes
com um terco do trabalho feito. Implementei o estrito: **existe pelo menos uma substituta, e
cada uma delas satisfaz**. Promover cedo demais poe um construtor sobre terreno inacabado;
esperar demais so atrasa. Ha teste nomeando a alternativa que NAO foi escolhida.

**Uma simplificacao: a trilha sumiu do calculo.** A v1 recebe `trilha` e indexa
`ETAPAS[trilha][status]` — mas as duas trilhas tem **a mesma tabela**. `construtor`,
`verificador` e `revisor` sao nomes de PAPEL, e papel nao muda com o dominio; o que muda e
qual AGENTE atende cada papel, e isso e a T-024. Carregar o parametro aqui sugeriria uma
variacao que nao existe.

**A pureza e verificada, nao prometida.** Ha teste que varre o fonte e reprova se `Repo`,
`Ecto.Query` ou `from(` aparecerem. Sem ele, bastaria alguem acrescentar uma consulta "so
para conferir" e o modulo deixaria de ser testavel sem banco — que e justamente o que o torna
barato: **33 testes em 0,4 s**. E ha dois testes para a outra ponta do contrato: associacao
nao carregada devolve `{:erro, {:nao_carregado, campo}}`, e nao um `Protocol.UndefinedError`
levantado la no fundo, longe da causa.

**A deteccao de ciclo tem o teste que separa ciclo de reencontro.** Grafo em diamante — duas
tarefas dependendo da mesma terceira — e o caso que uma deteccao ingenua ("ja visitei este
no") acusaria como ciclo. Ele esta la, e passa. O caminho devolvido repete o codigo no fim de
proposito: e o que mostra ONDE o laco se fecha.

**A regra nova da T-022a rendeu na primeira tarefa em que valeu.** `mix verificar` passou
verde e o `mix fabrica.ci` reprovou em `tipos`: dois avisos de opacidade de `MapSet`, do
conjunto de "vistas" que corta a recursao da linhagem. **Consertei a estrutura em vez de
crescer a lista de filtros** — virou lista simples, porque uma linhagem de replanejamento tem
um punhado de elos e a busca linear nao custa nada. Filtrar teria escondido; trocar resolveu.
A licao entrou no GUIA, na linha do `.dialyzer_ignore.exs`: **antes de filtrar, tente trocar
a estrutura.**

## Verificacao

**Criterio 1 — tarefa com todas as dependencias concluidas e promovida; com uma pendente,
nao.** `verificar: mix test test/fabrica/tarefas/fila_test.exs` -> **exit 0**

    33 tests, 0 failures

Seis testes herdados da v1 (promove, nao promove e diz qual, inexistente separada de
pendente, sem dependencia nenhuma, so olha backlog) mais oito da v2 sobre `cancelada` e
`bloqueada`.

**Criterio 2 — duas tarefas com `areas` que se cruzam nunca saem no mesmo lote.**
`verificar: mix test test/fabrica/tarefas/fila_test.exs` -> **exit 0**

Alem do caso direto (`areas em comum: o segundo fica de fora, e o terceiro entra`), as outras
duas regras de paralelismo estao travadas: verificador sai sozinho, um por vez, e o revisor
sai junto com ele porque le o diff commitado.

**Criterio 3 — ciclo detectado e reportado com o caminho, sem travar.**
`verificar: mix test test/fabrica/tarefas/fila_test.exs` -> **exit 0**

Ciclo de dois, ciclo de tres, **diamante que NAO e ciclo**, e dependencia inexistente que nao
e confundida com ciclo.

**Criterio 4 — as funcoes sao puras (inspecionavel).** O arquivo de teste nao usa
`Fabrica.DataCase`, e ha teste varrendo o fonte por `Repo`, `Ecto.Query` e `from(`. A prova
pratica e o tempo: 0,4 s para 33 testes.

**Bateria completa** — `verificar: mix fabrica.ci` -> **exit 0**

      formato    ok        2.3s
      compilar   ok        2.4s
      lint       ok        5.2s
      testes     ok       24.4s
      tipos      ok       13.7s

    bateria passou: 5 estagio(s) ok, 0 pulado(s)

    2 doctests, 547 tests, 0 failures

Eram 514 antes; a T-023 acrescentou 33.

## Conformidade

Os quatro criterios estao cumpridos, e o porte pedido foi feito lendo a fonte da v1 e
traduzindo os casos de teste dela, como a tarefa instruiu — nao reimplementando de cabeca.

**O que diverge do texto da tarefa, e por que cada divergencia:**

| ponto | o texto diz | o entregue | razao |
|---|---|---|---|
| ordem | "prioridade, depois codigo" | prioridade, dependentes, codigo | e o que a v1 faz, e a tarefa pediu o PORTE dela |
| substituta | "se houver substituta concluida" | **cada** substituta satisfeita | promover cedo poe construtor em terreno inacabado |
| trilha | (nao menciona) | parametro removido | as duas trilhas tem a mesma tabela de papeis |

As duas primeiras entregam MAIS do que o texto pede, sem contraria-lo; a terceira remove um
parametro que nao discrimina nada. Nenhuma muda o que os criterios de aceite verificam.

**Nada foi escrito fora das `areas`**, que foram ampliadas antes de comecar para incluir o
`GUIA.md`.

## Revisao

Revisao do proprio diff. Achados, todos tratados:

- **Aninhamento profundo demais em `pendencias/3`** (reduce -> case -> if), acusado pelo
  Credo estrito. Extrai `classificar_dependencia/3` e `veredito/2`; de quebra o agrupamento
  por tipo de veredito ficou mais legivel que o acumulador de duas listas.
- **Opacidade de `MapSet`** no conjunto de vistas, acusada pelo Dialyzer. Trocada por lista
  (ver Notas) — conserto, nao filtro.
- **Recursao infinita possivel** numa linhagem de replanejamento circular. Patologica, mas o
  conjunto de vistas custa nada e ha teste para ela.

Um limite herdado, registrado no `@moduledoc` e nao consertado aqui porque o conserto e de
planejamento: a ordenacao so enxerga dependencia **declarada**. Uma tarefa de fundacao que
ninguem lista em `dependencias` continua invisivel por mais dependentes reais que tenha — foi
o caso da T-043 do banco-imobiliario, que ficou por ultimo enquanto dois jobs (US$ 14) faziam
a mao o ritual que ela existia para eliminar.
