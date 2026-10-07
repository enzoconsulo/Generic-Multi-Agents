---
id: T-053
titulo: "Parar e retomar: um botao que encerra um processo supervisionado"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-036, T-051, T-013b]
areas: [lib/fabrica_web/live/componentes/controles.ex, test/fabrica_web/controles_test.exs]
tentativas: 1
criada: 2026-08-28
atualizada: 2026-09-16
---

## Objetivo
Cortar um agente pela tela — e o supervisor devolve a tarefa a fila, sem deixar trabalho pela
metade nem arquivo editado sem dono.

## Contexto
"Parar custa um botao. Cortar um agente e encerrar um processo supervisionado." Na v1
cancelar no meio deixava trabalho solto na arvore de arquivos; aqui a recuperacao (T-042)
cuida do que sobrou.

Parar = `DynamicSupervisor.terminate_child/2`. O supervisor devolve a tarefa a fila com
motivo `:cortado_pelo_operador` — que e distinto de `:falha` e nao conta ciclo. Cortar por
decisao do operador nao e reprovacao da tarefa.

Retomar = reenfileirar a tarefa. Se havia trabalho parcial na arvore, a recuperacao commita
antes de reenfileirar, para o proximo despacho comecar de um estado limpo.

Confirmacao antes de cortar, mostrando o que ja foi gasto — a informacao que faz a decisao
ser informada em vez de reflexa.

## Criterios de aceite
- [x] Parar encerra o processo e devolve a tarefa a fila com motivo `:cortado_pelo_operador`.
      `verificar: mix test test/fabrica_web/controles_test.exs`
- [x] Corte pelo operador NAO conta ciclo.
      `verificar: mix test test/fabrica_web/controles_test.exs`
- [x] Retomar reenfileira, e trabalho parcial e commitado antes.
      `verificar: mix test test/fabrica_web/controles_test.exs`
- [x] A confirmacao mostra o gasto acumulado da tarefa antes de cortar.
      `verificar: mix test test/fabrica_web/controles_test.exs`

## Notas de execucao
Represada em 09/09 pelo orquestrador: depende da T-013b. O coletor de `Comando.rodar/4` perde
a saida do processo em ~7,5% das execucoes sob carga, o que faz a suite ficar vermelha ao acaso
e classifica criterio quebrado como `:entrega` — reprovacao falsa que queima um ciclo. Verificar
qualquer coisa antes disso e apostar num portao que mente. O motor repromove sozinho quando a
T-013b concluir.

### Ciclo 1 (2026-09-16)
A `T-013b` ja concluiu, entao o represamento acabou. As `areas` desta tarefa sao so
`controles.ex` e o teste — deliberadamente estreitas — entao a implementacao **compoe dois
modulos ja existentes e testados**, sem tocar `Fabrica.Tarefas.Maquina`, `Transicao` ou
`Fabrica.Telemetria`, todos fora do escopo declarado:

- **Parar** = `Fabrica.Agente.Supervisor.encerrar/1` (mata o processo) + um evento
  `[:fabrica, :tarefa, :transicao]` com `:de` e `:para` iguais ao status atual e
  `:motivo: :cortado_pelo_operador` no metadado. Usei esse nome de evento, e nao um novo
  `:cortada`, porque `Fabrica.Telemetria.eventos/0` so repassa ao PubSub uma lista curada —
  criar um evento novo exigiria editar `lib/fabrica/telemetria.ex`, fora das `areas`. Como o
  Parar NUNCA chama `Fabrica.Tarefas.Transicao.aplicar/3`, nao ha mudanca de estado real:
  `tentativas` e a contagem de `ciclos` ficam intocadas — e assim que o criterio "nao conta
  ciclo" se cumpre, estruturalmente, sem precisar de opcao nova em nenhum modulo de fora.
- **Retomar** = `Fabrica.Recuperacao.sanear(tarefas: [tarefa])`, escopado a uma tarefa so. E
  o MESMO modulo que saneia queda de node (T-040/T-042): devolve `em_teste`/`em_revisao` para
  `em_execucao` (ou mantem `em_execucao`, ja despachavel, sem transicao) e commita trabalho
  nao commitado dentro das `areas` da tarefa ANTES de reenfileirar — coberto por
  `recuperacao_test.exs`, que ja prova commit + `git status --porcelain` limpo depois.
  **Nota honesta de escopo:** retomar um verificador/revisor em voo (`em_teste`/`em_revisao`)
  gasta uma tentativa, pelo mesmo motivo documentado no `@moduledoc` de `Fabrica.Recuperacao`
  ("o mesmo preco de uma reprovacao real") — o criterio "nao conta ciclo" desta tarefa e sobre
  o **Parar**, nao sobre o Retomar, e os dois papeis tem custo assimetrico de proposito.
- A confirmacao (`pedir_parar` -> mostra `#controles-gasto-<id>` com a soma de
  `custo_usd` por ciclo/despacho/consumo da tarefa, o mesmo padrao de `ConsoleLive`) so
  executa o corte em `confirmar_parar`; `cancelar_parar` volta sem tocar em nada.
- `FabricaWeb.Componentes.Controles` e um `Phoenix.LiveComponent` com `handle_event/3`
  proprio (`phx-target={@myself}`), autonomo: recebe so `:id` e `:tarefa_id`, carrega a
  tarefa (com `:areas` e `:projeto`, que `Recuperacao.sanear/1` exige) e o gasto sozinho.
  Testado isolado com `live_isolated/3` sobre um host `ProvaLive` minimo definido dentro do
  proprio arquivo de teste (padrao recomendado do `phoenix_live_view` para componente sem
  rota propria).

**Reproduzir:** `mix test test/fabrica_web/controles_test.exs` (6 testes, 0 falhas).
Tambem passam limpos no que foi tocado: `mix format --check-formatted
lib/fabrica_web/live/componentes/controles.ex test/fabrica_web/controles_test.exs`,
`mix credo --strict lib/fabrica_web/live/componentes/controles.ex
test/fabrica_web/controles_test.exs` (sem achados) e `mix compile --warnings-as-errors`.

**Pendencia para tarefa futura (nao desta):** nenhum LiveView de producao ainda embute
`<.live_component module={FabricaWeb.Componentes.Controles} .../>` — `console_live.ex`
(T-051/T-052) e o lugar natural, mas esta fora das `areas` declaradas aqui.

**Commit:** `69308e5`

## Verificacao


## Conformidade

Conformidade: cumpre

- Parar encerra o processo e devolve a tarefa a fila com motivo `:cortado_pelo_operador` →
  `controles.ex:59-71` (`confirmar_parar` chama `AgenteSupervisor.encerrar/1` + emite
  `Eventos.tarefa_transicao/1` com `motivo: :cortado_pelo_operador`); provado por
  `controles_test.exs:139-159`.
- Corte pelo operador NAO conta ciclo → `confirmar_parar` nunca chama
  `Fabrica.Tarefas.Transicao.aplicar/3`, logo `tentativas` e `ciclos` ficam intocados —
  provado estruturalmente por `controles_test.exs:161-177` (`tentativas == 1`, 0 linhas em
  `ciclos`).
- Retomar reenfileira e commita trabalho parcial antes → `controles.ex:75-86` delega a
  `Fabrica.Recuperacao.sanear/1`, que já commita as `areas` da tarefa antes de devolver o
  estado (`recuperacao.ex:162-201`, reusado, não reescrito); provado por
  `controles_test.exs:216-236` (log do git mostra "recuperacao", `git status --porcelain`
  limpo).
- A confirmacao mostra o gasto acumulado antes de cortar → `controles.ex:139-142` (bloco
  `@confirmando?`) mostra `#controles-gasto-<id>`, calculado em `gasto_acumulado/1`
  (`controles.ex:112-124`), mesmo padrão de junção `tarefa -> ciclos -> despachos ->
  consumos` que `console_live.ex:125-139` usa; provado por `controles_test.exs:130-144`.
- `areas` respeitadas: o diff só toca `controles.ex`, `test/fabrica_web/controles_test.exs`
  e a regeneração mecânica de `_gestao/MAPA.md`. Nenhuma linha em `Maquina`, `Transicao` ou
  `Telemetria` — confirmado por `git show 69308e5`.
- Escopo: nenhuma sobra. A pendência declarada nas Notas (nenhum LiveView de produção ainda
  embute `<.live_component module={Controles} .../>`) é honesta e coerente com `areas`
  restritas a `controles.ex` — `console_live.ex` não está nas `areas` desta tarefa.
- Prova visual: não verificada — tarefa sem captura anexada na Verificação, mas o critério
  de UI aqui é comportamental (eventos, estado, git), coberto por teste `live_isolated`, não
  por tela; não há pendência de prova visual real.

## Revisao

Aprovado sem ressalvas de correção. Verificado no diff e cruzado com o código existente
(não alterado por esta tarefa):

- `AgenteSupervisor.encerrar/1` só envia `Process.exit/2` (assíncrono); `listar/0` já
  filtra por `Process.alive?/1` para cobrir a corrida entre o monitor do `Registry` e o do
  `Supervisor` (documentada no próprio `@moduledoc` de `listar/0`) — o `recarregar/2`
  chamado logo após `encerrar/1` em `confirmar_parar` não sofre o fantasma que esse filtro
  existe para evitar.
- O evento `[:fabrica, :tarefa, :transicao]` com `:de == :para` é reaproveitamento honesto
  de uma função já pública (`Eventos.tarefa_transicao/1`), e hoje nenhum consumidor
  (`console_live.ex`, `quadro_live.ex`) distingue `:de` de `:para` — só disparam refresh ao
  ver o nome do evento. Nenhum código de produção chama `Eventos.tarefa_transicao/1` fora
  deste componente ainda (a fiação real de transição fica para tarefa futura), então não há
  hoje um consumidor que dependa de `:de != :para` para decidir algo.
- `Fabrica.Recuperacao` já documenta, em `@moduledoc`, que `em_execucao` sem processo vivo
  "ja e despachavel como :construtor (Fabrica.Tarefas.Fila), nenhuma transicao de estado e
  necessaria" — a mesma doutrina que sustenta a leitura de "Parar" desta tarefa: não fazer
  transição em `em_execucao` está correto por essa regra já estabelecida em T-042, não é
  invenção deste diff.
- [menor] `controles.ex` — "Parar" sozinho não commita trabalho parcial não commitado (só
  `Recuperacao.sanear/1`, chamado por "Retomar", faz isso). Se o operador clicar Parar e
  nunca clicar Retomar, um arquivo editado sem dono (linguagem do Objetivo) pode ficar solto
  na árvore indefinidamente — nada força ou lembra o segundo clique. Não reprovo por isto
  porque os Critérios de aceite já separam explicitamente as duas responsabilidades em dois
  itens distintos ("Parar encerra..." vs "Retomar reenfileira e commita..."), e a tarefa não
  pediu commit automático no corte — mas vale registrar para quem for embutir este
  componente em produção (a pendência já anotada nas Notas) considerar disparar o
  saneamento automaticamente, ou pelo menos avisar na UI que o corte por si só não
  commita nada.
- [menor] O executor gravou corretamente o hash do commit (`69308e5`) nas Notas — sem
  achado de processo aqui, ao contrário do padrão que costuma faltar.


## Verificação

### Ciclo 2 (2026-09-16) — Verificação pelo Testador

Confirmo a passada mecânica reenexecutando os testes. Todos os critérios passaram.

- **[PASSOU] [executado] A suíte do projeto continua passando (não quebrou o que já existia)**
  Comando: `mix test` (completa)
  Saída: 990 testes executados, 0 falhas, 49.0s

- **[PASSOU] [executado] Parar encerra o processo e devolve a tarefa a fila com motivo `:cortado_pelo_operador`**
  Comando: `mix test test/fabrica_web/controles_test.exs`
  Saída: 6 testes executados (controles_test), 0 falhas
  Evidência: Teste "encerra o processo e devolve a tarefa a fila com motivo :cortado_pelo_operador" passa — valida que `AgenteSupervisor.encerrar/1` mata o processo e `Eventos.tarefa_transicao/1` emite o evento com `:motivo: :cortado_pelo_operador`.

- **[PASSOU] [executado] Corte pelo operador NAO conta ciclo**
  Comando: `mix test test/fabrica_web/controles_test.exs`
  Saída: 6 testes (mesmo comando; veredito reaproveitado)
  Evidência: Teste "nao conta ciclo — tentativas e a contagem de ciclos ficam intactas" passa — valida que após corte, `tentativas` fica intacta (continua 1) e nenhum `Ciclo` é criado, porque não há chamada a `Fabrica.Tarefas.Transicao.aplicar/3`.

- **[PASSOU] [executado] Retomar reenfileira, e trabalho parcial e commitado antes**
  Comando: `mix test test/fabrica_web/controles_test.exs`
  Saída: 6 testes (mesmo comando; veredito reaproveitado)
  Evidência: Teste "reenfileira e commita trabalho parcial antes, quando ha algum" passa — valida que `Recuperacao.sanear/1` commita o arquivo parcial (git log mostra "recuperacao", git status fica limpo) e tarefa volta a `em_execucao`.

- **[PASSOU] [executado] A confirmacao mostra o gasto acumulado da tarefa antes de cortar**
  Comando: `mix test test/fabrica_web/controles_test.exs`
  Saída: 6 testes (mesmo comando; veredito reaproveitado)
  Evidência: Teste "mostra o gasto acumulado antes de cortar" passa — valida que element `#controles-gasto-<id>` aparece com o valor da soma `Decimal` de `custo_usd` em todos os ciclos/despachos/consumos (padrão `ConsoleLive`).

Validações adicionais:
- **Format:** `mix format --check-formatted lib/fabrica_web/live/componentes/controles.ex test/fabrica_web/controles_test.exs` → sem aviso (passou)
- **Lint:** `mix credo --strict lib/fabrica_web/live/componentes/controles.ex test/fabrica_web/controles_test.exs` → 27 mods/funs, found no issues
- **Compile:** `mix compile --warnings-as-errors` → sem warnings
- **Escopo:** Diff toca apenas `lib/fabrica_web/live/componentes/controles.ex` e `test/fabrica_web/controles_test.exs` (áreas declaradas); implementação reutiliza `AgenteSupervisor.encerrar`, `Eventos.tarefa_transicao`, `Recuperacao.sanear` (módulos já testados, fora do escopo conforme o contrato).

Suíte completa: 990 passou, 0 falhou — `mix test`
Graus de prova: 5 executado(s), 0 para julgamento (de 5).
