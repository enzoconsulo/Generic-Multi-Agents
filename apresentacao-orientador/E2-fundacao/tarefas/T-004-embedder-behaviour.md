---
id: T-004
titulo: behaviour Fabrica.Embedder e o adaptador Falso
projeto: fabrica-v2
versao: v0.1
status: concluida
prioridade: alta
dependencias: [T-001]
areas: [lib/fabrica/embedder.ex, lib/fabrica/embedder/falso.ex, test/fabrica/embedder/falso_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Definir o contrato `Fabrica.Embedder` e implementar `Embedder.Falso`, que produz vetores
deterministicos por hash — sem modelo, sem rede e sem custo.

## Contexto
Mesma doutrina do operario, e pelo mesmo motivo economico: o modelo de embedding local e a
UNICA peca pesada do desenho inteiro (centenas de MB a GB), e o perfil alvo declarado da v2
e 8 GB de RAM. Ver `DECISOES_FECHADAS.md`, "PERFIL ALVO DA v2".

    @callback vetorizar(textos :: [String.t()]) :: {:ok, [[float()]]} | {:erro, term()}
    @callback dimensoes() :: pos_integer()

`Embedder.Falso` gera o vetor a partir de `:erlang.phash2` do texto, expandido de forma
deterministica ate `dimensoes()` e normalizado. Duas propriedades que o teste precisa
travar: o MESMO texto sempre da o MESMO vetor, e textos diferentes dao vetores
diferentes. So isso ja permite testar a busca hibrida inteira da v0.5 sem carregar modelo
nenhum.

Fixe `dimensoes()` em 384 no `Falso` — e o tamanho de um embedding de sentence-transformer
pequeno, entao a troca para `Embedder.Local` na v0.5 nao muda o esquema do banco.

Sempre em lote (`[String.t()]`, nao `String.t()`): a ingestao da v0.5 vetoriza a historia
inteira do projeto ao commitar, e uma API de um-por-vez tornaria isso lento por desenho.

## Criterios de aceite
- [ ] O comportamento define `vetorizar/1` (em lote) e `dimensoes/0`.
- [ ] O mesmo texto produz sempre o mesmo vetor; textos diferentes produzem vetores diferentes.
      `verificar: mix test test/fabrica/embedder/falso_test.exs`
- [ ] `dimensoes()` devolve 384 e todo vetor gerado tem exatamente esse tamanho.
      `verificar: mix test test/fabrica/embedder/falso_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao
Feito em 2026-08-28. Commit do projeto: `7f61ccb`. 3 arquivos novos, 20 testes.

**O que foi feito.** `lib/fabrica/embedder.ex` com `vetorizar/1` (em lote) e `dimensoes/0`;
`lib/fabrica/embedder/falso.ex` com o adaptador por hash; 20 testes.

**Como o vetor e gerado, e por que assim.** A semente e `:erlang.phash2(texto)`, e cada
posicao vem de `phash2({semente, indice})` — o INDICE entra na conta de proposito. Sem ele,
todas as 384 posicoes seriam iguais: um vetor constante satisfaria "o mesmo texto da o mesmo
vetor" e seria inutil para qualquer ordenacao. E o modo mais facil de este adaptador estar
errado sem nenhum teste obvio falhar, entao ha um teste so para isso
(`o vetor nao e constante dentro de si`). O vetor sai normalizado para norma 1, que e o que
torna a distancia por cosseno do pgvector comparavel entre pares quaisquer.

**ESCOPO, e nao limitacao: o `Falso` NAO tem pretensao semantica.** Dois textos parecidos
produzem vetores distantes, e devem. Quem mede vizinhanca de verdade e a T-047, contra os
adaptadores reais. Se o `Falso` tentasse imitar semantica, a avaliacao de recuperacao
mediria o hash em vez do modelo. Deixei isso escrito no `@moduledoc` para nao ser "consertado"
depois.

**384 dimensoes fixas**, tamanho de sentence-transformer pequeno (familia MiniLM), para que
a troca por `Local` ou `Servico` na v0.5 nao mexa no esquema do banco: `vector(384)` continua
valendo.

**UM AVISO DE COMPILACAO MEU, corrigido.** A primeira versao de `normalizar/1` casava com
`0.0` num `case`. A partir do OTP 27 isso significa casar so com `+0.0`, e o compilador
avisa — o que reprovaria o `--warnings-as-errors` do `mix verificar`. Trocado por guarda
numerica (`if norma > 0`), que alem de nao ter a sutileza diz melhor o que se quer.

## Verificacao

**Criterio 1 — o comportamento define `vetorizar/1` (em lote) e `dimensoes/0`.**
INSPECIONADO e travado por teste: `o behaviour declara vetorizar/1 em lote e dimensoes/0`
afirma que `{:vetorizar, 1}` e `{:dimensoes, 0}` estao em
`Fabrica.Embedder.behaviour_info(:callbacks)`, e `Falso implementa o behaviour` confere o
atributo `:behaviour`. A assinatura recebe `[String.t()]`, nao `String.t()`.

**Criterio 2 — o mesmo texto produz sempre o mesmo vetor; textos diferentes produzem
vetores diferentes.** `verificar: mix test test/fabrica/embedder/falso_test.exs` →
**exit 0**

    20 tests, 0 failures

Determinismo coberto por tres testes (mesma chamada, lote x avulso, e o mesmo lote duas
vezes). Distincao por quatro, incluindo `cem textos distintos dao cem vetores distintos`
(`Enum.uniq` de 100) e o caso quase-igual (`"tarefa concluida"` x `"tarefa concluidas"`).

**Criterio 3 — `dimensoes()` devolve 384 e todo vetor gerado tem exatamente esse tamanho.**
Mesmo arquivo: `dimensoes devolve 384`, e
`todo vetor gerado tem exatamente 384 posicoes` sobre tres entradas de tamanhos muito
diferentes (`"a"`, `""` e um texto de 500 repeticoes). Ha ainda o teste de normalizacao
(norma 1, com `assert_in_delta` de 1.0e-9) e o de que todas as posicoes sao `float`.

**Criterio 4 — `mix verificar` continua passando.** → **exit 0**

    112 mods/funs, found no issues.
    68 tests, 0 failures

## Conformidade


## Revisao
