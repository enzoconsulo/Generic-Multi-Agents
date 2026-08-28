---
id: T-010
titulo: Gerador do indice denso do projeto (mix fabrica.mapa)
projeto: fabrica-v2
versao: v0.2
status: concluida
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
Feito em 2026-08-28. Commit do projeto: `783d13f`. 4 arquivos, 18 testes.

**O que foi feito.** `lib/fabrica/indice/mapa.ex` (extracao por AST e render),
`lib/mix/tasks/fabrica.mapa.ex`, 18 testes, e o `_gestao/MAPA.md` gerado e commitado.

**Extracao por AST, e cada caso em que o regex erraria tem teste proprio:** `def` dentro de
string, funcao com guarda, clausulas multiplas, `defp`, `@doc false` e `@moduledoc false`.
O caso da guarda merece nota: `when` embrulha o cabecalho numa tupla propria, e sem
desembrulhar **toda funcao com guarda sairia com aridade 2** — um indice que mente sobre a
interface, que e pior que indice nenhum.

**NADA DE CABECALHO VOLATIL.** O MAPA da v1 trazia hash do HEAD e data no topo, e isso
sozinho invalidaria o cache de todo despacho seguinte, sem erro e sem aviso. A v2 nao gera.
Provado nas duas pontas: por teste (duas geracoes com bytes identicos, mais ausencia de data
e de hash no conteudo) e **pelo caminho real**, com SHA-256 igual em duas execucoes seguidas
sobre a arvore da propria v2.

A ordem tambem e determinista, por nome de modulo e de simbolo. `Path.wildcard/1` nao promete
ordem estavel entre maquinas, e ordem instavel seria o cabecalho volatil de novo, so que
espalhado pelo arquivo inteiro em vez de concentrado no topo.

**ARMADILHA DO WINDOWS, medida antes de ser corrigida.** Os primeiros 14 de 18 testes
falharam com o mapa saindo VAZIO. Em vez de mexer no teste, medi: `Path.wildcard/1` devolve
`[]` para um padrao que contenha barra invertida, **mesmo com os arquivos existindo** — o
`File.ls!` do mesmo diretorio os lista normalmente. Como `System.tmp_dir!/0` e os caminhos
absolutos do Windows vem com barra invertida, qualquer chamada com raiz absoluta encontrava
zero modulos e gerava um mapa vazio sem erro nenhum. A raiz passou a ser normalizada.

E a mesma classe do `cmd /c mix` da T-007: **funcionaria num CI Linux e falha justamente na
maquina onde a v2 e desenvolvida.** Ja sao duas; vale esperar mais.

**UM ERRO MEU no teste, corrigido junto:** quatro chamadas escritas como
`raiz |> Mapa.extrair(raiz: raiz)`, que e `extrair/2` e nao existe.

**ACHADO SOBRE O ALVO DE TAMANHO, registrado sem ajuste.** A tarefa declara "alvo de
tamanho: ~5% do tamanho do fonte". Sobre o codigo real da v2 o mapa saiu em **9,6%**
(10.796 bytes para 112.622). Nao e defeito do gerador — e que os `@moduledoc` desta base sao
longos, e e a primeira linha deles que entra, junto com a de cada `@doc`. Nao mexi no alvo
nem no gerador: o numero fica registrado como esta, para a T-021 (abertura da v0.3) decidir
se o alvo era otimista ou se ha o que enxugar. Nao e criterio de aceite.

## Verificacao

**Criterio 1 — `mix fabrica.mapa` gera `_gestao/MAPA.md` com arvore, assinaturas e proposito
dos simbolos publicos.** `verificar: mix fabrica.mapa` → **exit 0**

    mapa gravado: ./_gestao/MAPA.md (10796 bytes)
    fonte: 112622 bytes — o mapa e 9.6%

O arquivo gerado tem a secao `## Arvore` com 22 fontes e a secao `## Modulos` com 118 linhas
de simbolo, cada uma no formato `` `nome/aridade` — proposito ``.

**Criterio 2 — duas geracoes seguidas sobre a MESMA arvore produzem bytes IDENTICOS.**
`verificar: mix test test/fabrica/indice/mapa_test.exs` → **exit 0**

    18 tests, 0 failures

Quatro testes cobrem a propriedade: bytes identicos entre duas geracoes; ausencia de data,
de hash de commit e da expressao "gerado em"; ordem de modulos independente do sistema de
arquivos; e ordem estavel dos simbolos dentro do modulo. Confirmado tambem no caminho real:

    1a geracao: 549D69F3AE2796F78391ED437A0A424B71891F35A3EBECACC671197141FFA7F3
    2a geracao: 549D69F3AE2796F78391ED437A0A424B71891F35A3EBECACC671197141FFA7F3

**Criterio 3 — um modulo com `@moduledoc false` nao aparece; um publico aparece com aridade
correta.** Mesmo arquivo. O teste `modulo com @moduledoc false NAO aparece` monta os dois
lado a lado e confere que o interno some (nome e simbolos) e o publico entra com
`visivel/0`. A aridade tem quatro testes proprios, incluindo o da guarda e o do `def` dentro
de string.

**Criterio 4 — `mix verificar` continua passando.** → **exit 0**

    257 mods/funs, found no issues.
    166 tests, 0 failures

## Conformidade


## Revisao
