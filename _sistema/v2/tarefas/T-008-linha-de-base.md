---
id: T-008
titulo: Linha de base de medicao, extraida dos 139 jobs da v1
projeto: fabrica-v2
versao: v0.1
status: concluida
prioridade: alta
dependencias: [T-001]
areas: [priv/linha-de-base/extrair.exs, priv/linha-de-base/LINHA_DE_BASE.md, test/fabrica/linha_de_base_test.exs]
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
Feito em 2026-08-28. Commit do projeto: `7bc8a8b`. 4 arquivos, 15 testes.

**Os quatro numeros, sobre os 139 jobs congelados:**

    1. despacho desperdicado ..... 20,94%  (49 de 234)
    2. custo por tarefa concluida  US$ 7,8241  (47 tarefas)
    3. contexto por ida ao modelo  88.191 tokens
    4. jobs sem `result` ......... 22  (15,83%)

**A LOGICA MORA EM `lib/`, e nao no `.exs`.** O `areas:` da tarefa lista so o script, mas
codigo em `.exs` solto nao e compilado com o projeto — Credo, Dialyzer e a suite nunca o
veriam. Esta fabrica existe justamente para mover regra para onde a maquina confere, entao
deixar o miolo fora do alcance dos cinco estagios contrariaria a propria tese. O `.exs`
continua sendo a porta de entrada que a tarefa pede (`mix run priv/linha-de-base/extrair.exs`).

**O DIVISOR DO NUMERO 3 CUSTOU DUAS TENTATIVAS ERRADAS, e as duas ficaram registradas** no
comentario do codigo, no relatorio gerado e num teste — porque o proximo a mexer nisso vai
tropecar no mesmo lugar:

1. **Dividir pelo campo `despachos` deu ZERO**, e o numero saiu `nil`. Medi a fonte para
   entender: **nenhum** dos 139 jobs tem contabilidade de tokens *e* o campo `despachos` ao
   mesmo tempo. Os 27 com tokens sao todos `tipo: "claude"`; os 58 com `despachos` sao todos
   `tipo: "pipeline"`, e nenhum deles traz tokens nesta copia congelada.
2. **Contar "um job `claude` = um despacho" deu 4,6 MILHOES de tokens por despacho.** Um job
   `claude` nao e um despacho: e a sessao inteira do orquestrador, e o numero e a soma de
   todas as idas ao modelo. Numero absurdo numa linha de base de TCC e pior que numero
   ausente — foi so por ser absurdo que eu o peguei.

O que a fonte permite de verdade sao dois denominadores honestos: `numTurnos` (quantas vezes
o modelo foi chamado) e as `voltas` por agente (chamadas de ferramenta). Ficaram com esses
nomes.

**A SECAO 3 DO RELATORIO MUDOU DE TITULO, de proposito.** Ela se chama "Contexto por ida ao
modelo", e diz em letras claras que **nao e** o "contexto por despacho" da v1. Aquele exige
os `*.log.jsonl`, que nao vieram nesta copia (sao transcricao de agente, e o repositorio e
publico — esta no `LEIA-ME.md` da linha de base). A queda de 53,5k para 11–14k e **citada**
de `_sistema/CUSTO_DE_CONTEXTO.md` secao 8, e nao recalculada. Chamar 88.191 de "contexto por
despacho" e compara-lo com 11–14k produziria uma conclusao falsa e espetacular.

**A licao metodologica ficou embutida no proprio extrator.** Ele devolve e imprime
`jobs_sem_contabilidade` (112 de 139) em vez de calcular a media sobre os 27 e apresenta-la
como se fosse do todo — que e exatamente a cegueira que o documento de custo da v1 teve ao
medir com precisao o que sabia medir e perder 78% da conta. E diretorio vazio devolve
`{:erro, :nenhum_job}`, nao uma medicao de zeros: media de nada e um numero que PARECE
resposta.

## Verificacao

**Criterio 1 — o extrator roda contra um diretorio de jobs falso e produz os quatro numeros
corretos.** `verificar: mix test test/fabrica/linha_de_base_test.exs` → **exit 0**

    15 tests, 0 failures

O teste `saem certos sobre um diretorio conhecido` monta tres jobs (um saudavel, um cortado
com 3 despachos em voo, um girando sem incrementar tentativas) e confere os quatro numeros
com valores calculados a mao: 5 desperdicados de 10 despachos (50%), US$ 4,00 / 2 tarefas =
US$ 2,00, e nenhum job sem `resultado`. O divisor do numero 3 tem teste proprio, com os dois
erros descritos no comentario.

**Criterio 2 — `LINHA_DE_BASE.md` e gerado com os numeros, a data e o caminho de origem de
cada um.** INSPECIONADO. 91 linhas em `priv/linha-de-base/LINHA_DE_BASE.md`, geradas por

    mix run priv/linha-de-base/extrair.exs ../../_sistema/v2/linha-de-base/jobs-v1

Cabecalho: `**Extraida em 2026-08-28**` e
`**Fonte:** ../../_sistema/v2/linha-de-base/jobs-v1 — 139 jobs lidos`. Cada uma das quatro
secoes traz o valor, o divisor usado e a ressalva que ele exige; a secao 3 traz as duas
tentativas descartadas.

**Criterio 3 — o extrator nao falha quando um job nao tem contabilidade de tokens; ele conta
e reporta quantos foram.** Mesmo arquivo. `job sem contabilidade de tokens nao quebra o
extrator` confere `jobs_com_contabilidade: 1` e `jobs_sem_contabilidade: 1`. Na fonte real:
**112 de 139 sem contabilidade**, impresso na saida e no relatorio. Ha ainda testes para JSON
invalido (ignorado sem derrubar) e para arquivo que nao e `.json` (nem olhado).

**Criterio 4 — `mix verificar` continua passando.** → **exit 0**

    173 mods/funs, found no issues.
    96 tests, 0 failures

## Conformidade


## Revisao
