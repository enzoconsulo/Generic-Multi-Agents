---
id: T-043
titulo: O bloco de contexto recuperado, com a fonte citada
projeto: fabrica-v2
versao: v0.5
status: backlog
prioridade: alta
dependencias: [T-041, T-011]
areas: [lib/fabrica/memoria/contexto.ex, test/fabrica/memoria/contexto_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Montar, no inicio do despacho, o bloco com os melhores trechos recuperados — cada um com a
fonte citada — e coloca-lo DEPOIS do prefixo cacheado.

## Contexto
O ganho concreto e o agente comecar o trabalho ja sabendo "isto foi decidido assim, por este
motivo", em vez de decidir de novo, possivelmente ao contrario do que ja esta no codigo. E a
resposta direta ao segundo modo de falha da Parte I: decisao sem rastro.

ONDE ESTE BLOCO ENTRA IMPORTA MAIS DO QUE PARECE: ele muda a cada tarefa, entao vai DEPOIS
do ultimo ponto de cache. Coloca-lo antes invalidaria o prefixo inteiro a cada despacho — e
seria uma otimizacao de contexto que destroi a economia de cache, exatamente o tipo de troca
que a v2 existe para nao fazer.

Cada trecho entra com a fonte (`arquivo, secao`) para o agente poder citar e para o leitor
poder conferir. Trecho sem fonte e afirmacao sem rastro, que e o problema que estamos
resolvendo.

Teto de tamanho declarado: no maximo 8 trechos e um limite de bytes. Recuperacao que enche o
contexto piora a resposta em vez de melhorar.

QUANDO NAO USAR, e isto vai no cabecalho do modulo: busca semantica e aproximada e devolve
trechos, nao verdades. Nao substitui o indice denso (exato, completo, gratis), nao substitui
ler o arquivo que a tarefa declara tocar, e nao responde o que uma consulta ao banco responde
melhor — "quais tarefas estao bloqueadas" e um WHERE, nao uma pergunta em linguagem natural.

## Criterios de aceite
- [ ] O bloco entra DEPOIS do ultimo ponto de cache; o prefixo continua byte a byte igual entre despachos.
      `verificar: mix test test/fabrica/memoria/contexto_test.exs`
- [ ] Cada trecho recuperado vem com a fonte (arquivo e secao) citada.
      `verificar: mix test test/fabrica/memoria/contexto_test.exs`
- [ ] O bloco respeita o teto de 8 trechos e o limite de bytes.
      `verificar: mix test test/fabrica/memoria/contexto_test.exs`
- [ ] Recuperacao vazia produz despacho normal, sem bloco, em vez de bloco vazio.
      `verificar: mix test test/fabrica/memoria/contexto_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

