---
id: T-027
titulo: O criterio implicito da suite e a deteccao de ecossistema
projeto: fabrica-v2
versao: v0.3
status: concluida
prioridade: alta
dependencias: [T-025]
areas: [lib/fabrica/criterios/suite.ex, lib/fabrica/ecossistemas.ex, test/fabrica/criterios/suite_test.exs, lib/fabrica/criterios.ex, _gestao/GUIA.md]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-31
---

## Objetivo
Rodar a suite do projeto em TODA verificacao, sem que ela esteja escrita em tarefa nenhuma —
e descobrir sozinho qual e o comando, pelo ecossistema do projeto.

## Contexto
Da v1, e a razao de o template de tarefa dizer em maiusculas "NAO escreva 'a suite continua
passando' como criterio": a fabrica ja roda a suite sozinha, e escreve-la a mao so cria uma
segunda chance de errar o comando.

Deteccao por arquivo-marcador, na ordem de prioridade: `mix.exs` -> Elixir; `package.json`
-> Node; `pyproject.toml` -> Python; `Cargo.toml` -> Rust; `go.mod` -> Go; `*.csproj` ->
.NET. Se houver `_gestao/ci.json`, ELE VENCE — a deteccao e o palpite, o arquivo e a
declaracao.

O comando da suite entra na lista de criterios como `[executado]`, marcado como implicito,
para aparecer no relatorio sem ter sido escrito por ninguem.

## Criterios de aceite
- [x] O ecossistema e detectado pelo arquivo-marcador, na ordem de prioridade (um teste por ecossistema).
      `verificar: mix test test/fabrica/criterios/suite_test.exs`
- [x] `_gestao/ci.json` presente VENCE a deteccao automatica.
      `verificar: mix test test/fabrica/criterios/suite_test.exs`
- [x] O criterio implicito aparece no relatorio marcado como implicito.
      `verificar: mix test test/fabrica/criterios/suite_test.exs`
- [x] Projeto sem ecossistema reconhecido nao quebra: reporta e segue sem criterio implicito.
      `verificar: mix test test/fabrica/criterios/suite_test.exs`

## Notas de execucao

**Uma divergencia da v1 na ORDEM, e ela tem um teste que a prova necessaria.** A v1 poe Node
primeiro no catalogo, "por ser o caso mais comum de raiz de monorepo". O plano da T-027 poe
Elixir primeiro, e segui o plano — mas a razao concreta so apareceu ao escrever o teste: **a
propria fabrica v2 e um projeto Elixir COM `package.json`** (assets do Phoenix). Com a ordem
da v1 ela se detectaria como Node e rodaria um `npm test` que nao existe.

Ha dois testes para isso: um projeto de mentira com os dois marcadores, e o caso real —
`Ecossistemas.detectar(File.cwd!())` tem de dar `:elixir`. Projeto que nao consegue reconhecer
a si mesmo e mau sinal para os que ele constroi.

**`ci.json` vencer a deteccao nao e cortesia, e a diferenca entre declaracao e palpite.** Um
projeto pode ter `mix.exs` e mesmo assim rodar a suite por um alias proprio — `mix verificar`,
`mix fabrica.ci` —, e nenhum palpite saberia disso. **A propria fabrica v2 e esse caso.**

E a leitura do `ci.json` e **tolerante de ponta a ponta**: arquivo ausente, JSON quebrado,
estagio sem comando, comando vazio, chave `estagios` faltando — todos caem na deteccao em vez
de derrubar. Ha um teste para cada. A razao: trocar *"o palpite talvez erre o comando"* por
*"ninguem roda a suite"* seria pior, e um `ci.json` malformado e exatamente o tipo de coisa que
acontece no meio de uma edicao.

**A marca `[implicito]` fica colada ao ROTULO, antes do texto.** E propriedade da ORIGEM do
criterio, e nao comentario sobre o resultado dele — por isso sai como
`- [executado] [implicito] A suite do projeto passa (...)`. Sem a marca, o proximo planejador
escreve o criterio a mao por achar que sumiu, e escrever a mao e justamente o que cria a
segunda chance de errar o comando. E o texto do criterio diz **de onde veio** (`declarado em
_gestao/ci.json` ou `detectado: Elixir / Mix`), porque quem le o relatorio precisa saber se
confia numa declaracao ou numa heuristica.

**A deduplicacao precisou de um ajuste, e ele e sutil.** O espelho herda o VEREDITO, mas a
IDENTIDADE continua sendo a do criterio atual — texto, comando e a marca de implicito. Antes o
espelho herdava a marca do primeiro, e ai um projeto cuja tarefa ja declarasse `mix test`
faria o implicito aparecer como escrito por alguem (ou o contrario). Ha teste conferindo os
dois lados.

Consequencia boa e que vale registrar: **acrescentar o implicito nunca custa uma execucao a
mais**. Se a tarefa ja declara o mesmo comando, a chave de deduplicacao faz o segundo virar
espelho. Ha teste.

**Aproveitei para fechar a lacuna do `reexecutado` no relatorio.** A T-026 gravava o campo mas
o relatorio nao o mostrava — a nota de reexecucao entrou junto com a de espelho, na mesma
funcao `notas/1`. Sem ela, a instabilidade do ambiente volta a ser folclore em vez de numero:
ninguem sabe se a retentativa esta salvando uma reprovacao falsa por rodada ou nenhuma.

**A armadilha que custou 60 segundos, e que virou entrada no GUIA.** O primeiro teste do
relatorio chamava `Suite.acrescentar/2` + `Criterios.executar/3` sobre a raiz da PROPRIA
fabrica. O implicito de um projeto Elixir e `mix test` — entao a passada disparou a suite **de
dentro da suite**, e o teste morreu no timeout de 60 s do ExUnit. Pior que a lentidao: o
processo filho mexe no `_build` enquanto o pai roda.

E a mesma armadilha da T-026 em versao mais grave (la eram 13 s de `mix` filho; aqui e
recursao). Trocado por projeto de mentira em diretorio temporario com `ci.json` declarando um
comando inerte, e a entrada no GUIA cita as duas ocorrencias.

## Verificacao

**Criterio 1 — o ecossistema e detectado pelo arquivo-marcador, na ordem de prioridade (um
teste por ecossistema).** `verificar: mix test test/fabrica/criterios/suite_test.exs` ->
**exit 0**

    1 doctest, 28 tests, 0 failures

Seis testes, um por ecossistema, cada um conferindo o id E o comando da suite. Mais: os tres
marcadores alternativos do Python, o `.csproj` como EXTENSAO e nao nome exato, a ordem do
catalogo, e os dois testes de prioridade (Elixir vence Node; Node vence Python).

**Criterio 2 — `_gestao/ci.json` presente VENCE a deteccao automatica.**
`verificar: mix test test/fabrica/criterios/suite_test.exs` -> **exit 0**

Seis testes: vence com ecossistema detectavel, vence **sem** ecossistema nenhum, e as quatro
formas de o arquivo nao servir (JSON quebrado, sem estagio de testes, comando vazio, sem a
chave `estagios`) caindo na deteccao em vez de derrubar.

**Criterio 3 — o criterio implicito aparece no relatorio marcado como implicito.**
`verificar: mix test test/fabrica/criterios/suite_test.exs` -> **exit 0**

Quatro testes: a marca aparece no criterio implicito e NAO no escrito a mao; ela sobrevive a
deduplicacao do lado certo; e o par implicito+declarado nao custa execucao extra.

**Criterio 4 — projeto sem ecossistema reconhecido nao quebra: reporta e segue sem criterio
implicito.** `verificar: mix test test/fabrica/criterios/suite_test.exs` -> **exit 0**

Quatro testes: `{:erro, :sem_ecossistema}` nomeado, diretorio inexistente, diretorio vazio, e
`acrescentar/2` devolvendo a lista **intacta** — que e a resposta certa, e nao um erro.

**Bateria completa** — `verificar: mix fabrica.ci` -> **exit 0**

      formato    ok        2.6s
      compilar   ok        2.6s
      lint       ok        5.6s
      testes     ok       21.6s
      tipos      ok       15.8s

    bateria passou: 5 estagio(s) ok, 0 pulado(s)

    10 doctests, 674 tests, 0 failures

Eram 646 antes; a T-027 acrescentou 28 testes e 1 doctest.

## Conformidade

Os quatro criterios estao cumpridos, na ordem de prioridade que o plano declarou e com o
`ci.json` vencendo como ele pediu.

**A unica divergencia da v1 e a ordem do catalogo** (Elixir antes de Node), e ela veio do
proprio plano — mas ganhou justificativa empirica no meio da tarefa, quando o teste sobre a
raiz real mostrou que a ordem da v1 faria a fabrica se detectar errado.

**O que a tarefa pediu e nao esta nos criterios:** a razao de existir, que e o
*"NAO escreva 'a suite continua passando' como criterio"* do template. Ela esta no
`@moduledoc` da `Suite` e na tabela "ja existe" do GUIA, que sao os dois lugares onde alguem
prestes a escrever esse criterio a mao vai olhar.

**Ampliei as `areas`** para incluir `lib/fabrica/criterios.ex` (onde o campo `implicito`
atravessa a passada e o relatorio), o teste da T-025 e o `GUIA.md` — antes de tocar em
qualquer um deles.

## Revisao

Revisao do proprio diff. Achados, todos tratados:

- **Recursao da suite dentro da suite** num teste, 60 s ate o timeout, com o filho mexendo no
  `_build`. Trocado por projeto de mentira; entrada no GUIA.
- **O espelho herdava a marca de implicito do primeiro criterio**, o que faria o relatorio
  atribuir errado quem escreveu o que. Agora herda so o veredito; ha teste dos dois lados.
- **`reexecutado` era gravado e nao aparecia no relatorio** — lacuna herdada da T-026,
  fechada aqui junto com a nota de espelho.
- **Um teste meu estava desnecessariamente esperto** (`Map.new` + `sort_by` sobre uma chave
  opcional) e estourou com `KeyError`. Reescrito de forma direta.

Um ponto registrado sem conserto: **a deteccao continua sendo um palpite**, e um monorepo com
dois ecossistemas de verdade sempre vai ter um deles ignorado. O desenho ja da a saida
(`ci.json` declara), e o texto do criterio diz qual dos dois caminhos foi usado — entao quem
ler o relatorio consegue notar o engano. Resolver de verdade exigiria pipeline por
subdiretorio, que nao e desta versao.
