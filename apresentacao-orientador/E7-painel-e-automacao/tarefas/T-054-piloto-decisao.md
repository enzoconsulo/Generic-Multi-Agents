---
id: T-054
titulo: "Piloto automatico: a decisao (funcao pura)"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-031, T-039, T-013b]
areas: [lib/fabrica/piloto/decisao.ex, test/fabrica/piloto/decisao_test.exs]
tentativas: 1
criada: 2026-08-28
atualizada: 2026-09-16
---

## Objetivo
A tabela de decisao que diz se o piloto continua, dorme ou para — pura, testavel, e com a
ORDEM dos ramos sendo a propria regra.

## Contexto
Porte de `jobs/piloto/decisao.ts` da v1, que ja e puro e ja tem teste. O piloto encadeia
rodadas sozinho ate um criterio de parada; ele NAO e um motor novo — cada rodada e o mesmo
trabalho montado pelo mesmo caminho do botao. O que ele acrescenta e o dedo que aperta o
botao de novo, e os freios.

Freios obrigatorios (os dois, sempre): **teto de gasto acumulado** e **maximo de rodadas**.
Sem um deles configurado, o piloto nao liga.

Paradas automaticas:
  - acabou tarefa pronta
  - alguma tarefa pediu replanejamento
  - **duas rodadas seguidas sem concluir nada**
  - falha

E uma nao-parada, que e a razao de a cota ser mecanismo de primeira classe: **cota batida
nao para o piloto** — ele dorme e rearma na hora anunciada.

A ORDEM da tabela e a regra: leia o cabecalho antes de inserir um ramo no meio. Uma
condicao avaliada fora de ordem muda o comportamento sem que nenhum teste isolado acuse.

Desligar NAO corta a rodada em voo.

## Criterios de aceite
- [x] Cada criterio de parada dispara na condicao certa (um teste por criterio).
      `verificar: mix test test/fabrica/piloto/decisao_test.exs`
- [x] Cota batida faz o piloto DORMIR e rearmar, nunca parar.
      `verificar: mix test test/fabrica/piloto/decisao_test.exs`
- [x] Sem teto de gasto ou sem maximo de rodadas, o piloto recusa ligar.
      `verificar: mix test test/fabrica/piloto/decisao_test.exs`
- [x] Desligar o piloto nao corta a rodada em voo.
      `verificar: mix test test/fabrica/piloto/decisao_test.exs`

## Notas de execucao
Represada em 09/09 pelo orquestrador: depende da T-013b. O coletor de `Comando.rodar/4` perde
a saida do processo em ~7,5% das execucoes sob carga, o que faz a suite ficar vermelha ao acaso
e classifica criterio quebrado como `:entrega` — reprovacao falsa que queima um ciclo. Verificar
qualquer coisa antes disso e apostar num portao que mente. O motor repromove sozinho quando a
T-013b concluir.

T-013b concluida (`0d8aa9b`), destravando esta tarefa. `jobs/piloto/decisao.ts` da v1 NAO esta
presente nesta maquina (busca confirmada antes de comecar) — a tabela abaixo foi projetada a
partir do Objetivo/Contexto desta tarefa, no mesmo estilo de `Fabrica.Orcamento` (T-031) e
`Fabrica.Retrabalho.Escada`.

**Modulo novo: `Fabrica.Piloto.Decisao`, puro** (sem banco, sem processo, sem `send_after`).
Duas funcoes publicas:

- **`ligar/2`** — recebe `teto_de_gasto` e `maximo_de_rodadas`; devolve `{:ok, config}` so se
  os DOIS vierem preenchidos e maiores que zero (zero/negativo conta como ausente — nao e um
  freio de verdade), senao `{:erro, [motivos...]}` listando exatamente o que falta.
- **`decidir/1`** — recebe uma `situacao()` (mapa com `ligado?`, os dois freios, o gasto e as
  rodadas acumulados, os quatro sinais da rodada, e `cota: %{batida?, reabre_em}` no MESMO
  formato de `Fabrica.Cota.estado/1`) e devolve `:continuar | {:dormir, DateTime.t() | nil} |
  {:parar, motivo}`.

**A ordem, documentada no `@moduledoc` (e e a propria regra, como o Objetivo pede):**
1. desligado (vence tudo, inclusive cota — nao ha por que agendar rearme de quem nao vai
   rodar de novo); 2. cota batida (nao-parada, checada ANTES dos motivos de parada de
   proposito: sem essa prioridade, cota batida seria mal-classificada como estagnacao ou como
   falha — os testes "cota batida vence estagnacao/falha/ausencia de tarefa" travam isso);
   3. acabou tarefa pronta; 4. pediu replanejamento; 5. duas rodadas seguidas sem concluir
   (`rodadas_sem_concluir_para_estagnar/0` = 2, a constante que o Objetivo fixa); 6. falha;
   7. teto de gasto atingido; 8. maximo de rodadas atingido. `decidir/1` foi dividido em tres
   funcoes privadas em cadeia (`avaliar_paradas/1`, `avaliar_freios/1`) so para caber no teto
   de complexidade ciclomatica do credo — a ORDEM entre os grupos continua sendo a chamada
   sequencial, comentada no codigo para quem for inserir um ramo novo.

**Prova de que desligar nao corta rodada em voo:** por design, nao ha em `situacao()` nenhum
campo que descreva "rodada em execucao agora" — mesma tecnica que `Fabrica.Orcamento` usa para
provar que o teto nao interrompe. O teste correspondente afirma a aridade
(`function_exported?(Decisao, :decidir, 1)`) e, comportamentalmente, que desligado sempre
resulta em `{:parar, :desligado}` (parando a PROXIMA rodada), inclusive quando a cota tambem
esta batida.

**TDD seguido:** o teste (`test/fabrica/piloto/decisao_test.exs`, 21 testes + 4 doctests) foi
escrito antes do modulo e rodado vermelho primeiro (`Fabrica.Piloto.Decisao is not loaded`)
antes de qualquer linha de implementacao.

Rodei `mix format --check-formatted`, `mix credo --strict` e `mix compile
--warnings-as-errors` nos dois arquivos da tarefa — sem apontamentos (o `cond` de 8 ramos em
`decidir/1` estourou a complexidade ciclomatica do credo na primeira versao; dividido em tres
funcoes encadeadas para resolver, sem mudar comportamento nem ordem).

**Reproduzir:** `mix test test/fabrica/piloto/decisao_test.exs`

**Commit:** `865054c`

## Verificacao


## Conformidade

### Ciclo 1

Conformidade: cumpre

- Cada criterio de parada dispara na condicao certa (um teste por criterio) → `lib/fabrica/piloto/decisao.ex` (`avaliar_paradas/1`, `avaliar_freios/1`) + `test/fabrica/piloto/decisao_test.exs`, describe "decidir/1 — cada criterio de parada, isolado" (8 testes, um por ramo, incluindo o negativo "uma unica rodada sem concluir ainda NAO e estagnacao").
- Cota batida faz o piloto DORMIR e rearmar, nunca parar → `decidir/1`, clausula 2 (`situacao.cota.batida? -> {:dormir, situacao.cota.reabre_em}`) + describe "cota batida — nao-parada" (5 testes, inclusive vencendo estagnacao/falha/ausencia de tarefa pronta).
- Sem teto de gasto ou sem maximo de rodadas, o piloto recusa ligar → `ligar/2` (`ausente?/1` trata `nil`, zero e negativo como ausente) + describe "ligar/2" (5 testes).
- Desligar o piloto nao corta a rodada em voo → `decidir/1`, clausula 1 (`not situacao.ligado? -> {:parar, :desligado}`), mais a ausencia deliberada de qualquer campo "rodada em andamento" em `situacao()` (mesma tecnica de `Fabrica.Orcamento`) + describe "desligar nao corta a rodada em voo" (3 testes, inclusive vencendo cota batida e a prova de aridade).
- Objetivo (tabela pura, testavel, com a ORDEM documentada como a propria regra) → `@moduledoc` de `Fabrica.Piloto.Decisao` numera os 8 ramos e justifica cada prioridade; a implementacao (`decidir/1` → `avaliar_paradas/1` → `avaliar_freios/1`) segue exatamente essa ordem, sem banco/processo/`send_after`, confirmando o Contexto ("ele NAO e um motor novo").
- Escopo: nada alem do pedido. `_gestao/MAPA.md` e o proprio arquivo da tarefa sao a unica sobra, esperada (indice regenerado + notas de execucao), nao trabalho fora das `areas` declaradas.
- `jobs/piloto/decisao.ts` da v1 nao esta nesta maquina (registrado nas Notas) — a tabela foi projetada a partir do Objetivo/Contexto, e a ordem entre grupos (desligado > cota > paradas da rodada > freios) e decisao de projeto documentada e coerente com o pedido; nada no Objetivo/Contexto contradiz essa prioridade especifica.

## Revisao

### Ciclo 1

Aprovado sem ressalvas.

Verifiquei o diff inteiro do commit `865054c` (`git show --stat`/`git show`), reli
`lib/fabrica/piloto/decisao.ex` e `test/fabrica/piloto/decisao_test.exs` na integra, e rodei de
novo `mix format --check-formatted`, `mix credo --strict` e `mix test
test/fabrica/piloto/decisao_test.exs` nos dois arquivos — limpos, 4 doctests + 21 tests, 0
failures, batendo com o que as Notas e a Verificacao ja registravam. Rodei tambem `mix dialyzer`
(estagio "tipos" do `ci.json`, que as Notas nao mencionam ter rodado) — os avisos existentes sao
todos pre-existentes em `console_live.ex`, `quadro_live.ex`, `fabrica.importar.ex` e
`transicao.ex`; nenhum aviso novo em `Fabrica.Piloto.Decisao`.

- A ordem dos 8 ramos em `decidir/1` (`desligado` → `cota batida` → `sem tarefa` →
  `replanejamento` → `estagnado` → `falha` → `teto de gasto` → `maximo de rodadas`) esta
  documentada no `@moduledoc` e implementada exatamente assim via `avaliar_paradas/1` →
  `avaliar_freios/1`; os testes de prioridade (`cota batida vence estagnacao/falha/ausencia de
  tarefa`, `desligado vence ate a cota batida`) travam essa ordem contra regressao silenciosa,
  como o Objetivo pede.
- `ligar/2` trata `nil`, zero e negativo como "ausente" (`ausente?/1`) — coerente com a Nota "zero
  ou negativo conta como ausente — nao e um freio de verdade" e coberto por teste dedicado.
- A prova de "desligar nao corta a rodada em voo" e por design (nenhum campo de "rodada em
  andamento" em `situacao()`), a mesma tecnica ja usada por `Fabrica.Orcamento` — consistente e
  nao inventa mecanismo novo.
- [menor] `lib/fabrica/piloto/decisao.ex:52` — o `@spec` de `ligar/2` declara
  `pos_integer() | nil` para `maximo_de_rodadas`, mas a propria função (e o teste "zero ou
  negativo conta como ausente") depende de aceitar valores não positivos para rejeitá-los; o
  spec mais preciso seria `integer() | nil`. Não é bug (dialyzer não acusa nada em
  `Fabrica.Piloto.Decisao`) — é imprecisão de documentação de tipo, não bloqueia.
- [menor] O `Commit:` ficou `PENDENTE` no commit `865054c` e só foi preenchido num commit
  seguinte (`970a39b`, fora deste diff) — já é o padrão observado em outras tarefas da fábrica
  (ex. T-053) e não atrapalhou a localização do diff revisado aqui.

## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] Cada criterio de parada dispara na condicao certa (um teste por criterio). — `mix test test/fabrica/piloto/decisao_test.exs` → **PASSOU**
- [executado] Cota batida faz o piloto DORMIR e rearmar, nunca parar. — `mix test test/fabrica/piloto/decisao_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Sem teto de gasto ou sem maximo de rodadas, o piloto recusa ligar. — `mix test test/fabrica/piloto/decisao_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Desligar o piloto nao corta a rodada em voo. — `mix test test/fabrica/piloto/decisao_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)

Graus de prova: 5 executado(s), 0 para julgamento (de 5).

### Ciclo 1

- **[PASSOU] [executado] Critério 1: Cada criterio de parada dispara na condicao certa (um teste por criterio)**
  Comando: `mix test test/fabrica/piloto/decisao_test.exs`
  Saída: 4 doctests, 21 tests, 0 failures

- **[PASSOU] [executado] Critério 2: Cota batida faz o piloto DORMIR e rearmar, nunca parar**
  Comando: `mix test test/fabrica/piloto/decisao_test.exs`
  Saída: 4 doctests, 21 tests, 0 failures (testes "cota batida vence estagnacao", "cota batida vence falha", "cota batida vence ausencia de tarefa pronta" inclusos)

- **[PASSOU] [executado] Critério 3: Sem teto de gasto ou sem maximo de rodadas, o piloto recusa ligar**
  Comando: `mix test test/fabrica/piloto/decisao_test.exs`
  Saída: 4 doctests, 21 tests, 0 failures (testes "sem teto de gasto, recusa", "sem maximo de rodadas, recusa", "sem os dois, recusa" inclusos)

- **[PASSOU] [executado] Critério 4: Desligar o piloto nao corta a rodada em voo**
  Comando: `mix test test/fabrica/piloto/decisao_test.exs`
  Saída: 4 doctests, 21 tests, 0 failures (testes "desligado para a PROXIMA rodada", "desligado vence ate a cota batida", "prova por design" inclusos)

Suíte completa: 29 doctests, 1011 tests, 0 failures — `mix test`
Mutação: inverteu `not situacao.ligado?` para `situacao.ligado?` → a prova falhou com 16 falhas (esperado)
Graus de prova: 4 executados, 0 inspecionados, 0 julgados
