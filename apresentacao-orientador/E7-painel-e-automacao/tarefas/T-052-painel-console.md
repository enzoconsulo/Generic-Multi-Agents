---
id: T-052
titulo: "Painel: console ao vivo do agente e custo da rodada"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-050, T-051, T-013b]
areas: [lib/fabrica_web/live/console_live.ex, test/fabrica_web/live/console_live_test.exs, lib/fabrica_web/router.ex]
tentativas: 1
criada: 2026-08-28
atualizada: 2026-09-16
---

## Objetivo
Ver o que o agente esta fazendo agora, volta a volta, e quanto a rodada ja gastou —
enquanto acontece, nao depois.

## Contexto
"O painel nao e enfeite: e o instrumento que torna o custo visivel enquanto ele acontece."

Tres blocos:
  - **em voo** — quem esta rodando agora, consultando o `Registry` (nao deduzindo de log)
  - **console** — as voltas do agente selecionado, com a ferramenta chamada em cada uma
  - **custo** — o gasto da rodada, POR TAREFA e nao so por execucao, com a reparticao de
    cache (escrita/leitura) visivel

A distincao "por tarefa, nao por execucao" e o que faltou na v1: o teto se calibrava pelo
custo de uma etapa e subestimava a tarefa inteira em quatro vezes — sempre para baixo,
sempre no sentido de comecar trabalho que nao cabia.

Mostre a parede de cota quando ela estiver batida, com o horario de reabertura. Sem isso o
usuario acha que a fabrica travou.

Console de agente pode produzir muita linha: limite o que fica em memoria na tela e ofereca
o registro completo por consulta.

## Criterios de aceite
- [ ] A lista de agentes em voo vem do `Registry` e some quando o agente termina.
      `verificar: mix test test/fabrica_web/live/console_live_test.exs`
- [ ] O custo aparece POR TAREFA, com a reparticao escrita/leitura de cache visivel.
      `verificar: mix test test/fabrica_web/live/console_live_test.exs`
- [ ] A parede de cota aparece na tela com o horario de reabertura quando ativa.
      `verificar: mix test test/fabrica_web/live/console_live_test.exs`
- [ ] Ha captura de tela em `_gestao/evidencias/` e ela foi olhada (inspecionavel).

## Notas de execucao
Represada em 09/09 pelo orquestrador: depende da T-013b. O coletor de `Comando.rodar/4` perde
a saida do processo em ~7,5% das execucoes sob carga, o que faz a suite ficar vermelha ao acaso
e classifica criterio quebrado como `:entrega` — reprovacao falsa que queima um ciclo. Verificar
qualquer coisa antes disso e apostar num portao que mente. O motor repromove sozinho quando a
T-013b concluir.

### Ciclo 1

**Dependencias conferidas antes de comecar:** T-050 (barramento `Fabrica.Eventos`), T-051
(padrao de LiveView ao vivo, `quadro_live.ex`) e T-013b (drenagem do coletor de `Comando`)
estao todas `concluida`. Sem impedimento.

**`lib/fabrica_web/router.ex` entrou nas `areas`** pelo mesmo motivo documentado no ciclo 2
da T-051: uma rota `live/2` nao existe sem entrada no router, entao a `area` original estava
incompleta. Uma linha so (`live "/console", ConsoleLive`).

**Os tres blocos, e a fonte de verdade de cada um:**
- **Em voo** — `Fabrica.Agente.Supervisor.listar/0`, que consulta o `Registry` de verdade
  (nao deduz de log). Como NAO existe evento de "agente morreu" no barramento (a morte e
  vista pelo `Supervisor`, nunca emitida em `Fabrica.Eventos`), a lista se atualiza por um
  tique periodico de 3s (`Process.send_after` agendado so quando `connected?`) e tambem ao
  receber `[:fabrica, :tarefa, :transicao]` — o sinal mais forte de "um agente acabou de
  rodar". Testado com um agente real subido via `Agente.Supervisor.iniciar/3`: aparece,
  depois eu mesmo mando o tique (`send(view.pid, :atualizar_em_voo)`) apos confirmar a morte
  via `Process.monitor`/`:DOWN`, e ele some.
- **Custo por tarefa** — soma de `Fabrica.Tarefas.Consumo` agrupada por tarefa
  (`ciclos -> despachos -> consumos`), com a reparticao entrada/cache-escrita/cache-leitura/
  saida ABERTA (nao um total), exatamente o numero que o Contexto pede. Recalculada a cada
  `tarefa_transicao` e a cada `despacho_volta` recebidos no barramento.
- **Parede de cota** — assina `[:fabrica, :cota, :parede]`/`[:fabrica, :cota, :rearme]` no
  MESMO barramento e NAO depende de `Fabrica.Cota` estar supervisionado: hoje **nenhum lugar
  do codigo inicia `Fabrica.Cota`** (`grep` confirmou: so aparece no proprio modulo e no
  teste, que sobe instancias com nome unico). A tela faz `Process.whereis/1` como melhor
  esforco no mount (para nao abrir muda se o processo ja estiver de pe com a parede batida)
  mas a fonte de verdade real e o EVENTO — que `Fabrica.Cota.parede/2` ja emite hoje,
  independente de qual instancia/nome disparou. Decisao deliberada: **nao** adicionei
  `Fabrica.Cota` a `lib/fabrica/application.ex`. Fazer isso tornaria `Fabrica.Cota` (nome
  padrao) um singleton rodando durante a suite inteira, e `parede/2` sem override chama
  `Oban.pause_all_queues/0` de verdade — um teste que batesse a parede por engano pausaria
  filas para QUALQUER outro teste de Oban rodando depois, na mesma arvore. Ligar o
  `Fabrica.Cota` a um disparador real de verdade (a propria parede de producao) e trabalho de
  quem primeiro tiver esse disparador — mesmo padrao que a Nota de execucao da T-050 registrou
  para `despacho_inicio/volta/fim`.

**Console (voltas do agente selecionado): limite atingido pelos dados disponiveis, registrado
como pendencia.** O Contexto pede "as voltas do agente selecionado, com a ferramenta chamada
em cada uma". Hoje NENHUM despachante real emite `Eventos.despacho_volta/2` (confirmado por
`grep`: so aparece em `eventos.ex` e no teste dele) e o contrato do evento
(`Fabrica.Eventos`, tabela no moduledoc) nao inclui nome de ferramenta — o unico lugar que
sabe qual ferramenta rodou e o estado EFEMERO de `Fabrica.Agente.Estado.mensagens`, que vive
dentro do processo `Fabrica.Agente.Laco` e nunca e publicado em lugar nenhum (nem Registry,
nem evento, nem banco). Criar esse caminho tocaria `laco.ex`/`estado.ex`/`eventos.ex`, todos
fora das `areas` desta tarefa, para um evento que ainda nao tem NENHUM chamador de producao —
o mesmo tipo de decisao de escopo que a Nota da T-050 ja tomou (nao redesenhar interface para
um consumidor que nao existe ainda). O que fiz: o painel LE `metadados[:ferramenta]` do
evento `despacho_volta` se ele vier (campo opcional, ponto de extensao pronto — "colar a
chamada, nao redesenhar a interface") e mostra "—" quando ausente; a limitacao de memoria
(`@limite_console_por_agente = 200`) e o corte mais antigo primeiro, como o Contexto pede.
"Oferecer o registro completo por consulta" fica pendente: nao ha hoje persistencia de turno
em banco para consultar depois — sugestao para o orquestrador registrar como tarefa futura
(provavelmente junto de quem finalmente ligar `Agente.Laco` a um despacho real).

**Nenhum dos 4 criterios de aceite depende do que fica pendente acima** — nenhum dos 3
criterios testaveis menciona o console; e a captura de tela (4o criterio) so exige existir e
ser inspecionavel, nao mostrar todos os blocos preenchidos.

**Evidencia:** `_gestao/evidencias/T-052-console.png`, capturada com
`node ../../_sistema/ferramentas/captura.mjs http://localhost:4021/console
_gestao/evidencias/T-052-console.png --espera=1500 --largura=1400 --altura=1000` contra o
servidor dev (subido/derrubado pelo PID via PowerShell, doutrina da fabrica) com dados
semeados por `mix run` (projeto/tarefa/ciclo/despacho/consumo). A imagem mostra os tres
blocos: "Em voo" vazio (legivel: "Nenhum agente em voo agora."), "Console" pedindo selecao, e
"Custo por tarefa" com a tabela real do banco de dev, incluindo a linha semeada
(`tokens_entrada 1200, cache-escrita 340, cache-leitura 5600, saida 210, custo 0.253100`) —
a reparticao de cache pedida no criterio 2 esta visivel de verdade, nao so em teste. Olhada
nesta sessao.

**Prova, so no que este ciclo tocou:**
- `mix format --check-formatted lib/fabrica_web/live/console_live.ex test/fabrica_web/live/console_live_test.exs lib/fabrica_web/router.ex` → exit 0
- `mix compile --warnings-as-errors` → compila limpo
- `mix credo --strict lib/fabrica_web/live/console_live.ex` → 22 mods/funs, found no issues
- `mix test test/fabrica_web/live/console_live_test.exs test/fabrica_web/live/quadro_live_test.exs test/fabrica/cota_test.exs test/fabrica/eventos_test.exs test/fabrica/agente/` → 90 tests, 0 failures (confirma que nada em T-050/T-051/T-039/T-036 quebrou)

**Reproduzir:** `mix test test/fabrica_web/live/console_live_test.exs` (6 testes: em voo
some quando o agente termina, estado vazio de em voo, custo por tarefa com reparticao de
cache, estado vazio de custo, parede de cota aparece/some por evento, console mostra volta e
ferramenta apos selecao).

**Pendencia sugerida para o orquestrador:** uma tarefa futura para (a) ligar `Agente.Laco` a
um despacho real emitindo `despacho_inicio/volta/fim` com o nome da ferramenta nos metadados,
e (b) decidir se `Fabrica.Cota` deve ser supervisionado por `application.ex` no caminho real
de producao (hoje nenhuma tarefa fez isso). Sem (a), o bloco "console" desta tela continua
vazio na producao real, exatamente como o bloco "custo por tarefa" da T-050 ficou vazio ate
alguem ligar o disparador.

**Commit:** `d5dec08`

## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] A lista de agentes em voo vem do `Registry` e some quando o agente termina. — `mix test test/fabrica_web/live/console_live_test.exs` → **PASSOU**
- [executado] O custo aparece POR TAREFA, com a reparticao escrita/leitura de cache visivel. — `mix test test/fabrica_web/live/console_live_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A parede de cota aparece na tela com o horario de reabertura quando ativa. — `mix test test/fabrica_web/live/console_live_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [julgado] Ha captura de tela em `_gestao/evidencias/` e ela foi olhada (inspecionavel). — sem comando declarado; fica para o verificador.

Graus de prova: 4 executado(s), 1 para julgamento (de 5).

### Ciclo 2 (verificação com modelo)

Testes mantêm-se verdes, captura de tela passou por inspeção:

- **[PASSOU] [executado] Critério 1: A lista de agentes em voo vem do `Registry` e some quando o agente termina.**
  Comando: `mix test test/fabrica_web/live/console_live_test.exs --max-cases=1`
  Saída: 6 tests, 0 failures

- **[PASSOU] [executado] Critério 2: O custo aparece POR TAREFA, com a reparticao escrita/leitura de cache visivel.**
  Comando: `mix test test/fabrica_web/live/console_live_test.exs --max-cases=1` (mesmo)
  Saída: 6 tests, 0 failures

- **[PASSOU] [executado] Critério 3: A parede de cota aparece na tela com o horario de reabertura quando ativa.**
  Comando: `mix test test/fabrica_web/live/console_live_test.exs --max-cases=1` (mesmo)
  Saída: 6 tests, 0 failures

- **[PASSOU] [julgado] Critério 4: Ha captura de tela em `_gestao/evidencias/` e ela foi olhada (inspecionavel).**
  Base: Captura `T-052-console.png` visualizada. Mostra três blocos esperados: (a) "EM VOO" vazio com texto "Nenhum agente em voo agora."; (b) "CONSOLE" pedindo seleção; (c) "CUSTO POR TAREFA" com tabela preenchida mostrando reparticao de cache (colunas "Cache escrita" e "Cache leitura" separadas), incluindo linha com dados `1200 entrada, 340 cache-escrita, 5600 cache-leitura, 210 saida, 0.253100 custo`.

Mutação: Remover `Eventos.assinar()` de `mount/3` → prova falha (2 failures, esperado) — **passou**

Suíte completa: 6 passou — `mix test test/fabrica_web/live/console_live_test.exs --max-cases=1`
Captura: `_gestao/evidencias/T-052-console.png` — painel com três blocos (em voo, console, custo por tarefa), reparticao de cache visível, dados reais semeados validam prototipo
Graus de prova: 4 executado(s), 1 julgado

## Conformidade

Conformidade: cumpre

- Lista de agentes em voo vem do `Registry` e some quando o agente termina →
  `lib/fabrica_web/live/console_live.ex` (`atualizar_em_voo/1` chama
  `Fabrica.Agente.Supervisor.listar/0`, que le o `Registry` de verdade — confirmado lendo
  `lib/fabrica/agente/supervisor.ex:74-93`). Testado em
  `test/fabrica_web/live/console_live_test.exs` ("vem do Registry e some quando o agente
  termina").
- Custo aparece POR TAREFA, com a reparticao escrita/leitura de cache visivel →
  `custos_por_tarefa/0` em `console_live.ex` (join `ciclos -> despachos -> consumos`,
  associacoes conferidas em `lib/fabrica/tarefas/{tarefa,ciclo,despacho,consumo}.ex`) +
  tabela no `render/1` com colunas "Cache escrita"/"Cache leitura" separadas. Testado e
  visivel na captura: a linha semeada mostra `1200/340/5600/210/0.253100`.
- Parede de cota aparece com o horario de reabertura quando ativa →
  `handle_info` para `[:fabrica, :cota, :parede]`/`[:fabrica, :cota, :rearme]` +
  bloco `#cota-parede` no `render/1`, contrato de metadados (`:reabre_em`) conferido contra
  `lib/fabrica/eventos.ex`. Testado ("aparece com o horario de reabertura... e some ao
  rearmar").
- Ha captura de tela em `_gestao/evidencias/` e ela foi olhada → `T-052-console.png`,
  visualizada nesta revisao. Mostra os tres blocos: "EM VOO" vazio ("Nenhum agente em voo
  agora."), "CONSOLE" pedindo selecao, e "CUSTO POR TAREFA" com tabela real do banco de dev,
  reparticao de cache visivel e a linha semeada batendo com o que as Notas descrevem.

**Nota que nao bloqueia:** o Contexto pede que o console "limite o que fica em memoria...
e ofereça o registro completo por consulta". A primeira metade esta feita
(`@limite_console_por_agente`); a segunda (consultar o historico alem do limite) nao foi
implementada — nao ha hoje persistencia de turno em banco, e cria-la tocaria
`laco.ex`/`estado.ex`/`eventos.ex`, fora das `areas` desta tarefa. Nenhum dos 4 criterios
testaveis depende disso, e a Nota de execucao registra a pendencia com uma sugestao
explicita de tarefa futura — mesmo padrao de escopo que a T-050 ja usou para o disparador
real de `despacho_inicio/volta/fim`. Trato isto como decisao de escopo razoavel e
transparente, nao como nao-conformidade.

## Revisao

Aprovado sem ressalvas.

Verificado no diff (`git show d5dec08`) e contra o codigo em volta, sem abrir nada fora do
que era preciso para confirmar contrato:
- `Fabrica.Eventos` (`lib/fabrica/eventos.ex`): as chaves de metadados/medidas que
  `console_live.ex` le (`:tarefa_id`, `:volta`, `:ferramenta`, `:reabre_em`, a reparticao de
  cache) batem com o contrato documentado; `Fabrica.Telemetria` repassa exatamente os seis
  eventos que a tela trata, entao `Eventos.assinar/0` recebe tudo que o `handle_info`
  espera — inclusive a clausula catch-all, corretamente por ultimo entre as clausulas de
  `handle_info/2` (nao interrompe o agrupamento, compila limpo).
- `Fabrica.Cota.estado/1` existe e devolve `%{batida?:, reabre_em:, ...}` — `Map.take/2` em
  `cota_agora/0` e seguro.
- Schemas (`Tarefa.has_many :ciclos`, `Ciclo.has_many :despachos`,
  `Despacho.has_many :consumos`, campos de `Consumo`) validam a query Ecto de
  `custos_por_tarefa/0` sem inventar associacao.
- `selecionado` (string, vindo de `phx-value-tarefa_id`) e comparado com `to_string/1` dos
  dois lados (template e `registrar_volta/3`) — sem risco de comparar tipos diferentes
  (string vs integer) silenciosamente.
- Nenhum arquivo fora das `areas` desta tarefa foi tocado, salvo os caminhos de gestao
  sempre isentos (`_gestao/MAPA.md`, `_gestao/evidencias/`, o proprio arquivo da tarefa).
- Commit `d5dec08` gravado corretamente nas Notas de execucao — nao foi preciso localizar
  hash por busca.

Nenhum achado `critica` ou `importante`.
