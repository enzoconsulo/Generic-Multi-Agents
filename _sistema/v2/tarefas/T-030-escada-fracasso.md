---
id: T-030
titulo: A escada de resposta ao fracasso, e o limite de 3 ciclos
projeto: fabrica-v2
versao: v0.3
status: concluida
prioridade: alta
dependencias: [T-029]
areas: [lib/fabrica/retrabalho/escada.ex, test/fabrica/retrabalho/escada_test.exs, test/support/fonte.ex, test/fabrica/tarefas/transicao_test.exs, test/fabrica/marco_v01_test.exs, _gestao/GUIA.md]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-31
---

## Objetivo
Os quatro degraus: sobe de modelo, troca de especialista, replaneja, bloqueia. Cada um so e
usado depois que o anterior falhou de verdade.

## Contexto
O gatilho e sempre FATO REGISTRADO, nunca palpite sobre dificuldade:

  1. **1a reprovacao -> sobe de modelo.** Insistir no mesmo modelo paga construtor,
     verificador e revisor de novo e queima uma das tres tentativas.
  2. **2a reprovacao sob o MESMO especialista -> troca de especialista** (vai para o
     reforcado generico). Ele foi escolhido no planejamento, antes de se saber onde a
     tarefa iria falhar; duas reprovacoes sob o mesmo prompt de dominio sao evidencia de
     que a especializacao esta enviesando o ataque. Registre a troca e o motivo.
  3. **3 ciclos esgotados -> replanejamento.** O planejador quebra a tarefa em 2–3 menores,
     que entram na fila como novas; a original vira `cancelada` com referencia. E o
     reconhecimento de que o problema pode ser de DIMENSIONAMENTO, nao de execucao.
  4. **Esgotou de novo -> bloqueia.** Autocorrecao vale UMA vez por linhagem: tarefa que ja
     nasceu de replanejamento (tem `replanejada_de`) nao replaneja outra vez.

`tentativas` conta EXECUCOES, nao reprovacoes — e quem conta e o sistema (T-022).

Ha um teto que o motor impoe sozinho, sem confiar em ninguem: **maximo de despachos por
tarefa numa rodada**. A v1 mediu 41 despachos e US$ 22,55 numa rodada so quando o contador
nao era incrementado. Mesmo com o contador correto, o teto fica — defesa em profundidade.

## Criterios de aceite
- [x] Cada degrau dispara na condicao certa, e nao antes (um teste por degrau).
      `verificar: mix test test/fabrica/retrabalho/escada_test.exs`
- [x] Tarefa com `replanejada_de` preenchido bloqueia em vez de replanejar de novo.
      `verificar: mix test test/fabrica/retrabalho/escada_test.exs`
- [x] A troca de especialista e registrada com o motivo.
      `verificar: mix test test/fabrica/retrabalho/escada_test.exs`
- [x] O teto de despachos por tarefa por rodada corta mesmo quando `tentativas` esta correto.
      `verificar: mix test test/fabrica/retrabalho/escada_test.exs`

## Notas de execucao

**Cada degrau ganhou duas metades de teste: quando dispara, e quando NAO dispara.** Escada que
sobe cedo demais gasta modelo caro em tarefa facil; escada que sobe tarde demais queima as tres
fichas repetindo a aposta que ja falhou. Sao erros opostos e os dois custam, entao testar so a
metade positiva deixaria metade do risco de fora.

**O degrau 2 exige evidencia, e nao contagem.** *"2a reprovacao sob o MESMO especialista"* nao
e "2 tentativas + tem especialista": e a lista de especialistas usados, na ordem, com o mesmo
nome nas duas. Ha tres testes negativos: primeira reprovacao com especialista, dois ciclos com
especialistas DIFERENTES, e lista de um item so. Sem eles, a troca dispararia em situacoes onde
a evidencia — *"o mesmo prompt de dominio falhou duas vezes"* — nao existe.

E tarefa **sem** especialista nunca chega ao degrau 2: ela ja roda no generico, entao nao ha o
que trocar. Continua no degrau 1.

**O esgotamento vence a troca de especialista.** Com 3 tentativas e o mesmo especialista as
duas condicoes valem, e quem manda e o esgotamento: nao ha ficha para gastar com outro
construtor. Ha teste.

**O teto de despachos e checado ANTES de tudo, inclusive do bloqueio.** E o ponto dele: nao
confia na escada, nao confia no contador e nao confia em quem os escreveu. Se a escada tiver um
defeito que a faca girar, e o teto que corta. Na v1, sem ele, uma rodada mediu **41 despachos e
US$ 22,55** com a mesma tarefa girando sem nunca esgotar ciclo.

O numero (12) tem aritmetica: 3 ciclos x 3 papeis = 9 despachos no pior caso legitimo, mais
folga. Ha teste afirmando `teto > max_tentativas * 3` — o que trava a RELACAO e nao o valor,
para o numero poder mudar sem o teste virar decoracao.

**Teto e bloqueio sao coisas diferentes, e ha teste para a diferenca.** Bloqueada espera o
usuario; cortada pelo teto volta sozinha na rodada seguinte, porque o teto e sobre a RODADA e
nao sobre a tarefa. Confundir os dois transformaria uma rodada movimentada em tarefa bloqueada.

**TRES achados fora do escopo, todos vindos do proprio sistema de testes:**

**1. O teste estrutural da T-022 reprovou, e estava certo.** `@type situacao` da `Escada` tem
`tentativas: non_neg_integer()`, e o detector de *"quem escreve tentativas"* o acusou. E o
mesmo tipo de falso positivo que ja custou quatro ocorrencias: a afirmacao e sobre ESCRITA e o
padrao so enxerga SINTAXE. Refinei o padrao para exigir que o valor **nao tenha cara de tipo**.

**2. O refinamento nasceu quebrado por backtracking.** Escrevi
`\btentativas:\s*(?!tipo)` — e o `\s*` casa zero caracteres, o lookahead passa a olhar o
espaco em vez do valor, e a negacao nunca dispara. O padrao voltou a aceitar tipo e o teste
falhou de novo. Conserto: o espaco vai DENTRO do lookahead. Ficou registrado no comentario,
porque e um erro que se repete.

**3. Sobrou um doctest** (`%{tentativas: 1}` no `@doc` da Escada), e ai vi que estava prestes a
escrever a **segunda copia** do removedor de docstring — a primeira mora no marco da v0.1
desde a T-014. Extrai para `test/support/fonte.ex` e fiz o marco delegar para la.

O `@moduledoc` de `Fabrica.Fonte` lista os **cinco** falsos positivos que motivaram o helper
(T-014, T-016, T-018, T-022, T-030). Cinco ocorrencias da mesma forma nao sao cinco enganos:
sao um helper que faltava. E o que a secao "ja existe — nao reinvente" do GUIA existe para
forcar, e desta vez ela forcou.

## Verificacao

**Criterio 1 — cada degrau dispara na condicao certa, e nao antes (um teste por degrau).**
`verificar: mix test test/fabrica/retrabalho/escada_test.exs` -> **exit 0**

    1 doctest, 24 tests, 0 failures

Quatro blocos, um por degrau, cada um com a metade positiva e as negativas: degrau 1 (3
testes), degrau 2 (5), degrau 3 (4), degrau 4 (3). Mais dois testes que percorrem a escada
inteira — uma tarefa sem especialista e outra com — conferindo a sequencia dos degraus.

**Criterio 2 — tarefa com `replanejada_de` bloqueia em vez de replanejar de novo.**
`verificar: mix test test/fabrica/retrabalho/escada_test.exs` -> **exit 0**

Tres testes: bloqueia com o motivo citando *"uma vez por linhagem"*; `replanejada_de` nulo ou
vazio NAO bloqueia; e tarefa replanejada com ciclo sobrando ainda trabalha normalmente — ser
fruto de replanejamento nao a torna suspeita, so lhe tira a segunda chance de ser replanejada.

**Criterio 3 — a troca de especialista e registrada com o motivo.**
`verificar: mix test test/fabrica/retrabalho/escada_test.exs` -> **exit 0**

O motivo **nomeia o especialista** e diz as duas razoes: ele foi escolhido antes de se saber
onde a tarefa iria falhar, e duas reprovacoes sob o mesmo prompt sao evidencia de vies. Ha
tambem um teste afirmando que **toda** decisao carrega motivo nao vazio.

**Criterio 4 — o teto de despachos corta mesmo quando `tentativas` esta correto.**
`verificar: mix test test/fabrica/retrabalho/escada_test.exs` -> **exit 0**

Seis testes: corta com ciclo sobrando; vem antes de tudo, inclusive do bloqueio; abaixo do teto
nao corta; **teto nao e bloqueio**; o teto cabe o pior caso legitimo com folga; e sem o campo
declarado assume zero.

**Bateria completa** — `verificar: mix fabrica.ci` -> **exit 0**

      formato    ok        2.8s
      compilar   ok        2.7s
      lint       ok        6.2s
      testes     ok       20.3s
      tipos      ok       18.3s

    bateria passou: 5 estagio(s) ok, 0 pulado(s)

    17 doctests, 758 tests, 0 failures

Eram 734 antes; a T-030 acrescentou 24 testes e 2 doctests (um da Escada, um do `Fonte`).

## Conformidade

Os quatro criterios estao cumpridos, e os quatro degraus existem com o gatilho que a tarefa
declarou — sempre **fato registrado**, nunca palpite sobre dificuldade.

**O que a tarefa pediu e nao esta nos criterios:** *"`tentativas` conta EXECUCOES, nao
reprovacoes — e quem conta e o sistema (T-022)"*. Nao ha nada a implementar aqui: e a T-022 que
garante, e o teste estrutural dela **reprovou nesta tarefa** justamente por estar cumprindo o
papel. A escada so LE o contador.

**O teto (12) e escolha minha**, e o que os testes travam e a relacao (`> max_tentativas * 3`),
nao o valor. A aritmetica esta no `@moduledoc`.

**Ampliei as `areas`** para incluir `test/support/fonte.ex` (o helper extraido),
`test/fabrica/tarefas/transicao_test.exs` e `test/fabrica/marco_v01_test.exs` (os dois clientes
dele) e o `GUIA.md` — antes de tocar em qualquer um.

**Alterei um teste de marco ja aprovado** (`marco_v01_test.exs`), e registro de proposito: e
extracao de helper, nao relaxamento. As afirmacoes do marco sao exatamente as mesmas, e o
`limpar/1` que elas usam agora e o mesmo codigo, num lugar so.

## Revisao

Revisao do proprio diff. Achados, todos tratados:

- **Falso positivo no detector de `tentativas`** (o `@type` da Escada). Corrigido no DETECTOR,
  nao no codigo — a Escada le o contador legitimamente.
- **O conserto do detector nasceu quebrado**, por backtracking do `\s*` antes do lookahead.
  Corrigido, e o porque ficou no comentario: e um erro de regex que se repete.
- **Segunda copia do removedor de docstring**, evitada por extracao. `Fabrica.Fonte` agora e o
  lugar unico, com os cinco falsos positivos historicos listados no `@moduledoc`.

Um ponto registrado sem conserto: **`mesmo_especialista?/1` compara por NOME**. Se o mesmo
especialista for versionado entre os dois ciclos (T-024 permite), os dois nomes continuam
iguais e a troca dispara — mesmo tendo sido dois prompts diferentes. E o comportamento certo
para o caso comum e discutivel no raro; anotar exigiria a Escada saber a versao usada em cada
ciclo, o que so faz sentido quando `ciclos` guardar essa referencia.
