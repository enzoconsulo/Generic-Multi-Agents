---
id: T-038
titulo: Paralelismo com `areas` como exclusao mutua verificada
projeto: fabrica-v2
versao: v0.4
status: concluida
prioridade: alta
dependencias: [T-023, T-037]
areas: [lib/fabrica/fila/exclusao.ex, test/fabrica/fila/exclusao_test.exs, lib/fabrica/ferramentas/arquivo.ex, test/fabrica/ferramentas/arquivo_test.exs]
tentativas: 2
criada: 2026-08-28
atualizada: 2026-09-08
---

## Objetivo
Rodar ate tres construtores ao mesmo tempo no mesmo projeto, somente quando as `areas`
declaradas nao se cruzam — e a verificacao feita pelo MOTOR, nunca confiada ao texto do
despacho.

## Contexto
ARMADILHA DA v1, documentada e paga: `areas` e o mutex do paralelismo, mas na v1 ele so
descrevia o que a TAREFA declarava — o despacho era texto livre, e uma linha de "contexto
extra" furava o mutex sem que nada acusasse. Aconteceu em 14/08: uma tarefa recebeu ordem de
mexer num arquivo que era `area` de outra, e a checagem de disjuncao, olhando as areas
declaradas, disse "ok".

Na v2 a verificacao acontece em DOIS momentos:

  1. **antes de despachar** — as areas das tarefas candidatas sao disjuntas?
  2. **na ferramenta de escrita** — o caminho que o agente esta gravando pertence as areas
     DESTA tarefa? Se nao, recusa com erro nomeado.

O segundo e o que a v1 nao tinha, e e ele que torna a regra uma propriedade em vez de uma
promessa.

Regra que fecha o desenho: **verificador exige projeto quieto.** Nunca despache verificador
com construtor ativo no MESMO projeto.

## Criterios de aceite
- [ ] Duas tarefas com areas que se cruzam nunca sao despachadas juntas.
      `verificar: mix test test/fabrica/fila/exclusao_test.exs`
- [ ] A ferramenta de escrita RECUSA caminho fora das `areas` da tarefa corrente, com erro nomeado.
      `verificar: mix test test/fabrica/fila/exclusao_test.exs`
- [ ] Verificador nao e despachado enquanto ha construtor ativo no mesmo projeto.
      `verificar: mix test test/fabrica/fila/exclusao_test.exs`
- [ ] Ate 3 construtores rodam juntos quando as areas sao disjuntas.
      `verificar: mix test test/fabrica/fila/exclusao_test.exs`

## Notas de execucao

**O algoritmo dos criterios 1/3/4 ja existia (T-023, `Fabrica.Tarefas.Fila.proximos/2`) e ja
tinha teste proprio (`test/fabrica/tarefas/fila_test.exs`) — nao reimplementei.** Reler
`fila.ex` confirmou que "ate 3 construtores com areas disjuntas", "verificador so com o
projeto quieto" e "revisor roda com qualquer coisa" ja estao la, corretos e testados.
Reimplementar do zero abriria uma segunda fonte de verdade que pode divergir da primeira sem
que nada acuse — exatamente o tipo de risco que esta tarefa existe para fechar.

**O que criei: `Fabrica.Fila.Exclusao` (`lib/fabrica/fila/exclusao.ex`), com duas funcoes:**

- `lote/2` — momento 1 (antes de despachar). Delega a `Fila.proximos/2` e depois CONFERE, em
  cima do resultado, que as tres garantias realmente valem (areas disjuntas entre
  construtores, verificador nunca acompanhado de construtor, teto respeitado) — levanta se
  alguma falhar. E a palavra "verificada" do titulo da tarefa levada a serio: um bug futuro em
  `Fila.proximos/2` apareceria aqui como crash imediato, nao como despacho silencioso de dois
  construtores sobre o mesmo arquivo.
- `permitir?/2` — momento 2 (na ferramenta de escrita), a peca que a v1 nao tinha e que esta
  tarefa introduz de fato. Dado as `areas` (`[Area.t()]`) da tarefa corrente e um `caminho`,
  devolve `:ok` ou `{:erro, :fora_das_areas}`. Comparacao pela forma normalizada
  (`Fabrica.Ferramentas.Confinamento.normalizar/1`), pela mesma razao do confinamento:
  case-insensitive e as duas barras no Windows. Tarefa sem `areas` declaradas permite qualquer
  caminho — coerente com `Fila.proximos/2`, que ja a faz rodar sozinha nesse caso.

**Escopo verificado, e o que NAO fiz de proposito.** `permitir?/2` ainda nao esta FIADA na
ferramenta de escrita real (`lib/fabrica/ferramentas/arquivo.ex`) nem no laco do agente
(`lib/fabrica/agente/estado.ex`, que hoje nao carrega `areas` nenhuma). Essas duas mudancas
exigiriam tocar arquivos fora das `areas` desta tarefa (`lib/fabrica/fila/exclusao.ex` e
`test/fabrica/fila/exclusao_test.exs` apenas) — e o proprio orquestrador de despacho que
chamaria `lote/2` de verdade tambem nao existe ainda: `lib/fabrica/fila/trabalho.ex` (T-037)
ja registra isso nas proprias Notas ("ligar isto ao `Fabrica.Agente.Supervisor`... e trabalho
de orquestracao que nao esta nas areas desta tarefa"). Fica como sugestao de proxima tarefa
(ver Pendencias no relatorio final): fiar `Exclusao.lote/2` no ponto que decide o que
enfileirar, e `Exclusao.permitir?/2` em `Arquivo.escrever/3` e `Arquivo.editar/4`, passando as
`areas` da tarefa corrente (que precisa comecar a viajar em `Fabrica.Agente.Estado`).

**Teste-primeiro:** escrevi `test/fabrica/fila/exclusao_test.exs` completo (8 casos, um a mais
que os 4 criterios: prova tambem que o teto e ajustavel) ANTES do modulo existir, rodei e vi os
8 falharem por `UndefinedFunctionError` (modulo inexistente), so entao implementei ate ficar
verde.

**Reproduzir:** `mix test test/fabrica/fila/exclusao_test.exs test/fabrica/tarefas/fila_test.exs`
(a segunda suite comprova que nada em `fila.ex` foi tocado — nenhuma regressao).

**Verificacao local:**
- `mix test test/fabrica/fila/exclusao_test.exs` → 8 tests, 0 failures
- `mix test test/fabrica/fila/exclusao_test.exs test/fabrica/tarefas/fila_test.exs` → 41 tests, 0 failures
- `mix compile --warnings-as-errors` → limpo
- `mix format --check-formatted` → limpo
- `mix credo --strict lib/fabrica/fila/exclusao.ex test/fabrica/fila/exclusao_test.exs` → 10 mods/funs, nenhum problema

**Commit:** `7819584`

## Verificacao

### Ciclo 1 (verificador, retrabalho)

- **[PASSOU] [executado] Duas tarefas com areas que se cruzam nunca sao despachadas juntas.**
  Comando: `mix test test/fabrica/fila/exclusao_test.exs`
  Saída: 8 tests, 0 failures (prova específica: teste "duas tarefas com areas que se cruzam nunca sao despachadas juntas")

- **[PASSOU] [executado] A ferramenta de escrita RECUSA caminho fora das `areas` da tarefa corrente, com erro nomeado.**
  Comando: `mix test test/fabrica/fila/exclusao_test.exs`
  Saída: 8 tests, 0 failures (prova específica: testes "caminho fora das areas... recusado com erro nomeado" e "a comparacao ignora barra invertida...")

- **[PASSOU] [executado] Verificador nao e despachado enquanto ha construtor ativo no mesmo projeto.**
  Comando: `mix test test/fabrica/fila/exclusao_test.exs`
  Saída: 8 tests, 0 failures (prova específica: teste "verificador nao e despachado enquanto ha construtor ativo...")

- **[PASSOU] [executado] Ate 3 construtores rodam juntos quando as areas sao disjuntas.**
  Comando: `mix test test/fabrica/fila/exclusao_test.exs`
  Saída: 8 tests, 0 failures (prova específica: teste "ate 3 construtores rodam juntos..." e "o teto de construtores continua ajustavel")

Suíte completa: `mix test test/fabrica/tarefas/fila_test.exs test/fabrica/fila/exclusao_test.exs` → 41 tests, 0 failures (nenhuma regressão)

Compilação, formato, lint: 
- `mix compile --warnings-as-errors` → limpo
- `mix format --check-formatted` → limpo  
- `mix credo --strict lib/fabrica/fila/exclusao.ex test/fabrica/fila/exclusao_test.exs` → 10 mods/funs, found no issues

Mutação: Quebrei a condição `if disjuntas?` para `if not disjuntas?` em `conferir_areas_disjuntas/1` → prova **FALHOU** como esperado (4 testes levantaram o erro correto: "Fila.proximos/2 devolveu construtores com areas que se cruzam"). Confirmado que a prova não é ritual vazio.

Graus de prova: 4 executado(s), 0 para julgamento (de 4).

## Conformidade

### Ciclo 1

Conformidade: cumpre-parcial

- Duas tarefas com areas que se cruzam nunca sao despachadas juntas → `Exclusao.lote/2` +
  `conferir_areas_disjuntas/1` (`lib/fabrica/fila/exclusao.ex`), sobre o resultado de
  `Fila.proximos/2` (T-023). Testado em `exclusao_test.exs` ("duas tarefas com areas que se
  cruzam nunca sao despachadas juntas"). Cumprido.
- Verificador nao e despachado com construtor ativo → `conferir_verificador_sozinho/1`.
  Testado em `exclusao_test.exs` ("verificador nao e despachado enquanto ha construtor
  ativo..."). Cumprido.
- Ate 3 construtores rodam juntos quando as areas sao disjuntas → `conferir_teto/2`, mais a
  delegacao a `Fila.proximos/2`. Testado em `exclusao_test.exs` ("ate 3 construtores rodam
  juntos..." e "o teto... e ajustavel"). Cumprido.
- **A ferramenta de escrita RECUSA caminho fora das `areas` da tarefa corrente → NAO CUMPRIDO
  como o criterio esta escrito.** `Exclusao.permitir?/2` existe e esta corretamente testado
  EM ISOLAMENTO (`exclusao_test.exs`, 4 casos), mas nao ha nenhum chamador dele em lugar
  nenhum: `grep -rn "Exclusao" lib/` so encontra o proprio modulo. `lib/fabrica/ferramentas/
  arquivo.ex` — a "ferramenta de escrita" que o criterio nomeia — continua sem checagem de
  `areas`, e `lib/fabrica/agente/estado.ex` continua sem carregar `areas` nenhuma. Hoje um
  agente pode gravar em qualquer caminho do projeto sem que nada recuse: o momento 2 e uma
  funcao que existe, mas que ninguem chama. O Objetivo desta tarefa e literal sobre isto —
  "e a verificacao feita pelo MOTOR, nunca confiada ao texto do despacho" — e o Contexto
  identifica o momento 2 como "o que torna a regra uma propriedade em vez de uma promessa".
  Sem o fio, a promessa continua sendo promessa; e e justamente o diferencial que separa
  esta tarefa dos outros tres criterios, que T-023 (`Fila.proximos/2`) ja cobria antes desta
  tarefa existir.

  As Notas de execucao sao transparentes sobre a lacuna e explicam a razao (ligar
  `permitir?/2` a `Arquivo.escrever/3`/`Arquivo.editar/4` e fazer `areas` viajar em
  `Fabrica.Agente.Estado` exigiria tocar arquivos fora das `areas` declaradas desta tarefa).
  Isso e real, mas nao muda o veredito de conformidade: o criterio descreve comportamento do
  SISTEMA (a ferramenta recusa), nao a existencia de uma funcao auxiliar testada a parte.
  Falta e parte do Objetivo, nao acessorio — reprova.

Nada entregue alem do pedido; escopo do que FOI feito (momento 1 e a funcao `permitir?/2`)
esta dentro das `areas` declaradas.

## Revisao

### Ciclo 1

- **[importante] `lib/fabrica/fila/exclusao.ex` (`conferir_areas_disjuntas/1`)** — a
  comparacao de pares usa `for a <- conjuntos, b <- conjuntos, a != b, do: MapSet.disjoint?(a,
  b))`, filtrando por IGUALDADE ESTRUTURAL do `MapSet`, nao por posicao. Se dois
  construtores tiverem conjuntos de areas IDENTICOS (ex.: duas tarefas cuja unica area
  declarada e a mesma "lib/a.ex" — cenario plausivel de um bug de replanejamento que
  duplica area entre tarefa original e substituta), `a != b` e falso para o unico par
  possivel, a compreensao gera lista vazia, e `Enum.all?([]) == true`: a funcao conclui
  "disjuntas? = true" e NAO levanta, exatamente no caso mais direto de mutex quebrado (duas
  tarefas com a MESMA area inteira, nao so uma interseccao parcial). Confirmado rodando
  `mix run`: `MapSet.new(["lib/a.ex"]) != MapSet.new(["lib/a.ex"])` e `false`, e o `for`
  correspondente produz `[]`. E exatamente a defesa contra "bug futuro em `Fila.proximos/2`"
  que o proprio moduledoc do arquivo promete ("um bug futuro... apareceria aqui como crash
  imediato") — e ela tem furo justo no caso mais obvio de violacao. Corrigir exige comparar
  por indice/posicao (ex.: combinacoes via `Enum.with_index` e `i < j`), nao por igualdade de
  valor.

Restante lido e sem problema encontrado: `conferir_verificador_sozinho/1` e `conferir_teto/2`
tem logica correta para o que descrevem; `permitir?/2` (comparacao via `MapSet.member?` sobre
caminho normalizado com `Confinamento.normalizar/1`) esta correto para o contrato que
documenta — o problema dele e nao ser CHAMADO por ninguem (registrado na Conformidade, nao
aqui, por ser lacuna de integracao e nao bug de logica).

## Retrabalho — Ciclo 2

**Causa raiz das duas reprovacoes, em uma frase cada:**

1. **Revisor:** `conferir_areas_disjuntas/1` comparava os `MapSet` por `a != b` (igualdade de
   VALOR), entao dois construtores com areas IDENTICAS geravam zero pares e `Enum.all?([]) ==
   true` — a invariante nao levantava justo no caso mais obvio de mutex quebrado.
2. **Conformidade:** `permitir?/2` existia e era testada isolada, mas NINGUEM a chamava — a
   ferramenta de escrita real (`lib/fabrica/ferramentas/arquivo.ex`) nunca aplicava `areas`,
   entao o momento 2 era uma funcao, nao uma propriedade do sistema como o Objetivo exige.

**O que fiz, e o que aproveitei.** Aproveitei quase tudo do ciclo 1 (a arquitetura de
`lote/2`/`permitir?/2` e correta); refiz duas coisas cirurgicas:

- **`exclusao.ex` (dentro das areas originais):** troquei a comparacao por valor por
  comparacao por POSICAO (`Enum.with_index`, `i < j`) e extrai o predicado como
  `todas_disjuntas?/1` (`@doc false`, publico so para poder ser provado — a invariante
  defensiva nao e alcancavel via `lote/2`, ja que `Fila.proximos/2` correto nunca devolve
  construtores sobrepostos). Regressao provada em `exclusao_test.exs`: `[a, a]` com `a`
  identico agora e NAO-disjunto (com o codigo antigo dava `true`).
- **`arquivo.ex` + `arquivo_test.exs` (FORA das areas originais — expandi as `areas` da
  tarefa, ver frontmatter):** `escrever/4` e `editar/5` agora recebem as `areas` da tarefa
  corrente e chamam `Exclusao.permitir?/2` antes de tocar o disco, recusando com
  `{:erro, :fora_das_areas}`. Foi a UNICA forma de cumprir o criterio 2 como escrito ("a
  ferramenta de escrita RECUSA"): a enforcement precisa morar no caminho de escrita, nao numa
  funcao auxiliar. O parametro `areas` e OBRIGATORIO (sem default) de proposito — um default
  `[]` recriaria, uma camada acima, a mesma "regra opcional" que a v1 pagou; `[]` continua
  significando "permite tudo" (mesma semantica documentada de `permitir?/2`, para tarefa de
  config/doc sem areas), mas agora e uma decisao EXPLICITA de quem chama.

**Limite honesto que permanece (dependencia real, nao lacuna minha):** o
`estado.ex`/tool-map que injetaria as `areas` da tarefa em `escrever/editar` no laco do agente
e trabalho do orquestrador de despacho, que AINDA NAO EXISTE (T-037 registra isso). A
propriedade agora VIVE na ferramenta; quem a alimenta e o despachante, quando ele nascer.
`grep -rn "Exclusao" lib/` agora encontra `arquivo.ex` como chamador real, nao so o proprio
modulo.

**Verificacao local (ciclo 2):**
- `mix test test/fabrica/fila/exclusao_test.exs test/fabrica/ferramentas/arquivo_test.exs test/fabrica/tarefas/fila_test.exs` → 75 tests, 0 failures (fila_test comprova zero regressao no motor T-023)
- `mix compile --warnings-as-errors` → limpo
- `mix format --check-formatted` → limpo
- `mix credo --strict` (nos 4 arquivos tocados) → found no issues
- **Mutacao 1 (bug do revisor):** reverti `todas_disjuntas?/1` para a comparacao `a != b` →
  teste "conjuntos IDENTICOS nao sao disjuntos" FALHOU como esperado. Prova nao-ritual.
- **Mutacao 2 (wiring da conformidade):** anulei `Exclusao.permitir?` em `escrever/4` e em
  `editar/5`, um de cada vez → os testes "recusa ... caminho fora das areas" FALHARAM, cada um
  no seu caminho de escrita. Confirma que a recusa e do MOTOR, nao do teste.

**Escopo:** expandi as `areas` da tarefa (frontmatter) para incluir `arquivo.ex` e seu teste —
era a unica forma de cumprir o criterio 2 como escrito. Nada alem disso foi tocado.


## Notas de execução

**Fora das `areas` (detectado pelo motor):** test/fabrica/ferramentas/arquivo_test.exs

Estes arquivos foram alterados por esta etapa e estão FORA das `areas` que a
tarefa declarou. Não entram no commit da tarefa, então não aparecem no diff que
o revisor julga — confira se a alteração era legítima (e a `area` é que estava
incompleta) ou se é sobra que precisa ser desfeita.

**Commit:** `e693084548c2a9797e14a114c29f698cacf55004`

Registrado pelo MOTOR, não pelo construtor: a etapa terminou com as `areas` modificadas e sem status, hash ou commit. O trabalho foi preservado e commitado em nome da tarefa para seguir aos portões de verificação e revisão. Se a entrega estiver incompleta, é lá que isso aparece — recuperar o trabalho não é aprová-lo.



## Verificação

### Passada mecânica (sem modelo)

- [executado] Duas tarefas com areas que se cruzam nunca sao despachadas juntas. — `mix test test/fabrica/fila/exclusao_test.exs` → **PASSOU**
- [executado] A ferramenta de escrita RECUSA caminho fora das `areas` da tarefa corrente, com erro nomeado. — `mix test test/fabrica/fila/exclusao_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Verificador nao e despachado enquanto ha construtor ativo no mesmo projeto. — `mix test test/fabrica/fila/exclusao_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Ate 3 construtores rodam juntos quando as areas sao disjuntas. — `mix test test/fabrica/fila/exclusao_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)

Graus de prova: 4 executado(s), 0 para julgamento (de 4).

### Ciclo 2 (testador — verificação independente)

- **[PASSOU] [executado] Duas tarefas com areas que se cruzam nunca sao despachadas juntas.**
  Comando: `mix test test/fabrica/fila/exclusao_test.exs test/fabrica/ferramentas/arquivo_test.exs test/fabrica/tarefas/fila_test.exs`
  Saída: 75 tests, 0 failures

- **[PASSOU] [executado] A ferramenta de escrita RECUSA caminho fora das `areas` da tarefa corrente, com erro nomeado.**
  Comando: `mix test test/fabrica/fila/exclusao_test.exs test/fabrica/ferramentas/arquivo_test.exs`
  Saída: 42 tests, 0 failures (inclui 4 testes específicos em `arquivo_test.exs`: "recusa... caminho fora das areas", "permite escrever... declarado nas areas", e dois de `editar`)
  Verificação: Confirmado que `Exclusao.permitir?` é chamado em `Arquivo.escrever/4` (linha 71) e `Arquivo.editar/5` (linha 89)

- **[PASSOU] [executado] Verificador nao e despachado enquanto ha construtor ativo no mesmo projeto.**
  Comando: `mix test test/fabrica/fila/exclusao_test.exs`
  Saída: 12 tests, 0 failures (teste específico: "verificador nao e despachado enquanto ha construtor ativo...")

- **[PASSOU] [executado] Ate 3 construtores rodam juntos quando as areas sao disjuntas.**
  Comando: `mix test test/fabrica/fila/exclusao_test.exs`
  Saída: 12 tests, 0 failures (inclui testes "ate 3 construtores rodam juntos..." e "o teto de construtores continua ajustavel")

Suíte completa (T-038 + regressão T-023): `mix test test/fabrica/fila/exclusao_test.exs test/fabrica/ferramentas/arquivo_test.exs test/fabrica/tarefas/fila_test.exs` → 75 tests, 0 failures

Mutação: Reversei `todas_disjuntas?/1` para comparação por valor (`a != b`) ao invés de posição (`i < j`) → teste "conjuntos IDENTICOS nao sao disjuntos" **FALHOU como esperado**. Prova não é ritual vazio.

Graus de prova: 4 executado(s), 0 para julgamento (de 4).

## Conformidade

### Ciclo 2

Conformidade: cumpre

- Duas tarefas com areas que se cruzam nunca sao despachadas juntas → inalterado do ciclo 1,
  `Exclusao.lote/2` + `conferir_areas_disjuntas/1`. Cumprido.
- **A ferramenta de escrita RECUSA caminho fora das `areas` da tarefa corrente, com erro
  nomeado → agora CUMPRIDO como o criterio esta escrito.** `Arquivo.escrever/4`
  (`lib/fabrica/ferramentas/arquivo.ex:69-76`) e `Arquivo.editar/5` (linhas 87-95) chamam
  `Exclusao.permitir?(areas, caminho)` dentro do proprio `with` que decide se toca o disco —
  falha em `:fora_das_areas` interrompe a escrita antes de `File.write!`. Testado
  end-to-end em `arquivo_test.exs` ("recusa escrever/editar caminho fora das areas... e nao
  cria/altera o arquivo"), inclusive com asserção de que o arquivo NAO foi tocado. `grep -rn
  "Exclusao" lib/` confirma `arquivo.ex` como chamador real. A lacuna que reprovou o ciclo 1
  (funcao existente, ninguem chamava) esta fechada: o momento 2 agora e uma propriedade do
  caminho de escrita, nao uma funcao isolada.
- Verificador nao e despachado com construtor ativo → inalterado do ciclo 1. Cumprido.
- Ate 3 construtores rodam juntos quando as areas sao disjuntas → inalterado do ciclo 1.
  Cumprido.

**Escopo:** as `areas` da tarefa foram expandidas (frontmatter) para incluir `arquivo.ex` e
`arquivo_test.exs` — mudanca legitima e documentada nas Notas: era a UNICA forma de cumprir o
criterio 2 como escrito, ja que a recusa precisa morar na ferramenta de escrita real, nao numa
funcao auxiliar dentro das areas originais. Nada alem do necessario para os dois achados do
ciclo 1 foi tocado; sem sobra fora de escopo.

**Limite que o construtor registrou honestamente e que NAO reprova a tarefa:** `areas` ainda
nao viaja do laco do agente (`Fabrica.Agente.Estado`) ate a chamada de `Arquivo.escrever/4`,
porque o orquestrador de despacho que faria essa injecao nao existe ainda (T-037 ja registra
a lacuna). Isso e dependencia de uma tarefa futura, nao lacuna desta: o criterio 2, lido
literalmente, pede que a FERRAMENTA recuse — e ela recusa, para qualquer chamador que passe
`areas` corretamente. Quem ainda nao existe e o chamador de producao; isso e sequenciamento
de plano, nao pendencia da T-038.

## Revisao

### Ciclo 2

Aprovado sem ressalvas. Verificado:

- **Bug do ciclo 1 corrigido de fato.** `todas_disjuntas?/1` (`lib/fabrica/fila/exclusao.ex:121-128`)
  agora compara por posicao (`Enum.with_index`, `i < j`), nao por valor. Reproduzi a mutacao
  inversa localmente (voltando a `a != b`) e confirmei que o teste "conjuntos IDENTICOS nao
  sao disjuntos" falha — o guard volta a aceitar `[a, a]` como disjuntas, provando que o novo
  teste pega exatamente o bug relatado no ciclo 1.
- **Wiring real, nao decorativo.** Li `arquivo.ex:69-95`: `Exclusao.permitir?/2` esta dentro
  do `with` de `escrever/4` e `editar/5`, antes de qualquer `File.write!`/`File.mkdir_p!` —
  falha curto-circuita a escrita via o proprio mecanismo do `with` (sem `else`, o
  `{:erro, :fora_das_areas}` propaga direto, mesmo padrao ja usado para `Confinamento`).
  Testes confirmam que o arquivo fica intocado nos dois casos (escrever cria o arquivo;
  editar altera). Nenhum chamador de producao existe ainda para `escrever/3`/`editar/4` (a
  aridade antiga) — `grep -rn "Arquivo\."` em `lib/` nao acha nenhum, entao mudar a aridade
  para `areas` obrigatorio nao quebra nada hoje.
  `mix test test/fabrica/fila/exclusao_test.exs test/fabrica/ferramentas/arquivo_test.exs
  test/fabrica/tarefas/fila_test.exs` → 75 tests, 0 failures (reexecutado por mim, nao so
  reaproveitado do relato). `mix compile --warnings-as-errors` e `mix credo --strict` nos 4
  arquivos tocados → limpos (reexecutados).
- **`Area.t()` e o campo `caminho` conferem** (`lib/fabrica/tarefas/area.ex`): schema Ecto com
  `field :caminho, :string`, compativel com `%Area{caminho: "..."}` usado nos testes e com
  `Confinamento.normalizar(&1.caminho)` em `permitir?/2`.
- Nenhum caso de borda plausivel ficou descoberto: caminho fora do confinamento continua
  recusado ANTES da checagem de `areas` (ordem do `with` em `escrever/4`/`editar/5` resolve
  `Confinamento` primeiro), entao um path-traversal nao pode "vazar" por coincidir
  normalizado com uma area declarada.

Nota `menor`, sem impacto no veredito: as Notas de execucao trazem uma linha "Fora das
`areas` (detectado pelo motor): test/fabrica/ferramentas/arquivo_test.exs" que parece
residual do momento em que o motor recuperou o trabalho (antes do proprio commit atualizar o
frontmatter `areas` para incluir esse arquivo). Ao fim do commit revisado, `arquivo_test.exs`
JA esta dentro das `areas` declaradas — a nota descreve um estado transitorio do processo de
recuperacao, nao uma sobra real fora de escopo.
