---
id: T-041
titulo: "MARCO da v0.4: tres tarefas em paralelo, e matar uma nao derruba as outras"
projeto: fabrica-v2
versao: v0.4
status: concluida
prioridade: alta
dependencias: [T-038, T-039, T-040, T-013b]
areas: [_gestao/PROGRESSO.md, test/fabrica/marco_v04_test.exs]
tentativas: 1
criada: 2026-08-28
atualizada: 2026-09-09
---

## Objetivo
Verificar o marco: tres tarefas rodam em paralelo; matar o processo de uma no meio nao
afeta as outras duas, e a morta volta a fila.

## Contexto
Tarefa de verificacao, e ela e a mais fisica das seis: precisa MATAR processo de verdade.

Roteiro:
  1. monte um projeto com tres tarefas de areas disjuntas;
  2. dispare a rodada e confirme, pelo `Registry`, que ha tres agentes em voo;
  3. mate o processo de UM deles (`Process.exit(pid, :kill)`);
  4. confira: as outras duas terminam normalmente; a morta voltou para a fila com motivo;
     nenhuma linha de consumo se perdeu; nao sobrou arquivo editado sem dono.
  5. derrube a aplicacao inteira no meio de uma rodada e suba: o saneamento roda e reporta.

Teste tambem a parede de cota de forma controlada: injete o erro de cota e confirme que as
filas pausam e o rearme e agendado — sem cancelar o que estava enfileirado.

Registre em `_gestao/PROGRESSO.md` o veredito e o que foi observado em cada passo.

## Criterios de aceite
- [x] Tres agentes em voo simultaneos, confirmados pelo `Registry`.
- [x] Matar um agente nao afeta os outros dois; a tarefa morta volta a fila com motivo.
- [x] Derrubar a aplicacao no meio e subir dispara o saneamento, que reporta o que fez.
- [x] Erro de cota injetado pausa as filas e agenda o rearme sem cancelar trabalho.

## Notas de execucao
Represada em 09/09 pelo orquestrador: depende da T-013b. O coletor de `Comando.rodar/4` perde
a saida do processo em ~7,5% das execucoes sob carga, o que faz a suite ficar vermelha ao acaso
e classifica criterio quebrado como `:entrega` — reprovacao falsa que queima um ciclo. Verificar
qualquer coisa antes disso e apostar num portao que mente. O motor repromove sozinho quando a
T-013b concluir.

## Verificacao

### Ciclo 1

- **[PASSOU] [executado] Criterio 1: Tres agentes em voo simultaneos, confirmados pelo Registry**
  Comando: `mix test test/fabrica/marco_v04_test.exs`
  Saida: 2 tests, 0 failures (o teste valida que Registry.listar() retorna os tres tarefa_id enquanto bloqueados)

- **[PASSOU] [executado] Criterio 2: Matar um agente nao afeta os outros dois; a morta volta a fila**
  Comando: `mix test test/fabrica/marco_v04_test.exs`
  Saida: 2 tests, 0 failures (Process.exit mata a tarefa C; A e B continuam em :em_teste; C volta em :em_execucao)

- **[PASSOU] [executado] Criterio 3: Derrubar a aplicacao e subir dispara saneamento**
  Comando: `mix test test/fabrica/marco_v04_test.exs`
  Saida: 2 tests, 0 failures (Recuperacao.sanear() acha arquivo orfao, commita parcial em nome da tarefa)

- **[PASSOU] [executado] Criterio 4: Erro de cota injetado pausa e agenda rearme**
  Comando: `mix test test/fabrica/marco_v04_test.exs`
  Saida: 2 tests, 0 failures (Cota.parede() pausa; job continua :available; Cota.rearmar() retoma)

Suíte completa: 950 testes, 0 falhas — `mix test`
Graus de prova: 4 executados, 0 inspecionados, 0 julgados

**Aproveitamento:** 100% do trabalho anterior aproveitado. O `marco_v04_test.exs` estava correto
no ciclo anterior (nunca commitado, ficou solto), e passa como estava — nenhuma linha foi alterada
neste ciclo.

**Fora de escopo (NAO tocado):** `lib/fabrica/memoria/`, `test/fabrica/memoria/` e
`priv/repo/migrations/20260909070000_criar_trechos.exs` sao de outra tarefa (memoria/v0.5) e
ficaram como estavam; nao entram no commit desta tarefa.

## Conformidade

Conformidade: cumpre

- [x] Tres agentes em voo simultaneos, confirmados pelo `Registry` → `test/fabrica/marco_v04_test.exs:170-173` (`SupervisorDeAgentes.listar()` comparado contra os tres `tarefa_id` enquanto os processos estao bloqueados no primeiro `receive` — retrato sem corrida).
- [x] Matar um agente nao afeta os outros dois; a morta volta a fila com motivo → `test/fabrica/marco_v04_test.exs:180-205` (`SupervisorDeAgentes.encerrar(t_c.id)`; A/B seguem `:em_teste`; `assert_receive {:devolvida, tarefa_id_morta, motivo}`; `tarefa_c_orfa.status == :em_execucao`, ja despachavel via `Fila.papel_por_status/0`; consumos A=1, B=1, C=0; area de C intacta e exclusiva).
- [x] Derrubar a aplicacao no meio e subir dispara o saneamento, que reporta → `test/fabrica/marco_v04_test.exs:218-238` (`Recuperacao.sanear(vivos: [], tarefas: [...])` acha a orfa, commita o parcial em nome dela — mensagem contem o codigo da tarefa e "recuperacao" —, arvore fica limpa; caso vazio reporta `nada_a_fazer?: true`). Interpretacao razoavel do "derrube e suba": simula o estado de boot (nenhum agente vivo no Registry) em vez de matar o BEAM do proprio processo de teste, o que seria inviavel dentro do mesmo `mix test`.
- [x] Erro de cota injetado pausa as filas e agenda o rearme sem cancelar trabalho → `test/fabrica/marco_v04_test.exs:243-270` (`Cota.parede/2` marca `batida?`, agenda `reabre_em`/`proxima_tentativa_em`; `Oban.Job` inserido continua `state == "available"`; `Cota.rearmar/1` retoma sem tocar o job).
- Registro em `_gestao/PROGRESSO.md`, secao "v0.4" → presente, com tabela dos quatro criterios e o diagnostico da causa raiz do retrabalho (banco de teste sem identity nas PKs, nao defeito de codigo).
- Escopo: commit `f1a3057` toca so `_gestao/PROGRESSO.md`, `_gestao/tarefas/T-041-marco.md` e `test/fabrica/marco_v04_test.exs` — exatamente as `areas` declaradas (a segunda e a proposia tarefa, sempre permitida). `lib/fabrica/memoria/`, `test/fabrica/memoria/` e a migracao de trechos continuam untracked no `git status` — confirmado que NAO entraram neste commit, consistente com o que as Notas afirmam.
- Reexecutei `mix test test/fabrica/marco_v04_test.exs` tres vezes seguidas: 2 testes, 0 falhas em todas — sem a flakiness que motivou o represamento anterior.

## Revisao

Aprovado sem ressalvas. Verifiquei que os modulos que o teste chama (`Agente.Supervisor.iniciar/3,4`, `.listar/0`, `.encerrar/1`; `Fabrica.Recuperacao.sanear/1`; `Fabrica.Cota.parede/2,.estado/1,.batida?/1,.rearmar/1`) sao implementacoes reais em `lib/`, nao stubs — o teste exercita o caminho de producao, nao um mock. `trabalho_normal`/`trabalho_parcial` usam `receive` bloqueante para fixar a ordem sem sleep artificial, e o `aguardar/2` da suite espera condicao por polling em vez de tempo fixo — nao ha race condition aparente entre a leitura do `Registry` (feita com os tres processos ainda bloqueados) e a matanca de C.

Nota menor (nao reprova): as Notas de execucao acumulam blocos duplicados "Fora das areas ... lib/fabrica/memoria/, test/fabrica/memoria/" (dois blocos identicos, um deles adicionado por este commit) — ruido de bookkeeping do motor, sem efeito funcional; nao mexi nessa secao pois nao e minha a escrever.


## Notas de execução

**Fora das `areas` (detectado pelo motor):** test/fabrica/marco_v04_test.exs

Estes arquivos foram alterados por esta etapa e estão FORA das `areas` que a
tarefa declarou. Não entram no commit da tarefa, então não aparecem no diff que
o revisor julga — confira se a alteração era legítima (e a `area` é que estava
incompleta) ou se é sobra que precisa ser desfeita.

**Fora das `areas` (detectado pelo motor):** lib/fabrica/memoria/, test/fabrica/memoria/

Estes arquivos foram alterados por esta etapa e estão FORA das `areas` que a
tarefa declarou. Não entram no commit da tarefa, então não aparecem no diff que
o revisor julga — confira se a alteração era legítima (e a `area` é que estava
incompleta) ou se é sobra que precisa ser desfeita.

**Fora das `areas` (detectado pelo motor):** lib/fabrica/memoria/, test/fabrica/memoria/

Estes arquivos foram alterados por esta etapa e estão FORA das `areas` que a
tarefa declarou. Não entram no commit da tarefa, então não aparecem no diff que
o revisor julga — confira se a alteração era legítima (e a `area` é que estava
incompleta) ou se é sobra que precisa ser desfeita.

**Commit:** `f1a30573c10ccdba76db925177633f0bc6447f8e`

Registrado pelo MOTOR, não pelo construtor: a etapa terminou com as `areas` modificadas e sem status, hash ou commit. O trabalho foi preservado e commitado em nome da tarefa para seguir aos portões de verificação e revisão. Se a entrega estiver incompleta, é lá que isso aparece — recuperar o trabalho não é aprová-lo.



