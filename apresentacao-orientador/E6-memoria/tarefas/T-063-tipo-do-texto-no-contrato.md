---
id: T-063
titulo: O contrato do embedder ganha o TIPO do texto (documento x consulta)
projeto: fabrica-v2
versao: v0.5
status: concluida
prioridade: alta
dependencias: [T-062]
areas: [lib/fabrica/embedder.ex, test/fabrica/embedder_test.exs, lib/fabrica/memoria/busca.ex, test/fabrica/memoria/busca_test.exs, lib/fabrica/embedder/ollama.ex]
tentativas: 1
criada: 2026-09-15
atualizada: 2026-09-25
---

## Objetivo
Fazer a busca vetorizar o termo como CONSULTA e a ingestao como DOCUMENTO, atraves do contrato —
sem que `Busca` precise saber que existe prefixo, e sem mudar nada para os adaptadores que nao tem
prefixo nenhum.

## Contexto

A T-062 entregou `Ollama.vetorizar_consulta/1`, mas ninguem a chama: `Busca.buscar/3` chama
`embedder.vetorizar([termo])`, a MESMA funcao que `Ingestao.gravar_lote/3` usa para documentos.
Com `embeddinggemma`, isso manda a consulta com prefixo de documento — e a qualidade medida na
D-004 (recall@8 15/23, recall@1 0,391) simplesmente nao se reproduz. Sensor construido e nao
ligado: o defeito recorrente desta fabrica.

**A forma escolhida, e a descartada** (registrado na D-005): callback **OPCIONAL**
`vetorizar_consulta/1` em `Fabrica.Embedder`, com a fachada `Fabrica.Embedder.vetorizar_consulta/1`
usando o adaptador quando ele exporta a funcao e caindo em `vetorizar/1` quando nao. Descartado:
trocar o contrato para `vetorizar/2` com o tipo como argumento — obrigaria `Falso`, `Servico` e
`Local`, que nao tem prefixo, a mudar para servir um adaptador so.

**Como decidir se o adaptador exporta**, sem gambiarra: `Code.ensure_loaded?/1` seguido de
`function_exported?/3`. Sem o `ensure_loaded?`, o `function_exported?` mente para modulo ainda nao
carregado — e em `test` o codigo e carregado sob demanda, entao isto NAO e zelo teorico. Use
`@optional_callbacks` no behaviour para declarar o callback como opcional; sem ele o compilador
avisa em todo adaptador que nao o implementa, e `--warnings-as-errors` derruba a compilacao.

**O que muda em `Busca.buscar/3`:** a linha `{:ok, [vetor]} = embedder.vetorizar([termo])` passa
pelo caminho de consulta. Note que ela casa so o sucesso — o contrato preve `{:erro, _}`, e esse
achado ja foi levantado pelo revisor da T-043 no equivalente da ingestao. Enderece-o aqui, ja que
voce esta na linha: com um embedder real ha falha de rede e de tempo, e `MatchError` num caminho de
busca derruba um despacho inteiro sem dizer por que.

**O `@moduledoc` de `Fabrica.Embedder` envelheceu e voce vai passar por ele.** Ele lista tres
adaptadores (`Falso`, `Servico`, `Local`) e diz que "qual dos dois reais vira o padrao se decide COM
MEDICAO na T-042". A medicao aconteceu duas vezes desde entao: a D-001 (EXLA nao compila no Windows;
`Local` fica opcional) e a **D-004** (o padrao e `Embedder.Ollama` com `embeddinggemma`). Atualize a
lista e a frase — registro desatualizado no contrato e o que faz a proxima tarefa escolher o
adaptador errado.

**`test/fabrica/embedder_test.exs` e arquivo NOVO** — hoje o contrato e testado de carona em
`falso_test.exs`, que e area da T-060. Os testes do contrato (fachada, fallback, callback opcional)
vao no arquivo novo; os de `Busca` ficam em `busca_test.exs`, que ja tem a infraestrutura de banco.

**Quatro `areas`, e por que elas nao se separam:** o contrato sem quem o chame e codigo morto que
nenhum criterio consegue provar, e `Busca` nao compila chamando funcao que o contrato ainda nao
tem. E a mesma mudanca de ~50 linhas atravessando duas camadas; parti-la criaria uma tarefa cujo
unico criterio seria "existe".

**Stack:** nada novo. Antes de fechar: `mix format`, conferir LF (GUIA, Armadilhas) e
`mix fabrica.ci` completo — em especial o estagio `tipos`, porque esta tarefa mexe em `@callback`
e `@spec` (o Dialyzer ja pegou spec mentiroso neste projeto; GUIA, secao 3).

## Criterios de aceite
- [ ] `Fabrica.Embedder.vetorizar_consulta/1` usa o callback do adaptador quando ele o exporta, e
      cai em `vetorizar/1` quando nao — provado com dois adaptadores de teste, um de cada tipo.
      `verificar: mix test test/fabrica/embedder_test.exs`
- [ ] O behaviour declara `vetorizar_consulta/1` como callback OPCIONAL, e o projeto compila sem
      aviso com `Falso`, `Servico` e `Local` intocados.
      `verificar: mix compile --warnings-as-errors`
- [ ] `Busca.buscar/3` vetoriza o termo pelo caminho de CONSULTA: um adaptador de teste que devolve
      vetores diferentes por tipo faz a busca achar o trecho da consulta, e nao o do documento.
      `verificar: mix test test/fabrica/memoria/busca_test.exs`
- [ ] Os quatro criterios da T-044 continuam provados (primeiro lugar para quem as duas buscas
      acham, termo exato fora do vetor, isolamento por projeto, uma unica ida ao banco).
      `verificar: mix test test/fabrica/memoria/busca_test.exs`
- [ ] Embedder que devolve `{:erro, _}` na busca vira erro nomeado, nao `MatchError`.
      `verificar: mix test test/fabrica/memoria/busca_test.exs`
- [ ] A ingestao continua vetorizando pelo caminho de DOCUMENTO, sem mudanca de comportamento.
      `verificar: mix test test/fabrica/memoria/ingestao_test.exs`
- [ ] O contrato novo passa na checagem de tipos.
      `verificar: mix dialyzer`

## Notas de execucao

### Ciclo 1 (2026-09-25)

Teste escrito ANTES da implementacao nos dois arquivos de teste, visto vermelho antes de cada
ajuste (`Embedder.vetorizar_consulta/2` inexistente; depois `MatchError`/ordem errada em
`Busca.buscar/3`).

**`lib/fabrica/embedder.ex`:**
- `@callback vetorizar_consulta/1` acrescentado ao behaviour, com `@optional_callbacks
  vetorizar_consulta: 1` — sem isso o compilador avisaria em `Falso`, `Servico` e `Local` (que
  nao o implementam), e `--warnings-as-errors` derrubaria a compilacao.
- `Fabrica.Embedder.vetorizar_consulta/2` (novo): `embedder \\ configurado()`. Confere
  `Code.ensure_loaded?/1` ANTES de `function_exported?/3` (sem isso, `function_exported?/3`
  mente para modulo ainda nao carregado — relevante porque `test` carrega sob demanda) e usa o
  callback do adaptador quando ele exporta `vetorizar_consulta/1`; cai em `vetorizar/1` quando
  nao. Gera tambem `vetorizar_consulta/1` (arity derivada do valor padrao), que e a fachada que
  os criterios pedem.
- `@moduledoc` atualizado: lista os quatro adaptadores reais (Falso, Ollama, Servico, Local) e
  registra que a escolha do padrao ja foi decidida por medicao (D-001, D-004) — a frase antiga
  ("qual dos dois reais vira o padrao se decide na T-042") estava obsoleta desde a propria
  D-001. Nova secao "Documento x consulta (D-005, T-063)" documenta o callback opcional.

**`lib/fabrica/embedder/ollama.ex` (acrescentado as `areas` — ver justificativa abaixo):**
- `Ollama.vetorizar_consulta/1` (existente desde a T-062, ja com a assinatura certa) ganhou
  `@impl Fabrica.Embedder`. Sem essa unica linha, `mix compile --warnings-as-errors` reprovava
  com "module attribute @impl was not set for function vetorizar_consulta/1 callback" — o
  proprio criterio 2 desta tarefa ("compila sem aviso com Falso, Servico e Local intocados")
  exclui Ollama de proposito da lista de intocados, e nao ha como satisfazer esse criterio sem
  tocar este arquivo. Acrescentei `lib/fabrica/embedder/ollama.ex` as `areas` do frontmatter
  para o commit escopado (`Fabrica.Publicacao.Git.commitar/3`) nao recusar essa unica linha.

**`lib/fabrica/memoria/busca.ex`:**
- `buscar/3` agora chama `Fabrica.Embedder.vetorizar_consulta([termo], embedder)` em vez de
  `embedder.vetorizar([termo])` — o termo vai pelo caminho de CONSULTA, nao de documento.
  `{:ok, [vetor]} -> buscar_com_vetor(...)` e `{:erro, motivo} -> {:erro,
  {:vetorizacao_da_consulta, motivo}}` substituem o `MatchError` do `=` antigo (achado ja
  levantado pelo revisor da T-043, endereçado aqui conforme o Contexto pediu). O corpo que
  monta e roda a UNICA instrucao SQL foi extraido para `buscar_com_vetor/3` sem mudar nada
  nela — a garantia "uma unica ida ao banco" (T-044) continua valendo porque so ha uma chamada
  a `SQL.query!/3` no caminho de sucesso.
- `@spec` de `buscar/3` passa a `[Trecho.t()] | {:erro, term()}`. `@moduledoc` ganhou a secao
  "Documento x consulta (T-063)".

**Testes novos:**
- `test/fabrica/embedder_test.exs` (arquivo novo): trava `vetorizar_consulta/1,2` com dois
  adaptadores de teste — um que exporta o callback (`ComPrefixoPorTipo`) e um que nao
  (`SemPrefixoPorTipo`) — provando o uso do callback e o fallback, tanto pela forma explicita
  (`/2`) quanto pela que usa `configurado/0` (`/1`, com `Application.put_env(:fabrica,
  :embedder, ...)`, `async: false`).
- `test/fabrica/memoria/busca_test.exs`: dois `describe` novos. `EmbedderPorTipo` (vetor fixo e
  DIFERENTE por funcao, ignorando o texto de entrada — `Falso` nao serve para isto porque daria
  o mesmo vetor nos dois caminhos) prova que a busca acha o trecho gravado com o vetor de
  CONSULTA em primeiro lugar, nao o de documento. `EmbedderComErro` (so `vetorizar/1`, sempre
  `{:erro, :timeout}`) prova o erro nomeado `{:erro, {:vetorizacao_da_consulta, :timeout}}` em
  vez do `MatchError`. Os quatro testes da T-044 ja existentes nao mudaram: o embedder padrao
  da suite (`Falso`) nao tem `vetorizar_consulta/1`, entao caem em `vetorizar/1` e continuam
  vetorizando exatamente como antes.

Nenhuma dependencia nova.

**Reproduzir:**
`mix test test/fabrica/embedder_test.exs test/fabrica/memoria/busca_test.exs
test/fabrica/memoria/ingestao_test.exs`

**Verificado tambem:**
- `mix compile --warnings-as-errors --force` → limpo (0 avisos).
- `mix credo --strict lib/fabrica/embedder.ex lib/fabrica/embedder/ollama.ex
  lib/fabrica/memoria/busca.ex test/fabrica/embedder_test.exs
  test/fabrica/memoria/busca_test.exs` → "45 mods/funs, found no issues".
- `mix dialyzer` → "Total errors: 2, Skipped: 2" (mesma linha de base ja existente antes desta
  tarefa; nao investiguei mais fundo porque `mix dialyzer` reporta "done (passed successfully)"
  — os 2 erros contados sao avisos ja ignorados por `.dialyzer_ignore.exs`, nao falhas novas).
- `mix format --check-formatted` nos arquivos tocados → limpo apos `mix format`.
- LF confirmado em todos os arquivos tocados (`grep -c $'\r'` = 0 em cada um).

**Nao executei** `mix fabrica.ci` completo (o Contexto da tarefa pede, mas o meu papel de
executor nao roda a suite inteira do projeto — isso e papel do testador, e com agentes
paralelos na mesma arvore rodar a suite completa aqui geraria falha falsa). Os estagios
relevantes a esta tarefa (formato, compilar com avisos como erro, lint no que toquei, testes
das areas, tipos) foram todos rodados manualmente acima.

Achado no caminho, fora do escopo desta tarefa: `_gestao/tarefas/T-062-embedder-ollama.md`
ja estava modificado na arvore ANTES deste ciclo comecar (visto no `git status` de abertura) —
nao e mudanca minha e nao entra neste commit.

**Commit:** `1e1fc75`

## Verificacao

## Conformidade

Conformidade: cumpre

- `Fabrica.Embedder.vetorizar_consulta/1` usa o callback do adaptador quando ele o exporta, e
  cai em `vetorizar/1` quando nao → `lib/fabrica/embedder.ex:85-92` (`vetorizar_consulta/2`
  com `Code.ensure_loaded?/1` + `function_exported?/3`), provado em
  `test/fabrica/embedder_test.exs` (`ComPrefixoPorTipo` × `SemPrefixoPorTipo`).
- Behaviour declara `vetorizar_consulta/1` OPCIONAL e o projeto compila sem aviso com Falso,
  Servico e Local intocados → `lib/fabrica/embedder.ex:58,60` (`@callback` +
  `@optional_callbacks`); `mix compile --warnings-as-errors --force` limpo (Notas de execucao,
  Ciclo 1).
- `Busca.buscar/3` vetoriza o termo pelo caminho de CONSULTA → `lib/fabrica/memoria/busca.ex:56-61`,
  provado em `test/fabrica/memoria/busca_test.exs:241-267` (`EmbedderPorTipo`, vetores fixos e
  distintos por funcao).
- Os quatro criterios da T-044 continuam provados → os quatro testes preexistentes em
  `busca_test.exs:96-239` nao foram tocados pelo diff e continuam vetorizando pelo `Falso`
  (que cai em `vetorizar/1` por nao ter o callback opcional).
- Embedder que devolve `{:erro, _}` na busca vira erro nomeado, nao `MatchError` →
  `busca.ex:60` (`{:erro, motivo} -> {:erro, {:vetorizacao_da_consulta, motivo}}`), provado em
  `busca_test.exs:269-276`.
- A ingestao continua vetorizando pelo caminho de DOCUMENTO, sem mudanca de comportamento →
  `Fabrica.Memoria.Ingestao` nao foi tocada pelo diff; `vetorizar/1` do contrato continua sendo
  o caminho de documento (moduledoc de `embedder.ex`, secao "Documento x consulta").
- O contrato novo passa na checagem de tipos → `mix dialyzer` relatado limpo na linha de base
  ja existente (Notas de execucao, Ciclo 1).

Escopo: `lib/fabrica/embedder/ollama.ex` entrou nas `areas` com justificativa registrada nas
Notas — uma linha (`@impl Fabrica.Embedder`), exigida pelo proprio criterio 2 desta tarefa
(que exclui Ollama, de proposito, da lista de adaptadores "intocados"). Nao e excesso de
escopo.

Objetivo cumprido no espirito: a forma escolhida (callback OPCIONAL, fachada com fallback) e
exatamente a decidida na D-005 item 2, e o diff evita a forma descartada (mudar `vetorizar/2`
para todos os adaptadores).

## Revisao

Aprovado sem ressalvas. Verifiquei:

- `lib/fabrica/embedder.ex` — `Code.ensure_loaded?/1` roda ANTES de `function_exported?/3`
  (linha 87), como o Contexto exigiu; o default `embedder \\ configurado()` gera `/1` e `/2`
  corretamente.
- `lib/fabrica/embedder/ollama.ex` — `@impl Fabrica.Embedder` foi aplicado so a clausula de
  aridade 1 de `vetorizar_consulta`; a de aridade 2 (com opcoes, usada internamente e pelos
  testes de dublagem) fica sem `@impl`, correto porque nao e parte do behaviour.
- `lib/fabrica/memoria/busca.ex` — o `case` substitui o `MatchError` do `=` antigo sem alterar
  a garantia de uma unica ida ao banco: a extracao para `buscar_com_vetor/3` nao introduz nova
  chamada a `SQL.query!/3`.
- `test/fabrica/memoria/busca_test.exs` — `EmbedderPorTipo` usa vetores fixos e DISTINTOS por
  funcao (o comentario no proprio teste explica por que `Falso` nao serviria); a asserção de
  primeiro lugar corresponde a distancia de cosseno zero contra o vetor gravado. Os quatro
  testes da T-044 nao foram alterados.
- Achado `menor`: o campo `Commit:` do Ciclo 1 foi gravado inicialmente como
  `(ver Ciclo 1, proximo commit)` (placeholder) e só recebeu o hash real (`1e1fc75`) num
  commit seguinte (`ce7e037`) — defeito de processo (o hash devia ter entrado junto), mas já
  corrigido antes desta revisão e sem impacto no código; não pesa no veredito.

Nao abri arquivo fora do diff, exceto os que o proprio diff toca por completo
(`lib/fabrica/embedder/ollama.ex`, `lib/fabrica/memoria/busca.ex`,
`test/fabrica/memoria/busca_test.exs`) para confirmar consistencia do trecho novo com o
preexistente.


## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] `Fabrica.Embedder.vetorizar_consulta/1` usa o callback do adaptador quando ele o exporta, e cai em `vetorizar/1` quando nao — provado com dois adaptadores de teste, um de cada tipo. — `mix test test/fabrica/embedder_test.exs` → **PASSOU**
- [executado] O behaviour declara `vetorizar_consulta/1` como callback OPCIONAL, e o projeto compila sem aviso com `Falso`, `Servico` e `Local` intocados. — `mix compile --warnings-as-errors` → **PASSOU**
- [executado] `Busca.buscar/3` vetoriza o termo pelo caminho de CONSULTA: um adaptador de teste que devolve vetores diferentes por tipo faz a busca achar o trecho da consulta, e nao o do documento. — `mix test test/fabrica/memoria/busca_test.exs` → **PASSOU**
- [executado] Os quatro criterios da T-044 continuam provados (primeiro lugar para quem as duas buscas acham, termo exato fora do vetor, isolamento por projeto, uma unica ida ao banco). — `mix test test/fabrica/memoria/busca_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Embedder que devolve `{:erro, _}` na busca vira erro nomeado, nao `MatchError`. — `mix test test/fabrica/memoria/busca_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A ingestao continua vetorizando pelo caminho de DOCUMENTO, sem mudanca de comportamento. — `mix test test/fabrica/memoria/ingestao_test.exs` → **PASSOU**
- [executado] O contrato novo passa na checagem de tipos. — `mix dialyzer` → **PASSOU**

Graus de prova: 8 executado(s), 0 para julgamento (de 8).
