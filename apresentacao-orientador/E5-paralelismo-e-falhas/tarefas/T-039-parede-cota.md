---
id: T-039
titulo: "A parede de cota: reconhecer, dormir e rearmar"
projeto: fabrica-v2
versao: v0.4
status: concluida
prioridade: alta
dependencias: [T-018, T-037]
areas: [lib/fabrica/cota.ex, test/fabrica/cota_test.exs]
tentativas: 2
criada: 2026-08-28
atualizada: 2026-09-07
---

## Objetivo
Reconhecer que a cota da assinatura acabou, extrair o horario de reabertura, dormir ate la e
rearmar sozinho — sem perder o trabalho em fila.

## Contexto
ESTE MECANISMO NAO EXISTE EM DOCUMENTO NENHUM DO TCC, e e estrutural: a fabrica nao paga
por token, consome cota. Sem ele, bater a parede simplesmente derruba a rodada. Na v1 ele e
cidadao de primeira classe (`ehLimiteDeUso`, `horaDeReabertura`, o rearme do piloto) — porte
a logica lendo `<fabrica-v1>/painel/servidor/src/jobs/claude/runner-claude.ts` e
`jobs/piloto/reabertura.ts`.

Tres partes:

  1. **Reconhecer** — o `Operario.ClaudeCLI` ja traduz para `{:erro, {:cota, reabre_em}}`
     (T-016). Aqui isso vira estado do sistema, nao erro de um despacho.
  2. **Dormir** — pausar as filas do Oban, sem cancelar o que esta enfileirado. O trabalho
     fica; so nao sai.
  3. **Rearmar** — agendar a retomada para o horario informado, com folga. Se o horario nao
     vier, use recuo exponencial com teto de 1 hora.

O horario vem em formato humano ("5:30pm (America/Sao_Paulo)"), nao ISO. Faca o parse com
tolerancia e, quando falhar, caia no recuo exponencial — nunca trave por nao entender uma
string.

Deixe isso VISIVEL: uma consulta responde "a cota esta batida agora? ate quando?". E o que a
tela da v1.0 mostra e o que evita o usuario achar que a fabrica travou.

## Criterios de aceite
- [ ] Erro de cota pausa as filas sem cancelar trabalho enfileirado.
      `verificar: mix test test/fabrica/cota_test.exs`
- [ ] O horario de reabertura em formato humano e interpretado corretamente (varios formatos testados).
      `verificar: mix test test/fabrica/cota_test.exs`
- [ ] Horario ilegivel cai em recuo exponencial com teto, em vez de travar.
      `verificar: mix test test/fabrica/cota_test.exs`
- [ ] A consulta de estado responde se a cota esta batida e ate quando.
      `verificar: mix test test/fabrica/cota_test.exs`

## Notas de execucao

**`<fabrica-v1>/painel/servidor/src/jobs/claude/runner-claude.ts` nao existe nesta maquina**
(confirmado por busca antes de comecar) — portei a logica a partir do que ESTA presente e
verificavel neste repositorio: o `@moduledoc` de `Fabrica.Operario.ClaudeCLI` (secao "A parede
de cota", medida contra o CLI real na T-018a) e os emissores `Fabrica.Eventos.cota_parede/1` e
`cota_rearme/1` — que ja existiam, documentados como "ainda sem chamador nesta versao". Esta
tarefa e o PRIMEIRO chamador dos dois.

**Modulo novo: `Fabrica.Cota`, um `GenServer`.** Precisa ser processo (nao modulo puro) porque
"rearmar sozinho" exige um timer que dispara sem ninguem chamar de novo — `Process.send_after/3`
+ `handle_info(:rearmar, ...)`.

**As tres partes do Contexto, uma a uma:**

1. **Reconhecer.** `parede/2` aceita o que os dois operarios ja devolvem —
   `{:erro, {:cota, reabre_em}}` ou `{:cota, reabre_em}` — E o `reabre_em` cru. Dentro,
   `horario_de_reabertura/1` tenta, nesta ordem: `DateTime.t()` (passa direto — o caso comum,
   ja que ClaudeCLI/MessagesAPI resolvem epoch Unix e ISO 8601 para `DateTime` antes de chegar
   aqui), `nil`, epoch inteiro, ISO 8601 e, por ultimo, **o caso que faltava**: formato humano
   tolerante (`"5:30pm (America/Sao_Paulo)"`, `"17:30 (UTC)"`) via regex +  um mapa fixo de
   poucos fusos conhecidos (fuso desconhecido cai em UTC, nunca trava). Documentei em
   `@moduledoc` por que isto NAO justifica trazer `tz`/`tzdata` (filtro de adocao do
   `BIBLIOTECAS.md`): o objetivo e "nao travar e acordar perto da hora certa", nao correcao de
   fuso historico.
2. **Dormir.** `parede/2` pausa as filas via `estado.pausar.()` — por padrao
   `&Oban.pause_all_queues/0` — SO na transicao para batida (chamadas repetidas so reagendam,
   nunca pausam de novo nem reemitem o evento). Nunca cancela nem descarta job: a prova mais
   forte do teste 1 insere um `Oban.Job` de verdade (`Fabrica.Fila.Trabalho.novo/2`) contra o
   Oban REAL da aplicacao (nao um duble) e confere que ele continua `available` depois da
   parede bater.
3. **Rearmar.** Com horario legivel, agenda para `reabre_em + folga` (`folga/0`, 2 min por
   padrao — tolerancia a relogio dessincronizado). Sem horario legivel, cai em
   `recuo_exponencial/3` (dobra a cada tentativa, teto de 1h) — a tentativa SO incrementa
   quando o horario nao pode ser lido; um horario valido zera a contagem.

**Consulta de estado:** `estado/1` devolve `%{batida?, reabre_em, proxima_tentativa_em}` — a
pergunta que a v1.0 precisa responder na tela. `batida?/1` e atalho.

**Por que closures (`:pausar`/`:retomar`) em vez de um modulo fixo, ou um duble em arquivo
separado:** o valor padrao chama o Oban real (`Oban.pause_all_queues/0` so precisa do
`Notifier` de pe, que sobe mesmo sob `testing: :manual` — a config de teste desta fabrica), e
o teste que precisa provar "nao cancela trabalho" usa esse padrao contra o Oban de verdade. Os
testes de recuo/parse/estado trocam por uma funcao que so avisa o processo de teste
(`fn -> send(teste, :pausou) end`) — sem Postgres no meio, sem arquivo novo fora das `areas`
declaradas.

**Nao fiz (fora do escopo declarado nas `areas`):** este modulo NAO esta plugado em
`Fabrica.Application` nem no `Laco`/`ClaudeCLI` — quem bate a parede hoje ainda nao chama
`Fabrica.Cota.parede/2`. As `areas` desta tarefa eram só `lib/fabrica/cota.ex` e
`test/fabrica/cota_test.exs`; a integracao (subir `Fabrica.Cota` na arvore de supervisao e
fazer o `Laco`/`Supervisor.Executor` chamar `parede/2` quando o operario devolver
`{:erro, {:cota, _}}`) fica registrada abaixo como sugestao de proxima tarefa.

**Reproduzir:** `mix test test/fabrica/cota_test.exs` (17 testes; precisa do Postgres de
`_sistema/ferramentas/banco-v2.ps1 subir` no ar, como qualquer teste desta suite).

**Commit:** `93dbfe4`

## Conformidade

Conformidade: cumpre

- Erro de cota pausa as filas sem cancelar trabalho enfileirado → `lib/fabrica/cota.ex:242-252` (`handle_call({:parede,...})` chama `estado.pausar.()` só na transição para batida) + teste "um job ja enfileirado continua available depois da parede bater" (`test/fabrica/cota_test.exs:29-42`), que insere um `Oban.Job` real e confere `state == "available"` após a parede bater.
- Horário em formato humano interpretado corretamente (vários formatos) → `horario_de_reabertura/1` + `horario_humano/1` (`lib/fabrica/cota.ex:170-186, 224-262`) + 8 testes (`test/fabrica/cota_test.exs:97-152`) cobrindo DateTime, nil, epoch, ISO 8601, "5:30pm (America/Sao_Paulo)", "5:30 PM (UTC)", "17:30 (UTC)", fuso desconhecido e texto sem hora.
- Horário ilegível cai em recuo exponencial com teto → `recuo_exponencial/3` + `agendar_recuo/1` (`lib/fabrica/cota.ex:188-198, 293-297`) + 2 testes (`test/fabrica/cota_test.exs:155-176`), inclusive confirmando que a tentativa dobra a cada chamada com string ilegível.
- Consulta de estado responde se a cota está batida e até quando → `estado/1`/`batida?/1` (`lib/fabrica/cota.ex:130-136`) + 3 testes (`test/fabrica/cota_test.exs:179-213`), inclusive rearme automático via timer.
- Objetivo, no espírito: o módulo reconhece, dorme e rearma sozinho como processo isolado. A integração real com `ClaudeCLI`/`Laço` (que faria o "reconhecer" disparar automaticamente em produção) foi deliberadamente deixada de fora — e isso é coerente com o plano, não uma lacuna desta tarefa: `_gestao/tarefas/T-041-marco.md:30,39` já prevê testar "a parede de cota de forma controlada" como marco posterior, e `_gestao/tarefas/T-050-telemetria.md:69-70` registrava, antes desta tarefa, que `Fabrica.Cota` "ainda não existe" e por isso não podia ser plugado. A tarefa também respeitou as `areas` declaradas (`lib/fabrica/cota.ex`, `test/fabrica/cota_test.exs`), que não incluíam os pontos de integração.
- Escopo: sem sobra. O diff toca só as duas `areas` declaradas, mais `_gestao/MAPA.md` (gerado, esperado) e o próprio arquivo da tarefa.
- Prova visual: não aplicável — tarefa sem interface.

## Revisao

Aprovado sem ressalvas que bloqueiem. Verifiquei a matemática de fuso em `no_futuro/2`
(deslocamento aplicado e revertido corretamente contra o teste "5:30pm (America/Sao_Paulo)
vira 20:30 UTC"), a idempotência de `rearmar_estado/1` sobre estado já não-batido, e que
nenhuma cláusula de parse pode levantar exceção (todo caminho ilegível cai em `nil`
explícito). `mix test test/fabrica/cota_test.exs` → 17 testes, 0 falhas (reexecutado nesta
revisão).

- [menor] `lib/fabrica/cota.ex:145` — `Cota.folga/0` devolve sempre `@folga_padrao` (a
  constante de módulo), nunca `estado.folga` da instância em execução. Se uma instância for
  configurada com `folga:` diferente do padrão (como os próprios testes fazem, ex.
  `folga: 0` em `test/fabrica/cota_test.exs:200-213`), `Cota.folga(nome)` — se algum dia
  chamada — devolveria um valor que não é o realmente aplicado a essa instância. Hoje
  inofensivo porque nada no diff consome essa função, mas o nome e a doc ("a folga
  aplicada") prometem o valor efetivo, não o padrão de fábrica.


## Verificação

### Ciclo 1 — Passada mecânica (sem modelo)

- [executado] Erro de cota pausa as filas sem cancelar trabalho enfileirado. — `mix test test/fabrica/cota_test.exs` → **PASSOU**
- [executado] O horario de reabertura em formato humano e interpretado corretamente (varios formatos testados). — `mix test test/fabrica/cota_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Horario ilegivel cai em recuo exponencial com teto, em vez de travar. — `mix test test/fabrica/cota_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A consulta de estado responde se a cota esta batida e ate quando. — `mix test test/fabrica/cota_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)

Graus de prova: 4 executado(s), 0 para julgamento (de 4).

### Ciclo 2

- **[PASSOU] [executado] Critério 1: Erro de cota pausa as filas sem cancelar trabalho enfileirado**
  Comando: `mix test test/fabrica/cota_test.exs`
  Testes: 3 testes cobrem este critério
    - um job ja enfileirado continua available depois da parede bater (contra Oban real)
    - emite [:fabrica, :cota, :parede] so na transicao para batida, nunca de novo
    - pausar so e chamado uma vez; retomar, ao rearmar

- **[PASSOU] [executado] Critério 2: O horario de reabertura em formato humano é interpretado corretamente (varios formatos testados)**
  Comando: `mix test test/fabrica/cota_test.exs`
  Testes: 8 testes cobrem este critério
    - DateTime passa direto
    - nil continua nil
    - epoch Unix (inteiro)
    - ISO 8601
    - formato humano com meridiano e fuso — 5:30pm (America/Sao_Paulo) vira 20:30 UTC
    - formato humano em 24h, com espaco antes do meridiano — 5:30 PM (UTC)
    - formato humano sem meridiano — 17:30 (UTC)
    - fuso desconhecido cai em UTC, em vez de travar
    - sem hora legivel no texto, devolve nil

- **[PASSOU] [executado] Critério 3: Horario ilegivel cai em recuo exponencial com teto, em vez de travar**
  Comando: `mix test test/fabrica/cota_test.exs`
  Testes: 2 testes cobrem este critério
    - recuo_exponencial/3 dobra a cada tentativa, ate o teto
    - horario ilegivel agenda recuo em vez de travar, e a tentativa seguinte dobra

- **[PASSOU] [executado] Critério 4: A consulta de estado responde se a cota esta batida e ate quando**
  Comando: `mix test test/fabrica/cota_test.exs`
  Testes: 3 testes cobrem este critério
    - sem parede batida, batida? e falso e reabre_em e nil
    - com a parede batida, diz ate quando
    - rearma sozinho quando o timer estoura, sem esperar chamada nenhuma

Suíte completa: 17 testes passaram, 0 falharam — `mix test test/fabrica/cota_test.exs`
Graus de prova: 4 executado(s), 0 para julgamento (de 4)
