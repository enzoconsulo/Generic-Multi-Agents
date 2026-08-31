---
id: T-029
titulo: Diagnostico de reprovacao: decidir COMO refazer, nao so que refazer
projeto: fabrica-v2
versao: v0.3
status: concluida
prioridade: alta
dependencias: [T-026, T-028]
areas: [lib/fabrica/retrabalho/diagnostico.ex, lib/fabrica/retrabalho/politica.ex, test/fabrica/retrabalho/diagnostico_test.exs, _gestao/GUIA.md]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-31
---

## Objetivo
Ler a reprovacao, classificar a natureza da falha e derivar a POLITICA do proximo despacho:
qual modelo, quantas voltas, que escopo, e com que foco.

## Contexto
E o mecanismo em que a v1 e mais rica que a documentacao do TCC. A doc descreve a escada
(sobe modelo -> troca especialista -> replaneja -> bloqueia); a v1 tem, alem dela, um
modulo que decide o TAMANHO do retrabalho. Ver `MIGRACAO_V2.md`, secao 3.

Entrada: qual portao reprovou, o veredito de conformidade, os achados com gravidade, e o
impedimento declarado pelo construtor (se houver).

Saida (`Politica`):
  - `modelo` — o do disparo na 1a tentativa; o reforcado da 2a em diante
  - `voltas` — teto ESTREITO para conserto pontual, medio para defeito grave ou falha
    funcional. Um conserto de uma linha nao precisa de 40 voltas
  - `escopo` — so os arquivos apontados, ou a tarefa inteira
  - `foco` — os achados nomeados, em ordem de gravidade, como bloco no despacho

Natureza da falha: `:pontual` (achado de baixa gravidade, arquivo e linha nomeados),
`:funcional` (criterio executavel reprovou), `:conformidade` (entregou outra coisa),
`:impedimento` (o construtor declarou que nao consegue).

`:conformidade` e o caso especial: NAO adianta dar mais voltas nem modelo melhor se a
tarefa entregue e outra. Ele vai direto para escopo inteiro com o objetivo recolocado no
foco.

Modulo PURO. Todo o julgamento mora aqui, e por isso e aqui que os testes sao exaustivos.

## Criterios de aceite
- [x] Cada natureza de falha produz a politica esperada (um teste por natureza).
      `verificar: mix test test/fabrica/retrabalho/diagnostico_test.exs`
- [x] Achado pontual gera teto de voltas ESTREITO; falha funcional gera teto medio.
      `verificar: mix test test/fabrica/retrabalho/diagnostico_test.exs`
- [x] Reprovacao por conformidade vai para escopo inteiro, com o objetivo no bloco de foco.
      `verificar: mix test test/fabrica/retrabalho/diagnostico_test.exs`
- [x] O bloco de foco lista os achados em ordem de gravidade.
      `verificar: mix test test/fabrica/retrabalho/diagnostico_test.exs`

## Notas de execucao

**A tarefa da quatro naturezas e uma regra de voltas que menciona uma quinta condicao, e
reconciliar as duas foi a decisao de desenho da tarefa.** O texto pede `:pontual` (achado de
baixa gravidade, arquivo e linha nomeados) e `:funcional` (criterio executavel reprovou) — mas
manda dar teto medio para *"defeito grave OU falha funcional"*. Um `:critico` num ponto
nomeado nao cabe em nenhuma das duas descricoes.

A saida foi separar as duas perguntas em vez de inventar uma quinta natureza:

- **O escopo vem da NATUREZA.** So `:pontual` estreita, porque so ele tem arquivos nomeados.
- **As voltas vem da natureza E da gravidade.** Um critico num ponto nomeado continua sendo
  conserto de escopo estreito — e ainda assim ganha o teto medio, porque acertar de primeira
  importa mais ali.

Ha teste afirmando os dois lados ao mesmo tempo: gravidade alta com escopo `{:arquivos, ...}` e
largura `:medio`.

**A PRECEDENCIA entre naturezas e o bloco de testes que mais vale.** As quatro nao sao
mutuamente exclusivas no mundo real — uma reprovacao pode ter impedimento, conformidade e
achados juntos — e escolher a errada custa um ciclo inteiro no tamanho errado. A ordem, com o
motivo de cada:

1. **`:impedimento` primeiro** — nenhuma quantidade de voltas resolve *"nao tenho a
   credencial"*. Olhar os achados antes seria consertar sintoma.
2. **`:conformidade` antes de `:funcional`** — nao adianta fazer passar o criterio de uma
   tarefa que nao e a tarefa.
3. **`:funcional` antes de `:pontual`** — criterio executavel que reprovou e evidencia mais
   forte que a leitura de um revisor.

Ha um teste por degrau da precedencia, cada um com os sinais das naturezas inferiores presentes
ao mesmo tempo.

**Reprovacao sem sinal nenhum e `:funcional`, e nao `:pontual`.** Chamar de pontual daria
escopo estreito **sem arquivo nenhum para estreitar**, e o construtor receberia
`{:arquivos, []}` como se fosse instrucao — pior que nao estreitar. Mesma logica para achado
com `arquivo: ""`.

**As larguras estao ancoradas no que ja existe:** `:amplo` e 30, que e exatamente o
`teto_de_voltas` padrao do `Agente.Estado` (T-015). Ha teste afirmando a igualdade, para os dois
nao divergirem em silencio. Retrabalho amplo nao e regime especial — e o regime normal; as
outras duas larguras sao o que se GANHA por saber mais sobre a reprovacao.

`:medio` = 18 e `:estreito` = 8 sao escolha minha, e o que o teste trava e a relacao (as tres
estritamente crescentes, sem empate), e nao os numeros. Se a medicao mostrar que 8 e apertado
demais, muda-se um numero num lugar so.

**O foco em ordem de gravidade nao e organizacao: e priorizacao.** Quem le uma lista longa
conserta os primeiros itens, entao a ordem decide **o que sera consertado quando as voltas
acabarem**. Por isso e por gravidade e nao pela ordem em que o revisor escreveu. E o desempate
mantem a ordem original — `Enum.sort_by` e estavel —, para dois achados igualmente graves nao
sairem embaralhados por um criterio invisivel.

**Na conformidade o foco e o OBJETIVO, e os achados vem depois.** Consertar bug de uma entrega
que nao e a tarefa e trabalho jogado fora. Mas os achados continuam na lista, e nao sao
descartados: se a reimplementacao repetir o mesmo erro, eles ja estao ditos. Ha teste para as
duas metades.

E objetivo ausente e **dito** (`(objetivo nao informado)`) em vez de omitido: um bloco de foco
que comeca com `O QUE FOI PEDIDO: ` vazio faria o construtor achar que o pedido era vazio.

**`Politica.para_despacho/1` numera o foco.** Lista numerada em ordem de gravidade e a forma
mais curta de dizer "comece por aqui" — e o bloco vai dentro de `<retrabalho>`, ao lado do
`<seu-papel>` e do `<especialista>` da T-024.

## Verificacao

**Criterio 1 — cada natureza produz a politica esperada (um teste por natureza).**
`verificar: mix test test/fabrica/retrabalho/diagnostico_test.exs` -> **exit 0**

    2 doctests, 30 tests, 0 failures

Quatro testes, um por natureza, cada um conferindo natureza + escopo + largura + foco. Mais
sete testes de PRECEDENCIA, incluindo os casos degenerados (impedimento vazio, achado sem
arquivo, reprovacao sem sinal nenhum).

**Criterio 2 — achado pontual gera teto ESTREITO; falha funcional gera teto medio.**
`verificar: mix test test/fabrica/retrabalho/diagnostico_test.exs` -> **exit 0**

Seis testes: pontual leve -> 8; funcional -> 18; **grave num ponto nomeado -> 18 mantendo o
escopo estreito** (o caso que reconcilia as duas frases do plano); conformidade -> 30; o
`:amplo` igual ao teto padrao do laco; e as tres larguras estritamente crescentes.

**Criterio 3 — reprovacao por conformidade vai para escopo inteiro, com o objetivo no bloco de
foco.** `verificar: mix test test/fabrica/retrabalho/diagnostico_test.exs` -> **exit 0**

Tres testes: o objetivo vem PRIMEIRO no foco seguido do motivo da reprovacao; os achados vem
depois e nao no lugar dele; e objetivo ausente e dito por extenso.

**Criterio 4 — o bloco de foco lista os achados em ordem de gravidade.**
`verificar: mix test test/fabrica/retrabalho/diagnostico_test.exs` -> **exit 0**

Quatro testes: as quatro gravidades em ordem a partir de uma lista embaralhada; a estabilidade
do desempate; o escopo tambem em ordem de gravidade e sem repetir arquivo; e o criterio
reprovado antes dos achados.

**Bateria completa** — `verificar: mix fabrica.ci` -> **exit 0**

      formato    ok        3.0s
      compilar   ok        2.8s
      lint       ok        6.7s
      testes     ok       24.0s
      tipos      ok       15.9s

    bateria passou: 5 estagio(s) ok, 0 pulado(s)

    14 doctests, 734 tests, 0 failures

Eram 704 antes; a T-029 acrescentou 30 testes e 2 doctests.

## Conformidade

Os quatro criterios estao cumpridos, e a saida tem os quatro campos que a tarefa pediu —
`modelo`, `voltas`, `escopo`, `foco` — mais `natureza` e `largura`, que sao o "por que" de cada
um e o que a T-030 vai ler.

**A decisao que o texto nao fechava** esta nas Notas e travada em teste: escopo e voltas seguem
regras diferentes, porque a regra de voltas do plano menciona uma condicao (*"defeito grave"*)
que nao e nenhuma das quatro naturezas. Inventar uma quinta natureza teria sido a alternativa,
e ela deixaria `:pontual` significando "leve" em vez de "num ponto nomeado".

**Os numeros das larguras (8/18/30) sao meus**, e so o 30 vem de fato registrado (o teto padrao
do laco, T-015). O que os testes travam e a RELACAO entre eles, nao os valores — se a medicao
mostrar que 8 e apertado demais, muda-se num lugar so.

**Fora do escopo, e a tarefa o antecipa:** *se* refazer e *com quem* e a T-030. Este modulo so
responde *com quanto*.

**Ampliei as `areas`** para incluir o `GUIA.md`.

## Revisao

Revisao do proprio diff. Nada precisou de conserto — a bateria completa passou na primeira
tentativa. Tres pontos merecem registro:

- **`natureza/1` e publica** de proposito, separada de `diagnosticar/2`. A T-030 vai precisar
  da natureza sem a politica inteira (impedimento e conformidade mudam o degrau da escada, e
  nao so o tamanho), e expor a parte em vez de recalcula-la evita a segunda copia da regra.
- **O foco de `:conformidade` NAO descarta os achados**, e isso foi decisao consciente: eles
  perdem a prioridade, nao a utilidade.
- **A ordem do escopo herda a ordem do foco**, entao `{:arquivos, [...]}` sai com o arquivo do
  achado mais grave primeiro. Nao muda comportamento — e conjunto —, mas faz o bloco de
  despacho ler na mesma ordem em que instrui.

Sem achado de correcao, seguranca ou caso de borda pendente.
