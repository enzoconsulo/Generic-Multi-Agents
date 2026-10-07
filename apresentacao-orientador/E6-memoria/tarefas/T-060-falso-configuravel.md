---
id: T-060
titulo: Embedder.Falso segue a dimensao configurada
projeto: fabrica-v2
versao: v0.5
status: concluida
prioridade: alta
dependencias: [T-004]
areas: [lib/fabrica/embedder/falso.ex, test/fabrica/embedder/falso_test.exs]
tentativas: 1
criada: 2026-09-15
atualizada: 2026-09-22
---

## Objetivo
`Embedder.Falso.dimensoes/0` deixa de ser a constante 384 e passa a ler a configuracao, mantendo
384 como padrao. E o que permite testar a pilha inteira da memoria numa dimensao diferente sem
carregar modelo nem tocar a rede.

## Contexto

A D-004 diz a frase inteira: "`Fabrica.Embedder.dimensoes/0` ja existe por adaptador — a coluna e
que precisa segui-lo, e o `Embedder.Falso` (que a suite inteira usa) tem de acompanhar".

**Por que o `Falso` precisa acompanhar, se ele nunca vai rodar em producao.** Porque ele e o unico
embedder que a suite pode usar (marco da v0.1: nenhum teste padrao carrega modelo ou chama rede), e
sem ele configuravel nao existe como provar, sem modelo, que ingestao, indice HNSW e busca hibrida
funcionam numa dimensao que nao seja 384. Com ele configuravel, a T-061 e a T-065 conseguem
exercitar 768 de graca. Essa e a razao de ele existir: `@moduledoc` do `Falso` — "e o que permite
testar a busca hibrida INTEIRA da v0.5 sem carregar modelo nenhum".

**O que mudar, exatamente:**

- `dimensoes/0` passa a ler `Application.get_env(:fabrica, Fabrica.Embedder.Falso, [])` na chave
  `:dimensoes`, com **384 como padrao**. O padrao nao e detalhe: e ele que mantem a suite inteira
  verde sem tocar em `config/test.exs`.
- `vetor/1` usa `dimensoes/0`, nao mais o atributo de modulo. Cuidado: `0..(@dimensoes - 1)` hoje e
  resolvido em tempo de compilacao; com valor de runtime isso vira chamada de funcao.
- O `@moduledoc` tem uma secao "Por que 384 dimensoes" que diz que fixar ali faz a troca de
  adaptador "nao mudar o esquema do banco — a coluna `vector(384)` continua valendo". **Essa frase
  ficou falsa com a D-004** e precisa ser reescrita: 384 agora e o PADRAO (o que a suite usa), nao
  um compromisso com o esquema; quem manda na coluna e `Fabrica.Memoria.Dimensao` (T-059/T-061).
  Deixar a frase antiga e pior que nao ter secao nenhuma — e o tipo de registro falso que ja
  reprovou tarefa nesta fabrica (T-045, ciclos 3 a 5).

`test/fabrica/embedder/falso_test.exs` ja tem tres testes que travam o 384 literal ("dimensoes
devolve 384", "todo vetor gerado tem exatamente 384 posicoes", "vetor tem 384 posicoes") e um que
afirma `Embedder.dimensoes() == 384`. Eles continuam valendo como prova do PADRAO — nao os apague,
reescreva-os como "sem configuracao, o padrao e 384" e acrescente os de configuracao.

Ao mexer na configuracao dentro do teste, devolva no `on_exit`: a suite roda com `async: true` em
varios arquivos e configuracao de aplicacao e global. O teste que muda a dimensao precisa ser
`async: false`.

**Stack:** nada novo, nenhuma dependencia. Antes de fechar: `mix format`, conferir LF (GUIA,
Armadilhas) e `mix fabrica.ci` completo.

## Criterios de aceite
- [ ] Sem configuracao nenhuma, `Falso.dimensoes/0` devolve 384 e todo vetor sai com 384 posicoes —
      o comportamento que a suite inteira depende hoje.
      `verificar: mix test test/fabrica/embedder/falso_test.exs`
- [ ] Com `config :fabrica, Fabrica.Embedder.Falso, dimensoes: 768`, `dimensoes/0` devolve 768 e
      todo vetor de `vetorizar/1` sai com 768 posicoes, ainda deterministico e normalizado.
      `verificar: mix test test/fabrica/embedder/falso_test.exs`
- [ ] `Fabrica.Embedder.dimensoes/0` (a fachada) acompanha a mudanca, porque delega ao adaptador
      configurado.
      `verificar: mix test test/fabrica/embedder/falso_test.exs`
- [ ] A suite inteira continua verde com o padrao, sem nenhuma configuracao nova em `config/`.
      `verificar: mix test test/fabrica/memoria/ingestao_test.exs`
- [ ] A secao "Por que 384 dimensoes" do `@moduledoc` nao afirma mais que a coluna `vector(384)`
      continua valendo; diz que 384 e o padrao da suite e aponta quem manda na coluna.
      (inspecionavel — sem comando, e o verificador que le)

## Notas de execucao

### Ciclo 1

`Fabrica.Embedder.Falso.dimensoes/0` deixou de ser a constante `@dimensoes` e passou a ler
`Application.get_env(:fabrica, Fabrica.Embedder.Falso, [])[:dimensoes]`, com `384` (agora
`@dimensoes_padrao`) como valor por omissao. `vetor/1` trocou `0..(@dimensoes - 1)` por
`0..(dimensoes() - 1)` — deixa de ser resolvido em tempo de compilacao, vira chamada de
funcao a cada vetor, como o Contexto avisava.

`Fabrica.Embedder.dimensoes/0` (a fachada) ja delegava a `configurado().dimensoes()` desde a
T-004 — nao precisou mudar, so passou a herdar o novo comportamento do `Falso`.

A secao "Por que 384 dimensoes" do `@moduledoc` foi reescrita para "Por que 384 e o padrao":
tirei a frase que dizia que fixar 384 mantinha a coluna `vector(384)` valendo (ficou falsa
com a D-004) e disse que 384 e so o padrao que a suite usa sem config, e que quem manda na
coluna de verdade e `Fabrica.Memoria.Dimensao` (T-059/T-061).

**Testes:** os tres que travavam o 384 literal (`dimensoes devolve 384`, `todo vetor... 384
posicoes`) foram renomeados para deixar claro que descrevem o padrao SEM configuracao, sem
apagar nada. Acrescentei um segundo modulo de teste no mesmo arquivo,
`Fabrica.Embedder.FalsoConfiguravelTest`, com `use ExUnit.Case, async: false` — porque
`Application.put_env/put_env` e estado global e o resto da suite do `Falso` continua
`async: true`. Ele cobre: dimensao configurada muda `dimensoes/0`, `vetorizar/1` sai com essa
quantidade de posicoes, determinismo e normalizacao continuam valendo com dimensao diferente,
a fachada `Fabrica.Embedder.dimensoes/0` acompanha, e que sem config o padrao volta a ser 384.
`on_exit` sempre desfaz com `Application.delete_env(:fabrica, Falso)`.

Nenhuma dependencia nova. Nenhuma configuracao nova em `config/` — o padrao de producao
continua sem `config :fabrica, Fabrica.Embedder.Falso, ...`, exatamente como o criterio pede.

**Reproduzir:** `mix test test/fabrica/embedder/falso_test.exs` (26 testes, 0 falhas) e
`mix test test/fabrica/memoria/ingestao_test.exs` (10 testes, 0 falhas). Bateria completa
`mix fabrica.ci` rodada e verde (formato, compilar, lint, testes, tipos).

**Commit:** `3cc931b`

**2026-09-15 — promovida a `pronta` pelo orquestrador**: todas as dependencias estao `concluida`.
As tres primeiras da linhagem da D-004 (T-059, T-060, T-062) tem `areas` disjuntas entre si e podem
ir em paralelo, ate o limite de 3 construtores do CLAUDE.md.

## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] Sem configuracao nenhuma, `Falso.dimensoes/0` devolve 384 e todo vetor sai com 384 posicoes — o comportamento que a suite inteira depende hoje. — `mix test test/fabrica/embedder/falso_test.exs` → **PASSOU**
- [executado] Com `config :fabrica, Fabrica.Embedder.Falso, dimensoes: 768`, `dimensoes/0` devolve 768 e todo vetor de `vetorizar/1` sai com 768 posicoes, ainda deterministico e normalizado. — `mix test test/fabrica/embedder/falso_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] `Fabrica.Embedder.dimensoes/0` (a fachada) acompanha a mudanca, porque delega ao adaptador configurado. — `mix test test/fabrica/embedder/falso_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A suite inteira continua verde com o padrao, sem nenhuma configuracao nova em `config/`. — `mix test test/fabrica/memoria/ingestao_test.exs` → **PASSOU**
- [julgado] A secao "Por que 384 dimensoes" do `@moduledoc` nao afirma mais que a coluna `vector(384)` continua valendo; diz que 384 e o padrao da suite e aponta quem manda na coluna. (inspecionavel — sem comando, e o verificador que le) — sem comando declarado; fica para o verificador.

Graus de prova: 5 executado(s), 1 para julgamento (de 6).

### Ciclo 2

- **[PASSOU] [executado] Sem configuracao nenhuma, `Falso.dimensoes/0` devolve 384 e todo vetor sai com 384 posicoes — o comportamento que a suite inteira depende hoje.**
  Comando: `mix test test/fabrica/embedder/falso_test.exs`
  Saída: `26 tests, 0 failures` (modulo `Fabrica.Embedder.FalsoTest` com todos os testes do padrao passando)

- **[PASSOU] [executado] Com `config :fabrica, Fabrica.Embedder.Falso, dimensoes: 768`, `dimensoes/0` devolve 768 e todo vetor de `vetorizar/1` sai com 768 posicoes, ainda deterministico e normalizado.**
  Comando: `mix test test/fabrica/embedder/falso_test.exs`
  Saída: `26 tests, 0 failures` (modulo `Fabrica.Embedder.FalsoConfiguravelTest` com testes de configuracao passando)

- **[PASSOU] [executado] `Fabrica.Embedder.dimensoes/0` (a fachada) acompanha a mudanca, porque delega ao adaptador configurado.**
  Comando: `mix test test/fabrica/embedder/falso_test.exs`
  Saída: `26 tests, 0 failures` (teste "a fachada Fabrica.Embedder.dimensoes/0 acompanha a configuracao do adaptador" em `FalsoConfiguravelTest`)

- **[PASSOU] [executado] A suite inteira continua verde com o padrao, sem nenhuma configuracao nova em `config/`.**
  Comando: `mix test test/fabrica/memoria/ingestao_test.exs` + `mix fabrica.ci`
  Saída: `10 tests, 0 failures` em ingestao; bateria completa: 5 estagios ok (formato, compilar, lint, testes, tipos)

- **[PASSOU] [julgado] A secao "Por que 384 e o padrao" do `@moduledoc` nao afirma mais que a coluna `vector(384)` continua valendo; diz que 384 e o padrao da suite e aponta quem manda na coluna.**
  Base: Leitura do `@moduledoc` em `lib/fabrica/embedder/falso.ex` (linhas 17-26). A secao:
    - Remove a frase falsa: "nao e mais um compromisso com o esquema do banco"
    - Estabelece 384 como padrao da suite: "`dimensoes/0` e configuravel, para que a T-061/T-065 possam exercitar..."
    - Aponta o verdadeiro responsavel pela coluna: "Quem manda na coluna de verdade e `Fabrica.Memoria.Dimensao` (T-059/T-061), nao este modulo."
  Conclusao: Texto reescrito conforme especificacao.

Mutacao: Quebrei `dimensoes()` para retornar sempre `@dimensoes_padrao` (ignorando `Application.get_env`) → os testes detectaram com 3 falhas exatas (testes de configuracao em `FalsoConfiguravelTest`). Desfiz a mutacao e confirmei que os 26 testes voltam a passar.

Suíte: 26 testes Falso + 10 testes Ingestao + 5 estagios CI → **todos PASSOU**
Graus de prova: 4 executado(s), 1 julgado (de 6, sendo o 1o ciclo passado mecanico)

## Conformidade

Conformidade: cumpre

- Sem configuracao, `Falso.dimensoes/0` devolve 384 e todo vetor sai com 384 posicoes →
  `lib/fabrica/embedder/falso.ex:34-38` (`Keyword.get(:dimensoes, @dimensoes_padrao)`, padrao
  384) e `vetor/1:62`; provado por `test/fabrica/embedder/falso_test.exs`, describe "formato"
  (testes renomeados "sem configuracao...").
- Com `config :fabrica, Fabrica.Embedder.Falso, dimensoes: 768`, `dimensoes/0` devolve 768,
  `vetorizar/1` sai com 768 posicoes, deterministico e normalizado → mesmo trecho de codigo
  (a leitura de `Application.get_env` e generica, nao um caso especial de 384) provado pelos
  4 primeiros testes de `Fabrica.Embedder.FalsoConfiguravelTest`.
- `Fabrica.Embedder.dimensoes/0` acompanha → conferido em `lib/fabrica/embedder.ex:47`
  (`def dimensoes, do: configurado().dimensoes()`, já existia antes desta tarefa, sem
  precisar mudar) e no teste "a fachada ... acompanha a configuracao do adaptador".
- Suite inteira verde com o padrao, sem config nova em `config/` → confirmado por
  `git diff --stat` do commit (só `falso.ex`, `falso_test.exs`, `_gestao/`; nenhum arquivo em
  `config/` tocado) e pelo relato de `mix fabrica.ci` verde nas Notas.
- `@moduledoc` reescrito → `lib/fabrica/embedder/falso.ex:17-26`: nao afirma mais que a coluna
  `vector(384)` "continua valendo"; diz que 384 e o padrao da suite e que quem manda na coluna
  e `Fabrica.Memoria.Dimensao` (T-059/T-061).
- Escopo: o diff toca só as duas `areas` declaradas (`lib/fabrica/embedder/falso.ex`,
  `test/fabrica/embedder/falso_test.exs`) mais a regeneração de rotina do `_gestao/MAPA.md` e o
  próprio arquivo da tarefa. Nada fora do pedido, nada faltando.

## Revisão

Aprovado sem ressalvas.

Verifiquei: a chave usada em `Application.get_env(:fabrica, __MODULE__, [])` (`falso.ex:36`) é
`Fabrica.Embedder.Falso` via `__MODULE__`, e bate com o `Application.put_env(:fabrica, Falso,
...)` dos testes — sem risco de dessincronia de átomo. `vetor/1` chama `dimensoes()` a cada
invocação (deixou de ser resolvido em compilação, como o Contexto avisava), sem efeito
colateral incorreto: o range `0..(dimensoes() - 1)` é recalculado por texto, e o resultado
continua determinístico porque `dimensoes()` só varia com `Application.put_env`, não com o
texto. `Fabrica.Embedder.dimensoes/0` (`lib/fabrica/embedder.ex:47`) já delegava a
`configurado().dimensoes()` antes desta tarefa — não há código novo por trás do critério 3, é
herança correta. `Fabrica.Embedder.FalsoConfiguravelTest` usa `async: false` com `on_exit` que
sempre desfaz o `Application.put_env`; como o ExUnit roda os testes `async: false` em série e
antes dos `async: true`, não há corrida com o resto da suíte do `Falso`. Nenhuma dependência
nova, nenhuma configuração de produção adicionada — confirmado por `git status`/`grep` em
`config/`.

**Commit revisado:** `3cc931b`.
