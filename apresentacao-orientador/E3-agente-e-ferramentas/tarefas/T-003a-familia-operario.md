---
id: T-003a
titulo: A fronteira do operario declara a FAMILIA, e o laco para de executar ferramenta que nao e dele
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-018b]
areas: [lib/fabrica/operario.ex, lib/fabrica/agente/laco.ex, test/fabrica/agente/laco_test.exs]
tentativas: 1
criada: 2026-09-01
atualizada: 2026-09-03
---

## Objetivo
Fazer o contrato `Fabrica.Operario` distinguir as duas familias de operario — **agente
completo** (roda o proprio laco de ferramentas) e **endpoint de modelo** (a fabrica roda o
laco) — e o `Agente.Laco` respeitar essa distincao, em vez de tentar executar ferramenta que o
operario ja executou.

## Contexto

**Esforco estimado: 60 a 90 min.** E a CAUSA 2 do marco 1 reprovado, e a tarefa de desenho de
que as outras dependem.

**O que foi medido (T-020, ciclo 3).** O `Laco` executa ferramenta por dispatch de nome, num
mapa `estado.ferramentas` que o CHAMADOR registra. O `Operario.ClaudeCLI` devolve blocos
`:uso_de_ferramenta` cujo vocabulario vem de DENTRO do CLI — `Write`, `Bash`, `Edit`, `Read` —
e que o proprio CLI **ja executou**. O `Laco` entao procura "Write" no mapa dele, nao acha,
grava *"ferramenta desconhecida"* e chama o operario de novo com o historico inflado. A segunda
chamada devolve exit 255 com stdout e stderr vazios, e o laco encerra em erro.

**Isto nao e defeito de implementacao, e incompatibilidade de projeto.** `claude --print` nao e
um endpoint de modelo: e um agente completo, com laco, ferramentas e permissoes proprios.
Consertar as causas 1 e 3 sem decidir esta nao resolve — e o conserto delas muda de forma
conforme a decisao aqui.

**O pedido de escopo do Enzo, de 01/09**, e a mesma questao vista do outro lado: a camada de
operario deve ser opcional e trocavel (Claude assinatura via CLI, Claude por API, e mais adiante
outras assinaturas e outros CLIs por token). A tabela e a decisao estao no `PLANO_V2.md`, secao
v0.2 — leia antes de comecar. O desenho recomendado, e o que esta tarefa implementa, e o
**A**: uma fronteira, duas familias declaradas.

### O desenho

`Fabrica.Operario` ganha:

    @callback familia() :: :agente_completo | :endpoint_de_modelo

**Callback OPCIONAL, com padrao `:endpoint_de_modelo`**, resolvido por uma funcao publica do
proprio modulo (`Operario.familia/1`, recebendo o modulo do adaptador). O padrao e escolha de
seguranca, e nao preguica: um adaptador que esquece de declarar cai no caminho ESTRITO, em que
a fabrica executa as ferramentas e o confinamento e o orcamento dela valem — falha para o lado
seguro. Escreva esse motivo no `@moduledoc`; sem ele, o padrao parece descuido.

`Requisicao` ganha o campo **`papel`** (padrao `"construtor"`), e o `Laco` passa a preenche-lo a
partir de `estado.papel`, que ja existe. E por ele que o adaptador de agente completo vai
traduzir o catalogo de ferramentas para o vocabulario do CLI (T-018c) — sem isso, a governanca
de *"quem verifica nao corrige"* nao tem como atravessar a fronteira.

No `Laco`, a ramificacao acontece **uma vez**, ao tratar a resposta:

- `:endpoint_de_modelo` — nada muda. Byte a byte o comportamento de hoje.
- `:agente_completo` — o laco faz **uma** volta: contabiliza o consumo, NAO executa ferramenta
  nenhuma, nao anexa turno novo e encerra com o `motivo_parada` que a resposta trouxer. Blocos
  `:uso_de_ferramenta` que vierem sao registro do que o operario ja fez, e nao pedido.

**Desempenho.** A ramificacao e uma funcao pura em Elixir: zero ida a mais ao modelo, zero volta
extra. E para a familia agente completo **nao mande a lista de ferramentas da fabrica** na
requisicao: ela nao significa nada para o CLI e so pesaria no prefixo.

**Fora de escopo, e nao invente:** retomar sessao do CLI depois de um teto de turnos
(`--resume`/`--continue`), varias sessoes encadeadas, negociacao de capacidades, registro de
provedores, plugin. Uma volta, um desfecho. Se achar que falta, ANOTE nas Notas.

**Nao toque nos adaptadores.** `claude_cli.ex` e `messages_api.ex` ficam intocados aqui — o
`ClaudeCLI` continua caindo no padrao `:endpoint_de_modelo` e passa a `:agente_completo` na
T-018c, que e a dona daquele arquivo. Esta tarefa se prova inteira com dubles, sem cota.

**A prova da regua de escopo.** O pedido do Enzo diz que acrescentar um provedor depois deve ser
*"escrever um adaptador e declara-lo"*, nunca *"mexer no miolo"*. O criterio 1 e essa prova:
dois adaptadores novos, um de cada familia, definidos **so no arquivo de teste**, conduzidos
pelo `Laco` sem uma linha alterada em `lib/`. Se para faze-los rodar voce precisar mexer em
`lib/`, o desenho esta errado — pare e registre.

## Criterios de aceite
- [ ] Um adaptador de CADA familia, definido so no arquivo de teste, e conduzido pelo `Laco` sem alteracao nenhuma em `lib/` — e a prova de que acrescentar provedor nao mexe no miolo.
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] Com um operario `:agente_completo` que devolve blocos `:uso_de_ferramenta`, o `Laco` NAO executa ferramenta nenhuma e NAO da segunda volta (uma chamada ao operario, e uma so).
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] Com um operario `:endpoint_de_modelo`, o comportamento e o de hoje: os testes existentes do laco continuam passando sem que nenhuma assercao antiga tenha sido reescrita (so acrescimo).
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] Um adaptador que NAO declara `familia/0` — definido tambem so no teste — e tratado como `:endpoint_de_modelo`, e ha teste do padrao.
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] `Requisicao` carrega o `papel` e o `Laco` o repassa em TODA volta, conferido pela requisicao recebida no duble.
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] A bateria completa passa nos cinco estagios, `tipos` incluido.
      `verificar: mix fabrica.ci`

## Notas de execucao

### Ciclo 1

Implementado o desenho A do `PLANO_V2.md` (secao v0.2): uma fronteira, duas familias
declaradas.

**`lib/fabrica/operario.ex`:**
- `@callback familia() :: :agente_completo | :endpoint_de_modelo`, marcado
  `@optional_callbacks familia: 0`.
- `Operario.familia/1`, funcao publica que resolve a familia de um modulo com o padrao
  seguro `:endpoint_de_modelo` (via `Code.ensure_loaded?/1` + `function_exported?/3` — nunca
  chama o callback direto sem essa checagem, senao um adaptador que nao o implementa
  quebraria em vez de cair no padrao).
- `Requisicao` ganhou o campo `papel` (padrao `"construtor"`).

**`lib/fabrica/agente/estado.ex`:** campo novo `operario: module() | nil` (padrao `nil`).
Necessario para o criterio 1: sem ele, o `Laco` so teria como escolher o operario via
`Application.get_env/3` global — e mudar essa config por teste quebraria o isolamento dos
testes `async: true` deste modulo (a config afeta TODOS os processos, nao so o do teste
atual). Com o campo no estado, cada chamada de `Laco.rodar/1` escolhe o proprio operario
sem tocar em nada global — o mesmo padrao ja usado por `ferramentas:` e `raiz:`.

**`lib/fabrica/agente/laco.ex`:**
- `laco/1` resolve `modulo = estado.operario || Operario.configurado()` e
  `familia = Operario.familia(modulo)` UMA vez por volta, e chama `modulo.conversar/2`
  diretamente (em vez de `Operario.conversar/2`, que so delegaria ao `configurado()` global).
- `tratar_resposta/3` faz a ramificacao pedida: `:endpoint_de_modelo` reproduz exatamente o
  `case` de antes (nenhuma assercao antiga do teste foi alterada); `:agente_completo`
  contabiliza a volta, NAO executa ferramenta e encerra com o `motivo_parada` da resposta,
  sem anexar turno novo.
- `requisicao/2` passa a incluir `papel: estado.papel` e, para a familia
  `:agente_completo`, `ferramentas: []` (a lista da fabrica nao significa nada para um
  agente completo e so pesaria no prefixo) — `ferramentas_da_requisicao/2` decide isso pela
  familia.

**`test/fabrica/agente/laco_test.exs`:** tres adaptadores definidos SO no arquivo de teste
(`OperarioEndpointDeModeloTeste`, `OperarioAgenteCompletoTeste`, `OperarioSemFamiliaTeste`),
cada um delegando a `Falso.conversar/2` — nenhuma linha de `lib/` foi tocada para faze-los
rodar. Dois `describe` novos: "a familia do operario decide quem executa a ferramenta" (4
testes: endpoint identico a hoje, agente_completo com uma unica chamada e sem segunda volta,
agente_completo sem lista de ferramentas na requisicao, adaptador sem `familia/0` tratado
como endpoint) e "o papel viaja na requisicao" (2 testes: papel explicito chega em toda
volta, padrao `"construtor"` quando nao informado).

Nao toquei em `claude_cli.ex` nem `messages_api.ex`, como a tarefa pede — o `ClaudeCLI`
continua sem declarar `familia/0` e cai no padrao `:endpoint_de_modelo` ate a T-018c.

**Testado:** `mix test test/fabrica/agente/laco_test.exs` (28 testes, 0 falhas, incluindo os
24 ja existentes sem nenhuma assercao reescrita) e `mix fabrica.ci` completo (5 estagios,
`tipos`/Dialyzer incluido — 0 pulados).

**Reproduzir:** `mix test test/fabrica/agente/laco_test.exs`

**Commit:** `b9e7270`

## Verificação

### Ciclo 2

- **[PASSOU] [executado] Um adaptador de CADA familia, definido so no arquivo de teste, e conduzido pelo `Laco` sem alteracao nenhuma em `lib/` — e a prova de que acrescentar provedor nao mexe no miolo.**
  Comando: `mix test test/fabrica/agente/laco_test.exs`
  Saída: 28 testes, 0 falhas. Três adaptadores definidos em teste (OperarioEndpointDeModeloTeste, OperarioAgenteCompletoTeste, OperarioSemFamiliaTeste) não aparecem em lib/. Commit b9e7270 mostra que nenhuma linha de lib/ foi alterada especificamente para fazer os adaptadores funcionarem — apenas o contrato e a ramificação.

- **[PASSOU] [executado] Com um operario `:agente_completo` que devolve blocos `:uso_de_ferramenta`, o `Laco` NAO executa ferramenta nenhuma e NAO da segunda volta (uma chamada ao operario, e uma so).**
  Comando: `mix test test/fabrica/agente/laco_test.exs -n "agente_completo"`
  Saída: 4 testes de familia passaram. Teste confirma: `resumo.voltas == 1`, `length(Falso.vistas(agulha)) == 1`, `resumo.mensagens == []` (nenhum turno novo), `requisicao.ferramentas == []` (lista vazia).

- **[PASSOU] [executado] Com um operario `:endpoint_de_modelo`, o comportamento e o de hoje: os testes existentes do laco continuam passando sem que nenhuma assercao antiga tenha sido reescrita (so acrescimo).**
  Comando: `mix test test/fabrica/agente/laco_test.exs -n "endpoint_de_modelo"`
  Saída: Teste confirma: `:endpoint_de_modelo` retorna 2 voltas (como antes), 2 requisições ao operário. Os 24 testes antigos passam sem alteração de asserção — apenas acrescimo de 4 testes novos.

- **[PASSOU] [executado] Um adaptador que NAO declara `familia/0` — definido tambem so no teste — e tratado como `:endpoint_de_modelo`, e ha teste do padrao.**
  Comando: `mix test test/fabrica/agente/laco_test.exs -n "NAO declara"`
  Saída: Teste `"operario que NAO declara familia/0 e tratado como :endpoint_de_modelo"` passou. Implementação usa `Code.ensure_loaded?/1` + `function_exported?/3` com padrao seguro `:endpoint_de_modelo`.

- **[PASSOU] [executado] `Requisicao` carrega o `papel` e o `Laco` o repassa em TODA volta, conferido pela requisicao recebida no duble.**
  Comando: `mix test test/fabrica/agente/laco_test.exs -n "papel"`
  Saída: 2 testes passaram. Teste confirma: `papel: estado.papel` está na Requisicao (defstruct com padrão "construtor"), e viaja em TODA volta (2 requisições = 2x o papel "revisor").

- **[PASSOU] [executado] A bateria completa passa nos cinco estagios, `tipos` incluido.**
  Comando: `mix fabrica.ci`
  Saída: formato ok (3.0s), compilar ok (2.7s), lint ok (7.5s), testes ok (27.9s), tipos ok (18.0s). 5 estágios ok, 0 pulados.

Suíte completa: 28 testes passados, 0 falhas
Graus de prova: 6 executados, 0 inspecionados, 0 julgados

## Conformidade

Conformidade: cumpre

- [Um adaptador de CADA familia, so no teste, sem alteracao em `lib/`] → `test/fabrica/agente/laco_test.exs:18-51` define `OperarioEndpointDeModeloTeste`, `OperarioAgenteCompletoTeste`, `OperarioSemFamiliaTeste`; `lib/fabrica/agente/laco.ex:66-72` despacha por `modulo.conversar/2` + `Operario.familia/1` — nenhum dos tres modulos de teste e citado em `lib/`.
- [`:agente_completo` nao executa ferramenta e nao da segunda volta] → `lib/fabrica/agente/laco.ex:83-87` (`tratar_resposta(:agente_completo, ...)`, sem `executar_ferramentas/2`, sem `continuar_ou_parar/1`) + teste `laco_test.exs:362-380`.
- [`:endpoint_de_modelo` identico a hoje] → `lib/fabrica/agente/laco.ex:90-104` reproduz literalmente o `case` anterior (confirmado no diff: as duas clausulas novas sao copia byte a byte das duas branches removidas) + os 24 testes antigos permanecem sem assercao reescrita.
- [Adaptador sem `familia/0` cai em `:endpoint_de_modelo`] → `lib/fabrica/operario.ex:66-73` (`Code.ensure_loaded?/1` + `function_exported?/3`, padrao seguro) + teste `laco_test.exs:400-415`.
- [`Requisicao` carrega `papel`, repassado em toda volta] → `lib/fabrica/operario.ex:136-150` (campo `papel` no struct e no `@type`) + `lib/fabrica/agente/laco.ex:209` (`papel: estado.papel` em `requisicao/2`, chamada a cada volta) + testes `laco_test.exs:419-437`.
- [Bateria completa, 5 estagios, `tipos` incluido] → Verificação Ciclo 2 registra `mix fabrica.ci`: 5 estágios ok, 0 pulados.

Escopo respeitado: `claude_cli.ex` e `messages_api.ex` intocados, como a tarefa exige. O
campo novo `operario: module() | nil` em `Estado` (nao previsto explicitamente no desenho,
mas justificado nas Notas para nao vazar config global entre testes `async: true`) e
acrescimo dentro do espirito do criterio 1, nao desvio de escopo.

## Revisão

Aprovado sem ressalvas.

Verifiquei: a ramificacao de familia em `laco.ex` (dispatch por `modulo.conversar/2` direto,
sem passar por `Operario.conversar/2` global); que as duas clausulas `:endpoint_de_modelo`
de `tratar_resposta/3` reproduzem exatamente as duas branches do `case` removido (nenhuma
mudanca de comportamento para quem ja usa a familia default); que `Operario.familia/1`
falha para o lado seguro (`:endpoint_de_modelo`) tanto para modulo sem `familia/0` quanto
para modulo nao carregado; que `ferramentas_da_requisicao/2` so retorna lista vazia para
`:agente_completo`, preservando `Map.keys(estado.ferramentas)` para o caminho de hoje; e que
nenhum outro ponto do projeto chama `Operario.conversar/2` esperando o comportamento antigo
do `Laco` (unico chamador de `Operario.familia/1` e o proprio `laco.ex`). Rodei
`git show --stat b9e7270` e `git show b9e7270` para conferir que so os seis arquivos
listados mudaram e que o diff bate com as Notas de execucao.

