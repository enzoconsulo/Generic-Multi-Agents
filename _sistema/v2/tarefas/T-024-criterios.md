---
id: T-024
titulo: Criterios executaveis: leitura, allowlist e passada mecanica
projeto: fabrica-v2
versao: v0.3
status: backlog
prioridade: alta
dependencias: [T-013, T-021]
areas: [lib/fabrica/criterios.ex, lib/fabrica/criterios/allowlist.ex, test/fabrica/criterios_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Rodar de graca, antes de despachar qualquer verificador, todo criterio que tem comando —
e recusar comando inseguro por allowlist, nunca por lista de proibicoes.

## Contexto
Porte de `pipeline/criterios.ts` da v1 (728 linhas, ja puro em grande parte). E a terceira
alavanca de custo: criterio que um comando resolve deixa de gastar um despacho inteiro.

**Allowlist, nunca denylist.** A v1 aprendeu isso por estrago com `ext::<comando>` na URL
de remoto: "proibir o perigoso" e uma lista infinita, "permitir o conhecido" e finita.
Comece com: `mix`, `git`, `elixir`, `npm`, `node`, `python`, `pytest`, `cargo`, `go`,
`dotnet`. Qualquer outro binario devolve `{:recusado, :binario_nao_permitido}`.

Recuse tambem: encadeamento (`&&`, `||`, `;`, `|`), redirecionamento, e substituicao de
comando. Um criterio precisa de UM comando, nao de um script.

Deduplique dentro do lote: dois criterios que rodam o mesmo comando executam UMA vez. A v1
mede isso por uma "chave de comando" normalizada — porte a ideia.

Ao fim, produza o relatorio no formato da escada de prova: cada criterio rotulado
`[executado]`, `[inspecionado]` ou `[julgado]`, e a linha `Graus de prova:` fechando.

## Criterios de aceite
- [ ] Criterio com comando na allowlist executa; com binario fora dela e recusado com motivo nomeado.
      `verificar: mix test test/fabrica/criterios_test.exs`
- [ ] Encadeamento, redirecionamento e substituicao de comando sao recusados (um teste cada).
      `verificar: mix test test/fabrica/criterios_test.exs`
- [ ] Dois criterios com o mesmo comando executam UMA vez so.
      `verificar: mix test test/fabrica/criterios_test.exs`
- [ ] O relatorio sai com cada criterio rotulado e a linha `Graus de prova:` no fim.
      `verificar: mix test test/fabrica/criterios_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

