---
id: T-100
titulo: "O probe do marco da v0.2 volta a rodar no Windows: a tarefa do probe não precisa de shell, então o agente sobe sem Bash"
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-099]
areas: [priv/probes/marco_v02_agente.exs, lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs]
tentativas: 1
criada: 2026-10-07
atualizada: 2026-10-07
---

## Objetivo
`mix run priv/probes/marco_v02_agente.exs` volta a dar `PROBE OK` na máquina Windows de origem, sem
desligar nem afrouxar o sandbox de quem tem shell: o agente do probe sobe com um vocabulário que
NÃO contém Bash (a tarefa dele é só escrever um arquivo), e por isso não precisa do sandbox.

## Contexto
Rodado pelo orquestrador em 2026-10-07 (HEAD `88c92aa`, Windows 10, `claude` da máquina): o probe
REPROVOU nas três afirmações porque o agente não subiu —

    o claude recusou subir: o papel tem Bash e o sandbox exigido nao esta disponivel (nenhum comando
    rodou, nada foi gasto). causa: Error: sandbox required but unavailable: sandbox is enabled but
    the Windows sandbox is not active on this session (feature gate off)

É o comportamento CERTO da T-090/D-016 (fail-closed: papel com Bash não sobe sem sandbox). O
problema é que o probe pede o vocabulário do papel `construtor` (que tem `rodar` → `Bash`), quando a
tarefa dele — escrever `resultado.txt` com uma senha — só precisa de escrita de arquivo, que é
auditada pelo `Confinamento` e não depende do sandbox. Este probe é a DEMONSTRAÇÃO do marco da E3
("um agente resolve uma tarefa real com o custo gravado") e precisa rodar na máquina onde ele é
apresentado.

Caminho provável: o probe passa ao `ClaudeCLI` um vocabulário sem `rodar` (menor privilégio) — veja
como `linha/1` decide `--tools`, `--allowedTools "Bash"` e o `--settings` do sandbox a partir do
papel/vocabulário. Se hoje só dá para escolher por PAPEL, o conserto mínimo é aceitar um vocabulário
explícito (com teste), sem criar chave nenhuma que desligue o sandbox para quem tem Bash.
**Proibido:** qualquer caminho em que um vocabulário COM Bash suba sem o bloco de sandbox.

## Critérios de aceite
- [ ] O probe roda no Windows e imprime `PROBE OK` (as três afirmações `ok`); a saída fica em
      `_gestao/evidencias/T-100-probe.txt`. Consome ~27 mil tokens da cota (autorizado).
      `verificar: mix run priv/probes/marco_v02_agente.exs`
- [ ] Teste prova que um vocabulário sem `rodar` sobe sem `--allowedTools "Bash"` e sem o bloco de
      sandbox, e que todo vocabulário COM `rodar` continua levando o bloco (falha se alguém afrouxar).
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução
- 2026-10-07 (orquestrador): passa a depender da T-099 — no Windows a suíte cai em 2 testes de link do confinamento, e toda verificação desta tarefa reprovaria por isso (reprovação falsa). Volta a `pronta` sozinha quando a T-099 concluir.

### Ciclo 1
Caminho escolhido: o mínimo que o Contexto apontava — `Fabrica.Operario.Requisicao` ganhou um
campo novo, `vocabulario: [String.t()] | nil` (default `nil`), que **substitui** o vocabulário do
`papel` quando presente (nunca soma a ele). `Fabrica.Agente.Estado` ganhou o mesmo campo e
`Agente.Laco.requisicao/2` o repassa. Nenhuma chave de configuração nova, nenhum jeito de um
vocabulário com `rodar` escapar do bloco de sandbox: `linha/1` continua decidindo
`--allowedTools "Bash"` e `--settings <sandbox>` a partir da lista JÁ TRADUZIDA para o CLI
(`ferramentas`), não do papel nem do vocabulário cru — então a trava vale igual para os dois
caminhos (papel ou vocabulário explícito).

Arquivos tocados:
- `lib/fabrica/operario.ex` — campo `vocabulario` em `Requisicao`.
- `lib/fabrica/agente/estado.ex` — campo `vocabulario` em `Estado` (default `nil`).
- `lib/fabrica/agente/laco.ex` — `requisicao/2` repassa `estado.vocabulario`.
- `lib/fabrica/operario/claude_cli.ex` — nova função pública `ferramentas_cli_do_vocabulario/1`
  (a mesma tradução de `ferramentas_cli/1`, direto de uma lista de nomes internos, sem passar
  pelo `Catalogo.do_papel/1`); `ferramentas_cli/1` passou a chamá-la; `linha/1` decide a lista de
  ferramentas por `ferramentas_da_requisicao/1` (vocabulário explícito se presente, senão o
  papel, como antes). `@moduledoc` documenta a seção nova.
- `priv/probes/marco_v02_agente.exs` — `Laco.rodar/1` passa `vocabulario: ["escrever"]` (em vez
  de herdar o papel default `"construtor"`, que levaria `rodar` → Bash → o bloco de sandbox que
  não existe nesta máquina Windows). Comentário novo explica o porquê.
- `test/fabrica/operario/claude_cli_test.exs` — describe novo `"vocabulario EXPLICITO substitui
  o do papel (T-100)"`: `ferramentas_cli_do_vocabulario/1` isolada; vocabulário sem `rodar` (com
  papel `"construtor"`, que TEM Bash) não leva `--allowedTools` nem `--settings`; vocabulário COM
  `rodar` (com papel `"revisor"`, que NÃO tem Bash) continua levando os dois, com o JSON exato do
  sandbox; sem vocabulário (`nil`) o comportamento de sempre (vindo do papel) não muda.

**Reproduzir a prova do probe (consome cota real — autorizado pelo critério):**
`mix run priv/probes/marco_v02_agente.exs` — saída completa em `_gestao/evidencias/T-100-probe.txt`
(`PROBE OK`, as três afirmações `ok`; rodado em 2026-10-07 contra o `claude` 2.1.293 nesta máquina
Windows, ~17 mil tokens somados nas duas sondas de cota + a volta do agente).

**Reproduzir o teste novo:** `mix test test/fabrica/operario/claude_cli_test.exs`

**Reproduzir a bateria completa:** `mix fabrica.ci` — 6 estágios, todos `ok` (postgres confirmado
de pé antes, com `pg_isready`).

**Commit:** `f2a4751`


## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] O probe roda no Windows e imprime `PROBE OK` (as três afirmações `ok`); a saída fica em `_gestao/evidencias/T-100-probe.txt`. Consome ~27 mil tokens da cota (autorizado). — `mix run priv/probes/marco_v02_agente.exs` → **PASSOU**
- [executado] Teste prova que um vocabulário sem `rodar` sobe sem `--allowedTools "Bash"` e sem o bloco de sandbox, e que todo vocabulário COM `rodar` continua levando o bloco (falha se alguém afrouxar). — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU**
- [executado] Bateria completa verde. — `mix fabrica.ci` → **PASSOU**

Graus de prova: 4 executado(s), 0 para julgamento (de 4).



## Conformidade

Conformidade: cumpre

- Critério 1 (`PROBE OK`, 3 afirmações `ok`) → `_gestao/evidencias/T-100-probe.txt`: termina em
  "PROBE OK — marco 1 confirmado contra o claude real", com as três seções `[ok]`.
- Critério 2 (teste do vocabulário) → `test/fabrica/operario/claude_cli_test.exs`, describe
  `"vocabulario EXPLICITO substitui o do papel (T-100)"`: um caso prova que vocabulário sem
  `rodar` sobe sem `--allowedTools`/`--settings`/`sandbox`; o par negativo prova que vocabulário
  COM `rodar` (mesmo com papel `"revisor"`, que não tem Bash no catálogo) continua levando os
  dois, com o JSON exato do sandbox; um terceiro prova que `vocabulario: nil` preserva o
  comportamento de sempre (vindo do papel).
- Critério 3 (bateria completa) → já registrado na seção Verificação (passada mecânica), os 4
  itens `PASSOU`.
- Objetivo: cumprido no espírito, não só na letra. Conferi `lib/fabrica/operario/claude_cli.ex`
  (`linha/1`, `aprovacao_do_shell/1`, `sandbox_do_shell/1`): os dois decidem sobre a lista JÁ
  TRADUZIDA que `ferramentas_da_requisicao/1` produz — vocabulário explícito ou papel —, nunca
  sobre o papel/vocabulário cru. Não há caminho em que um vocabulário com `rodar` suba sem o
  bloco de sandbox; o "Proibido" do Contexto está respeitado e testado nos dois sentidos.

**Nota de processo (não reprova):** `areas:` desta tarefa declara só
`priv/probes/marco_v02_agente.exs`, `lib/fabrica/operario/claude_cli.ex` e
`test/fabrica/operario/claude_cli_test.exs`. O diff necessariamente tocou mais três arquivos —
`lib/fabrica/operario.ex`, `lib/fabrica/agente/estado.ex` e `lib/fabrica/agente/laco.ex` — para o
`vocabulario` chegar do `Laco.rodar/1` à `Requisicao` que o `ClaudeCLI.linha/1` lê. É o mínimo
necessário para o único Objetivo da tarefa (o Contexto já antecipava "se hoje só dá para
escolher por papel, o conserto mínimo é..."), e está 100% disclosed nas Notas de execução
("Arquivos tocados"). Mas `areas:` não foi ampliado para refletir isso — ver Revisão.

## Revisão

[menor] `_gestao/tarefas/T-100-probe-v02-sem-shell.md` (frontmatter `areas`) — o diff tocou
`lib/fabrica/operario.ex`, `lib/fabrica/agente/estado.ex` e `lib/fabrica/agente/laco.ex`, nenhum
declarado em `areas`. Cenário concreto: se esta tarefa corresse sob
`Fabrica.Publicacao.Git.commitar/3` (o guarda que a própria `fabrica-v2` oferece para os
projetos que ela governa — `lib/fabrica/publicacao/git.ex`), o commit seria recusado por
`{:erro, {:alteracoes_fora_das_areas, [...]}}` e a tarefa cairia no loop já documentado em
memória de sessão (`commit-guard-out-of-area-loop`). Não reprova aqui porque o trabalho é
plumbing mínimo e necessário para o Objetivo declarado, e foi totalmente disclosed nas Notas —
não é escopo estranho à tarefa. Recomendo ao orquestrador ampliar `areas:` para os três arquivos
antes de fechar, para o registro ficar fiel ao que foi feito.

Fora isso, aprovado: li `lib/fabrica/operario/claude_cli.ex` inteiro na região tocada
(`ferramentas_cli/1`, `ferramentas_cli_do_vocabulario/1`, `linha/1`, `ferramentas_da_requisicao/1`,
`aprovacao_do_shell/1`, `sandbox_do_shell/1`) — `ferramentas_cli/1` preserva o comportamento
antigo (as chaves de `Catalogo.do_papel/1` já são únicas; o `Enum.uniq()` novo em
`ferramentas_cli_do_vocabulario/1` é no-op para esse caminho). `Estado.novo/1` e
`Operario.Requisicao` usam `struct!/2`/`defstruct`, então o campo novo com default `nil` não
quebra nenhum chamador existente. Sem bug de correção, segurança ou integração encontrado no
diff.

