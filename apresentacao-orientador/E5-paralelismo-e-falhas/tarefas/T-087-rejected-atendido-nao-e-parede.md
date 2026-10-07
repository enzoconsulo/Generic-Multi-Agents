---
id: T-087
titulo: "`rate_limit_event` rejected com a resposta ATENDIDA não é parede de cota"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-086]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs]
tentativas: 3
criada: 2026-10-01
atualizada: 2026-10-01T22:45:00Z
---

## Objetivo
`ClaudeCLI.interpretar/1` só declara parede de cota (`{:erro, {:cota, reabre_em}}`) quando a chamada
de fato NÃO foi atendida. Um stream que traz `rate_limit_event` com `status: "rejected"` e, ainda
assim, termina num `result` com `is_error: false` e resposta é um despacho que ACONTECEU — o trabalho
dele é aproveitado, e o piloto não dorme por causa dele.

## Contexto
Achado do executor da T-084 (achado 1), conferido pelo orquestrador em 2026-10-01 com o evento cru:

```
"rate_limit_info": {"status": "rejected", "rateLimitType": "seven_day",
  "overageStatus": "rejected", "overageDisabledReason": "org_level_disabled",
  "isUsingOverage": false,
  "unifiedWindows": {"five_hour": {"utilization": 0}, "seven_day": {"utilization": 1}}}
```
seguido de `result` `subtype: success`, `is_error: false`, texto respondido, `total_cost_usd` > 0.
Hoje `parede?/1` (status que não começa por `allowed`) transforma isso em parede: TODO despacho real
neste estado viraria falha por cota DEPOIS de o trabalho ter sido feito e pago, e o piloto dormiria
até `resetsAt`.

Decisão do orquestrador (D-015, adendo): **o veredito é do `result`, não do aviso.** Parede = a
chamada não foi atendida (`result` com `is_error: true` por limite, ou stream sem `result` com o
evento `rejected`). Aviso `rejected` com `result` atendido segue como sucesso — e o aviso não pode
sumir em silêncio: registre-o (log de nível `warning`, com janela e `resetsAt`), para quem olhar
saber que a conta está no limite. Nada de cobrança extra está em jogo aqui: `isUsingOverage: false`.

## Critérios de aceite
- [ ] Stream com `rate_limit_event` `rejected` + `result` `is_error: false` → `interpretar/1` devolve
      sucesso com a resposta e o consumo (teste com o evento cru acima).
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Stream com `rate_limit_event` `rejected` e `result` de erro por limite (ou sem `result`) →
      continua `{:erro, {:cota, reabre_em}}` com o `resetsAt` do evento (os testes de parede que já
      existem passam sem mudança de expectativa).
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] (acrescentado pelo orquestrador no retrabalho, a partir da evidência da Revisão do Ciclo 1)
      `rejected` + `result` com `subtype: "error_max_turns"`, `is_error: true`, `result: null`,
      `num_turns: 2` (o stream medido — ver Revisão) → `interpretar/1` devolve a resposta com
      `motivo_parada: :teto_de_voltas` e o consumo, mais o warning; NÃO parede. O mesmo vale para
      todo `result` de erro que não seja POR LIMITE: parede só quando o erro é o limite (ou não há
      `result`).
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] (acrescentado pelo orquestrador para o ciclo 3, a partir da Revisão do Ciclo 2 — DECISÃO
      fechada, não opção) Parede real nunca passa por atendida. Duas travas, as DUAS:
      (a) com o aviso `rejected` presente, `result` com `is_error: true` cujo `subtype` NÃO é um erro
      próprio conhecido (`error_max_turns`, `error_during_execution`, `error_max_budget_usd`) é
      parede; (b) um ÚNICO reconhecedor da mensagem de limite — o prefixo que o próprio CLI usa,
      "You've hit your … limit" com qualquer nome no meio, mais "monthly spend limit" — usado pelo
      caminho com aviso E pelo fallback por texto. Testes com as formas "You've hit your limit",
      "…weekly limit · resets …", "…session limit…", "…Opus limit…" e "…monthly spend limit", cada uma
      com e sem o aviso → `{:erro, {:cota, _}}`; e `error_max_turns` com aviso continua atendido.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] O aviso `rejected` atendido gera um `Logger.warning` com a janela e o `resetsAt` (teste com
      `capture_log`).
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`

## Notas de execução

### Ciclo 1

**O que mudou.** `cota/2` em `lib/fabrica/operario/claude_cli.ex` deixou de ler o
`rate_limit_event` não-`allowed` como veredito: ele é um AVISO, e só vira parede quando a chamada
NÃO foi atendida (`atendida?/1`). Atendida, `interpretar/1` segue para `montar/2` (resposta +
consumo, como qualquer sucesso) e o aviso vai para `Logger.warning` com status, janela
(`rateLimitType`), `resetsAt` em ISO-8601, `overageStatus`, `isUsingOverage` e `unifiedWindows`.
`@moduledoc` (seção "A parede de cota") e o comentário de `cota/2` registram a regra.

**Definição de "atendida" (decisão tomada aqui):** existe `result`, `is_error` diferente de `true`,
**e** houve resposta — algum bloco de `assistant` ou texto não-vazio no `result`. Motivos:
- o Objetivo diz "termina num `result` com `is_error: false` **e resposta**";
- o critério 2 exige que os testes de parede existentes passem sem mudança de expectativa, e o
  teste "rate_limit_event com status diferente de allowed E a parede" alimenta `rejected` +
  `result` success SEM resposta nenhuma (fixture `evento_resultado()` sozinha). Com a definição
  acima ele continua parede — nada prova que o modelo foi servido. Sem o "e resposta", esse teste
  teria de mudar de expectativa, contrariando o critério 2.

Outras escolhas (conservadoras, todas para o lado de continuar parede):
- só `rate_limit_event` é aviso; os formatos antigos (`subtype` `usage_limit`/`rate_limit`, ou
  `type: usage_limit`) vêm no lugar do `result` e continuam parede;
- `result` com `is_error: true` por QUALQUER motivo + aviso `rejected` → parede (o `result` não
  diz de forma estruturada se o erro foi "por limite"; errar para o lado da parede só custa sono);
- o fallback por TEXTO (`limit reached|usage limit|rate.?limit exceeded`) não passa pelo filtro de
  "atendida": a mensagem de limite escrita como texto é o próprio sinal de não-atendimento.

**Arquivos:** `lib/fabrica/operario/claude_cli.ex`, `test/fabrica/operario/claude_cli_test.exs`
(novo describe "aviso rejected com a chamada ATENDIDA nao e parede (T-087)", 5 testes; atributo
`@rate_limit_rejected_real` com a linha CRUA do `claude` 2.1.287, copiada do stream real; e o
comentário dos streams reais da T-086, que dizia que a T-087 estava pendente).

**Prova.**
- Vermelho antes do código (testes novos contra o `claude_cli.ex` do HEAD): `92 tests, 2 failures`
  — critério 1 e critério 3, ambos com `right: {:erro, {:cota, ~U[2026-10-02 03:00:00Z]}}`. Os
  testes do critério 2 já passavam (são trava de regressão).
- Verde depois: `92 tests, 0 failures`. `mix format --check-formatted` e `mix credo` nos dois
  arquivos: limpos; `mix compile --warnings-as-errors`: ok.
- Por critério: (1) "rejected + result is_error: false com resposta -> sucesso, com a resposta e o
  consumo" — stream real de haiku com o aviso cru antes do `result`: `:fim_do_turno`, bloco de
  texto, escrita de cache 4116, saída 61, custo a < 1% do `total_cost_usd`; (2) "rejected + result
  de ERRO por limite" e "rejected SEM result" → `{:erro, {:cota, reabre_em}}` com
  `DateTime.to_unix(reabre_em) == 1_790_910_000`, mais os 10 testes de "A PAREDE DE COTA" intactos;
  (3) `capture_log`: `[warning]`, `rejected`, `seven_day`, `2026-10-02T03:00:00Z`; e o negativo
  (stream sem aviso → nenhum warning de cota).
- Fluxo real: o stream INTEIRO de 24 linhas (com `system`, `stream_event`, `post_turn_summary`)
  passado a `interpretar/1` via `mix run --no-start` → `{:ok, :fim_do_turno, [texto "Hey! 👋 …"],
  %Consumo{tokens_cache_escrita: 4116, tokens_saida: 61, ttl_cache: :uma_hora}}` e o warning
  `rate_limit_event rejected com a chamada ATENDIDA … Janela: seven_day; resetsAt:
  2026-10-02T03:00:00Z; overageStatus: rejected; isUsingOverage: false; …`.

**Reproduzir:** `mix test test/fabrica/operario/claude_cli_test.exs`

**Commit:** `c3b158e`

**Para o orquestrador:**
- A definição de "atendida" acima (com o "e resposta") é um detalhe do D-015 adendo; não escrevi
  em `_gestao/DECISOES.md` porque está fora das `areas` desta tarefa — sugiro anexar ao D-015.
- Sugestão de tarefa (não feita aqui, risco pré-existente): o fallback por TEXTO varre o stdout
  INTEIRO, inclusive o texto do agente e os `input` de `tool_use`. Uma sessão atendida cuja
  resposta ou edição contenha "usage limit reached" (ex.: um agente editando este próprio
  `claude_cli_test.exs`) vira parede falsa. Restringir o texto ao `result`/stderr resolveria.
- Não medido: se o `claude` marca `is_error: true` num `result` `error_max_turns`. Se marcar, um
  despacho que bateu no teto de turnos com aviso `rejected` vira parede (trabalho descartado).
  Vale uma sonda antes do marco da T-058.

### Ciclo 2

**Ponto de partida: a reprovação por Conformidade.** O Ciclo 1 trocou "`result` com `is_error: true`
POR LIMITE" (Contexto / D-015 adendo) por "`is_error: true` por QUALQUER motivo". Refeito a partir
do Objetivo: o `result` de erro diz a própria causa, e só a causa LIMITE é parede.

**Regra nova de `atendida?/1`** (`lib/fabrica/operario/claude_cli.ex`):
- sem `result` → NÃO atendida (parede) — inalterado;
- `result` com `is_error: true` → atendida **a menos que** `erro_por_limite?/1`. Reconhecimento
  POSITIVO, nunca por exclusão: `subtype` `usage_limit`/`rate_limit`; `api_error_status` 429; ou o
  texto do `result` de erro casando `hit your (usage )?limit|limit reached|usage limit|rate.?limit`
  ("You've hit your limit", "usage limit reached", "5-hour limit reached", `rate_limit_error`).
  `error_max_turns`, `error_during_execution`, `error_max_budget_usd` e erro de API que não é de
  limite (529/500) → atendida → `montar/2`, exatamente o caminho de sem o aviso
  (`:teto_de_voltas` / `:recusa`, com o consumo), mais o `Logger.warning`;
- `result` sem erro → atendida se houve resposta (bloco de `assistant` ou texto no `result`) —
  inalterado; mantém parede o teste antigo "status diferente de allowed E a parede" (critério 2).
- O texto só é lido no `result` de ERRO: ali é a mensagem do CLI, não a resposta do agente.
  "context limit" não casa (erro de requisição, não de cota).
- `avisar_limite/2` agora recebe os eventos e diz no warning o `subtype` e o `is_error` do `result`
  (a frase antiga "result sem erro" ficou falsa). `@moduledoc` e o comentário de `cota/2` atualizados.
- Não medido: o valor 429 em `api_error_status` (o campo existe no `result` do 2.1.287, vem `null`
  no despacho saudável); entra pela semântica HTTP do código. O formato exato do `result` quando a
  cota de fato barra a chamada também não foi medido nesta tarefa — as formas de texto vêm das
  mensagens conhecidas do CLI e do teste do Ciclo 1 ("You've hit your limit").

**Testes** (`test/fabrica/operario/claude_cli_test.exs`, describe da T-087, +3):
- "rejected + result error_max_turns (o stream medido) -> :teto_de_voltas com consumo e warning;
  NAO parede" — stream da Revisão do Ciclo 1 (`rejected`, `tool_use` Bash, texto, `result`
  `error_max_turns`/`is_error: true`/`result: null`/`num_turns: 2`/`total_cost_usd: 0.0042558`;
  tokens ilustrativos): blocos, consumo, `capture_log` (warning, `rejected`, `seven_day`,
  `2026-10-02T03:00:00Z`) e **igualdade com o mesmo stream sem a linha do aviso**;
- "rejected + result de erro que NAO e por limite -> segue o caminho de sem o aviso" — 5 causas ×
  {com, sem} bloco de `assistant` (10 casos), cada um igual ao resultado sem o aviso;
- "rejected + result de erro POR LIMITE, em cada forma reconhecida -> parede" — 5 formas × 2 = 10
  casos, todos `{:erro, {:cota, _}}` com `resetsAt` 1_790_910_000 (trava de regressão do critério 2).

**Prova.**
- Vermelho (testes novos contra o código do Ciclo 1): `95 tests, 2 failures` — os dois primeiros,
  ambos `{:erro, {:cota, ~U[2026-10-02 03:00:00Z]}}`; o de forma por limite já passava (trava).
- Verde: `95 tests, 0 failures`; `mix format`, `mix compile --warnings-as-errors` e `mix credo` nos
  dois arquivos: limpos. Nenhum teste antigo mudou de expectativa.
- Fluxo manual (`mix run --no-start` com o stream medido): `rejected + error_max_turns` →
  `{:ok, %Resposta{motivo_parada: :teto_de_voltas, blocos: [Bash, texto], consumo: ...}}`, idêntico
  ao stream sem o aviso, mais o warning `... (result error_max_turns, is_error: true, nao por
  limite): nao e parede de cota. Janela: seven_day; resetsAt: 2026-10-02T03:00:00Z ...`;
  `rejected + "You've hit your limit"` e `rejected` sem `result` → `{:erro, {:cota,
  ~U[2026-10-02 03:00:00Z]}}`.

**Arquivos:** `lib/fabrica/operario/claude_cli.ex`, `test/fabrica/operario/claude_cli_test.exs`.

**Reproduzir:** `mix test test/fabrica/operario/claude_cli_test.exs`

**Commit:** `c3b158e`, `40bd87b`

**Para o orquestrador:** as sugestões do Ciclo 1 seguem valendo (fallback por TEXTO varrendo o
stdout inteiro; anexar a regra de "atendida" ao D-015 em `DECISOES.md`, fora das `areas`). Novo:
uma sonda que capture o `result` REAL de uma chamada barrada pela cota (ainda não medido) fecharia
a lista de formas de `erro_por_limite?/1` com dado, não com mensagens conhecidas.

### Ciclo 3

**Ponto de partida: a Revisão do Ciclo 2** (a parede de janela "You've hit your weekly limit ·
resets …" escapava de `erro_por_limite?/1` e virava `:recusa`) e o critério novo, que fecha a regra
em DUAS travas. Implementei as duas, sem escolher entre elas (`lib/fabrica/operario/claude_cli.ex`):

- **Trava (a) — `atendida?/1`.** Com o aviso `rejected` presente (`atendida?/1` só roda quando
  `aviso?/1` casou), `result` com `is_error: true` só é atendido se o `subtype` está em
  `@erros_proprios` (`error_max_turns`, `error_during_execution`, `error_max_budget_usd`) **e**
  `erro_por_limite?/1` é falso. Qualquer outro `subtype` com `is_error: true` (`success`, ausente,
  um nome futuro) → parede, com o `resetsAt` do aviso, sem depender do texto.
- **Trava (b) — `texto_de_limite?/1`, reconhecedor ÚNICO** (`@mensagem_de_limite`, a única regex do
  módulo que fala de limite), usado por `erro_por_limite?/1` (caminho com aviso) **e** pelo fallback
  por texto de `cota/2` (que tinha a própria lista inline). Formas: `hit your <qualquer nome>
  limit|budget` (o prefixo do próprio CLI, nome no meio, sem cruzar aspas nem quebra de linha),
  `monthly spend limit`, e as antigas `limit reached`, `usage limit`, `rate_limit_error`, `rate
  limit exceeded`. Lidas das strings do executável `/opt/claude-code/bin/claude` 2.1.287 (só
  leitura; o `claude` não foi chamado): o mapa de janelas do CLI (`five_hour:"session limit",
  seven_day:"weekly limit", seven_day_opus:"Opus limit", seven_day_sonnet:"Sonnet limit",
  overage:"usage credit limit"`) e os literais "monthly spend limit", "channel's monthly spend
  limit", "fast limit", "monthly limit" e "team's shared budget" (esta sem a palavra "limit" — por
  isso o `|budget`).
- `erro_por_limite?/1` lê o texto do `result` **e de `errors: [...]`** — no executável,
  `error_during_execution`/`error_max_budget_usd` levam o motivo em `errors`, não em `result`. Sem
  isso, um erro próprio com a mensagem de limite ainda seria parede pelo fallback, mas com
  `reabre_em: nil` em vez do `resetsAt` do aviso.
- `api_error_status` 429 continua (sinal positivo). Saiu de `erro_por_limite?/1` o teste de
  `subtype` `usage_limit`/`rate_limit`: ali só chegam os três erros próprios, era código morto (os
  formatos antigos continuam parede por `parede?/1`, testes de "A PAREDE DE COTA" intactos).
- `@moduledoc` ("A parede de cota") e os comentários de `cota/2`, `atendida?/1`,
  `erro_por_limite?/1` e do reconhecedor atualizados.

**Decisões / tensões registradas:**
- **Uma expectativa de teste do Ciclo 2 mudou, por força da trava (a):** o teste "rejected + result
  de erro que NAO e por limite" tinha `subtype: "success"` + "API Error: 529/500" como atendidos com
  o aviso. Pelo critério novo ("`subtype` que NÃO é erro próprio conhecido é parede"), com o aviso
  eles são parede — foram para o teste da trava (a). Sem o aviso continuam `{:ok, %Resposta{}}`
  (`:recusa`). Isso contraria a letra do critério 3 ("todo `result` de erro que não seja POR
  LIMITE" atendido) só nesse caso; segui o critério do Ciclo 3, que é a decisão fechada mais nova.
  Nenhum teste de PAREDE mudou de expectativa (critério 2).
- `rate.?limit` SOLTO saiu do caminho do `result` (estava no Ciclo 2): o reconhecedor agora também
  varre o stdout inteiro no fallback, e todo stream traz `rate_limit_event`/`rate_limit_info`/
  `rateLimitType` — seria parede em toda chamada. Ficou `rate_limit_error` e `rate limit exceeded`;
  o 429 segue pelo `api_error_status`, e com o aviso a trava (a) cobre o resto.

**Testes** (`test/fabrica/operario/claude_cli_test.exs`, describe da T-087; atributo
`@mensagens_de_parede` com 12 formas — as 5 do critério + as do executável — e helper
`result_de_erro/1`):
- "rejected + result de ERRO PROPRIO conhecido que NAO e por limite" (reescrito): os 3 subtypes
  próprios (+ `error_during_execution` com `errors`) × com/sem bloco → atendido e igual ao sem aviso;
- "trava (a)": 6 formas de `is_error: true` com subtype não-próprio (529, 500, texto desconhecido,
  `result: nil`, sem subtype, subtype futuro) × com/sem bloco → com aviso, parede com `resetsAt`
  1_790_910_000; sem aviso, `{:ok, _}`;
- "trava (b)": cada uma das 12 mensagens × com/sem `assistant` sintético → **com** aviso parede com
  o `resetsAt`, **sem** aviso `{:erro, {:cota, _}}` (fallback);
- "trava (b) no caminho COM aviso": cada mensagem dentro de `error_during_execution` (em `result` e
  em `errors`) → parede com o `resetsAt` do aviso;
- "o reconhecedor da mensagem de limite e UM so": uma única `~r/…limit…` no fonte, chamada pelo
  `cond` de `cota/2`;
- "o proprio stream do CLI nao casa com o reconhecedor": haiku com aviso, haiku e sonnet reais → `{:ok, _}`.
- O `error_max_turns` medido com aviso continua `:teto_de_voltas` (teste do Ciclo 2, inalterado).

**Prova.**
- Vermelho (testes novos contra o código do Ciclo 2, antes de tocar em `lib/`): `100 tests, 4
  failures` — trava (a), trava (b), trava (b) com aviso e o reconhecedor único.
- Verde: `100 tests, 0 failures`; `mix format --check-formatted`, `mix credo` (2 arquivos, sem
  issues) e `mix compile --warnings-as-errors`: limpos.
- Fluxo manual (`mix run --no-start`, stream da Revisão: aviso cru + `assistant` `<synthetic>` +
  `result` `success`/`is_error: true`/`api_error_status: null`): "weekly limit", "session limit",
  "Opus limit", "monthly spend limit" e "You've hit your limit" → com aviso `{:erro, {:cota,
  ~U[2026-10-02 03:00:00Z]}}`, sem aviso `{:erro, {:cota, nil}}`; `error_max_turns` com aviso →
  `motivo_parada: :teto_de_voltas` + o warning.

**Reproduzir:** `mix test test/fabrica/operario/claude_cli_test.exs`

**Commit:** `c3b158e`, `40bd87b`, `c3b5d5f`

**Para o orquestrador:** a sugestão do Ciclo 1 ficou mais urgente — o fallback por TEXTO varre o
stdout INTEIRO (inclusive texto do agente e `input` de `tool_use`) e o reconhecedor agora é mais
largo: um despacho ATENDIDO cujo agente escreva "You've hit your weekly limit" (ex.: editando este
`claude_cli_test.exs`) vira parede falsa. Restringir o fallback ao `result`/`errors`/stderr/linhas
não-JSON fecha isso; fica fora desta tarefa (muda o que o fallback lê, não o que ele reconhece).
Segue valendo: anexar a regra de "atendida" (agora com as duas travas) ao D-015 em `DECISOES.md`.


## Verificação

### Ciclo 1

- **[PASSOU] [executado] Critério 1: Stream com `rate_limit_event` `rejected` + `result` `is_error: false` → `interpretar/1` devolve sucesso com a resposta e o consumo**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs --only "rejected + result is_error: false com resposta"`
  Saída: Teste "rejected + result is_error: false com resposta -> sucesso, com a resposta e o consumo" PASSOU. Verificado que: (1) `interpretar/1` devolve `{:ok, %Resposta{}}` com motivo_parada = :fim_do_turno; (2) a resposta de texto "Hey! 👋 What can I help you with today?" está nos blocos; (3) consumo calculado corretamente: tokens_cache_escrita=4116, tokens_saida=61, ttl_cache=:uma_hora; (4) custo calculado bate com total_cost_usd (desvio < 1%).

- **[PASSOU] [executado] Critério 2: Stream com `rate_limit_event` `rejected` e `result` de erro por limite (ou sem `result`) → continua `{:erro, {:cota, reabre_em}}`**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: Dois testes passaram: (1) "rejected + result de ERRO por limite -> continua parede, com o resetsAt do evento" — verifica que com `is_error: true` continua parede com resetsAt correto (1_790_910_000 = 2026-10-02T03:00:00Z); (2) "rejected SEM result (a chamada nao terminou) -> continua parede, com o resetsAt" — valida dois cenários: só o aviso rejeitado e aviso + assistente sem result. Todos os 10 testes de "A PAREDE DE COTA" continuam passando sem mudança de expectativa (regressão 0).

- **[PASSOU] [executado] Critério 3: O aviso `rejected` atendido gera um `Logger.warning` com a janela e o `resetsAt`**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs --only "logger.warning"`
  Saída: Teste "o aviso rejected atendido NAO some em silencio: Logger.warning com a janela e o resetsAt" PASSOU. O log capturado contém: "[warning]", "rejected", "seven_day" (janela) e "2026-10-02T03:00:00Z" (resetsAt em ISO-8601). Teste negativo também passou: "sem aviso rejected, nenhum warning de cota" — confirma que sem o aviso não há warning.

Suíte completa: `mix fabrica.ci` — 92 testes específicos do arquivo (claude_cli_test.exs) PASSARAM; bateria de 6 estágios: formato OK, compilação OK, lint OK, testes OK (1234 testes totais, 0 falhas), tipos OK, backup OK.

Graus de prova: 3 executados, 0 inspecionados, 0 julgados.

### Ciclo 2

- **[PASSOU] [executado] Critério 1: Stream com `rate_limit_event` `rejected` + `result` `is_error: false` → `interpretar/1` devolve sucesso com resposta e consumo**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: Teste "rejected + result is_error: false com resposta -> sucesso, com a resposta e o consumo" PASSOU. Verificado: (1) `interpretar/1` retorna `{:ok, %Resposta{}}` com `motivo_parada: :fim_do_turno`; (2) texto "Hey! 👋 What can I help you with today?" está nos blocos; (3) consumo correto (tokens_cache_escrita=4116, tokens_saida=61); (4) custo bate com `total_cost_usd`.

- **[PASSOU] [executado] Critério 2: Stream com `rejected` + `result` erro por limite (ou sem `result`) → continua `{:erro, {:cota, reabre_em}}`**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: Testes "rejected + result de ERRO por limite" e "rejected SEM result" passaram com `resetsAt = 1_790_910_000` (2026-10-02T03:00:00Z). Todos os 10 testes de "A PAREDE DE COTA" passam sem mudança de expectativa (regressão 0).

- **[PASSOU] [executado] Critério 3 (NOVO): `rejected` + `result` `error_max_turns`, `is_error: true`, `num_turns: 2` → `interpretar/1` devolve sucesso com `motivo_parada: :teto_de_voltas` e warning (NÃO parede)**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: Teste "rejected + result error_max_turns (o stream medido) -> :teto_de_voltas com consumo e warning; NAO parede" PASSOU. Verificado: (1) `interpretar/1` retorna `{:ok, %Resposta{}}` com `motivo_parada: :teto_de_voltas` (não parede); (2) ferramenta Bash e texto "Vou listar os arquivos." estão nos blocos; (3) consumo completo (tokens_entrada=18, cache_escrita=1500, cache_leitura=9000, saida=120); (4) `Logger.warning` contém "rejected", "seven_day", "2026-10-02T03:00:00Z"; (5) resultado IDÊNTICO ao stream sem o aviso (`rejected`). Teste adicional: "rejected + result de erro que NAO e por limite" — 10 casos (5 erros × com/sem bloco assistant) todos seguem o caminho sem aviso, nunca parede.

- **[PASSOU] [executado] Critério 4: O aviso `rejected` atendido gera `Logger.warning` com janela e `resetsAt`**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: Teste "o aviso rejected atendido NAO some em silencio" PASSOU com `capture_log`: "[warning]", "rejected", "seven_day", "2026-10-02T03:00:00Z". Teste negativo "sem aviso rejected, nenhum warning de cota" confirma que sem aviso não há warning.

Suíte completa: `mix fabrica.ci` — 95 testes do arquivo PASSARAM (3 novos no Ciclo 2); bateria de 6 estágios OK (formato, compilar, lint, testes, tipos, backup), 0 falhas, 0 intermitentes acionadas.

Mutação: Quebrei `erro_por_limite?/1` para retornar `true` sempre → testes do critério 3 falharam com `left: {:ok, %Resposta{}}; right: {:erro, {:cota, ...}}` (esperado). Desfiz a mutação e todos os 95 testes voltaram a passar.

Graus de prova: 4 executados, 0 inspecionados, 0 julgados.

### Ciclo 3

- **[PASSOU] [executado] Critério 1: Stream com `rate_limit_event` `rejected` + `result` `is_error: false` → `interpretar/1` devolve sucesso com resposta e consumo**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: Teste passou. Verificado: (1) `interpretar/1` retorna `{:ok, %Resposta{}}` com `motivo_parada: :fim_do_turno`; (2) resposta de texto presente nos blocos; (3) consumo calculado corretamente (tokens e TTL).

- **[PASSOU] [executado] Critério 2: Stream com `rejected` + `result` erro por limite (ou sem `result`) → continua `{:erro, {:cota, reabre_em}}`**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: Testes passaram com `resetsAt = 1_790_910_000` (2026-10-02T03:00:00Z). Todos os 10 testes antigos de "A PAREDE DE COTA" passam sem mudança de expectativa (regressão 0).

- **[PASSOU] [executado] Critério 3 (NOVO): `rejected` + `result` `error_max_turns`, `is_error: true`, `num_turns: 2` → `interpretar/1` devolve sucesso com `motivo_parada: :teto_de_voltas` e warning (NÃO parede)**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: Testes passaram. Verificado: (1) `interpretar/1` retorna `{:ok, %Resposta{}}` com `motivo_parada: :teto_de_voltas` (não parede); (2) blocos e consumo presentes; (3) `Logger.warning` contém "rejected", "seven_day", "2026-10-02T03:00:00Z"; (4) resultado IDÊNTICO ao stream sem aviso.

- **[PASSOU] [executado] Critério 4 (NOVO — Ciclo 3): Parede real nunca passa por atendida — duas travas, as DUAS**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: Testes passaram. 100 testes, 0 falhas.
  
  **Trava (a)**: Com aviso `rejected` presente, `result` com `is_error: true` de subtype não-próprio → parede (sem depender do texto). Verificado via mutação: quebrei a linha 541-542 de `atendida?/1` para retornar `true` em vez de `false`; os 4 testes da trava (a) falharam **com o padrão esperado** (esperado: `{:erro, {:cota, _}}`; obtido: `{:ok, %Resposta{}}`). Desfiz a mutação e todos os 100 testes voltaram a passar.
  
  **Trava (b)**: Reconhecedor ÚNICO de mensagem de limite (regex `@mensagem_de_limite`) usado pelo caminho com aviso E pelo fallback por texto. Formas: "hit your <qualquer nome> limit|budget", "monthly spend limit", e formas antigas. Verificado via mutação: quebrei a regex para nunca casar (alterada para `/LIMIT_XYZ_IMPOSSIVEL/i`); os 4 testes da trava (b) falharam **com o padrão esperado** (esperado: `{:erro, {:cota, _}}`; obtido: `{:ok, %Resposta{}}`). Desfiz a mutação e todos os 100 testes voltaram a passar.
  
  Ambas as travas são independentes: a falha de cada uma é detectada por seus testes específicos, não pelos da outra.

- **[PASSOU] [executado] Critério 5: O aviso `rejected` atendido gera `Logger.warning` com janela e `resetsAt`**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: Testes passaram com `capture_log`: "[warning]", "rejected", janela, `resetsAt` em ISO-8601. Teste negativo confirma que sem aviso não há warning.

Suíte completa: `mix test test/fabrica/operario/claude_cli_test.exs` — 100 testes PASSARAM (todos os ciclos); `mix fabrica.ci` — fase de testes acionou intermitentes conhecidas (D-012: `busca_test.exs:242`), suíte re-executa normalmente. Arquivo específico da T-087 sempre com 0 falhas.

Mutação (a): Quebrei `atendida?/1` linha 541-542 → 4 falhas esperadas. Desfiz → 100 PASSOU.
Mutação (b): Quebrei `@mensagem_de_limite` → 4 falhas esperadas. Desfiz → 100 PASSOU.

Graus de prova: 5 executados, 0 inspecionados, 0 julgados.

## Conformidade

### Ciclo 1

Conformidade: cumpre-parcial (o que falta é parte do Objetivo → reprova)

- [Critério 1: `rejected` + `result` `is_error: false` → sucesso com resposta e consumo] →
  `lib/fabrica/operario/claude_cli.ex` `cota/2` (l. 469) + `atendida?/1` (l. ~498); teste
  "rejected + result is_error: false com resposta -> sucesso, com a resposta e o consumo"
  (`test/fabrica/operario/claude_cli_test.exs`, describe da T-087), com a linha CRUA do 2.1.287
  em `@rate_limit_rejected_real`. **Cumprido.**
- [Critério 2: `rejected` + `result` de erro por limite, ou sem `result` → `{:erro, {:cota, _}}` com
  o `resetsAt`] → mesmo `cota/2`; testes "rejected + result de ERRO por limite" e "rejected SEM
  result"; nenhum teste de "A PAREDE DE COTA" mudou de expectativa (o diff só toca um comentário
  fora do describe novo). **Cumprido.**
- [Critério 3: `Logger.warning` com janela e `resetsAt`] → `avisar_limite/1` (l. ~512); teste
  "o aviso rejected atendido NAO some em silencio" com `ExUnit.CaptureLog.with_log/1`, mais o
  negativo. **Cumprido.**
- **Objetivo — NÃO cumprido no caso `error_max_turns`.** O Objetivo é "só declara parede quando a
  chamada de fato NÃO foi atendida", e o Contexto (D-015 adendo) define parede como "`result` com
  `is_error: true` **por limite**, ou stream sem `result`". A entrega trocou "por limite" por
  "`is_error: true` por QUALQUER motivo" (Notas, "Outras escolhas"). O caso que isso pega não é
  hipotético: o orquestrador mediu no `claude` 2.1.287 real (haiku, `--max-turns 1`, Bash) um
  stream com `rate_limit_event` `rejected` terminando em `result` `subtype: "error_max_turns"`,
  `is_error: true`, `result: null`, `num_turns: 2`, `total_cost_usd: 0.0042558` — chamada
  ATENDIDA (duas voltas, ferramenta executada, paga), parada pelo teto de voltas DA FÁBRICA
  (`--max-turns` que a própria `linha/1` passa). O subtype é estruturado e o mesmo arquivo já o
  reconhece (`motivo_parada/1`, l. 666 → `:teto_de_voltas`). Ainda assim a entrega devolve
  parede, descartando o trabalho e pondo o piloto para dormir — exatamente o que o Objetivo
  existia para impedir. E hoje TODA chamada real carrega o aviso `rejected` (até
  2026-10-02 03:00 UTC), então todo despacho do marco T-058 que bater no teto de voltas cai nisso.
- **Escopo / áreas / decisões:** dentro das `areas`; nada fora de escopo. A definição de
  "atendida" com "e resposta" é defensável (preserva o critério 2) e está registrada nas Notas.
- **Prova visual:** não se aplica (sem UI).

O que falta para cumprir: `result` com `subtype: "error_max_turns"` (e, em geral, `is_error: true`
que não seja por limite) + aviso `rejected` tem de seguir como resposta — `{:ok, %Resposta{motivo_parada:
:teto_de_voltas}}` com o consumo — e emitir o `Logger.warning`, com um teste que use o stream que o
orquestrador mediu. Sugestão ao orquestrador: acrescentar esse caso como critério explícito, para
que a letra deixe de ser mais frouxa que o Objetivo.

### Ciclo 2

Conformidade: cumpre (a lacuna do Ciclo 1 foi fechada; o defeito que reprova este ciclo é de
correção e está na Revisão)

- [Critério 1: `rejected` + `result` `is_error: false` → sucesso com resposta e consumo] →
  `atendida?/1`, ramo `resultado ->` (`lib/fabrica/operario/claude_cli.ex`, l. ~520); teste
  "rejected + result is_error: false com resposta -> sucesso..." (inalterado desde o Ciclo 1).
  **Cumprido.**
- [Critério 2: `rejected` + `result` de erro por limite, ou sem `result` → `{:erro, {:cota, _}}`
  com o `resetsAt`] → `atendida?/1` ramos `nil -> false` e `%{"is_error" => true} -> not
  erro_por_limite?/1`; teste novo "rejected + result de erro POR LIMITE, em cada forma reconhecida"
  (5 formas × 2) + os antigos, sem mudança de expectativa. **Cumprido na letra, para as formas
  testadas.** Ressalva: a forma que o próprio `claude` 2.1.287 monta para a parede de janela
  ("You've hit your weekly limit ·" / "session limit ·") não está entre elas e escapa — achado
  `importante` na Revisão do Ciclo 2.
- [Critério 3 (retrabalho): `rejected` + `error_max_turns`/`is_error: true`/`result: null`/
  `num_turns: 2` → `:teto_de_voltas` com consumo e warning; todo erro que não seja POR LIMITE idem]
  → `atendida?/1` + `erro_por_limite?/1`; testes "rejected + result error_max_turns (o stream
  medido)" (com igualdade contra o mesmo stream sem o aviso) e "rejected + result de erro que NAO
  e por limite" (5 causas × 2). **Cumprido** — a reprovação do Ciclo 1 foi atendida pela regra
  pedida no Contexto ("`is_error: true` **por limite**"), não por um remendo do caso medido.
- [Critério 4: `Logger.warning` com janela e `resetsAt`] → `avisar_limite/2`; `capture_log` nos
  testes do critério 1 e do `error_max_turns`, mais o negativo. **Cumprido.**
- **Objetivo:** no espírito, sim — o despacho atendido (inclusive o parado pelo `--max-turns` da
  própria fábrica) chega ao chamador como resposta, com o consumo, e o piloto não dorme por ele.
- **Escopo / áreas / decisões:** só os dois arquivos das `areas` (+ o arquivo da tarefa); segue o
  D-015 adendo ("o veredito é do `result`"). Nada fora de escopo.
- **Prova visual:** não se aplica (sem UI).

### Ciclo 3

Conformidade: cumpre

- [Critério 1: `rejected` + `result` `is_error: false` → sucesso com resposta e consumo] →
  `atendida?/1`, ramo `resultado ->` (`lib/fabrica/operario/claude_cli.ex:533`); teste
  `claude_cli_test.exs:603` (inalterado). **Cumprido.**
- [Critério 2: `rejected` + `result` de erro por limite, ou sem `result` → `{:erro, {:cota, _}}` com
  o `resetsAt`] → `cota/2` (l. 484, 1º ramo do `cond`) + `atendida?/1` (`nil -> false`; `is_error:
  true` fora dos erros próprios `-> false`); testes l. 620, 635, 858 e os 10 de "A PAREDE DE COTA" —
  nenhum teste de parede mudou de expectativa (o único reescrito, l. 747, é de atendimento).
  **Cumprido.**
- [Critério 3: `rejected` + `error_max_turns`/`is_error: true`/`result: null`/`num_turns: 2` →
  `:teto_de_voltas` com consumo e warning; parede só quando o erro é o limite] → `@erros_proprios`
  (l. 512) + cláusula `when subtype in @erros_proprios -> not erro_por_limite?/1` (l. 538); teste
  l. 714 (com igualdade contra o mesmo stream sem o aviso). **Cumprido** para os erros próprios. A
  2ª frase ("todo `result` de erro que não seja POR LIMITE") ficou mais estreita: `subtype:
  "success"` + "API Error 529/500" com o aviso agora é parede — é o que a trava (a) do critério 4
  manda, e o orquestrador aceitou a precedência do critério mais novo. Registrado; não reprova.
- [Critério 4 (ciclo 3): duas travas, as DUAS]
  - (a) → `atendida?/1` l. 538-542: com o aviso, `is_error: true` fora de `@erros_proprios`
    (inclusive `subtype` ausente ou de versão futura) `-> false` → parede com o `resetsAt` do aviso,
    sem depender do texto; teste l. 776 (6 formas × com/sem bloco, mais o negativo sem aviso).
  - (b) → `@mensagem_de_limite` (l. 582) + `texto_de_limite?/1` (l. 584), a única regex de limite
    do módulo, usada por `erro_por_limite?/1` (l. 556, que lê `result` E `errors`) e pelo fallback
    de `cota/2` (l. 492); casa "hit your <nome> limit|budget" com o nome no meio + "monthly spend
    limit". Testes l. 805 (12 mensagens — as 5 nomeadas no critério e as do executável — × com/sem
    `assistant` × com/sem aviso), l. 824 (dentro de `error_during_execution`, em `result` e em
    `errors`), l. 841 (reconhecedor único) e l. 850 (o stream real não casa). `error_max_turns`
    com aviso continua atendido (l. 714, l. 747). **Cumprido.**
- [Critério 5: `Logger.warning` com janela e `resetsAt`] → `avisar_limite/2` (l. 594);
  `capture_log` em l. 647 e l. 714, mais o negativo l. 660. **Cumprido.**
- **Objetivo:** no espírito, sim, nos dois sentidos que esta revisão tinha de fechar: (1) a parede
  real ("You've hit your weekly/session/Opus limit…", "monthly spend limit") não passa mais por
  atendida — com o aviso, por estrutura (a) E por texto (b); sem o aviso, pelo fallback; (2) a
  chamada atendida (resposta normal, `error_max_turns`, `error_during_execution`,
  `error_max_budget_usd`) segue como resposta, com o consumo, e o piloto não dorme por ela —
  conferido também com os `errors` REAIS que o 2.1.287 monta para esses subtypes (ver Revisão).
- **Escopo / áreas / decisões:** só os dois arquivos das `areas` (+ MAPA e o arquivo da tarefa);
  segue o D-015 adendo e a decisão fechada do critério 4. Nada fora de escopo.
- **Prova visual:** não se aplica (sem UI).

## Revisão

### Ciclo 1

**Commit:** `c3b158e` (código + testes + MAPA) e `4c4c197` (hash) — campo presente, diff obtido por
ele. Arquivo aberto além do diff: `lib/fabrica/operario/claude_cli.ex` nas faixas de
`interpretar/1`, `montar/2` e `motivo_parada/1` (l. 412-420, 581-600, 664-669), para confirmar o
que o mesmo stream SEM o aviso produz; e um `grep` por `janelas_de_cota`/`{:cota,` em `lib/` para
confirmar que nenhum outro caminho transforma o aviso em parede (não transforma).

**Achados:**

- [importante] `lib/fabrica/operario/claude_cli.ex:501` (`atendida?/1`, condição
  `resultado["is_error"] != true`) — qualquer `result` de erro, inclusive o `error_max_turns` de
  uma chamada atendida, transforma o aviso `rejected` em parede. Cenário concreto, reproduzido
  localmente com `mix run --no-start` (sem chamar o `claude`): stream
  `[rate_limit_event rejected, assistant tool_use Bash, assistant texto, result {subtype:
  "error_max_turns", is_error: true, result: null, num_turns: 2, total_cost_usd: 0.0042558}]` →
  `interpretar/1` devolve `{:erro, {:cota, ~U[2026-10-02 03:00:00Z]}}`; o MESMO stream sem a linha
  do aviso → `{:ok, %Resposta{motivo_parada: :teto_de_voltas}}`. Consequências: (1) o despacho chega
  ao chamador como erro de cota, não como resposta — o que o agente já fez (arquivos editados,
  comandos rodados) não é aproveitado pelo fluxo; (2) o erro tem a forma que `Fabrica.Cota.parede/2`
  consome, e o piloto dorme até o `resetsAt` por um despacho que não bateu em cota nenhuma; (3) o
  consumo do `result` some com o erro — o `total_cost_usd` real não entra no `gasto_usd` do piloto
  (mesma família da T-089). A justificativa das Notas ("errar para o lado da parede só custa sono")
  não se sustenta: custa o trabalho e a conta. O mesmo raciocínio vale, em menor frequência, para
  qualquer outro `is_error: true` que não seja de limite (ex.: erro de API/modelo vira "parede" e
  dorme até o reset em vez de chegar como `:recusa`) — o Contexto pedia "is_error: true **por
  limite**", não "qualquer is_error".
- [menor] As Notas já apontavam o risco como "Não medido" e sugeriam sonda — bom registro de
  processo; a sonda foi feita pelo orquestrador e confirmou o caso. Fica anotado para que o
  retrabalho comece por ele, não pela redescoberta.

**Verificado e sem defeito:** `aviso?/1` restringe o perdão ao `rate_limit_event` (formatos antigos
`usage_limit`/`rate_limit` continuam parede); `avisar_limite/1` só é chamado quando `estruturado`
casou com `parede?/1`, então `rate_limit_info` e `status` existem; `horario/1` com `resetsAt`
ausente cai em "desconhecido" sem quebrar; o fallback por texto continua tendo precedência sobre o
perdão (ordem do `cond`); a linha crua do aviso não casa com o regex de texto (não gera parede
falsa por si); nenhum teste antigo mudou de expectativa; nenhum outro consumidor de `lib/` lê o
aviso como parede (`janelas_de_cota/1` só devolve as janelas).

Veredito: REPROVADA → `em-execucao`.

### Ciclo 2

**Commit:** `c3b158e`, `40bd87b` (código + testes) e `36d576f` (hash) — campo presente, diff do
ciclo obtido por `40bd87b`. A Verificação do ciclo 2 já estava commitada (`d2c89a8`). Além do
diff: `claude_cli.ex` l. 440-500 (o `cond` de `cota/2`, para ver a ordem entre parede estruturada,
fallback por texto e aviso atendido); e, para julgar se a lista de `erro_por_limite?/1` cobre a
parede REAL, uma busca só-leitura de strings no executável instalado `/opt/claude-code/bin/claude`
(2.1.287) — nenhuma chamada ao `claude`, nenhuma escrita. Uma segunda busca no executável (o mapa
de nomes de janela) foi negada pelo controle de permissões e não foi refeita; o achado abaixo não
depende dela.

**Achados:**

- [importante] `lib/fabrica/operario/claude_cli.ex:541-542` (`texto_de_limite?/1`, regex
  `hit your (?:usage )?limit|limit reached|usage limit|rate.?limit`): a mensagem que o `claude`
  2.1.287 monta para a parede de JANELA não casa, e a parede real passa como chamada atendida.
  Evidência no executável instalado: o construtor da mensagem é
  `` function Gy(e,n,r,s){...return`You've hit your ${e}${n}${g}`} ``, e o próprio CLI classifica
  a mensagem por prefixo — `` p=(h)=>m.startsWith(`You've hit your ${h}`); if(p(l.five_hour))return"session";
  if(p(l.seven_day))return"weekly"; ...return"model" `` —, ou seja, o nome da janela entra entre
  "hit your" e o resto ("session limit", "weekly limit", "Opus limit"...; há também os literais
  "You've hit your monthly spend limit" e "fast limit"). Só a forma genérica "You've hit your
  limit" casa. Reproduzido com `mix run --no-start` (sem `claude`), stream
  `[rate_limit_event rejected seven_day resetsAt 1790910000, (assistant <synthetic> com o texto),
  result {subtype: "success", is_error: true, result: <msg>, api_error_status: null}]`:
  "You've hit your weekly limit · resets Oct 2, 3am (UTC)", "...session limit...", "...Opus
  limit..." e "...monthly spend limit" → `{:ok, %Resposta{motivo_parada: :recusa}}` + warning
  "nao por limite ... nao e parede de cota" (com e sem o bloco de `assistant`); só "You've hit
  your limit · resets 3am (UTC)" → `{:erro, {:cota, ~U[2026-10-02 03:00:00Z]}}`. O fallback por
  texto do stdout inteiro (`limit reached|usage limit|rate.?limit exceeded`) também não pega
  nenhuma dessas, e o `api_error_status` 429 não foi medido no caso da parede — então nada mais
  segura. Cenário concreto: a conta está HOJE em `seven_day` `rejected` com utilização 1; quando a
  parede fechar de fato, cada despacho do marco T-058 volta em segundos como `:recusa`, o piloto
  NÃO dorme até o `resetsAt` e segue despachando contra a cota fechada — queimando rodadas e,
  pior, `tentativas` das tarefas (reprovação falsa → bloqueio → replanejamento automático), até o
  teto de rodadas. É REGRESSÃO deste ciclo: no HEAD anterior à T-087 e no Ciclo 1, `rejected` +
  `is_error: true` era parede. O desenho "reconhecimento positivo" é o pedido (Contexto: "por
  limite"); o defeito é a lista não conter a forma do próprio CLI em uso. Caminhos possíveis
  (decisão do executor): casar o prefixo que o próprio CLI usa (`You've hit your` … `limit`,
  qualquer nome no meio) e travar com teste das formas "weekly limit"/"session limit"/"Opus
  limit"/"monthly spend limit"; e/ou, com aviso `rejected` presente, tratar como parede o
  `is_error: true` de `subtype: "success"` cujo texto não seja reconhecidamente outro erro de API
  (o `error_max_turns`/`error_during_execution`/`error_max_budget_usd` têm subtype próprio e
  continuariam atendidos).
- [menor] Mesma lacuna, pré-existente e fora do escopo estrito desta tarefa: sem o
  `rate_limit_event`, o fallback por texto do stdout inteiro também não reconhece "You've hit your
  weekly/session limit". Se o executor corrigir o regex num ponto só (um único reconhecedor de
  "mensagem de limite" usado pelos dois caminhos), fecha as duas; senão, vale tarefa à parte.

**Verificado e sem defeito:** a reprovação do Ciclo 1 está atendida pela regra, não pelo caso — o
`error_max_turns` medido, `error_during_execution`, `error_max_budget_usd` e API 529/500 seguem o
caminho de sem o aviso (teste com igualdade explícita contra o stream sem a linha do aviso), com o
consumo do `result`; `atendida?/1` mantém `nil -> false` (stream sem `result` é parede) e o
`result` sem erro e sem resposta continua parede (teste antigo intacto); o texto de limite só é
lido no `result` de ERRO, então o agente falando de "rate limit" numa resposta atendida não vira
parede por esse caminho; `api_error_status` aceita inteiro e string; `avisar_limite/2` usa
`|| %{}` e não quebra sem `result` (e só é chamado com `result` presente); a ordem do `cond`
(parede estruturada não atendida → texto → aviso atendido) não mudou; nenhum teste antigo mudou
de expectativa; `@moduledoc` e comentários atualizados e coerentes com o código.

Veredito: REPROVADA → `em-execucao`.

### Ciclo 3

**Commit:** `c3b158e`, `40bd87b`, `c3b5d5f` + `72087d0` (hash) — campo presente; diff do ciclo
obtido por `c3b5d5f` (`claude_cli.ex`, `claude_cli_test.exs`, MAPA e a tarefa). A Verificação do
ciclo 3 já estava commitada (`556e877`). Além do diff: `claude_cli.ex` l. 405-505 e 586-625
(`interpretar/1`, o `cond` de `cota/2`, `avisar_limite/2`, `parede?/1`), para confirmar que o
fallback recebe `stdout <> stderr` e a ordem dos ramos; e leitura só-leitura das strings do
executável `/opt/claude-code/bin/claude` 2.1.287, para ver o que os erros PRÓPRIOS levam em
`errors`: `error_max_turns` → "Reached maximum number of turns (N)"; `error_max_budget_usd` →
"Reached maximum budget ($X)" (ou "Session cost is not a number … refusing to continue under
--max-budget-usd"). Nenhum casa com `@mensagem_de_limite`. O `claude` não foi chamado.

**Sonda** (`mix run --no-start`, streams montados à mão, sem `claude`):
- aviso + `tool_use` + `error_max_turns` com o `errors` REAL → `{:ok, :teto_de_voltas}` + warning;
- aviso + `error_max_budget_usd` com o `errors` REAL → `{:ok, :recusa}` + warning;
- aviso + `error_max_turns` sem `errors`, `api_error_status: null` → `{:ok, :teto_de_voltas}`;
- aviso + `success`/`is_error: true`/"You've hit your weekly limit · resets Oct 2, 3am (UTC)" →
  `{:erro, {:cota, ~U[2026-10-02 03:00:00Z]}}`; o mesmo sem o aviso → `{:erro, {:cota, nil}}`;
- aviso + resposta atendida cujo texto fala de "rate_limit_event"/"rate limiting" → `{:ok,
  :fim_do_turno}` (o `rate.?limit` solto saiu do reconhecedor, como dizem as Notas);
- sem aviso + "You've used 90% of your weekly limit" num `result` sem erro → `{:ok, :fim_do_turno}`.

**Achados:**

- [menor] processo — o testador (commit `556e877`) escreveu um bloco "### Ciclo 3" nesta seção
  Revisão, com "Veredito: APROVADA → `em-revisao`" e achados "[resolvido]"/"[verificado]" — fora do
  papel dele, que é a seção Verificação. O bloco foi substituído por este; o texto original está
  preservado em `556e877`. Quem ler "Veredito:" desta seção (pessoa ou motor) teria lido uma
  aprovação de revisão que ninguém deu.
- [menor] `lib/fabrica/operario/claude_cli.ex:492` — sem o aviso, a parede reconhecida por texto
  devolve `reabre_em: nil` nas formas de janela ("resets Oct 2, 3am (UTC)", "resets 3am (UTC)"):
  `horario_no_texto/1` não lê esse formato. Pré-existente, fora do diff e do critério (que pede
  `{:cota, _}` sem o aviso); com o aviso, o `resetsAt` vem do evento e está certo. Se a parede sem
  aviso for plausível no marco, vale tarefa para ler o horário dessas formas.
- [menor] a trava (a) é larga por decisão: enquanto o aviso `rejected` vier em toda chamada (hoje,
  até 2026-10-02 03:00 UTC), qualquer `is_error: true` sem `subtype` próprio — 529/500, mas também
  erro de autenticação ou de requisição — chega ao piloto como parede, e ele dorme até o `resetsAt`
  em vez de ver o erro. É o que o critério 4 manda e o orquestrador aceitou (lado seguro); fica
  anotado para quem estranhar um sono do piloto sem cota fechada.

(Já decidido como tarefa nova, não é achado deste ciclo: o fallback varre o stdout inteiro — e o
reconhecedor mais largo, "hit your … limit|budget", aumenta a superfície de parede falsa quando o
próprio agente escreve a frase.)

**Verificado e sem defeito:** trava (a) por cláusula de padrão — `subtype` ausente não casa a 1ª
cláusula e cai em `%{"is_error" => true} -> false` (parede), como o teste l. 776 fixa; `atendida?/1`
só roda com o aviso presente (`and` em curto-circuito em `cota/2`); trava (b) é de fato UM
reconhecedor (`@mensagem_de_limite`, chamado por `erro_por_limite?/1` e pelo `cond`), e o
`[^"\n]{0,60}?` não deixa o meio emendar duas strings do JSON; a retirada de
`usage_limit`/`rate_limit` de `erro_por_limite?/1` não é regressão — esses `subtype` não estão em
`@erros_proprios`, então caem na trava (a), e sem o aviso continuam parede por `parede?/1` (testes
de "A PAREDE DE COTA" intactos); `textos_do_erro/1` tolera `errors` ausente/não-lista e item
não-binário (`texto_de_limite?/1` → `false`); a ordem do `cond` não mudou; o aviso cru e os streams
reais haiku/sonnet não casam com o reconhecedor; nenhum teste de PAREDE mudou de expectativa — a
única expectativa alterada (529/500 com aviso: atendido → parede) foi aceita pelo orquestrador.

Veredito: APROVADA → `concluida`.
