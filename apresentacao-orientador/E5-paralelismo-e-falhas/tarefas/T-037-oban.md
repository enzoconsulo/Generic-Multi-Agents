---
id: T-037
titulo: "Fila duravel: enfileirar e mudar estado na mesma transacao"
projeto: fabrica-v2
versao: v0.4
status: concluida
prioridade: alta
dependencias: [T-022, T-036]
areas: [lib/fabrica/fila/, priv/repo/migrations, test/fabrica/fila/, mix.exs, mix.lock, config/config.exs, config/test.exs, lib/fabrica/application.ex]
tentativas: 1
criada: 2026-08-28
atualizada: 2026-09-07
---

## Objetivo
Trocar a fila em memoria por Oban, para que enfileirar um trabalho e mudar o estado da
tarefa acontecam na MESMA transacao.

## Contexto
E o que impede o estado classico "a tarefa consta como em execucao, mas ninguem esta
executando". Um trabalho guardado em memoria some quando o programa reinicia; a fila do
Oban vive no mesmo banco das tarefas, entao ou os dois valem, ou nenhum vale.

Configure filas separadas por papel — `construtor`, `verificador`, `revisor` — com
concorrencia propria. O verificador roda 1-wide de proposito: a bateria completa sobre uma
arvore com edicoes alheias gera reprovacao falsa, o desperdicio mais caro do sistema.

`unique` por `{tarefa_id, papel}` para impedir despacho duplicado da mesma etapa.

Trabalho interrompido pelo desligamento volta a ser despachavel na subida — sem
intervencao. Teste isso de verdade: enfileire, derrube o Oban no meio, suba, confira que o
trabalho voltou.

NAO reintroduza retentativa automatica generica. A retentativa desta fabrica e a escada da
T-031, que e deliberada e conta ciclo. Uma retentativa cega do Oban por cima disso faria a
tarefa girar sem que `tentativas` subisse — que e exatamente o defeito que custou 41
despachos na v1.

## Criterios de aceite
- [ ] Enfileirar e transicionar acontecem numa transacao: erro em qualquer um dos dois nao grava nenhum.
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] Trabalho interrompido volta a ser despachavel apos reinicio, sem intervencao.
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] `unique` impede duas etapas iguais da mesma tarefa na fila ao mesmo tempo.
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] A fila do verificador roda 1-wide; a do construtor, ate 3 (inspecionavel na config).

## Notas de execucao

### Retrabalho 2026-09-07 (executor reforçado)

**Causa raiz da reprovação (uma frase):** o parcial da parede de cota deixou
`lib/fabrica/fila/resgate.ex` chamando a macro `Ecto.Query.where([j], …)` sem `require
Ecto.Query`, então `[j]` virou variável comum → `undefined variable "j"` (resgate.ex:80),
e a árvore inteira ficou vermelha; além disso `trabalho.ex`/`trabalho_test.exs`
reprovavam `mix format`.

**O que descobri ao consertar (e não é só compilação):** o `resgate.ex` NÃO era código
morto nem exploração abandonada — ele é a correção certa. Com `max_attempts: 1`, um job
preso em `executing` tem `attempt == max_attempts` (o FETCH incrementa antes de
`perform/1`), e o `Oban.Lifeline` de fábrica, nesse caso, marca `discarded`, não
`available` (confirmado em `deps/oban/lib/oban/engines/basic.ex:205-206` e
`deps/oban/lib/oban/lifeline.ex:8-12`). O critério da T-037 exige que o trabalho volte a
ser **despachável** (`available`) — Lifeline o descartaria, e o teste de recuperação
falharia. O parcial estava no meio da transição Lifeline → `Fabrica.Fila.Resgate` (que
resgata sempre para `available` com `inc: [attempt: -1]`) e foi cortado antes de fiar o
Resgate na config/teste e antes de compilar.

**O que fiz:**
1. `resgate.ex`: adicionado `require Ecto.Query` — a macro `where/3` agora expande.
2. `config/config.exs`: `plugins: [Oban.Lifeline]` → `plugins: [Fabrica.Fila.Resgate]`, e
   reescrito o comentário que afirmava (errado) que o Lifeline devolve o job preso — ele o
   descartaria com `max_attempts: 1`.
3. `test/fabrica/fila/trabalho_test.exs`: o teste de recuperação usa `Fabrica.Fila.Resgate`
   no lugar de `Oban.Lifeline`.
4. `mix format` em `trabalho.ex` e `trabalho_test.exs`.

**Aproveitado x refeito:** aproveitei ~95% do parcial (config do Oban, `trabalho.ex` com o
`Oban.insert` no mesmo `Ecto.Multi`, migração, `resgate.ex` inteiro, todo o teste).
Refeito: uma linha em `resgate.ex`, a escolha de plugin em config e teste (3 linhas), o
comentário da config e a formatação. Nenhum escopo novo.

**Verificação local (2026-09-07, Postgres subido em `C:/pgsql/dados`):**
- `mix compile --warnings-as-errors` → limpo (a árvore vermelha do handoff está resolvida).
- `mix format --check-formatted` → limpo.
- `mix credo --strict` → 914 mods/funs, nenhum problema.
- `mix test test/fabrica/fila/trabalho_test.exs` → 10 testes, 0 falhas (inclui o de
  recuperação após queda, que agora resgata para `available` via `Fabrica.Fila.Resgate`).
- `mix test` (suíte inteira) → 25 doctests, 871 testes, 0 falhas. Árvore desbloqueada.

## Verificacao

### Ciclo 2 — Verificação independente (2026-09-08)

- **[PASSOU] [executado] Critério 1: Enfileirar e transicionar acontecem numa transacao: erro em qualquer um dos dois nao grava nenhum.**
  Comando: `mix test test/fabrica/fila/trabalho_test.exs`
  Saída: 10 tests, 0 failures (inclui "transicao para um estado com papel grava a tarefa E o trabalho, juntos" e "erro DEPOIS dos dois passos desfaz os dois")

- **[PASSOU] [executado] Critério 2: Trabalho interrompido volta a ser despachavel apos reinicio, sem intervencao.**
  Comando: `mix test test/fabrica/fila/trabalho_test.exs` (teste "trabalho preso em executing por o no ter caido volta a ser despachavel na subida")
  Saída: Simula queda: enfileira → trava job em "executing" → mata árvore → confirma "executing" → sobe com `Fabrica.Fila.Resgate` → confirma volta a "available". Passou.

- **[PASSOU] [executado] Critério 3: `unique` impede duas etapas iguais da mesma tarefa na fila ao mesmo tempo.**
  Comando: `mix test test/fabrica/fila/trabalho_test.exs` (testes em "unique por {tarefa_id, papel}")
  Saída: Duas tentativas não duplicam — PASSOU. Papéis diferentes não colidem — PASSOU.

- **[PASSOU] [executado] Critério 4: A fila do verificador roda 1-wide; a do construtor, ate 3 (inspecionavel na config).**
  Comando: `mix test test/fabrica/fila/trabalho_test.exs` + inspeção de `config/config.exs` linhas 50-52
  Saída: Teste "a fila do verificador tem concorrencia 1, e a do construtor, ate 3" passou. Config mostra `queues: [construtor: 3, verificador: 1, revisor: 3]`.

Suíte completa: 25 doctests, 871 testes, 0 falhas — `mix test`
Graus de prova: 4 executados

## Conformidade

### Ciclo 2 — Revisão (2026-09-08)

Conformidade: cumpre

- Enfileirar e transicionar na mesma transação → `lib/fabrica/fila/trabalho.ex:105-122`
  (`montar/3` compõe `Transicao.acrescentar/4` com `Oban.insert/4` no mesmo `Ecto.Multi`;
  `despachar/3` fecha com `Repo.transaction/1`). Prova: teste "erro DEPOIS dos dois passos
  desfaz os dois" em `test/fabrica/fila/trabalho_test.exs`, passou.
- Trabalho preso em `executing` volta a `available` sem intervenção →
  `lib/fabrica/fila/resgate.ex` (plugin `Fabrica.Fila.Resgate`, fiado em
  `config/config.exs:51`). Prova: teste "trabalho preso em executing... volta a ser
  despachavel na subida", que derruba o Oban no meio da execução e confirma o resgate.
  Reexecutei localmente (`mix test test/fabrica/fila/trabalho_test.exs`): 10 testes, 0
  falhas — bate com o que as Notas de execução afirmam.
- `unique` por `{tarefa_id, papel}` → `lib/fabrica/fila/trabalho.ex:63-75` (`novo/2`,
  `unique: [fields: [:args], keys: [:tarefa_id, :papel], states: incomplete, period:
  infinity]`). Coberto pelos testes do describe "unique por {tarefa_id, papel}".
- Fila do verificador 1-wide, construtor até 3, inspecionável → `config/config.exs:52`
  (`queues: [construtor: 3, verificador: 1, revisor: 3]`), confirmado pelo teste "a fila
  do verificador tem concorrencia 1, e a do construtor, ate 3".
- Escopo: a mudança deste ciclo é exatamente o buraco apontado no handoff — `require
  Ecto.Query` em `resgate.ex`, troca de `Oban.Lifeline` por `Fabrica.Fila.Resgate` em
  `config/config.exs` e no teste, e formatação. Nada além disso; nenhuma área fora do
  declarado (`lib/fabrica/fila/resgate.ex`, `lib/fabrica/fila/trabalho.ex` e
  `test/fabrica/fila/trabalho_test.exs` já estão cobertos pelos prefixos `lib/fabrica/fila/`
  e `test/fabrica/fila/` declarados em `areas` — o aviso "Fora das areas" do motor está
  incorreto para este ciclo, é achado `menor`, ver Revisão).
- Sem tarefa de UI: não há prova visual a avaliar.

## Revisao

### Ciclo 2 — Revisão (2026-09-08)

Verifiquei o diff do commit `ec238d686712093fbcabb17ba5edad7f6a4db45a` e reexecutei
localmente: `mix compile --warnings-as-errors` (limpo), `mix format --check-formatted`
(limpo) e `mix test test/fabrica/fila/trabalho_test.exs` (10 testes, 0 falhas) — batem com
o relatado nas Notas de execução. Conferi também `lib/fabrica/fila/resgate.ex` por inteiro:
a query usa `Ecto.Query.where/3` corretamente com `require Ecto.Query` presente, e
`Repo.update_all(conf, query, ...)` segue o mesmo padrão usado internamente pelo próprio
Oban (`deps/oban/lib/oban/engines/basic.ex:208`).

- [menor] `_gestao/tarefas/T-037-oban.md` — a nota automática "Fora das `areas`
  (detectado pelo motor): lib/fabrica/fila/resgate.ex, lib/fabrica/fila/trabalho.ex,
  test/fabrica/fila/trabalho_test.exs" está incorreta: os três caminhos já são cobertos
  pelos prefixos `lib/fabrica/fila/` e `test/fabrica/fila/` declarados em `areas`. Não é
  defeito do executor nem do diff revisado — é o script do motor marcando falso positivo
  — mas registro porque é sinal de processo que vale corrigir na ferramenta, não no
  código da tarefa.

Aprovado sem ressalvas quanto a correção: nenhum achado `critica` ou `importante`.



## Notas de execução

**Fora das `areas` (detectado pelo motor):** mix.lock, lib/fabrica/fila/, test/fabrica/fila/

Estes arquivos foram alterados por esta etapa e estão FORA das `areas` que a
tarefa declarou. Não entram no commit da tarefa, então não aparecem no diff que
o revisor julga — confira se a alteração era legítima (e a `area` é que estava
incompleta) ou se é sobra que precisa ser desfeita.

**Fora das `areas` (detectado pelo motor):** mix.lock, lib/fabrica/fila/, test/fabrica/fila/

Estes arquivos foram alterados por esta etapa e estão FORA das `areas` que a
tarefa declarou. Não entram no commit da tarefa, então não aparecem no diff que
o revisor julga — confira se a alteração era legítima (e a `area` é que estava
incompleta) ou se é sobra que precisa ser desfeita.


---

**Fora das `areas` (detectado pelo motor):** lib/fabrica/fila/resgate.ex, lib/fabrica/fila/trabalho.ex, test/fabrica/fila/trabalho_test.exs

Estes arquivos foram alterados por esta etapa e estão FORA das `areas` que a
tarefa declarou. Não entram no commit da tarefa, então não aparecem no diff que
o revisor julga — confira se a alteração era legítima (e a `area` é que estava
incompleta) ou se é sobra que precisa ser desfeita.

**Commit:** `ec238d686712093fbcabb17ba5edad7f6a4db45a`

Registrado pelo MOTOR, não pelo construtor: a etapa terminou com as `areas` modificadas e sem status, hash ou commit. O trabalho foi preservado e commitado em nome da tarefa para seguir aos portões de verificação e revisão. Se a entrega estiver incompleta, é lá que isso aparece — recuperar o trabalho não é aprová-lo.



## Handoff 2026-09-04 — parcial COMMITADO, a arvore NAO compila

Escrito pelo orquestrador ao preparar a troca de maquina. Nao e reprovacao: e o registro
do estado real, para quem retomar nao gastar despacho redescobrindo.

**O que aconteceu.** O executor desta tarefa foi CORTADO PELA PAREDE DE COTA no meio
(job `5f1292ab`, 07:49 UTC, `motivo: limite-uso`, US$ 3,84 gastos nesta tarefa). O que ele
tinha escrito ficou solto na arvore, e como estava FORA das `areas` declaradas, nao entrou
em commit nenhum. As `areas` acima foram corrigidas agora — a alteracao era legitima
(integrar Oban obriga a mexer em `mix.exs`, `config/` e `application.ex`), a declaracao e
que estava incompleta.

**O parcial foi commitado como esta, quebrado, de proposito** — para que ele exista na
outra maquina. Ele NAO compila:

```
== Compilation error in file lib/fabrica/fila/resgate.ex ==
** (CompileError) cannot compile module Fabrica.Fila.Resgate
   lib/fabrica/fila/resgate.ex:80: undefined variable "j"
```

`resgate.ex:80` usa `Ecto.Query.where([j], ...)` sem que o `Ecto.Query` esteja importado
no modulo — a macro nao chegou a existir ali, entao o `[j]` virou variavel comum. Alem
disso, `mix format --check-formatted` reprova `lib/fabrica/fila/trabalho.ex` e
`test/fabrica/fila/trabalho_test.exs`. Nada disso foi consertado aqui: e trabalho do
executor, e conserto de fora do ciclo esconderia que a tarefa esta pela metade.

**Consequencia que vale dinheiro: a arvore inteira esta VERMELHA.** Qualquer tarefa cujo
criterio seja `mix verificar` ou `mix fabrica.ci` reprova por causa DESTE arquivo, nao
por defeito proprio. Ja aconteceu com a T-050, que queimou duas tentativas assim.

**Portanto, na retomada: esta tarefa roda PRIMEIRO e SOZINHA.** Nao promova nem despache
nada em paralelo ate `mix compile --warnings-as-errors` e `mix format --check-formatted`
voltarem a passar.

**O que ja esta escrito e parece bom** (nao rejogue fora sem ler): configuracao do Oban em
`config/config.exs` com `notifier: PG` / `peer: Global` e filas por papel
(`construtor: 3, verificador: 1, revisor: 3`), `testing: :manual` em `config/test.exs`,
o `{Oban, ...}` na arvore de supervisao logo apos o `Repo`, a migracao
`20260904070237_adicionar_oban.exs`, e `lib/fabrica/fila/trabalho.ex` com o
`Oban.insert/4` dentro do mesmo `Ecto.Multi` da transicao — que e o coracao do que a
tarefa pede. O buraco esta no `resgate.ex` e na formatacao.


## Verificação

### Passada mecânica (sem modelo)

- [executado] Enfileirar e transicionar acontecem numa transacao: erro em qualquer um dos dois nao grava nenhum. — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU**
- [executado] Trabalho interrompido volta a ser despachavel apos reinicio, sem intervencao. — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] `unique` impede duas etapas iguais da mesma tarefa na fila ao mesmo tempo. — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [julgado] A fila do verificador roda 1-wide; a do construtor, ate 3 (inspecionavel na config). — sem comando declarado; fica para o verificador.

Graus de prova: 3 executado(s), 1 para julgamento (de 4).
