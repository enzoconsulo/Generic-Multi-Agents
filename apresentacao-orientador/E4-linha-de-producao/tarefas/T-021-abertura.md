---
id: T-021
titulo: "ABERTURA da v0.3: conferir o plano contra o codigo que existe"
projeto: fabrica-v2
versao: v0.3
status: concluida
prioridade: alta
dependencias: [T-020]
areas: [_gestao/PROGRESSO.md, _sistema/v2/tarefas]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-09-15
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
- [x] Os cinco itens acima foram conferidos, um a um, com o resultado anotado.
- [x] Toda tarefa da v0.3 que divergia do codigo real foi corrigida (ou registrado que nenhuma divergia).
- [x] `_gestao/PROGRESSO.md` registra o que foi ajustado e a justificativa de cada ajuste.
- [x] Nenhum codigo de producao foi alterado nesta tarefa.
      `verificar: git diff --stat HEAD~1 -- lib test`

## Notas de execucao
BLOQUEADA em 2026-09-13 pelo orquestrador, antes de gastar despacho — pelos mesmos dois motivos
que bloquearam a T-035 em 09/09:

1. FORA DO CONFINAMENTO. Manda reler `_sistema/PLANO_V2.md`, `_sistema/MIGRACAO_V2.md`,
   `_sistema/DECISOES_FECHADAS.md` e o codigo da v1 em `painel/`, e declara `_sistema/v2/tarefas`
   como area — tudo na raiz da fabrica, fora de `projetos/fabrica-v2/`. O agente nao le o que a
   tarefa manda reler, e o que escrevesse la nao entraria no commit.
2. FORA DE HORA. E a ABERTURA da v0.3, e a v0.3 ja foi construida e teve o marco aprovado (T-034;
   o 4o criterio foi para a T-034b). Conferir "o plano contra o codigo" agora e retrospectiva.

Alem disso, o item 3 ("o veredito do marco da v0.2 sobre o `MessagesAPI`") so tera resposta no fim
do plano: o marco 2 saiu da T-020 para a T-020c em 13/09 (`_gestao/DECISOES.md`, D-002).

A T-035, que tinha o mesmo problema, foi feita no chat pelo orquestrador a pedido do Enzo em 13/09.
Esta pode seguir o mesmo caminho, ser reescrita como retrospectiva dentro do projeto, ou ser
cancelada — decisao dele. A T-034b depende desta so como marcador; o bloqueio real dela e a copia
do corpus da maquina 1.

### Feita no chat pelo orquestrador, a pedido do Enzo (2026-09-15), como CONFERENCIA

O Enzo escolheu o mesmo caminho da T-035 ("assumir no chat"). Sem codigo de producao, sem despacho
gasto: tudo conferido a partir do disco — as sete migracoes de `priv/repo/migrations/`, os modulos
`Fabrica.Agente.Estado`, `Tarefas.Transicao`, `Fila.Trabalho`, `Orcamento`, `Cota`, e os quatro
arquivos da v1 em `painel/servidor/src/pipeline/` com as suas suites (que so o orquestrador alcanca,
por estarem fora do confinamento do agente).

**Resultado, item a item, em `_gestao/PROGRESSO.md`, secao v0.3, "Retrospectiva da T-021".** Em
resumo: (1) esquema real bate com o que as tarefas assumiam — nada a corrigir; (2) o estado do laco
e a transicao transacional combinam (`consumos` por volta, uma transacao so) — nenhum dos dois muda;
(3) o veredito do `MessagesAPI` **nao existe e nao vai existir ate a T-020c** (D-002) — e a v0.3 nao
depende dele, porque o escalonamento decide modelo, nao provedor; (4) os quatro arquivos da v1 estao
portados e cobertos, com UMA divergencia deliberada registrada (o orcamento da v1 espera agente em
voo; na v2 essa regra vive em `Fabrica.Cota`, e o orcamento so decide antes do despacho); (5) os
numeros da v1 nao valem mais, e a T-035 ja mediu os novos (default 7,82 vs mediana 10,34) — entrada
da T-049.

**Sobre o 2o criterio:** nenhuma tarefa da v0.3 foi corrigida, e nao por omissao — T-022 a T-034
estao concluidas e passaram pelo marco, entao corrigir o texto delas nao mudaria codigo nenhum.
"Conferido, nada divergiu que ja nao esteja registrado" e o resultado, e esta escrito.

**4o criterio (nenhum codigo de producao alterado):** o commit desta tarefa toca apenas `_gestao/`.

**Consequencia:** a T-034b deixa de esperar a T-021. O impedimento dela continua sendo o corpus da
v1, que nao esta nesta maquina — segue em `backlog`, agora com um bloqueio so, e do Enzo.

## Verificacao


## Conformidade


## Revisao

