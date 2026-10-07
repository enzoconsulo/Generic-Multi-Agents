---
id: T-036
titulo: Arvore de supervisao e registro de processos
projeto: fabrica-v2
versao: v0.4
status: concluida
prioridade: alta
dependencias: [T-015, T-022]
areas: [lib/fabrica/application.ex, lib/fabrica/agente/supervisor.ex, test/fabrica/agente/supervisor_test.exs]
tentativas: 2
criada: 2026-08-28
atualizada: 2026-09-03
---

## Objetivo
Cada tarefa em voo vira um processo supervisionado, com endereco e dono — e o estado dela
NAO vive dentro do processo, vive no banco.

## Contexto
E o mapeamento que decide a escolha de Elixir: "agente vira processo supervisionado". Um
agente deixa de ser uma execucao solta que ninguem vigia e passa a ter identificador,
dono, alguem que pode encerra-lo e — o que mais importa — alguem que percebe quando ele
morre.

`DynamicSupervisor` para os agentes em voo, `Registry` para enderecar por
`{:agente, tarefa_id}`. Estrategia `:one_for_one`: a morte de um agente nao toca os outros.

O processo morre a qualquer instante sem que nada se perca, porque o estado esta no banco.
O que o supervisor faz ao perceber a morte NAO e reiniciar cegamente: e devolver a tarefa
para a fila, com o motivo registrado. Reiniciar um agente no meio da conversa gastaria
tudo de novo sem aproveitar nada.

Listar o que esta rodando e consultar o `Registry` — nunca deduzir de arquivo de log. E
isso que a tela da v1.0 vai usar.

## Criterios de aceite
- [ ] Tres agentes rodam sob o supervisor; matar um nao afeta os outros dois.
      `verificar: mix test test/fabrica/agente/supervisor_test.exs`
- [ ] A morte de um agente devolve a tarefa a fila com motivo registrado, sem reiniciar a conversa.
      `verificar: mix test test/fabrica/agente/supervisor_test.exs`
- [ ] Listar agentes em voo consulta o `Registry` e devolve tarefa e papel de cada um.
      `verificar: mix test test/fabrica/agente/supervisor_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao

### Ciclo 1

`Fabrica.Agente.Supervisor` (novo arquivo, `lib/fabrica/agente/supervisor.ex`): um `GenServer`
que possui internamente um `DynamicSupervisor` (`:one_for_one`) e um `Registry`
(`Fabrica.Agente.Supervisor.registro/0`, subido em `application.ex`). Cada agente e um
`Fabrica.Agente.Supervisor.Executor` (submodulo no mesmo arquivo), que se REGISTRA a si mesmo
em `{:agente, tarefa_id} => papel` — para a entrada do Registry morrer sozinha com ele, e nao
sobreviver a morte esperando alguem limpar.

**API:**
- `iniciar(tarefa_id, papel, funcao_zero_aridade, opcoes \\ [])` — sobe o agente sob
  supervisao; `opcoes[:ao_morrer]` e `(tarefa_id, motivo -> any())`, chamado quando o processo
  morre por motivo diferente de `:normal`.
- `listar/0` — os agentes em voo, lidos do Registry: `%{tarefa_id:, papel:, pid:}`.
- `encerrar/1` — mata o agente da tarefa, se houver.

**Decisoes de projeto, e por que:**
1. Filhos sobem com `restart: :temporary`. O `DynamicSupervisor` NUNCA reinicia sozinho — quem
   decide redespachar (e com isso "devolve a tarefa a fila") e quem chama `:ao_morrer`, nunca
   este modulo. Isto bate com o Contexto da tarefa: o supervisor so PERCEBE a morte, nao decide
   sozinho reiniciar a conversa.
2. A morte e vista via `Process.monitor/1` + `:DOWN` no proprio `Supervisor`, e NAO via
   `terminate/2` do agente — `terminate/2` nao roda numa morte por `:kill` (sinal intratavel),
   e o criterio de aceite pede exatamente "matar um" como forma de prova.
3. **Corrida encontrada e corrigida em teste:** se o `Executor` comecasse a rodar `funcao`
   assim que o `init/1` retornasse (via `handle_continue`), uma funcao rapida podia terminar
   ANTES de o `Supervisor` conseguir chamar `Process.monitor/1` — o `:DOWN` chegava como
   `:noproc`, sem o motivo real (reproduzido no teste "terminar normalmente NAO aciona
   ao_morrer": motivo veio `:noproc` em vez de nao disparar nada). Corrigido: o `Executor`
   so roda `funcao` ao receber `:pode_rodar`, mensagem que o `Supervisor` manda SO DEPOIS de
   `Process.monitor/1` ja estar de pe — fecha a janela.
4. **A escrita no banco (mover a tarefa de volta e gravar o motivo em `ciclos`) fica FORA
   deste arquivo, de proposito.** As `areas` desta tarefa nao incluem nada de
   `lib/fabrica/tarefas/`, e o proprio `Fabrica.Tarefas.Maquina` nao tem transicao
   `em_execucao -> em_execucao` — uma tarefa em `em_execucao` ja e despachavel pelo
   `Fabrica.Tarefas.Fila` (mapeia para o papel `:construtor`, igual `:pronta`), entao "devolver
   a fila" nao exige mudanca de estado nenhuma. O callback `:ao_morrer` e o ponto de extensao:
   quem orquestrar o despacho de verdade (tarefa futura) passa aqui uma funcao que grava o
   `Ciclo`/loga o motivo. Sem callback explicito, o padrao e so `Logger.warning/1`.

**Reproduzir:** `mix test test/fabrica/agente/supervisor_test.exs` (7 testes, os 3 criterios
executaveis: isolamento entre agentes, motivo na morte sem reinicio automatico — inclusive via
`Process.exit(pid, :kill)` — e listagem via Registry).

`mix verificar`: verde (833 mods/funs no Credo, 17 doctests + 801 testes, 0 falhas). Rodado
duas vezes porque a primeira rodada reprovou em `Fabrica.Publicacao.GitTest` — teste
pre-existente e nao relacionado (cria seu proprio repo git isolado em `_build/test/tmp/`);
passou isolado e passou na segunda rodada completa, confirmando que e um flake da suite sob
concorrencia, nao algo que este ciclo introduziu.

**Commit:** `a301a6c`

### Ciclo 2

Corrigido o achado crítico da Revisão do Ciclo 1: corrida entre o `Process.monitor/1` deste
`Supervisor` (que dispara `:ao_morrer`) e o monitor INTERNO do `Registry` (que remove a
entrada quando o dono morre) — duas mensagens `:DOWN` para processos diferentes, sem ordem
garantida entre elas.

**Correção, em `lib/fabrica/agente/supervisor.ex` (`listar/0`):** em vez de confiar no timing
do `Registry` para provar ausência, `listar/0` agora filtra as entradas por
`Process.alive?/1` antes de devolvê-las — exatamente a opção que a Revisão sugeriu ("`listar/0`
já filtra por `Process.alive?/1`"). Um pid morto nunca mais aparece na listagem, mesmo que o
monitor interno do `Registry` ainda não tenha processado seu próprio `:DOWN` e removido a
entrada. Não mexi nos testes (o defeito era no código, não neles) nem na corrida do
`:noproc` já fechada no Ciclo 1 (`:pode_rodar`) — ambas continuam corretas.

**Prova de que a intermitência sumiu:** rodei `mix test test/fabrica/agente/supervisor_test.exs`
20 vezes seguidas, sem seed fixo (a Revisão reproduziu a falha "na primeira execução, e
voltou a passar nas 20 seguintes" — mesmo protocolo, agora com o fix): 7 testes, 0 falhas em
todas as 20 rodadas.

`mix verificar`: 833 mods/funs no Credo (0 issues), 17 doctests + 801 testes. Uma rodada
reprovou 1 teste pré-existente e não relacionado
(`Fabrica.Ferramentas.ConfinamentoTest` / "escape 3: link que aponta para fora") — fora das
`areas` desta tarefa, não tocado por este ciclo; passou isolado (`mix test
test/fabrica/ferramentas/confinamento_test.exs` → 29 testes, 0 falhas) e passou de novo na
suíte completa (`mix test` → 801 testes, 0 falhas) — mesmo padrão de flake sob concorrência já
registrado no Ciclo 1 para outro arquivo (`Fabrica.Publicacao.GitTest`), não algo introduzido
aqui.

**Reproduzir:** `mix test test/fabrica/agente/supervisor_test.exs` (7 testes; rodar sem `--seed`
várias vezes é o que prova a ausência da corrida).

**Commit:** `94287bf`

## Verificação

### Ciclo 1

- **[PASSOU] [executado] Tres agentes rodam sob o supervisor; matar um nao afeta os outros dois**
  Comando: `mix test test/fabrica/agente/supervisor_test.exs`
  Saída: teste `matar um agente nao afeta os outros dois` passou (verifica que após matar p1, p2 e p3 continuam vivos, e que t1 não aparece mais no Registry)

- **[PASSOU] [executado] A morte de um agente devolve a tarefa a fila com motivo registrado, sem reiniciar a conversa**
  Comando: `mix test test/fabrica/agente/supervisor_test.exs`
  Saída: dois testes passaram: `o callback ao_morrer recebe a tarefa e o motivo quando o agente cai` (motivo recebido != nil) e `matado com Process.exit(:kill) tambem dispara o callback` (motivo recebido = :killed)

- **[PASSOU] [executado] Listar agentes em voo consulta o `Registry` e devolve tarefa e papel de cada um**
  Comando: `mix test test/fabrica/agente/supervisor_test.exs`
  Saída: testes `devolve tarefa e papel de cada agente em voo` e `agente que ja terminou nao aparece mais na listagem` passaram; Registry consultado e entradas removidas após morte

- **[PASSOU] [executado] `mix verificar` continua passando**
  Comando: `mix verificar`
  Saída: 17 doctests, 801 testes, 0 falhas; lint (833 mods/funs) passou; formato, compilação, tudo verde

Suíte completa: 801 testes passaram, 0 falharam
Graus de prova: 4 executado(s), 0 inspecionados, 0 julgados

### Passada mecânica (sem modelo)

- [julgado] Tres agentes rodam sob o supervisor; matar um nao afeta os outros dois. — comando recusado: binario-nao-permitido; fica para o verificador.
- [julgado] A morte de um agente devolve a tarefa a fila com motivo registrado, sem reiniciar a conversa. — comando recusado: binario-nao-permitido; fica para o verificador.
- [julgado] Listar agentes em voo consulta o `Registry` e devolve tarefa e papel de cada um. — comando recusado: binario-nao-permitido; fica para o verificador.
- [julgado] `mix verificar` continua passando. — comando recusado: binario-nao-permitido; fica para o verificador.

Graus de prova: 0 executado(s), 4 para julgamento (de 4).

### Ciclo 3 (verificação de retrabalho)

- **[PASSOU] [executado] Tres agentes rodam sob o supervisor; matar um nao afeta os outros dois**
  Comando: `mix test test/fabrica/agente/supervisor_test.exs`
  Saída: 7 testes passaram, 0 falharam (inclui `matar um agente nao afeta os outros dois` que verifica isolamento após `Supervisor.encerrar(t1)`, confirmando p2 e p3 vivos)

- **[PASSOU] [executado] A morte de um agente devolve a tarefa a fila com motivo registrado, sem reiniciar a conversa**
  Comando: `mix test test/fabrica/agente/supervisor_test.exs`
  Saída: testes `o callback ao_morrer recebe a tarefa e o motivo quando o agente cai` e `matado com Process.exit(:kill) tambem dispara o callback` passaram; nenhuma reinicialização automática confirmada por `refute tarefa in (Supervisor.listar() ...)` após morte

- **[PASSOU] [executado] Listar agentes em voo consulta o `Registry` e devolve tarefa e papel de cada um**
  Comando: `mix test test/fabrica/agente/supervisor_test.exs`
  Saída: testes `devolve tarefa e papel de cada agente em voo` e `agente que ja terminou nao aparece mais na listagem` passaram; correção do Ciclo 2 (`Process.alive?/1`) removeu a intermitência

- **[PASSOU] [executado] `mix verificar` continua passando**
  Comando: `mix verificar`
  Saída: 17 doctests, 801 testes, 0 falhas; lint (833 mods/funs) 0 issues; formato OK, compilação OK

Suíte completa: 801 testes passaram, 0 falharam (10 execuções consecutivas de `supervisor_test.exs` sem seed fixo: 10/10 passos)
Graus de prova: 4 executado(s), 0 inspecionados, 0 julgados
Mutação: A correção do Ciclo 2 (`listar/0` filtrando por `Process.alive?/1`) foi mantida e funcionou — removeu completamente a corrida de timing entre o `Process.monitor/1` do Supervisor e o monitor interno do `Registry` que causava a intermitência no teste `agente que ja terminou nao aparece mais na listagem`


## Conformidade

### Ciclo 1

Conformidade: cumpre

- Três agentes rodam sob o supervisor; matar um não afeta os outros dois →
  `lib/fabrica/agente/supervisor.ex` (`DynamicSupervisor`, estratégia `:one_for_one`,
  `iniciar/4`, `encerrar/1`), confirmado pelo teste `matar um agente nao afeta os outros dois`
  (`supervisor_test.exs:16-39`).
- A morte de um agente devolve a tarefa à fila com motivo registrado, sem reiniciar →
  `handle_info({:DOWN, ...})` (`supervisor.ex:129-141`) chama `opcoes[:ao_morrer]`; filhos
  sobem com `restart: :temporary` (nunca reiniciados pelo `DynamicSupervisor`), confirmado
  pelos testes `o callback ao_morrer recebe a tarefa e o motivo quando o agente cai` e
  `matado com Process.exit(:kill) tambem dispara o callback`.
- Listar agentes em voo consulta o `Registry` e devolve tarefa e papel de cada um →
  `Supervisor.listar/0` (`supervisor.ex:53-59`, via `Registry.select/2`), confirmado pelos
  testes `devolve tarefa e papel de cada agente em voo` e `agente que ja terminou nao aparece
  mais na listagem`.
- `mix verificar` continua passando → relatado verde pelo executor (833 mods/funs Credo,
  17 doctests + 801 testes). Não reexecutei a bateria completa (fora do orçamento da
  revisão), mas reexecutei os testes da própria tarefa por conta própria — ver achado
  crítico na Revisão: encontrei uma falha intermitente nesse mesmo arquivo de teste, o que
  põe em risco justamente este critério em rodadas futuras de `mix verificar`.
- Escopo aderente às `areas` declaradas. A decisão registrada nas Notas (deixar a escrita no
  banco fora deste módulo) está corretamente justificada: conferi `lib/fabrica/tarefas/fila.ex`
  e `pronta: :construtor, em_execucao: :construtor` (linhas 65-66) de fato mapeiam uma tarefa
  `em_execucao` para o mesmo papel de despacho que `pronta` — a alegação de que "devolver à
  fila" não exige mudança de estado está correta.
- Objetivo e Contexto cumpridos no espírito: processo com endereço (`Registry`), dono
  (`DynamicSupervisor`) e quem percebe a morte sem reiniciar cegamente.

### Ciclo 2

Conformidade: cumpre

- Corrige exatamente o achado crítico da Revisão do Ciclo 1 (corrida entre o
  `Process.monitor/1` do `Supervisor` e o monitor interno do `Registry`), com a mesma
  solução que a Revisão sugeriu → `lib/fabrica/agente/supervisor.ex:87`
  (`Enum.filter(fn {_chave, pid, _papel} -> Process.alive?(pid) end)` inserido antes do
  `Enum.map` em `listar/0`). Nenhum critério de aceite mudou de escopo; a mudança é
  estritamente a correção do bug apontado.
- Escopo mínimo e aderente às `areas`: só `lib/fabrica/agente/supervisor.ex` foi tocado
  (fora o `@moduledoc` do `listar/0`, que documenta a corrida e a razão do filtro — já
  correto). Nenhuma mudança em `test/fabrica/agente/supervisor_test.exs`, coerente com a
  alegação de que "o defeito era no código, não nos testes".
- Verifiquei a alegação de robustez por conta própria: rodei
  `mix test test/fabrica/agente/supervisor_test.exs` 5 vezes seguidas sem seed fixo — 7
  testes, 0 falhas em todas — confirmando que a intermitência reportada no Ciclo 1 não se
  reproduz mais.
- Critério `mix verificar continua passando`: aceito o relato do executor (flake
  pré-existente e não relacionado em `ConfinamentoTest`, mesmo padrão de flake de suíte
  sob concorrência já visto no Ciclo 1 em `GitTest`; fora das `areas` desta tarefa).

## Revisão

### Ciclo 1

Revisão: REPROVADA — achado crítico.

- **[crítica] `lib/fabrica/agente/supervisor.ex:117-141` e
  `test/fabrica/agente/supervisor_test.exs:57-76`** — corrida real entre dois monitores
  independentes do mesmo `pid`: o `Process.monitor/1` deste `GenServer` (que dispara
  `ao_morrer/2`) e o monitor interno do `Registry` (que remove a entrada quando o dono
  morre). Não há ordem garantida entre as duas mensagens `:DOWN` — elas vão para processos
  diferentes, e Erlang só garante ordem de entrega entre o MESMO par emissor/receptor.
  **Reproduzido:** `mix test test/fabrica/agente/supervisor_test.exs` sem seed fixo falhou
  na primeira execução (`test/fabrica/agente/supervisor_test.exs:75`,
  `refute tarefa in (Supervisor.listar() |> Enum.map(& &1.tarefa_id))` — recebeu `[4646]`
  ainda com a entrada presente) e voltou a passar nas 20 execuções seguintes — é
  intermitente, não determinístico. As Notas do Ciclo 1 descrevem ter "fechado a janela" de
  corrida, mas isso trata de uma corrida DIFERENTE (o `:noproc` no `init/handle_continue`);
  esta corrida entre o monitor do supervisor e o monitor interno do `Registry` não foi
  identificada nem coberta.
  **Cenário de falha concreto:** (1) para o critério de aceite 4 — a própria bateria que
  `mix verificar` roda contém este teste; ele reprovará esporadicamente sem que ninguém
  tenha mudado o código, o que é especialmente caro nesta fábrica (retrabalho e ciclos são
  gastos reais). (2) Para o uso pretendido descrito no Objetivo/Contexto — "listar o que
  está rodando... é isso que a tela da v1.0 vai usar" — um consumidor que reagir a
  `ao_morrer` e imediatamente consultar `Supervisor.listar()` (ex.: para decidir se já pode
  redespachar a tarefa) pode ver o agente morto ainda listado, mostrando um agente fantasma.
  Correção não exige redesenho: bastaria não depender do timing do `Registry` para provar
  ausência (ex.: `listar/0` já filtra por `Process.alive?/1`, ou os testes que dependem
  dessa ordenação usam `Process.sleep` como os outros dois já fazem).
- Nenhum outro achado. O restante do desenho (registro pelo próprio filho, `restart:
  :temporary`, uso de `Process.monitor` em vez de `terminate/2` para sobreviver a
  `Process.exit(pid, :kill)`) está correto e bem justificado nas Notas.

### Ciclo 2

Revisão: APROVADA — sem ressalvas.

- Conferi `lib/fabrica/agente/supervisor.ex:83-91` (`listar/0`): o `Enum.filter(fn {_chave,
  pid, _papel} -> Process.alive?(pid) end)` roda entre o `Registry.select/2` e o `Enum.map`,
  eliminando exatamente a janela apontada no Ciclo 1 — um pid morto (ainda presente no
  `Registry` porque o monitor interno dele não processou seu próprio `:DOWN`) agora nunca
  chega ao `Enum.map` que monta o resultado. `Process.alive?/1` é seguro aqui porque todo
  filho é local ao node (`DynamicSupervisor.start_link/1` sem `:node`) e o BEAM não reusa
  pid dentro da vida do node.
  **Verifiquei rodando eu mesmo:** `mix test test/fabrica/agente/supervisor_test.exs` 5
  vezes seguidas sem seed fixo — 7 testes, 0 falhas em todas as 5, incluindo o teste
  `agente que ja terminou nao aparece mais na listagem` que reproduziu a falha no Ciclo 1.
- Note-se que a correção não fecha 100% a janela teórica (um `Process.alive?(pid)` pode,
  em tese, capturar `true` num instante em que o processo morre logo depois, antes do
  `Enum.map`) — mas isso é o padrão check-then-act inerente a qualquer sistema
  concorrente, não a corrida específica relatada (que era determinística o bastante para
  falhar na primeira das 20 execuções no Ciclo 1). Não é achado: é o limite esperado de
  qualquer leitura de estado mutável concorrente, e a tarefa não pede consistência
  transacional de `listar/0`.
- `@moduledoc` de `listar/0` (linhas 73-82) explica a corrida corrigida com precisão —
  identifica os dois monitores, a ausência de ordem garantida entre pares
  emissor/receptor diferentes, e o cenário do agente fantasma. Documentação condizente com
  o código.
- Nenhuma mudança fora do necessário: nenhum teste tocado, nenhuma refatoração
  colateral.
