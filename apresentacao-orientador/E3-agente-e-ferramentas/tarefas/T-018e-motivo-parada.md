---
id: T-018e
titulo: O motivo de parada do ClaudeCLI sai do evento terminal, e nao do stream inteiro
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-018b, T-003a]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs]
tentativas: 2
criada: 2026-09-01
atualizada: 2026-09-03
---

## Objetivo
Fazer `ClaudeCLI.montar/1` derivar o `motivo_parada` do evento que ENCERRA a sessao, e nunca de
um bloco `tool_use` que o proprio CLI ja resolveu no meio do caminho.

## Contexto

**Esforco estimado: 30 a 45 min.** E a CAUSA 3 do marco 1 reprovado. Pequena, e depende do
desenho: sob a familia `:agente_completo` (T-003a) ela muda de forma, e por isso nao foi
consertada antes.

**O que foi medido (T-020, ciclo 3).** Hoje:

    defp motivo_parada(blocos, resultado) do
      cond do
        Enum.any?(blocos, &(&1.tipo == :uso_de_ferramenta)) -> :uso_de_ferramenta
        ...

`blocos` e a concatenacao dos blocos de **todos** os eventos `assistant` do stream inteiro —
isto e, da sessao inteira do CLI, com todos os turnos internos dela. Um `tool_use` que o proprio
CLI pediu, executou (ou teve negado) e seguiu adiante aparece para o `Laco` como *"ha ferramenta
pendente"*. Foi assim que o laco do marco tentou executar `Write` pelo mapa dele, gravou
"ferramenta desconhecida" e chamou o operario de novo.

**Sob a familia agente completo, a regra correta e mais forte do que "olhe so o ultimo turno":**
este adaptador **nunca** devolve `:uso_de_ferramenta`. O CLI nao devolve ferramenta pendente
para a fabrica executar — quando ele para, ou terminou, ou bateu num teto, ou recusou. Escreva
isso no `@moduledoc` junto com o motivo, porque a linha apagada some e a razao dela nao.

O que o `motivo_parada` deve refletir, lido do evento terminal (`type: "result"`):

| situacao no evento terminal | `motivo_parada` |
|---|---|
| sessao concluida normalmente | `:fim_do_turno` |
| teto de turnos do CLI atingido | `:teto_de_voltas` |
| erro / recusa sinalizada pelo CLI | `:recusa` |

**Atencao ao mapeamento que existe hoje e esta errado:** `subtype == "error_max_turns"` vira
`:teto_de_tokens`. Teto de turnos nao e teto de tokens, e a v0.3 le esse campo para decidir a
politica de retrabalho — um desfecho mal nomeado vira decisao errada la na frente.
`Estado.desfecho` ja tem `:teto_de_voltas` no `@type`; `Resposta.motivo_parada` ainda nao, entao
o `@type` dele precisa acompanhar. Confira a grafia real do `subtype` na **amostra de stream
salva pela T-018b** — nao no palpite escrito na T-018.

**Fora de escopo:** a contagem de ferramentas usadas (T-017b), o teto passado ao CLI (T-017a) e
a auditoria de caminho (T-012a). Os blocos `:uso_de_ferramenta` continuam sendo traduzidos e
devolvidos em `blocos` — eles sao o REGISTRO do que a sessao fez, e as tarefas acima dependem
disso. O que muda e so o que se conclui deles.

**Prove com a amostra real.** A fixture de teste sai do stdout bruto que a T-018b salvou em
`priv/probes/amostras/` — uma sessao de verdade, com uso de ferramenta no meio e fim normal. E
essa amostra que distingue este conserto de mais um teste sobre eventos inventados a mao, que e
o que ja falhou tres vezes neste projeto.

## Criterios de aceite
- [ ] Um stream REAL (a amostra salva pela T-018b), com `tool_use` no meio e sessao concluida, produz `motivo_parada: :fim_do_turno` — e nao `:uso_de_ferramenta`.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Nenhuma entrada possivel faz este adaptador devolver `:uso_de_ferramenta` — ha teste que varre os casos (com e sem `tool_use`, com e sem evento terminal) e afirma a ausencia.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Teto de turnos do CLI vira `:teto_de_voltas` (e nao `:teto_de_tokens`), com a grafia do `subtype` conferida contra a amostra ou contra a medicao da T-018b.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Erro sinalizado no evento terminal vira `:recusa`, e sessao normal vira `:fim_do_turno`, cada um com seu teste.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Os blocos `:uso_de_ferramenta` continuam presentes em `Resposta.blocos` — o registro do que a sessao fez nao pode desaparecer junto com a conclusao errada.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] A bateria completa passa nos cinco estagios, `tipos` incluido.
      `verificar: mix fabrica.ci`

## Notas de execucao

**O que foi feito.** `motivo_parada/1` (antes `motivo_parada/2`) passou a ler SO o evento
terminal (`resultado`, o `type: "result"`), nunca mais `blocos` (a sessao inteira). O ramo
`Enum.any?(blocos, &(&1.tipo == :uso_de_ferramenta)) -> :uso_de_ferramenta` foi removido —
sob `:agente_completo` este adaptador nao devolve mais `:uso_de_ferramenta` em hipotese
nenhuma. `subtype == "error_max_turns"` agora mapeia para `:teto_de_voltas` (grafia
confirmada pela T-018b contra o CLI real); antes mapeava, errado, para `:teto_de_tokens`
(motivo do `MessagesAPI`, familia `:endpoint_de_modelo`).

`Fabrica.Operario.Resposta.motivo_parada/0` (em `lib/fabrica/operario.ex`) ganhou
`:teto_de_voltas` no `@type`, mantendo `:uso_de_ferramenta` e `:teto_de_tokens` — que
continuam legitimos no `MessagesAPI`. O `@moduledoc` do `ClaudeCLI` ganhou uma secao nova
("O motivo de parada sai do evento TERMINAL...") documentando a regra e a causa raiz (T-020,
ciclo 3).

**Achado no caminho, e consertado por bloquear o proprio criterio 1 desta tarefa:** a amostra
real da T-018b (`priv/probes/amostras/sessao-com-ferramenta.jsonl`) tem
`"status":"allowed_warning"` no `rate_limit_event` (utilizacao 0.99, `isUsingOverage: false`
— ainda permitido, so proximo do teto). `parede?/1` comparava `status != "allowed"` por
igualdade exata, entao tratava esse status como PAREDE DE COTA e a amostra real nunca chegava
a `motivo_parada` — `interpretar/1` devolvia `{:erro, {:cota, ...}}` para uma sessao que na
verdade tinha concluido normalmente. Troquei para `not String.starts_with?(status, "allowed")`,
mantendo o principio de comparar contra o status BOM (nao enumerar os ruins). Teste novo:
"rate_limit_event com status allowed_warning tambem NAO e parede".

**Arquivos alterados:**
- `lib/fabrica/operario/claude_cli.ex` — `motivo_parada/1`, `parede?/1`, `@moduledoc`, comentarios.
- `lib/fabrica/operario.ex` — `@type motivo_parada` de `Fabrica.Operario.Resposta`, `@moduledoc`.
- `test/fabrica/operario/claude_cli_test.exs` — testes atualizados/novos (ver abaixo).

**Testes:**
- Reescrito: "uso de ferramenta NO MEIO do caminho, com sessao concluida, vira :fim_do_turno"
  (antes esperava `:uso_de_ferramenta` — contradizia a nova regra).
- Reescrito: "teto de turnos do CLI vira :teto_de_voltas, e nao :teto_de_tokens".
- Novo: "nenhuma entrada possivel produz :uso_de_ferramenta" — varre 7 combinacoes (com/sem
  `tool_use`, com/sem evento terminal) e afirma por inclusao (`motivo in [...]`) para nao
  disparar o aviso de tipo disjunto do checador do Elixir 1.19 sobre comparar com um atomo ja
  provado impossivel — o proprio aviso e a prova estatica de que a garantia pegou.
- Novo (describe "prova com o stream REAL (T-018b)"): le o `.jsonl` da amostra bruta,
  confere `motivo_parada: :fim_do_turno` e que os blocos `:uso_de_ferramenta` continuam em
  `Resposta.blocos`.
- Novo: "rate_limit_event com status allowed_warning tambem NAO e parede".

**Reproduzir:**
`mix test test/fabrica/operario/claude_cli_test.exs` (50 testes, 0 falhas) e
`mix fabrica.ci` (5 estagios, todos ok — `formato`, `compilar --warnings-as-errors`,
`credo --strict`, `testes`, `tipos`/dialyzer).

**Commit:** `e9316f4`

### Ciclo 2 (retrabalho por reprovação mecânica)

A passada mecânica reprovou `mix fabrica.ci` no estágio `testes`, com falha em
`test/fabrica/ferramentas/confinamento_test.exs:141` ("recusa link cujo DESTINO esta fora"),
`{:error, :sem_link}` — a criação da junção (`mklink /J`) não confirmou sucesso naquela
execução. **Esse arquivo não está entre as `areas` desta tarefa** (é do T-012a, confinamento
de caminho) e nada em `lib/fabrica/operario/claude_cli.ex` toca criação de link ou
`Confinamento`. Não é o que este ciclo pediu para corrigir.

Não procede como defeito desta tarefa: reexecutei o mesmo teste isolado
(`mix test test/fabrica/ferramentas/confinamento_test.exs` → 29 testes, 0 falhas) e a suíte
completa duas vezes seguidas (`mix test` → 822 testes, 0 falhas; `mix fabrica.ci` → 5
estágios, todos ok, sem tocar em nenhum arquivo). A falha foi intermitente — o `mklink /J`
do teste de confinamento é sensível a corrida sob execução assíncrona nesta máquina — e não
se reproduziu sem qualquer mudança de código. Nenhuma linha foi alterada neste ciclo.

**Reproduzir:** `mix fabrica.ci` (5 estágios, todos ok).

**Commit:** `e81bb66`, `45c4742`

## Verificacao

### Ciclo 3 (verificação)

- **[PASSOU] [executado] Um stream REAL (a amostra salva pela T-018b), com `tool_use` no meio e sessao concluida, produz `motivo_parada: :fim_do_turno` — e nao `:uso_de_ferramenta`.**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: 50 tests, 0 failures — teste "amostra com tool_use no meio e sessao concluida produz :fim_do_turno, com os blocos preservados" passou.

- **[PASSOU] [executado] Nenhuma entrada possivel faz este adaptador devolver `:uso_de_ferramenta` — ha teste que varre os casos (com e sem `tool_use`, com e sem evento terminal) e afirma a ausencia.**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: 50 tests, 0 failures — teste "nenhuma entrada possivel produz :uso_de_ferramenta" passou em 7 variacoes (5 testes).

- **[PASSOU] [executado] Teto de turnos do CLI vira `:teto_de_voltas` (e nao `:teto_de_tokens`), com a grafia do `subtype` conferida contra a amostra ou contra a medicao da T-018b.**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: 50 tests, 0 failures — teste "teto de turnos do CLI vira :teto_de_voltas, e nao :teto_de_tokens" passou. `subtype == "error_max_turns"` mapeado para `:teto_de_voltas`.

- **[PASSOU] [executado] Erro sinalizado no evento terminal vira `:recusa`, e sessao normal vira `:fim_do_turno`, cada um com seu teste.**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: 50 tests, 0 failures — testes "erro do CLI vira :recusa" e "so texto vira :fim_do_turno" passaram.

- **[PASSOU] [executado] Os blocos `:uso_de_ferramenta` continuam presentes em `Resposta.blocos` — o registro do que a sessao fez nao pode desaparecer junto com a conclusao errada.**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: 50 tests, 0 failures — teste "amostra com tool_use no meio... com os blocos preservados" afirma `assert Enum.any?(resposta.blocos, &(&1.tipo == :uso_de_ferramenta))` → passou.

- **[PASSOU] [executado] A bateria completa passa nos cinco estagios, `tipos` incluido.**
  Comando: `mix fabrica.ci`
  Saída:
  ```
  formato    ok        2.9s
  compilar   ok        2.9s
  lint       ok        7.2s
  testes     ok       24.7s
  tipos      ok       17.4s
  bateria passou: 5 estagio(s) ok, 0 pulado(s)
  ```

Suíte completa: **5 estágios PASSOU, 0 falharam** — `mix fabrica.ci`

Graus de prova: 6 executados, 0 para julgamento (de 6).

## Conformidade

Conformidade: cumpre

- Objetivo (`motivo_parada` deriva do evento TERMINAL, nunca de `blocos`) → `lib/fabrica/operario/claude_cli.ex:363-370` — `motivo_parada/1` perdeu o parâmetro `blocos`, le só `resultado`, e o ramo `Enum.any?(blocos, ...) -> :uso_de_ferramenta` foi removido. Chamada em `interpretar/1` (linha 322) confirma: `motivo_parada(resultado)`, sem `blocos`.
- Critério 1 (amostra real com `tool_use` no meio → `:fim_do_turno`) → `test/fabrica/operario/claude_cli_test.exs:207-217` ("prova com o stream REAL (T-018b)"), lendo `priv/probes/amostras/sessao-com-ferramenta.jsonl` de fato.
- Critério 2 (nenhuma entrada possível produz `:uso_de_ferramenta`) → `test/fabrica/operario/claude_cli_test.exs:198-224`, varre 7 combinações; e é estaticamente impossível de qualquer forma, já que `motivo_parada/1` não recebe mais `blocos`.
- Critério 3 (`error_max_turns` → `:teto_de_voltas`, grafia conferida) → `lib/fabrica/operario/claude_cli.ex:368`; grafia `"error_max_turns"` medida contra o CLI real e registrada em `_gestao/tarefas/T-018b-superficie-cli.md:174` (não é palpite). `Fabrica.Operario.Resposta.@type motivo_parada` (lib/fabrica/operario.ex:163-172) ganhou `:teto_de_voltas`, alinhado ao `Estado.desfecho` que já o tinha (lib/fabrica/agente/estado.ex:19).
- Critério 4 (erro → `:recusa`, normal → `:fim_do_turno`, cada um com teste) → `test/fabrica/operario/claude_cli_test.exs:190-196` (recusa) e `:178-181` (fim do turno).
- Critério 5 (blocos `:uso_de_ferramenta` continuam em `Resposta.blocos`) → `traduzir_bloco/1` (claude_cli.ex:342) inalterado; afirmado pelo próprio teste do critério 1 (`assert Enum.any?(resposta.blocos, &(&1.tipo == :uso_de_ferramenta))`).
- Critério 6 (bateria completa, 5 estágios) → Verificação/Ciclo 3 registra `mix fabrica.ci` com os 5 estágios `ok`, `tipos` incluído.
- Achado no caminho, dentro de escopo (`claude_cli.ex` está em `areas`): `parede?/1` (linha 257) trocou `status != "allowed"` por `not String.starts_with?(status, "allowed")` — necessário porque a amostra real tem `status: "allowed_warning"`, que sem o ajuste derrubava a prova do critério 1 com um falso positivo de parede de cota. Mantém o princípio já documentado (comparar contra o status BOM). Verificado: `priv/probes/amostras/sessao-com-ferramenta.jsonl` contém de fato `"status":"allowed_warning"`.
- A investigação do Ciclo 2 (falha de `confinamento_test.exs:141`, fora das `areas` desta tarefa) está correta: nada em `claude_cli.ex` ou `operario.ex` toca criação de link/`Confinamento`, e a reexecução dupla sem mudança de código confirma intermitência alheia (T-012a). Não é assunto desta tarefa.

## Revisao

Aprovado sem ressalvas. Verifiquei o diff de código real (commit `e9316f4` — os commits `e81bb66`/`45c4742` só tocam o arquivo da tarefa e o `MAPA.md`, sem código):
- `motivo_parada/1` só le o evento terminal, `cond` tem só 3 ramos possíveis (`:teto_de_voltas`, `:recusa`, `:fim_do_turno`) — nenhum caminho para `:uso_de_ferramenta`.
- `traduzir_bloco/1` (o que povoa `Resposta.blocos`) não foi tocado — o registro de `tool_use` continua íntegro.
- Confirmei que o `Laço` (lib/fabrica/agente/laco.ex:81-93) ainda trata `:uso_de_ferramenta` legitimamente para a família `:endpoint_de_modelo` (`MessagesAPI` ainda o emite, linha messages_api.ex:251) — a mudança não quebra esse contrato, só remove o caminho que nunca deveria existir sob `:agente_completo`.
- `parede?/1`: `String.starts_with?(status, "allowed")` cobre tanto `"allowed"` quanto `"allowed_warning"` sem enumerar status ruins; não há status real conhecido que comece por "allowed" e ainda assim seja parede, então não há regressão de segurança aqui (só reduz falsos positivos).
- `@moduledoc` novo documenta a causa raiz (T-020, ciclo 3) e a regra — atende ao pedido explícito da tarefa ("escreva isso no `@moduledoc`... porque a linha apagada some e a razao dela nao").


## Verificação

### Passada mecânica (sem modelo)

- [executado] Um stream REAL (a amostra salva pela T-018b), com `tool_use` no meio e sessao concluida, produz `motivo_parada: :fim_do_turno` — e nao `:uso_de_ferramenta`. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU**
- [executado] Nenhuma entrada possivel faz este adaptador devolver `:uso_de_ferramenta` — ha teste que varre os casos (com e sem `tool_use`, com e sem evento terminal) e afirma a ausencia. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Teto de turnos do CLI vira `:teto_de_voltas` (e nao `:teto_de_tokens`), com a grafia do `subtype` conferida contra a amostra ou contra a medicao da T-018b. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Erro sinalizado no evento terminal vira `:recusa`, e sessao normal vira `:fim_do_turno`, cada um com seu teste. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Os blocos `:uso_de_ferramenta` continuam presentes em `Resposta.blocos` — o registro do que a sessao fez nao pode desaparecer junto com a conclusao errada. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A bateria completa passa nos cinco estagios, `tipos` incluido. — `mix fabrica.ci` → **FALHOU**

```
bateria de verificacao — 5 estagios declarados

  ... formato: mix format --check-formatted
  ... compilar: mix compile --warnings-as-errors
  ... lint: mix credo --strict
  ... testes: mix test


  formato    ok        2.8s
  compilar   ok        2.7s
  lint       ok        7.3s
  testes     FALHOU   24.6s


Running ExUnit with seed: 432760, max_cases: 16

.....................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................

  1) test escape 3: link que aponta para fora recusa link cujo DESTINO esta fora (Fabrica.Ferramentas.ConfinamentoTest)
     test/fabrica/ferramentas/confinamento_test.exs:141
     ** (MatchError) no match of right hand side value:

         {:error, :sem_link}

     code: assert :ok = criar_link(fora, atalho),
     stacktrace:
       test/fabrica/ferramentas/confinamento_test.exs:144: (test)

.................................................................................................
Finished in 20.0 seconds (14.0s async, 6.0s sync)
17 doctests, 822 tests, 1 failure

bateria REPROVOU no estagio `testes` (codigo 2); 1 estagio(s) nem chegaram a rodar
```


Graus de prova: 6 executado(s), 0 para julgamento (de 6).

### Passada mecânica (sem modelo)

- [executado] Um stream REAL (a amostra salva pela T-018b), com `tool_use` no meio e sessao concluida, produz `motivo_parada: :fim_do_turno` — e nao `:uso_de_ferramenta`. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU**
- [executado] Nenhuma entrada possivel faz este adaptador devolver `:uso_de_ferramenta` — ha teste que varre os casos (com e sem `tool_use`, com e sem evento terminal) e afirma a ausencia. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Teto de turnos do CLI vira `:teto_de_voltas` (e nao `:teto_de_tokens`), com a grafia do `subtype` conferida contra a amostra ou contra a medicao da T-018b. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Erro sinalizado no evento terminal vira `:recusa`, e sessao normal vira `:fim_do_turno`, cada um com seu teste. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Os blocos `:uso_de_ferramenta` continuam presentes em `Resposta.blocos` — o registro do que a sessao fez nao pode desaparecer junto com a conclusao errada. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A bateria completa passa nos cinco estagios, `tipos` incluido. — `mix fabrica.ci` → **PASSOU**

Graus de prova: 6 executado(s), 0 para julgamento (de 6).

### Passada mecânica (sem modelo)

- [executado] Um stream REAL (a amostra salva pela T-018b), com `tool_use` no meio e sessao concluida, produz `motivo_parada: :fim_do_turno` — e nao `:uso_de_ferramenta`. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU**
- [executado] Nenhuma entrada possivel faz este adaptador devolver `:uso_de_ferramenta` — ha teste que varre os casos (com e sem `tool_use`, com e sem evento terminal) e afirma a ausencia. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Teto de turnos do CLI vira `:teto_de_voltas` (e nao `:teto_de_tokens`), com a grafia do `subtype` conferida contra a amostra ou contra a medicao da T-018b. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Erro sinalizado no evento terminal vira `:recusa`, e sessao normal vira `:fim_do_turno`, cada um com seu teste. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Os blocos `:uso_de_ferramenta` continuam presentes em `Resposta.blocos` — o registro do que a sessao fez nao pode desaparecer junto com a conclusao errada. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A bateria completa passa nos cinco estagios, `tipos` incluido. — `mix fabrica.ci` → **PASSOU**

Graus de prova: 6 executado(s), 0 para julgamento (de 6).


