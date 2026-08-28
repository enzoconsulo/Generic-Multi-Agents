---
id: T-034
titulo: MARCO da v0.3: uma tarefa percorre os seis estados e conclui
projeto: fabrica-v2
versao: v0.3
status: backlog
prioridade: alta
dependencias: [T-030, T-031, T-032, T-033]
areas: [_gestao/PROGRESSO.md]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Verificar o marco: uma tarefa percorre os seis estados, reprova DE PROPOSITO, e retrabalhada
e conclui — com tudo registrado em transacao.

## Contexto
Tarefa de verificacao. A prova precisa ser adversarial: uma tarefa que passa de primeira
NAO prova a maquina de estados, prova so o caminho feliz.

Monte um projeto de teste com uma tarefa cujo criterio o construtor vai errar na primeira
tentativa (por exemplo, um criterio que exige uma mensagem de erro especifica). Rode o
pipeline inteiro e confira:

  1. a tarefa passou por `pronta -> em_execucao -> em_teste -> em_execucao -> ... -> concluida`;
  2. `tentativas` foi incrementado pelo SISTEMA, e bate com o numero de despachos;
  3. ha uma linha em `ciclos` por etapa, com os relatorios;
  4. o modelo SUBIU na segunda tentativa;
  5. o custo por ciclo e consultavel separadamente;
  6. o markdown gerado no git reflete o estado final.

Rode tambem o importador contra os projetos reais da v1 e confira que as 89 tarefas
entraram. Registre o numero.

## Criterios de aceite
- [ ] Uma tarefa percorre os seis estados, reprova de proposito, retrabalha e conclui.
- [ ] `tentativas` bate com o numero de despachos, e o modelo subiu na segunda tentativa.
- [ ] O custo de cada ciclo e consultavel separadamente (consulta registrada nas notas).
- [ ] O importador traz as 89 tarefas reais da v1; o numero esta registrado em `_gestao/PROGRESSO.md`.

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

