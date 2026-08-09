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

**NÃO escreva "a suíte continua passando" como critério executável.** A fábrica já roda a
suíte do projeto em TODA verificação, sozinha, com o comando do ecossistema — é o critério
implícito de `pipeline/criterios.ts`. Escrevê-lo à mão não acrescenta verificação nenhuma e
cria uma segunda chance de errar o comando: foi assim que a T-030 do banco-imobiliario
gastou 4 ciclos e US$ 12,90 num `node --test tests` que não roda naquela máquina, com o
deliverable correto desde o primeiro ciclo. Este exemplo abria a lista aqui, e por isso o
erro se repetia.

**Comando de verificação não se escreve de cabeça.** Copie o do projeto — `_gestao/ci.json`
(estágio `testes`), o `package.json`/`Makefile`/manifesto equivalente, ou o comando que as
outras tarefas do projeto já usam. Comando "quase certo" custa um ciclo inteiro.

- [ ] O arquivo de teste da tarefa existe e roda isolado.
      `verificar: node --test tests/<arquivo>.test.js`
- [ ] O endpoint responde 201 e grava no banco.
      `verificar: node --test tests/<arquivo>.test.js`
- [ ] (critério de julgamento — sem comando)

## Notas de execução


## Verificação


## Conformidade


## Revisão

