---
id: T-005
titulo: Contabilidade em duas unidades: cota consumida e dolar-equivalente
projeto: fabrica-v2
versao: v0.1
status: concluida
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
Feito em 2026-08-28. Commit do projeto: `177061a`. 3 arquivos novos, 31 testes.

**O que foi feito.** `lib/fabrica/custo/precos.ex` com a tabela, os multiplicadores de cache
e as duas unidades; `lib/fabrica/custo/consumo.ex` como ponte entre o consumo relatado e a
linha do banco; 31 testes.

**A data da tabela sai em `conferido_em/0`,** e nao so num comentario, para o relatorio poder
cita-la. Preco velho SEM data e pior que preco ausente, porque parece atual.

**O TTL decide o multiplicador de escrita, e por isso ele e gravado na volta.** 1,25x com 5
minutos, 2,0x com uma hora. Sem o TTL na linha nao ha como saber depois qual aplicar, e a
conta vira chute: foi exatamente o que aconteceu na v1, que teve de INFERIR o multiplicador
comparando 12 jobs contra o custo real do SDK e chegou a "entre 1,25x e 2,0x, mais perto de
1,75x" — a assinatura de uma mistura dos dois TTLs.

**O resumo devolve a REPARTICAO, mais a fracao que a escrita representa da entrada.** Isto
nao e conveniencia de API: e o unico numero que justifica o `Operario.MessagesAPI`. A escrita
de cache e ~6,7% dos tokens e carrega ~50% da conta de entrada; um total esconderia
justamente isso. Ha um teste que reproduz essa forma (6,66% dos tokens dominando a conta) e
outro que trava a razao leitura:escrita em 14:1 — se ela cair na v2, o prefixo deixou de ser
estavel em algum lugar, e e regressao mesmo sem teste falhando.

**DECISAO: a unidade de cota e uma CONVENCAO DESTA FABRICA, e esta escrito assim no codigo.**
Nenhum fornecedor publica "unidades de cota", e inventar um numero com cara de oficial seria
o tipo de premissa que ninguem consegue conferir depois. A convencao: uma unidade = mil
tokens de entrada em Haiku; os outros modelos pesam proporcionalmente ao preco de entrada;
leitura de cache pesa 0,1x, como no dolar. Serve para comparar rodadas entre si, que e o uso
real.

**Modelo desconhecido devolve erro, nunca zero.** Zero silencioso e o pior desfecho possivel
aqui: soma sem aparecer, e a conta fecha errada parecendo certa. O resumo vai alem e diz
QUAIS modelos faltam, em vez de so recusar.

**Os apelidos longos do CLI (`claude-haiku-4-5-20251001`) ficam na tabela**, e nao espalhados
por quem chama, para "modelo sem preco" continuar significando "ninguem precificou" — e nao
"escrito de outro jeito".

**Sobre o terceiro `Consumo`.** Ja existiam `Fabrica.Operario.Consumo` (o relato, na
fronteira do fornecedor) e `Fabrica.Tarefas.Consumo` (o schema Ecto). `Fabrica.Custo.Consumo`
NAO define uma quarta struct de proposito: e so a conversao e a soma. Uma forma a mais do
mesmo dado seria um lugar a mais para os numeros divergirem. Esta escrito no `@moduledoc`
para nao ser "consertado" depois.

## Verificacao

**Criterio 1 — `Precos.estimar/1` aplica 0,1x na leitura e o multiplicador do TTL na
escrita.** `verificar: mix test test/fabrica/custo/precos_test.exs` → **exit 0**

    31 tests, 0 failures

Conferido com numeros redondos, um por teste: 1M de tokens de leitura em opus custa
US$ 0,50 (0,1 x 5,00); 1M de escrita com TTL de 1h custa US$ 10,00 (2,0 x 5,00); com TTL de
5 min, US$ 6,25 (1,25 x 5,00). E um teste com as quatro parcelas juntas em sonnet, somando
US$ 16,20.

**Criterio 2 — o resumo devolve a REPARTICAO (entrada cheia, leitura, escrita), nao so o
total.** Mesmo arquivo, bloco `resumo: a REPARTICAO, e nao so o total`. O teste
`devolve as quatro parcelas separadas` afirma cada uma; o teste
`expoe a fracao que a ESCRITA representa da conta de entrada` afirma
`fracao_escrita_da_entrada == 0.6667`; e `reproduz a forma da conta da v1` monta 6,66% dos
tokens em escrita e exige que ela domine mais de 40% da conta de entrada.

**Criterio 3 — modelo desconhecido devolve `{:erro, :modelo_sem_preco}` em vez de
silenciosamente contar zero.** Tres testes: em `estimar`, em `resumir` (que ainda lista os
modelos faltantes, `["modelo-a", "modelo-b"]`) e na ponte `para_registro`, que recusa gravar
em vez de gravar zero.

**Criterio 4 — `mix verificar` continua passando.** → **exit 0**

    194 mods/funs, found no issues.
    127 tests, 0 failures

## Conformidade


## Revisao
