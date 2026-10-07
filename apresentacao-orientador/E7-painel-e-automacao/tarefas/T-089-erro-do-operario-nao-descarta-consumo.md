---
id: T-089
titulo: "Despacho que termina em erro ainda conta o que gastou — o consumo já medido não é descartado"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-088]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs, lib/fabrica/agente/laco.ex, test/fabrica/agente/laco_test.exs]
tentativas: 1
criada: 2026-10-01
atualizada: 2026-10-01
---

## Objetivo
Um despacho real que termina em erro (`{:erro, _}` do operário) entrega ao `Agente.Laco` — e daí ao
evento `[:fabrica, :despacho, :fim]` que o `Piloto.Servidor` soma contra o teto — o custo que de fato
gastou, sempre que esse custo foi medido. Hoje ele chega como US$ 0,00.

## Contexto
Achado do revisor da T-086 (seção Revisão de `T-086-custo-com-escrita-de-cache.md`), seguindo a
cadeia `ClaudeCLI.consumo/1` → `Laco.contabilizar/2` (~l. 121-134) → `emitir_fim` → `Piloto.Servidor`
(~l. 292/307):

- `Laco.laco/1` (~l. 73-75): quando o operário devolve `{:erro, _}`, o laço termina SEM
  contabilizar. Com o `ClaudeCLI`, isso zera o despacho inteiro. Origens:
  - **`{:fora_do_confinamento, _}`** (`montar/2`, ~l. 531) — a mais grave: a sessão TERMINOU, o
    `result` com `total_cost_usd` existe, e o consumo é jogado fora. Com o Bash aprovado (T-088), a
    auditoria tende a disparar mais.
  - **`:prazo`** (~l. 269) — sem `result`; as linhas `assistant` já trazem `usage` parcial.
  - (cota falsa com chamada atendida: T-087, já resolvida antes desta.)
- Fora desta tarefa, de propósito: `{:morto, _}` em `Trabalho.executar/2` (~l. 214-219, `gasto_usd:
  0.0` fixo — o processo morreu, não há o que medir) e `:modelo_sem_preco` contado como 0,0 em
  `contabilizar/2` (latente: hoje todo modelo usado tem preço). Registre-os nas Notas se tocar perto.

Por que é pré-requisito da T-058: o teto de gasto é somado deste número (despacho com erro = gasto
invisível ao freio), e a `ENTREGA.md` compara CUSTO POR TAREFA com a v1 — descartar o custo dos
despachos que falharam deixaria a v2 artificialmente mais barata. A honestidade do número é o
entregável do marco.

Desenho provável (confirme no código): o erro do operário carrega o consumo medido quando houver
(`{:erro, motivo, consumo}` ou um mapa), e o `Laco` contabiliza antes de encerrar. Quem hoje casa
`{:erro, _}` não pode quebrar — confira os chamadores.

## Critérios de aceite
- [ ] Stream REAL que termina num `result` com `total_cost_usd` mas é recusado por
      `{:fora_do_confinamento, _}` → o `gasto_usd` do despacho (o que o evento de fim leva) é igual ao
      custo daquele `result`, não 0,0. Teste pelo `Laco` com o stream como dado.
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] Despacho que estoura o `:prazo` depois de linhas `assistant` com `usage` → `gasto_usd` > 0,
      estimado por esse `usage`; sem nenhuma linha com `usage` → 0,0 com `Logger.warning` (teste com
      `capture_log`).
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Os erros que antes eram `{:erro, motivo}` continuam sendo classificados com o MESMO `desfecho`
      (os testes existentes de `laco_test.exs`/`claude_cli_test.exs` passam sem mudança de expectativa
      de desfecho).
      `verificar: mix test test/fabrica/agente/laco_test.exs`

## Notas de execução

### Ciclo 1

**O que mudou.** Um erro do operário de uma sessão que JÁ GASTOU passa a carregar o consumo
medido, e o `Agente.Laco` o contabiliza antes de encerrar com o mesmo `desfecho: :erro`.

- `ClaudeCLI.responder/2` (nova, pública): o que `conversar/2` devolve para a saída bruta de UM
  processo do CLI. `conversar/2` agora só chama `responder(saida, raiz)`; `interpretar/2` ficou
  intocado (o veredito, sem consumo — os testes da T-012a seguem iguais).
  - `{:fora_do_confinamento, caminhos}` → `{:erro, {:com_consumo, motivo, consumo_do_result}}`
    (o MESMO `consumo/1` de um despacho aceito: `modelUsage` + TTL da T-086).
  - `:prazo` → se o `result` chegou a ser escrito, vale ele; senão, ESTIMA pelo `usage` das
    linhas `assistant`, uma vez por `message.id` (o CLI repete a mesma chamada uma linha por
    bloco — somar por linha daria 4×7021+2×494 de escrita na amostra real, ~4× o real). A
    estimativa é PISO (o `output_tokens` dessas linhas é parcial e as chamadas auxiliares só
    aparecem no `modelUsage`) e sai com `Logger.warning` dizendo isso. TTL pela mesma
    `ttl_cache/2`, com a quebra `cache_creation` somada.
  - nada medido (sem `result` e sem linha com `usage`) → o erro nu de antes (`{:erro, :prazo}`)
    + `Logger.warning` "... entra como 0,0".
  - cota NUNCA ganha envelope (`Cota.parede/2` casa `{:erro, {:cota, _}}`); `:saida_ininteligivel`
    e `:modelo_sem_traducao` seguem nus.
- `Agente.Laco`: novo ramo `{:erro, {:com_consumo, motivo, %Consumo{}}}` → `contabilizar/3`
  (extraído do `contabilizar/2`, mesma lógica de preço/`:modelo_sem_preco`) com 0 chamadas de
  ferramenta, e `desfecho: :erro`. Regra 4 do `@moduledoc` estendida ao erro.

**Decisão de desenho — envelope de DOIS elementos, não `{:erro, motivo, consumo}`.** Conferi os
chamadores: `Fabrica.Planejador` (l. 105-108) casa `{:ok, _} | {:erro, motivo}` sobre
`Operario.conversar/2` — uma tupla de 3 viraria `CaseClauseError` ali, e `planejador.ex` e
`operario.ex` (spec do callback) estão fora das `areas`. Com `{:erro, {:com_consumo, motivo,
consumo}}` o contrato `{:erro, term()}` de `Fabrica.Operario` não muda e o planejador segue
funcionando (recebe `{:operario, {:com_consumo, ...}}`). O envelope é genérico: qualquer adaptador
pode usá-lo, e o `Laco` não conhece o `ClaudeCLI`. (Para o orquestrador transcrever em
`DECISOES.md` — o despacho limitou o commit às `areas` + tarefa.)

**Prova do "antes" (git stash só do `lib/`, devolvido; nada de checkout):** o mesmo despacho, pelo
`Laco`, com a amostra real `priv/probes/amostras/sessao-com-ferramenta.jsonl`:

```
== ANTES (HEAD f24a422) ==
fora_do_confinamento: desfecho=erro gasto_usd=0.0 voltas=0  (total_cost_usd do result: 0.0221191)
prazo c/ usage:       desfecho=erro gasto_usd=0.0 voltas=0
== DEPOIS ==
fora_do_confinamento: desfecho=erro gasto_usd=0.022119 voltas=1
prazo c/ usage:       desfecho=erro gasto_usd=0.019033 voltas=1
```

**Critérios.**
1. `laco_test.exs` › "erro do operario que JA gastou entra na conta (T-089)": stream REAL (a
   sessão leu `c:\Users\...\nota.txt`, fora da raiz → `{:fora_do_confinamento, _}`) →
   `gasto_usd == Float.round(custo do result, 6)` = 0,022119, a 1e-6 do `total_cost_usd`
   0,0221191; `voltas: 1`, `consumos == [consumo do result]`. O operário de teste é o
   `ClaudeCLI.responder/2` com a saída gravada na `agulha` (adaptador de produção, menos o
   disparo).
2. `claude_cli_test.exs` › "o erro do operario carrega o consumo ja medido (T-089)": prazo após
   linhas `assistant` com `usage` → tokens 18/7515/39551/6, `:uma_hora`, `gasto_usd` (pelo
   `Laco`) > 0 e ≤ `total_cost_usd`; sem linha com `usage` (stdout vazio, só `system`, `assistant`
   sem `usage`) → `{:erro, :prazo}`, `gasto_usd == 0.0`, `capture_log` com "prazo" e "0,0". Mais:
   `conversar/2` DE VERDADE com um executável falso que imprime as linhas e trava (prazo 2 s) →
   envelope com os tokens certos; prazo com `result` já escrito vale o `result`; cota sem
   envelope; stream aceito segue `{:ok, %Resposta{}}`.
3. Nenhuma expectativa existente mudou (inclusive `{:erro, :prazo}` do teste T-018d e os três
   `{:erro, {:fora_do_confinamento, _}}` de `interpretar/2`); "roteiro esgotado" segue `:erro`.

**Testes:** vermelho antes da implementação (10 falhas, todas as novas); depois
`mix test test/fabrica/agente/laco_test.exs test/fabrica/operario/claude_cli_test.exs` → 153
testes, 0 falhas.

**Bateria completa `mix fabrica.ci` (6 estágios, `credo --strict` na árvore inteira):**

```
  formato    ok        1.3s
  compilar   ok        1.1s
  lint       ok        5.2s      (mix credo --strict)
  testes     ok       53.2s
  tipos      ok       12.1s
  backup     ok        8.6s
bateria passou: 6 estagio(s) ok, 0 pulado(s)
```

**Reproduzir:** `mix test test/fabrica/agente/laco_test.exs test/fabrica/operario/claude_cli_test.exs`
(Postgres no ar — o alias `test` roda `ecto.create`).

**Arquivos:** `lib/fabrica/operario/claude_cli.ex`, `lib/fabrica/agente/laco.ex`,
`test/fabrica/operario/claude_cli_test.exs`, `test/fabrica/agente/laco_test.exs`. Deps novas:
nenhuma. MAPA não regenerado/commitado (despacho: só `areas` + tarefa; o MAPA não lista símbolos
Elixir, só a linha de HEAD mudaria).

**Pendências / candidatos a tarefa (fora das `areas`, não feitos):**
- `priv/probes/confinamento_cli.exs` l. 72 casa `{:erro, {:fora_do_confinamento, caminhos}}`
  sobre `ClaudeCLI.conversar/2`: agora cai no ramo genérico `{:erro, motivo}` (l. 80) e a sonda
  REAL reportaria "ERRO" num caso correto. Conserto de 1 linha: casar também
  `{:erro, {:com_consumo, {:fora_do_confinamento, caminhos}, _}}`. Rodar a sonda antes do marco.
- Documentar o envelope `{:com_consumo, motivo, Consumo.t()}` no `@callback conversar` de
  `Fabrica.Operario` (`operario.ex`).
- `chamadas_de_ferramenta` da sessão recusada por confinamento não entra no balanço (o envelope
  leva só o `Consumo`; os `tool_use` existiam). Afeta `OrcamentoFerramentas`, não o `gasto_usd`.
- Intocados, como a tarefa mandou: `{:morto, _}` em `Fila.Trabalho.executar/2` (`gasto_usd: 0.0`
  fixo) e `:modelo_sem_preco` → 0,0 (mexi PERTO: o cálculo foi movido para `contabilizar/3`,
  comportamento idêntico).
- O ramo Windows do executável falso do teste de `conversar/2` com prazo (`imprimir_e_travar`,
  `.ps1` com cópia de bytes) não foi exercitado aqui (contêiner Linux); o ramo `sh` foi.

**Commit:** `517ea23`

## Verificação

### Ciclo 1

- **[PASSOU] [executado] Critério 1: Stream REAL que termina num `result` com `total_cost_usd` mas é recusado por `{:fora_do_confinamento, _}` → o `gasto_usd` do despacho é igual ao custo daquele `result`, não 0,0**
  Comando: `mix test test/fabrica/agente/laco_test.exs test/fabrica/operario/claude_cli_test.exs`
  Saída: 153 testes, 0 falhas. Teste específico "erro do operario que JA gastou entra na conta (T-089)" passou — `gasto_usd == 0.022119` conforme esperado.

- **[PASSOU] [executado] Critério 2: Despacho que estoura o `:prazo` depois de linhas `assistant` com `usage` → `gasto_usd` > 0; sem nenhuma linha com `usage` → 0,0 com `Logger.warning`**
  Comando: `mix test test/fabrica/agente/laco_test.exs test/fabrica/operario/claude_cli_test.exs`
  Saída: Teste "prazo depois de linhas assistant com usage: gasto > 0, estimado por esse usage" passou. Logs mostram warning "prazo estourado sem result: consumo estimado pelo usage" com `gasto_usd` > 0.

- **[PASSOU] [executado] Critério 3: Os erros que antes eram `{:erro, motivo}` continuam sendo classificados com o MESMO `desfecho`**
  Comando: `mix test test/fabrica/agente/laco_test.exs test/fabrica/operario/claude_cli_test.exs`
  Saída: Todos os testes de `laco_test.exs` e `claude_cli_test.exs` passaram sem mudança de expectativa. Nenhum teste de desfecho falhou.

Suíte completa: 6 estágios — 153 testes, 0 falhas — `mix fabrica.ci`
  ```
  formato    ok        1.5s
  compilar   ok        1.1s
  lint       ok        5.5s
  testes     ok       56.1s
  tipos      ok       13.3s
  backup     ok        8.4s
  bateria passou: 6 estagio(s) ok, 0 pulado(s)
  ```

Mutação: Removido chamado a `contabilizar(consumo, 0)` no ramo `{:erro, {:com_consumo, motivo, %Consumo{}}}` de `laco.ex:87` → 4 testes FALHARAM conforme esperado (gasto_usd ficou 0.0 quando deveria ser > 0 e ≠ 0). Restaurado com `git checkout` — a árvore segue clean.

Graus de prova: 3 executados, 0 inspecionados, 0 julgados

## Conformidade

Conformidade: cumpre

- [Critério 1 — `fora_do_confinamento` com `result` → `gasto_usd` = custo do `result`] →
  `lib/fabrica/operario/claude_cli.ex` `responder/2` (2º ramo: `{:fora_do_confinamento, _}` →
  `com_consumo_medido/2` → `consumo/1` do `result`, o MESMO de um despacho aceito) +
  `lib/fabrica/agente/laco.ex:81-88` (ramo `{:erro, {:com_consumo, motivo, %Consumo{}}}` →
  `contabilizar/3` antes de `desfecho: :erro`). Prova: `test/fabrica/agente/laco_test.exs`,
  describe "erro do operario que JA gastou entra na conta (T-089)", com o stream REAL
  `priv/probes/amostras/sessao-com-ferramenta.jsonl` passando pelo adaptador de produção
  (`ClaudeCLI.responder/2`) e pelo `Laco` → `gasto_usd == Float.round(custo do result, 6)` e
  a 1e-6 do `total_cost_usd`.
- [Critério 2 — `:prazo` com `usage` → `gasto_usd` > 0; sem `usage` → 0,0 + `Logger.warning`] →
  `claude_cli.ex` `responder(%{motivo: :prazo})` → `consumo_medido/2` (vale o `result` se
  existir) → `consumo_das_mensagens/2` (uma vez por `message.id`, a última linha vence via
  `Map.new`) → `estimar_pelo_usage/2` (com warning "piso"); `nil` → erro nu + warning "entra
  como 0,0". Prova: `test/fabrica/operario/claude_cli_test.exs`, describe "o erro do operario
  carrega o consumo ja medido (T-089)" — tokens exatos por chamada, `gasto_usd > 0` e ≤ custo
  real pelo `Laco`, três variantes sem `usage` com `with_log` checando "prazo" e "0,0", e o
  `conversar/2` de verdade com executável que imprime e trava (prazo 2 s).
- [Critério 3 — mesmo `desfecho` para os erros de antes] → o `Laco` mantém `desfecho: :erro`
  nos dois ramos (`laco.ex:88` e `:92`); o diff dos testes tem 0 linhas removidas (nenhuma
  expectativa existente mudou, inclusive `{:erro, :prazo}` da T-018d e os três
  `{:erro, {:fora_do_confinamento, _}}` de `interpretar/2`, que segue intocado).
- **Objetivo (espírito):** o número que chega ao evento `[:fabrica, :despacho, :fim]` deixa de
  ser 0,0 quando há consumo medido. Conferido o caminho até o freio: `Fila.Trabalho.finalizar/3`
  → `emitir_fim/3` leva `resumo.gasto_usd` e `resumo.desfecho` (inalterado `:erro`);
  `Piloto.Servidor.resultado_do_evento/1` soma `gasto_usd` e marca `falhou?` por
  `desfecho == :erro` — idêntico a antes. De brinde, `consumos_para_registro/1` passa a gravar no
  banco o consumo do despacho com erro, que é o que a `ENTREGA.md` vai somar por tarefa.
- **Escopo:** dentro das `areas` (4 arquivos de código/teste + a tarefa). `responder/2` pública
  é o mínimo para testar o caminho de produção sem processo; nada além do pedido. Os dois itens
  que a tarefa mandou deixar de fora (`{:morto, _}` com 0,0 fixo e `:modelo_sem_preco`) ficaram
  intocados em comportamento.
- **Contrato com o plano:** o envelope de DOIS elementos `{:erro, {:com_consumo, motivo,
  consumo}}` preserva o `@callback conversar` (`{:erro, term()}`) de `Fabrica.Operario` — escolha
  certa, justificada nas Notas (uma tupla de 3 viraria `CaseClauseError` no `Planejador`).
  Pendente de registro: a decisão do envelope ainda não está em `_gestao/DECISOES.md` (o
  executor pediu a transcrição ao orquestrador).
- Prova visual: não se aplica (sem interface).

## Revisão

### Ciclo 1

Diff revisado: `517ea23` (código + testes + Notas) e `2ac43fe` (hash). Campo `Commit:` presente.
Além do diff, abri por grep/trechos só os CHAMADORES do formato de erro, a pedido do despacho
(`lib/` e `priv/`): `Fabrica.Planejador` l. 105-108, `Fila.Trabalho` l. 316-440, `Piloto.Servidor`
l. 289-296 e 340-343, `Retrabalho.Escada`, `Fabrica.Cota` l. 116-126, `priv/probes/*.exs`.

**Chamadores do erro do operário — classificação depois do diff:**
- `Agente.Laco` — o envelope é casado ANTES do `{:erro, motivo}` genérico; desfecho `:erro` nos
  dois. Nenhum outro adaptador (`Falso`, `MessagesAPI`) produz o envelope.
- `Fila.Trabalho` — só lê `resumo.desfecho/voltas/gasto_usd/consumos`; `julgar/3` não olha
  desfecho do construtor e o do revisor/verificador independe disto. Inalterado, exceto o
  `gasto_usd` (o pedido) e `voltas: 1` em vez de 0 no registro do despacho (correto: houve uma
  ida ao modelo).
- `Piloto.Servidor` — `falhou?` por `desfecho == :erro`: inalterado; `gasto` agora real.
- `Retrabalho.Escada` — não lê desfecho nem voltas do laço: não afetado.
- `Fabrica.Planejador` — casa `{:erro, motivo}` genérico → `{:erro, {:operario, {:com_consumo,
  ...}}}`; ninguém casa `{:operario, _}` além dele mesmo (grep em `lib/`/`priv/`/`test/`), então
  nada passa a classificar errado. Só a mensagem fica mais longa.
- Parede de cota — continua NUA (`interpretar/2` checa cota antes de `montar/2`; o ramo `:prazo`
  nunca passou por `interpretar` e segue não passando). Teste "parede de cota NAO ganha
  envelope" trava isso. `Cota.parede/2` continua casando `{:erro, {:cota, _}}`.
- `priv/probes/cli_real.exs` e `marco_v02_agente.exs` — só casam `{:cota, _}`/genérico ou leem
  o resumo do `Laco`: não afetados.
- `priv/probes/confinamento_cli.exs` — QUEBRA (ver achado abaixo).

**Achados:**
- [menor] `priv/probes/confinamento_cli.exs:72` (e o mesmo `avaliar` usado pelas seções A/B) —
  casa `{:erro, {:fora_do_confinamento, caminhos}}` sobre `ClaudeCLI.conversar/2`, que agora
  devolve `{:erro, {:com_consumo, {:fora_do_confinamento, caminhos}, %Consumo{}}}`. Cenário:
  rodar a sonda real com o modelo tentando escrever fora da raiz → cai em `{:erro, motivo}`
  (l. 80), imprime "ERRO" e devolve `false` — a sonda reprova um caso CORRETO. Não reprova esta
  tarefa: o arquivo está fora das `areas` (o guarda de commit recusaria o conserto, o laço já
  documentado em D-008/D-013), a sonda é manual, não está em `ci.json` e **não afeta o marco
  T-058** — o piloto despacha por `Fila.Trabalho` → `Agente.Laco`, nunca por sonda, e nenhum dos
  4 critérios da T-058 roda `priv/probes/`. Vira corretiva de 1 linha à parte
  (`areas: [priv/probes/confinamento_cli.exs]`: casar também
  `{:erro, {:com_consumo, {:fora_do_confinamento, caminhos}, _}}`); só precisa vir ANTES do marco
  se alguém pretender rodar essa sonda como pré-voo.
- [menor] `_gestao/DECISOES.md` — falta registrar o envelope `{:com_consumo, motivo,
  Consumo.t()}` como contrato de erro de `Fabrica.Operario` (e documentá-lo no `@callback` de
  `lib/fabrica/operario.ex`, fora das `areas`). Trabalho do orquestrador, não do executor.
- [menor] `lib/fabrica/operario/claude_cli.ex` `estimar_pelo_usage/2` — o warning diz "prazo
  estourado sem result" também quando o motivo é `{:fora_do_confinamento, _}` de um stream sem
  `result` (processo saiu normal com blocos mas sem `result`). Cosmético; o número está certo.
- [menor] (registrado pelo executor, confirmado) o envelope leva só o `Consumo`: os `tool_use`
  da sessão recusada não entram em `chamadas_de_ferramenta` (`contabilizar(consumo, 0)`).
  Afeta o `OrcamentoFerramentas`, não o `gasto_usd` nem o teto.

**Verificado sem achado:** dedupe por `message.id` (`Map.new` mantém a última linha da chamada,
a mais adiantada); fallback `{:sem_id, indice}` não colapsa linhas sem id; `duracao_ms` do
`Comando` é inteiro no prazo real (`comando.ex:267`), então o `nil` só ocorre em teste;
`ttl_cache/2` reaproveitado com a quebra somada (mesma regra do `result`, sem roda nova);
`:cancelado` e `:normal` seguem por `interpretar/2` como antes; cota + confinamento → cota
vence (ordem de `interpretar/2`); preço pelo mesmo `Precos.estimar/2` em `contabilizar/3`,
`:modelo_sem_preco` idêntico. Mutação do testador (remover o `contabilizar` do ramo novo → 4
falhas) confirma que os testes travam o conserto.

**Observação FORA do diff (pré-existente, não reprova esta tarefa — para o orquestrador antes do
marco):** em `lib/` não há chamador de `Fabrica.Cota.parede/2` (grep em `lib/fabrica/agente`,
`fila`, `piloto`, `telemetria`). O `Agente.Laco` colapsa `{:erro, {:cota, reabre_em}}` em
`desfecho: :erro` (antes e depois deste diff) e o `reabre_em` se perde; o `Piloto.Servidor` só
LÊ `Cota.estado/1`. Cenário: parede de cota real durante a T-058 → o despacho chega ao piloto
como `falhou?: true`, a `Cota` nunca fica `batida?` e o piloto NÃO dorme — tende a parar por
falha ou seguir despachando contra a parede, em vez de rearmar. É a família "sensor sem atuador"
(o sinal `{:cota, _}` existe e é testado; nada o entrega a `Fabrica.Cota`). Este diff não piora
nem melhora isso — mas a pergunta "o piloto dorme na cota?" do marco depende dele.

Aprovado: conformidade `cumpre`, nenhum achado `critica`/`importante`.

