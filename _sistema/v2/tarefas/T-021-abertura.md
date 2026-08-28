---
id: T-021
titulo: ABERTURA da v0.3: conferir o plano contra o codigo que existe
projeto: fabrica-v2
versao: v0.3
status: backlog
prioridade: alta
dependencias: [T-020]
areas: [_gestao/PROGRESSO.md, _sistema/v2/tarefas]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Antes de implementar a v0.3, confrontar o planejamento com o codigo que a v0.1 e a v0.2
realmente produziram, e ajustar as tarefas desta versao onde a realidade divergiu do plano.
Nenhum codigo de producao e escrito nesta tarefa.

## Contexto
POR QUE ESTA TAREFA EXISTE: as 54 tarefas foram escritas de uma vez, em 28/08/2026, antes
de existir uma linha de codigo. As da v0.1 e v0.2 envelhecem pouco porque sao executadas
logo. Estas aqui vao ser executadas depois, sobre um codigo que ja tomou decisoes que o
planejamento nao podia prever. Ajustar aqui, de uma vez e com registro, e melhor que
improvisar tarefa a tarefa.

**Releia primeiro** (nesta ordem):
  - `_sistema/PLANO_V2.md`, secao 3, o bloco da v0.3
  - `_sistema/MIGRACAO_V2.md`, **secao 3** — os 19 mecanismos da v1 que nao estao na
    documentacao. A v0.3 e a versao que absorve a maior parte deles
  - `_sistema/DECISOES_FECHADAS.md` inteiro
  - `_gestao/PROGRESSO.md` — o veredito dos marcos da v0.1 e da v0.2

**Confira, item a item, e ajuste o que divergiu:**

  1. **O esquema real do banco** (T-002 executada) contra o que as tarefas desta versao
     assumem. Nome de coluna, nome de tabela e tipo de enum costumam mudar na hora de
     escrever a migracao. Se mudou, corrija o texto das tarefas — nao deixe a tarefa
     mentindo sobre o proprio banco.
  2. **A forma do estado do laco** (T-015) contra o que a transicao transacional precisa
     ler. Se o laco guarda o consumo de um jeito diferente do que a T-021 assume, decida
     agora qual dos dois muda.
  3. **O veredito do marco da v0.2 sobre o `MessagesAPI`.** Se ele NAO se justificou, o
     escalonamento de modelo desta versao mira o `ClaudeCLI` e a tarefa precisa dizer isso.
  4. **Abra o codigo da v1 que vai ser portado, ANTES de portar.** Sao quatro arquivos, e
     eles sao a fonte, nao a memoria de quem escreveu a tarefa:
     `pipeline/diagnostico.ts`, `pipeline/criterios.ts`, `pipeline/orcamento.ts`,
     `pipeline/maquina.ts`. Confira se os casos de teste de la estao cobertos pelos
     criterios das tarefas desta versao.
  5. **Os numeros que a v1 mediu** (tetos de voltas, custo padrao de tarefa) continuam
     valendo? Eles vieram de medicao naquele contexto; anote se algum precisa ser
     remedido depois.

**Registre em `_gestao/PROGRESSO.md`**: o que foi conferido, o que foi ajustado e por que.
Um ajuste sem justificativa registrada e indistinguivel de um desvio do plano — e e
exatamente isso que a banca vai perguntar.

Se nada precisou mudar, escreva isso tambem. "Conferido, nada divergiu" e informacao.

## Criterios de aceite
- [ ] Os cinco itens acima foram conferidos, um a um, com o resultado anotado.
- [ ] Toda tarefa da v0.3 que divergia do codigo real foi corrigida (ou registrado que nenhuma divergia).
- [ ] `_gestao/PROGRESSO.md` registra o que foi ajustado e a justificativa de cada ajuste.
- [ ] Nenhum codigo de producao foi alterado nesta tarefa.
      `verificar: git diff --stat HEAD~1 -- lib test`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

