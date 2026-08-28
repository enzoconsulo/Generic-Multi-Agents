---
id: T-035
titulo: ABERTURA da v0.4: conferir concorrencia e numeros medidos
projeto: fabrica-v2
versao: v0.4
status: backlog
prioridade: alta
dependencias: [T-034]
areas: [_gestao/PROGRESSO.md, _sistema/v2/tarefas]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Antes de implementar a concorrencia, confrontar o plano com o que a v0.3 mediu de verdade —
e com o que as bibliotecas de fila e supervisao oferecem hoje. Nenhum codigo de producao.

## Contexto
**Releia:** `_sistema/PLANO_V2.md` (bloco da v0.4) e `_sistema/DECISOES_FECHADAS.md`,
especialmente o item sobre `git worktree` por verificador, que e uma otimizacao JA
DESCARTADA com medicao — nao a reinvente aqui.

**Confira e ajuste:**

  1. **Os custos que a v0.3 mediu de verdade.** O teto por tarefa e a estimativa da proxima
     foram escritos com numeros da v1. Agora existem numeros da v2. Se divergirem muito,
     corrija os defaults das tarefas desta versao — e registre os dois numeros lado a lado.
  2. **O paralelismo acontece de fato?** A v1 mediu que quase nunca havia duas tarefas
     despachaveis com `areas` disjuntas ao mesmo tempo: em 43 rodadas, o 3-wide de
     construtores nao ocorreu uma vez. Se o mesmo valer aqui, o valor desta versao esta na
     SUPERVISAO e na RECUPERACAO, nao na vazao — e a tarefa de paralelismo pode encolher.
     Meca antes de decidir.
  3. **A versao atual do Oban** e a API dela. Fila durable e area que muda entre versoes
     maiores; confira a documentacao corrente antes de escrever a migracao.
  4. **O formato da mensagem de cota do CLI.** A T-018 extraiu o horario de reabertura de um
     formato observado em 2026. Confirme que ele continua o mesmo — e, se nao, ajuste o
     parse ANTES de a v0.4 depender dele.
  5. **A memoria disponivel na maquina onde isto vai rodar.** Tres agentes em paralelo mais
     Postgres mais a suite de um projeto e o pico de consumo do sistema inteiro. Meca o
     pico real na v0.3 e decida o limite de concorrencia com esse numero, nao com o 3
     escrito no plano.

**Registre em `_gestao/PROGRESSO.md`** o que foi conferido, o que mudou e por que.

## Criterios de aceite
- [ ] Os custos medidos na v0.3 foram comparados com os defaults do plano, e os dois numeros estao registrados.
- [ ] Foi medido se o paralelismo de construtores acontece de fato, e a conclusao esta registrada.
- [ ] O formato da mensagem de cota do CLI foi reconferido contra a realidade atual.
- [ ] O limite de concorrencia foi decidido a partir do pico de memoria MEDIDO, nao do numero do plano.

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

