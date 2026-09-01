---
id: T-003a
titulo: A fronteira do operario declara a FAMILIA, e o laco para de executar ferramenta que nao e dele
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-018b]
areas: [lib/fabrica/operario.ex, lib/fabrica/agente/laco.ex, test/fabrica/agente/laco_test.exs]
tentativas: 0
criada: 2026-09-01
atualizada: 2026-09-01
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


## Verificacao


## Conformidade


## Revisao
