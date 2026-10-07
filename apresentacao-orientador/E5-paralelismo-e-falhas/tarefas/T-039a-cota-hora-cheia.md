---
id: T-039a
titulo: "A parede de cota le a hora cheia sem minutos (resets 9am)"
projeto: fabrica-v2
versao: v0.4
status: concluida
prioridade: media
dependencias: [T-039]
areas: [lib/fabrica/cota.ex, test/fabrica/cota_test.exs]
tentativas: 1
criada: 2026-09-13
atualizada: 2026-09-26
---

## Objetivo
`Fabrica.Cota.horario_de_reabertura/1` reconhecer o horario de reabertura quando o CLI anuncia a
hora cheia, sem minutos — `resets 9am (America/Sao_Paulo)` —, em vez de devolver `nil`.

## Contexto
**Achado da retrospectiva da T-035 (2026-09-13), medido contra mensagens reais.** Os logs das
rodadas do painel da v1 (`painel/dados/jobs/*.log.jsonl`, 03 a 12/09) tem 18 mensagens de cota do
`claude`, todas no formato `You've hit your session limit · resets <hora> (America/Sao_Paulo)`.
17 trazem `H:MMam/pm`; UMA traz a hora cheia: `resets 9am (America/Sao_Paulo)`.

Rodado contra o parser atual (`mix run --no-start`), em 13/09:

    "resets 2:20am (America/Sao_Paulo)"  => ~U[2026-09-14 05:20:00Z]   ok
    "resets 9:00am (America/Sao_Paulo)"  => ~U[2026-09-13 12:00:00Z]   ok
    "resets 9am (America/Sao_Paulo)"     => nil                        FALHA
    "resets 12pm (America/Sao_Paulo)"    => nil                        FALHA

A causa e o `@regex_horario_humano`, que exige `:MM`. Com `nil`, a parede cai no recuo
exponencial (1 min, dobrando ate 1 h) em vez de dormir ate a hora anunciada: nao trava, mas tenta
de novo contra a parede varias vezes, e cada tentativa pode custar um despacho.

O caminho principal do `ClaudeCLI` le o evento estrutural (`resetsAt`, epoch) e nao e afetado. O
texto humano e o fallback — e e justamente o fallback que tem de aguentar o formato real.

**Escopo:** so o parser e o teste. Aceite `H` e `H:MM`, com e sem `am/pm`, com e sem fuso entre
parenteses. Cuidado com `12am` (meia-noite) e `12pm` (meio-dia). Use as quatro strings acima como
casos de teste, copiadas literalmente.

## Criterios de aceite
- [ ] `horario_de_reabertura/1` devolve um `DateTime` para `resets 9am (America/Sao_Paulo)` e para `resets 12pm (America/Sao_Paulo)`, com `12pm` = meio-dia.
      `verificar: mix test test/fabrica/cota_test.exs`
- [ ] Os formatos com minutos que ja passavam continuam dando o mesmo horario.
      `verificar: mix test test/fabrica/cota_test.exs`

## Notas de execucao
Criada pelo orquestrador em 2026-09-13 como tarefa corretiva pontual (causa raiz unica, escopo de
um arquivo). Comando de `verificar:` copiado da T-039, dona do arquivo.

### Ciclo 1
Teste-primeiro: adicionei 4 casos em `test/fabrica/cota_test.exs` (describe "hora cheia, sem
minutos (T-039a)") — as duas strings que falhavam (`resets 9am (America/Sao_Paulo)`,
`resets 12pm (America/Sao_Paulo)`) e 2 de regressao para os formatos com minutos que ja
passavam (`resets 2:20am...`, `resets 9:00am...`). Rodei e vi vermelho nos 2 casos novos
(`nil` em vez de `DateTime`), 19 verdes.

Causa confirmada: `@regex_horario_humano` em `lib/fabrica/cota.ex` exigia `:MM` sem tornar o
grupo opcional. Corrigido para `(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?\s*(?:\(([^)]+)\))?` —
o grupo de minutos agora e opcional. Quando o regex casa sem minutos, `Regex.run/2` devolve
`""` (nao `nil`) para o grupo nao participante; adicionei `minuto_ou_zero/1` para trocar
`""` por `"0"` antes de `Integer.parse/1`, que exigia o formato `{n, ""}`.

Rodei de novo: 21 testes, 0 falhas. Conferi manualmente (`mix run --no-start -e ...`) as 5
strings do achado da retrospectiva, incluindo o caso de borda `12am` (meia-noite, nao citado
nos criterios mas mesmo caminho de codigo): todas devolvem `DateTime`, nenhuma `nil`.
`mix credo lib/fabrica/cota.ex test/fabrica/cota_test.exs` — 0 issues.

Nao toquei no caminho estrutural (`resetsAt`/epoch) nem em `ClaudeCLI`/`MessagesAPI` — fora
do escopo desta tarefa.

**Reproduzir:** `mix test test/fabrica/cota_test.exs`

**Commit:** `752cd67`

## Verificação

### Ciclo 2

- **[PASSOU] [executado] Critério 1: `horario_de_reabertura/1` devolve um `DateTime` para `resets 9am (America/Sao_Paulo)` e para `resets 12pm (America/Sao_Paulo)`, com `12pm` = meio-dia.**
  Comando: `mix test test/fabrica/cota_test.exs`
  Saída: 21 tests, 0 failures

- **[PASSOU] [executado] Critério 2: Os formatos com minutos que ja passavam continuam dando o mesmo horario.**
  Comando: `mix test test/fabrica/cota_test.exs` (mesmo comando acima)
  Saída: 21 tests, 0 failures (todos os casos incluindo regressão para "resets 2:20am..." e "resets 9:00am...")

Suíte completa: 1146 tests, 1 failure (busca_test.exs:242, fora do escopo da T-039a — T-063)
Mutação: regex revertida para obrigatória `:MM` → testes de hora cheia **FALHARAM** (retornaram `nil` em vez de `DateTime`) ✓
Restaurada a regex corrigida → testes **voltaram a PASSAR** ✓

Graus de prova: 3 executado(s), 0 para julgamento (de 3).

## Conformidade

Conformidade: cumpre

- `horario_de_reabertura/1` devolve `DateTime` para `resets 9am (America/Sao_Paulo)` e `resets 12pm (America/Sao_Paulo)`, com `12pm` = meio-dia → `lib/fabrica/cota.ex:83` (regex com grupo de minutos opcional) + `lib/fabrica/cota.ex:207-209` (`minuto_ou_zero/1`); provado por `test/fabrica/cota_test.exs:155-171` (2 casos novos) e confirmado por execução própria (`mix test test/fabrica/cota_test.exs` → 21 tests, 0 failures).
- Formatos com minutos que já passavam continuam dando o mesmo horário → regressão explícita em `test/fabrica/cota_test.exs:173-188` (`2:20am`, `9:00am`), mesmo resultado de antes.
- Escopo respeitado: só `lib/fabrica/cota.ex` e `test/fabrica/cota_test.exs` (bate com `areas:`); Notas de execução registram explicitamente que o caminho estrutural (`resetsAt`/epoch) e `ClaudeCLI`/`MessagesAPI` não foram tocados.
- Caso de borda `12am` (meia-noite), citado no Contexto mas fora dos Critérios formais, foi conferido manualmente pelo executor (`hora_24(12, "am") -> 0`, pré-existente) — não é objeto de teste automatizado, mas o código que o resolve não foi alterado por esta tarefa, então não é pendência dela.
- Tarefa sem componente de UI; não se aplica prova visual.

## Revisao

Aprovado sem ressalvas. Verifiquei:

- `git show 752cd67`: mudança mínima e cirúrgica — regex `(\d{1,2})(?::(\d{2}))?...` torna o grupo de minutos opcional; `minuto_ou_zero/1` converte a string vazia (grupo não participante, não `nil` — comportamento correto de `Regex.run/2` em Elixir) em `"0"` antes de `Integer.parse/1` em `montar_horario_humano/4`, que exige `{n, ""}`.
- Contagem de grupos capturados preservada (4), então o `case` `[_completo, hora, minuto, meridiano, fuso]` em `horario_humano/1` continua correto.
- `hora_24/2` (não tocado por este diff) já tratava `12` + `am`/`pm` como meia-noite/meio-dia antes desta tarefa — a correção não precisou e não tentou reimplementar essa lógica.
- Rodei `mix test test/fabrica/cota_test.exs` eu mesmo: 21 tests, 0 failures, confirmando o que a Verificação (Ciclo 2) já registrou.
- Sem efeito em outros consumidores: `horario_humano/1` é privada, só usada como fallback dentro do próprio módulo; caminho estrutural (`resetsAt`) intocado.
- [menor] O testador removeu os cabeçalhos `## Conformidade` e `## Revisao` ao preencher a Verificação (Ciclo 2) — eu os recriei aqui; não afeta o veredito, mas é um ponto de atenção de processo para o próximo ciclo do template.

