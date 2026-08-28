---
id: T-005
titulo: Contabilidade em duas unidades: cota consumida e dolar-equivalente
projeto: fabrica-v2
versao: v0.1
status: backlog
prioridade: alta
dependencias: [T-002, T-003]
areas: [lib/fabrica/custo/precos.ex, lib/fabrica/custo/consumo.ex, test/fabrica/custo/precos_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Gravar, por VOLTA, os seis numeros de consumo e derivar deles as duas unidades que a v2
precisa: cota consumida (o que a operacao real gasta) e dolar-equivalente (o que a mesma
rodada custaria por API).

## Contexto
POR QUE DUAS UNIDADES, e isto e o achado que a v1 nao tem: a fabrica NAO paga por token —
ela consome cota (OAuth, assinatura, sem chave de API). Todo valor em dolar que a v1
registra e estimativa contabil, nao fatura. Sob o `Operario.ClaudeCLI` o que aperta e a
parede de cota; sob o `Operario.MessagesAPI` o que aperta e dinheiro. Ter as duas e o que
torna a Parte V do TCC honesta. Ver `DECISOES_FECHADAS.md`.

Tabela de precos por modelo (USD por milhao de tokens), com a data de conferencia no
cabecalho do arquivo — preco muda, e preco velho sem data e pior que preco ausente:

    opus-5      entrada 5   saida 25
    sonnet-5    entrada 2   saida 10
    haiku-4.5   entrada 1   saida 5

Multiplicadores de cache, conferidos na referencia da API: LEITURA 0,1x da entrada;
ESCRITA 1,25x com TTL de 5 minutos e 2,0x com TTL de 1 hora. Guarde o TTL usado na linha
de `consumos`, senao nao ha como saber qual multiplicador aplicar depois.

ARMADILHA MEDIDA NA v1, que este modulo precisa deixar visivel: a escrita de cache e ~6,7%
dos tokens e carrega ~50% da conta de entrada. Entao a funcao de resumo deve devolver a
reparticao (entrada cheia / leitura / escrita), nao so o total — e o teste deve travar
essa reparticao. Um total esconde exatamente o numero que decide o desenho.

## Criterios de aceite
- [ ] `Precos.estimar/1` calcula o custo de um `Consumo` aplicando 0,1x na leitura e o multiplicador do TTL na escrita.
      `verificar: mix test test/fabrica/custo/precos_test.exs`
- [ ] O resumo de um conjunto de consumos devolve a REPARTICAO (entrada cheia, leitura, escrita), nao so o total.
      `verificar: mix test test/fabrica/custo/precos_test.exs`
- [ ] Modelo desconhecido devolve `{:erro, :modelo_sem_preco}` em vez de silenciosamente contar zero.
      `verificar: mix test test/fabrica/custo/precos_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

