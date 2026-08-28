---
id: T-011
titulo: Montador do prefixo estavel, com pontos de cache
projeto: fabrica-v2
versao: v0.2
status: concluida
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
Feito em 2026-08-28. Commit do projeto: `2a3368a`. 3 arquivos, 24 testes.

**O que foi feito.** `lib/fabrica/prompt/bloco.ex` (o bloco e a serializacao determinista) e
`lib/fabrica/prompt/prefixo.ex` (a montagem, os pontos de cache e o aviso de minimo), com 24
testes.

**A ordem e imposta pela API, e nao por convencao.** Ferramentas, doutrina, indice, tarefa.
Um byte alterado invalida tudo o que vem DEPOIS dele, entao o mais estavel vem primeiro. O
bloco da tarefa vai por ultimo e **sem** ponto de cache: ele muda a cada despacho por
definicao, e marca-lo pagaria escrita todas as vezes sem nunca render leitura.

**Toda colecao e ordenada antes de serializar — e essa e a parte que silenciosamente
quebraria tudo.** Um mapa do Elixir nao promete ordem de iteracao estavel entre execucoes.
Uma unica chave fora de lugar troca os bytes do prefixo e erra o cache de todo despacho
seguinte, sem erro e sem aviso. Lista, ao contrario, **mantem** a ordem dada: nela a ordem E
a informacao, e ordena-la seria mudar o conteudo em vez de normaliza-lo.

**O minimo cacheavel e por modelo e nao e monotonico**, e e o detalhe mais traicoeiro desta
tarefa: 512 no Opus, 1024 no Sonnet, **4096 no Haiku**. A fabrica roda o verificador em Haiku
de proposito, e um prefixo de verificador abaixo de 4096 tokens **simplesmente nao cacheia,
sem aviso nenhum da API** — a escrita e paga e a leitura nunca vem. O montador recebe o
modelo e avisa. **Avisa, e nao recusa:** prefixo curto e ineficiente, nao invalido, e
derrubar o despacho por causa disso trocaria um desperdicio por um prejuizo maior.

**A estimativa de tokens esta declarada como estimativa** (~4 caracteres por token) e serve
so para decidir se vale avisar. A contagem que entra na contabilidade vem da resposta da
API, em `Fabrica.Custo.Precos` — nunca daqui. Um contador exato exigiria o tokenizador do
fornecedor.

**UM DEFEITO DE DESENHO QUE SO APARECEU AO ESCREVER O TESTE.** O criterio 2 pede "nunca mais
de 4 pontos de cache, **mesmo com mais blocos**". Mas a primeira versao aceitava exatamente
quatro especies, das quais so tres marcadas — ou seja, **era impossivel exceder o limite pela
API publica**, e a funcao que cortava o excedente era codigo inalcancavel. Um limite que nao
pode ser exercitado nao e limite, e um teste dele passaria por vazio.

O conserto foi na API, e nao no teste: entrou a chave `:blocos`, com blocos ja montados, que
sao mesclados na posicao da especie deles. Ela nao e invencao para satisfazer o teste — a
T-019 vai precisar dela para os pontos intermediarios da janela de 20 blocos. E ficou
EXPLICITA em vez de inferida da forma do valor: fazer `ferramentas: ["ler", "escrever"]`
virar dois blocos automaticamente seria adivinhacao, e o teste de determinismo passaria
enquanto o conteudo mudava de forma.

**Tres testes usam prefixo curto de proposito e disparavam o aviso**, poluindo a saida da
suite. Passaram por um helper que CAPTURA o log em vez de desligar o aviso — aviso desligado
para o teste ficar bonito nao avisa mais ninguem em producao. Mesmo tratamento dado na T-006.

## Verificacao

**Criterio 1 — montar o prefixo duas vezes, em momentos diferentes, produz bytes IDENTICOS.**
`verificar: mix test test/fabrica/prompt/prefixo_test.exs` → **exit 0**

    24 tests, 0 failures

O teste monta, espera, monta de novo e compara texto e numero de pontos. Ao lado dele, tres
outros protegem a mesma propriedade por outro angulo: ausencia de data/hash/contador no
texto, a ordem sendo a da API e nao a de insercao, e o prefixo montado a partir de mapas
embaralhados dando bytes iguais.

**Criterio 2 — o montador nunca emite mais de 4 pontos de cache, mesmo com mais blocos.**
Mesmo arquivo. O teste `com MAIS blocos marcados do que a API aceita` monta 10 blocos, 9
deles marcados, e confere `pontos_de_cache == 4` **e** que os 10 blocos continuam la — so a
marca e limitada, nunca o conteudo. Um segundo teste confere que quem perde a marca e o mais
VOLATIL, e nao o primeiro: o ponto vale mais no fim de um trecho estavel longo.

**Criterio 3 — prefixo abaixo do minimo cacheavel do modelo alvo gera aviso em log com o
numero do minimo.** Teste `prefixo curto gera AVISO com o numero do minimo`, que confere a
presenca de `4096`, de `haiku-4.5` e da frase `nao vai cachear` no log capturado. Ha ainda:
que o aviso e aviso (o prefixo curto continua sendo montado, com `cacheavel: false`); que
prefixo grande NAO gera aviso; e o teste que mostra o mesmo prefixo cacheando em Opus e nao
cacheando em Haiku.

**Criterio 4 — toda colecao serializada no prefixo e ordenada deterministicamente (teste com
mapa embaralhado).** Seis testes no bloco `toda colecao e ordenada antes de serializar`: mapa
embaralhado dando o mesmo texto, saida em ordem alfabetica de chave, keyword tratada como
mapa, mapa aninhado, o prefixo inteiro montado com mapa embaralhado, e o caso oposto — lista
preservando a ordem dada.

**Extra — `mix verificar` continua passando** → **exit 0**

    278 mods/funs, found no issues.
    190 tests, 0 failures

## Conformidade


## Revisao
