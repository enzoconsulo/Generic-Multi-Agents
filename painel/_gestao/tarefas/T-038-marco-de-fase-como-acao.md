---
id: T-038
titulo: Marco de fase como ação do painel — a última etapa do protocolo que faltava
projeto: painel-fabrica
status: concluida
prioridade: media
dependencias: [T-033]
areas: [servidor/src/acoes/acoes-projeto.ts, servidor/src/acoes/prompts/projeto/marco.md]
tentativas: 1
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Verificar o marco de uma fase por um botão, como o resto do protocolo.

## Contexto
Rodando o marco da Fase 1 do `ia-hibrida-limpa` hoje, foi a **única etapa do protocolo que
precisou ser despachada por fora do painel** — todas as outras já eram ação. Marco é
justamente o momento de decisão mais importante de uma fase (é o que autoriza promover as
tarefas da fase seguinte), e ficar dependente de o orquestrador lembrar de fazer à mão é o
mesmo problema que o painel existe para resolver.

## Critérios de aceite
- [x] Ação "Verificar marco" na seção de cuidado do projeto.
- [x] Descobre sozinha qual fase verificar (tarefas todas `concluida` e `Marco:` pendente);
      aceita recorte explícito por texto.
- [x] Verifica a META DA FASE, não os critérios já aprovados tarefa a tarefa.
- [x] Grava o resultado na linha `Marco:` do PLANO.md — é o que diz às próximas sessões
      que já rodou.
- [x] Reprovado com causa raiz única vira tarefa corretiva; múltiplas causas vão para o
      planejador.

## Notas de execução
Grupo `cuidado` com agente `testador` — e isso **quebra uma invariante que eu mesmo criei
na T-034**: o teste afirmava que toda ação de `cuidado` tem agente `orquestrador`. Aquilo
era verdade por acidente das duas ações que existiam, não uma regra. O que de fato importa
é a direção inversa — nenhuma ação de `especialista` pode ter agente `orquestrador`, senão
o título "Chamar um especialista" mente. Essa metade fica; a outra vira lista explícita de
ids, que é o que realmente barra membro entrando no grupo errado sem querer.

O prompt carrega as duas lições da execução de hoje: **não re-rodar os critérios de tarefa**
(é a meta da fase que está em julgamento) e **não mover a trave** — hoje havia um achado de
pesquisa fora do escopo da meta, e reprovar por ele teria sido o pior uso possível do marco.

## Verificação
Suíte: **305 (servidor, +1) + 88 (web)**, build limpo. Botão conferido AO VIVO com captura,
na seção "Cuidar deste projeto", entre "Conferir integridade" e "Atualizar progresso", com
agente `testador`.

**Disparado de verdade, e o teste foi a RECUSA.** O `ia-hibrida-limpa` acabou de ter a Fase
1 aprovada, então nenhuma fase se qualifica (a 2 e a 3 não têm nenhuma tarefa concluída). A
ação parou em **26s por US$ 0,13**, listou o estado das três fases, apontou a Fase 2 como a
mais próxima e disse o que falta — sem despachar o testador e sem escrever uma linha
(`git status` do projeto vazio depois).

Essa é a verificação que mais importava: a guarda contra medir fase incompleta. Se ela
falhasse, o modo de falha seria caro e silencioso — despachar o testador para julgar uma
meta que ninguém tentou entregar ainda, e possivelmente gravar `reprovado` num marco que
nunca deveria ter rodado.

Guardrails conferidos no job real: `watchdogMs 20min` e `maxTurns 100` — os da tabela, já
com a T-037 valendo.

## Revisão
Esta tarefa quebrou de propósito uma invariante que eu mesmo escrevi na T-034 ("toda ação
de `cuidado` tem agente `orquestrador`"). Reexaminada, aquilo era verdade por acidente das
duas ações que existiam, não uma regra: o que protege o usuário é a direção INVERSA —
nenhuma ação de `especialista` pode ter agente `orquestrador`, senão o título "Chamar um
especialista" mente. Essa metade continua no teste; a outra virou lista explícita de ids
por grupo, que é o que de fato barra membro entrando no grupo errado sem querer.

Vale registrar como lição: teste que afirma mais do que a regra real vira obstáculo na
primeira extensão legítima. O reflexo errado seria mover o `marco` para `especialista` só
para o teste continuar verde — e aí o botão ficaria na seção errada por causa de uma
asserção acidental.
