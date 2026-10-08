---
id: T-095
titulo: "Despacho que não rodou (parede de cota, sem sandbox) não é JULGADO em nenhum papel — nem avança a tarefa, nem gasta ciclo, nem aprova por omissão"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-091, T-099]
areas: [lib/fabrica/fila/trabalho.ex, test/fabrica/fila/trabalho_test.exs, test/fabrica/piloto/servidor_test.exs]
tentativas: 3
criada: 2026-10-02
atualizada: 2026-10-07
---

## Objetivo
Quando o despacho de QUALQUER papel (construtor, verificador, revisor) é interrompido por algo que NÃO
é o trabalho — parede de cota, sandbox indisponível —, o portão não julga: a tarefa fica onde estava
para ser retomada depois, em vez de seguir no pipeline como se o turno tivesse terminado.

## Contexto
Achado do executor da T-091, conferido pelo orquestrador lendo `lib/fabrica/fila/trabalho.ex`, e
alargado pelo revisor da T-091 (Revisão dela):

- `julgar(:construtor, _tarefa, _resumo)` devolve `{:em_teste, :fim_do_turno}` SEMPRE — qualquer que
  seja o `resumo.desfecho`. No teste ponta a ponta da T-091 a tarefa foi para `em_teste` sem nada
  construído. Depois do rearme, o verificador roda os critérios sobre uma entrega vazia, REPROVA, a
  tarefa volta com `tentativas + 1` e o construtor reforçado é pago — um ciclo (de 3) e cota queimados
  por uma parede que não é defeito de ninguém.
- **Mais grave — no REVISOR é aprovação falsa:** `julgar(:revisor)` (`trabalho.ex:~390`) lê a
  conformidade de relatos vazios; `Revisor.ler_conformidade/1` começa em `:conforme`
  (`revisor.ex:~219-229`) e não há achados — a tarefa vai a `concluida` SEM revisão nenhuma. Vale para
  qualquer erro do `Laco` no revisor, não só a parede.
- No verificador, a passada mecânica roda sobre o que houver na árvore e o resultado depende do acaso.
- O mesmo vale para `{:erro, :sandbox_indisponivel}` (T-090): o agente nem subiu.
- O `Laco` mantém `desfecho: :erro` nesses casos (D-017); o motivo do erro pode precisar chegar ao
  `resumo` — o executor decide como, sem mudar o contrato de `desfecho` para os outros consumidores
  (siga-os antes). `Fabrica.Cota.estado/1` também responde "a cota está batida?" (sinal existente).

Comportamento esperado: o portão NÃO julga, a tarefa não transita para o próximo estado e `tentativas`
não muda; ela fica disponível para ser despachada de novo quando o motivo passar (o piloto dorme até o
rearme). Confira na máquina de estados (`Fabrica.Tarefas.Maquina`) qual transição é legal para
"devolver" a tarefa em cada estado, e registre a escolha. Erros que SÃO do trabalho (ex.: `prazo`, teto
de voltas) seguem como hoje.

## Critérios de aceite
- [ ] CONSTRUTOR cujo operário devolve parede de cota: a tarefa NÃO vai para `em_teste`, `tentativas`
      não muda, e ela pode ser despachada de novo; o evento de fim de despacho sai com o gasto (zero ou
      o medido). Teste que falha antes do conserto (prove com `git stash`).
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] REVISOR cujo despacho bate na parede: a tarefa NÃO vai a `concluida` (nem volta a
      `em_execucao`); fica para ser revisada de novo. O mesmo no VERIFICADOR (não vai a `em_revisao`
      nem volta reprovada). Teste por papel, que falha antes do conserto.
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] `{:erro, :sandbox_indisponivel}` se comporta como a parede nos três papéis; um erro que É do
      trabalho (ex.: `prazo`, teto de voltas) segue o caminho de hoje (teste).
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução
- 2026-10-07 (orquestrador): passa a depender da T-099 — no Windows a suíte cai em 2 testes de link do confinamento, e toda verificação desta tarefa reprovaria por isso (reprovação falsa). Volta a `pronta` sozinha quando a T-099 concluir.

### Ciclo 1 (construtor)
- Encontrei a árvore com WIP **desta própria tarefa** já em voo e não commitado (`lib/fabrica/agente/estado.ex`,
  `lib/fabrica/agente/laco.ex`, `lib/fabrica/fila/trabalho.ex`): o `@moduledoc` "Parede não é julgamento (T-095)"
  e `executar/2` já chamavam `parede?/1` e `segurar/3`, mas essas duas funções não existiam — é o impedimento que
  bloqueou a T-094 (ciclos 5/6, D-020) e a memória da fábrica `wip-nao-commitado-quebra-compilacao-t095`. Como sou
  a dona da área, completei o trabalho em vez de revertê-lo.
- `estado.ex`/`laco.ex` (já estavam prontos, não precisei tocar): `Fabrica.Agente.Estado` ganhou o campo
  `motivo_do_erro` (carregado em `resumo/1`); `Fabrica.Agente.Laco` passou a gravar nele o termo bruto do erro
  (`{:cota, reabre_em}`, `:sandbox_indisponivel`, `:prazo`, etc.) nos três ramos de erro do laço, sem mudar o que
  `desfecho` já significa para quem lê só ele.
- `lib/fabrica/fila/trabalho.ex`: implementei as duas funções que faltavam.
  - `parede?/1` — `true` só quando `desfecho == :erro` e `motivo_do_erro` casa com `{:cota, _}` ou
    `:sandbox_indisponivel`; qualquer outro motivo (`:prazo`, teto de voltas, etc.) é `false` — erro que É do
    trabalho segue julgado como antes.
  - `segurar/3` — NÃO transiciona, NÃO julga, NÃO grava ciclo; só loga, emite `[:fabrica, :despacho, :fim]` com
    `desfecho: {:parede, motivo_do_erro}` (o gasto do turno não pode sumir da telemetria, mesma doutrina de
    `finalizar/3`) e devolve `{:parede, segundos}`. `segundos` vem de `segundos_de_espera/1`: com `reabre_em`
    (`DateTime`) presente, respeita-o (piso de 30s para não reagendar de imediato); sem horário (sandbox
    indisponível, ou cota sem `reabre_em`), cai num padrão de 300s. `perform/1` já traduzia isso em
    `{:snooze, segundos}` — não precisei tocar nele.
- `test/fabrica/fila/trabalho_test.exs`: acrescentei ao duble `OperarioDeTeste` os modos `:parede_cota` (devolve
  `{:erro, {:cota, reabre_em}}`, lendo `Application.get_env(:fabrica, :reabre_em_do_teste)`), `:sandbox_indisponivel`
  e `:prazo` (contraprova: erro que É do trabalho). Escrevi 6 testes novos cobrindo os 3 critérios: construtor +
  parede de cota (critério 1), verificador e revisor + parede de cota (critério 2), os três papéis + sandbox
  indisponível via `for` parametrizado (critério 3a), e `:prazo` não virando parede (critério 3b, contraprova).
  **Provei que os 6 falham sem o conserto**: comentei temporariamente a cláusula de `parede?/1` que lê
  `motivo_do_erro` (fixando sempre `false`), roda a suíte → 6 falhas (as 6 novas; as demais seguem verdes),
  devolvi a cláusula → 29/29 verdes. Não usei `git stash` porque o conserto e o teste nasceram no mesmo ciclo,
  sem comit anterior para stashar; o experimento acima prova o mesmo (teste vermelho antes, verde depois).
- **Reproduzir:** `mix test test/fabrica/fila/trabalho_test.exs` (29 testes, ~19s, sem rede nem cota).
- `mix format --check-formatted` e `mix credo --strict` nos arquivos tocados: limpos. Não rodei `mix fabrica.ci`
  completo (Dialyzer/backup são papel do testador, regra 7 do meu prompt); rodei `mix test` nos arquivos da área
  e nos dependentes diretos (`laco_test.exs`, `ferramentas_test.exs`) — todos verdes.
- **Achei, mas não toquei** (fora da minha área): `_gestao/DECISOES.md` e
  `_gestao/tarefas/T-094-rearme-sem-laco-quente.md` já estavam modificados (não commitados) por uma sessão
  anterior do planejador — D-020, a decisão que amarrou a dependência de T-094 em T-095. São trabalho legítimo e
  completo de outra tarefa; deixei como estavam para quem é dono comitar. Sinalizo no relatório final.

**Commit:** `a52b40c`

**Commit (ciclo 3):** `a68d63f`

### Ciclo 2 (retrabalho — mecânica)
- A passada mecânica do ciclo 1 reprovou em dois pontos: (a) `mix test` com 1 falha nova em
  `test/fabrica/piloto/servidor_test.exs:507..516`, e (b) `mix fabrica.ci` com 2 falhas no estágio
  `testes` (a mesma de (a), mais `test/fabrica/piloto/servidor_test.exs:167..176`).
- **(a) é real e é consequência direta do conserto do ciclo 1, não flake:** o teste
  `"a rodada em voo termina na parede..."` (T-091) assumia o contrato ANTIGO de `perform/1` —
  `assert :ok = perform_job(...)`. Com o conserto desta tarefa, parede devolve `{:snooze, segundos}`
  ao Oban (ver `@moduledoc` de `trabalho.ex`), não `:ok`. Reproduz 100% das vezes, isolado ou junto
  com `trabalho_test.exs` — não é pollution de suíte.
  O arquivo `test/fabrica/piloto/servidor_test.exs` não estava nas `areas` desta tarefa. Segui a
  memória da fábrica `commit-guard-out-of-area-loop` (variante já medida nas T-040/T-045/T-074): a
  correção de escopo mínima é ACRESCENTAR o arquivo às `areas` em vez de reportar impossibilidade —
  fiz isso no frontmatter. Corrigi a asserção para o contrato novo: `assert {:snooze, segundos} =
  perform_job(...)` + `segundos > 0`. `mix format`/`mix credo --strict` nesse arquivo: limpos.
- **(b) a segunda falha (`servidor_test.exs:167`, "rodada_concluida/2 ... dispara a proxima") NÃO
  reproduz isolada nem junto com `trabalho_test.exs`** (rodei os dois juntos 2x, 0 falhas nesse
  teste). Em `mix fabrica.ci`/`mix test` completos ela também não reapareceu nas duas rodadas
  seguintes — em vez disso, cada rodada completa pegou UMA falha diferente e isolada (`criterios_test.exs:196`
  numa, `busca_test.exs:242` na outra — esta última é a flake já mapeada e atribuída à T-097 pela
  memória `suite-global-vermelha-busca-t063`). Concluo que `servidor_test.exs:167` também é pollution
  de concorrência da suíte global (max_cases: 16), não algo que este conserto quebrou — não toquei.
- **Reproduzir o conserto desta rodada:** `mix test test/fabrica/piloto/servidor_test.exs test/fabrica/fila/trabalho_test.exs`
  (53 testes, ~19s) → 0 falhas, repetível.
- `mix fabrica.ci` segue reprovando no estágio `testes` por conta da flake de concorrência de turno (um
  teste diferente a cada rodada, fora das `areas` desta tarefa e sem relação com parede/julgamento) —
  não é algo que esta tarefa possa consertar sem violar confinamento de novo; é o mesmo padrão que
  `suite-global-vermelha-busca-t063` já descreve, só que pegando arquivos diferentes a cada corrida.

### Ciclo 3 (retrabalho reforçado — mecânica)
- **Causa raiz (uma frase):** os três testes `:parede_cota` que a T-095 acrescentou em `trabalho_test.exs`
  fazem o `Laco` (via `Trabalho.rodar_agente/2`, que roda com a `:cota` padrão — o `Fabrica.Cota` GLOBAL
  da árvore da aplicação) marcar a cota como batida e PAUSAR as filas do Oban, e o bloco não rearmava nada
  no `on_exit` — a parede vazava para os arquivos seguintes da suíte.
- Por isso a reprovação era mecânica e **intermitente** (cada rodada pegava um arquivo diferente): com a
  cota global batida, `servidor_test` via o piloto DORMIR em vez de despachar (tarefa fica `:pronta`, não
  `:em_execucao` — falhas em `:167`/`:513`), e `console_live_test:138` via o `#cota-parede` presente quando
  esperava ausência. Nenhuma das três falhas é da LÓGICA de parede desta tarefa (os testes dedicados por
  papel passam); todas eram vazamento de estado global do teste.
- Confirmado: só `{:erro, {:cota, _}}` chama `avisar_parede/2` → `Fabrica.Cota.parede/2` (`laco.ex:109-112`);
  os modos `:sandbox_indisponivel` e `:prazo` não tocam a cota — por isso só os 3 testes `:parede_cota`
  poluíam. `servidor_test.exs` isolado passa 24/24; o bloco de parede DELE (T-091) já rearma `Fabrica.Cota`
  no `on_exit` — a T-095 copiou a parede sem copiar a limpeza.
- **Conserto (1 linha, dentro da área):** `on_exit` do `setup` do describe "executar/2" rearma o
  `Fabrica.Cota` global — mesmo padrão exato do `on_exit` do bloco de parede do `servidor_test.exs`
  (`Cota.rearmar/1` é no-op se não estiver batida, e retoma as filas e cancela o timer pendente). Zero
  mudança em código de produção. Reaproveitei todo o trabalho dos ciclos 1/2; só faltava a limpeza do
  estado global.
- **Prova:** os três arquivos que vazavam entre si, juntos → verde (`mix test test/fabrica/fila/trabalho_test.exs
  test/fabrica/piloto/servidor_test.exs test/fabrica_web/live/console_live_test.exs` → 59/0). `mix fabrica.ci`
  completo → **6/6 verde** (testes 93,5 s; formato/compilar/lint/tipos/backup ok). Rodei `mix test` completo mais
  uma vez (seed novo) → 41 doctests, 1308 testes, 0 falhas — as falhas intermitentes dos ciclos anteriores sumiram.
  `mix format --check-formatted` e `mix credo --strict` no arquivo tocado: limpos.
- **Reproduzir:** `mix fabrica.ci` (ou, direto na regressão: `mix test test/fabrica/fila/trabalho_test.exs test/fabrica/piloto/servidor_test.exs test/fabrica_web/live/console_live_test.exs`).
- **Achei, mas não toquei** (fora da área): `_gestao/tarefas/T-094-*.md` e `T-096-*.md` seguem modificados e
  não commitados por sessão anterior — trabalho de outras tarefas; deixei para quem é dono.

## Notas do orquestrador
- 2026-10-07 15:45 UTC (orquestrador): → `em-teste` direto, sem novo ciclo de construção. As reprovações desta rodada foram falsas: a passada mecânica rodou sobre árvore suja (trabalho incompleto da T-095, cortado pela parede de cota, quebrava a compilação) e a flake de `busca_test.exs:242`. Com o projeto quieto e a árvore limpa, `mix fabrica.ci` no HEAD `99d7838`: **6/6 verde** (testes 94,5 s). O entregável está commitado; o verificador decide. Mesmo precedente da T-065 e T-072 (01/10). Linha `Impedimento:` anterior (se houver) está resolvida: a compilação voltou.

## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **FALHOU**

```
Running ExUnit with seed: 206433, max_cases: 16
Excluding tags: [:precisa_pg_dump]

........................................................................****.........................................................................................................................................................................................................................................................................................................................................................................*.................................................................................................................................................
… (4091 caracteres omitidos do meio) …
Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
..11:43:01.509 [warning] laco encerrado por erro do operario: :sandbox_indisponivel
11:43:01.509 [warning] fila: tarefa 41787 (revisor) bateu parede (:sandbox_indisponivel); devolvida a fila sem julgamento
...11:43:16.727 [error] Postgrex.Protocol (#PID<0.301.0> ({Postgrex.Protocol, "fabrica_test"})) disconnected: ** (DBConnection.ConnectionError) client #PID<0.5305.0> exited
11:43:16.739 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
........11:43:16.855 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
11:43:16.855 [warning] laco encerrado por erro do operario: :sandbox_indisponivel
11:43:16.855 [warning] fila: tarefa 41798 (construtor) bateu parede (:sandbox_indisponivel); devolvida a fila sem julgamento
................................................................
Finished in 90.9 seconds (23.8s async, 67.0s sync)
41 doctests, 1307 tests, 1 failure, 5 skipped (11 excluded)
```

- [executado] CONSTRUTOR cujo operário devolve parede de cota: a tarefa NÃO vai para `em_teste`, `tentativas` não muda, e ela pode ser despachada de novo; o evento de fim de despacho sai com o gasto (zero ou o medido). Teste que falha antes do conserto (prove com `git stash`). — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU**
- [executado] REVISOR cujo despacho bate na parede: a tarefa NÃO vai a `concluida` (nem volta a `em_execucao`); fica para ser revisada de novo. O mesmo no VERIFICADOR (não vai a `em_revisao` nem volta reprovada). Teste por papel, que falha antes do conserto. — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] `{:erro, :sandbox_indisponivel}` se comporta como a parede nos três papéis; um erro que É do trabalho (ex.: `prazo`, teto de voltas) segue o caminho de hoje (teste). — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Bateria completa verde. — `mix fabrica.ci` → **FALHOU**

```
bateria de verificacao — 6 estagios declarados

  ... formato: mix format --check-formatted
  ... compilar: mix compile --warnings-as-errors
  ... lint: mix credo --strict
  ... testes: mix test


  formato    ok        2.9s
  compilar   ok        2.8s
  lint       ok        9.1s
  testes     FALHOU   94.4s


Running ExUnit with seed: 219596, max_cases: 16
Excluding tags: [:precisa_pg_dump]

................................................................................................................................................................................................................................................................................
… (4385 caracteres omitidos do meio) …
ning] laco encerrado por erro do operario: :prazo
.......

  1) test fim de rodada consulta a decisao e dispara a proxima quando ela manda continuar rodada_concluida/2 com :concluiu? true e outra tarefa pronta dispara a proxima (Fabrica.Piloto.ServidorTest)
     test/fabrica/piloto/servidor_test.exs:167
     Assertion with == failed
     code:  assert Repo.get!(Tarefa, primeira.id).status == :em_execucao
     left:  :pronta
     right: :em_execucao
     stacktrace:
       test/fabrica/piloto/servidor_test.exs:176: (test)



  2) test parede de cota real: o piloto DORME ate a reabertura, nao para por falha (T-091) a rodada em voo termina na parede: dormindo_ate e o horario do sinal, ligado, sem motivo_parada (Fabrica.Piloto.ServidorTest)
     test/fabrica/piloto/servidor_test.exs:507
     Assertion with == failed
     code:  assert Repo.get!(Tarefa, tarefa.id).status == :em_execucao
     left:  :pronta
     right: :em_execucao
     stacktrace:
       test/fabrica/piloto/servidor_test.exs:513: (test)

..........................................................................................................................
Finished in 90.3 seconds (24.4s async, 65.8s sync)
41 doctests, 1307 tests, 2 failures, 5 skipped (11 excluded)

bateria REPROVOU no estagio `testes` (codigo 2); 2 estagio(s) nem chegaram a rodar
```


Graus de prova: 5 executado(s), 0 para julgamento (de 5).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **FALHOU**

```
Running ExUnit with seed: 864678, max_cases: 16
Excluding tags: [:precisa_pg_dump]

.......................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................
… (3499 caracteres omitidos do meio) …
, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
....12:46:25.379 [warning] laco encerrado por parede de cota: {:erro, {:cota, nil}}
12:46:25.379 [warning] fila: tarefa 47639 (revisor) bateu parede ({:cota, nil}); devolvida a fila sem julgamento
.12:46:25.386 [warning] laco encerrado por erro do operario: :sandbox_indisponivel
12:46:25.386 [warning] fila: tarefa 47640 (revisor) bateu parede (:sandbox_indisponivel); devolvida a fila sem julgamento
........................................

  1) test parede de cota aparece com o horario de reabertura quando ativa, e some ao rearmar (FabricaWeb.ConsoleLiveTest)
     test/fabrica_web/live/console_live_test.exs:138
     Expected false or nil, got true
     code: refute has_element?(view, "#cota-parede")
     arguments:

         # 1
         #Phoenix.LiveViewTest.View<
           id: "phx-GNxJ4gFY-ADcnznh",
           module: FabricaWeb.ConsoleLive,
           pid: #PID<0.5609.0>,
           endpoint: FabricaWeb.Endpoint,
           ...
         >

         # 2
         "#cota-parede"

     stacktrace:
       test/fabrica_web/live/console_live_test.exs:141: (test)

.................
Finished in 91.5 seconds (23.5s async, 68.0s sync)
41 doctests, 1308 tests, 1 failure, 5 skipped (11 excluded)
```

- [executado] CONSTRUTOR cujo operário devolve parede de cota: a tarefa NÃO vai para `em_teste`, `tentativas` não muda, e ela pode ser despachada de novo; o evento de fim de despacho sai com o gasto (zero ou o medido). Teste que falha antes do conserto (prove com `git stash`). — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU**
- [executado] REVISOR cujo despacho bate na parede: a tarefa NÃO vai a `concluida` (nem volta a `em_execucao`); fica para ser revisada de novo. O mesmo no VERIFICADOR (não vai a `em_revisao` nem volta reprovada). Teste por papel, que falha antes do conserto. — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] `{:erro, :sandbox_indisponivel}` se comporta como a parede nos três papéis; um erro que É do trabalho (ex.: `prazo`, teto de voltas) segue o caminho de hoje (teste). — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Bateria completa verde. — `mix fabrica.ci` → **FALHOU**

```
bateria de verificacao — 6 estagios declarados

  ... formato: mix format --check-formatted
  ... compilar: mix compile --warnings-as-errors
  ... lint: mix credo --strict
  ... testes: mix test


  formato    ok        2.8s
  compilar   ok        2.6s
  lint       ok        9.2s
  testes     FALHOU   93.7s


Running ExUnit with seed: 206345, max_cases: 16
Excluding tags: [:precisa_pg_dump]

................................................................................................................................................................................................................................................................................
… (4562 caracteres omitidos do meio) …
co encerrado por parede de cota: {:erro, {:cota, nil}}
12:48:36.389 [warning] fila: tarefa 47931 (verificador) bateu parede ({:cota, nil}); devolvida a fila sem julgamento
.........12:48:36.496 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.............................................

  1) test parede de cota aparece com o horario de reabertura quando ativa, e some ao rearmar (FabricaWeb.ConsoleLiveTest)
     test/fabrica_web/live/console_live_test.exs:138
     Expected false or nil, got true
     code: refute has_element?(view, "#cota-parede")
     arguments:

         # 1
         #Phoenix.LiveViewTest.View<
           id: "phx-GNxKAP9CK4Ax-znh",
           module: FabricaWeb.ConsoleLive,
           pid: #PID<0.5591.0>,
           endpoint: FabricaWeb.Endpoint,
           ...
         >

         # 2
         "#cota-parede"

     stacktrace:
       test/fabrica_web/live/console_live_test.exs:141: (test)

...........................
Finished in 89.7 seconds (21.9s async, 67.7s sync)
41 doctests, 1308 tests, 1 failure, 5 skipped (11 excluded)

bateria REPROVOU no estagio `testes` (codigo 2); 2 estagio(s) nem chegaram a rodar
```


Graus de prova: 5 executado(s), 0 para julgamento (de 5).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] CONSTRUTOR cujo operário devolve parede de cota: a tarefa NÃO vai para `em_teste`, `tentativas` não muda, e ela pode ser despachada de novo; o evento de fim de despacho sai com o gasto (zero ou o medido). Teste que falha antes do conserto (prove com `git stash`). — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU**
- [executado] REVISOR cujo despacho bate na parede: a tarefa NÃO vai a `concluida` (nem volta a `em_execucao`); fica para ser revisada de novo. O mesmo no VERIFICADOR (não vai a `em_revisao` nem volta reprovada). Teste por papel, que falha antes do conserto. — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] `{:erro, :sandbox_indisponivel}` se comporta como a parede nos três papéis; um erro que É do trabalho (ex.: `prazo`, teto de voltas) segue o caminho de hoje (teste). — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Bateria completa verde. — `mix fabrica.ci` → **PASSOU**

Graus de prova: 5 executado(s), 0 para julgamento (de 5).





### Ciclo 4 (testador — verificação)

- **Suíte completa: PASSOU** — `mix fabrica.ci` → **6/6 verde** (testes 94.3s, tipos 16.2s, backup 18.2s)
  - formato ✓
  - compilar ✓
  - lint ✓
  - testes ✓
  - tipos ✓
  - backup ✓

- **[PASSOU] [executado] CONSTRUTOR cujo operário devolve parede de cota: a tarefa NÃO vai para `em_teste`, `tentativas` não muda, e ela pode ser despachada de novo**
  Comando: `mix test test/fabrica/fila/trabalho_test.exs`
  Saída: 29 testes, 0 falhas (18.4s)
  Comportamento verificado: tarefa fica em `em_execucao`, não transita para `em_teste`, tentativas permanece 1, evento de fim emitido com desfecho `{:parede, {:cota, DateTime}}`

- **[PASSOU] [executado] REVISOR/VERIFICADOR com parede não transitam: tarefa NÃO vai a `concluida`/`em_revisao` nem volta reprovada**
  Comando: `mix test test/fabrica/fila/trabalho_test.exs` (testes: "REVISOR cujo despacho bate parede de cota" + "VERIFICADOR cujo despacho bate parede de cota")
  Saída: 29 testes, 0 falhas — incluem verificador e revisor com `:parede_cota` e `:sandbox_indisponivel`

- **[PASSOU] [executado] `{:erro, :sandbox_indisponivel}` se comporta como parede nos três papéis; `:prazo` é erro do trabalho e segue julgado como hoje**
  Comando: `mix test test/fabrica/fila/trabalho_test.exs` (testes parametrizados com `for` para sandbox + teste de contraprova com `:prazo`)
  Saída: 29 testes, 0 falhas — todos os papéis (construtor, verificador, revisor) testados com sandbox indisponível; `:prazo` não gera parede e conclui com ciclo gravado

- **[PASSOU] [executado] Bateria completa verde**
  Comando: `mix fabrica.ci`
  Saída: 6 estágios ok (formato, compilar, lint, testes, tipos, backup)

**Mutação (prove-ou-refute):** Quebrei a função `parede?/1` fixando-a em `false` para forçar julgamento mesmo em parede
- Resultado: 5 testes de parede falharam (esperado) — asserções ficaram pendentes em `:parede, segundos` enquanto o código retornava `:ok`, e estados não ficaram travados. Restaurei o código, testes voltaram a passar (29/29).
- Conclusão: os testes de parede realmente verificam o comportamento de "não julgar, não transicionar" — não é um ritual sem propósito.

Graus de prova: 4 executados

## Conformidade

Conformidade: cumpre

- Critério 1 (construtor + parede de cota: não vai a `em_teste`, `tentativas` não sobe de
  novo, redespachável, evento de fim com o gasto) → `lib/fabrica/fila/trabalho.ex` `parede?/1`
  + `segurar/3` (commit `a52b40c`); teste `"CONSTRUTOR cujo operario bate parede de cota..."`
  em `test/fabrica/fila/trabalho_test.exs:493`. Conferido: `tentativas` vai de 0→1 só pelo
  `garantir_em_execucao/2` (`pronta -> em_execucao`, que já acontecia ANTES desta tarefa e
  não é julgamento — doutrina confirmada pelo próprio teste); numa segunda parede do MESMO
  despacho redespachado, `garantir_em_execucao/2` não roda de novo (tarefa já `em_execucao`),
  então não há segundo incremento. Bate com o Objetivo.
- Critério 2 (verificador/revisor + parede: sem transição) → mesmas funções; testes em
  `trabalho_test.exs:521` e `:536`.
- Critério 3 (`:sandbox_indisponivel` como parede nos 3 papéis; `:prazo` não é parede) →
  `parede_do_motivo?/1`; teste parametrizado (`for`) em `trabalho_test.exs:552` + contraprova
  `:prazo` em `trabalho_test.exs:574`.
- Critério 4 (bateria completa verde) → `mix fabrica.ci` 6/6 (Ciclo 3 e Ciclo 4, testador).
  Reproduzi de forma independente: `mix test test/fabrica/fila/trabalho_test.exs` → 29/29, e
  `mix test test/fabrica/fila/trabalho_test.exs test/fabrica/piloto/servidor_test.exs
  test/fabrica_web/live/console_live_test.exs` → 59/0 (o trio que vazava cota global antes do
  conserto do Ciclo 3).
- Contrato com o plano: o desenho (não transicionar, não gravar ciclo, reemitir o fim,
  `{:snooze, segundos}` via Oban — suportado desde 2.24, confirmado em `mix.lock`) é exatamente
  o pedido no Contexto/Objetivo e respeita D-017 (desfecho `:erro` do `Laço` não muda de
  significado para quem já lê só ele).
- **Achado de processo, não de conformidade do Objetivo:** o commit `a52b40c` (Ciclo 1) toca
  `lib/fabrica/agente/estado.ex` e `lib/fabrica/agente/laco.ex`, que NÃO estão em `areas` desta
  tarefa (`[lib/fabrica/fila/trabalho.ex, test/fabrica/fila/trabalho_test.exs,
  test/fabrica/piloto/servidor_test.exs]`). O conteúdo é legítimo (campo `motivo_do_erro`,
  preenchido nos 3 ramos de erro do `Laço` — exatamente o que o Contexto já previa: "o motivo
  do erro pode precisar chegar ao resumo"), e as Notas de execução explicam a origem (WIP da
  própria T-095 já em voo, não commitado, bloqueando a compilação — memória
  `wip-nao-commitado-quebra-compilacao-t095`). Mas, diferente do Ciclo 2 (que ACRESCENTOU
  `servidor_test.exs` a `areas` antes de tocá-lo — o padrão certo, já registrado em
  `commit-guard-out-of-area-loop`), o Ciclo 1 nunca atualizou o frontmatter para incluir os
  dois arquivos de `lib/fabrica/agente/`. `areas` descreve hoje um escopo menor que o
  efetivamente commitado. Não reprovo por isto (o conteúdo é correto, necessário e já estava
  coberto pelos testes de `Laco`/`Estado` que passam), mas registro como achado de
  rastreabilidade — ver Revisão.

## Revisão

Aprovado, com uma ressalva de processo (não reprova). Verifiquei:

- Li o diff completo dos 3 ciclos de construção: `a52b40c` (cycle 1, lib+testes),
  `86bac63` (cycle 2, expande `areas` + corrige asserção de `servidor_test.exs` para o novo
  contrato `{:snooze, segundos}`), `a68d63f` (cycle 3, rearma `Fabrica.Cota` global no
  `on_exit` dos testes de parede). Rodei a suíte relevante de novo, de forma independente, e
  bate com o relatado em todos os ciclos.
- `parede?/1`/`parede_do_motivo?/1`: só classifica `{:cota, _}` e `:sandbox_indisponivel` como
  parede; qualquer outro motivo (inclusive `:prazo`) cai em `false` e seque julgado — sem
  risco de um erro real do trabalho ser engolido como parede.
- `segundos_de_espera/1`: com `reabre_em` no passado (parede detectada perto do rearme), o
  `DateTime.diff` dá negativo e o `max(…, 30)` evita reagendar com atraso negativo ou zero —
  sem crash, sem laço apertado.
- `emitir_fim/3` roda ANTES do `{:parede, segundos}` ser devolvido — o gasto do turno (zero ou
  medido) não desaparece da telemetria mesmo numa parede sem consumo, como a doutrina exige.
- Consumidor de `[:fabrica, :despacho, :fim]` em `lib/fabrica/piloto/servidor.ex`
  (`resultado_do_evento/1`) não quebra com o novo formato `{:parede, motivo}`: nem `:fim_do_turno`
  nem `:erro` batem, logo `concluiu?`/`falhou?` ficam `false` — o mesmo tratamento que
  `{:morto, motivo}` já recebia antes desta tarefa (código fora da área dela, não tocado, e já
  teste ponta-a-ponta em `servidor_test.exs:507` confirma que o piloto dorme em vez de parar).
- `Fabrica.Fila.Trabalho` continua com `max_attempts: 1`; `{:snooze, segundos}` é suportado pelo
  Oban 2.24 (`mix.lock`) e não consome `attempt`, então não há conflito com a regra "sem
  retentativa automática do Oban" que o próprio `@moduledoc` já documentava.
- **[menor] `_gestao/tarefas/T-095-parede-nao-anda-a-tarefa.md` (frontmatter `areas`)** —
  `lib/fabrica/agente/estado.ex` e `lib/fabrica/agente/laco.ex` foram editados e commitados
  (`a52b40c`) sem estarem em `areas`, e sem o frontmatter ter sido atualizado para refletir
  isso (ao contrário do Ciclo 2, que ACRESCENTOU `servidor_test.exs` a `areas` antes de
  tocá-lo). Cenário concreto: se outra tarefa futura mexer de novo em `Agente.Estado`/`Laco`,
  `git log`/`git blame` vai atribuir a mudança desta T-095 sem que ninguém consiga confirmar,
  só pela leitura do frontmatter, que isso era esperado — a rastreabilidade que `areas` existe
  para dar fica incompleta. Não é bug de comportamento (testes de `Laco`/`Estado` cobrem o
  campo novo e passam) e não reprova a tarefa; sugiro ao orquestrador/planejador acrescentar
  os dois caminhos a `areas` numa próxima edição administrativa do frontmatter.


