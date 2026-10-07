---
id: T-095
titulo: "Despacho que não rodou (parede de cota, sem sandbox) não é JULGADO em nenhum papel — nem avança a tarefa, nem gasta ciclo, nem aprova por omissão"
projeto: fabrica-v2
versao: v1.0
status: pronta
prioridade: alta
dependencias: [T-091, T-099]
areas: [lib/fabrica/fila/trabalho.ex, test/fabrica/fila/trabalho_test.exs]
tentativas: 0
criada: 2026-10-02
atualizada: 2026-10-07
---

## Objetivo
Quando o despacho de QUALQUER papel (construtor, verificador, revisor) é interrompido por algo que NÃO
é o trabalho — parede de cota, sandbox indisponível —, o portão não julga: a tarefa fica onde estava
para ser retomada depois, em vez de seguir no pipeline como se o turno tivesse terminado.

## Contexto
Achado do executor da T-091, conferido pelo orquestrador lendo `lib/fabrica/fila/trabalho.ex`, e
alargado pelo revisor da T-091 (Revisão dela):

- `julgar(:construtor, _tarefa, _resumo)` devolve `{:em_teste, :fim_do_turno}` SEMPRE — qualquer que
  seja o `resumo.desfecho`. No teste ponta a ponta da T-091 a tarefa foi para `em_teste` sem nada
  construído. Depois do rearme, o verificador roda os critérios sobre uma entrega vazia, REPROVA, a
  tarefa volta com `tentativas + 1` e o construtor reforçado é pago — um ciclo (de 3) e cota queimados
  por uma parede que não é defeito de ninguém.
- **Mais grave — no REVISOR é aprovação falsa:** `julgar(:revisor)` (`trabalho.ex:~390`) lê a
  conformidade de relatos vazios; `Revisor.ler_conformidade/1` começa em `:conforme`
  (`revisor.ex:~219-229`) e não há achados — a tarefa vai a `concluida` SEM revisão nenhuma. Vale para
  qualquer erro do `Laco` no revisor, não só a parede.
- No verificador, a passada mecânica roda sobre o que houver na árvore e o resultado depende do acaso.
- O mesmo vale para `{:erro, :sandbox_indisponivel}` (T-090): o agente nem subiu.
- O `Laco` mantém `desfecho: :erro` nesses casos (D-017); o motivo do erro pode precisar chegar ao
  `resumo` — o executor decide como, sem mudar o contrato de `desfecho` para os outros consumidores
  (siga-os antes). `Fabrica.Cota.estado/1` também responde "a cota está batida?" (sinal existente).

Comportamento esperado: o portão NÃO julga, a tarefa não transita para o próximo estado e `tentativas`
não muda; ela fica disponível para ser despachada de novo quando o motivo passar (o piloto dorme até o
rearme). Confira na máquina de estados (`Fabrica.Tarefas.Maquina`) qual transição é legal para
"devolver" a tarefa em cada estado, e registre a escolha. Erros que SÃO do trabalho (ex.: `prazo`, teto
de voltas) seguem como hoje.

## Critérios de aceite
- [ ] CONSTRUTOR cujo operário devolve parede de cota: a tarefa NÃO vai para `em_teste`, `tentativas`
      não muda, e ela pode ser despachada de novo; o evento de fim de despacho sai com o gasto (zero ou
      o medido). Teste que falha antes do conserto (prove com `git stash`).
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] REVISOR cujo despacho bate na parede: a tarefa NÃO vai a `concluida` (nem volta a
      `em_execucao`); fica para ser revisada de novo. O mesmo no VERIFICADOR (não vai a `em_revisao`
      nem volta reprovada). Teste por papel, que falha antes do conserto.
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] `{:erro, :sandbox_indisponivel}` se comporta como a parede nos três papéis; um erro que É do
      trabalho (ex.: `prazo`, teto de voltas) segue o caminho de hoje (teste).
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução
- 2026-10-07 (orquestrador): passa a depender da T-099 — no Windows a suíte cai em 2 testes de link do confinamento, e toda verificação desta tarefa reprovaria por isso (reprovação falsa). Volta a `pronta` sozinha quando a T-099 concluir.


## Verificação


## Conformidade


## Revisão


