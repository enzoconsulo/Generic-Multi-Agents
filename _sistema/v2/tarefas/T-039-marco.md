---
id: T-039
titulo: MARCO da v0.4: tres tarefas em paralelo, e matar uma nao derruba as outras
projeto: fabrica-v2
versao: v0.4
status: backlog
prioridade: alta
dependencias: [T-036, T-037, T-038]
areas: [_gestao/PROGRESSO.md]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
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
- [ ] Tres agentes em voo simultaneos, confirmados pelo `Registry`.
- [ ] Matar um agente nao afeta os outros dois; a tarefa morta volta a fila com motivo.
- [ ] Derrubar a aplicacao no meio e subir dispara o saneamento, que reporta o que fez.
- [ ] Erro de cota injetado pausa as filas e agenda o rearme sem cancelar trabalho.

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

