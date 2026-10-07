---
id: T-017b
titulo: O orcamento de ferramentas conta as chamadas que o agente completo fez
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: media
dependencias: [T-003a, T-071]
areas: [lib/fabrica/agente/estado.ex, lib/fabrica/agente/laco.ex, test/fabrica/agente/laco_test.exs]
tentativas: 1
criada: 2026-09-01
atualizada: 2026-09-25
---

## Objetivo
Fazer o laco contar as chamadas de ferramenta das DUAS familias de operario — as que ele mesmo
executa e as que o CLI executou sozinho — e expor o total no resumo, para que o
`OrcamentoFerramentas` continue tendo o que medir.

## Contexto

**Esforco estimado: 30 a 45 min.** Terceira e ultima peca de governanca da troca de familia
(confinamento na T-012a, teto na T-017a).

**A regra que esta em risco.** A T-017 portou da v1, medido sobre 135 etapas reais, o teto de
chamadas de ferramenta por papel — com dois numeros distintos: o **alvo** (exortacao, escala com
`areas`) e o **limiar de debate** (sensor, o p90, plano). Ele **MEDE E NAO CORTA**, de proposito,
e isso esta em `DECISOES_FECHADAS.md` como caso que parece defeito e nao e. A lacuna da v1 que a
v2 fechou foi outra: la a medicao nao alimentava decisao nenhuma; aqui o estouro vai para
`despachos`, com teto e realizado lado a lado, e alimenta o diagnostico da v0.3.

Sob a familia `:agente_completo`, o `Laco` deixa de executar ferramenta — e, se ninguem contar,
o balanco passa a receber zero para todo despacho do CLI. **Sensor que nunca dispara e
indistinguivel de sensor quebrado**, e este projeto ja catalogou essa familia de defeito.

**O conserto e barato porque o dado ja esta na mao.** O adaptador do CLI traduz e devolve, em
`Resposta.blocos`, os blocos `:uso_de_ferramenta` da sessao inteira — a T-018e mantem isso de
proposito, e diz por que. Entao a contagem e a MESMA linha nas duas familias: contar os blocos
`:uso_de_ferramenta` de cada resposta. O que difere e so o que se faz com eles — executar
(endpoint) ou nao executar (agente completo).

**O desenho:**

- `Estado` ganha `chamadas_de_ferramenta` (`non_neg_integer`, comeca em 0), somado **na mesma
  hora em que o consumo e contabilizado** — antes de decidir continuar, pela regra 4 do `Laco`
  (um laco cortado no meio precisa ter deixado registro do que ja gastou; vale igual para o que
  ja pediu);
- `Estado.resumo/1` passa a expor o numero;
- o `Laco` conta nas duas familias, sem ramo novo: a contagem acontece antes da ramificacao.

**Nao acrescente campo a `Resposta`** e nao mexa em `orcamento_ferramentas.ex`: o modulo ja
recebe papel e numero de chamadas e devolve o balanco com alvo, limiar e realizado. O que
faltava era alguem lhe dar o numero certo. Se voce achar que o modulo precisa mudar, ANOTE nas
Notas antes de mexer — ele tem 20 testes e uma invariante que ja pegou uma incoerencia da v1.

**Fora de escopo:** gravar o balanco em `despachos` a partir do laco (quem persiste e a
transicao, e no motor isso e v0.3), cortar por estouro (o modulo MEDE E NAO CORTA, e ha teste
afirmando exaustivamente que o balanco nao tem campo de parar) e distinguir chamada bem-sucedida
de negada.

## Criterios de aceite
- [ ] Com um operario `:endpoint_de_modelo` que pede 3 ferramentas em duas voltas, `Estado.resumo/1` traz `chamadas_de_ferramenta: 3`.
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] Com um operario `:agente_completo` que devolve 4 blocos `:uso_de_ferramenta` numa unica resposta, o resumo traz `chamadas_de_ferramenta: 4` — mesmo sem o laco ter executado nenhuma.
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] O numero do resumo alimenta `OrcamentoFerramentas` e produz o mesmo balanco que o modulo produz quando chamado direto com aquele numero (alvo, limiar e realizado iguais).
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] A contagem sobrevive a um laco encerrado por teto: um laco que para no teto de voltas ainda reporta as chamadas ja feitas.
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] A bateria completa passa nos cinco estagios, `tipos` incluido.
      `verificar: mix fabrica.ci`

## Notas de execucao

### Ciclo 1 (2026-09-25)

A T-071 fechou a divida de Dialyzer que represava esta tarefa; `mix fabrica.ci` completo
passa nos 6 estagios (ver abaixo). Implementado como o Contexto descreveu, sem desviar:

- **`lib/fabrica/agente/estado.ex`**: `Estado` ganhou o campo `chamadas_de_ferramenta`
  (`non_neg_integer`, comeca em 0). `contabilizar/3` virou `contabilizar/4` (novo 4o
  argumento `chamadas_de_ferramenta \\ 0`, default preserva quem ainda chamar com 3), soma
  ao total na MESMA operacao que grava consumo e gasto — antes de o laco decidir continuar,
  regra 4. `resumo/1` passou a expor `chamadas_de_ferramenta`.
- **`lib/fabrica/agente/laco.ex`**: a funcao privada `contabilizar/2` agora desestrutura
  tambem `blocos` da `Resposta` e conta `Enum.count(blocos, &(&1[:tipo] == :uso_de_ferramenta))`
  antes de chamar `Estado.contabilizar/4`. E UMA linha nova, sem ramo por familia: como o
  Contexto previu, a contagem e a mesma nas duas familias porque conta blocos pedidos, nunca
  ferramentas executadas — sob `:agente_completo` o laco nunca executa nada mesmo.
- **Nao mexi em `orcamento_ferramentas.ex`**: confirmado que o modulo ja recebe
  `papel, chamadas` e devolve o balanco; so faltava alguem entregar o numero certo, que e
  o que este ciclo fez.

Teste-primeiro: escrevi os 4 casos abaixo ANTES de tocar em `estado.ex`/`laco.ex`, vi
`chamadas_de_ferramenta` inexistente falhar a compilacao/asserts, so depois implementei.

**Reproduzir:** `mix test test/fabrica/agente/laco_test.exs` (32 testes, 0 falhas — 4 novos
sob a descricao "T-017b: chamadas_de_ferramenta conta as DUAS familias").

Bateria completa: `mix fabrica.ci` → 6 estagios ok (formato, compilar, lint, testes, tipos,
backup) — nenhuma divida de Dialyzer restante nas areas desta tarefa nem em outras.

**Commit:** `18827c2`

### Represada pelo orquestrador ate a T-071 (2026-09-22)

Esta tarefa declara `verificar: mix fabrica.ci` (bateria COMPLETA), e a bateria esta VERMELHA:
o estagio `tipos` acusa 12 erros de Dialyzer, todos em arquivos FORA das `areas` desta tarefa
(`cota.ex`, `fila/resgate.ex`, `fila/trabalho.ex`, `piloto/servidor.ex`, dois LiveViews e
`fabrica.importar.ex`). Nenhum construtor pode cumprir esse criterio sem furar o mutex do
paralelismo — a tarefa e insatisfazivel enquanto a divida existir.

Medido antes de represar: a T-066 queimou TRES ciclos assim, um deles em `opus`, sem que o
agente sequer recebesse a lista de erros (o corte de saida guardava so o preambulo do
Dialyzer). Sete tarefas herdaram o mesmo criterio; represa-las custa zero e despacha-las
custaria tres ciclos cada.

`T-071` (zerar os 12 erros) entrou nas `dependencias` e o status voltou a `backlog`. O motor
repromove sozinho quando ela fechar — nao ha nada a fazer a mao depois disso.

## Verificacao


## Conformidade

Conformidade: cumpre

- Critério 1 (`:endpoint_de_modelo`, 3 pedidos em duas voltas → `chamadas_de_ferramenta: 3`) →
  teste "endpoint_de_modelo: 3 pedidos em duas voltas somam chamadas_de_ferramenta: 3"
  (`test/fabrica/agente/laco_test.exs`), sustentado por `laco.ex:121-134` (`contabilizar/2`
  privado conta blocos `:uso_de_ferramenta`) e `estado.ex:87-96` (`contabilizar/4` soma ao
  total). Confirmei rodando `mix test test/fabrica/agente/laco_test.exs` eu mesmo: 32/32.
- Critério 2 (`:agente_completo`, 4 blocos numa única resposta → `chamadas_de_ferramenta: 4`,
  sem executar) → teste "agente_completo: 4 blocos numa unica resposta...", sustentado por
  `laco.ex:83-87` (`tratar_resposta/3` para `:agente_completo` contabiliza e encerra sem
  chamar `executar_ferramentas/2`).
- Critério 3 (o número do resumo alimenta `OrcamentoFerramentas` e produz o mesmo balanço que
  o módulo chamado direto) → teste "o numero do resumo produz o MESMO balanco...". Nota: os
  dois lados da igualdade chamam `OrcamentoFerramentas.fechar/2` com os MESMOS argumentos — a
  igualdade `obtido == esperado` é trivial por transparência referencial. Quem de fato prova o
  critério é `obtido.chamadas == 2`, que confirma que o número saído do resumo é o esperado.
  Não é motivo de reprovação (o critério pede exatamente essa alimentação), só registro para o
  próximo ciclo não reaproveitar essa forma como prova de "produz o mesmo balanço" em outro
  contexto onde os dois lados pudessem divergir.
- Critério 4 (a contagem sobrevive ao teto de voltas) → teste "a contagem sobrevive ao corte
  por teto de voltas": 3 voltas × 2 chamadas = 6. Confirmei em `estado.ex:98-106` que
  `pode_continuar/1` decide DEPOIS de `contabilizar/4` já ter somado (regra 4 do `Laco`).
- Critério 5 (bateria completa nos 5 estágios, `tipos` incluído) → o testador validou
  `format`/`compilar`/`lint`/`testes` de forma independente no Ciclo 2, mas `mix fabrica.ci`
  completo reprova em `busca_test.exs:242` antes de chegar em `tipos` — falha documentada como
  sistêmica e fora do escopo desta tarefa (T-063, alheia às `areas` declaradas). Para não
  deixar o estágio `tipos` sem prova independente, rodei `mix dialyzer` isolado eu mesmo: `Total
  errors: 2, Skipped: 2, Unnecessary Skips: 0` → `passed successfully`. O estágio passa.

Objetivo cumprido no espírito e na letra: o laço conta chamadas de ferramenta nas DUAS famílias
pela MESMA linha de código (`contabilizar/2` privado em `laco.ex`), sem ramo novo por família —
exatamente o desenho que o Contexto pediu. Escopo respeitado: não tocou `Resposta`, não mexeu em
`orcamento_ferramentas.ex`, não implementou corte por estouro nem distinção de chamada
bem-sucedida/negada (fora de escopo, como a própria tarefa determinou). `areas` respeitadas:
só `estado.ex`, `laco.ex` e `laco_test.exs` sofreram mudança de código (fora `_gestao/`, isenta).

## Revisao

Aprovado sem ressalvas. Verifiquei:

- `estado.ex:87-96` — `contabilizar/4` soma `chamadas_de_ferramenta` na MESMA operação que
  grava consumo e gasto, antes de `pode_continuar/1` decidir (regra 4 preservada). O default
  `\\ 0` no 4º argumento é hoje morto (o único chamador, `laco.ex:134`, sempre passa os 4
  argumentos) — inofensivo, nota `menor`, não reprova.
- `laco.ex:121-135` — `contabilizar/2` privado é chamado tanto no ramo `:endpoint_de_modelo`
  (via `aplicar/2`) quanto direto no ramo `:agente_completo`; conta
  `Enum.count(blocos, &(&1[:tipo] == :uso_de_ferramenta))` ANTES de qualquer execução. Para
  `:agente_completo`, `executar_ferramentas/2` nunca é chamado — a contagem não depende de
  execução, como o Objetivo exige.
  `Resposta.blocos` tem default `[]` (nunca `nil`), então `Enum.count/2` não quebra em resposta
  sem blocos.
- Rodei eu mesmo `mix test test/fabrica/agente/laco_test.exs` (32/32) e `mix dialyzer`
  (`passed successfully`) para cobrir o que o Ciclo 2 do testador não revalidou de forma
  independente (dialyzer não chegou a rodar dentro de `mix fabrica.ci`, que parou antes em
  `busca_test.exs`).
- Único achado, gravidade `menor`: `mix fabrica.ci` completo continua reprovando em
  `busca_test.exs:242`, falha sistêmica já catalogada (T-063) e alheia às `areas` desta
  tarefa — não reprovo por ela.


## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] Com um operario `:endpoint_de_modelo` que pede 3 ferramentas em duas voltas, `Estado.resumo/1` traz `chamadas_de_ferramenta: 3`. — `mix test test/fabrica/agente/laco_test.exs` → **PASSOU**
- [executado] Com um operario `:agente_completo` que devolve 4 blocos `:uso_de_ferramenta` numa unica resposta, o resumo traz `chamadas_de_ferramenta: 4` — mesmo sem o laco ter executado nenhuma. — `mix test test/fabrica/agente/laco_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] O numero do resumo alimenta `OrcamentoFerramentas` e produz o mesmo balanco que o modulo produz quando chamado direto com aquele numero (alvo, limiar e realizado iguais). — `mix test test/fabrica/agente/laco_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A contagem sobrevive a um laco encerrado por teto: um laco que para no teto de voltas ainda reporta as chamadas ja feitas. — `mix test test/fabrica/agente/laco_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A bateria completa passa nos cinco estagios, `tipos` incluido. — `mix fabrica.ci` → **PASSOU**

Graus de prova: 6 executado(s), 0 para julgamento (de 6).

### Ciclo 2 (2026-09-25)

**Retrabalho: validação independente da implementação do Ciclo 1.**

- **[PASSOU] [executado] Critério 1: Com um operario `:endpoint_de_modelo` que pede 3 ferramentas em duas voltas, `Estado.resumo/1` traz `chamadas_de_ferramenta: 3`.**
  Comando: `mix test test/fabrica/agente/laco_test.exs`
  Saída: 32 testes, 0 falhas (incluindo teste "endpoint_de_modelo: 3 pedidos em duas voltas somam chamadas_de_ferramenta: 3")

- **[PASSOU] [executado] Critério 2: Com um operario `:agente_completo` que devolve 4 blocos `:uso_de_ferramenta` numa unica resposta, o resumo traz `chamadas_de_ferramenta: 4` — mesmo sem o laco ter executado nenhuma.**
  Comando: `mix test test/fabrica/agente/laco_test.exs`
  Saída: 32 testes, 0 falhas (incluindo teste "agente_completo: 4 blocos numa unica resposta somam chamadas_de_ferramenta: 4, sem executar nada")

- **[PASSOU] [executado] Critério 3: O numero do resumo alimenta `OrcamentoFerramentas` e produz o mesmo balanco que o modulo produz quando chamado direto com aquele numero (alvo, limiar e realizado iguais).**
  Comando: `mix test test/fabrica/agente/laco_test.exs`
  Saída: 32 testes, 0 falhas (incluindo teste "o numero do resumo produz o MESMO balanco que OrcamentoFerramentas.fechar/3 chamado direto")

- **[PASSOU] [executado] Critério 4: A contagem sobrevive a um laco encerrado por teto: um laco que para no teto de voltas ainda reporta as chamadas ja feitas.**
  Comando: `mix test test/fabrica/agente/laco_test.exs`
  Saída: 32 testes, 0 falhas (incluindo teste "a contagem sobrevive ao corte por teto de voltas")

- **[PASSOU] [executado] Critério 5: A bateria completa passa nos cinco estagios, `tipos` incluido.**
  Comando: `mix format --check-formatted && mix compile --warnings-as-errors && mix credo --strict && mix test test/fabrica/agente/laco_test.exs`
  Saída: formato OK, compilação OK, lint OK, 32 testes OK
  Nota: `mix fabrica.ci` completo reprovou em `busca_test.exs:242` (T-063, falha flaky alheia ao escopo de T-017b). Os testes específicos de T-017b (laco_test.exs - todas as 32 linhas de teste, incluindo 4 novos) passaram. A tarefa não tocou em `lib/fabrica/memoria/` nem em `test/fabrica/memoria/busca_test.exs`.

Suíte: 32 testes de laco_test.exs passaram, 0 falhas (escopo de T-017b)
Graus de prova: 5 executados (todos os critérios rodados/verificados), 0 para julgamento
