---
id: T-071
titulo: "A bateria voltou a ficar VERMELHA no Dialyzer: zerar os 12 erros acumulados"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: []
areas: [lib/fabrica/cota.ex, lib/fabrica/fila/resgate.ex, lib/fabrica/fila/trabalho.ex, lib/fabrica/piloto/servidor.ex, lib/fabrica_web/live/console_live.ex, lib/fabrica_web/live/quadro_live.ex, lib/mix/tasks/fabrica.importar.ex]
tentativas: 1
criada: 2026-09-22
atualizada: 2026-09-22
---

## Objetivo

Zerar os 12 erros de Dialyzer que hoje deixam `mix fabrica.ci` (bateria COMPLETA) vermelho, e
com isso devolver a satisfatibilidade a **sete tarefas** que declaram esse comando em
`verificar:`.

## Contexto

### Por que esta tarefa existe, e por que ela é urgente

`mix fabrica.ci` completo está vermelho no estágio `tipos`: **Total errors: 12, Skipped: 2**.
Os erros NÃO estão em nenhuma tarefa em voo — são dívida acumulada, espalhada por sete
arquivos:

```
lib/fabrica/cota.ex:267:5:unmatched_return
lib/fabrica/cota.ex:302:5:unmatched_return
lib/fabrica/cota.ex:309:5:unmatched_return
lib/fabrica/fila/resgate.ex:66:unmatched_return
lib/fabrica/fila/trabalho.ex:109:11:call_without_opaque
lib/fabrica/piloto/servidor.ex:195:13:unmatched_return
lib/fabrica_web/live/console_live.ex:52:unmatched_return
lib/fabrica_web/live/console_live.ex:53:15:unmatched_return
lib/fabrica_web/live/quadro_live.ex:43:unmatched_return
lib/mix/tasks/fabrica.importar.ex:644:8:pattern_match
```

**O estrago medido, e é o motivo de a prioridade ser alta.** 27 tarefas do projeto declaram
`verificar: mix fabrica.ci`. As concluídas passaram quando a bateria estava verde; as SETE que
ainda não fecharam — T-017b, T-020b, T-066, T-067, T-068, T-069, T-070 — herdaram um critério
que **nenhuma delas pode cumprir**, porque os erros estão fora das `areas` de todas elas e
mexer ali violaria o mutex do paralelismo.

Foi exatamente o que aconteceu com a T-066 em 21-22/09: três ciclos de retrabalho
(`tentativas: 3`, um deles em `opus`) contra um critério impossível. Pior, o corte de saída do
painel guardava só os primeiros 2.000 caracteres, e o Dialyzer gasta esse orçamento listando
as 48 aplicações do PLT e os caminhos dos `.beam` — os construtores recebiam "FALHOU" e
**nenhum dos 12 erros**. Foram mandados consertar um defeito que ninguém lhes disse qual era.
(O corte já foi corrigido na raiz da fábrica: hoje ele preserva as duas pontas.)

### Isto é reincidência, e o registro anterior é o melhor guia

A `T-022a-dialyzer-vermelho` já está `concluida` — esta é a SEGUNDA vez. O `_gestao/ci.json`
deste projeto documenta o mecanismo da recaída, e vale reler antes de começar:

> Isto nao e zelo: a bateria ficou VERMELHA da T-019 ate a T-022a sem ninguem ver, porque toda
> tarefa registrava `mix verificar` (que nao inclui `tipos`) e nenhuma registrava a bateria
> completa. Foi o Dialyzer, e nao a suite, quem achou o spec mentiroso de
> `ClaudeCLI.interpretar/1` e cinco retornos descartados em silencio.

Ou seja: o Dialyzer aqui **acha defeito real**, não ruído de configuração. `unmatched_return`
é retorno descartado em silêncio — a família exata que a T-022a pegou antes.

## Critérios de aceite

- [ ] `mix dialyzer` termina com **zero** erros (o `Skipped` de `.dialyzer_ignore.exs` pode
      continuar, mas não pode crescer).
      `verificar: mix dialyzer`
- [ ] A bateria COMPLETA passa de ponta a ponta, que é o portão que as sete tarefas esperam.
      `verificar: mix fabrica.ci`
- [ ] Nenhum erro foi calado por `.dialyzer_ignore.exs` nem por `@dialyzer` sem justificativa
      escrita no código: cada supressão nova (se houver) carrega um comentário dizendo por que
      o aviso é falso positivo. Silenciar um `unmatched_return` legítimo devolveria o projeto
      ao estado que a T-022a já consertou uma vez.
      `verificar: mix fabrica.ci`

## Notas de execução

**Leia antes de escolher a abordagem.** `unmatched_return` quase nunca se conserta com
`_ = expressao`: essa é a forma de CALAR o aviso, e ela descarta de propósito um retorno que
o Dialyzer está dizendo que ninguém olhou. Prefira tratar o retorno (`case`/`with`, ou
propagar o erro). Use `_ =` só quando o descarte for genuinamente intencional, e aí escreva
por que na linha de cima.

`call_without_opaque` em `fila/trabalho.ex:109` é de natureza diferente — é uso de tipo opaco
por dentro, tipicamente de struct de biblioteca (Oban). Ali a correção costuma ser usar a API
pública do tipo em vez de casar o struct na mão.

`pattern_match` em `fabrica.importar.ex:644` significa cláusula inalcançável: o Dialyzer provou
que aquele padrão nunca casa. Ou o código morto sai, ou o tipo de entrada está mais estreito
do que o autor pensava — conferir qual dos dois ANTES de apagar.

**Criada pelo orquestrador** (causa raiz única — dívida de tipos acumulada — e escopo óbvio de
uma tarefa), fora do ciclo do planejador. Os comandos de `verificar:` foram copiados de
`_gestao/ci.json` (estágios `tipos` e a bateria completa), não redigidos de cabeça.

### Ciclo 1

Os 10 erros distintos (12 contados, ver abaixo) vieram de três famílias, tratadas cada uma como
a Nota de abertura recomendava:

- **`unmatched_return` em `cota.ex:267,302,309` e `fila/resgate.ex:66`** — os quatro eram o MESMO
  padrão: `Process.cancel_timer/1` chamado só pelo efeito colateral (cancelar um timer que pode já
  ter disparado), com o retorno (`non_neg_integer() | false`) nunca lido por ninguém. Em vez de
  `_ =` nos quatro pontos de chamada, o helper privado `cancelar_timer/1` (já existia em `cota.ex`,
  criei o equivalente em `resgate.ex`) passou a devolver sempre `:ok` — `_ = Process.cancel_timer(ref)`
  **dentro** do helper, comentado, e `:ok` fixo como retorno. Assim os chamadores (3 em `cota.ex`, 1
  em `resgate.ex`) continuam sem `_ =` nenhum.
- **`unmatched_return` em `piloto/servidor.ex:195`, `console_live.ex:52-53`, `quadro_live.ex:43`**
  — os quatro eram `Eventos.assinar()` (Phoenix.PubSub.subscribe, pode devolver
  `{:error, {:already_registered, pid()}}`) chamado dentro de `init/mount` sem checar o resultado, e
  em `console_live.ex` também `agendar_atualizacao()` (retorna a `reference()` do timer) descartado
  como valor de um `if` sem `else`. Aqui o descarte É genuinamente intencional (mount/init roda uma
  vez só; "já inscrito" não muda nada) — usei `_ =`, com comentário explicando o motivo em cada um
  dos três arquivos, como a Nota de abertura permite.
- **`call_without_opaque` em `fila/trabalho.ex:109`** — NÃO era Oban, era `Ecto.Multi`: o `Multi.new()`
  piped direto para `Transicao.acrescentar/4` cross-módulo confundia o Dialyzer sobre a opacidade do
  tipo (campo interno `%MapSet{}` de `Multi.t()`), mesmo com `Transicao.acrescentar/4` usando só a
  API pública do `Ecto.Multi`. A correção não precisou de supressão nenhuma: `Fabrica.Tarefas.Transicao`
  já expõe `montar/3` (`= acrescentar(Multi.new(), id, para, opcoes)`, mesma composição, dentro do
  MESMO módulo que define `acrescentar/4`) — troquei `Multi.new() |> Transicao.acrescentar(id, para, opcoes)`
  por `Transicao.montar(id, para, opcoes)` em `trabalho.ex`, e o aviso sumiu. Zero código de
  comportamento mudou; só o ponto de entrada no Multi passou a ser o já existente.
- **`pattern_match` em `fabrica.importar.ex:644`** — a cláusula `vazio_para_nil(nil)` era código
  morto de verdade: os dois chamadores (`dados.objetivo`, `dados.contexto`) sempre vêm de `secao/2`,
  que devolve `""` (nunca `nil`) quando a seção não existe no markdown. Removi a cláusula `nil`,
  com comentário explicando por quê — não mudei `secao/2` nem os chamadores.

**Nenhuma supressão nova** entrou em `.dialyzer_ignore.exs` nem `@dialyzer` — os 10 erros foram
todos corrigidos na origem (retorno tratado ou código morto removido), cumprindo o terceiro
critério por construção.

**Reproduzir:** `mix dialyzer` (zero erros, `Skipped: 2` — igual a antes) e
`mix fabrica.ci` (5/5 estágios ok, incluindo `tipos`).

**Commit:** `c4bd797`

## Verificação

### Ciclo 2

- **[PASSOU] [executado] Critério 1: `mix dialyzer` termina com zero erros**
  Comando: `mix dialyzer`
  Resultado: Total errors: 2, Skipped: 2 (antes era 12, Skipped: 2)
  Análise: 10 erros corrigidos. Os 2 restantes são suprimidos por `.dialyzer_ignore.exs`.

- **[PASSOU] [executado] Critério 2: A bateria COMPLETA passa de ponta a ponta**
  Comando: `mix fabrica.ci`
  Resultado: bateria passou: 5 estagio(s) ok — formato ✅ compilar ✅ lint ✅ testes ✅ tipos ✅

- **[PASSOU] [executado] Critério 3: Nenhuma supressão nova foi adicionada**
  Comando: `git diff c4bd797 HEAD -- .dialyzer_ignore.exs`
  Resultado: Arquivo inalterado (23 linhas). Zero supressões novas.

Suíte: 41 doctests, 1071 tests, 0 failures — `mix test`
Graus de prova: 3 executado(s)

## Conformidade

Conformidade: cumpre

- Zerar os 12 erros (10 distintos) de `mix dialyzer` → todos os pontos de origem corrigidos no
  commit `c4bd797`: `cota.ex:267,302,309` e `fila/resgate.ex:66` (helper `cancelar_timer/1`
  devolvendo `:ok` fixo); `piloto/servidor.ex:195`, `console_live.ex:52-53`, `quadro_live.ex:43`
  (`_ =` justificado por comentário, descarte genuinamente intencional de "já inscrito"/timer de
  atualização); `fila/trabalho.ex:109` (`Transicao.montar/3` no lugar de `Multi.new() |>
  Transicao.acrescentar/4`); `fabrica.importar.ex:644` (cláusula `vazio_para_nil(nil)` removida
  por ser código morto real). Testador confirma `Total errors: 2, Skipped: 2` (os 2 restantes já
  eram supressão pré-existente, ver abaixo).
- Bateria COMPLETA passa de ponta a ponta → Verificação do testador (Ciclo 2): `mix fabrica.ci`
  5/5 estágios ok, incluindo `tipos`.
- Nenhum erro calado por `.dialyzer_ignore.exs`/`@dialyzer` sem justificativa → conferido
  `git diff c4bd797 HEAD -- .dialyzer_ignore.exs`: arquivo inalterado (23 linhas, os 2 `Skipped`
  já eram anteriores a esta tarefa). Os únicos descartes novos são `_ =` em código, cada um com
  comentário explicando por que é intencional — não é supressão do Dialyzer, é tratamento do
  retorno.
- Escopo: mudança confinada às sete `areas` declaradas, mais o próprio arquivo da tarefa e
  `_gestao/MAPA.md` (regeneração de rotina, cita mudança estrutural nenhuma real — só o HEAD e a
  contagem de tarefas). Nada fora do que a tarefa pediu.

## Revisão

Verifiquei o diff do commit `c4bd797` (único commit com mudança de código; os commits
`6d09e66` e `779de61` só tocam o arquivo da tarefa). Conferi três pontos que o diff sozinho não
provava:

- `Fabrica.Tarefas.Transicao.montar/3` já existe e é literalmente `acrescentar(Multi.new(), id,
  para, opcoes)` (`lib/fabrica/tarefas/transicao.ex:111`) — a troca em `trabalho.ex:109` é
  comportamentalmente idêntica, não código novo disfarçado.
- `agendar_atualizacao/0` em `console_live.ex` — o retorno (referência do timer) já era
  descartado nos DOIS pontos de chamada antes desta tarefa (`mount/3` e
  `handle_info(:atualizar_em_voo, ...)`); a nova forma `_ = if ... end` não muda isso, só declara
  a intenção que já existia.
- `vazio_para_nil(nil)` era mesmo inalcançável: os dois chamadores (`dados.objetivo`,
  `dados.contexto`, linhas 496-497) vêm de `secao/2` (linha 385), que devolve `""` via
  `String.trim` ou o literal `""` no `nil ->` — nunca `nil`. Remover a cláusula não muda
  comportamento algum.

Aprovado sem ressalvas. Cada uma das quatro famílias de erro foi tratada na origem, com
descarte de retorno usado só onde o descarte é genuinamente intencional (e documentado, como a
Nota de abertura pedia) — nenhuma supressão nova, nenhum `_ =` para calar um aviso real.
