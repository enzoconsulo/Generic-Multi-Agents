---
id: T-038
titulo: Recuperacao apos queda: sobras na arvore git e trabalho parcial
projeto: fabrica-v2
versao: v0.4
status: backlog
prioridade: alta
dependencias: [T-031, T-034]
areas: [lib/fabrica/recuperacao.ex, test/fabrica/recuperacao_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Na subida, sanear o que a sessao anterior deixou pela metade: tarefas em estado
transitorio, e trabalho nao commitado na arvore de arquivos.

## Contexto
Duas fontes de verdade para a recuperacao, e a documentacao do TCC nomeia as duas:
"reconstroi o mundo lendo o banco E o git".

**Pelo banco:** tarefa em `em_execucao`, `em_teste` ou `em_revisao` sem despacho vivo no
`Registry` esta orfa. Devolva ao estado anterior com motivo registrado.

**Pela arvore git:** existe alteracao nao commitada nas `areas` de alguma tarefa orfa?
Entao houve trabalho real que nao entrou em commit. Porte `temTrabalhoParcial` da v1.
Recupere commitando o escopo daquela tarefa, com mensagem marcando que e recuperacao — em
vez de descartar. A v1 tem esse mecanismo e ele deixou de disparar uma vez, custando
US$ 2,13 de trabalho jogado fora.

Reporte SEMPRE o que foi saneado, mesmo quando nada foi. Saneamento silencioso e como nao
ter saneamento: ninguem descobre que ele parou de funcionar.

## Criterios de aceite
- [ ] Tarefa em estado transitorio sem processo vivo volta ao estado anterior, com motivo.
      `verificar: mix test test/fabrica/recuperacao_test.exs`
- [ ] Alteracao nao commitada nas `areas` de tarefa orfa e recuperada em commit marcado como recuperacao.
      `verificar: mix test test/fabrica/recuperacao_test.exs`
- [ ] O saneamento reporta o que fez mesmo quando nao havia nada a fazer.
      `verificar: mix test test/fabrica/recuperacao_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

