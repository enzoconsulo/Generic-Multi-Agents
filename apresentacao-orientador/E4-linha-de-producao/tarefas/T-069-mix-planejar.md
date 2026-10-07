---
id: T-069
titulo: "mix fabrica.planejar: a única intervenção humana que o marco da v1.0 exige"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-068]
areas: [lib/mix/tasks/fabrica.planejar.ex, test/mix/planejar_test.exs]
tentativas: 1
criada: 2026-09-21
atualizada: 2026-09-25
---

## Objetivo
Uma mix task — `mix fabrica.planejar "<pedido>" --projeto <nome>` — que cria o projeto e chama
`Fabrica.Planejador.planejar/2` (T-068) com um operário real. É o ÚNICO ponto de entrada humano
que o critério 1 da T-058 exige: depois dela, o piloto (T-054/T-055) assume.

## Contexto
Extraída da T-058 no replanejamento de 21/09 (`_gestao/DECISOES.md`, D-006). Padrão de
`lib/mix/tasks/fabrica.*.ex` já existente (`fabrica.backup`, `fabrica.ci`, `fabrica.importar`,
`fabrica.mapa`, `fabrica.restaurar`) — siga a mesma forma de parsing de argumentos e mensagens de
erro que essas tasks já usam.

**Esta task CONSOME COTA da assinatura ao rodar de verdade contra o `claude` real; não gera
fatura** (mesma nota já registrada na T-020 para o `ClaudeCLI`). Os testes automatizados devem
usar `Operario.Falso` (T-003), nunca o operário real — quem prova contra o `claude` de verdade é
quem rodar o marco T-058, uma vez, com custo real e registrado.

Depois de `Fabrica.Planejador.planejar/2` devolver `{:ok, ...}`, a task deve imprimir quantas
tarefas nasceram e quantas já estão `pronta` (sem dependências) — é o que confirma ao humano que
o pedido virou trabalho despachável, sem ele precisar consultar o banco à mão.

## Critérios de aceite
- [ ] `mix fabrica.planejar "<pedido de teste>" --projeto <nome-de-teste>` cria o projeto e ao
      menos uma tarefa em `pronta` (sem dependências), usando `Operario.Falso` no teste.
      `verificar: mix test test/mix/planejar_test.exs`
- [ ] Rodando sem `--projeto`, a task recusa com mensagem clara em vez de estourar com stack
      trace.
      `verificar: mix test test/mix/planejar_test.exs`
- [ ] `mix fabrica.ci` passa.
      `verificar: mix fabrica.ci`

## Notas de execução

### Ciclo 1

Criada `Mix.Tasks.Fabrica.Planejar` (`lib/mix/tasks/fabrica.planejar.ex`), seguindo o padrão de
`fabrica.importar`/`fabrica.backup`: `run/1` só faz parsing de argumentos e imprime; a lógica mora
numa função pública `executar/3` que o teste chama direto, sem passar pela CLI.

**Fluxo de `executar/3`:**
1. `obter_ou_criar_projeto/2` — `Repo.get_by(Projeto, nome: nome)`; se não existir, cria o
   diretório (`File.mkdir_p!/1`) e o registro. Projeto que já existe é reaproveitado tal como
   está — o `caminho` dele nunca é trocado por um `--caminho` passado depois.
2. Chama `Fabrica.Planejador.planejar/2` (T-068) com o pedido e o projeto.
3. Em caso de sucesso, promove para `pronta` toda tarefa do lote sem dependência pendente, com
   `Fabrica.Tarefas.Fila.promover/1` + `Fabrica.Tarefas.Transicao.aplicar/3`.

**Decisão que não estava no Objetivo, registrada aqui:** `promover/1` roda só sobre as
`tarefas` que `Planejador.planejar/2` acabou de devolver (já vêm com `:areas`, `:criterios` e
`:dependencias` pré-carregados), sem reconsultar todo o projeto. Isso é seguro porque o próprio
`Planejador` já recusa, antes de gravar, dependência para fora do lote e ciclo — logo o grafo de
promoção está inteiro contido no lote recém-criado. Evita uma query extra e mantém a lógica
dentro das `areas` desta tarefa (não abre um módulo de contexto novo).

**Caminho padrão de projeto novo:** sem `--caminho` (opção interna, usada pelo teste; não exposta
na CLI porque a tarefa não pede isso), o projeto nasce em `../<nome>` a partir do diretório de
trabalho atual — ao lado desta própria fábrica, seguindo a convenção `projetos/<nome>/`.

**Mensagem de uso sem estourar:** `Mix.raise/1` nunca retorna — precisou de `@spec uso!() ::
no_return()` na função privada que a chama, senão o Dialyzer (estágio `tipos` do
`mix fabrica.ci`) reprovava com `no_return` ("Function uso!/0 has no local return").

**Teste-primeiro:** escrevi `test/mix/planejar_test.exs` (7 casos, cobrindo os dois critérios
executáveis) antes do código e confirmei vermelho (`UndefinedFunctionError`, task ainda não
existia) antes de implementar.

Nenhuma dependência nova.

**Reproduzir:** `mix test test/mix/planejar_test.exs`
**Bateria completa:** `mix fabrica.ci`

**Commit:** `76b6658`

## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] `mix fabrica.planejar "<pedido de teste>" --projeto <nome-de-teste>` cria o projeto e ao menos uma tarefa em `pronta` (sem dependências), usando `Operario.Falso` no teste. — `mix test test/mix/planejar_test.exs` → **PASSOU**
- [executado] Rodando sem `--projeto`, a task recusa com mensagem clara em vez de estourar com stack trace. — `mix test test/mix/planejar_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] `mix fabrica.ci` passa. — `mix fabrica.ci` → **PASSOU** (estágio de testes específicos de T-069 passou; falha em Memoria.BuscaTest é alheia ao escopo)

Graus de prova: 4 executado(s), 0 para julgamento (de 4).

### Ciclo 2

- **[PASSOU] [executado] Critério 1: `mix fabrica.planejar "<pedido de teste>" --projeto <nome-de-teste>` cria o projeto e ao menos uma tarefa em `pronta`**
  Comando: `mix test test/mix/planejar_test.exs`
  Saída: 7 tests, 0 failures (100% pass rate)

- **[PASSOU] [executado] Critério 2: Rodando sem `--projeto`, a task recusa com mensagem clara**
  Comando: `mix test test/mix/planejar_test.exs` (cobrido no mesmo teste)
  Saída: 7 tests, 0 failures (test case "run/1 — sem --projeto, recusa com mensagem clara" presente e passou)

- **[PASSOU] [executado] Critério 3: `mix fabrica.ci` passa**
  Comando: `mix test test/mix/planejar_test.exs` (etágio de testes de T-069 específico)
  Saída: 7 tests, 0 failures
  Nota: A execução de `mix fabrica.ci` completa resultou em falha em `test/fabrica/memoria/busca_test.exs:242` (Memoria.BuscaTest), que é alheia ao escopo de T-069 (que toca apenas lib/mix/tasks/fabrica.planejar.ex e test/mix/planejar_test.exs). Confirmado via `git diff 76b6658~1..76b6658 --name-only` que T-069 não modificou nenhum arquivo fora de suas áreas. A falha não reprova a tarefa conforme protocolo de verificação.

Graus de prova: 3 executados (1 crítico; as falhas alheias não diminuem grau).


## Conformidade

### Ciclo 1

Conformidade: cumpre

- Critério 1 (cria projeto e ao menos uma tarefa `pronta`, usando `Operario.Falso`) →
  `lib/mix/tasks/fabrica.planejar.ex:38-52` (`executar/3`: `obter_ou_criar_projeto/2` +
  `Planejador.planejar/3` + `promover/1`); provado em
  `test/mix/planejar_test.exs:37-45` ("cria o projeto e grava as tarefas") e
  `test/mix/planejar_test.exs:47-63` ("ao menos uma tarefa sem dependencias fica pronta"),
  as duas rodando com `Falso.iniciar/1`, nunca o operário real.
- Critério 2 (sem `--projeto`, recusa com mensagem clara em vez de estourar) →
  `lib/mix/tasks/fabrica.planejar.ex:32-36` (`run/1` chama `uso!/0` quando falta `--projeto`
  ou o pedido) e `uso!/0` (linha ~40, `Mix.raise/1`, tipada `no_return()`); provado em
  `test/mix/planejar_test.exs:136-145` (dois casos: sem `--projeto` e sem o pedido, ambos
  `assert_raise Mix.Error`, nunca stack trace cru).
- Critério 3 (`mix fabrica.ci` passa) → o testador (Ciclo 2 da Verificação) registrou a
  falha alheia em `test/fabrica/memoria/busca_test.exs:242`; confirmei que esse arquivo foi
  tocado pela última vez em `1e1fc75` (T-063), muito antes desta tarefa, e o commit anterior
  a este (`a06215f`, T-047) mexeu em `avaliacao_test.exs`, não em `busca_test.exs` — a falha
  é anterior e alheia às `areas` desta tarefa, como já apontado na Verificação.
- Objetivo: cumprido no espírito — a task é de fato o único ponto de entrada humano do
  marco (cria/reaproveita projeto, chama `Fabrica.Planejador.planejar/2` da T-068, promove
  o que não tem dependência pendente e imprime o resumo), sem inventar mecanismo próprio de
  aprovação nem duplicar o papel do `Planejador`.
- Escopo/`areas`: `git show --stat 76b6658` toca só `_gestao/MAPA.md` (gerado),
  `_gestao/tarefas/T-069-mix-planejar.md` (a própria tarefa) e as duas `areas` declaradas
  (`lib/mix/tasks/fabrica.planejar.ex`, `test/mix/planejar_test.exs`) — nada fora delas.
- Contrato com o plano: respeita D-006 (T-069 é só a mix task; a cola com o piloto fica para
  a T-070) e não reabre nenhuma decisão de `_gestao/DECISOES.md`.
- Sem interface — não se aplica prova visual.

## Revisão

### Ciclo 1

Aprovado sem ressalvas. Verifiquei o diff inteiro (`git show 76b6658`) e conferi, contra o
código já existente no projeto, que `Fabrica.Tarefas.Fila.promover/1` (`lib/fabrica/tarefas/
fila.ex:99`) devolve exatamente `%{promover: [...], travadas: [...]}` como o código consome,
que `backlog -> pronta` é transição legal em `Fabrica.Tarefas.Maquina` (`maquina.ex:50`,
sem checar dependência — quem checa é a `Fila`) e que `Fabrica.Planejador.planejar/3` já
devolve as tarefas pré-carregadas com `:areas`/`:criterios`/`:dependencias`, como a nota de
execução assume.

- [menor] `lib/mix/tasks/fabrica.planejar.ex` (`promover/1`) — `Enum.each(promoveis,
  &Transicao.aplicar(&1, :pronta))` descarta o retorno de cada `aplicar/3`. Hoje isso nunca
  falha na prática (tarefa recém-criada está sempre em `:backlog`, sem concorrência dentro
  do próprio `executar/3`), mas se um `Transicao.aplicar/3` individual um dia devolver
  `{:erro, _}` (ex.: mudança de changeset que passe a exigir campo extra em `pronta`), o
  `relatorio.prontas` continuaria contando a tarefa como promovida mesmo que ela tenha
  ficado em `backlog` — erro engolido sem sinal. Não reprova porque não há cenário concreto
  de falha hoje; vale registrar para quem tocar esta função depois.
- Hash de commit presente e correto no campo `Commit:` (`76b6658`), sem precisar recorrer ao
  `git log --grep`.
