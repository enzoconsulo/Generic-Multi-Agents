---
id: T-008
titulo: Linha de base de medicao, extraida dos 139 jobs da v1
projeto: fabrica-v2
versao: v0.1
status: backlog
prioridade: alta
dependencias: [T-001]
areas: [prioridade/linha-de-base/extrair.exs, prioridade/linha-de-base/LINHA_DE_BASE.md, test/fabrica/linha_de_base_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Extrair dos jobs ja gravados pela v1 os numeros contra os quais a v2 vai ser comparada, e
grava-los num documento. Sem isso o TCC fecha numa afirmacao em vez de num resultado.

## Contexto
A tese da v2 e "nao precisa ser mais esperta, precisa ser mais dificil de operar errado".
Isso so vira resultado se existir numero comparavel — e a licao metodologica da v1 foi
exatamente essa: o documento de custo mediu com precisao o que sabia medir e ficou cego
para 78% da conta. Ver `_sistema/CUSTO_DE_CONTEXTO.md`, secao 8.

A evidencia ja esta NESTE repositorio e ler nao custa nada:
**`_sistema/v2/linha-de-base/jobs-v1/`** — 139 arquivos, congelados em 28/08, com a
contabilidade completa de cada job da v1. Leia o `LEIA-ME.md` ao lado antes: ele explica
por que a copia existe (o diretorio original e gitignored, entao um clone nao teria os
dados) e por que os `*.log.jsonl` ficaram de fora (transcricao completa = codigo dos
projetos, e este repositorio e publico).

Se voce estiver na maquina onde a v1 roda, `painel/dados/jobs/` tem tambem os
`*.log.jsonl`, com o detalhe por ETAPA. Use-os para os numeros 1 e 3 se estiverem
disponiveis, e declare no relatorio qual fonte foi usada para cada numero.

Quatro numeros:

1. **Proporcao de despacho desperdicado** — despachos cujo desfecho foi `agente-cortado`,
   reprovacao por interferencia, ou tarefa que girou sem incrementar `tentativas`. E a
   metrica que casa com a tese.
2. **Custo por tarefa concluida** — soma dos consumos dos ciclos de uma tarefa dividida
   pelas tarefas que chegaram a `concluida`.
3. **Contexto por despacho** — a v1 ja mediu a queda de 53,5k para 11–14k tokens; registre
   o numero atual.
4. **O que se perde ao matar um agente em voo** — quantos jobs terminaram sem `result` e,
   portanto, sem custo real gravado.

O script e Elixir (`.exs`) rodando com `mix run`, le o diretorio da v1 por parametro, e
GRAVA `LINHA_DE_BASE.md` com os numeros, a data e o caminho de onde saiu cada um. Numero
citado sem o arquivo de origem vira premissa que ninguem consegue conferir — foi
exatamente o que aconteceu com os "quatro testadores em fila" de 15/08.

O teste roda o extrator contra um diretorio de jobs FALSO, montado no proprio teste, e
confere que os quatro numeros saem certos. Nao dependa de os jobs da v1 estarem presentes.

## Criterios de aceite
- [ ] O extrator roda contra um diretorio de jobs falso e produz os quatro numeros corretos.
      `verificar: mix test test/fabrica/linha_de_base_test.exs`
- [ ] `LINHA_DE_BASE.md` e gerado com os numeros, a data e o caminho de origem de cada um (inspecionavel).
- [ ] O extrator nao falha quando um job nao tem contabilidade de tokens — ele conta e reporta quantos foram.
      `verificar: mix test test/fabrica/linha_de_base_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

