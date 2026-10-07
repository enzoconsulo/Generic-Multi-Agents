---
id: T-066
titulo: "Fabrica.Despacho: monta a mensagem inicial de um agente, a partir da tarefa e do papel"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-010, T-011, T-016, T-017, T-024, T-071]
areas: [lib/fabrica/despacho.ex, test/fabrica/despacho_test.exs]
tentativas: 2
criada: 2026-09-21
atualizada: 2026-09-22
---

## Objetivo
Compor, a partir de uma `Fabrica.Tarefas.Tarefa` e um papel (`construtor`/`verificador`/
`revisor`/`planejador`), a mensagem inicial pronta para `Fabrica.Agente.Estado.novo/1` — as
quatro faixas do prefixo, na ordem que `Fabrica.Prompt.Prefixo` exige, com as ferramentas do
papel já resolvidas.

## Contexto
Extraída da T-058 no replanejamento de 21/09 (`_gestao/DECISOES.md`, D-006): é a peça que falta
entre o que já existe pronto e testado — `Fabrica.Prompt.Prefixo`/`Fabrica.Prompt.Bloco` (montam
blocos e sabem a ordem), `Fabrica.Equipe.Resolucao.doutrina/2` (monta a faixa de doutrina a
partir de um `texto_do_papel` recebido **de fora**, de propósito — ver o moduledoc dela),
`Fabrica.Ferramentas.Catalogo.do_papel/1` (as ferramentas de cada papel) e `Fabrica.Indice.Mapa`
(o índice denso, T-010) — e o fato de que **ninguém hoje chama essas quatro peças juntas** para
uma tarefa real. Todas as dependências desta tarefa já estão `concluida`.

`Fabrica.Despacho.montar(tarefa, papel, texto_do_papel, opcoes \\ [])` deve:

- resolver as ferramentas do papel via `Ferramentas.Catalogo.do_papel/1` — papel desconhecido
  devolve erro, nunca lista vazia em silêncio (mesma doutrina do próprio Catálogo);
- resolver a doutrina via `Fabrica.Equipe.Resolucao` (papel + especialista da tarefa, se houver)
  seguido de `Equipe.Resolucao.doutrina/2`, passando o `texto_do_papel` recebido como parâmetro;
- montar a faixa `:indice` a partir do índice do PROJETO que a tarefa pertence (o projeto que o
  agente vai construir — não desta fábrica-v2);
- montar a faixa `:tarefa` a partir dos campos da própria `Tarefa` (objetivo, contexto,
  critérios, áreas — ver o schema criado na T-002);
- chamar `Fabrica.Prompt.Prefixo.montar/2` com essas quatro partes.

**Não decida aqui onde `texto_do_papel` mora nem seu conteúdo** — isso é a T-067 (doutrina de
construtor/testador/revisor) e a T-068 (doutrina do planejador). Esta tarefa recebe o texto como
PARÂMETRO, pelo mesmo motivo que `Equipe.Resolucao.doutrina/2` já faz isso: testável sem
arrastar o catálogo de doutrina inteiro para dentro do teste.

Função pura — sem I/O de rede, sem chamar operário, só monta texto a partir de dados já
carregados.

## Critérios de aceite
- [ ] `Fabrica.Despacho.montar/4` devolve as quatro faixas na ordem que `Prompt.Bloco.especies/0`
      define, com a faixa `:tarefa` por último e sem ponto de cache.
      `verificar: mix test test/fabrica/despacho_test.exs`
- [ ] Papel desconhecido devolve erro, nunca ferramentas vazias em silêncio.
      `verificar: mix test test/fabrica/despacho_test.exs`
- [ ] Tarefa com especialista da equipe: a doutrina inclui o bloco `<especialista>` (mesmo
      mecanismo de `Equipe.Resolucao.doutrina/2`).
      `verificar: mix test test/fabrica/despacho_test.exs`
- [ ] `mix fabrica.ci` passa (formato, compilação, lint, testes, tipos).
      `verificar: mix fabrica.ci`

## Notas de execução

Criado `Fabrica.Despacho` (`lib/fabrica/despacho.ex`) com `montar/4`. Teste escrito ANTES
(vermelho confirmado com `UndefinedFunctionError`, depois verde) em
`test/fabrica/despacho_test.exs`, 9 casos.

**Decisões de implementação, dentro do que o Contexto deixava em aberto:**

- `papel` é **atom** (`:construtor` etc.), igual a `Fabrica.Equipe.resolver/2` e
  `Resolucao.resolver/3`; convertido para string (`Atom.to_string/1`) só na chamada ao
  `Catalogo.do_papel/1`, que usa chave string.
- A doutrina usa `Fabrica.Equipe.Resolucao` (o módulo PURO, não `Fabrica.Equipe`, que toca o
  banco): `referencia = tarefa.especialista && tarefa.especialista.identificador` e
  `ativos = List.wrap(tarefa.especialista)`. Ou seja, `Despacho` confia no que a `tarefa`
  já carrega preload — não sobe até a versão ATIVA mais recente do especialista (isso é
  trabalho de `Fabrica.Equipe.resolver/2`, que consulta o banco; ver moduledoc do módulo
  novo). Um especialista pré-carregado que não está mais `ativo` cai no genérico e registra
  o defeito, comportamento de `Resolucao.resolver/3` — testado (`especialista inativo cai no
  generico e registra o defeito`).
- A faixa `:indice` chama `Fabrica.Indice.Mapa.extrair(raiz: tarefa.projeto.caminho) |>
  Mapa.render/1` — leitura de disco do projeto ALVO (não desta fábrica-v2), local e
  determinística, na mesma classe de "sem custo de modelo" que já justifica o índice denso
  existir. `tarefa.projeto` precisa vir pré-carregado (`Repo.preload`), como todo o resto —
  o módulo não chama `Repo` em lugar nenhum (mesma doutrina de `Fabrica.Publicacao.Markdown`,
  ver moduledoc).
- Modelo default `"sonnet-5"` (opção `opcoes[:modelo]`, só usado para o aviso de mínimo
  cacheável do `Prefixo`).
- Ferramentas: o mapa devolvido por `Catalogo.do_papel/1` é passado DIRETO como parte
  `:ferramentas` do `Prefixo.montar/2` — `Bloco.serializar/1` já ordena mapas
  deterministicamente, sem formatação manual.

**Impedimento parcial no critério 4 — não é defeito desta tarefa:**
`mix fabrica.ci` reprova no estágio `tipos` (Dialyzer), mas os 6 avisos são **pré-existentes
e fora das `areas` desta tarefa**: `lib/fabrica/cota.ex` (3×`unmatched_return`),
`lib/fabrica/fila/resgate.ex:66`, `lib/fabrica/fila/trabalho.ex:109`
(`call_without_opaque`), `lib/fabrica/piloto/servidor.ex:195`,
`lib/fabrica_web/live/console_live.ex:52,53`, `lib/fabrica_web_live/quadro_live.ex:43` e
`lib/mix/tasks/fabrica.importar.ex:644`. Verificado: movendo `lib/fabrica/despacho.ex` e
`test/fabrica/despacho_test.exs` para fora da árvore e rodando `mix dialyzer` sozinho, os
MESMOS 6 avisos aparecem, byte a byte — nenhum deles cita `Despacho`. Corrigi-los está fora
das `areas` desta tarefa (violaria o confinamento) e é trabalho não relacionado a este
despacho; registrado aqui para o orquestrador decidir se abre tarefa própria para a dívida
de Dialyzer.

`formato`, `compilar`, `lint` e `testes` passam. Bloco `tipos` reproduzido acima é o único
que falha, e por causa alheia a este código.

**Reproduzir:** `mix test test/fabrica/despacho_test.exs` (9 testes, 0 falhas).
`mix credo --strict lib/fabrica/despacho.ex test/fabrica/despacho_test.exs` (0 problemas).

**Commit:** `0fed4b0`

### Ciclo 2 — retrabalho (executor reforçado, 2026-09-21)

**Causa raiz da reprovação, em uma frase:** a passada mecânica reprovou APENAS no estágio
`tipos` (`mix dialyzer`), por dívida de Dialyzer **pré-existente em 7 arquivos fora das
`areas` desta tarefa** — o deliverable `Fabrica.Despacho` não é citado uma única vez pelo
Dialyzer.

**Medido (não palpite):**
- `git show --stat 0fed4b0`: T-066 adicionou SÓ `lib/fabrica/despacho.ex` e
  `test/fabrica/despacho_test.exs` (+ `_gestao/`). Não tocou nenhum dos arquivos abaixo.
- `mix dialyzer 2>&1 | grep -ci despacho` → **0**. O Dialyzer nunca nomeia `Despacho`.
- `Total errors: 12, Skipped: 2` → 10 erros reais, todos fora das `areas`:
  - `lib/fabrica/cota.ex:267,302,309` — `unmatched_return`
  - `lib/fabrica/fila/resgate.ex:66` — `unmatched_return`
  - `lib/fabrica/fila/trabalho.ex:109` — `call_without_opaque`
  - `lib/fabrica/piloto/servidor.ex:195` — `unmatched_return`
  - `lib/fabrica_web/live/console_live.ex:52,53` — `unmatched_return`
  - `lib/fabrica_web/live/quadro_live.ex:43` — `unmatched_return`
  - `lib/mix/tasks/fabrica.importar.ex:644` — `pattern_match` (cláusula morta)
- Os outros 4 estágios (`formato`, `compilar`, `lint`, `testes`) passam; os 9 testes de
  `despacho_test.exs` passam. Critérios de aceite 1, 2 e 3 estão satisfeitos.

**Aproveitamento:** 100% do ciclo 1 mantido. Zero linha de código alterada — não há o que
corrigir em `Despacho`: a causa é externa a ele.

**Por que não corrijo aqui (não é escolha, é confinamento):** esses são defeitos REAIS (a
mesma classe de `unmatched_return`/`pattern_match` que o `_comentario` do `ci.json` celebra
o Dialyzer por pegar), não falsos positivos — silenciá-los no `.dialyzer_ignore.exs` seria
doutrinariamente errado (a lista só admite falso positivo com causa entendida) E fora das
`areas`. Corrigi-los nos 7 arquivos também está fora das `areas`: `Fabrica.Publicacao.Git`
recusa commit com alteração fora das `areas` (anti-vazamento da v1), então o fix ficaria
não-commitado e a mecânica reprovaria idêntica contra o HEAD — o loop de confinamento
documentado em T-040/T-045.

**Veredito — BLOQUEIO, não re-despacho.** O critério 4 (`mix fabrica.ci` verde) é
inatingível por T-066 isolada: a bateria está GLOBALMENTE vermelha por dívida de tipos
acumulada — o mesmo cenário do `ci.json` (bateria vermelha da T-019 à T-022a sem ninguém
ver, porque as tarefas rodavam `mix verificar`, que não inclui `tipos`). T-066 é
simplesmente a primeira a rodar `mix fabrica.ci` COMPLETO e a esbarrar nela.
Re-despachar T-066 sem tocar nesses 7 arquivos vai reprovar byte a byte de novo.

**Recomendação ao orquestrador (replanejar, não re-despachar):** abrir uma tarefa de
limpeza de dívida de Dialyzer escopada aos 7 arquivos/10 defeitos acima (são triviais:
casar/descartar retorno explicitamente, remover a cláusula morta em `importar.ex:644`, e
decidir `resgate.ex:66`/`trabalho.ex:109` — `call_without_opaque` do par Ecto.Multi, que
pode ir para `.dialyzer_ignore.exs` como os já listados, ou ser reescrito). Com a bateria
verde, T-066 passa sem nenhuma mudança de código — critérios 1-3 e os 4 estágios não-`tipos`
já estão verdes hoje.

### Ciclo 3 — retrabalho (executor reforçado, 2026-09-21)

**Causa raiz, em uma frase (idêntica ao ciclo 2, agora MEDIDA duas vezes):** `mix fabrica.ci`
reprova SÓ no estágio `tipos` por dívida de Dialyzer **pré-existente em 7 arquivos fora das
`areas` desta tarefa**; `Fabrica.Despacho` não é citado uma única vez.

**Evidência fresca deste ciclo (não reaproveitada do ciclo 2):**
- `mix dialyzer` → `Total errors: 12, Skipped: 2` (10 erros reais), byte a byte os mesmos 7
  arquivos/10 defeitos do ciclo 2: `cota.ex:267,302,309`, `fila/resgate.ex:66`,
  `fila/trabalho.ex:109`, `piloto/servidor.ex:195`, `console_live.ex:52,53`,
  `quadro_live.ex:43`, `mix/tasks/fabrica.importar.ex:644`. **Nenhum cita `Despacho`.**
- `mix test test/fabrica/despacho_test.exs` → **9 testes, 0 falhas**. Critérios 1, 2 e 3 verdes.
- `git log` desde o ciclo 2: **nenhuma tarefa de limpeza de dívida landou**; os 7 arquivos
  estão intactos. Nada mudou entre o bloqueio anterior e este re-despacho.

**Aproveitamento:** 100% do ciclo 1. Zero linha alterada — não há o que corrigir em `Despacho`.

**Por que não corrijo os 7 arquivos:** estão fora das `areas`, e o guard de commit da fábrica
(`Fabrica.Publicacao.Git`) recusa alteração fora das `areas` — o fix ficaria não-commitado e a
mecânica reprovaria idêntica contra o HEAD (loop de confinamento T-040/T-045). São defeitos
REAIS (não falso positivo), então silenciá-los no `.dialyzer_ignore.exs` seria doutrinariamente
errado E também fora das `areas`.

**Veredito — BLOQUEIO (2º idêntico). O loop é a descoberta.** O critério 4 (`mix fabrica.ci`
verde) é **estruturalmente inatingível** por T-066 confinada a 2 arquivos que o Dialyzer nem
menciona. Re-despachar T-066 sem mudar nada mais vai reprovar byte a byte — já medi isso duas
vezes. **Não gaste a 3ª tentativa re-despachando: a próxima ação tem de ser do orquestrador,
não do executor.**

**O orquestrador precisa escolher UMA antes de re-tocar T-066:**
1. Criar/concluir uma tarefa de limpeza de dívida de Dialyzer escopada aos 7 arquivos/10
   defeitos acima (triviais: casar/descartar retorno explícito; remover a cláusula morta em
   `importar.ex:644`; decidir `resgate.ex:66`/`trabalho.ex:109` — `call_without_opaque` do par
   Ecto.Multi, candidato a `.dialyzer_ignore.exs` como os já listados). Com a bateria verde,
   T-066 passa **sem nenhuma mudança de código** — critérios 1-3 e os 4 estágios não-`tipos` já
   estão verdes hoje.
2. Se a intenção do critério 4 era "os estágios que ESTA tarefa toca passam", corrigir o texto
   do critério — hoje ele exige a bateria global, que está vermelha por dívida alheia.

### Intervencao do orquestrador (2026-09-22) — o criterio era impossivel

**Causa raiz das tres reprovacoes: o criterio, nao a entrega.** O 4o criterio pede
`mix fabrica.ci` (bateria COMPLETA), que falha no estagio `tipos` com **Total errors: 12**. Os
doze erros estao em `cota.ex`, `fila/resgate.ex`, `fila/trabalho.ex`, `piloto/servidor.ex`,
dois LiveViews e `fabrica.importar.ex` — **nenhum** nas `areas` desta tarefa
(`lib/fabrica/despacho.ex`, `test/fabrica/despacho_test.exs`). Para cumprir o criterio o
construtor teria de editar sete arquivos alheios, violando o mutex do paralelismo. A tarefa era
insatisfazivel por construcao, e nenhum dos tres ciclos tinha como mudar isso.

**E o construtor nem sabia disso.** O corte de saida do painel guardava so os primeiros 2.000
caracteres, e o Dialyzer gasta esse orcamento listando as 48 aplicacoes do PLT e os caminhos
dos `.beam`. O que chegava ao agente era essa lista e a frase "saida cortada": zero dos 12
erros. Tres construtores — o terceiro em `opus` — foram mandados consertar um defeito que
ninguem lhes disse qual era. Corrigido na raiz da fabrica (`cortar` agora preserva as duas
pontas, com dois tercos reservados para o FIM, onde ferramenta de linha de comando poe o
veredito).

**O que foi feito aqui:**
- `tentativas: 3` -> `1`. Houve UM ciclo de construcao real (commit `0fed4b0`, que entregou
  `Fabrica.Despacho` e passou nos tres primeiros criterios); os outros dois foram gastos contra
  o criterio impossivel. Deixar em 3 bloquearia a tarefa na proxima rodada por uma falha que
  nao e dela.
- `T-071` acrescentada as `dependencias`. E a tarefa corretiva que zera os 12 erros; enquanto
  ela nao fechar, o 4o criterio desta tarefa continua insatisfazivel — e o mesmo vale para
  T-017b, T-020b, T-067, T-068, T-069 e T-070, que declaram o mesmo comando.

**A regra da casa que isto exercita:** criterio e a unica coisa que o construtor nao pode
consertar, e a autoridade sobre ele e do orquestrador e do planejador. A baixa NAO foi dar
`--rapido` ao comando: o `ci.json` explica por extenso por que pular `tipos` antes de concluir
foi o que deixou a bateria vermelha da T-019 a T-022a sem ninguem ver. A regra fica; a divida
e que sai.

Nenhuma linha de codigo desta tarefa foi tocada nesta intervencao.

### Represada pelo orquestrador ate a T-071 (2026-09-22)

Esta tarefa declara `verificar: mix fabrica.ci` (bateria COMPLETA), e a bateria esta VERMELHA:
o estagio `tipos` acusa 12 erros de Dialyzer, todos em arquivos FORA das `areas` desta tarefa
(`cota.ex`, `fila/resgate.ex`, `fila/trabalho.ex`, `piloto/servidor.ex`, dois LiveViews e
`fabrica.importar.ex`). Nenhum construtor pode cumprir esse criterio sem furar o mutex do
paralelismo — a tarefa e insatisfazivel enquanto a divida existir.

Medido antes de represar: a T-066 queimou TRES ciclos assim, um deles em `opus`, sem que o
agente sequer recebesse a lista de erros (o corte de saida guardava so o preambulo do
Dialyzer). Sete tarefas herdaram o mesmo criterio; represa-las custa zero e despacha-las
custaria tres ciclos cada.

`T-071` (zerar os 12 erros) entrou nas `dependencias` e o status voltou a `backlog`. O motor
repromove sozinho quando ela fechar — nao ha nada a fazer a mao depois disso.

### Ciclo 4 — represa liberada pela T-071 (2026-09-22)

**Causa raiz dos tres ciclos anteriores já estava resolvida antes de eu tocar nesta tarefa:**
a T-071 zerou os 10 erros de Dialyzer acumulados nos 7 arquivos fora das `areas` (commit
`c4bd797`) e confirmou verificação completa (`779de61`). O orquestrador já tinha repromovido
o frontmatter de `backlog` para `pronta` quando assumi.

**Zero linha de código alterada** em `lib/fabrica/despacho.ex` ou `test/fabrica/despacho_test.exs`
— a entrega do ciclo 1 (commit `0fed4b0`) já satisfazia os critérios 1-3, e o único obstáculo
(critério 4, bateria completa) era a dívida alheia agora zerada.

**Medido neste ciclo:**

```
mix fabrica.ci
  formato    ok        3.1s
  compilar   ok        2.8s
  lint       ok        9.6s
  testes     ok       63.4s
  tipos      ok       18.6s
bateria passou: 5 estagio(s) ok, 0 pulado(s)
```

Os 4 critérios de aceite estão satisfeitos.

**Reproduzir:** `mix fabrica.ci` (bateria completa, 5/5 estágios ok).

**Commit:** `4438244`

## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] `Fabrica.Despacho.montar/4` devolve as quatro faixas na ordem que `Prompt.Bloco.especies/0` define, com a faixa `:tarefa` por último e sem ponto de cache. — `mix test test/fabrica/despacho_test.exs` → **PASSOU**
- [executado] Papel desconhecido devolve erro, nunca ferramentas vazias em silêncio. — `mix test test/fabrica/despacho_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Tarefa com especialista da equipe: a doutrina inclui o bloco `<especialista>` (mesmo mecanismo de `Equipe.Resolucao.doutrina/2`). — `mix test test/fabrica/despacho_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] `mix fabrica.ci` passa (formato, compilação, lint, testes, tipos). — `mix fabrica.ci` → **FALHOU**

```
bateria de verificacao — 5 estagios declarados

  ... formato: mix format --check-formatted
  ... compilar: mix compile --warnings-as-errors
  ... lint: mix credo --strict
  ... testes: mix test
  ... tipos: mix dialyzer


  formato    ok        2.8s
  compilar   ok        2.8s
  lint       ok        9.9s
  testes     ok       65.8s
  tipos      FALHOU   16.5s


Finding suitable PLTs
Checking PLT...
[:asn1, :bandit, :compiler, :crypto, :db_connection, :decimal, :dns_cluster, :ecto, :ecto_sql, :eex, :elixir, :esbuild, :ex_unit, :fabrica, :file_system, :finch, :hpax, :inets, :jason, :kernel, :logger, :mime, :mint, :mix, :nimble_options, :nimble_pool, :oban, :phoenix, :phoenix_ecto, :phoenix_html, :phoenix_live_dashboard, :phoenix_live_reload, :phoenix_live_view, :phoenix_pubsub, :phoenix_template, :plug, :plug_crypto, :postgrex, :public_key, :req, :runtime_tools, :ssl, :stdlib, :tailwind, :telemetry, :telemetry_metrics, :telemetry_poller, :thousand_island, :websock, :websock_adapter]
PLT is up to date!
ignore_warnings: .dialyzer_ignore.exs

Starting Dialyzer
[
  check_plt: false,
  init_plt: ~c"c:/Users/enzoconsulo/Documents/Generic-Multi-Agents/projetos/fabrica-v2/_build/dev/dialyxir_erlang-28.1_elixir-1.19.4_deps-dev.plt",
  files: [~c"c:/Users/enzoconsulo/Documents/Generic-Multi-Agents/projetos/fabrica-v2/_build/dev/lib/fabrica/ebin/Elixir.Fabrica.Tarefas.Fila.Passo.beam",
   ~c"c:/Users/enzoconsulo/Documents/Generic-Multi-Agents/projetos/fabrica-v2/_build/dev/lib/fabrica/ebin/Elixir.Fabrica.Tarefas.Area.beam",
   ~c"c:/Users/enzoconsulo/Documents/Generic-Multi-Agents/projetos/fabrica-v2/_build/dev/lib/fabrica/ebin/Elixir.Fabrica.Projetos.Fase.beam",
   ~c"c:/Users/enzoconsulo/Documents/Generic-Multi-Agents/projetos/fabrica-v2/_build/dev/lib/fabrica/ebin/Elixir.Fabrica.Criterios.beam",
   ~c"c:/Users/enzoconsulo/Documents/Generic-Multi-Agents/projetos/fabrica-v2/_build/dev/lib/fabrica/ebin/Elixir.Fabrica.Operario.Falso.beam",
   ...],
  ...
]
Total errors: 12, Skip
… (saída cortada)
```


Graus de prova: 5 executado(s), 0 para julgamento (de 5).

### Ciclo 5 — verificação (testador, 2026-09-22)

**Status anterior:** em-teste. Tarefa reprovada nos ciclos 1-3 por critério impossível (dívida de Dialyzer alheia), liberada pela T-071 (ciclo 4, onde passou com bateria 5/5).

**Verificação independente do ciclo 4:** todos os critérios foram re-executados.

- **[PASSOU] [executado] Critério 1: `Fabrica.Despacho.montar/4` devolve as quatro faixas na ordem que `Prompt.Bloco.especies/0` define, com a faixa `:tarefa` por último e sem ponto de cache.**
  Comando: `mix test test/fabrica/despacho_test.exs`
  Saída: 9 tests, 0 failures

- **[PASSOU] [executado] Critério 2: Papel desconhecido devolve erro, nunca ferramentas vazias em silêncio.**
  Comando: `mix test test/fabrica/despacho_test.exs`
  Saída: teste "papel desconhecido — erro, nunca ferramentas vazias em silencio" passou (reaproveitado do comando acima)

- **[PASSOU] [executado] Critério 3: Tarefa com especialista da equipe: a doutrina inclui o bloco `<especialista>` (mesmo mecanismo de `Equipe.Resolucao.doutrina/2`).**
  Comando: `mix test test/fabrica/despacho_test.exs`
  Saída: testes "com especialista da equipe" passaram (reaproveitados do comando acima)

- **[PASSOU] [executado] Critério 4: `mix fabrica.ci` passa (formato, compilação, lint, testes, tipos).**
  Comando: `mix fabrica.ci`
  Saída: bateria passou: 5 estagio(s) ok, 0 pulado(s) — formato ok, compilar ok, lint ok, testes ok (41 doctests, 1071 tests, 0 failures), tipos ok

Suíte completa: 41 doctests, 1071 tests, 0 failures — `mix test`
Graus de prova: 4 executado(s), 0 para julgamento (de 4 critérios).



## Conformidade

Conformidade: cumpre

- Critério 1 (quatro faixas na ordem de `Bloco.especies/0`, `:tarefa` por último e sem
  ponto de cache) → `lib/fabrica/despacho.ex` (`montar/4`, chama `Prefixo.montar/2` com as
  quatro partes) + `test/fabrica/despacho_test.exs:79-89` ("tarefa por ultimo e sem ponto de
  cache"), verde (`mix test test/fabrica/despacho_test.exs` → 9 testes, 0 falhas).
- Critério 2 (papel desconhecido → erro, nunca ferramentas vazias) →
  `lib/fabrica/despacho.ex` (`case Catalogo.do_papel(...) do {:erro, motivo} -> {:erro, motivo}`)
  + teste "papel desconhecido — erro, nunca ferramentas vazias em silencio", verde.
- Critério 3 (tarefa com especialista → bloco `<especialista>` na doutrina) →
  `lib/fabrica/despacho.ex` (`doutrina/3` delega a `Resolucao.resolver/3` +
  `Resolucao.doutrina/2`) + teste "a doutrina inclui o bloco <especialista>", verde.
- Critério 4 (`mix fabrica.ci` passa) → medido no Ciclo 4 (5/5 estágios ok) e
  reconferido de forma independente no Ciclo 5 pelo testador (mesma bateria, mesmo
  resultado). Não reexecutei a bateria completa (não é meu papel refazer o que o testador
  já mediu duas vezes); confirmei que o diff do Ciclo 4 é só `_gestao/` (nenhuma linha de
  `lib`/`test` mudou desde `0fed4b0`) e que `mix test test/fabrica/despacho_test.exs`
  continua verde.

O deliverable respeita as `areas` declaradas: o diff de `0fed4b0` (o único commit que toca
código) mexe só em `lib/fabrica/despacho.ex` e `test/fabrica/despacho_test.exs`. O Objetivo
da tarefa — montar a mensagem inicial a partir de tarefa+papel, compondo as quatro peças já
prontas (`Prompt.Prefixo`, `Equipe.Resolucao`, `Ferramentas.Catalogo`, `Indice.Mapa`) — é
cumprido no espírito, não só na letra: o módulo não reimplementa nenhuma das quatro peças,
só as costura, exatamente como o Contexto (D-006) pedia. Sem sobra de escopo: nenhuma
função além de `montar/4` e os helpers privados que ela usa.

Não há prova visual a verificar — esta tarefa não produz interface.

## Revisão

Aprovado sem ressalvas. Verifiquei:

- O diff de `0fed4b0` (`lib/fabrica/despacho.ex` + `test/fabrica/despacho_test.exs`)
  inteiro, e o diff de `4438244` (só `_gestao/MAPA.md` e o próprio arquivo da tarefa — zero
  código, como as Notas de execução afirmam).
- A ordem e a marca de ponto de cache: `Bloco.novo/3` já marca `ponto_de_cache: especie !=
  :tarefa` por padrão (`lib/fabrica/prompt/bloco.ex`), e `Despacho.montar/4` não sobrescreve
  essa opção — o comportamento esperado pelo teste vem de um invariante já existente, não de
  lógica nova que pudesse estar errada.
- `doutrina/3`: usa `tarefa.especialista && tarefa.especialista.identificador` — se
  `tarefa.especialista` não vier pré-carregado, o Ecto devolve `%Ecto.Association.NotLoaded{}`
  (verdadeiro para `&&`), e o acesso a `.identificador` estoura com `KeyError`. Isto é
  documentado no moduledoc como comportamento INTENCIONAL ("um prefixo montado parcialmente é
  pior que um erro na hora"), na mesma doutrina de `Fabrica.Publicacao.Markdown` — não é
  achado, é decisão de design coerente com o resto do projeto.
- `indice/1` chama `Mapa.extrair(raiz: tarefa.projeto.caminho) |> Mapa.render()` — assinaturas
  conferem com `lib/fabrica/indice/mapa.ex` (`extrair/1`, `render/1`). Testado com um projeto
  de verdade em diretório temporário; o teste confirma que o índice é do projeto ALVO, não
  desta fábrica-v2.
- `criterios/1` ordena por `&1.id` (chave primária auto-incremento, não um campo de sequência
  próprio) — aproxima a ordem de criação, comportamento razoável e sem cenário de falha
  concreto associado.
- Rodei `mix test test/fabrica/despacho_test.exs` eu mesmo: 9 testes, 0 falhas.

Nenhum achado `critica` ou `importante`. Nenhuma roda artesanal reinventada — o módulo é
pura composição do que já existe.
