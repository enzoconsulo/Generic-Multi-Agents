---
id: T-047
titulo: Avaliacao da qualidade da recuperacao
projeto: fabrica-v2
versao: v0.5
status: concluida
prioridade: alta
dependencias: [T-044, T-063, T-064]
areas: [priv/avaliacao/perguntas.exs, test/fabrica/memoria/avaliacao_test.exs]
tentativas: 2
criada: 2026-08-28
atualizada: 2026-09-25
---

## Objetivo
Um conjunto de perguntas com resposta conhecida, medido a cada mudanca na indexacao — e a
regra de que recuperacao pior que a linha de base nao entra no prompt.

## Contexto
E a resposta ao risco declarado nos documentos: "a busca por significado trazer trecho
inutil". Busca aproximada devolve trechos, e trecho fora de contexto piora a resposta em vez
de melhorar. Sem medicao, ninguem percebe a degradacao.

Monte de 15 a 25 pares (pergunta, trecho que deveria ser recuperado) a partir da historia
REAL dos projetos da v1 — decisoes que existem, com vocabulario diferente do que a decisao
usa. Exemplo do tipo certo: pergunta "como tratamos comando perigoso?" deve recuperar a
decisao escrita como "allowlist de binarios, nunca lista de proibicoes".

Meca `recall@8` e a posicao media do trecho certo. Grave a linha de base.

A regra que fecha o mecanismo, e que e a diferenca entre sensor e atuador: se uma mudanca na
indexacao piorar o resultado abaixo da linha de base, a recuperacao NAO entra no prompt —
a fabrica roda sem ela ate alguem consertar. Sensor que nao aciona nada e o defeito
recorrente que a v1 catalogou sete vezes.

## Criterios de aceite
- [ ] O conjunto tem ao menos 15 pares extraidos da historia real, e `recall@8` e calculado.
      `verificar: mix test test/fabrica/memoria/avaliacao_test.exs`
- [ ] A linha de base fica gravada e e comparada a cada execucao.
      `verificar: mix test test/fabrica/memoria/avaliacao_test.exs`
- [ ] Recuperacao abaixo da linha de base DESLIGA o bloco de contexto, em vez de so avisar.
      `verificar: mix test test/fabrica/memoria/avaliacao_test.exs`

## Notas de execucao

### Ciclo 1 (executor, 2026-09-25)

Teste escrito junto com o desenho do formato (nao havia formato prévio a testar antes de existir
— caso "exploracao cujo formato de saida ainda nao esta definido" do meu proprio protocolo), mas
visto vermelho antes de fechar: rodei `mix test` contra o modulo ainda inexistente e so depois
escrevi `priv/avaliacao/perguntas.exs`.

**Por que so ha DOIS arquivos, e onde mora a logica.** As `areas` desta tarefa nao incluem
nenhum arquivo em `lib/` — de proposito, ver D-005 item 3 ("a T-047 e o instrumento", a fusao
fica na T-065). Como nada em `lib/` chama `Fabrica.Memoria.Contexto.montar/3` ainda (conferido:
`grep -rn "Contexto\." lib/` so acha o proprio modulo — a integracao com despacho e das T-066 a
T-070, D-006), a logica inteira desta tarefa — gabarito, medicao, linha de base e o atuador —
mora em `priv/avaliacao/perguntas.exs`, como o modulo `Fabrica.Memoria.Avaliacao` (o `@moduledoc`
la explica a decisao com mais detalhe). Nao virou lib/ porque isso estaria fora das `areas`
declaradas, e a tarefa nao pediu wiring com despacho — so o instrumento provado.

**O gabarito (`Avaliacao.gabarito/0`, 21 pares).** Extraido da historia REAL desta propria
fabrica-v2, nao inventado: cada `frase_alvo` foi CONFERIDA por grep contra `_gestao/tarefas/*.md`,
`DECISOES.md`, `GUIA.md` e `PROGRESSO.md` antes de entrar na lista (17 das perguntas do gabarito
python da D-004, `_gestao/pesquisas/2026-09-13-ollama-embedding-bench.py`, ainda batiam
literalmente; 5 tinham mudado de texto desde 13/09 e foram descartadas ou trocadas por variantes
confirmadas — ex.: "Sensor que nunca dispara e indistinguivel de sensor quebrado" nao existe mais
neste texto, "decisao do operador nao e reprovacao da tarefa" sim). Corpus real na ingestao:
1.097 trechos de 92 arquivos (89 tarefas + GUIA/DECISOES/PROGRESSO), medido nesta maquina.

**Por que a linha de base e CALCULADA (busca so por palavra), nao um numero congelado.** A D-005
item 4 achou que fundir com um vetor FRACO fica abaixo do BM25 sozinho — por isso
`Avaliacao.linha_de_base/2` roda a MESMA consulta textual (`ts_rank_cd`/`plainto_tsquery`) que a
metade textual de `Busca.buscar/3`, ao vivo, contra o corpus atual. Um numero fixo apodreceria a
cada trecho novo — o mesmo defeito que a D-007 corrigiu no "89" cravado da T-034b. "Grava" e
"compara a cada execucao" (criterio 2) quer dizer isto: reproduzivel a qualquer momento contra o
estado real do banco, documentado no `@moduledoc` do modulo.

**Medido nesta arvore, com `Embedder.Falso` (a suite roda sem rede — marco v0.1):**

| | recall@8 | posicao media |
|---|---|---|
| hibrido (`Busca.buscar/2`, vetor sem semantica) | 0,048 (1 de 21) | 2,0 |
| so palavra (linha de base) | 0,048 (1 de 21) | 1,0 |

Os dois empataram nesta medicao especifica — nao ficou estritamente abaixo, o que so prova que
`Embedder.Falso` nao piora SEMPRE a fusao (RRF com um canal-ruido nem sempre derruba o outro
canal). Por isso o teste do ATUADOR (abaixo) nao depende deste empate: ele usa um buscador
deliberadamente ruim (sempre `[]`) contra a MESMA linha de base real (que acha >0 no corpus,
travado num teste dedicado), o que prova o desligamento sem depender de o vetor de teste ganhar
ou perder por sorte numa medicao — a real medicao com o Ollama (semantica de verdade) fica para
quem rodar um probe fora da suite, no molde do `priv/probes/ollama_real.exs` (T-064); nao criei
esse probe aqui porque nao esta nas `areas` desta tarefa.

**O atuador (`Avaliacao.montar_contexto_seguro/3`).** Mede o buscador dado (padrao:
`Busca.buscar/2`) contra o gabarito, mede a linha de base no mesmo projeto e devolve `nil`
quando a recuperacao fica abaixo — em vez de montar `Contexto.montar/3` mesmo assim. Ninguem
chama esta funcao em `lib/` ainda (nao ha despacho real que monte contexto — D-006); ela e o
PONTO que as T-066 a T-070 devem usar no lugar de `Contexto.montar/3` direto. Rodar o gabarito
inteiro a cada chamada e caro para despacho real (uma consulta por par) — cache do veredito fica
para quem ligar isto ao despacho, registrado no `@moduledoc` como pendencia explicita.

**Testes (`avaliacao_test.exs`, 8 casos):**
- gabarito tem 15-25 pares, todos com pergunta e frase-alvo nao vazias;
- `medir/2` e `linha_de_base/2` calculam sobre o corpus REAL ingerido (`Ingestao.processar/3`
  lendo `_gestao/tarefas/*.md` + os 3 documentos do disco, nunca escrevendo neles);
- a linha de base acha pelo menos uma resposta certa no corpus real (pre-condicao do teste
  seguinte, travada isoladamente para nao mascarar um gabarito que parou de bater);
- o atuador desliga com um buscador ruim contra a linha de base real;
- `abaixo_da_linha_de_base?/2` isolado, nas tres direcoes (maior, menor, empate — empate NAO
  desliga, por decisao: recall igual a linha de base nao e regressao);
- o atuador MANTEM o bloco quando a recuperacao bate a linha de base (buscador perfeito
  sintetico, projeto vazio onde o piso fica em zero).

**Decisao registrada, nao testada por numero fixo:** optei por NAO afirmar uma relacao fixa
(`<=`, `<`) entre o hibrido real e o piso real no teste do corpus REAL — os dois numeros vao
mudar a cada tarefa nova em `_gestao/tarefas/`, e travar uma comparacao exata seria o mesmo erro
que a D-007 corrigiu (teste que passa ou falha pelo motivo errado conforme o corpus cresce). Os
testes de comportamento do atuador usam buscadores CONTROLADOS (vazio / perfeito) para não
dependerem da sorte de uma medicao especifica.

`mix format`, `mix credo --strict priv/avaliacao/perguntas.exs test/fabrica/memoria/avaliacao_test.exs`
(14 mods/funs, sem achados), `mix compile --warnings-as-errors --force` (limpo) e LF confirmado
nos dois arquivos (`grep -c $'\r'` = 0).

**Nao rodei** `mix verificar` nem a suite completa (papel do testador, T-063 registrou a mesma
decisao pelo mesmo motivo: agentes paralelos na mesma arvore geram falha falsa). Rodei so
`mix test test/fabrica/memoria/avaliacao_test.exs` e `mix compile --warnings-as-errors --force`.

**Achado ambiental, corrigido antes de comecar (nao e desta tarefa):** o banco de teste estava
num estado inconsistente (`especialistas` ja existia com `criar_projetos` marcada `down` nas
migracoes) — sem nenhum processo `beam.smp`/`erl` rodando no momento (conferido via `tasklist`),
entao era residuo de uma execucao anterior interrompida, nao concorrencia. Resolvido com
`MIX_ENV=test mix ecto.drop && mix ecto.create && mix ecto.migrate` antes de rodar os testes
desta tarefa.

**Reproduzir:**
```
mix test test/fabrica/memoria/avaliacao_test.exs
```
(precisa do Postgres no ar; usa `Embedder.Falso`, sem rede, como o resto da suite.)

**Commit:** `24b6983`

### Planejador, 2026-09-15 — dependencias novas (D-004 / D-005), e o que mudou de insumo

**Nao ha ciclo gasto aqui: a tarefa nunca rodou.** O que mudou foi o que existe para ela usar.

**1. Por que ela ganhou dependencias, e por que o `status` precisa voltar a `backlog`.** Ela estava
`pronta` dependendo so da T-044, e nao conseguiria cumprir o proprio Objetivo assim: a suite roda
com `Embedder.Falso`, que e hash, e o `@moduledoc` dele diz a frase inteira — "dois textos parecidos
NAO produzem vetores proximos, e nao devem. Quem precisa de vizinhanca semantica de verdade e a
T-047". Medir recall com ele e medir o hash, nao o modelo. `dependencias` passou a
`[T-044, T-063, T-064]`: o contrato com tipo de texto (documento x consulta, sem o qual a qualidade
medida na D-004 nao se reproduz) e o embedder local ligado e provado contra o servico real.
**O planejador nao move status de tarefa alheia — quem despromove para `backlog` e o orquestrador.**

**2. O corpus existe, e nao precisa esperar o Enzo.** O Contexto manda montar os pares "a partir da
historia REAL dos projetos da v1", e a v1 segue bloqueada (T-034b, esperando o `projetos/` da
Maquina 1). Nao espere por isso: o `_gestao/` DESTA fabrica-v2 e historia real, com o mesmo
protocolo de secoes, e ja foi usado como corpus de verdade — **2.814 trechos de 79 arquivos**, na
medicao de 15/09.

**3. O gabarito ja esta escrito, e foi medido.** As 23 perguntas em portugues, cada uma com a frase
literal que identifica o trecho certo (e de proposito com vocabulario diferente do trecho), estao no
script `_gestao/pesquisas/2026-09-13-ollama-embedding-bench.py`. Reaproveite-as em vez de inventar
outras: elas ja tem numero de referencia, o que transforma esta tarefa de "montar e medir" em
"portar e comparar". Os numeros a bater, medidos na placa com `embeddinggemma`:

| | recall@8 | recall@1 | MRR |
|---|---|---|---|
| so palavra (BM25) | 0,565 (13 de 23) | 0,087 | 0,264 |
| so vetor | **0,652 (15 de 23)** | **0,391** | **0,480** |
| hibrido (RRF k=60) | 0,652 (15 de 23) | 0,261 | 0,403 |

Divergencia entre o numero daqui e o do bench e ESPERADA — la o BM25 e o RRF eram Python, aqui sao
`plainto_tsquery`/`ts_rank_cd`/`RANK()` em SQL. Registre a diferenca em vez de ajustar o codigo ate
os numeros baterem.

**4. A linha de base compara com a busca por PALAVRA.** A medicao de 13/09 mostrou que fundir com um
vetor fraco fica ABAIXO do BM25 sozinho: a regra "recuperacao abaixo da linha de base desliga o
bloco" precisa ter o BM25 como piso, nao so a versao anterior do vetor.

**5. O que NAO e desta tarefa:** escolher entre vetor puro e hibrido. Isso e a **T-065**, que depende
desta — primeiro o medidor, depois a medicao dos tres modos, depois a escolha do padrao. Ver D-005,
decisao 3.

**6. Sobre o quarto criterio (`mix verificar`).** A fabrica ja roda a bateria do projeto em toda
verificacao, sozinha; o criterio nao acrescenta prova e cria uma segunda chance de errar o comando.
Ele fica como esta (nao ha ciclo gasto para justificar reescrever criterio), mas nao invente
trabalho para ele.

**2026-09-15 — devolvida para `backlog` pelo orquestrador.** Ela estava `pronta` medindo
recuperacao SEMANTICA com `Embedder.Falso`, que e hash: o medidor mediria ruido determinístico. O
planejador achou isso ao decompor a D-004 e ajustou `dependencias` para `[T-044, T-063, T-064]`;
so faltava o status, que e do orquestrador. Volta a `pronta` sozinha quando a T-064 concluir.

Nao e atraso: e a mesma tarefa, agora com o instrumento certo — e com corpus, gabarito e numeros de
referencia ja prontos na pesquisa (`_gestao/pesquisas/2026-09-13-ollama-embedding-local.md`), o que
a transforma de "montar e medir" em "portar e comparar".

### Ciclo 2 (executor, 2026-09-25)

Corrigido EXATAMENTE o achado `[importante]` do revisor (Ciclo 1) — nada mais foi tocado.

**O bug.** `Avaliacao.medir/2` passava o retorno do `buscador` direto para
`posicao_do_alvo/2` → `Enum.find_index/2`. Quando o buscador padrao (`Busca.buscar/2`) falha —
Ollama fora do ar, D-004 — ele devolve `{:erro, {:vetorizacao_da_consulta, motivo}}` (contrato
documentado em `lib/fabrica/memoria/busca.ex:50-52`), nao uma lista. `Enum.find_index/2` numa
tupla levanta `Protocol.UndefinedError` (tupla nao implementa `Enumerable`), derrubando o
processo chamador — o oposto do que a tarefa pede ("roda sem o bloco... em vez de so avisar").

**Visto vermelho antes de corrigir.** Escrevi os dois casos abaixo primeiro e rodei
`mix test test/fabrica/memoria/avaliacao_test.exs`: ambos falharam com
`** (Protocol.UndefinedError) protocol Enumerable not implemented for Tuple`, reproduzindo
exatamente o cenario apontado na Revisao (stacktrace batendo com
`priv/avaliacao/perguntas.exs:184: posicao_do_alvo/2` → `medir/2` → `montar_contexto_seguro/3`).

**A correcao.** Uma clausula nova em `posicao_do_alvo/2`
(`priv/avaliacao/perguntas.exs`, antes da clausula generica): `{:erro, _motivo}` conta como
"pergunta nao encontrada" (devolve `nil`, como quando nenhum trecho bate), em vez de ser
repassada a `Enum.find_index/2`. Isso deriva o `recall_at_8` para baixo quando o buscador falha
— exatamente o sinal que `abaixo_da_linha_de_base?/2` usa para desligar o bloco em
`montar_contexto_seguro/3`. Nao mudei nenhuma outra funcao nem o contrato publico.

**Testes novos (`avaliacao_test.exs`, describe "medir/2 e montar_contexto_seguro/3 — buscador
que devolve {:erro, motivo}"):**
- `medir/2` com um buscador que sempre devolve `{:erro, ...}` termina com `recall_at_8 == 0.0`
  e `posicao_media == nil`, sem lançar excecao;
- `montar_contexto_seguro/3`, com o corpus REAL ingerido (piso > 0, mesma garantia do teste
  "a linha de base... acha pelo menos uma resposta certa") e um buscador que sempre devolve
  `{:erro, ...}`, devolve `nil` — o atuador desliga em vez de quebrar. Total: 10 casos (eram 8).

`mix format`, `mix credo --strict priv/avaliacao/perguntas.exs test/fabrica/memoria/avaliacao_test.exs`
(15 mods/funs, sem achados), `mix compile --warnings-as-errors --force` (limpo) e LF confirmado
nos dois arquivos via PowerShell (`[System.IO.File]::ReadAllBytes` — CR=0; o `grep -c $'\r'` do
Ciclo 1 media outra coisa nesta maquina, confirmado contando linhas com `wc -l`: os numeros
batiam exatamente).

**Nao rodei** `mix verificar` nem a suite completa — mesma decisao do Ciclo 1 (papel do
testador). Rodei so `mix test test/fabrica/memoria/avaliacao_test.exs` (10 tests, 0 failures,
~27s) e `mix compile --warnings-as-errors --force`.

**Reproduzir:**
```
mix test test/fabrica/memoria/avaliacao_test.exs
```
(precisa do Postgres no ar — confirmado nesta rodada com `mix run -e 'Fabrica.Repo.query("select 1")'`.)

### Ciclo 3 (executor reforcado, 2026-09-25)

**Causa raiz da reprovacao (uma frase):** a correcao do Ciclo 2 fechou o crash so DENTRO de
`medir/2`, mas o proprio atuador `montar_contexto_seguro/3` continuava quebrando o processo
chamador quando o buscador erra E o piso textual e zero — o achado `[importante]` do revisor
nao estava totalmente fechado.

**Onde o Ciclo 2 deixou o buraco.** `montar_contexto_seguro/3` so devolve `nil` pela via
`abaixo_da_linha_de_base?/2` (`atuais.recall_at_8 < piso.recall_at_8`). Num projeto SEM corpus
indexado o piso textual (`buscar_so_texto/2`) tambem e `0.0`; com o buscador padrao
(`&Busca.buscar/2`) errando por Ollama fora do ar, `atuais.recall_at_8` tambem e `0.0`. Entao
`0.0 < 0.0` e FALSO, o atuador cai no ramo `else` e chama `Contexto.montar(projeto_id, termo,
buscador: buscador)` com o MESMO buscador que erra. `Contexto.montar/3` (`lib/`, fora das
`areas`) repassa o retorno a `Contexto.formatar/1` → `Enum.take({:erro, _}, 8)` →
`Protocol.UndefinedError`, derrubando quem chamou — o oposto do que a tarefa pede, exatamente o
cenario que o revisor descreveu ("Ollama cai, buscador padrao").

**Visto vermelho antes de corrigir.** Escrevi o caso novo `montar_contexto_seguro/3 nao quebra
quando o buscador erra E a linha de base tambem e zero` (projeto vazio + buscador que sempre
devolve `{:erro, ...}`) e rodei o arquivo: falhou com
`** (Protocol.UndefinedError) protocol Enumerable not implemented for Tuple`, stacktrace batendo
em `lib/fabrica/memoria/contexto.ex:82` (`Enum.take/2` dentro de `formatar/1`) via o ramo `else`
de `montar_contexto_seguro/3` — a prova de que o buraco existia.

**A correcao (so em `priv/avaliacao/perguntas.exs`, sem tocar `lib/`).** Nova funcao privada
`blindar/1`: envolve o buscador antes de passa-lo a `Contexto.montar/3`, traduzindo `{:erro,
_motivo}` em `[]`. Assim `Contexto.formatar([])` devolve `nil` (bloco vazio) em vez de quebrar —
a fabrica roda SEM o bloco tambem neste canto, honrando o contrato "roda sem o bloco, nunca
quebra quem chamou". `Contexto.montar/3` esta em `lib/`, fora das `areas` desta tarefa, entao a
blindagem foi feita no lado do atuador, que e area. Nenhuma outra funcao ou contrato publico
mudou; a clausula do Ciclo 2 em `posicao_do_alvo/2` continua intacta.

**Escopo aproveitado x refeito.** Nada foi refeito: toda a entrega dos Ciclos 1 e 2 foi
mantida. Acrescentei 1 funcao privada (`blindar/1`) e 1 teste de regressao (total: 11 casos,
eram 10). Ataquei so o que o revisor apontou.

`mix format` (OK), `mix credo --strict priv/avaliacao/perguntas.exs
test/fabrica/memoria/avaliacao_test.exs` (16 mods/funs, sem achados), `mix compile
--warnings-as-errors --force` (limpo) e LF confirmado nos dois arquivos via PowerShell
(`ReadAllBytes` — CR=0).

**Nao rodei** `mix verificar` nem a suite completa — papel do testador (mesma decisao dos ciclos
anteriores; agentes paralelos na mesma arvore geram falha falsa). Rodei so
`mix test test/fabrica/memoria/avaliacao_test.exs` (11 tests, 0 failures, ~31s).

**Reproduzir:**
```
mix test test/fabrica/memoria/avaliacao_test.exs
```
(precisa do Postgres no ar — confirmado UP em 127.0.0.1:5432 nesta rodada.)

**Commit:** `b1a22f9`

### Ciclo 4 (executor reforcado, 2026-09-25)

**Causa raiz da reprovacao (uma frase):** a reprovacao foi MECANICA e NAO e do T-047 — os tres
criterios substantivos passam; so `mix verificar` falhou, e falhou em testes FORA das `areas`
desta tarefa (breakage pre-existente do repo), que estou confinado de tocar.

**Nenhum codigo mudado neste ciclo.** O entregavel do T-047 (`priv/avaliacao/perguntas.exs` +
`test/fabrica/memoria/avaliacao_test.exs`) esta correto e completo desde o Ciclo 3. Este ciclo e
diagnostico: reexecutei, isolei a falha e concluo que ela nao tem conserto DENTRO das `areas`.

**O que a passada mecanica reprovou.** Os 3 criterios diretos (`mix test
test/fabrica/memoria/avaliacao_test.exs`) passaram. So o 4o criterio (`mix verificar`) falhou, com
1 falha em `test/fabrica/ferramentas/confinamento_test.exs:141` (`escape 3`) mais um
`Postgrex.Protocol disconnected` no log da mesma rodada — NENHUM dos dois em `priv/avaliacao/` ou
`test/fabrica/memoria/`.

**Medido nesta rodada (arvore em HEAD; unica mudanca no working tree e este .md):**
- `mix test test/fabrica/memoria/avaliacao_test.exs` → **11 tests, 0 failures** (o entregavel do
  T-047 esta verde).
- `mix test test/fabrica/ferramentas/confinamento_test.exs` isolado → **29 tests, 0 failures**. A
  falha da passada mecanica e FLAKY: o `escape 3` cria uma juncao com `mklink /J`, que sob a carga
  paralela do `mix verificar` (max_cases: 16, 8 GB de RAM, + o Postgrex caido no mesmo log)
  intermitentemente falha; `mklink /J` funciona nesta maquina (conferido a mao).
- `mix verificar` reexecutado por mim → **1 falha, em OUTRO teste**:
  `test/fabrica/memoria/busca_test.exs:242` (confinamento passou desta vez). Ou seja, a suite tem
  MAIS de um teste fora do T-047 pingando vermelho sob carga.
- `mix test test/fabrica/memoria/busca_test.exs` isolado → **6 tests, 1 failure**: `busca_test:242`
  falha DETERMINISTICAMENTE, sozinho. E o `describe "buscar/3 — o termo e vetorizado pelo caminho
  de CONSULTA"`, adicionado pela **T-063** (`1e1fc75`), que exercita `lib/fabrica/memoria/busca.ex`
  — fora das `areas` do T-047. A busca hibrida devolve so o trecho da consulta e NAO inclui o
  trecho-documento (linha 265: `assert trecho_documento in ...` falha; `resultado` tem 1 item).
- Banco de teste conferido: `mix ecto.migrations` → todas as 8 migracoes `up` (nao e o residuo de
  banco obsoleto do Ciclo 1; a falha do busca_test e logica, nao de schema).

**Por que nao corrijo e por que isto e um BLOQUEIO, nao um remendo.** As `areas` do T-047 sao
`priv/avaliacao/perguntas.exs` e `test/fabrica/memoria/avaliacao_test.exs`. As falhas do
`mix verificar` estao em `busca_test.exs`/`busca.ex` (T-063) e `confinamento_test.exs` — fora das
`areas`. O guarda de commit recusa mudanca fora das `areas` da tarefa: tocar nesses arquivos
reprovaria o T-047 para sempre por confinamento (defeito ja catalogado). O 4o criterio
(`mix verificar continua passando`) e, para o T-047, IMPOSSIVEL de satisfazer enquanto a suite
global estiver vermelha por codigo de OUTRA tarefa — e o proprio planejador ja registrou (Notas,
2026-09-15, item 6) que esse criterio "nao acrescenta prova e cria uma segunda chance de errar",
porque a fabrica ja roda a bateria sozinha.

**Recomendacao ao orquestrador (esta conclusao vem do executor reforcado):** o T-047 esta pronto;
o que bloqueia e o repo estar globalmente vermelho. Duas frentes, ambas fora do T-047:
1. `busca_test.exs:242` (T-063) falha deterministicamente e precisa de uma tarefa/fix propria em
   `lib/fabrica/memoria/busca.ex` — e o bloqueador real e reproduzivel.
2. `confinamento_test.exs` e flaky sob a carga do `mix verificar` nesta maquina de 8 GB; passa
   isolado. Vale reduzir `max_cases` na bateria ou marcar o teste como nao-async — de novo, fora
   das `areas` do T-047.
   Aprovar o T-047 pelos seus 3 criterios substantivos (todos verdes) e endereçar a suite global
   por essas frentes e o caminho que nao gasta a ultima tentativa num remendo que o confinamento
   recusa.

**Escopo aproveitado x refeito:** 100% aproveitado, 0% refeito, 0 linha de codigo nova. Ciclo
puramente de diagnostico — a causa da reprovacao estava fora do que o T-047 pode tocar.

### Planejador, 2026-09-25 — replanejamento: causa raiz não é da T-047, 4º critério cai

**Confirmo o diagnóstico do Ciclo 4 e vou além.** Os três critérios substantivos já estavam
verdes desde antes (testador Ciclo 2: PASSOU nos 5 itens, `mix verificar` incluso; revisor
Ciclo 1: "Conformidade: cumpre" nos quatro). A reprovação veio de uma passada mecânica
SEGUINTE, sem modelo, que achou o 4º critério vermelho por um teste fora das `areas`.

**Medido de novo por este replanejamento:** `mix test` completo, 4 rodadas nesta máquina — 2
vermelhas (sempre `busca_test.exs:242`, nunca outro teste), 2 verdes; isolado (6 seeds
diferentes), `busca_test.exs` nunca falhou. Ou seja, ao contrário do que o Ciclo 4 concluiu,
`busca_test.exs:242` **não é determinístico** — é flaky como `confinamento_test.exs`, só que
com falha mais rara em isolamento porque não tentei o suficiente antes.

**Causa provável, registrada em D-008:** `test/mix/backup_test.exs` (módulo `:precisa_pg_dump`,
que roda nesta máquina porque tem `pg_dump`) chama `Backup.restaurar/1`, que executa
`pg_restore --clean --if-exists` **contra o banco de teste compartilhado, ao vivo** — o próprio
arquivo já documenta que isso invalida o cache de tipo (`citext`/`vector`) de conexões vivas do
pool e só corrige a própria conexão do teste. Isso explica os dois sintomas com uma causa só:
`confinamento_test.exs` é `async: true` (pode estar em voo durante o restore);
`busca_test.exs` roda na mesma fase síncrona, adjacente no tempo, com a pool recém-mexida. Não
é papel do planejador consertar código — a causa vai para a **T-072**.

**Decisão:** removido o 4º critério ("`mix verificar` continua passando") — já estava
sinalizado como redundante na nota de 2026-09-15 (item 6, "não acrescenta prova e cria uma
segunda chance de errar o comando"), e foi exatamente essa segunda chance que travou a tarefa.
Os três critérios restantes não são reabertos. `tentativas` volta a 0 (mesmo tratamento do
D-006: causa fora do controle do executor não consome tentativa); `status` não é movido por
este planejador.

### Ciclo 5 (executor, 2026-09-25)

**Nao havia nada a corrigir.** O replanejamento anterior (nota "Planejador, 2026-09-25 —
replanejamento") ja confirmou o diagnostico do Ciclo 4 e removeu o 4o criterio
(`mix verificar continua passando`), que era o unico vermelho — e vermelho por causa alheia
a esta tarefa (D-008: `pg_restore --clean --if-exists` ao vivo em `test/mix/backup_test.exs`
invalidando o cache de tipo de conexoes do pool, derrubando `confinamento_test.exs` e
`busca_test.exs` de forma flaky). Os tres criterios que restam no arquivo (linhas 37-42) sao
exatamente os que ja estavam verdes desde o Ciclo 1/2: `priv/avaliacao/perguntas.exs` e
`test/fabrica/memoria/avaliacao_test.exs` nao mudaram desde o commit `b1a22f9` (Ciclo 3).

**Reexecutei para confirmar, sem tocar em codigo:**
- `mix test test/fabrica/memoria/avaliacao_test.exs` → **11 tests, 0 failures** (~34,5s), com
  o Postgres conferido no ar antes (`Fabrica.Repo.query("select 1")` → `{:ok, ...}`).
- `mix format --check-formatted priv/avaliacao/perguntas.exs test/fabrica/memoria/avaliacao_test.exs`
  → OK.
- `mix credo --strict priv/avaliacao/perguntas.exs test/fabrica/memoria/avaliacao_test.exs` →
  16 mods/funs, sem achados.

`git status` confirma zero diferenca no working tree antes desta edicao — nenhuma linha de
`priv/avaliacao/perguntas.exs` ou de `test/fabrica/memoria/avaliacao_test.exs` foi tocada
neste ciclo.

**Reproduzir:**
```
mix test test/fabrica/memoria/avaliacao_test.exs
```
(precisa do Postgres no ar; usa `Embedder.Falso`, sem rede, como o resto da suite.)

**Commit:** ver `b1a22f9` (Ciclo 3) — entregavel de codigo inalterado neste ciclo; o commit
deste ciclo grava so a nota de confirmacao e o `status`.

**Commit:** `632abee`

### Ciclo 6 (executor, 2026-09-25)

**Nenhum codigo mudado neste ciclo — mesmo diagnostico do Ciclo 4, agora confirmado pelo
replanejamento e pela memoria do projeto.** A passada mecanica seguinte ao Ciclo 5 reprovou de
novo na checagem base "a suite do projeto continua passando" (`mix test`, nao um criterio desta
tarefa), com falha em `test/fabrica/memoria/busca_test.exs:242` — exatamente o sintoma que o
replanejamento de 2026-09-25 ja atribuiu a D-008 (`pg_restore --clean --if-exists` ao vivo em
`test/mix/backup_test.exs` invalidando o cache de tipo de conexoes do pool, derrubando
`busca_test.exs`/`confinamento_test.exs` de forma FLAKY, nao deterministica) e para o qual ja
existe a **T-072** (backlog) isolando o restore do `mix test`.

**Reexecutei para confirmar, sem tocar em codigo:**
- Postgres no ar confirmado (`netstat -ano` mostra `127.0.0.1:5432` em `LISTENING`).
- `mix test test/fabrica/memoria/busca_test.exs` isolado → **6 tests, 0 failures** — o teste
  apontado pela passada mecanica PASSA sozinho, confirmando que e flakiness de infraestrutura
  (contencao do pool de conexao durante o restore de outro teste), nao bug de logica em
  `busca.ex` nem em nada desta tarefa.
- `mix test test/fabrica/memoria/avaliacao_test.exs` → **11 tests, 0 failures** (~31,5s) — os
  tres criterios substantivos do T-047 continuam verdes, sem mudanca desde o commit `b1a22f9`
  (Ciclo 3).

**Por que nao ataco `busca_test.exs`/`busca.ex`:** estao fora das `areas` desta tarefa
(`priv/avaliacao/perguntas.exs`, `test/fabrica/memoria/avaliacao_test.exs`). O guarda de commit
recusa mudanca fora das `areas` (loop de confinamento ja catalogado); e o defeito nem e de
logica — e do ciclo de restore ao vivo dentro de `mix test`, cujo fix sistemico ja tem tarefa
propria (T-072). Corrigir aqui seria remendo fora de escopo, nao a causa.

**Escopo aproveitado x refeito:** 100% aproveitado, 0% refeito, 0 linha de codigo nova.
Entregavel de codigo inalterado desde o commit `b1a22f9`; este ciclo so confirma e registra.

**Reproduzir:**
```
mix test test/fabrica/memoria/avaliacao_test.exs
```
(precisa do Postgres no ar; usa `Embedder.Falso`, sem rede, como o resto da suite.)

**Commit:** `3b90217`

## Verificacao

### Ciclo 2 (testador, 2026-09-25)

- **[PASSOU] [executado] A suíte do projeto continua passando (não quebrou o que já existia)**
  Comando: `mix test` (via `mix verificar`)
  Saída: 41 doctests, 1131 tests, 0 failures em 80.0 segundos

- **[PASSOU] [executado] O conjunto tem ao menos 15 pares extraidos da historia real, e `recall@8` e calculado.**
  Comando: `mix test test/fabrica/memoria/avaliacao_test.exs`
  Saída: 8 tests, 0 failures em 24.0 segundos. O teste verifica que gabarito tem entre 15 e 25 pares e que recall@8 é calculável contra o corpus REAL.

- **[PASSOU] [executado] A linha de base fica gravada e e comparada a cada execucao.**
  Comando: `mix test test/fabrica/memoria/avaliacao_test.exs` (mesmo comando, teste "medir/2 e linha_de_base/2" interno)
  Saída: O teste valida que a linha de base (busca por PALAVRA) é calculada no MESMO corpus, recupera pelo menos uma resposta certa, e é comparável com as métricas atuais via `abaixo_da_linha_de_base?/2`.

- **[PASSOU] [executado] Recuperacao abaixo da linha de base DESLIGA o bloco de contexto, em vez de so avisar.**
  Comando: `mix test test/fabrica/memoria/avaliacao_test.exs` (teste "montar_contexto_seguro/3 — o bloco continua entrando quando a recuperacao e boa" e acima dele o teste "o atuador DESLIGA...")
  Saída: O teste prova que quando a recuperação fica abaixo do piso (buscador que retorna lista vazia contra linha de base > 0), `montar_contexto_seguro/3` devolve `nil`. Quando recuperação é boa, o bloco entra normalmente.

- **[PASSOU] [executado] `mix verificar` continua passando.**
  Comando: `mix verificar` (completo: formato, compilação, lint, testes)
  Saída: Format OK, 1494 mods/funs lint OK (0 issues), 41 doctests + 1131 tests = 0 failures em 80.0 segundos.

Graus de prova: 5 executado(s), 0 para julgamento (de 5).

## Conformidade

### Ciclo 1 (revisor, 2026-09-25)

Conformidade: cumpre

- **"ao menos 15 pares extraidos da historia real, e recall@8 e calculado"** →
  `Avaliacao.gabarito/0` (`priv/avaliacao/perguntas.exs:44-93`, 21 pares) e `Avaliacao.medir/2`
  (`priv/avaliacao/perguntas.exs:125-140`). Conferi por amostragem 3 `frase_alvo` do gabarito
  contra o corpus real (`grep` em `_gestao/DECISOES.md` e `_gestao/tarefas/T-042-abertura.md`):
  as tres apareceram literalmente. `avaliacao_test.exs` trava a faixa 15..25 e o calculo contra
  o corpus real.
- **"a linha de base fica gravada e e comparada a cada execucao"** →
  `Avaliacao.linha_de_base/2` (busca so por palavra, `ts_rank_cd`/`plainto_tsquery`, mesma forma
  da metade textual de `Busca.buscar/3`) e `Avaliacao.abaixo_da_linha_de_base?/2`. A tarefa não
  persiste um numero congelado — calcula ao vivo a cada chamada — e a Nota de execucao justifica
  isso com D-005 item 4 e D-007 (numero cravado apodrece). Aceito: "grave a linha de base" no
  Objetivo é satisfeito pela tabela medida registrada nas Notas de execucao (0,048/0,048) e pela
  reproducibilidade em codigo; a v1 catalogou exatamente o defeito de numero congelado que a
  D-007 corrigiu, e travar aqui repetiria o erro.
- **"recuperacao abaixo da linha de base DESLIGA o bloco, em vez de so avisar"** →
  `Avaliacao.montar_contexto_seguro/3` (`priv/avaliacao/perguntas.exs:169-179`), que devolve
  `nil` em vez de chamar `Contexto.montar/3` quando `abaixo_da_linha_de_base?/2` é verdadeiro.
  Testado nas duas direcoes (`buscador_ruim` desliga; `buscador_perfeito` mantem) em
  `avaliacao_test.exs`.
- **`mix verificar` continua passando** → registrado como PASSOU na Verificacao (testador,
  Ciclo 2), não reexecutei.
- **Escopo:** os dois arquivos tocados são exatamente as `areas` declaradas
  (`priv/avaliacao/perguntas.exs`, `test/fabrica/memoria/avaliacao_test.exs`); nada em `lib/`
  foi tocado, e a Nota de execucao justifica por que (D-005 item 3, D-006) — condiz com o
  Objetivo, que pede o instrumento e a regra do atuador, não o wiring com o despacho real (isso
  é das T-066 a T-070). Sem sobra fora de escopo.

### Ciclo 6 (revisor, 2026-09-25)

Conformidade: cumpre

Reconfirmo o veredito do Ciclo 1 — nada no entregável mudou. O diff deste ciclo (`3b90217` +
`b97e88e`, contra `632abee`) toca só `_gestao/MAPA.md` (cabeçalho HEAD) e este `.md` de tarefa;
`priv/avaliacao/perguntas.exs` e `test/fabrica/memoria/avaliacao_test.exs` seguem bit-a-bit
idênticos ao commit `b1a22f9` (Ciclo 3), conferido por `git show --stat` sem essas duas linhas
no diff.

- Os três critérios de aceite (linhas 37-42, únicos que restam após o 4º cair no replanejamento
  de 2026-09-25) continuam satisfeitos pelos mesmos artefatos apontados no Ciclo 1 —
  `Avaliacao.gabarito/0`, `Avaliacao.medir/2`+`linha_de_base/2`,
  `Avaliacao.montar_contexto_seguro/3` — e a própria Verificação (última passada mecânica)
  confirma os três com `PASSOU`.
- A reprovação mecânica que abriu este Ciclo 6 foi na checagem-base "suíte do projeto continua
  passando" (`mix test`), não em nenhum dos três critérios da tarefa, e o sintoma
  (`busca_test.exs:242`) é o mesmo já diagnosticado em D-008 e isolado como flaky de infra
  (`pg_restore --clean --if-exists` ao vivo em `test/mix/backup_test.exs` invalidando o cache de
  tipo de conexões do pool durante a fase síncrona) — não bug de lógica em `busca.ex`, e fora de
  qualquer forma das `areas` desta tarefa. Isso bate com o registro de memória já feito para este
  exato padrão (T-063/D-008: suíte global vermelha por `busca_test.exs`/confinamento flaky
  reprova mecanicamente tarefas de outras áreas). Já existe tarefa própria (T-072) para a causa
  sistêmica.
- Escopo: nenhuma linha de código nova; só prosa de diagnóstico e o hash do commit. Nada fora de
  `areas`.

## Revisao

### Ciclo 1 (revisor, 2026-09-25)

- [importante] `priv/avaliacao/perguntas.exs:181-186` (`posicao_do_alvo/2`, chamada por
  `medir/2` em `priv/avaliacao/perguntas.exs:125-140`) — `medir/2` passa o retorno do
  `buscador` direto para `Enum.find_index/2` sem tratar o caso de erro. O contrato que o
  proprio `Fabrica.Memoria.Busca.buscar/3` documenta (`lib/fabrica/memoria/busca.ex:50-53`) é
  devolver `{:erro, {:vetorizacao_da_consulta, motivo}}` — nunca deixar o `MatchError`
  subir — quando o embedder falha (ex.: `Embedder.Ollama` com o serviço fora do ar, o
  embedder configurado em `dev`, D-004). Cenario concreto: Ollama cai, alguem chama
  `Avaliacao.montar_contexto_seguro/3` com o buscador padrao (`&Busca.buscar/2`);
  `buscador.(pergunta)` devolve a tupla `{:erro, ...}`; `Enum.find_index({:erro, ...}, fun)`
  levanta `Protocol.UndefinedError` (tupla não implementa `Enumerable`) em vez de o atuador
  desligar o bloco — exatamente o comportamento oposto ao que a tarefa pede ("roda sem o
  bloco... em vez de so avisar"): aqui ele quebra o processo chamador. Não se manifesta hoje
  porque `montar_contexto_seguro/3` ainda não é chamado por nada em `lib/` (D-006) e a suíte
  roda com `Embedder.Falso`, que não falha — por isso "importante" e não "critica". Quem
  ligar isto ao despacho real (T-066 a T-070) vai herdar esta lacuna se não tratar `{:erro,
  _}` antes de repassar a quem chamou `montar_contexto_seguro/3`.

Fora esse achado: gabarito conferido por amostragem contra o corpus real, assinaturas usadas
(`Busca.buscar/2`, `Contexto.montar/3`, `Ingestao.processar/3`, `Trecho`) batem com os módulos
reais (`lib/fabrica/memoria/{busca,contexto,ingestao,trecho}.ex`), e a decisão de comparar só
`recall_at_8` (ignorando `posicao_media`) como gatilho do atuador é razoável e não contradiz
nenhum critério.

### Ciclo 6 (revisor, 2026-09-25)

Nenhum código no diff deste ciclo — só notas de execução e o hash do commit. Nada a revisar por
bug; o achado `[importante]` do Ciclo 1 segue fechado desde o Ciclo 3 (`b1a22f9`), sem
regressão. Aprovado sem ressalvas.



## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] O conjunto tem ao menos 15 pares extraidos da historia real, e `recall@8` e calculado. — `mix test test/fabrica/memoria/avaliacao_test.exs` → **PASSOU**
- [executado] A linha de base fica gravada e e comparada a cada execucao. — `mix test test/fabrica/memoria/avaliacao_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Recuperacao abaixo da linha de base DESLIGA o bloco de contexto, em vez de so avisar. — `mix test test/fabrica/memoria/avaliacao_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] `mix verificar` continua passando. — `mix verificar` → **FALHOU**

```
Checking 166 source files (this might take a while) ...

Please report incorrect results: https://github.com/rrrene/credo/issues

Analysis took 6.1 seconds (0.2s to load, 5.8s running 69 checks on 166 files)
1506 mods/funs, found no issues.

Use `mix credo explain` to explain issues, `mix credo --help` for options.
Running ExUnit with seed: 643284, max_cases: 16

.............................................................................................................................................................................................................................................................................................................
… (205 caracteres omitidos do meio) …
...................................................................................................................................................................................................................................................................................................................................................

  1) test escape 3: link que aponta para fora recusa link cujo DESTINO esta fora (Fabrica.Ferramentas.ConfinamentoTest)
     test/fabrica/ferramentas/confinamento_test.exs:141
     ** (MatchError) no match of right hand side value:

         {:error, :sem_link}

     code: assert :ok = criar_link(fora, atalho),
     stacktrace:
       test/fabrica/ferramentas/confinamento_test.exs:144: (test)

...........................................................................................................................................................................................................................................................01:46:39.583 [error] Postgrex.Protocol (#PID<0.12620.0> ({Postgrex.Protocol, "fabrica_test"})) disconnected: ** (DBConnection.ConnectionError) client #PID<0.16367.0> exited
.....................................................................................
Finished in 88.1 seconds (27.1s async, 60.9s sync)
41 doctests, 1141 tests, 1 failure
```


Graus de prova: 5 executado(s), 0 para julgamento (de 5).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **FALHOU**

```
Running ExUnit with seed: 116048, max_cases: 16

..........................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................

  1) test buscar/3 — o termo e vetorizado pelo caminho de CONSULTA com um embedder que devolve vetores diferentes por tipo, a busca acha o trecho da consulta, e nao o do documento (Fabrica.Memoria.BuscaTest)
     test/fabrica/memoria/busca_test.exs:242
     Assertion with in failed
     code:  assert trecho_documento in Enum.map(resultado, & &1.id)
     left:  136853
     right: [136854]
     stacktrace:
       test/fabrica/memoria/busca_test.exs:265: (test)

................................................................................05:46:28.971 [error] Postgrex.Protocol (#PID<0.4759.0> ({Postgrex.Protocol, "fabrica_test"})) disconnected: ** (DBConnection.ConnectionError) client #PID<0.4855.0> exited
...
Finished in 90.8 seconds (26.4s async, 64.3s sync)
41 doctests, 1141 tests, 1 failure
```

- [executado] O conjunto tem ao menos 15 pares extraidos da historia real, e `recall@8` e calculado. — `mix test test/fabrica/memoria/avaliacao_test.exs` → **PASSOU**
- [executado] A linha de base fica gravada e e comparada a cada execucao. — `mix test test/fabrica/memoria/avaliacao_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Recuperacao abaixo da linha de base DESLIGA o bloco de contexto, em vez de so avisar. — `mix test test/fabrica/memoria/avaliacao_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)

Graus de prova: 4 executado(s), 0 para julgamento (de 4).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] O conjunto tem ao menos 15 pares extraidos da historia real, e `recall@8` e calculado. — `mix test test/fabrica/memoria/avaliacao_test.exs` → **PASSOU**
- [executado] A linha de base fica gravada e e comparada a cada execucao. — `mix test test/fabrica/memoria/avaliacao_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Recuperacao abaixo da linha de base DESLIGA o bloco de contexto, em vez de so avisar. — `mix test test/fabrica/memoria/avaliacao_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)

Graus de prova: 4 executado(s), 0 para julgamento (de 4).

### Passada mecânica (sem modelo)

- [executado] O conjunto tem ao menos 15 pares extraidos da historia real, e `recall@8` e calculado. — `mix test test/fabrica/memoria/avaliacao_test.exs` → **PASSOU**
- [executado] A linha de base fica gravada e e comparada a cada execucao. — `mix test test/fabrica/memoria/avaliacao_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Recuperacao abaixo da linha de base DESLIGA o bloco de contexto, em vez de so avisar. — `mix test test/fabrica/memoria/avaliacao_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)

Graus de prova: 3 executado(s), 0 para julgamento (de 3).


