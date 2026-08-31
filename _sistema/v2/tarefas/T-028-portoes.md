---
id: T-028
titulo: Os dois portoes, e a ausencia da ferramenta de corrigir
projeto: fabrica-v2
versao: v0.3
status: concluida
prioridade: alta
dependencias: [T-022, T-025, T-026]
areas: [lib/fabrica/portoes/verificador.ex, lib/fabrica/portoes/revisor.ex, test/fabrica/portoes_test.exs, _gestao/GUIA.md]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-31
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
- [x] O catalogo de ferramentas do verificador e do revisor nao contem escrita (teste negativo).
      `verificar: mix test test/fabrica/portoes_test.exs`
- [x] O revisor recebe o diff e nenhum fonte inteiro (teste sobre o contexto montado).
      `verificar: mix test test/fabrica/portoes_test.exs`
- [x] Reprovacao por conformidade sem nenhum defeito encontrado e um desfecho valido e representavel.
      `verificar: mix test test/fabrica/portoes_test.exs`
- [x] Os achados do revisor saem no formato `[gravidade] arquivo:linha — problema`.
      `verificar: mix test test/fabrica/portoes_test.exs`

## Notas de execucao

**Os dois portoes sao definidos pelo que NAO tem.** O catalogo da T-016 ja nao dava
`escrever` nem `editar` a `verificador` e `revisor`; esta tarefa transforma isso em teste
nomeado, e acrescenta a metade que faltava: **conferir pelo PODER, e nao pelo nome**. Uma
ferramenta de escrita batizada de outro jeito passaria por um teste que so olha
`Map.has_key?("escrever")` — `Catalogo.pode_escrever?/1` olha o poder declarado.

E ha o par positivo, para o teste nao passar por vazio: `pode_escrever?("construtor")` tem de
ser verdadeiro. Sem ele, os tres testes de ausencia passariam igual se o catalogo estivesse
vazio.

**Uma assimetria que vale registrar: o revisor tem MENOS ferramentas que o verificador.** Ele
tambem nao roda comando — le o diff. Ha teste afirmando que `rodar` esta no verificador e nao
no revisor: se as duas listas fossem iguais, um dos dois papeis estaria com poder de que nao
precisa, e o principio do menor poder viraria decoracao.

**"O revisor recebe o diff e nenhum fonte inteiro" virou garantia ESTRUTURAL.** Nao basta o
contexto nao ter bloco de fonte: o modulo `Revisor` **nao tem como ler disco**, e ha teste
varrendo o fonte dele por `File.read`, `File.stream`, `File.ls` e `Path.wildcard`. Sem isso,
bastaria alguem acrescentar um `File.read!` "so para conferir o arquivo inteiro" e a restricao
viraria conselho.

O detector tem auto-teste, pela regra que ja custou tres falsos positivos na v0.1: este proprio
arquivo de teste usa `File.read!`, entao o padrao tem de encontra-lo aqui.

**O teste central da tarefa e o de conformidade com ZERO achados.** Entrega que passa em todos
os criterios e nao tem defeito nenhum **ainda pode nao ser a tarefa** — criterio frouxo nao e
licenca para entregar outra coisa. Por isso `julgar/2` tem `{:nao_conforme, motivo}` como
primeiro ramo do `cond`, e `achados == []` nao muda nada: reprova.

E ha o caso em que as duas reprovam. O motivo registrado e a **conformidade**, e nao os
defeitos: refazer o codigo nao ajuda se o que se pediu era outra coisa. E a informacao que a
T-030 vai ler para escolher entre "tente de novo" e "isto e replanejamento".

**O formato do achado nao e cosmetico, e o `@moduledoc` diz por que.** E dele que a T-030
extrai a politica de retrabalho: a gravidade decide se a tarefa volta ao construtor normal, ao
reforcado, ou se e caso de replanejar. Achado em prosa livre nao se classifica, e o que nao se
classifica vira "tente de novo" — que e a resposta que ja falhou.

Tres decisoes no formato, cada uma com teste:

- **`linha` pode ser `nil`**, e ai a linha sai sem o numero. Ha defeito que e do arquivo
  inteiro (falta um teste, o modulo nao deveria existir), e inventar `:1` mandaria quem for
  consertar para o lugar errado.
- **A leitura e tolerante**: prosa em volta e ignorada, linha malformada nao derruba. O revisor
  escreve texto entre os achados, e parser rigido transformaria uma frase de contexto em erro
  de sistema.
- **`formatar/1` e `ler_achados/1` sao inversos**, e ha teste de ida e volta com os dois casos
  (com linha e sem). E o que impede os dois lados de divergirem em silencio.

**`pior/1` existe para a T-030 e nao para este portao.** Um critico volta diferente de tres
baixos, e a ordem das gravidades esta declarada num lugar so (`@gravidades`) em vez de espalhada
numa tabela de comparacao.

**O verificador NAO aprova com criterio inconclusivo pendente.** Transformar *"o comando nao
conseguiu avaliar"* em *"passou"* seria aprovar por omissao, que e o oposto de um portao. Mas
tambem nao reprova — a tarefa nao errou. Sai `motivo: :sem_prova`, que e um terceiro desfecho
e nao um empate mal resolvido.

Em compensacao, criterio **sem comando** nao impede a aprovacao: a maioria dos criterios de
julgamento e assim, e exigir comando de cada um mataria o portao.

**O contexto do verificador nao tem o diff, e o do revisor nao tem os fontes.** As duas
ausencias sao simetricas e ha teste para cada. Dar o diff ao verificador o convidaria a julgar
implementacao em vez de resultado — que e a pergunta do outro portao.

## Verificacao

**Criterio 1 — o catalogo de ferramentas do verificador e do revisor nao contem escrita (teste
negativo).** `verificar: mix test test/fabrica/portoes_test.exs` -> **exit 0**

    2 doctests, 30 tests, 0 failures

Cinco testes: os dois por nome, o terceiro por PODER declarado (que pega a ferramenta de
escrita batizada de outro jeito), o par positivo que impede a passagem por vazio, e a
assimetria verificador/revisor no `rodar`.

**Criterio 2 — o revisor recebe o diff e nenhum fonte inteiro.**
`verificar: mix test test/fabrica/portoes_test.exs` -> **exit 0**

Quatro testes: os blocos do contexto sao exatamente `objetivo`, `criterios`, `diff`; o modulo
**nao tem como ler disco** (varredura do fonte); o auto-teste do detector; e o contexto sem
partes nao inventa bloco.

**Criterio 3 — reprovacao por conformidade sem nenhum defeito e um desfecho valido e
representavel.** `verificar: mix test test/fabrica/portoes_test.exs` -> **exit 0**

Quatro testes cobrindo as quatro combinacoes: nao conforme com zero achados (o central),
conforme com achados, conforme sem achados, e as duas reprovando — com a conformidade tendo
precedencia no motivo.

**Criterio 4 — os achados saem no formato `[gravidade] arquivo:linha — problema`.**
`verificar: mix test test/fabrica/portoes_test.exs` -> **exit 0**

Oito testes: o formato exato, o achado sem linha, cada gravidade, a ida e volta
formatar/ler, a prosa em volta ignorada, travessao e hifen, gravidade desconhecida recusada,
texto vazio, e `pior/1`.

**Bateria completa** — `verificar: mix fabrica.ci` -> **exit 0**

      formato    ok        2.8s
      compilar   ok        2.8s
      lint       ok        6.3s
      testes     ok       24.0s
      tipos      ok       16.8s

    bateria passou: 5 estagio(s) ok, 0 pulado(s)

    12 doctests, 704 tests, 0 failures

Eram 674 antes; a T-028 acrescentou 30 testes e 2 doctests.

## Conformidade

Os quatro criterios estao cumpridos, e os dois portoes existem como modulos separados com
julgamentos independentes, como a tarefa pediu.

**O que a tarefa pediu e nao esta nos criterios:**

- *"o verificador recebe o resultado da passada mecanica JA PRONTO"* — `julgar/1` recebe os
  resultados e nao os re-executa; o `@moduledoc` diz que refazer a passada gastaria um despacho
  para descobrir o que uma execucao de segundos ja sabia.
- *"roda no modelo barato"* — esta registrado no `@moduledoc`, com a razao (verificar e
  mecanico) e a protecao (o revisor le o diff depois, no modelo do disparo). A escolha do
  modelo em si e do despachante, e nao deste modulo.

**Fora do escopo, e a tarefa o antecipa:** *"e dele que a T-030 extrai a politica de
retrabalho"*. Entreguei o formato, o parser e `pior/1`; a politica e la.

**Ampliei as `areas`** para incluir o `GUIA.md`, antes de toca-lo.

## Revisao

Revisao do proprio diff. Nada precisou de conserto: a bateria completa passou na primeira
tentativa, `tipos` incluido. Tres pontos merecem registro:

- **O teste de ausencia por NOME nao bastaria**, e foi o que motivou o terceiro teste, por
  poder declarado. Testar a ausencia de uma string e testar a grafia atual, nao a regra.
- **O auto-teste do detector de `File.read`** existe porque um sensor que nunca dispara e
  indistinguivel de um sensor quebrado — licao dos tres falsos positivos da v0.1, aplicada de
  primeira.
- **`ler_achados/1` usa `String.to_existing_atom`**, e nao `String.to_atom`: o texto vem de um
  modelo, e criar atomo a partir de entrada externa e vazamento de memoria com passos extras.
  A gravidade so vira atomo porque as quatro ja existem no `@gravidades`.

Sem achado de correcao, seguranca ou caso de borda pendente.
