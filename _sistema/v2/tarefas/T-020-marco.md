---
id: T-020
titulo: MARCO da v0.2: uma tarefa resolvida, e o prefixo escrito uma vez
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-016, T-017, T-018, T-019]
areas: [_gestao/PROGRESSO.md]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Verificar os DOIS marcos da v0.2: um agente resolve uma tarefa real de ponta a ponta com
custo por volta gravado; e o prefixo do projeto e escrito uma vez e lido pelos despachos
seguintes.

## Contexto
Tarefa de verificacao — nada de codigo novo.

**Marco 1.** Escolha uma tarefa real e pequena num projeto de verdade (crie um projeto de
teste com 3 arquivos, se preciso). Despache um agente com `Operario.ClaudeCLI`. Confira:
a tarefa foi resolvida, ha uma linha em `consumos` por volta, e a soma bate com o total.

**Marco 2, e e este que decide se o `MessagesAPI` se justifica.** Rode DOIS despachos
seguidos no mesmo projeto com `Operario.MessagesAPI` e compare:

    despacho 1: cache_creation_input_tokens alto,  cache_read_input_tokens ~zero
    despacho 2: cache_creation_input_tokens ~zero, cache_read_input_tokens alto

Se o segundo despacho tambem escrever o prefixo, ha invalidador silencioso — e o
diagnostico e diffar os bytes do prefixo entre as duas requisicoes ate achar o que mudou.

Este marco CUSTA DINHEIRO de verdade (e o unico ponto do plano que usa chave de API).
Estime antes, declare o teto, e rode com o prefixo menor possivel que ainda passe do minimo
cacheavel. Registre o gasto real em `_gestao/PROGRESSO.md` ao lado do veredito.

Compare tambem contra a linha de base da T-008: a v1 grava ~50% da conta de entrada em
escrita de cache. Se a v2 nao melhorar isso, o `ClaudeCLI` fica como padrao e o
`MessagesAPI` volta para a prateleira — o que e uma resposta legitima, e precisa estar
escrita.

## Criterios de aceite
- [ ] Um agente resolve uma tarefa real e ha uma linha de consumo por volta, com soma batendo com o total.
- [ ] Dois despachos seguidos no mesmo projeto: o segundo LE o prefixo em vez de escrever (numeros registrados).
- [ ] O gasto real do marco 2 esta registrado em `_gestao/PROGRESSO.md`, com o teto declarado antes.
- [ ] O veredito compara com a linha de base da T-008 e diz explicitamente se o `MessagesAPI` se justifica.

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

