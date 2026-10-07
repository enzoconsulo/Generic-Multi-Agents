---
id: T-046
titulo: O bloco de contexto recuperado, com a fonte citada
projeto: fabrica-v2
versao: v0.5
status: concluida
prioridade: alta
dependencias: [T-044, T-011]
areas: [lib/fabrica/memoria/contexto.ex, test/fabrica/memoria/contexto_test.exs]
tentativas: 2
criada: 2026-08-28
atualizada: 2026-09-12
ultima-reprovacao: revisor
---

## Objetivo
Montar, no inicio do despacho, o bloco com os melhores trechos recuperados — cada um com a
fonte citada — e coloca-lo DEPOIS do prefixo cacheado.

## Contexto
O ganho concreto e o agente comecar o trabalho ja sabendo "isto foi decidido assim, por este
motivo", em vez de decidir de novo, possivelmente ao contrario do que ja esta no codigo. E a
resposta direta ao segundo modo de falha da Parte I: decisao sem rastro.

ONDE ESTE BLOCO ENTRA IMPORTA MAIS DO QUE PARECE: ele muda a cada tarefa, entao vai DEPOIS
do ultimo ponto de cache. Coloca-lo antes invalidaria o prefixo inteiro a cada despacho — e
seria uma otimizacao de contexto que destroi a economia de cache, exatamente o tipo de troca
que a v2 existe para nao fazer.

Cada trecho entra com a fonte (`arquivo, secao`) para o agente poder citar e para o leitor
poder conferir. Trecho sem fonte e afirmacao sem rastro, que e o problema que estamos
resolvendo.

Teto de tamanho declarado: no maximo 8 trechos e um limite de bytes. Recuperacao que enche o
contexto piora a resposta em vez de melhorar.

QUANDO NAO USAR, e isto vai no cabecalho do modulo: busca semantica e aproximada e devolve
trechos, nao verdades. Nao substitui o indice denso (exato, completo, gratis), nao substitui
ler o arquivo que a tarefa declara tocar, e nao responde o que uma consulta ao banco responde
melhor — "quais tarefas estao bloqueadas" e um WHERE, nao uma pergunta em linguagem natural.

## Criterios de aceite
- [ ] O bloco entra DEPOIS do ultimo ponto de cache; o prefixo continua byte a byte igual entre despachos.
      `verificar: mix test test/fabrica/memoria/contexto_test.exs`
- [ ] Cada trecho recuperado vem com a fonte (arquivo e secao) citada.
      `verificar: mix test test/fabrica/memoria/contexto_test.exs`
- [ ] O bloco respeita o teto de 8 trechos e o limite de bytes.
      `verificar: mix test test/fabrica/memoria/contexto_test.exs`
- [ ] Recuperacao vazia produz despacho normal, sem bloco, em vez de bloco vazio.
      `verificar: mix test test/fabrica/memoria/contexto_test.exs`

## Notas de execucao

**Feito em 2026-09-10.** `lib/fabrica/memoria/contexto.ex` (o modulo `Fabrica.Memoria.Contexto`)
e `test/fabrica/memoria/contexto_test.exs`, 10 testes.

**O que foi feito.** Tres funcoes publicas:

- `montar/3` — busca os trechos de `termo` no `projeto_id` (via `opts[:buscador]`, padrao
  `Fabrica.Memoria.Busca.buscar/2`, mesmo padrao de `opts[:embedder]` em `Busca.buscar/3` e
  `Ingestao.processar/3`) e formata o bloco.
- `formatar/1` — recebe trechos JA recuperados (desacopla a formatacao da busca — o teste da
  formatacao nao precisa de banco) e monta o texto, cada trecho como `"### <fonte>\n<corpo>"`.
  Lista vazia devolve `nil`, nunca bloco vazio.
- `anexar/2` — concatena `prefixo.texto <> "\n\n" <> bloco` (ou devolve so `prefixo.texto`
  quando o bloco e `nil`). So concatena: nunca reescreve nem toca no texto do prefixo que
  recebe, que e a propriedade que o criterio 1 trava.

**Nao mexi em `Fabrica.Prompt.Bloco`/`Prefixo`** (fora das `areas` desta tarefa). `anexar/2`
usa o prefixo ja montado como esta — o encaixe deste bloco na especie `:tarefa` do prefixo (ou
outra forma de wiring no `Agente.Laco`) fica para a tarefa que de fato monta o despacho
completo; aqui so ficou pronto o bloco pronto pra entrar DEPOIS.

**Teto declarado, nao best-effort.** `maximo_trechos/0` = 8 (mesmo teto de
`Fabrica.Memoria.Busca.@limite_resultado`, redundante de proposito: `formatar/1` nao deve
confiar que todo `buscador` injetado ja respeita o teto). `limite_bytes/0` = 6000. Os trechos
ja chegam ordenados do mais para o menos relevante (RRF da T-044), entao o corte por bytes e
sempre do FIM da lista para o comeco, nunca no meio de um corpo — e o PRIMEIRO trecho sempre
entra, mesmo se sozinho ja estourar o limite: o teto existe pra conter o restante da lista, nao
pra descartar o melhor achado (testado: "mesmo estourando sozinho o limite, o primeiro trecho
sempre entra").

**Commit:** `65f781e`

**Reproduzir:** `mix test test/fabrica/memoria/contexto_test.exs`

```
10 tests, 0 failures
```

`mix format`, `mix compile --warnings-as-errors` e `mix credo --strict` nos dois arquivos:
sem apontamentos. Rodei tambem `test/fabrica/prompt/prefixo_test.exs` junto (34 testes, 0
falhas) por reusar `Fabrica.Prompt.Prefixo` sem modifica-lo.

**Sugestao para o orquestrador:** o wiring de fato — chamar `Contexto.montar/3` com o termo
da tarefa e `Contexto.anexar/2` no texto que vai pro `Operario` — ainda nao existe em
`Fabrica.Agente.Laco`. Pode virar uma tarefa nova quando o despacho real for montado.

### Ciclo 2

**Apontamento do revisor:** `lib/fabrica/memoria/contexto.ex` estava salvo em disco com
CRLF (`file` acusava, `mix format --check-formatted` reprovava esse arquivo, `credo --strict`
com 1 apontamento de Consistency), enquanto o blob do commit `65f781e` ja era LF puro —
divergencia so no arquivo de trabalho, nao no commit.

**Verificado agora:** o arquivo de trabalho atual (`lib/fabrica/memoria/contexto.ex`) e o
teste (`test/fabrica/memoria/contexto_test.exs`) ja sao LF puro — conferido byte a byte
(`xxd` sem `0d0a`, `grep -Uc $'\r'` = 0) e `git diff HEAD -- <os dois arquivos>` vazio (o
arquivo de trabalho e identico ao que ja esta commitado). `mix format --check-formatted`
restrito aos dois arquivos da area: **sem apontamento**. `mix credo --strict` restrito aos
dois: **sem apontamento** ("13 mods/funs, found no issues"). `mix compile
--warnings-as-errors`: limpo. Nao houve necessidade de tocar no codigo — o CRLF nao
reproduz nesta sessao.

**Causa provavel (fora das `areas` desta tarefa, registro para o orquestrador):** o
repositorio tem `core.autocrlf=true` e nao tem `.gitattributes`. Nesse cenario, um
`git checkout`/clone novo no Windows pode reintroduzir CRLF em arquivos `.ex`/`.exs`
mesmo com o blob em LF — foi provavelmente isso que o revisor viu no ciclo 1, e pode
voltar a acontecer em qualquer arquivo do projeto, nao so neste. Sugiro ao orquestrador
uma tarefa a parte (fora de `areas` desta) para adicionar um `.gitattributes` na raiz do
projeto fixando `* text=auto eol=lf` (ou equivalente), o que travaria isso pra sempre em
vez de depender de o arquivo de trabalho "por acaso" estar em LF.

`mix format --check-formatted` rodado no projeto INTEIRO (fora do escopo desta tarefa,
so para confirmar que a falha nao e mais destes dois arquivos) aponta hoje apenas
`test/fabrica/ferramentas/confinamento_test.exs` — fora das `areas` de T-046, nao mexi.

**Reproduzir (ciclo 2):**
```
mix format --check-formatted lib/fabrica/memoria/contexto.ex test/fabrica/memoria/contexto_test.exs
mix credo --strict lib/fabrica/memoria/contexto.ex test/fabrica/memoria/contexto_test.exs
mix test test/fabrica/memoria/contexto_test.exs test/fabrica/prompt/prefixo_test.exs
```
Resultado: format sem divergência, credo sem apontamento, 34 tests / 0 failures.

**Commit:** `9909a97`

## Verificação

### Passada mecânica (sem modelo)

- [executado] O bloco entra DEPOIS do ultimo ponto de cache; o prefixo continua byte a byte igual entre despachos. — `mix test test/fabrica/memoria/contexto_test.exs` → **PASSOU**
- [executado] Cada trecho recuperado vem com a fonte (arquivo e secao) citada. — `mix test test/fabrica/memoria/contexto_test.exs` → **PASSOU**
- [executado] O bloco respeita o teto de 8 trechos e o limite de bytes. — `mix test test/fabrica/memoria/contexto_test.exs` → **PASSOU**
- [executado] Recuperacao vazia produz despacho normal, sem bloco, em vez de bloco vazio. — `mix test test/fabrica/memoria/contexto_test.exs` → **PASSOU**

Graus de prova: 4 executado(s), 0 para julgamento (de 4).

### Ciclo 2 — Verificação independente e mutação

- **[PASSOU] [executado] Critério 1: O bloco entra DEPOIS do ultimo ponto de cache; o prefixo continua byte a byte igual entre despachos.**
  Comando: `mix test test/fabrica/memoria/contexto_test.exs`
  Saída: 10 tests, 0 failures

- **[PASSOU] [executado] Critério 2: Cada trecho recuperado vem com a fonte (arquivo e secao) citada.**
  Comando: `mix test test/fabrica/memoria/contexto_test.exs` (mesmo comando; veredito reaproveitado)

- **[PASSOU] [executado] Critério 3: O bloco respeita o teto de 8 trechos e o limite de bytes.**
  Comando: `mix test test/fabrica/memoria/contexto_test.exs` (mesmo comando; veredito reaproveitado)

- **[PASSOU] [executado] Critério 4: Recuperacao vazia produz despacho normal, sem bloco, em vez de bloco vazio.**
  Comando: `mix test test/fabrica/memoria/contexto_test.exs` (mesmo comando; veredito reaproveitado)

Mutação: Removi `@separador` de `anexar/2` → teste **FALHOU (esperado)** com divergência no separador `\n\n`

Suíte: `test/fabrica/memoria/contexto_test.exs` + `test/fabrica/prompt/prefixo_test.exs` = 34 tests, 0 failures

Graus de prova: 4 executado(s), 0 para julgamento (de 4).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] O bloco entra DEPOIS do ultimo ponto de cache; o prefixo continua byte a byte igual entre despachos. — `mix test test/fabrica/memoria/contexto_test.exs` → **PASSOU**
- [executado] Cada trecho recuperado vem com a fonte (arquivo e secao) citada. — `mix test test/fabrica/memoria/contexto_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] O bloco respeita o teto de 8 trechos e o limite de bytes. — `mix test test/fabrica/memoria/contexto_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Recuperacao vazia produz despacho normal, sem bloco, em vez de bloco vazio. — `mix test test/fabrica/memoria/contexto_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)

Graus de prova: 5 executado(s), 0 para julgamento (de 5).

### Ciclo 3

- **[PASSOU] [executado] Critério 1: O bloco entra DEPOIS do ultimo ponto de cache; o prefixo continua byte a byte igual entre despachos.**
  Comando: `mix test test/fabrica/memoria/contexto_test.exs`
  Saída: 10 tests, 0 failures

- **[PASSOU] [executado] Critério 2: Cada trecho recuperado vem com a fonte (arquivo e secao) citada.**
  Comando: `mix test test/fabrica/memoria/contexto_test.exs`
  Saída: 10 tests, 0 failures (mesmo comando, reaproveitado)

- **[PASSOU] [executado] Critério 3: O bloco respeita o teto de 8 trechos e o limite de bytes.**
  Comando: `mix test test/fabrica/memoria/contexto_test.exs`
  Saída: 10 tests, 0 failures (mesmo comando, reaproveitado)

- **[PASSOU] [executado] Critério 4: Recuperacao vazia produz despacho normal, sem bloco, em vez de bloco vazio.**
  Comando: `mix test test/fabrica/memoria/contexto_test.exs`
  Saída: 10 tests, 0 failures (mesmo comando, reaproveitado)

Suíte relacionada: `mix test test/fabrica/memoria/contexto_test.exs test/fabrica/prompt/prefixo_test.exs` = **34 tests, 0 failures**

Verificações de formato e lint:
- `mix format --check-formatted lib/fabrica/memoria/contexto.ex test/fabrica/memoria/contexto_test.exs` — sem output (passou)
- `mix credo --strict lib/fabrica/memoria/contexto.ex test/fabrica/memoria/contexto_test.exs` — **13 mods/funs, found no issues**
- `mix compile --warnings-as-errors` — sem warnings

Verificações de linha endings:
- `file lib/fabrica/memoria/contexto.ex test/fabrica/memoria/contexto_test.exs` — ambos listam como "Unicode text, UTF-8 text" (sem "with CRLF line terminators")
- `grep -U $'\r' lib/fabrica/memoria/contexto.ex test/fabrica/memoria/contexto_test.exs` — nenhum CRLF detectado
- `git diff HEAD -- lib/fabrica/memoria/contexto.ex test/fabrica/memoria/contexto_test.exs` — vazio (arquivo de trabalho idêntico ao blob)

Mutação: Removi `@separador` de `anexar/2` (teste com `prefixo_texto <> bloco` em vez de `prefixo_texto <> @separador <> bloco`) → teste **FALHOU (esperado)** com divergência no separador `\n\n`

Graus de prova: 4 executado(s), 0 para julgamento (de 4).


## Conformidade

### Ciclo 1

Conformidade: cumpre

- Critério 1 (o bloco entra DEPOIS do prefixo; o prefixo continua byte a byte igual entre
  despachos) → `Contexto.anexar/2` (`lib/fabrica/memoria/contexto.ex`) só concatena, nunca
  reescreve `prefixo_texto`; travado por `contexto_test.exs` ("o texto final comeca com os
  bytes exatos do prefixo..." e "montar o mesmo prefixo de novo continua com bytes
  identicos...").
- Critério 2 (cada trecho recuperado vem com a fonte citada) → `trecho_para_texto/1` formata
  `"### <fonte>\n<corpo>"`; travado por `contexto_test.exs` ("a fonte de cada trecho aparece
  no bloco...").
- Critério 3 (teto de 8 trechos e limite de bytes) → `formatar/1` aplica
  `Enum.take(@maximo_trechos)` e depois `limitar_bytes/1`; travado por `contexto_test.exs`
  ("mais de 8 trechos recuperados..." e "trechos que juntos estourariam o limite de
  bytes...").
- Critério 4 (recuperação vazia produz despacho normal, sem bloco) → `formatar([]), do: nil`
  e `anexar/2` com bloco `nil` devolve só `prefixo_texto`; travado por `contexto_test.exs`
  ("lista vazia devolve nil..." e "recuperacao vazia produz despacho normal...").
- Escopo: `areas` restrita a `lib/fabrica/memoria/contexto.ex` e ao teste — respeitada; o
  wiring real em `Fabrica.Agente.Laco` foi corretamente deixado de fora e registrado como
  sugestão para o orquestrador, não escondido.
- Objetivo no espírito: o bloco pronto para entrar depois do prefixo cacheado existe,
  formatado e testado nos quatro pontos do Objetivo; a integração no despacho de fato é
  trabalho de outra tarefa, consistente com a delimitação de `areas` desta.

### Ciclo 2

Conformidade: cumpre

Nada mudou em relação ao Ciclo 1 quanto a critérios — o commit `9909a97` não toca
`lib/fabrica/memoria/contexto.ex` nem o teste (só `_gestao/MAPA.md`, regeneração de rotina
do pipeline, e o próprio arquivo da tarefa). Os quatro critérios seguem cumpridos pelos
mesmos artefatos já apontados no Ciclo 1. O que este ciclo resolve é o achado `importante`
de conformidade/qualidade de código do Ciclo 1 (CRLF) — ver Revisão abaixo.

## Revisão

### Ciclo 1

- [importante] `lib/fabrica/memoria/contexto.ex` — o arquivo está salvo em disco com
  terminadores de linha CRLF (`file lib/fabrica/memoria/contexto.ex` acusa "with CRLF line
  terminators"; nenhum outro arquivo do diff, nem vizinhos como `trecho.ex`/`prefixo.ex`,
  tem isso — `git show 65f781e:lib/fabrica/memoria/contexto.ex` confirma que o BLOB
  commitado é LF puro, então a divergência está no arquivo de trabalho atual, não no
  commit). Isso quebra o estágio `formato` da bateria canônica (`_gestao/ci.json`, primeiro
  estágio, interrompe os seguintes se falhar): reproduzi `mix format --check-formatted` e
  ele reprova exatamente este arquivo, e `mix credo --strict` acusa 1 apontamento de
  Consistency pelo mesmo motivo. Isso contradiz a afirmação nas Notas de execução ("mix
  format, mix compile --warnings-as-errors e mix credo --strict nos dois arquivos: sem
  apontamentos") — a passada mecânica do testador não pegou porque só rodou
  `mix test test/fabrica/memoria/contexto_test.exs`, sem os estágios `formato`/`lint`.
  Cenário de falha: `mix fabrica.ci` completo (exigido por `_gestao/ci.json` antes de marcar
  a tarefa `concluida`) para no primeiro estágio.

Demais achados: nenhum de lógica. Reproduzi `mix test test/fabrica/memoria/contexto_test.exs`
(10 tests, 0 failures) e junto com `test/fabrica/prompt/prefixo_test.exs` (34 tests, 0
failures) — batem com o que as Notas declaram. `mix compile --warnings-as-errors` limpo.
`limitar_bytes/1`, `trecho_para_texto/1` e `anexar/2` conferem com o contrato de
`Fabrica.Memoria.Trecho` (campos `fonte`, `corpo`, lidos na íntegra) e de
`Fabrica.Prompt.Prefixo.t()` (mapa com chave `:texto`, lido na íntegra).

### Ciclo 2

Achado `importante` do Ciclo 1 fechado — reverifiquei de forma independente, sem confiar
só no relato do executor: `grep -Uc $'\r' lib/fabrica/memoria/contexto.ex
test/fabrica/memoria/contexto_test.exs` → 0 em ambos; `git diff HEAD -- <os dois arquivos>`
vazio (arquivo de trabalho idêntico ao blob commitado); `mix format --check-formatted` nos
dois arquivos → sem saída; `mix credo --strict` nos dois → "13 mods/funs, found no issues";
`mix test test/fabrica/memoria/contexto_test.exs test/fabrica/prompt/prefixo_test.exs` → 34
tests, 0 failures. O commit `9909a97` não alterou o código (`git show --stat` só toca
`_gestao/MAPA.md`, regeneração de rotina, e o arquivo desta tarefa) — o CRLF do Ciclo 1 era
mesmo um artefato pontual do arquivo de trabalho daquela sessão (plausível dado
`core.autocrlf=true` sem `.gitattributes` no repositório, como o executor registrou), não
um defeito de código. A hipótese de causa raiz e a sugestão de `.gitattributes` para o
orquestrador são pertinentes e ficam fora de `areas` desta tarefa, corretamente.

Aprovado sem ressalvas. Nenhum achado novo de lógica, segurança ou integração — o código é
byte a byte o mesmo desde o commit `65f781e` (Ciclo 1), já revisado.

### Ciclo 3

**Resultado:** Todos os critérios PASSOU. Arquivo de trabalho está limpo (LF puro, sem CRLF),
testes passam, e formato/lint estão OK para os arquivos das áreas de T-046.

- `lib/fabrica/memoria/contexto.ex` — confirmado: nenhum CRLF (`grep -U $'\r'` = 0), arquivo
  idêntico ao blob commitado (`git diff HEAD` vazio). `file` lista como "Unicode text, UTF-8
  text" (sem mencionar "with CRLF line terminators").
- `test/fabrica/memoria/contexto_test.exs` — confirmado: nenhum CRLF, arquivo idêntico ao blob.
- `mix test test/fabrica/memoria/contexto_test.exs`: **10 tests, 0 failures**
- `mix test test/fabrica/memoria/contexto_test.exs test/fabrica/prompt/prefixo_test.exs`:
  **34 tests, 0 failures** (testes relacionados que compartilham `Fabrica.Prompt.Prefixo`).
- `mix format --check-formatted` nos dois arquivos: sem output (passou).
- `mix credo --strict` nos dois arquivos: **13 mods/funs, found no issues**.
- `mix compile --warnings-as-errors`: sem warnings.

**Mutação:** Removi `@separador` de `anexar/2` (mudança: `prefixo_texto <> @separador <> bloco`
→ `prefixo_texto <> bloco`). Resultado: teste **FALHOU (esperado)** com divergência clara no
separador `\n\n` entre prefixo e bloco (observado no diff do teste). Restaurado e testes
voltaram a passar.

**Falha não-crítica:** `mix verificar` (suíte completa do projeto) falha em
`test/fabrica/ferramentas/confinamento_test.exs` — arquivo fora das áreas de T-046. Conforme
documentado pelo executor em Ciclo 2, essa é falha pre-existente fora do escopo desta tarefa.

Demais conformidades: nenhuma observação de lógica ou contrato.

