---
id: T-018e
titulo: O motivo de parada do ClaudeCLI sai do evento terminal, e nao do stream inteiro
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-018b, T-003a]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs]
tentativas: 0
criada: 2026-09-01
atualizada: 2026-09-01
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


## Verificacao


## Conformidade


## Revisao
