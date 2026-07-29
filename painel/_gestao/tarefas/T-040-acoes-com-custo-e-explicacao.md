---
id: T-040
titulo: Toda ação diz o que vai fazer, o que escreve e quanto custa — antes do clique
projeto: painel-fabrica
status: pronta
prioridade: alta
dependencias: []
areas: [servidor/src/acoes/acoes-projeto.ts, web/src/componentes/ExplicaAcao.tsx]
tentativas: 0
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Nenhum botão do painel disparado no escuro: antes de clicar dá para saber o que acontece,
o que é alterado no disco e quanto tende a custar.

## Contexto
Pedido do usuário: *"todas as ações opções e botões devem ser extremamente claros e nítidos
em qual o gasto esperado, qual a ação a ser executada e o que será feito, nem que seja em
um botão toggle ao lado clicável que explica o que será feito em uma janelinha ao lado"*.

Hoje o cartão tem uma frase de resumo e um selo de peso (leve/médio/pesado) que só faz
sentido para quem conhece a tabela interna. O usuário não sabe, sem clicar: se a ação
ESCREVE alguma coisa, o que ela escreve, e quanto custou da última vez.

E já há dado real para isso: as ações rodaram de verdade hoje, com custo medido por
execução — dá para mostrar o custo OBSERVADO em vez de só a estimativa qualitativa.

## Critérios de aceite
- [ ] Cada ação declara: o que faz, o que ESCREVE no disco, e o que nunca toca.
- [ ] Explicação abre num toggle ao lado do botão, sem sair da página nem abrir o formulário.
- [ ] Custo esperado em dinheiro, não só "leve/médio/pesado".
- [ ] Quando já houve execução daquela ação naquele projeto, mostrar o custo REAL da última.
- [ ] Ação que escreve fica visivelmente distinta da que só lê.

## Notas de execução
O custo observado sai do histórico de jobs que a T-036 já cruza por projeto — é dado que
o painel tem e não usa. Estimativa qualitativa continua como fallback para ação nunca
executada ali.

## Verificação


## Revisão
