---
id: T-022a
titulo: A bateria completa esta vermelha desde a T-019 — os 8 erros do Dialyzer
projeto: fabrica-v2
versao: v0.3
status: backlog
prioridade: alta
dependencias: [T-022]
areas: [lib/fabrica/ferramentas/comando.ex, lib/fabrica/operario/claude_cli.ex, lib/fabrica/ferramentas/registrar_resultado.ex, lib/fabrica/tarefas/transicao.ex, mix.exs, _gestao/GUIA.md]
tentativas: 0
criada: 2026-08-31
atualizada: 2026-08-31
---

## Objetivo
Devolver `mix fabrica.ci` ao verde, e fechar a brecha de processo que deixou a bateria
vermelha por uma tarefa inteira sem ninguem notar.

## Contexto

**Como foi descoberto.** Ao fechar a T-022 rodei `mix fabrica.ci` completo e o estagio
`tipos` reprovou com 8 erros. `git stash` no meu trabalho e nova rodada: **7 ja existiam no
HEAD.** A T-018 registra em Notas que *"o `mix fabrica.ci` completo continua verde"*; a T-019
so registra `mix verificar`, que **nao inclui `tipos`** — e por isso a regressao passou.

**A brecha e a parte que mais importa, e e a forma conhecida do defeito desta fabrica.** O
`ci.json` declara `tipos` como o unico estagio `rapido: false` e diz, por escrito, que ele
*"PODE ser pulado no dia a dia e NAO pode ser removido"*. Na pratica ele foi pulado em todas
as tarefas e ninguem o rodou de volta. **Sensor sem atuador, na forma "a verificacao existe e
o laco nao a le".** Consertar so os 8 erros deixa a brecha aberta: em duas tarefas ela repete.

**Nenhum dos 8 e bug de execucao** — a suite passa e passava. Sao tres grupos:

### Grupo 1 — retorno nao casado (5, em `comando.ex`, da T-013)

    comando.ex:95:12   File.rm(script)
    comando.ex:102:16  File.rm(saida)
    comando.ex:103:16  File.rm(erro)
    comando.ex:237:10  File.rm(caminho)
    comando.ex:177     if pid, do: ArvoreProcessos.encerrar(pid)

`unmatched_return`: `File.rm/1` devolve `:ok | {:error, posix}` e o retorno e descartado. Nao
e engano — a limpeza de temporario e mesmo best-effort. O que falta e **dizer isso ao
compilador** (`_ = File.rm(...)`) em vez de deixar implicito. O `if` sem `else` da linha 177
devolve `nil` num ramo; mesma historia.

Vale perguntar, ao consertar: **se apagar o temporario falhar, alguem deveria saber?** Se a
resposta for sim, o conserto e registrar, nao silenciar.

### Grupo 2 — opacidade de `MapSet` dentro de `Ecto.Multi` (2)

    registrar_resultado.ex:66  (T-016)
    transicao.ex:111           (T-022)

`call_without_opaque`. `Ecto.Multi.t()` carrega `names: MapSet.t()`, que e opaco; o Dialyzer
enxerga o literal `%MapSet{map: %{}}` que `Multi.new()` produz e reclama. **E falso positivo
conhecido do par Dialyzer + Ecto.Multi**, nao defeito do codigo.

Ja foi tentado, na T-022, e **nao resolve**: extrair o corpo para uma funcao com
`@spec (Multi.t(), ...) :: Multi.t()`. O aviso apenas migra para o ponto onde `Multi.new()`
e passado. Restam duas saidas honestas — `flags: [:no_opaque]` em `mix.exs`, ou um arquivo de
`ignore_warnings` com estas duas entradas nominais. **Prefira o segundo**: ele cala estes
dois casos e continua acusando qualquer opacidade nova, enquanto a flag desliga a checagem no
projeto inteiro. Seja qual for, registre a escolha no GUIA — a proxima pessoa vai reencontrar
o aviso e precisa saber que ja foi decidido.

### Grupo 3 — spec estreito demais (1, `claude_cli.ex:57`, da T-018)

    claude_cli.ex:57:39  call — The function call interpretar will not succeed.

Este e o unico com cheiro de defeito de verdade, e o diagnostico ja esta feito:

    @spec interpretar(%{stdout: String.t(), stderr: String.t()}) :: ...

declara um mapa de **exatamente duas chaves**, e `Comando.rodar_separado/3` devolve
`resultado()`, que tem mais campos (`motivo`, `codigo`, ...). Em execucao funciona — a
clausula casa `%{stdout: _, stderr: _}` e ignora o resto —, mas o spec mente, e o Dialyzer
esta certo ao dizer que a chamada, como tipada, nao sucede.

O conserto e o spec, e ele exige uma decisao pequena: `interpretar/1` deve declarar que
aceita `Comando.resultado()` (acoplando os dois modulos) ou um mapa aberto
(`%{:stdout => String.t(), :stderr => String.t(), optional(atom()) => term()}`)? **A segunda
mantem o `Operario.ClaudeCLI` testavel sem o `Comando`**, que foi por que `interpretar/1` e
publica.

## Criterios de aceite
- [ ] `mix fabrica.ci` passa nos cinco estagios, `tipos` incluido.
      `verificar: mix fabrica.ci`
- [ ] Os 5 `unmatched_return` de `comando.ex` sao tratados explicitamente, e o arquivo diz numa linha por que o retorno da limpeza pode ser descartado.
      `verificar: mix dialyzer`
- [ ] A opacidade do `Ecto.Multi` e silenciada de forma NOMINAL (as duas entradas), e nao desligando a checagem no projeto; a decisao esta no GUIA.
      `verificar: mix dialyzer`
- [ ] O spec de `interpretar/1` aceita o que `Comando.rodar_separado/3` realmente devolve, com teste que passa um resultado completo do `Comando` (e nao um mapa de duas chaves montado a mao).
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] A brecha de processo esta fechada: rodar a bateria COMPLETA e parte de fechar tarefa, e isso esta escrito onde quem fecha tarefa vai ler.
      `verificar: mix fabrica.ci`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao

## Verificacao

## Conformidade

## Revisao
