---
id: T-086
titulo: "O custo de um despacho real conta a escrita de cache — o teto de gasto do piloto passa a frear de verdade"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-085]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs, lib/fabrica/custo/precos.ex, test/fabrica/custo/precos_test.exs]
tentativas: 1
criada: 2026-10-01
atualizada: 2026-10-01
---

## Objetivo
O `gasto_usd` de um despacho real (`Operario.ClaudeCLI` → `Consumo` → `Custo.Precos`) bate com o
custo que o próprio `claude` reporta (`total_cost_usd`). Hoje ele sai de 10× a 22× ABAIXO, e é esse
número que o `Piloto.Servidor` soma contra o teto de gasto: o "US$ 60" da T-058 só frearia depois
de algo entre US$ 600 e US$ 1.200 de consumo real.

## Contexto
Achado do executor da T-084 (Notas do Ciclo 1 de `T-084-modelo-real-no-cli-e-no-preco.md`, achado 2),
conferido pelo orquestrador:

- `ClaudeCLI.consumo/1` (~l. 604) grava `ttl_cache: :sem_cache` ("não sei"); `Precos` mapeia
  `:sem_cache → 0,0×` — a escrita de cache, que é a maior parte do custo de um despacho curto, sai
  de graça.
- O `claude` 2.1.287 JÁ informa o TTL: `usage.cache_creation.ephemeral_1h_input_tokens` e
  `ephemeral_5m_input_tokens`. Medido: num haiku, 4121 tokens em 1h, 0 em 5m; com
  `ttl_cache: :uma_hora`, `Precos` reproduz o `costUSD` do CLI EXATO (0.008627).
- Cadeia até o freio: `Agente.Laco` soma `gasto_usd` → `Fila.Trabalho` (~l. 361) emite
  `[:fabrica, :despacho, :fim]` com `gasto_usd` → `Piloto.Servidor` (~l. 292) acumula contra
  `teto_de_gasto`. E é o mesmo número que a tela mostra por tarefa (critério 4 da T-058).

Mesmo objetivo, achado `menor` do revisor da T-084: `ClaudeCLI` aceita os apelidos curtos `sonnet`,
`opus`, `haiku` (as sondas usam), mas `Precos` não tem preço para eles — um chamador que configure
`modelo: "sonnet"` teria custo 0,0 por volta, e o teto pararia de frear em silêncio. Feche junto: o
apelido curto cai na linha do nome interno, ou vira `:modelo_sem_preco` explícito (escolha e registre).

Se o CLI trouxer os dois TTLs no mesmo despacho, os dois precisam ser cobrados — confira se
`Consumo`/`Precos` aguentam isso como está ou se precisam de um campo a mais (aí o arquivo de
`Consumo` entra nas `areas`: registre e peça, não edite fora delas). Os VALORES da tabela de preço
não são desta tarefa (o de `opus-5` parece defasado — achado 3 da T-084 — fica como está).

## Critérios de aceite
- [ ] Para um stream REAL do `claude` (linhas `assistant`/`result` gravadas como dado no teste, com
      `cache_creation.ephemeral_1h_input_tokens` > 0), o custo que `ClaudeCLI` + `Precos` calculam
      fica a menos de 1% do `total_cost_usd` daquele mesmo stream — um caso de haiku e um de sonnet.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Escrita de cache de 5 minutos e de 1 hora é cobrada pelo multiplicador certo de cada uma, e um
      stream sem `cache_creation` continua precificado como hoje (teste explícito).
      `verificar: mix test test/fabrica/custo/precos_test.exs`

## Notas de execução

### Ciclo 1

**O que mudou.** `ClaudeCLI.consumo/1` (privada, chamada por `interpretar/1,2`) passou a ler do
`result` do `claude` 2.1.287 as duas coisas que faltavam para o `gasto_usd` bater com o
`total_cost_usd`:

1. **O TTL da escrita de cache** (`usage.cache_creation.ephemeral_1h_input_tokens` /
   `ephemeral_5m_input_tokens`) → `ttl_cache` (`ttl_cache/2`): sem escrita → `:sem_cache`;
   sem a quebra por TTL (formato anterior) → `:sem_cache` como hoje **+ `Logger.warning`**
   (antes era zero silencioso); só 5 min → `:cinco_minutos`; qualquer 1 h → `:uma_hora`.
2. **Os tokens do `modelUsage`, e não do `usage`.** Achado novo, medido na amostra REAL de
   vários turnos da T-018b (`priv/probes/amostras/sessao-com-ferramenta.jsonl`): o `usage` só
   cobre o laço principal; o `modelUsage` (de onde sai o `total_cost_usd`) conta também as
   chamadas auxiliares que o CLI faz sozinho (+941 entrada, +15 saída) — só com a correção do
   TTL essa sessão ainda sairia **4,6% abaixo**, fora do 1%. Sem `modelUsage` (fixture/formato
   antigo), vale o `usage`, como antes. Os modelos do `modelUsage` são somados e precificados
   pelo modelo do despacho (o `Consumo` carrega um só) — auxiliar haiku sob sonnet/opus sai
   mais caro que o real, que é o lado seguro do freio.

E `Precos.@apelidos` ganhou `sonnet`/`opus`/`haiku` (achado menor da T-084), com
`ClaudeCLI.apelidos_do_cli/0` pública para a trava entre as pontas.

**Antes × depois** (mesmo stream, `ClaudeCLI.interpretar` → `Precos.estimar`):

| stream real | antes (vermelho) | depois | `total_cost_usd` |
|---|---|---|---|
| haiku, 1 turno, 4116 escritos em 1h | 0,000314 (27× abaixo) | 0,008546 | 0,008546 |
| sonnet `claude-sonnet-5-5`, 1 turno, 1082 em 1h + 1395 lidos | 0,000333 (14× abaixo) | 0,004661 | 0,004661 |
| haiku, T-018b, vários turnos com ferramenta | 0,0060731 (3,6× abaixo) | 0,0221191 | 0,0221191 |

Desvio 0,0% nos três (com os streams COMPLETOS, inclusive `stream_event`; só sem o
`rate_limit_event` `rejected`, que é a T-087). Teste escrito antes: 16 vermelhos → 0.

**Decisões.**
- **Apelido curto → linha do nome interno**, e não `:modelo_sem_preco`: o `Agente.Laco`
  (`contabilizar/2`) conta `:modelo_sem_preco` como 0,0 — a outra opção desligaria o freio em
  silêncio, exatamente o que a tarefa pede para fechar. Risco que fica (escrito em `precos.ex`):
  o apelido passar a apontar para modelo de outro preço; a fábrica não os gera, só as sondas.
- **Os dois TTLs no mesmo despacho:** `Consumo`/`Precos` NÃO aguentam exato como estão (um
  `ttl_cache` só por volta). Nunca visto (3 de 3 streams reais, 2.1.258 e 2.1.287, são só 1h),
  mas possível (TTL é por ponto de cache). Tratamento dentro das `areas`: cobra TODA a escrita a
  2,0× (teto — nunca abaixo do exato) + `Logger.warning` "dois TTLs". Teste explícito nos dois
  arquivos.
- **Pedido (não editado — fora das `areas`):** para o misto sair EXATO, um campo a mais em
  `Fabrica.Operario.Consumo` (`lib/fabrica/operario.ex`, ex.: `tokens_cache_escrita_5m`) e
  `Precos.estimar/2` cobrando cada parte pelo seu multiplicador. Idem, se quiserem o auxiliar
  de outro modelo pelo preço dele: tokens por modelo no `Consumo`. Hoje os dois erram para
  CIMA, não para baixo.
- `DECISOES.md` não está nas `areas`: a decisão do apelido curto e a do misto estão registradas
  aqui e nos comentários de `precos.ex`/`claude_cli.ex` — **orquestrador, copie para D-015** se
  quiser no registro do projeto.

**Arquivos.** `lib/fabrica/operario/claude_cli.ex` (`consumo/1`, `tokens/2`, `ttl_cache/2`,
`apelidos_do_cli/0`, `@moduledoc`), `lib/fabrica/custo/precos.ex` (`@apelidos`, doc de
`preco/1`), `test/fabrica/operario/claude_cli_test.exs` (streams reais de haiku e sonnet
embutidos como `@stream_real_*`; describe "o custo de um despacho REAL…"; teste do
`:sem_cache` renomeado — a premissa "o CLI não o expõe" deixou de ser verdade;
`@moduletag :capture_log`), `test/fabrica/custo/precos_test.exs` (describes "escrita de cache
cobrada pelo TTL…" e "os apelidos curtos…").

**Como foi provado.** `mix test` dos dois arquivos: 133 testes, 0 falhas.
`mix compile --warnings-as-errors --force` limpo; `mix credo --strict` nos 4 arquivos sem
achados; `mix dialyzer` "passed successfully". O stream de sonnet foi UMA chamada real
(`--max-turns 1 --tools "" --setting-sources user --model claude-sonnet-5-5`, de `mktemp -d`).

**Reproduzir:** `mix test test/fabrica/operario/claude_cli_test.exs test/fabrica/custo/precos_test.exs`

**Commit:** `c613ab8`

**Sugestões (candidatas a tarefa, não feitas):**
- `Agente.Laco.contabilizar/2` conta `{:erro, :modelo_sem_preco}` como 0,0 **sem log** — é o
  último zero silencioso no caminho do freio; um `Logger.warning` ali fecha a porta.
- O campo de TTL misto / tokens por modelo em `Operario.Consumo` (acima), se o caso aparecer.

## Verificação

### Ciclo 1

- **[PASSOU] [executado] Critério 1: Para um stream REAL do `claude` (com `cache_creation.ephemeral_1h_input_tokens` > 0), o custo que `ClaudeCLI` + `Precos` calculam fica a menos de 1% do `total_cost_usd` — casos de haiku e sonnet**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: 78 testes passaram, incluindo:
    - haiku (haiku-4.5), escrita de 1h: 0,008546 vs 0,008546 (desvio 0,0%)
    - sonnet (claude-sonnet-5-5), escrita de 1h + leitura: 0,004661 vs 0,004661 (desvio 0,0%)
    - sessão REAL com ferramenta (T-018b): 0,0221191 vs 0,0221191 (desvio 0,0%)

- **[PASSOU] [executado] Critério 2: Escrita de cache de 5 minutos e 1 hora é cobrada pelo multiplicador certo; stream sem `cache_creation` continua precificado como hoje**
  Comando: `mix test test/fabrica/custo/precos_test.exs`
  Saída: 55 testes passaram, incluindo testes de TTL certo (`:uma_hora`, `:cinco_minutos`), dois TTLs no mesmo despacho (2,0× teto), apelidos curtos (`sonnet`, `opus`, `haiku`), e streams sem `cache_creation` (`:sem_cache`).

Mutação: Quebrei a função `ttl_cache/2` forçando sempre `:sem_cache` (ignorando `cache_creation`). Resultado: 13 falhas esperadas:
  - Haiku caiu de 0,008546 para 0,000314 (27× abaixo) — ❌ desvio acima de 1%
  - Sonnet caiu de 0,004661 para 0,000333 (14× abaixo) — ❌ desvio acima de 1%
  - TTL T-018b: caiu de 0,0221191 para 0,0070891 (3,6× abaixo) — ❌ desvio acima de 1%
  - Testes de TTL explícito falharam (`:sem_cache` ≠ `:uma_hora`)
  - Testes de dois TTLs falharam (custo abaixo do exato)

Revertida a mutação → 133 testes passam novamente (0 falhas).

Suíte completa: 133 passou, 0 falhou — `mix test test/fabrica/operario/claude_cli_test.exs test/fabrica/custo/precos_test.exs`

Graus de prova: 2 executados, 0 inspecionados, 0 julgados

## Conformidade

Conformidade: cumpre

- [Crit. 1 — stream REAL com escrita 1h a < 1% do `total_cost_usd`, haiku e sonnet] →
  `test/fabrica/operario/claude_cli_test.exs`, describe "o custo de um despacho REAL bate com o
  total_cost_usd…": `@stream_real_haiku` (4116 em 1h, 0,008546) e `@stream_real_sonnet`
  (`claude-sonnet-5-5`, 1082 em 1h + 1395 lidos, 0,004661), cada um pelo nome interno e pelo ID
  longo, pelo MESMO caminho do despacho (`interpretar` → `Consumo` → `Precos.estimar`). Conferi a
  aritmética à mão contra a tabela (`sonnet-5` = 2/10, `haiku-4.5` = 1/5, 1h = 2,0×): os dois
  batem exato. Bônus fora da letra: a sessão multi-turno da T-018b também a 0,0%.
- [Crit. 2 — 5 min e 1 h pelo multiplicador certo; sem `cache_creation` precificado como hoje,
  teste explícito] → `test/fabrica/custo/precos_test.exs`, describe "escrita de cache cobrada pelo
  TTL…" (1h = 2,0×, 5m = 1,25×, razão 2,0/1,25, misto nunca abaixo do exato, "resultado SEM
  cache_creation continua precificado como hoje", "cache_creation ZERADO custa o mesmo");
  implementação em `lib/fabrica/operario/claude_cli.ex` `ttl_cache/2`.
- [Contexto — apelido curto: linha interna OU `:modelo_sem_preco`, escolher e registrar] →
  `lib/fabrica/custo/precos.ex` `@apelidos` (`sonnet`/`opus`/`haiku`), decisão escrita no
  comentário e nas Notas; trava entre as pontas (`ClaudeCLI.apelidos_do_cli/0` × `Precos.preco/1`)
  no teste "todo apelido curto que o ClaudeCLI aceita tem preco". A escolha (linha interna) é a
  que mantém o freio — coerente com o Objetivo.
- [Contexto — dois TTLs no mesmo despacho: os dois cobrados; se precisar de campo, registre e
  peça, não edite fora] → cobra tudo a 2,0× (teto, nunca abaixo) + `Logger.warning`, e o campo
  `tokens_cache_escrita_5m` em `Operario.Consumo` foi PEDIDO nas Notas, sem editar fora das
  `areas`. Exatamente o que o Contexto mandou.
- **`modelUsage` no lugar de `usage` (escolha do executor):** conforme. Não é sobra fora de
  escopo — é a mesma causa do Objetivo ("o `gasto_usd` bate com o `total_cost_usd`"), medida:
  conferi na amostra `priv/probes/amostras/sessao-com-ferramenta.jsonl` que o `usage` do `result`
  traz 18 de entrada/420 de saída e o `modelUsage` 959/435; só com o `usage` essa sessão sai
  0,0211031 contra 0,0221191 (4,6% abaixo, fora do 1%). Com o `modelUsage` o número é, por
  construção, o mesmo do qual o CLI tira o `costUSD`. Nos dois streams de 1 turno os dois campos
  coincidem, então a escolha não muda o critério 1 — só fecha o caso multi-turno, que é o do
  piloto. O risco que ela traz (vários modelos somados ao preço do modelo do despacho) está
  documentado e só erra para baixo se o auxiliar for MAIS caro que o despacho — ver Revisão.
- **Escopo/áreas:** o diff toca só as 4 `areas` + o arquivo da tarefa; valores da tabela de preço
  intocados, como pedido. `DECISOES.md` fora das `areas` — o executor pediu ao orquestrador
  para copiar as duas decisões (apelido curto e TTL misto) para o registro (D-015).
- **Pendente (acessório, para o orquestrador decidir):** (1) copiar as duas decisões para
  `DECISOES.md`; (2) campo de TTL misto / tokens por modelo em `Operario.Consumo`, se o caso
  aparecer; (3) os caminhos de gasto ABAIXO do real que sobram FORA desta tarefa, levantados na
  Revisão a pedido do orquestrador — esses, sim, merecem tarefa antes da T-058.

## Revisão

### Ciclo 1

Diff revisado: `git show c613ab8` (código + testes; `4862c77` e `4a24806` só tocam o arquivo da
tarefa). Hash presente nas Notas — sem defeito de processo.

**Achados no diff — nenhum `critica`/`importante`.**

- [menor] `lib/fabrica/operario/claude_cli.ex` `tokens/2` — soma todos os modelos do
  `modelUsage` e precifica pelo modelo do despacho. Erra para CIMA no caso visto (auxiliar haiku
  sob sonnet), mas para BAIXO se um dia aparecer um modelo mais caro que o do despacho na mesma
  sessão (ex.: subagente opus sob despacho sonnet). Não observado e hoje improvável
  (`Fila.Trabalho` fixa `@modelo "sonnet-5"`, l.104, e o `--tools` do papel não expõe subagente);
  o campo por modelo já está pedido nas Notas.
- [menor] `lib/fabrica/operario/claude_cli.ex` `ttl_cache/2`, 3ª cláusula — `result` sem
  `usage.cache_creation` com escrita > 0 continua a 0,0× (agora com `Logger.warning`). É o que o
  critério 2 exigiu ("como hoje"), então não é defeito do executor; mas é um zero que só aparece
  em log: se uma versão futura do `claude` deixar de mandar a quebra, o freio volta a 10–27×
  abaixo sem nada falhar. Registro para o orquestrador: o critério escolheu o lado "fiel ao
  passado" e não o lado seguro (assumir 1 h).

Verifiquei também, sem achado: `ttl_cache/2` com quebra presente e ambos zerados mas escrita só
no `modelUsage` → `:uma_hora` (lado seguro); 5 min com escrita maior que a quebra (auxiliar) →
`:uma_hora` (seguro); `modelUsage` vazio/ausente → cai no `usage` (compatível com os fixtures);
`error_max_turns` e `is_error` continuam saindo como `{:ok, %Resposta{consumo: …}}` (l.606-609), ou
seja, o despacho caro que bate no teto de voltas É contado; o registro no banco
(`Custo.Consumo.para_registro/3`) usa o mesmo `Precos.estimar/2`, então tela e freio veem o mesmo
número.

**Cadeia até o freio (pedido do orquestrador; exigiu abrir, fora do diff, `agente/laco.ex`
l.58-134, `fila/trabalho.ex` l.104/195-260/320-445, `piloto/servidor.ex` l.292-307 e
`custo/consumo.ex` l.25-45).** `ClaudeCLI.consumo/1` → `Laco.contabilizar/2` (l.121-134, por
volta; sob `ClaudeCLI` uma volta = a sessão inteira) → `Estado.resumo` → `Trabalho.emitir_fim/3`
(`gasto_usd: resumo.gasto_usd`) → `Piloto.Servidor` l.292/307 (`gasto_acumulado +=`). No caminho
de despacho ATENDIDO o número agora bate com o `total_cost_usd`. **Sobram caminhos em que o gasto
sai ABAIXO do real — todos pré-existentes, fora do diff e fora das `areas`, por isso não reprovam
esta tarefa:**

1. **Erro do operário descarta o consumo** — `Laco.laco/1` l.73-75: `{:erro, motivo}` encerra sem
   `contabilizar`; sob `ClaudeCLI` o despacho inteiro vai ao piloto com `gasto_usd` 0,0. Três
   origens:
   - `{:erro, {:fora_do_confinamento, _}}` (`claude_cli.ex` `montar/2`, ~l.531): a sessão
     TERMINOU, o `result` com `total_cost_usd` está na mão, e o consumo é jogado fora. Cenário: o
     construtor lê um arquivo fora da raiz no fim da sessão → a sessão inteira some do teto. É o
     mais grave dos três, porque o número existe e é descartado.
   - `{:erro, :prazo}` (`claude_cli.ex` l.269): processo morto, sem `result`. O número exato não
     existe, mas as linhas `assistant` já trazem `usage` parcial — dá para estimar.
   - `{:erro, {:cota, _}}` com a chamada atendida (aviso `rejected`) — já é a T-087.
2. `Trabalho.executar/2` l.214-219: `{:morto, _}` emite `gasto_usd: 0.0` fixo.
3. `Laco.contabilizar/2` l.127: `:modelo_sem_preco` → 0,0 sem log (o apontado pelo executor).
   Hoje INALCANÇÁVEL no caminho de produção (`@modelo "sonnet-5"` tem preço, e os apelidos curtos
   passaram a ter) — latente para quando o modelo virar configurável.

Recomendação ao orquestrador: uma tarefa corretiva antes da T-058, causa raiz única ("erro do
operário descarta o consumo já medido"), mexendo no contrato `{:erro, …}` de `Fabrica.Operario` /
`Agente.Laco` para carregar o consumo quando ele existe (item 1a), estimar pelo `usage` parcial no
prazo (1b), e pôr o `Logger.warning` do item 3. Não é retrabalho desta: exige `operario.ex` e
`laco.ex`, fora das `areas`.

Não rodei a bateria (já executada pelo testador, com mutação) nem chamada real ao `claude`.

Aprovado: nenhum achado `critica`/`importante` no diff; conformidade `cumpre`.

