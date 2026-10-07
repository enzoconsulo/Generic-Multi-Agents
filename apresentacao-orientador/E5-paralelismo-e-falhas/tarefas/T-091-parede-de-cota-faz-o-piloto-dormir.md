---
id: T-091
titulo: "Parede de cota real faz o piloto DORMIR e rearmar, não parar por falha"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-089]
areas: [lib/fabrica/agente/laco.ex, test/fabrica/agente/laco_test.exs, lib/fabrica/application.ex, test/fabrica/piloto/servidor_test.exs]
tentativas: 1
criada: 2026-10-02
atualizada: 2026-10-02
---

## Objetivo
Quando o operário devolve `{:erro, {:cota, reabre_em}}` numa rodada do piloto, a parede vira ESTADO
DO SISTEMA (`Fabrica.Cota.parede/2`) e o piloto DORME até a reabertura e rearma sozinho — em vez de
encerrar a rodada como `desfecho: :erro` e parar com `{:parar, :falha}`.

## Contexto
Achado do revisor da T-089 (D-015, adendo 6), conferido pelo orquestrador lendo o código em 02/10.
São DOIS elos soltos da mesma cadeia — sensor sem atuador:

1. **Ninguém chama `Fabrica.Cota.parede/2`.** `ClaudeCLI` e `MessagesAPI` já traduzem a parede para
   `{:erro, {:cota, reabre_em}}` (T-039/T-087), e o moduledoc de `ClaudeCLI` diz que
   "`Fabrica.Cota.parede/2` casa `{:erro, {:cota, reabre_em}}`" — mas o único consumidor do erro é
   `Fabrica.Agente.Laco.laco/1` (`laco.ex`, ramo `{:erro, motivo}` → `%{estado | desfecho: :erro}`),
   que só loga.
2. **`Fabrica.Cota` não sobe em lugar nenhum.** `lib/fabrica/application.ex` não o tem entre os
   filhos; `Piloto.Servidor.cota_agora/0` faz `Process.whereis(Fabrica.Cota)` e, com `nil`, responde
   SEMPRE `%{batida?: false}`. O próprio `console_live.ex` registra "`Fabrica.Cota` pode nao estar
   supervisionado em lugar nenhum hoje".

Efeito hoje: numa parede real, `Piloto.Servidor` vê `falhou?: true` (desfecho `:erro`) e cota não
batida → `Piloto.Decisao` cai na regra 6 (`{:parar, :falha}`). É o lado seguro (não queima rodadas),
mas na cota do plano a parede VAI acontecer no marco (T-058), e o piloto pararia de vez em vez de
retomar na reabertura. A regra 2 da `Decisao` (cota batida → `{:dormir, horario}`, checada ANTES de
falha) já existe e é testada — só não recebe o sinal.

Cuidados (para o executor decidir, e registrar):
- `Cota.parede/2` pausa as filas do Oban (`Oban.pause_all_queues/0` por padrão; injetável por
  closure). Em teste, o Oban global roda `testing: :manual` (config/test.exs) — teste que bate na
  parede do `Fabrica.Cota` GLOBAL pode afetar outros testes; prefira instância própria injetada
  (`servidor` é o 1º argumento de `parede/2`) ou deixe o estado limpo no fim (`rearmar/1`).
- O `Laco` não deve QUEBRAR quando `Fabrica.Cota` não estiver de pé (ex.: num processo de teste ou
  sonda sem a aplicação): parede sem servidor = só o log de hoje, nunca exceção.
- O desfecho da rodada pode continuar `:erro` (a regra 2 da `Decisao` vence a 6) ou ganhar um valor
  próprio; se mudar, siga todos os consumidores de `desfecho` antes (evento, piloto, contagem).

## Critérios de aceite
- [ ] Quando o operário devolve `{:erro, {:cota, reabre_em}}`, o `Laco` chama `Fabrica.Cota.parede/2`
      com esse sinal: depois da conversa, o `Cota.estado/1` do servidor usado diz `batida?: true` e
      `reabre_em` igual ao do sinal (teste com operário dublê e instância própria de `Fabrica.Cota`).
      E sem servidor de cota de pé, o `Laco` encerra como hoje, sem exceção (teste).
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] `Fabrica.Cota` sobe na árvore de supervisão da aplicação com o nome `Fabrica.Cota` (teste:
      `Process.whereis(Fabrica.Cota)` é um pid vivo com a aplicação no ar).
      `verificar: mix test test/fabrica/piloto/servidor_test.exs`
- [ ] Ponta a ponta no piloto: a rodada em voo termina por parede de cota com horário — pelo MESMO
      caminho que o servidor usa de verdade (o `Fabrica.Cota` nomeado batido como o `Laco` o deixa,
      e o evento de fim de rodada com o desfecho que o `Laco` emite nesse caso) — e o
      `Piloto.Servidor` fica DORMINDO até esse horário (`dormindo_ate` igual a ele, `ligado?: true`,
      sem `motivo_parada`), não `{:parar, :falha}`. Teste que falha antes do conserto (prove com
      `git stash`).
      `verificar: mix test test/fabrica/piloto/servidor_test.exs`
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução

### Ciclo 1

**Confirmado antes de consertar** (lendo o código): os dois elos estavam soltos como o Contexto diz —
`laco.ex` casava `{:erro, motivo}` e só logava (nenhum chamador de `Cota.parede/2` em `lib/`), e
`application.ex` não tinha `Fabrica.Cota` entre os filhos (`cota_agora/0` do piloto respondia sempre
`batida?: false`). `Piloto.Decisao` não foi tocada: a regra 2 já existia, só não recebia o sinal.

**O que mudou**
- `lib/fabrica/application.ex`: `Fabrica.Cota` sobe como filho de `Fabrica.Supervisor`, com o nome
  padrão `Fabrica.Cota`, logo DEPOIS do Oban (a parede pausa as filas dele; o rearme as retoma).
- `lib/fabrica/agente/laco.ex`: ramo próprio para `{:erro, {:cota, _}} = sinal`, ANTES do
  `{:erro, motivo}` genérico, que chama `Fabrica.Cota.parede(cota, sinal)` e encerra com o mesmo
  `desfecho: :erro`. Nova opção `:cota` em `Laco.rodar/1` (padrão `Fabrica.Cota`; `nil` desliga o
  aviso) — retirada das opções ANTES de `Estado.novo/1`, que é `struct!/2` e recusaria a chave; o
  estado do GenServer passou a ser `{estado, cota}` (ninguém lê esse estado por fora — conferido).
  `cota` é passada adiante em `laco/2`, `tratar_resposta/4` e `continuar_ou_parar/2`. O aviso é
  melhor esforço: `catch :exit` cobre servidor `nil`, nome não registrado (`:noproc`) e `:timeout` —
  o laco encerra como antes, só com o log.
- `test/fabrica/agente/laco_test.exs`: novo módulo `Fabrica.Agente.LacoCotaTest` (5 testes) no MESMO
  arquivo, `async: false` — `Fabrica.Cota` emite `[:fabrica, :cota, :parede]` no barramento global e
  `eventos_test.exs` (async) faz `refute_receive` desse evento; módulo síncrono só roda depois dos
  assíncronos. Cada teste usa instância PRÓPRIA de `Fabrica.Cota` (nome único, `pausar`/`retomar`
  dublados por closure): nem o `Fabrica.Cota` global nem as filas do Oban são tocados. Casos: sinal
  com horário → `batida?: true` e `reabre_em` igual; sinal `nil` → batida, em recuo; erro que não é
  parede não toca a Cota; servidor inexistente → `{:ok, %{desfecho: :erro}}` sem exceção, com o aviso
  no log; `cota: nil`.
- `test/fabrica/piloto/servidor_test.exs`: (a) `Fabrica.Cota` é pid vivo E filho de
  `Fabrica.Supervisor` (`Supervisor.which_children/1`); (b) ponta a ponta pelo caminho de produção:
  piloto ligado despacha → `perform_job(Fabrica.Fila.Trabalho, construtor)` roda o `Laco` com o
  operário CONFIGURADO (dublê `OperarioDeParede`, via env `:operario`) → o `Laco` bate o
  `Fabrica.Cota` GLOBAL (sem `:cota`, como `Trabalho` chama) → `Trabalho` emite `despacho_fim` com o
  desfecho do `Laco` (`:erro`) → o piloto fica `dormindo_ate == reabre_em`, `ligado?: true`,
  `motivo_parada: nil`. O `on_exit` rearma o `Fabrica.Cota` global (retoma as filas) e restaura o env.

**Decisão: o desfecho segue `:erro`** (não ganhou valor próprio). A regra 2 da `Decisao` vence a 6, e
assim nenhum consumidor de `desfecho` (`Piloto.Servidor.resultado_do_evento/1`, `Trabalho.emitir_fim`,
`Estado`, `Eventos`) precisou mudar. Registrada em `_gestao/DECISOES.md` (D-017).

**Prova do "antes" com `git stash`** (nunca checkout):
- `git stash push -- lib/fabrica/agente/laco.ex lib/fabrica/application.ex` → 57 testes, 7 falhas: o
  ponta a ponta com `o piloto parou (:falha) em vez de dormir na parede`, a supervisão com
  `Fabrica.Cota nao esta de pe`, e os 5 do `LacoCotaTest` (`KeyError key :cota`).
- `git stash push -- lib/fabrica/agente/laco.ex` (Cota de pé, sem o aviso do Laco) → servidor_test
  17 testes, 1 falha: o ponta a ponta, `o piloto parou (:falha)`. Ou seja: subir a Cota sozinha NÃO
  basta; os dois elos são necessários.
- Depois do conserto: 57 testes, 0 falhas.

**Bateria `mix fabrica.ci`** — 4 corridas, só as intermitentes conhecidas fora das áreas:
1. `testes` FALHOU: `classe_falha_test.exs:315` + `busca_test.exs:242` → `VACUUM ANALYZE` em `fabrica_test`;
2. `testes` FALHOU: só `classe_falha_test.exs:315`;
3. `testes` FALHOU: só `busca_test.exs:242` → `VACUUM ANALYZE`;
4. **6/6 ok** (formato, compilar, lint, testes, tipos, backup).

**Reproduzir:** `mix test test/fabrica/agente/laco_test.exs test/fabrica/piloto/servidor_test.exs`

**Commit:** `d8faf62`

**Sugestões (candidatas a tarefa, NÃO feitas — fora das áreas):**
1. **(alta, antes da T-058) O piloto gira em laço quente por ~2 min depois do horário.** O piloto
   acorda em `reabre_em` (`servidor.ex`, `agendar_acordar/1`), mas o `Fabrica.Cota` só rearma em
   `reabre_em + folga` (2 min, `cota.ex` `agendar_para/2`). Nessa janela a cota segue batida →
   `{:dormir, reabre_em}` com horário JÁ passado → `atraso = max(0, …) = 0` → `:acordar` imediato →
   de novo, com `Repo.all` + `File.write!` a cada volta, até o rearme. Conserto provável em
   `piloto/servidor.ex`: piso de espera quando o horário já passou (ex.: `@espera_sem_horario_ms`)
   e/ou acordar no evento `[:fabrica, :cota, :rearme]`, que o piloto hoje ignora. Deduzido da
   leitura do código, não medido.
2. **(média) Parede no construtor gasta um ciclo.** `Trabalho.julgar(:construtor, …)`
   (`fila/trabalho.ex:366`) manda para `em_teste` qualquer que seja o desfecho do laco — no ponta a
   ponta a tarefa foi para `em_teste` sem nada construído. Depois do rearme o verificador roda sobre
   entrega vazia e reprova, queimando uma das 3 tentativas por causa da cota, não do trabalho.

## Verificação

### Ciclo 1

- **[PASSOU] [executado] Critério 1: Quando o operário devolve `{:erro, {:cota, reabre_em}}`, o `Laco` chama `Fabrica.Cota.parede/2`**
  Comando: `mix test test/fabrica/agente/laco_test.exs`
  Saída: 40 tests, 0 failures (inclui LacoCotaTest com 5 testes: sinal com horário → batida e reabre_em igual; sinal nil → batida em recuo; erro não-parede não toca Cota; servidor inexistente → sem exceção; cota nil)

- **[PASSOU] [executado] Critério 2: `Fabrica.Cota` sobe na árvore de supervisão da aplicação com o nome `Fabrica.Cota`**
  Comando: `mix test test/fabrica/piloto/servidor_test.exs`
  Saída: 17 tests, 0 failures (inclui teste de supervisão: `Process.whereis(Fabrica.Cota)` retorna pid vivo e `Supervisor.which_children/1` confirma filiação)

- **[PASSOU] [executado] Critério 3: Ponta a ponta no piloto: a rodada em voo termina por parede de cota com horário — o piloto fica DORMINDO até esse horário (`dormindo_ate` igual a ele, `ligado?: true`, sem `motivo_parada`), não `{:parar, :falha}`**
  Comando: `mix test test/fabrica/piloto/servidor_test.exs` (teste "parede de cota real: o piloto DORME ate a reabertura")
  Saída: Passou (verificado ponta a ponta com operário dublê `OperarioDeParede`, `Fabrica.Cota` GLOBAL, `Trabalho` emitindo despacho_fim com desfecho do Laco, piloto em estado correto)
  Mutação: comentar linha 170 (`Cota.parede(cota, sinal)`) → teste falha com "o piloto parou (:falha) em vez de dormir na parede"; restaurar → passa novamente

- **[PASSOU] [executado] Critério 4: Bateria completa verde**
  Comando: `mix fabrica.ci` (6 estágios)
  Saída: formato ok, compilar ok, lint ok, testes ok (46.4s), tipos ok, backup ok — bateria passou: 6 estágio(s) ok, 0 pulado(s)

Suíte completa: 57 passed (laco_test.exs 40 + servidor_test.exs 17), 0 failed — `mix test test/fabrica/agente/laco_test.exs test/fabrica/piloto/servidor_test.exs && mix fabrica.ci`
Graus de prova: 4 executados, 0 inspecionados, 0 julgados


## Conformidade

### Ciclo 1

Conformidade: cumpre

- [Critério 1: o `Laco` chama `Cota.parede/2` com o sinal; sem servidor, encerra sem exceção] →
  `lib/fabrica/agente/laco.ex:101-104` (ramo próprio `{:erro, {:cota, _}} = sinal`, ANTES do
  `{:erro, motivo}` genérico) + `avisar_parede/2` (`laco.ex:165-178`, `catch :exit` para `nil`,
  `:noproc` e `:timeout`); opção `:cota` retirada em `init/1` (`laco.ex:78-80`). Provas:
  `test/fabrica/agente/laco_test.exs:675` (instância própria, `batida?: true` e `reabre_em` igual) e
  `:721` (servidor inexistente → `{:ok, %{desfecho: :erro}}` com o aviso no log).
- [Critério 2: `Fabrica.Cota` sobe na árvore com o nome `Fabrica.Cota`] → `lib/fabrica/application.ex:24`
  (filho bare → `start_link([])` → nome padrão `Fabrica.Cota`, depois do Oban). Prova:
  `test/fabrica/piloto/servidor_test.exs:358` (pid vivo E filho de `Fabrica.Supervisor` via
  `which_children/1` — mais forte que o `whereis` pedido).
- [Critério 3: ponta a ponta pelo MESMO caminho do servidor; piloto dorme até o horário] →
  `servidor_test.exs:404`: piloto ligado despacha → `perform_job(Fabrica.Fila.Trabalho, construtor)`
  → `Laco` com o operário CONFIGURADO e SEM `:cota` (exatamente como `trabalho.ex:254` chama) → bate o
  `Fabrica.Cota` global → `Trabalho.emitir_fim` com o desfecho do `Laco` → `Piloto.Servidor` →
  `dormindo_ate == reabre_em`, `ligado?: true`, `motivo_parada: nil`. Prova do "antes" com
  `git stash` nas Notas (7 falhas; e só com a Cota de pé, sem o aviso do Laco, o ponta a ponta ainda
  falha — os dois elos são necessários) + mutação do testador (linha 170 comentada → falha).
- [Critério 4: bateria verde] → `mix fabrica.ci` 6/6 na Verificação (testador, `c8fd3f9`).

**Objetivo (no espírito):** cumprido no caminho REAL que o Contexto pede — conferi a cadeia
`Fila.Trabalho` (`trabalho.ex:254`, `Laco.rodar` sem `:cota` → padrão global) → `Laco` →
`Fabrica.Cota` (chamada SÍNCRONA, então a cota já está batida antes de `Trabalho` emitir o
`despacho_fim`; não há corrida) → evento → `Piloto.Servidor.aplicar_rodada_concluida/2` →
`Decisao.decidir/1` regra 2 (`decisao.ex`, checada antes da 6) → `{:dormir, reabre_em}`. O rearme
também fecha: o timer da `Cota` chama `retomar` (`Oban.resume_all_queues/0`) e o piloto, ao acordar
e achar a cota livre, despacha com as filas já retomadas. Não achei caminho em uso normal em que o
Oban fique pausado com a `Cota` livre (só se o próprio processo `Fabrica.Cota` cair com a parede
batida, ou o `retomar` levantar — reinício limpa o estado em memória mas não as filas; risco
residual, não achado). Ressalva: entre `reabre_em` e o rearme o piloto chega lá por laço quente
(furo 1 abaixo) — feio, mas não impede o rearme.

**Escopo e contrato:** o diff toca só as 4 `areas` (+ `DECISOES.md`, `MAPA.md` e o arquivo da
tarefa). A escolha de manter `desfecho: :erro` estava autorizada pelo Contexto e foi registrada
(D-017); coerente com a D-015 adendo 6 (parede sem envelope `:com_consumo` — conferido em
`claude_cli.ex:396-410` e `:677`: só `:prazo` e `:fora_do_confinamento` ganham envelope; o 429 da
`MessagesAPI` também vem nu). Sem UI: prova visual não se aplica.

## Revisão

### Ciclo 1

Aprovado sem ressalvas no diff — nenhum achado `critica`/`importante` em `d8faf62`.

O que verifiquei no diff:
- `laco.ex`: o ramo novo é idêntico ao genérico em efeito (log + `desfecho: :erro`, sem contabilizar
  — parede não traz consumo) e só acrescenta o aviso; o `:ok =` é seguro porque
  `Cota.parede/2` sempre responde `:ok` e o `catch :exit` devolve `:ok`. A troca do estado do
  GenServer para `{estado, cota}` não quebra ninguém: o `Laco` só tem `init/1` e
  `handle_call(:rodar, …)`, e não há `:sys.get_state`/`terminate`/`format_status` lendo esse estado
  em `lib/` (grep).
- `application.ex`: `Fabrica.Cota` bare → `child_spec([])` → nome `Fabrica.Cota`, `pausar`/`retomar`
  padrão no Oban de nome `Oban` (o mesmo que sobe na linha anterior). Ordem depois do Oban correta.
- **Suíte com a Cota GLOBAL:** sem vazamento. O ExUnit 1.19.4 deste ambiente só roda módulos
  síncronos depois de TODOS os assíncronos terminarem, e em série
  (`/opt/fabrica/elixir-1.19.4/lib/ex_unit/lib/ex_unit/runner.ex:117-134`) — então o
  `refute_receive` de `eventos_test.exs` (async) nunca cruza a parede emitida por
  `LacoCotaTest`/`servidor_test` (ambos `async: false`). Só o ponta a ponta toca a Cota global, e o
  `on_exit` a rearma (filas retomadas) e restaura o env `:operario`. Os demais testes que usam
  `Fabrica.Cota` sobem instância nomeada (`cota_test.exs`, `marco_v04_test.exs:300`); nenhum teste
  async passa pelo `Laco` com operário de parede sem `:cota`. Sob `testing: :manual` o
  pause/resume do Oban é inócuo para os produtores.
- **`console_live.ex`:** sem quebra; com a Cota agora sempre de pé, o `cota_agora/0` do mount passa
  a mostrar a parede real ao abrir a tela (melhora). O `console_live_test` prova por evento e não
  depende do processo.

Notas `menor` (não reprovam):
- [menor] `lib/fabrica_web/live/console_live.ex:147` — o comentário "`Fabrica.Cota` pode nao estar
  supervisionado em lugar nenhum hoje" ficou falso com esta tarefa (fora das `areas`; corrigir junto
  da próxima tarefa que tocar o console).
- [menor] Bateria: 3 das 4 corridas do executor caíram em `classe_falha_test.exs:315` /
  `busca_test.exs:242` (`VACUUM ANALYZE`), sem relação com o diff; o testador teve 6/6. Fica o
  registro de que a intermitência segue viva.

**Furos FORA das áreas (candidatos a tarefa — não reprovam esta; pedidos pelo orquestrador).**
Todos se tornaram ALCANÇÁVEIS com esta tarefa, porque agora a parede de fato vira estado:
1. **Concordo com o (1) do executor — laço quente, alta, antes da T-058.** Conferido:
   `cota.ex:340-349` rearma em `reabre_em + folga` (2 min); `servidor.ex:381-384` acorda em
   `reabre_em` com `max(0, …)`; no `:acordar` (`servidor.ex:286`) a cota segue batida → regra 2 →
   `{:dormir, reabre_em}` já passado → `send_after(…, 0)`. Cada volta faz `carregar_tarefas`
   (`Repo.all` + 2 preloads), `Cota.estado/1` e `File.write!` — por ~2 min. Cuidado no conserto: hoje
   é ESSE laço que faz o piloto perceber o rearme; um piso de espera sozinho atrasa a retomada, então
   o par certo é piso + reagir ao `[:fabrica, :cota, :rearme]`, que o piloto já recebe
   (`Eventos.assinar/0` no `init`) e descarta em `servidor.ex:284`.
2. **Concordo com o (2), e ele é mais largo e mais grave do que o executor descreveu — é o
   terceiro furo que o orquestrador pediu.** `Trabalho.finalizar/3` julga sem olhar
   `resumo.desfecho` nos TRÊS papéis, e no revisor o resultado é **aprovação falsa**:
   `julgar(:revisor, …)` (`fila/trabalho.ex:390`) lê a conformidade dos relatos — vazios numa parede —
   com `Revisor.ler_conformidade/1`, cujo acumulador começa em `:conforme`
   (`portoes/revisor.ex:219-229`), e `achados == []` → `Revisor.julgar/2` dá `:aprovado` → a tarefa
   vai a **`concluida` sem revisão nenhuma**. Cenário: T-058 na cota do plano, a parede cai durante
   o job do revisor → tarefa concluída sem que o revisor rodasse. (O mesmo vale para qualquer
   `{:erro, _}` do `Laco` no revisor — `:sandbox_indisponivel`, por exemplo — não só a parede.) No
   construtor é o que o executor disse (vai a `em_teste` vazia, o verificador reprova e queima
   tentativa); no verificador o julgamento mecânico ainda roda e é o menos danoso. Conserto provável
   num lugar só: desfecho `:erro` de parede não julga — devolve a tarefa ao estado de origem /
   re-enfileira para depois do rearme. Severidade sugerida: **alta, antes da T-058**.
3. **Quarto, menor que os anteriores (média): a parede conta como "rodada sem concluir".**
   `servidor.ex:299-312` incrementa `rodadas_seguidas_sem_concluir` porque `concluiu?` exige
   `:fim_do_turno`, e o contador sobrevive ao sono. Com horário legível, a parede "rouba" um dos 2
   strikes da regra 5 (`decisao.ex:143`): parede + 1 rodada genuína sem concluir → `{:parar,
   :estagnado}` — exatamente a classificação errada que o moduledoc da `Decisao` diz que a regra 2
   existe para evitar. Sem horário legível é pior: `rearmar_estado/1` zera `tentativa`
   (`cota.ex:324-330`), então o recuo NUNCA cresce (toda parede começa em 1 min); a 2ª parede ~1 min
   depois é quase certa e, no rearme seguinte, o piloto para `:estagnado` sem despachar. Variante:
   reinício do app durante a parede — `handle_continue(:retomar, …)` (`servidor.ex:217-219`) ignora o
   `dormindo_ate` persistido (a `Cota` volta livre, só memória), despacha direto na parede e soma
   outro strike.

