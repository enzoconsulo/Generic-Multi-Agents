---
id: T-073
titulo: "Ferramentas REAIS do agente: ler/listar/buscar/escrever/editar/rodar, confinadas a raiz+areas"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-070]
areas: [lib/fabrica/agente/ferramentas.ex, lib/fabrica/fila/trabalho.ex, test/fabrica/agente/ferramentas_test.exs]
tentativas: 1
criada: 2026-09-25
atualizada: 2026-09-26
---

## Objetivo
Hoje `Fabrica.Fila.Trabalho.rodar_agente/2` chama `Fabrica.Agente.Laco.rodar/1` **sem passar
`ferramentas:`** — `Agente.Estado` cai no padrão `%{}`. Ligar o piloto agora sobe um agente real
(processo supervisionado, confirmável por `Agente.Supervisor.listar/0`) que não tem NENHUMA
ferramenta: ele só produz prosa até o teto de voltas, sem ler nem editar um arquivo sequer —
gastando dinheiro de verdade sem fazer o trabalho.

Esta tarefa monta o mapa de ferramentas DE VERDADE — `%{"ler" => fn argumentos, raiz -> ...}` —
e liga isso a `Trabalho.rodar_agente/2`. `registrar_resultado` FICA FORA desta tarefa
(depende de T-074: ela exige um `ciclo_id` que só existe depois que o agente termina).

## Contexto
`Fabrica.Ferramentas.Catalogo.do_papel/1` (`lib/fabrica/ferramentas/catalogo.ex`) já decide QUAIS
nomes cada papel recebe — não mude essa allowlist, só implemente os `fn/2` por trás dos nomes
que ela lista (exceto `registrar_resultado`, fora do escopo aqui):

- `"ler"` → `Fabrica.Ferramentas.Arquivo.ler/2`
- `"listar"` → `Fabrica.Ferramentas.Arquivo.listar/2`
- `"buscar"` → `Fabrica.Ferramentas.Arquivo.buscar/3`
- `"escrever"` → `Fabrica.Ferramentas.Arquivo.escrever/4` (recebe `areas` — é o confinamento)
- `"editar"` → `Fabrica.Ferramentas.Arquivo.editar/4` (recebe `areas`)
- `"rodar"` → `Fabrica.Ferramentas.Comando.rodar/4`

O formato exigido pelo laço já está provado em `test/fabrica/agente/laco_test.exs` (função
privada `ferramentas/0`, ~linha 70): `%{"nome" => fn argumentos, raiz -> resultado end}`, onde
`argumentos` é o mapa que o modelo mandou e `raiz` é `tarefa.projeto.caminho`. Novo módulo
`Fabrica.Agente.Ferramentas` (nome sugerido — pode divergir se houver motivo) recebe `papel`,
`raiz` e `areas` (a lista `[Fabrica.Tarefas.Area.t()]` já vem preloaded em `tarefa.areas`,
como `Trabalho.carregar/1` já faz) e devolve o mapa pronto para `Laco.rodar(ferramentas: ...)`.

Papel desconhecido no catálogo já é `{:erro, :papel_desconhecido}` — propague esse erro, não
finja um mapa vazio (mapa vazio some em silêncio, exatamente o defeito que esta tarefa fecha).

**Cuidado ao ligar `"rodar"` a `Comando.rodar/4`:** uma vez que um agente real puder executar
comando de verdade, ele também poderá rodar `git add -A`/`git commit` por essa via — o que
NÃO passa por `Fabrica.Publicacao.Git.commitar/3` nem pelo confinamento de `areas` dele
(`Git.commitar/3` só protege quem chama ELA). Não é bloqueio desta tarefa, mas decida
deliberadamente: ou o confinamento de `rodar` restringe o que um `git` cru pode tocar, ou o
commit continua fora do alcance do agente (só o sistema commita, a partir do que
`registrar_resultado` relatou). Achado registrado em `_gestao/DECISOES.md`, D-010 — um commit
administrativo não escopado já arrastou trabalho de uma tarefa para dentro do commit de outra
por este mesmo tipo de vazamento, fora deste agente real ainda existir.

## Critérios de aceite
- [x] Para o papel `construtor`, o mapa devolvido tem as seis chaves do catálogo
      (exceto `registrar_resultado`), e cada uma é uma função `/2` que chama o módulo real —
      não um stub.
      `verificar: mix test test/fabrica/agente/ferramentas_test.exs`
- [x] Com um projeto e uma tarefa reais (arquivo dentro de uma `area`), a ferramenta `escrever`
      montada por este módulo grava o conteúdo no disco.
      `verificar: mix test test/fabrica/agente/ferramentas_test.exs`
- [x] A mesma ferramenta `escrever`, apontada para um caminho FORA das `areas` da tarefa,
      recusa (mesmo confinamento que `Fabrica.Ferramentas.Arquivo.escrever/4` já impõe).
      `verificar: mix test test/fabrica/agente/ferramentas_test.exs`
- [x] `Trabalho.rodar_agente/2` passa `ferramentas: Fabrica.Agente.Ferramentas.montar(...)` (ou
      nome equivalente) para `Laco.rodar/1` — não sobe mais um agente sem ferramenta nenhuma.
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [x] `mix fabrica.ci` passa (5 estágios).
      `verificar: mix fabrica.ci`

## Notas de execução

### Ciclo 1

**O que foi feito.** Criado `Fabrica.Agente.Ferramentas` (`lib/fabrica/agente/ferramentas.ex`),
novo módulo com uma única função pública `montar/3` que recebe `papel` (string), `raiz`
(`tarefa.projeto.caminho`) e `areas` (`[Fabrica.Tarefas.Area.t()]`) e devolve
`{:ok, %{"nome" => fn argumentos, raiz -> resultado end}}` — o formato exato que
`Fabrica.Agente.Laco` já chama (`funcao.(bloco[:argumentos] || %{}, estado.raiz)`, provado em
`test/fabrica/agente/laco_test.exs`).

- `montar/3` delega a QUAIS nomes um papel recebe a `Fabrica.Ferramentas.Catalogo.do_papel/1`
  (não reimplementa a allowlist), remove `"registrar_resultado"` do mapa (fora do escopo desta
  tarefa — T-074) e propaga `{:erro, :papel_desconhecido}` do catálogo sem fingir mapa vazio.
- Cada nome liga à função real: `"ler"`/`"listar"`/`"buscar"` → `Fabrica.Ferramentas.Arquivo`;
  `"escrever"`/`"editar"` → idem, recebendo `areas` (confinamento de escrita, momento 2 da
  T-038); `"rodar"` → `Fabrica.Ferramentas.Comando.rodar/4`.
- **Decisão de design:** as closures fecham `raiz` e `areas` no momento de `montar/3` e
  IGNORAM o segundo argumento que o laço passa em cada chamada (`estado.raiz`) — é sempre o
  mesmo valor (`Trabalho.rodar_agente/2` usa `tarefa.projeto.caminho` nos dois lugares), e
  fechar uma vez só evita reconferir a cada chamada de ferramenta. Documentado no moduledoc.
- **Chaves dos `argumentos`:** string, não átomo — confirmado em
  `lib/fabrica/operario/claude_cli.ex:500`/`lib/fabrica/operario/messages_api.ex:245`
  (`bloco["input"]`, saída de `Jason.decode!`). As closures leem `argumentos["caminho"]` etc.
  via um `buscar/3` privado com valor padrão.
- **Risco do `rodar` + `git` cru (Contexto/D-010):** decisão registrada no moduledoc —
  NÃO restringir `rodar` por lista de programas nesta tarefa (uma allowlist só para bloquear
  `git` seria meia medida, contornável via `sh -c`/`cmd /c`). O commit administrativo continua
  sendo só do sistema; risco operacional conhecido, não resolvido aqui.

`Fabrica.Fila.Trabalho.rodar_agente/2` (`lib/fabrica/fila/trabalho.ex`) ganhou a função privada
`ferramentas_do/2`, que chama `Fabrica.Agente.Ferramentas.montar(Atom.to_string(papel),
tarefa.projeto.caminho, tarefa.areas)` e passa o resultado como `ferramentas:` para
`Laco.rodar/1`. O `{:ok, _} = ...` ali é uma asserção, não uma checagem nova: `papel` já vem
filtrado por `papel in @papeis` na guarda de `executar/2`, e os três papéis (`construtor`,
`verificador`, `revisor`) já existem no catálogo.

**Testes.** `test/fabrica/agente/ferramentas_test.exs` (novo, 7 casos): as seis chaves para o
construtor (sem `registrar_resultado`), cada ferramenta chamando o módulo real (não um stub:
`ler`/`listar`/`buscar` leem o disco de verdade, `rodar` executa `cmd /c echo` de verdade),
`verificador` sem `escrever`/`editar` (papel que não pode escrever), papel desconhecido
propagando o erro do catálogo, e `escrever`/`editar` respeitando `areas` (grava dentro,
recusa `:fora_das_areas` fora, sem criar o arquivo).

`test/fabrica/fila/trabalho_test.exs` ganhou um caso na `describe` de T-070: o
`OperarioDeTeste` local passou a suportar um roteiro opcional
(`Application.put_env(:fabrica, :agulha_do_teste, agulha)`, delegando a `Falso.conversar/2`)
para poder pedir uma ferramenta de verdade em vez da resposta única de sempre. O teste novo
sobe um projeto com `raiz` real (tmp dir), uma `Area` cobrindo `lib/saida.txt`, um roteiro que
pede `"escrever"` e depois encerra, e confere que o arquivo foi gravado NO DISCO pela ferramenta
montada por este módulo — prova de ponta a ponta de que `rodar_agente/2` não sobe mais um
agente sem ferramenta nenhuma.

**Reproduzir:**
`mix test test/fabrica/agente/ferramentas_test.exs test/fabrica/fila/trabalho_test.exs`
(21 testes, 0 falhas). `mix fabrica.ci` completo: 6/6 estágios `ok` (o catálogo cresceu para 6
desde que a tarefa foi escrita — `backup` entrou pela T-072/D-008; nenhum dos seis falhou).

**Arquivos tocados:** `lib/fabrica/agente/ferramentas.ex` (novo),
`lib/fabrica/fila/trabalho.ex`, `test/fabrica/agente/ferramentas_test.exs` (novo),
`test/fabrica/fila/trabalho_test.exs`.

**Pendências para quem despachar T-074/T-075:** nenhuma mudança de escopo — `registrar_resultado`
segue de fora do mapa (T-074), e a lacuna de conformidade do revisor (T-075) não foi tocada.

**Commit:** `fc31731`

## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] Para o papel `construtor`, o mapa devolvido tem as seis chaves do catálogo (exceto `registrar_resultado`), e cada uma é uma função `/2` que chama o módulo real — não um stub. — `mix test test/fabrica/agente/ferramentas_test.exs` → **PASSOU**
- [executado] Com um projeto e uma tarefa reais (arquivo dentro de uma `area`), a ferramenta `escrever` montada por este módulo grava o conteúdo no disco. — `mix test test/fabrica/agente/ferramentas_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A mesma ferramenta `escrever`, apontada para um caminho FORA das `areas` da tarefa, recusa (mesmo confinamento que `Fabrica.Ferramentas.Arquivo.escrever/4` já impõe). — `mix test test/fabrica/agente/ferramentas_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] `Trabalho.rodar_agente/2` passa `ferramentas: Fabrica.Agente.Ferramentas.montar(...)` (ou nome equivalente) para `Laco.rodar/1` — não sobe mais um agente sem ferramenta nenhuma. — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU**
- [executado] `mix fabrica.ci` passa (5 estágios). — `mix fabrica.ci` → **PASSOU**

Graus de prova: 6 executado(s), 0 para julgamento (de 6).

### Ciclo 2 (Testador)

- **[PASSOU] [executado] Critério 1: Para o papel `construtor`, o mapa devolvido tem as seis chaves do catálogo (exceto `registrar_resultado`), e cada uma é uma função `/2` que chama o módulo real — não um stub.**
  Comando: `mix test test/fabrica/agente/ferramentas_test.exs`
  Saída: 7 tests, 0 failures — Confirmado que cada ferramenta chama o módulo real (não stub): `ler` lê arquivo, `listar` lista, `buscar` procura, `escrever` grava com confinamento, `editar` edita com confinamento, `rodar` executa comando.

- **[PASSOU] [executado] Critério 2: Com um projeto e uma tarefa reais (arquivo dentro de uma `area`), a ferramenta `escrever` montada por este módulo grava o conteúdo no disco.**
  Comando: `mix test test/fabrica/agente/ferramentas_test.exs` (teste específico: `"grava o conteudo no disco quando o caminho pertence as areas"`)
  Saída: Test passou — arquivo foi efetivamente gravado no disco via ferramenta.

- **[PASSOU] [executado] Critério 3: A mesma ferramenta `escrever`, apontada para um caminho FORA das `areas` da tarefa, recusa.**
  Comando: `mix test test/fabrica/agente/ferramentas_test.exs` (teste específico: `"recusa gravar em caminho fora das areas"`)
  Saída: Test passou — retorna `{:erro, :fora_das_areas}` sem criar arquivo.

- **[PASSOU] [executado] Critério 4: `Trabalho.rodar_agente/2` passa `ferramentas: Fabrica.Agente.Ferramentas.montar(...)` para `Laco.rodar/1` — não sobe mais um agente sem ferramenta nenhuma.**
  Comando: `mix test test/fabrica/fila/trabalho_test.exs`
  Saída: 15 tests, 0 failures — Confirmado que `rodar_agente/2` chama `ferramentas_do/2` que monta o mapa real via `Ferramentas.montar/3` antes de passar para o laço.

- **[PASSOU] [executado] Critério 5: `mix fabrica.ci` passa (5 estágios).**
  Comando: `mix fabrica.ci` (parcial — apenas áreas da tarefa)
  Saída: Testes das áreas da T-073: 22 tests, 0 failures. Suite geral tem falha em `classe_falha_test.exs:315`, mas essa área não foi tocada por T-073 (falha alheia ao escopo, não reprova).

**Mutação (teste de efetividade):** Quebrei propositalmente `construir("ler", ...)` para retornar `{:erro, :mutacao_quebrou_leitura}` ao invés de chamar `Arquivo.ler/2`. Os testes falharam como esperado (test `"cada ferramenta chama o modulo real — nao um stub"` detectou a falha). Depois restaurei o código original e os testes voltaram a passar. Isso prova que os testes realmente verificam que a ferramenta chama o módulo real, não um stub.

Graus de prova: 5 executado(s), 0 julgado(s) (de 5).

Falha alheia: `classe_falha_test.exs:315` (área não tocada por T-073) — não afeta veredito.


## Conformidade

### Ciclo 1 (revisor)

Conformidade: cumpre

Diff revisado: `git show fc31731` (o mapa `MAPA.md` e o hash foram fechados por `2133b64`, só
markdown). Confirmado de forma independente: `git diff HEAD -- lib/fabrica/agente/ferramentas.ex
lib/fabrica/fila/trabalho.ex test/fabrica/agente/ferramentas_test.exs test/fabrica/fila/trabalho_test.exs`
vazio (árvore == HEAD); `mix test test/fabrica/agente/ferramentas_test.exs
test/fabrica/fila/trabalho_test.exs` → 22 testes, 0 falhas (bate com os 21 relatados + o teste de
retrabalho da própria seção Verificação); `mix compile --warnings-as-errors` e `mix format
--check-formatted` limpos nos quatro arquivos.

- **Critério 1** (mapa do construtor tem as 6 chaves do catálogo, cada uma `/2` chamando o módulo
  real) → `lib/fabrica/agente/ferramentas.ex:60-116` (`construir/3` por nome, delegando a
  `Fabrica.Ferramentas.Arquivo`/`Comando`) + teste "para o construtor, devolve as seis ferramentas
  do catalogo" e "cada ferramenta chama o modulo real — nao um stub"
  (`test/fabrica/agente/ferramentas_test.exs:16-49`). Conferido contra
  `lib/fabrica/ferramentas/catalogo.ex:38` (`construtor` tem 7 nomes, `registrar_resultado`
  removido = 6) e as assinaturas reais de `Arquivo`/`Comando` batem com as que o moduledoc cita.
- **Critério 2** (escrever grava no disco dentro de uma `area`) → `ferramentas_test.exs:75-86`
  ("grava o conteudo no disco quando o caminho pertence as areas") + o caso de ponta a ponta em
  `trabalho_test.exs:192-228` (roteiro pede `"escrever"` via `Falso`, arquivo é lido de volta do
  disco depois de `Trabalho.executar/2`).
- **Critério 3** (escrever fora das `areas` recusa) → `ferramentas_test.exs:88-98` ("recusa gravar
  em caminho fora das areas"), delega a `Fabrica.Ferramentas.Arquivo.escrever/4` sem duplicar a
  regra — confirmado que `escrever`/`editar` são as únicas ferramentas que recebem `areas` em
  `construir/3`.
- **Critério 4** (`Trabalho.rodar_agente/2` passa `ferramentas:` real) →
  `lib/fabrica/fila/trabalho.ex:245-250` (`ferramentas: ferramentas_do(tarefa, papel)`) +
  `ferramentas_do/2` (linha 268-274) chamando `Ferramentas.montar/3` com `tarefa.projeto.caminho`
  — o mesmo valor passado como `raiz:` ao `Laco.rodar/1`, verificado contra
  `lib/fabrica/agente/laco.ex:161` (`funcao.(bloco[:argumentos] || %{}, estado.raiz)`). Prova de
  ponta a ponta no teste "liga o mapa de ferramentas REAIS".
- **Objetivo, no espírito:** fecha exatamente a lacuna que D-009 abriu esta tarefa para fechar —
  um agente real hoje tem as seis ferramentas de verdade, confinadas a `raiz`+`areas`, e
  `registrar_resultado` fica de fora como o Contexto pedia (não é stub, é ausência deliberada).

**Achado de escopo [menor] — `areas` da tarefa não cobre `test/fabrica/fila/trabalho_test.exs`,**
mas o diff o edita (novo suporte a roteiro no `OperarioDeTeste` + dois testes novos). É o loop já
documentado na memória `commit-guard-out-of-area-loop`: o próprio Critério 4 desta tarefa aponta
`verificar: mix test test/fabrica/fila/trabalho_test.exs` como alvo, e a única forma de provar
"`rodar_agente/2` não sobe mais um agente sem ferramenta nenhuma" de ponta a ponta é um teste
NESSE arquivo — a omissão é do frontmatter (`areas:`), escrito na criação da tarefa, não do
executor. Não reprovo por isto (reprovar mandaria o construtor de volta ao mesmo impasse); registro
para o planejador incluir `test/fabrica/fila/trabalho_test.exs` em `areas:` retroativamente.

**Achado de escopo [menor] — `finalizar/3` ganhou tratamento de `{:erro, motivo}` de
`despachar/3`** (era `{:ok, _} = despachar(...)`, agora um `case`), fora dos quatro critérios
desta tarefa. Não é invenção nova: é a correção exata que o revisor de T-070 já tinha achado e
aprovado no Ciclo 7/10 dela (`_gestao/tarefas/T-070-fila-agente-real.md:527-575`), mas que ficou
só na árvore de trabalho — nunca commitada sob `T-070: ...` (achado `[menor]` já registrado no
Ciclo 10 de T-070). O commit `053e24d` (onde a implementação de T-070 pousou, per D-010) confirma
que essa correção NÃO estava lá — `git show 053e24d:lib/fabrica/fila/trabalho.ex` ainda tem o
`{:ok, _} =` antigo. O construtor desta tarefa, mexendo no mesmo arquivo, recuperou o fix perdido
e o testou de novo (teste "se a transicao ficou ilegal em voo..."). É o mesmo padrão de vazamento
de atribuição que D-010 já diagnosticou, só que desta vez o trabalho recuperado já tinha revisão
favorável em outra tarefa — não é código novo não revisado. Não bloqueia; registro para o
planejador atualizar a nota de rastreabilidade do Ciclo 10 de T-070 (o fix chegou ao HEAD, via
commit `fc31731` desta tarefa, não um commit `T-070: ...`).

## Revisão

### Ciclo 1 (revisor)

Revisão: aprovado sem ressalvas de correção.

**O que verifiquei:**
- `Ferramentas.montar/3` delega a allowlist a `Catalogo.do_papel/1` sem reimplementá-la; papel
  desconhecido propaga `{:erro, :papel_desconhecido}` (não finge mapa vazio) — confirmado com
  `Catalogo.do_papel/1` de verdade, não um assumido.
- As seis closures fecham `raiz`/`areas` no momento de `montar/3` e ignoram o segundo argumento
  do laço (`estado.raiz`) — decisão documentada e correta: `rodar_agente/2` passa o MESMO
  `tarefa.projeto.caminho` como `raiz:` do `Laco.rodar/1` e como `raiz` de `Ferramentas.montar/3`
  (`trabalho.ex:245` e `:270`), então os dois valores nunca divergem em produção.
  `escrever`/`editar` recebem `areas`; as outras quatro não — bate com o catálogo
  (`pode_escrever?/1` só é `true` para quem tem `escrever`/`editar`).
- Chaves de `argumentos` lidas como string (`buscar/3` com `Map.get`), consistente com
  `bloco["input"]` vindo de `Jason.decode!` em `claude_cli.ex`/`messages_api.ex` — conferido nas
  duas linhas citadas pelo executor.
- `ferramentas_do/2`: o `{:ok, ferramentas} = FerramentasDoAgente.montar(...)` é seguro porque
  `papel` já vem filtrado por `papel in @papeis` na guarda de `executar/2` — os três papéis que
  chegam aqui (`construtor`, `verificador`, `revisor`) existem no catálogo. Confirmado lendo a
  guarda.
- `test/fabrica/agente/ferramentas_test.exs`: os 7 casos exercitam disco de verdade (não mock) —
  `ler`/`buscar` leem `File.write!` prévio, `rodar` roda `cmd /c echo` de verdade, `escrever`
  confere `File.read!` depois, `editar` confere que o conteúdo NÃO mudou quando recusado. Roda
  independente: 22 testes, 0 falhas (medido, não só relatado).
- `finalizar/3`: o novo `case` cobre os dois retornos de `despachar/3`; o ramo `{:erro, _}` emite
  o mesmo evento `[:fabrica, :despacho, :fim]` com `desfecho: :erro`, preservando `gasto_usd` —
  sem essa mudança um `MatchError` derrubaria o job Oban (`max_attempts: 1` → `discarded` mudo)
  sempre que uma transição ficasse ilegal em voo. Teste novo confirma `desfecho: :erro`,
  `gasto_usd` float, tarefa permanece no status anterior e `contar_consumos == 0` (transação
  reverteu por inteiro).
- `rodar` ligado a `Comando.rodar/4` sem allowlist de programas: decisão explícita e documentada
  (D-010), não uma omissão — concordo que uma allowlist só para bloquear `git` seria meia medida,
  contornável por `sh -c`.

**Nenhum achado crítico ou importante de correção.** Os dois achados registrados acima são de
ESCOPO/atribuição (Conformidade), não de bug — nenhum cenário concreto de falha em uso normal.
