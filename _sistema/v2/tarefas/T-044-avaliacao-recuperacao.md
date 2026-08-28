---
id: T-044
titulo: Avaliacao da qualidade da recuperacao
projeto: fabrica-v2
versao: v0.5
status: backlog
prioridade: alta
dependencias: [T-041]
areas: [prioridade/avaliacao/perguntas.exs, test/fabrica/memoria/avaliacao_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Um conjunto de perguntas com resposta conhecida, medido a cada mudanca na indexacao — e a
regra de que recuperacao pior que a linha de base nao entra no prompt.

## Contexto
E a resposta ao risco declarado nos documentos: "a busca por significado trazer trecho
inutil". Busca aproximada devolve trechos, e trecho fora de contexto piora a resposta em vez
de melhorar. Sem medicao, ninguem percebe a degradacao.

Monte de 15 a 25 pares (pergunta, trecho que deveria ser recuperado) a partir da historia
REAL dos projetos da v1 — decisoes que existem, com vocabulario diferente do que a decisao
usa. Exemplo do tipo certo: pergunta "como tratamos comando perigoso?" deve recuperar a
decisao escrita como "allowlist de binarios, nunca lista de proibicoes".

Meca `recall@8` e a posicao media do trecho certo. Grave a linha de base.

A regra que fecha o mecanismo, e que e a diferenca entre sensor e atuador: se uma mudanca na
indexacao piorar o resultado abaixo da linha de base, a recuperacao NAO entra no prompt —
a fabrica roda sem ela ate alguem consertar. Sensor que nao aciona nada e o defeito
recorrente que a v1 catalogou sete vezes.

## Criterios de aceite
- [ ] O conjunto tem ao menos 15 pares extraidos da historia real, e `recall@8` e calculado.
      `verificar: mix test test/fabrica/memoria/avaliacao_test.exs`
- [ ] A linha de base fica gravada e e comparada a cada execucao.
      `verificar: mix test test/fabrica/memoria/avaliacao_test.exs`
- [ ] Recuperacao abaixo da linha de base DESLIGA o bloco de contexto, em vez de so avisar.
      `verificar: mix test test/fabrica/memoria/avaliacao_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

