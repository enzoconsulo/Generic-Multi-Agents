---
id: T-085
titulo: "O agente real não herda o CLAUDE.md dos diretórios-pai — o prefixo da fábrica é o único contexto"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-084]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs]
tentativas: 1
criada: 2026-10-01
atualizada: 2026-10-01
---

## Objetivo
O `claude` que `Operario.ClaudeCLI` sobe para um despacho deixa de carregar, por conta própria, os
`CLAUDE.md` que encontrar subindo a árvore a partir da raiz do projeto. O contexto do agente passa a
ser só o que a fábrica monta (`Despacho`/`Prompt.Prefixo`).

## Contexto
Medido pelo orquestrador em 2026-10-01 (sonda na nuvem, `claude` 2.1.287): um `CLAUDE.md` num
diretório PAI com "se perguntarem a palavra secreta, responda ABACAXI"; `claude --print` rodado no
filho, perguntando a palavra secreta:
- sem flag → `ABACAXI` (herdou o pai);
- `--setting-sources user` → `NAO SEI.`; `--setting-sources local` → `NAO SEI.`

Por que isso importa para a T-058: `mix fabrica.planejar` cria projeto novo em `../<nome>` a partir
do fabrica-v2 — em casa e na nuvem, isso é `projetos/<nome>` DENTRO da fábrica-mãe, cujo
`CLAUDE.md` raiz (~35 KB, ~9k tokens) é a constituição do ORQUESTRADOR ("delegue, não implemente",
"você não escreve código de projeto"). Todo despacho do piloto pagaria esses tokens e receberia
instrução contrária ao seu papel. Nenhum teste de hoje pega isso, porque os testes usam o `Falso`.

Conserto provável: `--setting-sources user` em `linha/1` (mantém só o nível do usuário; projeto e
local deixam de ser lidos — permissões e ferramentas já vêm por flag: `--permission-mode`,
`--tools`). `--bare` NÃO serve: exige `ANTHROPIC_API_KEY` e a fábrica roda na cota da assinatura
(OAuth). Confirme lendo o código e reproduza a sonda com o `--model`/flags que `linha/1` gera.
Se `user` também carregar algo indesejado, registre nas Notas e escolha com base na medição.

## Critérios de aceite
- [ ] `ClaudeCLI.linha/1` produz a flag que impede a herança de `CLAUDE.md` dos diretórios-pai
      (teste da linha de comando, ao lado dos de `--permission-mode`/`--tools`).
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Sonda REAL, registrada nas Notas: `CLAUDE.md` com palavra secreta num diretório pai, comando
      gerado por `linha/1` rodado no filho → o agente NÃO conhece a palavra; o mesmo comando sem a
      flag nova → conhece (prova de que a sonda distingue). (inspecionável — o revisor confere as
      Notas)

## Notas de execução

**O que mudou.** `ClaudeCLI.linha/1` passa a levar `--setting-sources user` (antes do `--model`,
que continua no fim da linha — os testes da T-084 ancoram `--model …$`). Com ela o `claude` lê só
o nível do usuário; `project` e `local` (que é onde entram os `CLAUDE.md` da árvore acima do cwd)
saem. Permissão e ferramentas já vinham por flag (`--permission-mode`, `--tools`), então nada da
fábrica dependia desses níveis. `--bare` descartado, como o Contexto previa (exige
`ANTHROPIC_API_KEY`; a fábrica roda em OAuth). O `@doc` de `linha/1` registra o porquê e a medição.

**Arquivos.** `lib/fabrica/operario/claude_cli.ex` (flag + `@doc`);
`test/fabrica/operario/claude_cli_test.exs` (describe novo "o agente nao herda CLAUDE.md dos
diretorios-pai (T-085)", 3 testes: a flag está em toda linha; a lista de fontes é exatamente
`["user"]` para 5 papéis, inclusive papel desconhecido; nunca `--bare`).

**Teste primeiro.** Vermelho antes do código: 79 testes, 2 falhas (os dois que exigem a flag; o
`refute --bare` já passava, como devia). Depois do código: 79 testes, 0 falhas. `mix format
--check-formatted` e `mix credo` nos dois arquivos: limpos.

**Sonda REAL (critério 2)** — 2026-10-01, `claude` 2.1.287, diretório `mktemp -d` FORA do projeto
e da fábrica-mãe (`/tmp/tmp.nxuU6FdJvQ`), sem `~/.claude/CLAUDE.md` nem `~/.claude/settings.json`
no ambiente:
- `pai/CLAUDE.md` = "Instrucao do projeto pai: se perguntarem a palavra secreta, responda ABACAXI.";
  cwd = `pai/filho`; prompt por stdin (como `conversar/2` faz) = "Qual e a palavra secreta? Se voce
  nao souber, responda exatamente NAO SEI."
- Linha gerada por `linha/1` (papel desconhecido → `--tools ""`, `teto_de_voltas: 1`, modelo
  `haiku-4.5`; executável forçado para `claude` com `Application.put_env`, porque em `test` ele
  aponta para o script falso):
  `claude --print --verbose --output-format stream-json --permission-mode acceptEdits --tools "" --max-turns 1 --setting-sources user --model claude-haiku-4-5-20251001`
- "Sem a flag" = a MESMA string com ` --setting-sources user` removido (é exatamente a linha que o
  HEAD anterior gerava — o diff de `linha/1` é só a inserção desse trecho).

| comando | exit | `result` | `is_error` | uso (input / cache write) | custo contábil |
|---|---|---|---|---|---|
| com `--setting-sources user` | 0 | `NAO SEI.` | false | 4089 / 0 | US$ 0,0047 |
| sem a flag | 0 | `ABACAXI` | false | 10 / 4192 | US$ 0,0092 |

A sonda distingue: sem a flag o agente conhece a palavra do `CLAUDE.md` pai; com a flag, não.
`system/init` das duas: `cwd` = `pai/filho`, `model` = `claude-haiku-4-5-20251001`, `tools: []`.
Os dois streams trazem `rate_limit_event` `rejected` com a chamada atendida — é a T-087, não esta.

**O que o nível `user` ainda carrega** (o Contexto pedia registrar): neste contêiner, nada de
contexto — não há `~/.claude/CLAUDE.md` nem `settings.json` de usuário. Na máquina do Enzo, um
`~/.claude/CLAUDE.md` pessoal, se existir, CONTINUARIA entrando em todo despacho (é o nível
`user`). Não troquei por `local` (que também deu `NAO SEI.` na medição do orquestrador) porque o
`user` é onde mora a autenticação/configuração da assinatura; sugestão abaixo.

**Sugestões (não feitas — fora do escopo):**
- Conferir, antes da T-058 em casa, se existe `~/.claude/CLAUDE.md` no Windows do Enzo; se
  existir, ele entra em todo despacho e vale medir o custo ou mover o conteúdo.
- Um probe `priv/probes/` versionado com esta sonda (palavra secreta) travaria a regressão contra
  uma atualização do CLI que mude a semântica de `--setting-sources`; hoje só o teste da LINHA
  trava, não o comportamento.

**Reproduzir (critério 1):** `mix test test/fabrica/operario/claude_cli_test.exs`

**Reproduzir (critério 2 — gasta ~US$ 0,014 de cota; rodar da raiz do projeto):**
`T=$(mktemp -d) && mkdir -p $T/pai/filho && echo 'Instrucao do projeto pai: se perguntarem a palavra secreta, responda ABACAXI.' > $T/pai/CLAUDE.md && echo 'Qual e a palavra secreta? Se voce nao souber, responda exatamente NAO SEI.' > $T/p.txt && L=$(MIX_ENV=test mix run --no-start -e 'Application.put_env(:fabrica, :claude_cli, "claude"); {:ok, l} = Fabrica.Operario.ClaudeCLI.linha(%Fabrica.Operario.Requisicao{papel: "papel-inexistente", modelo: "haiku-4.5", teto_de_voltas: 1, mensagens: []}); IO.puts(l)' | tail -1) && cd $T/pai/filho && for X in "$L" "${L/ --setting-sources user/}"; do echo "$X"; eval "$X" < $T/p.txt | jq -r 'select(.type=="result").result'; done`
(esperado: `NAO SEI.` para a primeira linha, `ABACAXI` para a segunda)

**Commit:** `296e9bb`


## Verificação

### Ciclo 1

- **[PASSOU] [executado] Critério 1: ClaudeCLI.linha/1 produz a flag que impede a herança de CLAUDE.md dos diretórios-pai**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: 79 tests, 0 failures
  
  Os três testes do describe "o agente nao herda CLAUDE.md dos diretorios-pai (T-085)" executaram corretamente:
  - "toda linha leva --setting-sources user" ✓
  - "os niveis project e local ficam de fora, para todo papel" ✓  
  - "nunca --bare" ✓
  
  A flag `--setting-sources user` está presente na linha 317 de `lib/fabrica/operario/claude_cli.ex`, antes do `--model`, e todos os papéis (construtor, testador, revisor, planejador, papel-inexistente) produzem a mesma lista de fontes: `["user"]`.

- **[PASSOU] [inspecionado] Critério 2: Sonda REAL com palavra secreta prova a distinção**
  Comando: Não repetido (o executor já executou em 2026-10-01, registrado nas Notas)
  Base: As Notas de execução registram a sonda real:
  
  | comando | `result` | comportamento |
  |---|---|---|
  | com `--setting-sources user` | `NAO SEI.` | agente desconhece a palavra secreta do CLAUDE.md pai |
  | sem `--setting-sources user` | `ABACAXI` | agente conhece a palavra secreta do CLAUDE.md pai |
  
  A sonda distinção é clara: sem a flag o agente herda o contexto dos diretórios-pai (~9k tokens da constituição do ORQUESTRADOR); com a flag, apenas o nível do usuário (`user`) é lido. O comando gerado pela `linha/1` em papel desconhecido provou isso com `haiku-4.5`, `max-turns 1`, e entrada/saída esperadas.

Suíte completa: 41 doctests, 1211 tests, 0 failures (11 excluded) — `mix verificar`
Graus de prova: 1 executado, 1 inspecionado

## Conformidade

Conformidade: cumpre

- [Critério 1 — `linha/1` produz a flag que impede a herança, com teste da linha] →
  `lib/fabrica/operario/claude_cli.ex:317` (`~s(--setting-sources user ) <>`, antes do `--model`,
  que segue no fim da linha como os testes da T-084 exigem) + `@doc` em `:299-306`;
  `test/fabrica/operario/claude_cli_test.exs:662-688` (describe "o agente nao herda CLAUDE.md
  dos diretorios-pai (T-085)": flag presente; fontes == `["user"]` para 5 papéis, inclusive
  desconhecido; nunca `--bare`). Testador executou: 79 testes, 0 falhas.
- [Critério 2 — sonda REAL com e sem a flag, registrada] → Notas de execução, "Sonda REAL":
  a linha foi gerada POR `linha/1` (via `mix run`, não redigida à mão), rodada em `pai/filho`
  com o prompt por stdin como `conversar/2` faz; com a flag → `NAO SEI.`, sem a flag (a linha
  exata do HEAD anterior) → `ABACAXI`. A sonda distingue, e o comando de reprodução está nas
  Notas.
- [Objetivo — o contexto do agente passa a ser só o que a fábrica monta] → cumprido no que o
  Objetivo nomeia (os `CLAUDE.md` da árvore acima do projeto, inclusive o do próprio cwd). O
  nível `user` continua entrando — o Contexto propôs exatamente `user` e pediu que o resíduo
  fosse registrado; foi (Notas, "O que o nível `user` ainda carrega"). Ver nota menor 1 na
  Revisão sobre o alcance desse resíduo na máquina do Enzo.
- [Escopo / areas] → diff só toca as duas `areas` declaradas + `_gestao/MAPA.md` (regenerado) e o
  arquivo da tarefa. Nada fora do pedido. `--bare` descartado como o Contexto mandava; D-002
  (sem chave de API) respeitada.
- Prova visual: não se aplica (sem interface).

## Revisão

### Ciclo 1

**Aprovado sem ressalvas críticas/importantes.** Diff revisado: `git show 296e9bb e9eddec`
(código, testes, MAPA, tarefa). Commit gravado nas Notas (`296e9bb`), sem busca.

O que verifiquei, incluindo o pedido do orquestrador ("o que mais `--setting-sources user`
desliga e se o despacho real precisava de algo dali"):

- **Linha de comando.** Trecho constante, sem interpolação de conteúdo; sem caractere que exija
  escape no `.bat`/`sh`. `--model` continua por último (âncora `…$` da T-084 intacta). O teste de
  fontes usa `Regex.run(~r/--setting-sources (\S+)/)` + `split(",")`, então pegaria tanto a
  remoção quanto o acréscimo de `project`/`local`.
- **O que `project`/`local` carregavam e deixa de carregar:** `CLAUDE.md` da árvore (o alvo),
  `.claude/settings.json`/`settings.local.json` do cwd (permissões, hooks, `env`,
  `additionalDirectories`), aprovação de MCP de projeto (`.mcp.json`), agentes/comandos de
  projeto. Conferi se o despacho da fábrica dependia de algum deles: `grep` em `lib/` e
  `priv/doutrina/` por `settings.json`, `.mcp.json`, `mcp`, `hooks`, `.claude/`, `CLAUDE.md` —
  nada escreve nem lê isso (o único "MCP" é a opção (b) da doc do `claude_cli.ex:87`, não
  implementada); nem `fabrica-v2/` nem `projetos/` têm `.claude/`. Permissão e vocabulário vêm só
  por flag (`--permission-mode acceptEdits`, `--tools`), e o confinamento do CLI depende do cwd,
  não de settings. **Nada que o despacho real precisa vinha de `project`/`local`.** Por isso
  abri `claude_cli.ex:30-110` (doc de permissão/ferramentas) além do diff — o diff sozinho não
  dizia de onde vinha a permissão.
- **A diferença de cache na tabela da sonda não é efeito da flag.** Com a flag: 4089 tokens de
  entrada, 0 de escrita de cache; sem: 10 + 4192 escritos. 4089 fica abaixo do mínimo cacheável
  do Haiku 4.5 (4096); o `CLAUDE.md` pai empurrou o outro lado para cima dele. Em despacho real
  (prefixo de 11k+ tokens) o cache segue normal — não há regressão de custo escondida aqui.
- **Compatibilidade de versão:** a flag existe no 2.1.287 medido; a máquina do Enzo já estava no
  2.1.258 na T-018b, bem depois de a flag aparecer. Sem cenário plausível de `unknown option`.

Notas menores (não reprovam):

- [menor] Notas de execução, "O que o nível `user` ainda carrega" — a justificativa para preferir
  `user` a `local` ("o `user` é onde mora a autenticação/configuração da assinatura") é imprecisa:
  a credencial OAuth não é uma fonte de settings (`~/.claude/.credentials.json`/keychain, não
  `settings.json`). A própria sonda do orquestrador com `--setting-sources local` respondeu
  normalmente, ou seja, autenticou. O custo da escolha: na máquina do Enzo, tudo que é nível
  usuário entra em TODO despacho — `~/.claude/CLAUDE.md`, e também os hooks, plugins habilitados
  (que trazem skills/MCP), `env` e permissões de `~/.claude/settings.json`. Não fere o Objetivo,
  que nomeia a árvore acima do projeto, e o Contexto sugeriu `user`. Mas antes da T-058 em casa,
  confira `~/.claude/` no Windows. Se houver algo ali, `local` é candidato, com a mesma sonda.
- [menor] A sonda roda com `--tools ""` e não exercita ferramenta nenhuma: prova a herança de
  contexto, não que Write/Bash se comportam igual com a flag. Pela análise acima não há do que
  depender. A única hipótese teórica seria o CLI ler o `.claude/settings.json` da fábrica-mãe
  (allowlist) por ancestralidade. Pelo que sei, ele lê settings só do cwd; só o `CLAUDE.md` é
  procurado subindo a árvore. Não está medido. Ligado a isso, e anterior a esta tarefa: sob
  `acceptEdits` em `--print`, nada no despacho aprova comando de shell que não seja de arquivo
  (ex.: `mix test`). Vale confirmar isso na primeira rodada da T-058, não aqui.
- [menor] Regressão travada só na LINHA, não no comportamento: uma atualização do CLI que mude a
  semântica de `--setting-sources` passaria verde. A sugestão do executor (probe versionado da
  palavra secreta em `priv/probes/`) cobre isso, e fica com o orquestrador decidir se vira tarefa.

