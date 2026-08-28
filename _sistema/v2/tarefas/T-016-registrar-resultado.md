---
id: T-016
titulo: A ferramenta registrar_resultado, e a ausencia da de mudar estado
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-002, T-015]
areas: [lib/fabrica/ferramentas/registrar_resultado.ex, test/fabrica/ferramentas/registrar_resultado_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
A unica forma de um agente reportar o que fez: uma chamada estruturada que o sistema grava
na transacao. E a garantia, testada, de que nao existe ferramenta de mudar status para
agente nenhum.

## Contexto
Esta e a decisao 6.2 de `MIGRACAO_V2.md`, e ela generaliza uma regra que a v1 ja tinha
pago para descobrir: o protocolo da v1 marca `ultima-reprovacao: # NAO ESCREVA. Campo do
MOTOR`. O sistema conta; o agente nao.

`registrar_resultado` recebe: o que foi feito, arquivos alterados, comandos rodados, hash
do commit, e (opcional) impedimento declarado. Grava em `ciclos.relatorio`. **Nao aceita
campo de status, nem de tentativas.** Se o agente mandar, e ignorado com aviso — nunca
aceito em silencio.

O teste que mais importa aqui e NEGATIVO: varrer o catalogo de ferramentas de todo papel e
falhar se qualquer uma permitir escrever em `tarefas.status` ou `tarefas.tentativas`. E o
equivalente, em codigo, da ausencia da ferramenta de escrever no revisor — impossibilidade,
nao regra pedida.

E lembre o motivo economico: hoje o agente gasta VOLTAS lendo o arquivo da tarefa e
reescrevendo secoes dele. Uma chamada estruturada e uma volta. Volta e o termo dominante
da conta.

## Criterios de aceite
- [ ] `registrar_resultado` grava o relatorio no ciclo corrente, dentro de uma transacao.
      `verificar: mix test test/fabrica/ferramentas/registrar_resultado_test.exs`
- [ ] Campo de status ou de tentativas enviado pelo agente e IGNORADO, com aviso registrado.
      `verificar: mix test test/fabrica/ferramentas/registrar_resultado_test.exs`
- [ ] Teste negativo: nenhuma ferramenta de nenhum papel permite escrever status ou tentativas.
      `verificar: mix test test/fabrica/ferramentas/registrar_resultado_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

