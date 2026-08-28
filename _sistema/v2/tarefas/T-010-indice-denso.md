---
id: T-010
titulo: Gerador do indice denso do projeto (mix fabrica.mapa)
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-001]
areas: [lib/fabrica/indice/mapa.ex, lib/mix/tasks/fabrica.mapa.ex, test/fabrica/indice/mapa_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Porte do `mapa.mjs` da v1: um gerador DETERMINISTICO, sem modelo, que produz a arvore de
arquivos do projeto com a assinatura e o proposito de cada simbolo publico. E ele que vai
inteiro no prefixo do despacho.

## Contexto
E o mecanismo de maior retorno medido da v1: derrubou o contexto por despacho de 53,5 mil
para 11–14 mil tokens, com custo de modelo ZERO para gerar. Ver `MIGRACAO_V2.md`, secao 4.

Para um projeto Elixir, extraia por AST (`Code.string_to_quoted/2`), nunca por regex:
modulos, `@moduledoc` (primeira linha), `def`/`defmacro` publicos com aridade e a primeira
linha do `@doc`. Para outros ecossistemas, o parser entra depois — nesta tarefa o alvo e
Elixir, que e o que a propria v2 precisa.

ARMADILHA HERDADA, E ELA E A RAZAO DE ESTA TAREFA VIR ANTES DO PREFIXO: o MAPA da v1
trazia hash do HEAD e data no cabecalho, e isso sozinho invalidaria o cache de TODO
despacho seguinte, sem erro e sem aviso. A v1 conserta isso removendo o cabecalho volatil
na hora de montar o contexto (`contexto/montador.ts`, `semCabecalhoVolatil`). A v2 nao
deve gerar o cabecalho volatil — o metadado de geracao sai para um arquivo ao lado, ou
nao existe. **O conteudo do MAPA precisa ser byte a byte identico entre duas geracoes
sobre a mesma arvore**, e isso e criterio de aceite abaixo.

Grave em `_gestao/MAPA.md`. Alvo de tamanho: ~5% do tamanho do fonte.

## Criterios de aceite
- [ ] `mix fabrica.mapa` gera `_gestao/MAPA.md` com arvore, assinaturas e proposito dos simbolos publicos.
      `verificar: mix fabrica.mapa`
- [ ] Duas geracoes seguidas sobre a MESMA arvore produzem bytes IDENTICOS (sem data, sem hash, sem contador).
      `verificar: mix test test/fabrica/indice/mapa_test.exs`
- [ ] Um modulo com `@moduledoc false` nao aparece no mapa; um publico aparece com aridade correta.
      `verificar: mix test test/fabrica/indice/mapa_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

