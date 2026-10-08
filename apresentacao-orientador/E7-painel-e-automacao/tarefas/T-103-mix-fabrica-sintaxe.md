---
id: T-103
titulo: "`mix fabrica.sintaxe <arquivo>` confere sintaxe Elixir sem executar o arquivo"
projeto: fabrica-v2
versao: v1.0
status: em-execucao
prioridade: alta
dependencias: []
areas: [lib/mix/tasks/fabrica.sintaxe.ex, test/mix/sintaxe_test.exs]
tentativas: 2
criada: 2026-10-07
atualizada: 2026-10-08
ultima-reprovacao: mecanica
---

## Objetivo
Existe um comando mix que confere se um arquivo `.ex`/`.exs` é sintaticamente válido **sem
executar seu conteúdo** — para que um `verificar:` possa checar scripts que consomem rede ou
cota real (as sondas em `priv/probes/`) sem rodá-los.

## Contexto
Nasceu do impedimento da T-092 (Ciclo 2): o critério original usava
`verificar: mix run --no-start -e 'Code.string_to_quoted!(File.read!("..."))'`, e esse padrão é
**inexecutável nesta fábrica, em qualquer tarefa que o repita** — causa raiz confirmada pelo
construtor com `mix.exs` no lugar do arquivo original (mesmo erro).

A causa: `Fabrica.Criterios.Allowlist.avaliar/1` quebra o comando declarado por
`String.split(bruto, ~r/\s+/)` — **sem respeitar aspas** — antes de entregar o argv a
`Fabrica.Ferramentas.Comando.rodar/4`, que nunca passa por shell (`Port.open({:spawn_executable,
...})`). Um `-e '<expressão com espaços>'` chega como vários argumentos soltos, e as aspas
simples (sintaxe de shell POSIX) chegam como caracteres LITERAIS — no Windows, o `cmd.exe`
chamado para `mix.bat` trava no parêntese desencontrado.

O próprio `lib/fabrica/criterios/allowlist.ex` já documenta a saída, no comentário acima de
`@perigoso`: "um critério precisa de UM comando, não de um script: quem precisa de script
escreve um alias no projeto e chama o alias, e aí o script fica versionado e revisável em vez de
escondido numa linha de frontmatter." Esta tarefa cria exatamente esse alias — como mix task
dedicada, não como alias de `mix.exs`, porque precisa receber o caminho do arquivo como argumento
posicional dinâmico.

Não usar `Code.string_to_quoted!/1` direto num `-e` combinado com aspas simples em NENHUMA tarefa
futura — é esse combo que quebra. Depois desta tarefa, o padrão correto para "confirmar que um
arquivo parseia sem rodá-lo" é `mix fabrica.sintaxe <caminho>`, dois argumentos simples, sem
aspas e sem `-e`.

## Critérios de aceite
- [ ] `mix fabrica.sintaxe priv/probes/confinamento_cli.exs` (arquivo sintaticamente válido)
      imprime confirmação e sai com código 0 — sem chamar o `claude` real nem gastar cota.
      `verificar: mix fabrica.sintaxe priv/probes/confinamento_cli.exs`
- [ ] Um arquivo-fixture com erro de sintaxe proposital faz a task sair com código diferente de
      0 e a mensagem cita a falha de sintaxe (sem stacktrace bruto de `Code.string_to_quoted!/1`
      sem contexto) — provado por teste automatizado, não à mão.
      `verificar: mix test test/mix/sintaxe_test.exs`
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução

### Ciclo 1

Criada `Mix.Tasks.Fabrica.Sintaxe` (`lib/mix/tasks/fabrica.sintaxe.ex`), auto-contida (sem
módulo auxiliar em `lib/fabrica/`, para não sair das `areas` declaradas): lê o arquivo, chama
`Code.string_to_quoted!/2` com `file: caminho` dentro de um `try/rescue`, e trata
`SyntaxError`/`TokenMissingError` com `Exception.message/1` — que já formata arquivo:linha:coluna
com o trecho ofensivo, sem stacktrace cru do parser. Confirmado no Elixir 1.19.4 (versão deste
projeto) que `Code.string_to_quoted/2` por si só devolve `{:error, {[line: _, column: _, ...],
descricao, token}}` — o formato de meta virou keyword list nesta versão — então usar a variante
`!` + `Exception.message/1` evita remontar essa tupla à mão e dá a MESMA mensagem que o compilador
mostraria, sem o `** (SyntaxError)` nem o caminho do `lib/elixir` do próprio parser.

Arquivo inexistente/ilegível: `File.read/1` tratado separadamente, mensagem com
`:file.format_error/1` (sem exceção crua), código de saída 1.

Sucesso: imprime `sintaxe valida: <caminho>` em `Mix.shell().info`, sai 0 (padrão do Mix quando
`run/1` retorna normalmente).

**Reproduzir:**
```
mix fabrica.sintaxe priv/probes/confinamento_cli.exs   # codigo 0, "sintaxe valida: ..."
mix test test/mix/sintaxe_test.exs                      # 5 testes, 0 falhas
```

Teste automatizado (`test/mix/sintaxe_test.exs`) cobre: arquivo válido (fixture + a sonda real
`priv/probes/confinamento_cli.exs`, sem executá-la), arquivo com erro de sintaxe proposital
(`{:shutdown, 1}` capturado com `catch_exit/1`, mensagem cita o nome do arquivo e NÃO contém
`** (SyntaxError)`/`** (TokenMissingError)`/caminho do `lib/elixir`), arquivo inexistente, e
argumentos inválidos (`Mix.Error`). Verifiquei manualmente pela CLI (fora do teste) os mesmos três
casos — válido, inválido, inexistente — com código de saída real do processo.

`mix format --check-formatted` e `mix credo --strict` rodados nos dois arquivos tocados: sem
pendência.

**Commit:** `a6067a9`


## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] `mix fabrica.sintaxe priv/probes/confinamento_cli.exs` (arquivo sintaticamente válido) imprime confirmação e sai com código 0 — sem chamar o `claude` real nem gastar cota. — `mix fabrica.sintaxe priv/probes/confinamento_cli.exs` → **PASSOU**
- [executado] Um arquivo-fixture com erro de sintaxe proposital faz a task sair com código diferente de 0 e a mensagem cita a falha de sintaxe (sem stacktrace bruto de `Code.string_to_quoted!/1` sem contexto) — provado por teste automatizado, não à mão. — `mix test test/mix/sintaxe_test.exs` → **PASSOU**
- [executado] Bateria completa verde. — `mix fabrica.ci` → **FALHOU**

```
bateria de verificacao — 6 estagios declarados

  ... formato: mix format --check-formatted
  ... compilar: mix compile --warnings-as-errors
  ... lint: mix credo --strict
  ... testes: mix test
  ... tipos: mix dialyzer


  formato    ok        3.3s
  compilar   ok        3.1s
  lint       ok       12.1s
  testes     ok      117.9s
  tipos      FALHOU   19.5s


Finding suitable PLTs
Checking PLT...
[:asn1, :bandit, :compiler, :crypto, :db_connection, :decimal, :dns_cluster, :ecto, :ecto_sql, :eex, :elixir, :esbuild, :ex_unit, :fabrica, :file_system, :finch, :hpax, :inets, :jason, :kernel, :logger, :mime, :mint, :mix, :nimble_options, :nimble_pool, :oban, :ph
… (731 caracteres omitidos do meio) …
  ~c"c:/Users/enzoconsulo/Documents/Generic-Multi-Agents/projetos/fabrica-v2/_build/dev/lib/fabrica/ebin/Elixir.Fabrica.Tarefas.Area.beam",
   ~c"c:/Users/enzoconsulo/Documents/Generic-Multi-Agents/projetos/fabrica-v2/_build/dev/lib/fabrica/ebin/Elixir.Fabrica.Projetos.Fase.beam",
   ~c"c:/Users/enzoconsulo/Documents/Generic-Multi-Agents/projetos/fabrica-v2/_build/dev/lib/fabrica/ebin/Elixir.Fabrica.Criterios.beam",
   ~c"c:/Users/enzoconsulo/Documents/Generic-Multi-Agents/projetos/fabrica-v2/_build/dev/lib/fabrica/ebin/Elixir.Fabrica.Operario.Falso.beam",
   ...],
  ...
]
Total errors: 4, Skipped: 2, Unnecessary Skips: 0
done in 0m15.66s
lib/mix/tasks/fabrica.sintaxe.ex:32:10:unmatched_return
The expression produces a value of type:


  atom()
  | binary()
  | [any()]
  | number()
  | {_, _}
  | {atom() | {_, [any()], atom() | [any()]}, Keyword.t(), atom() | [any()]}


but this value is unmatched.

________________________________________________________________________________
lib/mix/tasks/fabrica.sintaxe.ex:40:8:no_return
Function arquivo_ilegivel/2 only terminates with explicit exception.
________________________________________________________________________________
done (warnings were emitted)
Halting VM with exit status 2

bateria REPROVOU no estagio `tipos` (codigo 2); 1 estagio(s) nem chegaram a rodar
```


Graus de prova: 4 executado(s), 0 para julgamento (de 4).
