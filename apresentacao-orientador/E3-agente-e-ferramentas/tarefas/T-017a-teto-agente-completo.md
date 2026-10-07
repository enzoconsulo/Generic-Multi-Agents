---
id: T-017a
titulo: O teto de voltas do agente completo e imposto pelo CLI, e nao pedido no prompt
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-018c, T-018e]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs, priv/probes/cli_real.exs]
tentativas: 1
criada: 2026-09-01
atualizada: 2026-09-03
---

## Objetivo
Fazer o `teto_de_voltas` da requisicao virar limite imposto ao `claude` pela linha de comando,
de modo que a regra *"o teto nao vai no prompt"* continue valendo quando quem roda o laco e o
CLI.

## Contexto

**Esforco estimado: 45 a 60 min.** E a segunda peca de governanca que a troca de familia obriga
a reconstruir (a primeira e o confinamento, T-012a).

**A regra que esta em risco.** `Fabrica.Agente.Estado` existe, textualmente, para tornar uma
regra impossivel de violar: *"o teto de voltas e o de gasto NAO vao no prompt. Eles moram no
estado do processo, e sao conferidos pelo laco. E a diferenca entre 'o prompt pede que voce pare
em 30 voltas' e 'a volta 31 nao acontece'"*.

Sob a familia `:agente_completo` (T-003a) o laco da fabrica faz **uma** volta, e os turnos
acontecem todos dentro do CLI. Se ninguem passar o teto adiante, a volta 31 acontece — e a 200
tambem. A regra teria virado exatamente o que ela existe para nao ser: uma exortacao. Nao ha
como o `Estado` conferir o que ele nao ve; **o unico ponto onde o teto ainda e imposto e a linha
de comando.**

**O desenho e curto:** `ClaudeCLI` le `requisicao.teto_de_voltas` (o campo ja existe, com padrao
30, e o `Laco` ja o preenche a partir do estado) e o traduz para a flag de teto de turnos do
CLI. A grafia da flag vem da **secao 5 da medicao da T-018b** — nao a escreva de memoria, e
confirme la se o evento terminal sinaliza o teto atingido e com que `subtype` (a T-018e ja
consumiu a mesma medicao para mapear o desfecho `:teto_de_voltas`).

**Se a medicao mostrar que a flag NAO existe nesta versao do CLI**, nao invente contorno:
declare `Impedimento:` nas Notas de execucao com a evidencia. Um teto que nao existe e uma
propriedade que o projeto perdeu na troca de familia, e isso e decisao de escopo — do Enzo, pelo
planejador, nao sua. Um `--max-turns` fantasiado de conserto seria pior que a ausencia, porque a
ausencia pelo menos apareceria.

**Fora de escopo:** o teto de GASTO (`teto_de_gasto_usd`), que sob assinatura e estimativa
contabil e nao corta nada; a contagem de chamadas de ferramenta (T-017b); e qualquer tentativa
de retomar a sessao apos o teto (`--resume`), que o `PLANO_V2.md` deixou explicitamente de fora.

**Prove contra o real.** Estenda `priv/probes/cli_real.exs`: uma sessao com o teto em 1 ou 2,
pedindo algo que exigiria mais turnos, tem de PARAR — e o adaptador tem de reportar
`:teto_de_voltas`. Consome cota da assinatura; nao gera fatura.

## Criterios de aceite
- [ ] A linha montada carrega o teto de turnos derivado de `requisicao.teto_de_voltas`, e tetos diferentes produzem linhas diferentes.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] O texto do teto NAO aparece no prompt enviado — o teto e flag, nunca frase. Ha teste que confere a ausencia no conteudo da conversa.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Uma sessao REAL com teto baixo, sobre um pedido que exigiria mais turnos, para; e o adaptador devolve `motivo_parada: :teto_de_voltas`.
      `verificar: mix run priv/probes/cli_real.exs`
- [ ] Uma sessao REAL com teto folgado, sobre o mesmo pedido, conclui normalmente — o teto nao pode estar cortando trabalho legitimo.
      `verificar: mix run priv/probes/cli_real.exs`
- [ ] A bateria completa passa nos cinco estagios, `tipos` incluido.
      `verificar: mix fabrica.ci`

## Notas de execucao

### Ciclo 1

**A grafia confirmada na T-018b (secao 5, `_gestao/PROGRESSO.md`):** `--max-turns <n>`,
ausente do `--help` da versao instalada mas funcional por comportamento — controle negativo
(`--totalmente-inventado-xyz` -> `error: unknown option`) e controle positivo (`--max-turns 2`
-> `subtype: "error_max_turns"`) ja medidos la, e `motivo_parada/1` ja traduzia esse `subtype`
para `:teto_de_voltas` desde a T-018e. Nao remedi nada: li o achado e apliquei.

**TDD:** escrevi os quatro testes ANTES de tocar `lib/` (descreve
`"o teto de voltas (T-017a)"` em `test/fabrica/operario/claude_cli_test.exs`), rodei
`mix test test/fabrica/operario/claude_cli_test.exs` e vi os tres que exercitam `--max-turns`
falharem (vermelho, a flag nao existia na linha). So depois implementei.

**Implementacao** — `lib/fabrica/operario/claude_cli.ex`, `linha/1`: uma clausula
`--max-turns #{requisicao.teto_de_voltas}` entre `--tools` e `--model`. `teto_de_voltas` ja
existia em `Fabrica.Operario.Requisicao` (padrao 30, T-015/T-017), so faltava a traducao para
a flag — nenhum campo novo, nenhuma struct nova. Documentei a flag no `@doc` de `linha/1`,
apontando para a medicao da T-018b e para a natureza nao documentada dela (mesmo padrao das
notas ja existentes sobre `--verbose` e `--tools`).

**Por que o teto nao vaza para o prompt:** ele nunca esteve em `mensagens` nem em
`texto_da_mensagem/1` — so entra na linha via `~s(--max-turns #{requisicao.teto_de_voltas})`,
fora da string interpolada com o conteudo da conversa. O teste
`"o texto do teto NAO aparece no prompt enviado"` prova isso extraindo o ULTIMO argumento entre
aspas da linha montada (o prompt de verdade) e conferindo que ele bate, byte a byte, com o
conteudo original — sem o numero do teto, sem a palavra "teto"/"volta"/"max-turns".

**Prova REAL, estendendo `priv/probes/cli_real.exs` com as Secoes D e E** (consumiu cota da
assinatura, no gera fatura):
- **Secao D** (`teto_de_voltas: 1`, pedido que exige varios turnos) -> `motivo_parada:
  :teto_de_voltas` confirmado, 1/5 arquivos criados (o teto cortou no meio, como esperado).
- **Secao E** (`teto_de_voltas: 30`, o MESMO pedido) -> `motivo_parada: :fim_do_turno`, 5/5
  arquivos criados. O teto folgado nao cortou trabalho legitimo.

  A primeira redacao do pedido ("pare e reavalie apos cada arquivo") fez o modelo interpretar
  a propria instrucao como permissao para parar cedo — a Secao E terminou com 1/5 arquivos SEM
  o teto ter cortado nada, o que teria sido um falso "passou" por motivo errado. Reescrevi o
  pedido para PROIBIR resolver tudo numa chamada e EXIGIR nao parar antes dos cinco arquivos
  existirem; a segunda rodada deu 5/5. Fica registrado porque e o mesmo tipo de armadilha que
  a T-018b documentou para `bypassPermissions` (desenho do probe contaminando a medicao).

**Achado que NAO e desta tarefa — Secao C do mesmo probe falhou nas duas rodadas.** O papel
`verificador` (sem `Write`/`Edit` no `--tools`) criou o arquivo proibido mesmo assim, usando
`Bash` no lugar. Confirmado por `git log --oneline -- priv/probes/cli_real.exs`: a Secao C e
do commit `2527e35` (T-018c), eu nao toquei nela, e o `@moduledoc` de `claude_cli.ex` ja
documenta esse mecanismo exato ("A lacuna que fica: comando de shell nao se audita por
caminho... NAO tentamos"). E o mesmo padrao de substituicao que a T-018b mediu para
`--disallowedTools`, so que aqui `Bash` esta DENTRO do `--tools` permitido do papel (o
catalogo da fabrica da `verificador` o poder de rodar comando). Nao e regressao desta tarefa
e esta fora do escopo dela (teto de voltas, nao vocabulario de ferramentas) — registro como
achado para o orquestrador, ligado a mesma decisao pendente que o `@moduledoc` ja cita (nao
permitir shell ao papel / servir ferramentas por MCP / aceitar a lacuna).

**`mix fabrica.ci` teve uma falha isolada e nao relacionada na primeira rodada:**
`Fabrica.Criterios.ClasseFalhaTest` ("prazo estourado reexecuta UMA vez") — sensivel a tempo
sob `max_cases: 16`, nao toca nada que eu editei. Confirmado flaky: passou sozinho
(`mix test test/fabrica/criterios/classe_falha_test.exs:315`) e a suite inteira passou limpa
na rodada seguinte, duas vezes seguidas.

**Reproduzir:**
```
mix test test/fabrica/operario/claude_cli_test.exs   # 62 testes, 0 falhas — inclui os 4 novos
mix run priv/probes/cli_real.exs                     # consome cota; Secoes D e E sao a prova desta tarefa
mix fabrica.ci                                        # 5 estagios ok
```

**Commit:** `e08330b`

## Verificacao


## Conformidade

Conformidade: cumpre

- Teto de turnos derivado de `requisicao.teto_de_voltas` vira `--max-turns <n>` na linha
  montada → `lib/fabrica/operario/claude_cli.ex:226` (`~s(--max-turns #{requisicao.teto_de_voltas} )`),
  provado por `test/fabrica/operario/claude_cli_test.exs:651-702` (4 testes: flag presente,
  tetos diferentes geram linhas diferentes, o padrao 30 tambem vira flag).
- O teto nao vaza para o prompt → mesmo arquivo de teste, `"o texto do teto NAO aparece no
  prompt enviado"` (linhas ~688-702): extrai o ultimo argumento entre aspas da linha montada
  e confere que bate byte a byte com o conteudo original, sem o numero nem as palavras
  teto/volta/max-turns. Condiz com a regra do Objetivo ("o teto nao vai no prompt").
- Sessao REAL com teto baixo para com `:teto_de_voltas` → Secao D de `priv/probes/cli_real.exs`
  (`teto_de_voltas: 1`, pedido de varios turnos), 1/5 arquivos criados, motivo confirmado.
- Sessao REAL com teto folgado conclui o mesmo pedido → Secao E do mesmo probe
  (`teto_de_voltas: 30`), 5/5 arquivos criados, `motivo_parada != :teto_de_voltas`.
- `mix fabrica.ci` com os 5 estagios ok, registrado na Verificacao (testador) e reproduzido
  nas Notas de execucao.
- Escopo respeitado: nao mexeu em teto de gasto, contagem de ferramentas nem `--resume` —
  exatamente o que o Objetivo marcou como fora de escopo. A grafia da flag veio da medicao
  da T-018b (nao foi inventada), conforme a tarefa exigia.
- O achado da Secao C (papel `verificador` cria arquivo via `Bash` apesar de nao ter
  `Write`/`Edit`) e registrado nas Notas como fora de escopo desta tarefa, com evidencia de
  que pertence a T-018c e nao foi tocado aqui (`git log --oneline -- priv/probes/cli_real.exs`).
  Correto nao consertar: nao e o que esta tarefa pediu.
- Diff cirurgico: 12 linhas em `claude_cli.ex` (doc + uma clausula na `linha/1`), extensao do
  probe existente, 4 testes novos. Nenhuma sobra de escopo.

## Revisao

Aprovado sem ressalvas.

Verifiquei:
- `linha/1` (`claude_cli.ex:222-228`): a clausula `--max-turns #{requisicao.teto_de_voltas}`
  fica FORA da string interpolada com o prompt (que so comeca em `"#{prompt}"` no fim da
  linha) — a alegacao de que o teto nao vaza para o prompt e estruturalmente verdadeira, nao
  so validada por teste.
- `motivo_parada/1` (`claude_cli.ex:462-468`, pre-existente da T-018e) ja traduzia
  `"error_max_turns"` para `:teto_de_voltas`; esta tarefa so precisava emitir a flag que
  produz esse subtype, e foi exatamente o que fez — nenhuma duplicacao de logica.
- `Requisicao` (`lib/fabrica/operario.ex:145,150`) ja tinha `teto_de_voltas` com padrao 30;
  nenhum campo novo foi criado, condizente com a nota "nenhum campo novo, nenhuma struct
  nova" das Notas de execucao.
- O commit `e08330b` bate com o `git show --stat`: exatamente os 5 arquivos declarados,
  sem sobra.
- Sem bug de correcao, seguranca ou integracao no diff: a flag e um `pos_integer()` que
  vem de dentro do sistema (nunca de entrada de usuario externa sem validacao), interpolado
  em template, sem risco de injecao adicional ao que a linha ja tinha (a mesma tecnica ja
  presente para `--tools`/`--model`).
- [menor] O achado da Secao C (papel `verificador` viola vocabulario de ferramentas via
  `Bash`) esta corretamente fora do escopo desta tarefa, mas fica sem tarefa aberta que o
  capture — vale o orquestrador abrir uma nova a partir da nota ja registrada, para nao se
  perder.


## Verificação

### Passada mecânica (sem modelo)

- [executado] A linha montada carrega o teto de turnos derivado de `requisicao.teto_de_voltas`, e tetos diferentes produzem linhas diferentes. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU**
- [executado] O texto do teto NAO aparece no prompt enviado — o teto e flag, nunca frase. Ha teste que confere a ausencia no conteudo da conversa. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Uma sessao REAL com teto baixo, sobre um pedido que exigiria mais turnos, para; e o adaptador devolve `motivo_parada: :teto_de_voltas`. — `mix run priv/probes/cli_real.exs` → **PASSOU**
- [executado] Uma sessao REAL com teto folgado, sobre o mesmo pedido, conclui normalmente — o teto nao pode estar cortando trabalho legitimo. — `mix run priv/probes/cli_real.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A bateria completa passa nos cinco estagios, `tipos` incluido. — `mix fabrica.ci` → **PASSOU**

Graus de prova: 5 executado(s), 0 para julgamento (de 5).

### Ciclo 2

- **[PASSOU] [executado] Critério 1: A linha montada carrega o teto de turnos derivado de `requisicao.teto_de_voltas`, e tetos diferentes produzem linhas diferentes**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs --color 2>&1 | tail -5`
  Saída: 62 tests, 0 failures

- **[PASSOU] [executado] Critério 2: O texto do teto NAO aparece no prompt enviado — o teto e flag, nunca frase**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs --color 2>&1 | tail -5`
  Saída: 62 tests, 0 failures (inclui teste que extrai e valida o prompt sem o teto)

- **[PASSOU] [executado] Critério 3: Uma sessao REAL com teto baixo (requisicao.teto_de_voltas: 1), sobre um pedido que exigiria mais turnos, para com `motivo_parada: :teto_de_voltas`**
  Comando: `mix run priv/probes/cli_real.exs 2>&1 | grep -A 5 "SECAO D"`
  Saída: parada ........ teto_de_voltas; arquivos criados 1/5; [ok] motivo_parada == :teto_de_voltas

- **[PASSOU] [executado] Critério 4: Uma sessao REAL com teto folgado (requisicao.teto_de_voltas: 30), sobre o mesmo pedido, conclui normalmente**
  Comando: `mix run priv/probes/cli_real.exs 2>&1 | grep -A 5 "SECAO E"`
  Saída: parada ........ fim_do_turno; arquivos criados 5/5; [ok] motivo_parada != :teto_de_voltas; [ok] os cinco arquivos foram criados

- **[PASSOU] [executado] Critério 5: A bateria completa passa nos cinco estagios, `tipos` incluido**
  Comando: `mix fabrica.ci 2>&1 | tail -10`
  Saída: formato ok, compilar ok, lint ok, testes ok, tipos ok; bateria passou: 5 estagio(s) ok

Mutação: Removido `--max-turns #{requisicao.teto_de_voltas}` da linha de comando → 3 testes FALHARAM (esperado ✓), com assertions claras ("--max-turns 7 not found", etc.) detectando a ausência. Mutação desfeita, todos os 62 testes voltaram a passar.

Suíte: 62 tests, 0 failures
Graus de prova: 5 executado(s), 0 julgado(s)
