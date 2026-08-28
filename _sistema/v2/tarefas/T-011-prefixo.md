---
id: T-011
titulo: Montador do prefixo estavel, com pontos de cache
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-003, T-009, T-010]
areas: [lib/fabrica/prompt/prefixo.ex, lib/fabrica/prompt/bloco.ex, test/fabrica/prompt/prefixo_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Montar a parte estavel da requisicao — ferramentas, doutrina do papel e indice do projeto —
em blocos ordenados do mais estavel para o mais volatil, com no maximo quatro pontos de
cache marcados. E a alavanca de custo numero um da v2.

## Contexto
NUMERO QUE JUSTIFICA ESTA TAREFA, medido nos 27 jobs da v1 com contabilidade completa: a
leitura de cache ja e 93,14% dos tokens de entrada e a economia atual e ~80%. O que sobra
e a ESCRITA: 6,66% dos tokens carregando ~50% da conta, porque cada despacho e sessao nova
e sessao nova escreve prefixo novo (~21 por rodada). Transformar 21 escritas em 1–2 e o
premio. Ver `MIGRACAO_V2.md`, secao 1.

Ordem de montagem, imposta pela API e nao por convencao: `tools` -> `system` -> `messages`.
Um byte alterado invalida tudo o que vem DEPOIS dele. Logo, a ordem dos blocos e:

    1. ferramentas (identicas entre despachos do mesmo papel)   <- ponto de cache
    2. doutrina do papel (texto fixo do construtor/verificador) <- ponto de cache
    3. indice denso do projeto (o MAPA da T-010)                <- ponto de cache
    4. contexto especifico da tarefa                            (sem ponto — muda sempre)

Regras que o codigo tem de garantir, e cada uma vira teste:

- **Nada volatil nos blocos 1 a 3.** Sem data, sem contador, sem hash de commit, sem mapa
  serializado em ordem nao deterministica. Ordene TODA colecao antes de serializar.
- **No maximo 4 pontos de cache por requisicao** — a API rejeita mais.
- **Minimo cacheavel e POR MODELO e nao e monotonico:** 512 tokens no Opus 5, 1024 no
  Sonnet 5, **4096 no Haiku 4.5**. A fabrica roda o verificador em Haiku de proposito —
  um prefixo de verificador abaixo de 4096 tokens simplesmente NAO cacheia, sem aviso. O
  montador deve receber o modelo e avisar (log, nao erro) quando o prefixo ficar abaixo do
  minimo daquele modelo.
- **TTL de 1 hora nos blocos 1 a 3.** Escrita custa 2,0x em vez de 1,25x, mas sobrevive ao
  intervalo entre etapas — e a bateria de testes de um verificador leva minutos.

O TESTE QUE MAIS IMPORTA e o que monta o prefixo DUAS VEZES, em momentos diferentes, e
falha se os bytes divergirem. E ele que protege a economia inteira, e ele e a razao de o
`MessagesAPI` existir.

## Criterios de aceite
- [ ] Montar o prefixo duas vezes, em momentos diferentes, produz bytes IDENTICOS.
      `verificar: mix test test/fabrica/prompt/prefixo_test.exs`
- [ ] O montador nunca emite mais de 4 pontos de cache, mesmo com mais blocos.
      `verificar: mix test test/fabrica/prompt/prefixo_test.exs`
- [ ] Prefixo abaixo do minimo cacheavel do modelo alvo gera aviso em log com o numero do minimo.
      `verificar: mix test test/fabrica/prompt/prefixo_test.exs`
- [ ] Toda colecao serializada no prefixo e ordenada deterministicamente (teste com mapa embaralhado).
      `verificar: mix test test/fabrica/prompt/prefixo_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

