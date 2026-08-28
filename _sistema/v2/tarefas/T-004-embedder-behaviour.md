---
id: T-004
titulo: behaviour Fabrica.Embedder e o adaptador Falso
projeto: fabrica-v2
versao: v0.1
status: backlog
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


## Verificacao


## Conformidade


## Revisao

