---
id: T-NNN
titulo:
projeto:
status: backlog
prioridade: media
dependencias: []
areas: []
tentativas: 0
# agente: <id>            (opcional — especialista da equipe que executa; vazio = construtor genérico)
# verificacao: rubrica    (opcional, trilha genérica — exige a seção `## Rubrica` abaixo)
# replanejada-de: T-NNN   (opcional — só em tarefas criadas por replanejamento)
criada: AAAA-MM-DD
atualizada: AAAA-MM-DD
---

## Objetivo


## Contexto


## Critérios de aceite
(comando + resultado esperado, nunca frase vaga)

Critério que uma MÁQUINA pode conferir leva, logo abaixo, uma linha indentada
`` `verificar: <comando>` ``. A fábrica executa esses comandos de graça, antes de
despachar o verificador, e anexa o resultado aqui — quem já falhou na passada mecânica
volta direto ao construtor, sem pagar um despacho para confirmar o óbvio.

A régua NÃO é "dá para automatizar", é **"a automação responde à MESMA pergunta"**.
`grep` que acha uma string no bundle não prova que a tela ficou boa. Critério de
julgamento fica sem comando, de propósito, e vai para o verificador.

- [ ] `npm test` roda a suíte inteira sem falha.
      `verificar: npm test`
- [ ] O arquivo de teste da tarefa existe e roda isolado.
      `verificar: node --test tests/<arquivo>.test.js`
- [ ] (critério de julgamento — sem comando)

## Notas de execução


## Verificação


## Conformidade


## Revisão

