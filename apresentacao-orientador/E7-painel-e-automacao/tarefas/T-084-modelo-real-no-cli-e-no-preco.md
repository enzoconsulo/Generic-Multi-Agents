---
id: T-084
titulo: "O nome interno do modelo vira o ID que o `claude` de hoje aceita — no `--model` e na tabela de preços"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: []
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs, lib/fabrica/custo/precos.ex, test/fabrica/custo/precos_test.exs]
tentativas: 1
criada: 2026-10-01
atualizada: 2026-10-01
---

## Objetivo
Todo despacho real (`Operario.ClaudeCLI`) passa ao `claude` um `--model` que o CLI instalado ACEITA,
e o custo que volta do CLI é precificado — hoje as duas pontas falham e a T-058 (marco da v1.0) não
tem como rodar: o primeiro despacho do piloto morreria antes de qualquer trabalho.

## Contexto
Medido pelo orquestrador em 2026-10-01, na nuvem (`claude` 2.1.287), ao preparar a T-058:

- `Fila.Trabalho` (`@modelo "sonnet-5"`, ~l. 104) e `Planejador` (`@modelo_padrao "sonnet-5"`, ~l. 59)
  mandam o nome INTERNO cru para `ClaudeCLI.linha/1` (`--model #{requisicao.modelo}`, ~l. 248).
  O CLI recusa: `claude --print --model sonnet-5 …` → `is_error: true`, "There's an issue with the
  selected model (sonnet-5)", stderr `[claude-code:unrecognized_model]`. Aceitos, medidos:
  `sonnet` e `claude-sonnet-5-5` (o `modelUsage` volta `claude-sonnet-5-5`), `haiku` (volta
  `claude-haiku-4-5-20251001`). O mesmo vale para `opus-5` (o degrau de retrabalho da
  `Retrabalho.Escada`).
- `Custo.Precos` (`@apelidos`, ~l. 46-51) conhece `claude-sonnet-5` e `claude-opus-5`, mas NÃO os IDs
  que o CLI devolve hoje (`claude-sonnet-5-5`, `claude-opus-5-5`): o custo de todo despacho daria
  `{:erro, {:modelo_sem_preco, …}}` — o critério 4 da T-058 ("custo por tarefa na tela e no banco")
  cairia mesmo com o despacho funcionando.

**O conserto é UMA tradução, num lugar só** (GUIA, "já existe — não reinvente"): o nome interno
(`sonnet-5`, `opus-5`, `haiku-4.5`) continua sendo a chave da fábrica (contabilidade, cota, escada);
na fronteira com o CLI ele vira o ID real, e os IDs reais que voltam no `modelUsage` apontam para a
mesma linha de preço. Prefira os IDs completos (`claude-sonnet-5-5`, `claude-opus-5-5`,
`claude-haiku-4-5-20251001`) aos apelidos curtos (`sonnet`), que mudam de modelo sem aviso. Os
VALORES da tabela de preço não são desta tarefa (são estimativa contábil — moduledoc de `Precos`).
Confirme com UMA chamada real de cada ID ao `claude` (custa centavos de cota) e registre nas Notas.

## Critérios de aceite
- [ ] `ClaudeCLI.linha/1` com `modelo: "sonnet-5"`, `"opus-5"` e `"haiku-4.5"` produz `--model` com
      um ID que o CLI aceita (teste por modelo), e um nome interno desconhecido não vai cru para o
      CLI (erro nomeado, ou o comportamento que o código já tiver para modelo sem tradução — registre).
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] `Precos` precifica os IDs que o CLI devolve hoje (`claude-sonnet-5-5`, `claude-opus-5-5`,
      `claude-haiku-4-5-20251001`) na mesma linha do nome interno correspondente — teste novo.
      `verificar: mix test test/fabrica/custo/precos_test.exs`
- [ ] Uma chamada REAL ao `claude` com o `--model` gerado por `linha/1` para `sonnet-5` volta sem
      `is_error`, e o custo que ela reporta é precificado por `Precos` sem `:modelo_sem_preco`
      (registro nas Notas: comando, `modelUsage`, custo). (inspecionável — o revisor confere as Notas)

## Notas de execução

### Ciclo 1

**O que foi feito.** A tradução mora num lugar só: a fronteira com o CLI.

- `lib/fabrica/operario/claude_cli.ex`
  - `@modelos_cli` + `modelos_cli/0` (pública): `sonnet-5 → claude-sonnet-5-5`,
    `opus-5 → claude-opus-5-5`, `haiku-4.5 → claude-haiku-4-5-20251001`. Escolhi os IDs completos,
    não os apelidos curtos, como o Contexto pedia.
  - `modelo_cli/1` (pública): nome interno vira ID; ID completo e apelido curto do próprio CLI
    (`sonnet`/`opus`/`haiku`) passam como já traduzidos (é idempotente); **qualquer outra coisa
    devolve `{:erro, {:modelo_sem_traducao, nome}}`**, inclusive `nil`.
  - `linha/1` passa a devolver `{:ok, linha} | {:erro, {:modelo_sem_traducao, nome}}`, e
    `--model` leva o ID traduzido, nunca `requisicao.modelo` cru. O código não tinha
    "comportamento para modelo sem tradução" (mandava cru), então o erro nomeado é o
    comportamento novo. Os únicos chamadores de `linha/1` eram `conversar/2` e o teste. As
    sondas só a citam em comentário.
  - `conversar/2` monta a linha ANTES do arquivo do prompt. Com modelo sem tradução, devolve o
    erro nomeado sem subir processo e sem deixar arquivo temporário.
- `lib/fabrica/custo/precos.ex`: `@apelidos` ganha `claude-sonnet-5-5 → sonnet-5` e
  `claude-opus-5-5 → opus-5` (`claude-haiku-4-5-20251001` já existia). Os VALORES da tabela não
  mudaram.
- Testes (escritos antes; o vermelho foi `112 tests, 23 failures`, e o verde é `112 tests, 0 failures`):
  - `test/fabrica/operario/claude_cli_test.exs`: novo describe "o modelo na fronteira com o CLI
    (T-084)" com um teste por modelo, além de idempotência, cobertura dos 3 nomes, desconhecido
    → erro nomeado, `nil` → erro nomeado e apelidos curtos passando. Também ganhou um teste de
    `conversar/2` com modelo inventado: devolve o erro e **o executável falso nunca é chamado**.
    As 13 chamadas antigas de `ClaudeCLI.linha(` passaram a usar o helper `linha!/1`, que
    desembrulha o `{:ok, _}`.
  - `test/fabrica/custo/precos_test.exs`: novo describe com um teste por ID real (`preco` e
    `estimar` iguais aos do nome interno), o `resumir/1` com os 3 IDs sem `:modelo_sem_preco` e
    a **trava entre as duas pontas**: todo ID de `ClaudeCLI.modelos_cli/0` tem de cair na linha
    de preço do nome interno de origem. Se alguém trocar o ID de um lado sem atualizar o outro,
    o teste quebra aqui, e não no primeiro despacho real.

**Decisão: apelidos curtos do CLI passam.** `priv/probes/*.exs` (fora das `areas`) usam
`modelo: "haiku"`. Recusá-los quebraria as sondas sem ganho, porque `haiku` é vocabulário do CLI
e não um nome interno cru. A fábrica não os GERA. Isso está documentado em `@apelidos_do_cli`.

**Chamadas REAIS (critério 3 e confirmação de cada ID).** Usei `claude` 2.1.287 a partir de um
diretório temporário fora do projeto (o scratchpad da sessão), com a linha montada por
`ClaudeCLI.linha/1` (papel sem ferramenta → `--tools ""`, `--max-turns 1`, prompt `oi` por
stdin). Os custos de `Precos` foram calculados pelo `Consumo` que `interpretar/1` extraiu do
mesmo stream.

| interno | `--model` gerado | is_error | `modelUsage` | custo do CLI (`total_cost_usd`) | `Precos.estimar(<id do modelUsage>)` |
|---|---|---|---|---|---|
| `sonnet-5` | `claude-sonnet-5-5` | `false` (success) | `claude-sonnet-5-5` | 0.0006964 | `{:ok, total_usd: 0.0006964}`, igual ao centavo |
| `opus-5` | `claude-opus-5-5` | `false` (success) | `claude-opus-5-5` | 0.016803 | `{:ok, total_usd: 0.0009275}` |
| `haiku-4.5` | `claude-haiku-4-5-20251001` | `false` (success) | `claude-haiku-4-5-20251001` | 0.008627 | `{:ok, total_usd: 0.000385}` |

Linha exata do sonnet: `claude --print --verbose --output-format stream-json --permission-mode
acceptEdits --tools "" --max-turns 1 --model claude-sonnet-5-5`. Os três IDs são aceitos, e o
`modelUsage` volta exatamente com o ID pedido. Nenhum caiu em `:modelo_sem_preco`. Houve 4
chamadas no total, não 3: a primeira de sonnet também voltou `is_error: false`, `modelUsage`
`claude-sonnet-5-5` e custo do CLI de 0.008479, mas meu script quebrou no achado 1 abaixo antes
de imprimir o preço.

**Achados no caminho. Não fiz nenhum (trabalho novo); são candidatos a tarefa:**

1. **BLOQUEIA a T-058: falsa parede de cota.** Nas 4 chamadas reais, o stream trouxe
   `rate_limit_event` com `"status":"rejected"`, `"rateLimitType":"seven_day"`,
   `seven_day.utilization: 1` e `five_hour.utilization: 0`, e mesmo assim a chamada
   **foi atendida** (`result` success, texto respondido). `ClaudeCLI.interpretar/1`
   (`parede?/1`: status que não começa por `allowed`) devolve
   `{:erro, {:cota, ~U[2026-10-02 03:00:00Z]}}`. Ou seja: neste ambiente, todo `conversar/2`
   real seria lido como parede de cota, e o piloto dormiria até a reabertura depois de o
   trabalho já ter acontecido. Para precificar, interpretei o stream sem o `rate_limit_event`.
   Sugestão: em `cota/2`, um evento terminal `result` com `is_error: false` prevalece sobre o
   status do `rate_limit_event` (a chamada aconteceu). Isso é decisão sobre a semântica da
   parede (v0.4) e fica com o orquestrador. Área: `lib/fabrica/operario/claude_cli.ex` e o
   teste dele.
2. **Custo subestimado de 10× a 22×: escrita de cache sai de graça.** `ClaudeCLI.consumo/1`
   grava `ttl_cache: :sem_cache` ("não sei", diz o comentário), e `Precos` mapeia
   `:sem_cache → 0.0x`, ou seja, "não houve". Por isso o haiku deu 0.000385 contra 0.008627 do
   CLI. O `claude` 2.1.287 JÁ EXPÕE o TTL: `usage.cache_creation.ephemeral_1h_input_tokens` /
   `ephemeral_5m_input_tokens` (no haiku foram 4121 tokens em 1h, 0 em 5m). Com
   `ttl_cache: :uma_hora`, `Precos` reproduz o `costUSD` do haiku EXATO (0.008627). Isso afeta
   o critério 4 da T-058 ("custo por tarefa na tela"). Área: `claude_cli.ex` (`consumo/1`).
3. **Preço de `opus-5` provavelmente defasado:** mesmo com TTL de 1h, `Precos` daria ~0.0211
   contra 0.016803 do CLI. São valores da tabela, fora do escopo daqui (moduledoc de `Precos`).
4. `Operario.MessagesAPI` também manda `model: requisicao.modelo` cru (l. ~83). Ele está
   adiado pela D-002, mas vai precisar da mesma tradução quando for ligado.

Lint: `mix format --check-formatted`, `mix credo --strict` (4 arquivos, 0 achados),
`mix compile --warnings-as-errors` e `mix dialyzer` passaram.

**Reproduzir:** `mix test test/fabrica/operario/claude_cli_test.exs test/fabrica/custo/precos_test.exs`

**Reproduzir a chamada real (GASTA COTA, ~US$ 0,001; rode da raiz do projeto):**
`D=$(mktemp -d) && echo oi > $D/p.txt && L=$(MIX_ENV=test mix run --no-start -e 'Application.put_env(:fabrica, :claude_cli, "claude"); {:ok, l} = Fabrica.Operario.ClaudeCLI.linha(%Fabrica.Operario.Requisicao{papel: "x", modelo: "sonnet-5", teto_de_voltas: 1, mensagens: []}); IO.puts(l)' | tail -1) && (cd $D && eval "$L" < p.txt) | grep '"type":"\(result\|rate_limit_event\)"'`

**Commit:** `e719d63`

## Verificação

### Ciclo 1

- **[PASSOU] [executado] Critério 1: `ClaudeCLI.linha/1` com `modelo: "sonnet-5"`, `"opus-5"` e `"haiku-4.5"` produz `--model` com um ID que o CLI aceita, e um modelo desconhecido não vai cru**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: 76 tests, 0 failures — cobertura completa: 3 testes de tradução (um por modelo interno), idempotência, cobertura dos 3 nomes, modelo desconhecido → erro nomeado, modelo ausente → erro nomeado, e teste de `conversar/2` com modelo inventado (não toca o CLI).

- **[PASSOU] [executado] Critério 2: `Precos` precifica os IDs que o CLI devolve hoje (`claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-4-5-20251001`) na mesma linha do nome interno**
  Comando: `mix test test/fabrica/custo/precos_test.exs`
  Saída: 36 tests, 0 failures — cobertura: 3 testes, um por ID real (confirma preco igual ao interno, `estimar` igual ao interno), `resumir/1` com os 3 IDs sem `:modelo_sem_preco`, trava entre as duas pontas (`modelos_cli/0` vs `Precos`).

- **[PASSOU] [inspecionado] Critério 3: Uma chamada REAL ao `claude` com o `--model` gerado por `linha/1` para `sonnet-5` volta sem `is_error`, e o custo é precificado sem `:modelo_sem_preco`**
  Comando: Inspecionável nas Notas (Ciclo 1, linhas 101-112) — executor já fez 4 chamadas reais contra `claude 2.1.287` (3 tabeladas + 1 que quebrou antes de imprimir)
  Validação: Tabela mostra os 3 modelos testados, todos com `is_error: false`, `modelUsage` exatamente igual ao `--model` gerado (sem troca de modelo), nenhum caiu em `:modelo_sem_preco`. Linha montada por `ClaudeCLI.linha/1` confirmada e executada do scratchpad fora do projeto.

Suíte completa: `mix fabrica.ci` → 6 estágios (formato, compilação, lint, testes, tipos, backup), 0 falhas.

Mutação: Quebrei `sonnet-5 → claude-sonnet-5-BROKEN` em `@modelos_cli` → teste **falhou** (esperado: `Assertion with =~ failed`; linha montada mostrou `--model claude-sonnet-5-BROKEN`). Desfiz, testes voltaram a 76/0. Prova que os testes **distinguem** a correção.

Graus de prova: 2 executados, 0 inspecionados, 1 inspecionado (conforme rubrica — critério 3 é de inspeção, não de execução de CLI real, para não gastar cota).

## Conformidade

### Ciclo 1

Conformidade: cumpre

- [Critério 1: `linha/1` com `sonnet-5`/`opus-5`/`haiku-4.5` produz `--model` aceito; desconhecido não vai cru] →
  `lib/fabrica/operario/claude_cli.ex:150-154` (`@modelos_cli`), `:226-232` (`modelo_cli/1`),
  `:300-309` (`linha/1` interpola o ID traduzido, nunca `requisicao.modelo`). Desconhecido e `nil` →
  `{:erro, {:modelo_sem_traducao, nome}}`, registrado nas Notas como comportamento novo. Testes: describe
  "o modelo na fronteira com o CLI (T-084)" em `test/fabrica/operario/claude_cli_test.exs` (um por modelo,
  idempotência, desconhecido, `nil`, e `conversar/2` que não chega a chamar o executável).
- [Critério 2: `Precos` precifica `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-4-5-20251001` na
  linha do nome interno] → `lib/fabrica/custo/precos.ex:51-58` (`@apelidos`); describe "os IDs que o CLI
  devolve hoje" em `test/fabrica/custo/precos_test.exs`, com a trava `modelos_cli/0` × `Precos`.
- [Critério 3: chamada REAL com o `--model` de `linha/1` para `sonnet-5`, sem `is_error` e precificada] →
  Notas, Ciclo 1: comando exato, `modelUsage` `claude-sonnet-5-5`, `total_cost_usd` 0.0006964 e
  `Precos.estimar` `{:ok, 0.0006964}`; os outros dois IDs também foram confirmados, como o Contexto pedia.
  Conferi só o registro (não refiz a chamada: gasta cota).
- **Objetivo (no espírito):** confirmei que todo despacho real passa pela tradução. `linha/1` tem um único
  chamador em produção (`ClaudeCLI.conversar/2`, l. 243); `executavel()` só é interpolado em `linha/1`
  (l. 305); não há outro `--model` em `lib/`. Os dois caminhos que chegam ao CLI (`Fila.Trabalho` →
  `Agente.Laco.laco/1` → `conversar/2`, com `@modelo "sonnet-5"`, e `Planejador` → `Operario.conversar/2`,
  com `@modelo_padrao "sonnet-5"`) e os padrões de `Agente.Estado`/`Requisicao` (`"haiku-4.5"`) estão
  todos na tabela. `Retrabalho.Escada` devolve `:do_disparo | :reforcado` (átomo), não um nome de modelo,
  então ainda não existe caminho que mande `opus-5` hoje; quando existir, ele também já é traduzido. O
  erro novo cai no `{:erro, motivo}` genérico de `Laco.laco/1` (l. 74), que encerra com
  `desfecho: :erro` em vez de quebrar, e no `{:erro, {:operario, motivo}}` do `Planejador` (l. 107).
- **Escopo:** dentro das `areas`, mais o `MAPA.md` regenerado. O passe livre aos apelidos curtos do CLI
  (`sonnet`/`opus`/`haiku`) foi além da letra do pedido, mas está justificado (as sondas de `priv/probes/`
  usam `haiku`) e documentado em `@apelidos_do_cli`. A fábrica não gera esses apelidos (ver nota menor 1).
- **Contrato com o plano:** respeita a D-002 (`MessagesAPI` adiado; o modelo cru dele é o achado 4 das
  Notas, e lá não se fala com o CLI). Os achados 1 a 3 das Notas viraram T-087 e T-086, ou foram decididos
  fora do escopo (D-015, adendo), então não pesam aqui.
- **Prova visual:** não se aplica (a tarefa não tem interface).

## Revisão

### Ciclo 1

Aprovado sem achados `critica`/`importante`.

Diff revisado: `e719d63` (código, testes e Notas) e `a4a1f07` (hash). O `Commit:` estava gravado nas Notas.
Além do diff, abri só trechos para conferir o contrato novo de `linha/1` (`String.t()` →
`{:ok, _} | {:erro, _}`):
- chamadores de `linha/1` e interpolações de `executavel()` e de `--model` em `lib/` e `priv/`: as sondas
  (`cli_governanca.exs`, `marco_v02_agente.exs`) montam a própria linha com `--model haiku` ou citam
  `linha/1` só em comentário, então nenhuma quebra com o retorno novo;
- o tratamento de `{:erro, motivo}` em `Agente.Laco.laco/1` (l. 70-76), `Fila.Trabalho` e `Planejador`:
  o erro nomeado vira desfecho `:erro` ou `{:operario, _}`, sem `CaseClauseError`;
- `Laco.contabilizar/2` (l. 121-128) precifica por `estado.modelo` (o nome interno), que tem preço.

Segurança: antes, `requisicao.modelo` era interpolado cru numa linha de shell. Agora só passam valores de
uma lista fechada (os três IDs mais três apelidos), e a injeção pelo campo `modelo` ficou fechada.

Notas menores (não reprovam):
- [menor] `lib/fabrica/operario/claude_cli.ex:160` (`@apelidos_do_cli`): `modelo_cli/1` aceita
  `sonnet`/`opus`/`haiku`, mas `Precos` não precifica esses apelidos (só `haiku-4-5` e os IDs longos), e
  `Laco.contabilizar/2` precifica por `estado.modelo`. Se algum chamador futuro configurar
  `modelo: "sonnet"`, o despacho roda e o custo de cada volta vira `0.0` em silêncio, e o teto de gasto do
  piloto (D-015) não frearia. Hoje nenhum caminho de produção gera apelido curto, só as sondas. Ficaria
  fechado restringindo os apelidos às sondas ou ensinando os três a `Precos`.
- [menor] `test/fabrica/custo/precos_test.exs`, teste "todo ID que o ClaudeCLI manda no --model cai na
  linha do nome interno de origem": compara `preco(id) == preco(interno)` sem afirmar `!= nil`. Um quarto
  nome interno acrescentado a `@modelos_cli` sem preço dos dois lados passaria por `nil == nil`. Hoje o
  teste "a traducao cobre os tres nomes" falharia antes e denunciaria, então o risco é baixo.
- [menor] `Operario.MessagesAPI` também manda `requisicao.modelo` cru (achado 4 das Notas). Não fala com
  o CLI e está adiado pela D-002, mas vai precisar da mesma tradução quando for ligado. Fica como
  candidato a tarefa.

