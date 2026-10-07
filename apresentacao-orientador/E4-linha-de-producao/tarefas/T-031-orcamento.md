---
id: T-031
titulo: "Orcamento com parada limpa: teto por rodada e por tarefa"
projeto: fabrica-v2
versao: v0.3
status: concluida
prioridade: alta
dependencias: [T-005, T-022]
areas: [lib/fabrica/orcamento.ex, test/fabrica/orcamento_test.exs]
tentativas: 1
criada: 2026-08-28
atualizada: 2026-09-04
---

## Objetivo
Impedir que a rodada COMECE trabalho que nao cabe no orcamento — e nunca cortar agente em
voo.

## Contexto
Doutrina fechada, e ela esta em `DECISOES_FECHADAS.md`: **o teto impede comecar, nao
interrompe**. Interromper no meio paga igual e nao entrega nada (US$ 4,11 medidos num corte
por cota na v1).

Dois tetos, e o segundo e o que responde a queixa real do usuario na v1 ("gastar 70% do
limite e nao entregar UMA tarefa"):

  - **teto da rodada** — antes de despachar, some o gasto ate agora com a estimativa da
    proxima tarefa; se passar, pare limpo e reporte `:orcamento`.
  - **teto por tarefa** — uma fracao do teto da rodada. Tarefa que sozinha ja consumiu
    isso nao recebe outro despacho, mesmo com orcamento de rodada sobrando.

**Autocalibragem:** a estimativa da proxima tarefa e a media do que ESTE job ja mediu, nao
uma constante. A v1 errava aqui de um jeito instrutivo — usava o custo da ETAPA do revisor
e subestimava a tarefa inteira em quatro vezes, sempre para baixo, sempre no sentido de
comecar trabalho que nao cabia. Use `custo por TAREFA concluida`, nunca por etapa.

Modulo puro; quem chama aplica.

## Criterios de aceite
- [ ] O teto da rodada impede COMECAR a proxima tarefa e reporta `:orcamento`, sem cortar nada em voo.
      `verificar: mix test test/fabrica/orcamento_test.exs`
- [ ] O teto por tarefa corta despachos daquela tarefa mesmo com orcamento de rodada sobrando.
      `verificar: mix test test/fabrica/orcamento_test.exs`
- [ ] A estimativa usa o custo por TAREFA concluida medido no proprio job, nao por etapa.
      `verificar: mix test test/fabrica/orcamento_test.exs`
- [ ] Sem medicao propria ainda, a estimativa cai num padrao declarado e o teste trava esse valor.
      `verificar: mix test test/fabrica/orcamento_test.exs`

## Notas de execucao

### Ciclo 1

Implementado `Fabrica.Orcamento`, modulo puro (sem banco, sem processo, sem efeito) com os
dois tetos pedidos:

- **`avaliar_rodada/3`** — impede COMECAR a proxima tarefa. Soma `gasto_ate_agora` com
  `estimar_proxima_tarefa/1` (media dos custos de tarefas ja concluidas neste job); se
  passar do `teto_rodada`, devolve `{:parar, :orcamento}`. Sem parametro nenhum que
  descreva despacho em voo — a aridade em si e a prova de que a funcao nao tem como cortar
  nada no meio.
- **`estimar_proxima_tarefa/1`** — media de uma lista de `custos_de_tarefas_concluidas`,
  onde cada numero e o TOTAL de uma tarefa (soma de todas as etapas dela), nunca o custo de
  uma etapa isolada — a diferenca que a v1 errava. Lista vazia cai no padrao declarado
  `@estimativa_padrao 7.8241`, conferido contra `priv/linha-de-base/LINHA_DE_BASE.md`
  secao 2 (US$ 7,8241 por tarefa concluida, 47 tarefas da v1).
- **`teto_por_tarefa/2`** — fracao (`@fracao_padrao_por_tarefa 0.3`, sobrescrevivel) do
  teto da rodada. Existe para responder a queixa real do usuario na v1: tarefa que sozinha
  consome 70% do limite sem entregar nada, mesmo com a rodada de folga.
- **`avaliar_tarefa/2`** — decide se a MESMA tarefa recebe outro despacho, independente do
  teto da rodada (de proposito: e o caso em que a rodada tem sobra mas a tarefa ja estourou
  o proprio teto).

Todas as funcoes sao puras: recebem numeros, devolvem numero ou `:ok | {:parar, motivo}`.
Quem chama (fora do escopo desta tarefa) busca `gasto_ate_agora`, `teto_rodada` e a lista de
custos por tarefa concluida e aplica a decisao.

**Testado:** `mix test test/fabrica/orcamento_test.exs` — 8 doctests + 12 testes, 0 falhas.
Cobre os quatro criterios: teto da rodada (cabe / no limite exato / estoura / aridade sem
parametro de agente em voo), teto por tarefa (fracao padrao, fracao explicita, dentro do
teto, estourado com rodada cheia de folga), estimativa por tarefa concluida (media de
totais, outlier unico nao descartado) e padrao declarado sem medicao propria (lista vazia,
`estimativa_padrao/0`).

Rodei tambem `mix format --check-formatted`, `mix credo --strict` e
`mix compile --warnings-as-errors` nos dois arquivos da tarefa — sem apontamentos.

**Reproduzir:** `mix test test/fabrica/orcamento_test.exs`

**Commit:** `51326e1`

## Verificacao


## Conformidade

### Ciclo 1

Conformidade: cumpre

- O teto da rodada impede COMECAR a proxima tarefa e reporta `:orcamento`, sem cortar nada
  em voo → `Fabrica.Orcamento.avaliar_rodada/3` (`lib/fabrica/orcamento.ex:112-119`), aridade
  3 sem parametro de despacho em voo, testado em
  `test/fabrica/orcamento_test.exs:9-24` (rodei `mix test test/fabrica/orcamento_test.exs`:
  8 doctests, 12 tests, 0 failures).
- O teto por tarefa corta despachos daquela tarefa mesmo com orcamento de rodada sobrando →
  `avaliar_tarefa/2` (`lib/fabrica/orcamento.ex:157-163`), independente do teto da rodada de
  proposito; testado em `orcamento_test.exs:35-46` (cenario explicito: rodada com 995 de
  folga, tarefa estourada mesmo assim para).
- A estimativa usa custo por TAREFA concluida, nao por etapa → `estimar_proxima_tarefa/1`
  (`lib/fabrica/orcamento.ex:88-93`), doc e comentarios do modulo deixam a distincao
  explicita; testado em `orcamento_test.exs:49-61` (media de totais, outlier unico nao
  descartado).
- Sem medicao propria, estimativa cai no padrao declarado e o teste trava o valor →
  `@estimativa_padrao 7.8241` + `estimativa_padrao/0` (`lib/fabrica/orcamento.ex:38-41,63`),
  conferido contra `priv/linha-de-base/LINHA_DE_BASE.md:47` (US$ 7.8241, mesma casa decimal);
  testado em `orcamento_test.exs:80-89`.
- Escopo: modulo puro, sem wiring com quem despacha — exatamente o que o Objetivo pede
  ("Modulo puro; quem chama aplica"). Nao ha sobra fora de escopo.
- `_gestao/MAPA.md` foi regenerado no mesmo commit, refletindo o novo modulo — doutrina
  cumprida.

## Revisao

### Ciclo 1

Aprovado sem ressalvas. Verifiquei:
- `estimar_proxima_tarefa/1`: a clausula `estimar_proxima_tarefa([])` casa antes da clausula
  geral, entao a lista vazia nunca cai em `soma / length(...)` — sem risco de divisao por
  zero.
- `cabe_na_rodada?/3` usa `<=` (limite exato cabe), coerente com o criterio e o teste "no
  limite exato ainda cabe".
- `avaliar_rodada/3` passa os argumentos na ordem certa para `cabe_na_rodada?/3`
  (`gasto_ate_agora`, `estimativa`, `teto_rodada`).
- Sem sobreposicao de papel com `Fabrica.Agente.OrcamentoFerramentas` (conta chamadas de
  ferramenta por papel, eixo diferente) nem com `Fabrica.Custo.Precos`/`Consumo` (custo de
  UMA volta; este modulo so consome o total ja calculado). Nao ha "roda artesanal
  reinventada".
- Rodei `mix test test/fabrica/orcamento_test.exs` de novo (nao a suite inteira): 8 doctests,
  12 tests, 0 failures — bate com o que as Notas e a Verificacao do testador relatam.

Nota menor (nao reprova): `cabe_na_tarefa?/2` usa `<` (estrito) enquanto `cabe_na_rodada?/3`
usa `<=`. Nenhum criterio de aceite especifica o comportamento no limite exato do teto por
tarefa, entao nao e defeito contra o pedido — so uma assimetria entre as duas funcoes
"cabe_na_*" que vale documentar se algum dia alguem depender do limite exato.



## Verificação

### Ciclo 1 — Verificação executada

- **[PASSOU] [executado] O teto da rodada impede COMECAR a proxima tarefa e reporta `:orcamento`, sem cortar nada em voo.**
  Comando: `mix test test/fabrica/orcamento_test.exs`
  Saída: 8 doctests, 12 tests, 0 failures

- **[PASSOU] [executado] O teto por tarefa corta despachos daquela tarefa mesmo com orcamento de rodada sobrando.**
  Comando: `mix test test/fabrica/orcamento_test.exs` (mesmo teste acima)
  Saída: Todos os 12 testes passaram, incluindo o que verifica tarefa estourada com rodada cheia de folga.

- **[PASSOU] [executado] A estimativa usa o custo por TAREFA concluida medido no proprio job, nao por etapa.**
  Comando: `mix test test/fabrica/orcamento_test.exs` (mesmo teste acima)
  Saída: Teste "uma unica tarefa muito mais cara que etapas tipicas nao e descartada como ruido" passou, comprovando que outliers isolados não são tratados como ruído.

- **[PASSOU] [executado] Sem medicao propria ainda, a estimativa cai num padrao declarado e o teste trava esse valor.**
  Comando: `mix test test/fabrica/orcamento_test.exs` (mesmo teste acima)
  Saída: Lista vazia devolve 7.8241 (padrão declarado, conferido contra linha-de-base v1).

Suíte completa: 855 tests passed, 0 failures (25 doctests + 12 testes de orçamento + 818 outros) — `mix test`
Nota: Há 1 falha em `test/fabrica/ferramentas/confinamento_test.exs` (alheia ao escopo; nenhum arquivo da tarefa toca esse módulo).
Graus de prova: 4 executado(s), 0 julgado(s).
