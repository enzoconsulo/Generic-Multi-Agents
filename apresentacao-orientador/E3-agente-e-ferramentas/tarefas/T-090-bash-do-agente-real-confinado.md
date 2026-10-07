---
id: T-090
titulo: "O Bash do agente real roda CONFINADO — sandbox do próprio `claude` no despacho, e sem sandbox o agente não sobe"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-089]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs]
tentativas: 2
criada: 2026-10-02
atualizada: 2026-10-02
---

## Objetivo
Num despacho real (`Operario.ClaudeCLI`), todo papel que tem `Bash` aprovado roda o shell DENTRO do
sandbox do próprio `claude`: um comando que tenta gravar fora da raiz do projeto é negado pelo
sistema operacional, e o que roda dentro da raiz continua funcionando. Onde o sandbox não existe, o
agente com Bash NÃO sobe — e o operário diz isso com um erro nomeado, em vez de rodar sem confinamento.

## Contexto
É o que destrava a T-058 com segurança. O disparo do marco foi RECUSADO pelo classificador da sessão
(D-015, adendo 7) porque os agentes teriam Bash aprovado (T-088) e NÃO confinado — o moduledoc de
`ClaudeCLI` já diz que, com `--allowedTools "Bash"`, um `echo` grava fora da raiz.

**Medido pelo orquestrador em 2026-10-02** (`claude` 2.1.287, `mktemp -d` em `/tmp`, fora do projeto e
da fábrica-mãe, haiku, `--max-turns 3`, `--permission-mode acceptEdits --tools "Bash" --allowedTools
"Bash" --setting-sources user`, comando `python3 -c 'print(6*7)'; echo dentro > ./dentro.txt; echo
fora > $HOME/x.txt; echo fora > <irmão da raiz em /tmp>/fora.txt`). Total das 5 sondas ≈ US$ 0,05:

| linha | resultado |
|---|---|
| sem sandbox (controle) | `42`; grava na raiz, em `$HOME` e em `/tmp` — **fora da raiz** |
| `--settings <arquivo>` com o bloco abaixo, SEM `bwrap`/`socat` no sistema | o `claude` nem sobe: rc=1, stdout vazio, stderr abaixo |
| o mesmo, com `bubblewrap` 0.9.0 + `socat` instalados | `42`; grava na raiz; as duas gravações fora → `Read-only file system` |
| o mesmo, e o agente pede `dangerouslyDisableSandbox: true` no Bash | ainda `Read-only file system` (a válvula está fechada por `allowUnsandboxedCommands: false`) |
| o mesmo, `node --test` dentro da raiz (ferramental do projeto do marco) | `# pass 1`, `NODE_RC=0` |

O bloco de configuração medido (o `--settings` aceita arquivo ou JSON; `--setting-sources user` NÃO o
desliga — a sonda rodou com os dois):

```json
{"sandbox": {"enabled": true, "failIfUnavailable": true,
             "autoAllowBashIfSandboxed": true, "allowUnsandboxedCommands": false}}
```

- `failIfUnavailable: true` é o que torna a falta de sandbox um ERRO e não um shell solto (o próprio
  binário diz: "sandbox.failIfUnavailable is false (a missing backend would run the shell unconfined)").
- `allowUnsandboxedCommands: false` fecha a válvula `dangerouslyDisableSandbox` do Bash.
- stderr literal quando falta a dependência (rc=1; stdout vazio SÓ com `--output-format json` da sonda —
  com o `stream-json` da linha real sai antes uma linha `result` de erro, ver Revisão do ciclo 1):

  ```
  Error: sandbox required but unavailable: sandbox is enabled but dependencies are missing: bubblewrap (bwrap) not installed, socat not installed · install missing tools (e.g. apt install bubblewrap socat) or see https://code.claude.com/docs/en/sandboxing
    sandbox.failIfUnavailable is set — refusing to start without a working sandbox.
  ```

Decisão do orquestrador (D-016): **confinamento obrigatório, sem caminho de fuga por configuração** —
papel com Bash sempre leva o sandbox com `failIfUnavailable`; onde ele não existe (Windows nativo, que o
sandbox do `claude` não suporta; Linux sem `bwrap`), o despacho falha fechado. Papel SEM Bash não leva
o bloco (não há shell a confinar, e ele continuaria subindo no Windows). As dependências do contêiner da
nuvem passam a ser instaladas pelo hook de início da fábrica-mãe (não é desta tarefa).

O que o sandbox NÃO faz (registrar no moduledoc, onde a flag mora): leitura fora da raiz continua
permitida (ele confina ESCRITA); a rede do shell fica restrita por padrão (comando que baixa
dependência pode falhar — o projeto do marco é Node sem dependências); no Windows nativo não há
sandbox, então lá o papel com Bash não sobe.

## Critérios de aceite
- [ ] `linha/1` leva a configuração de sandbox acima (via `--settings`, com `enabled`,
      `failIfUnavailable`, `autoAllowBashIfSandboxed` e `allowUnsandboxedCommands: false`) para todo
      papel cujo `--tools` contém `Bash`, e NÃO a leva para papel sem Bash (teste por papel do
      catálogo, como o da T-088).
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] (CORRIGIDO pelo orquestrador no ciclo 2 — o "stdout vazio" era da sonda do orquestrador em
      `--output-format json`, não da linha real) A saída REAL do `claude` que recusa subir por falta de
      sandbox, com a linha de `linha/1` (`--output-format stream-json`: uma linha `result` de erro —
      `subtype: error_during_execution`, `is_error: true`, `num_turns: 0`, texto em `errors` — mais o
      stderr literal do Contexto e saída ≠ 0) vira um erro NOMEADO do operário
      (`{:erro, :sandbox_indisponivel}`) — não sucesso, não `:recusa`, não parede de cota. A fixture do
      teste é essa saída stream-json real (capturada sem modelo, como o revisor do ciclo 1 fez), não
      `stdout: ""`.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Sonda REAL, registrada nas Notas (comando e saída): com a linha gerada por `linha/1` para um papel
      com Bash, num `mktemp -d` fora do projeto e da fábrica-mãe, haiku, `--max-turns 3`: um comando que
      grava fora da raiz é NEGADO (o arquivo não existe depois) e `python3 -c 'print(6*7)'` dentro da
      raiz dá `42`. (executável — `bwrap` e `socat` já estão instalados neste contêiner)
- [ ] O moduledoc de `ClaudeCLI` diz o que o sandbox confina e o que NÃO confina (leitura, rede,
      Windows nativo) e troca a frase de hoje ("com a flag, um `echo` grava fora da raiz") pelo estado
      novo. (inspecionável — o revisor confere no diff)
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução

### Ciclo 1

**O que foi feito.**
- `linha/1` passou a levar `--settings "<json do sandbox>"` (logo antes de `--model`) para todo papel
  cujo `--tools` contém `Bash` — pela MESMA regra de `--allowedTools "Bash"` (`@shell_cli in
  ferramentas`). Papel sem Bash (e papel desconhecido, `--tools ""`) não leva o bloco. Sem chave de
  configuração para desligar (D-016).
- O bloco é exatamente o medido: `enabled`, `failIfUnavailable`, `autoAllowBashIfSandboxed` = `true`,
  `allowUnsandboxedCommands` = `false` (`@sandbox_cli`, `Jason.encode!` em tempo de compilação).
- `interpretar/2` reconhece o `claude` que recusa subir sem sandbox e devolve
  `{:erro, :sandbox_indisponivel}` (sem envelope de consumo — nada rodou), com `Logger.warning`
  carregando o stderr (a causa: dependência faltando / plataforma). Duas condições: o texto
  ("sandbox required but unavailable" | "refusing to start without a working sandbox") tem de estar no
  STDERR **e** não pode haver `result` no stdout — uma sessão que subiu pode repetir o texto (o agente
  lê esta tarefa, ou um comando o escreve) e isso não é recusa. A checagem vem antes da cota (o
  processo nem falou com a API).
- Moduledoc: a seção "Comando de shell aprovado" perdeu a frase "a sonda da T-088 mediu um `echo`
  gravando fora..." e agora aponta para a seção nova **"O shell roda no sandbox do próprio `claude`
  (T-090, D-016)"** — o que confina (escrita presa à raiz, `Read-only file system`, válvula
  `dangerouslyDisableSandbox` fechada), onde não existe o papel com Bash não sobe
  (`:sandbox_indisponivel`, Linux sem `bwrap`/`socat`, **Windows nativo**), e o que NÃO confina
  (leitura, rede restrita por padrão, o que roda fora do Bash). "A lacuna que fica" ganhou a saída
  (d) sandbox como escolha vigente no lugar da (c). `@doc` de `linha/1` cita o `--settings`.

**Escolha: JSON inline, não arquivo de settings.** `linha/1` continua pura e constante (sem temporário
para criar/apagar/deixar para trás, nada gravado fora do projeto). Citação: `"..."` com cada aspa
interna como `\"` — o `sh` desfaz `\"` dentro de aspas duplas; no Windows o `cmd` só alterna estado de
aspas (o JSON não tem `& | < > ( ) ^ %`) e o parser de argv do executável desfaz `\"`. Aspas simples
quebrariam no `cmd`. O JSON não tem `$`, crase nem `\`. Provado no teste que roda `conversar/2` com um
executável falso que grava o argv (o `--settings` chega como JSON válido, vizinhas inteiras) e na sonda
real abaixo.

**Arquivos alterados:** `lib/fabrica/operario/claude_cli.ex`, `test/fabrica/operario/claude_cli_test.exs`
(describe novo "o Bash do agente real roda CONFINADO no sandbox do proprio claude (T-090)": um teste
por papel do catálogo + catálogo atual + papel desconhecido + sem chave de fuga + stderr literal →
`:sandbox_indisponivel` (via `interpretar/1`, `/2` e `responder/2`) + não é ok/cota/ininteligível +
texto dentro de sessão com `result` não dispara + argv real pelo `sh` (pulado no Windows) + moduledoc).

**Teste primeiro:** com só o teste alterado, `mix test test/fabrica/operario/claude_cli_test.exs` →
132 testes, **8 falhas** (todas do describe novo; os que já passavam afirmam AUSÊNCIA: papéis sem
Bash, papel desconhecido, e o texto dentro de sessão com `result`). Depois
da implementação → **132 testes, 0 falhas**.

**Reproduzir:** `mix test test/fabrica/operario/claude_cli_test.exs`

**Sonda REAL (critério 3)** — uma chamada, haiku, `--max-turns 3`, `claude` 2.1.287, `bwrap` 0.9.0 +
`socat` presentes. Linha gerada por `linha/1` para o `construtor` (`teto_de_voltas: 3`):

```
mix run --no-start -e 'r = %Fabrica.Operario.Requisicao{papel: "construtor", modelo: "haiku", teto_de_voltas: 3, mensagens: []}; {:ok, l} = Fabrica.Operario.ClaudeCLI.linha(r); IO.puts(l)'
claude --print --verbose --output-format stream-json --permission-mode acceptEdits --tools "Bash,Edit,Glob,Grep,Read,Write" --allowedTools "Bash" --max-turns 3 --setting-sources user --settings "{\"sandbox\":{\"allowUnsandboxedCommands\":false,\"autoAllowBashIfSandboxed\":true,\"enabled\":true,\"failIfUnavailable\":true}}" --model haiku
```

Disparada como o `Comando.escrever_script/4` faz no unix (`D=$(mktemp -d)` = `/tmp/tmp.RXQkRZngOK`,
raiz `$D/raiz`, irmão `$D/irmao`; `cd $D/raiz && sh disparo.sh`, com
`{ <linha> ; } < prompt.txt > saida.jsonl 2> erro.txt`). Prompt: rodar UMA vez com Bash
`python3 -c 'print(6*7)'; echo dentro > ./dentro.txt && echo DENTRO_OK; echo fora > $HOME/t090-sonda-15685-1790902604.txt && echo HOME_OK; echo fora > /tmp/tmp.RXQkRZngOK/irmao/fora.txt && echo IRMAO_OK`.

Saída (rc=0, stderr vazio):
```
--- tool_result do Bash:
Exit code 1
42
DENTRO_OK
/bin/bash: line 4: /root/t090-sonda-15685-1790902604.txt: Read-only file system
/bin/bash: line 4: /tmp/tmp.RXQkRZngOK/irmao/fora.txt: Read-only file system
--- result: {"subtype":"success","is_error":false,"num_turns":2,"total_cost_usd":0.0288859,"permission_denials":[]}
--- depois: $D/raiz/dentro.txt = "dentro"; $D/irmao/ vazio;
ls /root/t090-sonda-15685-1790902604.txt -> No such file or directory
```
`42` dentro da raiz, gravação na raiz OK, as duas gravações fora NEGADAS pelo SO (nenhum arquivo
criado). `$D` apagado depois (`rm -rf`), nada ficou em `$HOME`. Custo: US$ 0,029, sem parede de cota.

**Observação da sonda:** o `claude` com sandbox cria `<raiz>/.claude/.cc-writes/` (diretório VAZIO).
`git` não rastreia diretório vazio, então não entra no commit do agente — mas fica na árvore do
projeto. Candidato a `.gitignore` dos projetos gerados se algum dia passar a ter arquivo dentro.

**Bateria (`mix fabrica.ci`)** — 5 corridas; só a 5ª ficou 6/6. As 4 primeiras caíram SÓ em
`testes`, SÓ pelas duas intermitentes conhecidas, fora das minhas áreas:
1. `classe_falha_test.exs:315` (1 falha; formato/compilar/lint ok);
2. `busca_test.exs:242` (1 falha);
3. `busca_test.exs:242` (1 falha);
4. `classe_falha_test.exs:315` + `busca_test.exs:242` (2 falhas);
5. **6/6 ok** (formato, compilar, lint, testes, tipos, backup — "bateria passou: 6 estagio(s) ok").

Diagnóstico da `busca_test.exs:242` (pré-existente: com `git stash` das minhas mudanças ela falhou 3/3
isolada, e também com `--seed 1/2/3`): o banco de teste tinha 0 linhas vivas em `trechos`, mas cada
corrida insere vetores IDÊNTICOS (`Falso.vetor("vetor-de-consulta")`) e os desfaz por rollback; as
tuplas mortas ficam no índice HNSW (`trechos_embedding_hnsw_index`) até o vacuum, e — hipótese
compatível com o que se viu — ocupam os candidatos da busca aproximada e escondem o trecho
"documento" (`assert trecho_documento in ...` falha com só o de consulta no resultado). Depois do
autovacuum das 01:01:23 o arquivo passou 2/2 isolado e a bateria fechou 6/6. Nada foi alterado no
banco nem no teste.

**Sugestões (não feitas — fora do escopo):**
- Tarefa para estabilizar `busca_test.exs:242`: a busca vetorial por projeto não pode depender de
  vacuum (ex.: `hnsw.iterative_scan`/`ef_search` maior na consulta filtrada, ou o teste fazer
  `VACUUM`/usar vetores não repetidos). Hoje ela fica vermelha deterministicamente entre autovacuums.
- A forma do erro no Windows nativo não foi medida (não há Windows aqui); o reconhecedor usa o prefixo
  do caminho `failIfUnavailable`, comum às duas causas no binário. Medir quando houver a máquina.
- `.claude/.cc-writes/` na raiz (acima).

**Commit:** `949db1b`

### Ciclo 2

**Causa raiz da reprovação (em uma frase):** `sandbox_indisponivel?/2` usava "nenhum `result` no
stdout" como prova de que a sessão não subiu, mas com o `--output-format stream-json` da linha real o
`claude` grava UMA linha `result` de erro (`error_during_execution`, `num_turns: 0`) antes de sair, então
o reconhecedor nunca disparava e a recusa caía em `montar/2` como `:recusa` — e o teste não pegava
porque a fixture era o `stdout: ""` da sonda em `--output-format json`.

**Fixture real, capturada SEM modelo** (custo zero, sem credencial, `bwrap`/`socat` fora do PATH; o
critério 3 não foi refeito):

```
D=$(mktemp -d); mkdir -p $D/raiz $D/home $D/vazio; echo "diga oi" > $D/prompt.txt; cd $D/raiz
env -i HOME=$D/home PATH=$D/vazio /opt/claude-code/bin/claude --print --verbose --output-format stream-json --permission-mode acceptEdits --tools "Bash,Edit,Glob,Grep,Read,Write" --allowedTools "Bash" --max-turns 1 --setting-sources user --settings "{\"sandbox\":{\"allowUnsandboxedCommands\":false,\"autoAllowBashIfSandboxed\":true,\"enabled\":true,\"failIfUnavailable\":true}}" --model haiku < $D/prompt.txt > out.jsonl 2> err.txt
```

rc=1; `out.jsonl` = 1042 bytes, UMA linha `{"type":"result","subtype":"error_during_execution",...,"is_error":true,
"num_turns":0,...,"total_cost_usd":0,...,"errors":["Sandbox required but unavailable: sandbox is enabled but
dependencies are missing: bubblewrap (bwrap) not installed, socat not installed · ... Set
sandbox.failIfUnavailable=false to allow unsandboxed execution."],"result_index":0}`; `err.txt` = 341 bytes,
o stderr literal do Contexto (com uma linha em branco antes e outra depois). Mesma forma que o revisor
mediu. Os dois foram colados BYTE A BYTE no teste (`@stdout_sem_sandbox`/`@stderr_sem_sandbox`, com
teste que confere 1042/341 bytes e a forma: `error_during_execution`, `is_error`, `num_turns: 0`,
`errors`). `$D` apagado.

**O "antes", com `git stash` da lib** (`git stash push -- lib/fabrica/operario/claude_cli.ex`, teste
novo, `git stash pop`): `135 tests, 3 failures`, as três devolvendo
`{:ok, %Resposta{blocos: [], motivo_parada: :recusa}}` — o defeito apontado, reproduzido pela fixture.
**Depois:** `135 tests, 0 failures`.

**O conserto (só `sandbox_indisponivel?/2` e o que ele usa):**
- Discriminador novo, o sugerido pelo revisor: a sessão **não subiu** quando o stdout só tem `result`,
  todos com `num_turns: 0` (`nao_subiu?/1`, um `match?` por evento). Sessão que subiu escreve
  `system/init`/`assistant`/`user` antes do `result` e o `result` tem `num_turns >= 1` → não dispara,
  mesmo com o texto no stderr ou no `errors`. Stdout vazio (sem evento) continua contando como "não
  subiu".
- O texto do `failIfUnavailable` vale no stderr **ou** no `errors` do `result` (os dois canais do
  binário; basta um). `causa_sem_sandbox/2` devolve o texto achado (stderr primeiro), e o
  `Logger.warning` agora carrega essa causa (antes, só o stderr).
- **Contra a T-087 (cota e erros próprios):** a checagem continua ANTES de `cota/2`, e só fecha quando
  NÃO houve sessão — então não engole parede de cota (parede exige sessão/`rate_limit_event`, e não traz
  o texto do sandbox) nem recusa legítima do modelo (que tem `system/init` + `assistant`). Um
  `error_during_execution` de sessão que rodou (`num_turns >= 1`) segue sendo erro PRÓPRIO conhecido
  (`@erros_proprios`) e vai a `cota/2`/`montar/2` como antes — teste novo trava isso.
- Moduledoc (`claude_cli.ex`, "Onde ele nao existe...") e o comentário do reconhecedor trocaram
  "stdout vazio" pela forma real (linha `result` de erro com zero voltas + stderr) e dizem por que a
  checagem vem antes (pelo caminho normal aquele `result` vira `:recusa`). O outro "stdout vazio" do
  arquivo (`claude_cli.ex:506`) é do `--verbose` ausente (T-018), não do sandbox — ficou.

**Testes (describe T-090):** a fixture é a forma do critério (novo); a saída real → `{:erro,
:sandbox_indisponivel}` por `interpretar/1`, `/2` e `responder/2`; a saída real não é ok/cota/
ininteligível/`:recusa`; o texto só no `errors` (stderr vazio) ainda é sandbox (novo); sessão que SUBIU
(`system/init`, `error_during_execution`, `num_turns: 2`, texto no `errors` e no stderr) NÃO é sandbox e
devolve `{:ok, %Resposta{}}` (novo). O teste "texto dentro de sessão que terminou" continua passando.
Não mexi em `linha/1`, no bloco de sandbox nem nos testes dos critérios 1/3/4.

**Reproduzir:** `mix test test/fabrica/operario/claude_cli_test.exs`

**Bateria (`mix fabrica.ci`)** — 3 corridas; a 3ª **6/6 ok** ("bateria passou: 6 estagio(s) ok, 0
pulado(s)"). As 2 primeiras caíram SÓ em `testes`, SÓ pela intermitente conhecida
`classe_falha_test.exs:315` ("prazo estourado reexecuta UMA vez", 1 falha em 1286), fora das áreas;
`busca_test.exs:242` não caiu desta vez (nada foi feito no banco).

**Aproveitamento:** ~95% do ciclo 1 ficou (bloco em `linha/1`, critérios 1/3/4, moduledoc). Refeito:
o predicado `sandbox_indisponivel?/2`, a fixture do teste e duas frases.

**Commit:** `949db1b`, `45d002e`


## Verificação

### Ciclo 1

- **[PASSOU] [executado] Critério 1: `linha/1` leva a configuração de sandbox para papers com Bash, e NÃO a leva para sem Bash**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: 132 testes, 0 falhas — todos os papéis do catálogo testados com suas variações (com Bash, sem Bash, desconhecido)

- **[PASSOU] [executado] Critério 2: Stderr literal do `claude` que recusa subir sem sandbox vira `{:erro, :sandbox_indisponivel}`**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: Testes de reconhecimento do erro passam (3 testes: "o claude que recusa", "não é sucesso/recusa/cota", "texto dentro de sessão não dispara")

- **[PASSOU] [executado] Critério 3: Sonda REAL com confinamento do Bash funciona**
  Comando: Linha gerada por `linha/1` para papel "construtor" (haiku, `--max-turns 3`), disparada num `mktemp -d` fora do projeto (`/tmp/tmp.tkEVifoS1J`)
  Prompt: `python3 -c 'print(6*7)'; echo dentro > ./dentro.txt && echo DENTRO_OK; echo fora > $HOME/t090-sonda-15685-1790902604.txt && echo HOME_OK`
  Esperado: 42 + gravação interna OK + gravação externa negada
  Obtido: RC=0, stderr vazio, stdout contém "42", "Read-only file system" nas tentativas de `/root/` e `/tmp/.../irmao/`, arquivo `dentro.txt` criado, arquivo em `$HOME` NÃO existe após limpeza
  Reproduzir: gerar linha com `mix run --no-start -e '... ClaudeCLI.linha(...)'`, disparar com prompt Unix via `sh disparo.sh < prompt.txt`, capturar stdout/stderr/rc

- **[PASSOU] [julgado] Critério 4: Moduledoc documenta confinamento e limitações do sandbox**
  Comando: Inspeção do arquivo `lib/fabrica/operario/claude_cli.ex`
  Base: Seção "O shell roda no sandbox do próprio `claude` (T-090, D-016)" documentando: o que confina (escrita na raiz, `Read-only file system`), onde não existe (Linux sem `bwrap`/`socat`, Windows nativo), o que não confina (leitura, rede restrita), e que `dangerouslyDisableSandbox` está fechado por `allowUnsandboxedCommands: false`

- **[PASSOU] [executado] Critério 5: Bateria completa verde**
  Comando: `mix fabrica.ci` (6 estágios: formato, compilar, lint, testes, tipos, backup)
  Saída: bateria passou 6/6 (segunda rodada após intermitente em `classe_falha_test.exs:315` — falha conhecida fora da área T-090, resolvida na re-execução)

Suíte completa: 1283 testes, 0 falhas, 6 estágios ok
Graus de prova: 4 executados, 1 julgado

### Ciclo 2 — portão mecânico do orquestrador (2026-10-02, HEAD `7df4b97`)

Sem testador: o delta do ciclo 2 é o reconhecedor `sandbox_indisponivel?/2`, a fixture e duas frases
(critérios 1, 3 e 4 já cumpridos e não tocados). Conferido pelo orquestrador, sem custo de modelo:

- **[PASSOU] [executado] Critério 2.** Recaptura INDEPENDENTE da saída real, sem modelo e sem
  credencial: a linha de `linha/1` para o construtor (`--output-format stream-json`, `--settings` com o
  sandbox) rodada com `env -i HOME=<tmp> PATH=<dir só com o claude>` (sem `bwrap`/`socat`), prompt pelo
  stdin, num `mktemp -d`: rc=1, stdout 1042 bytes = UMA linha `result` (`error_during_execution`,
  `is_error: true`, `num_turns: 0`, texto em `errors`), stderr 341 bytes — mesmos tamanhos e forma da
  fixture do teste. Essa captura (não a fixture) alimentada em `interpretar/2` e `responder/2` via
  `mix run`: **`{:erro, :sandbox_indisponivel}`** nos dois.
  `mix test test/fabrica/operario/claude_cli_test.exs` coberto pela bateria abaixo.
- **[PASSOU] [executado] Critério 5.** `mix fabrica.ci`: corrida 1 caiu só em `testes`, 1 falha em
  1286, a intermitente conhecida `classe_falha_test.exs:315` (fora das áreas); corrida 2 **6/6 verde**
  (formato 1,0 s · compilar 0,8 s · lint 3,7 s · testes 47,7 s · tipos 7,7 s · backup 6,0 s).

Veredito do ciclo 2: APROVADA → em-revisao.

## Conformidade

### Ciclo 1

Conformidade: cumpre-parcial

- [C1 — `--settings` com o bloco para papel com Bash, e só para ele] → `lib/fabrica/operario/claude_cli.ex:579-592`
  (`@sandbox_cli`, constante de compilação; `sandbox_do_shell/1` pela mesma regra `@shell_cli in ferramentas`
  da aprovação) + teste por papel do catálogo, catálogo atual (`construtor`, `verificador`), papel desconhecido
  e "sem chave de fuga" (`test/fabrica/operario/claude_cli_test.exs`, describe T-090). **Cumprido.**
- [C2 — a recusa por falta de sandbox vira erro NOMEADO, não sucesso nem `:recusa`] → `interpretar/2` +
  `sandbox_indisponivel?/2` (`claude_cli.ex:666-697`). **NÃO cumprido no caminho real.** O teste alimenta
  `stdout: ""` (a forma medida pelo orquestrador, sem `--output-format stream-json`), mas a linha que `linha/1`
  monta SEMPRE leva `--output-format stream-json`, e com ela o `claude` escreve um `result` no stdout antes de
  sair. Com essa saída real, `interpretar/2` devolve `{:ok, %Resposta{motivo_parada: :recusa, blocos: []}}` —
  exatamente o que o critério proíbe. Medido (sonda sem modelo, detalhe na Revisão).
- [C3 — sonda real: escrita fora negada, `42` dentro] → Notas de execução, "Sonda REAL" (linha gerada por
  `linha/1` para o `construtor`, `Read-only file system` em `$HOME` e no irmão, `dentro.txt` criado). **Cumprido.**
- [C4 — moduledoc diz o que confina e o que não confina, e troca a frase antiga] → `claude_cli.ex`, seção "O shell
  roda no sandbox do próprio `claude` (T-090, D-016)" e "A lacuna que fica" com a saída (d). **Cumprido**, com uma
  afirmação falsa herdada do mesmo erro do C2 (`claude_cli.ex:118`: "stdout vazio").
- [C5 — bateria verde] → Verificação, `mix fabrica.ci` 6/6. **Cumprido.**

**Objetivo.** A metade principal está entregue e provada: o shell do agente real roda confinado (escrita presa à
raiz, válvula `dangerouslyDisableSandbox` fechada) e, onde não há sandbox, o `claude` não sobe — falha fechado,
nada roda solto. A outra metade do Objetivo, "o operário diz isso com um erro nomeado", NÃO acontece no
despacho real: o operário diz `:recusa`. É parte do Objetivo, não acessório → reprova.

**Perguntas do despacho, respondidas:**
- *Todo despacho com Bash passa por `linha/1`?* Sim. Em `lib/`, a única montagem da linha do `claude` é
  `ClaudeCLI.linha/1`, chamada só por `conversar/2` (o `Planejador` e o `Agente.Laco` chegam por ele via
  `Operario`). `priv/probes/cli_governanca.exs` monta a própria linha, mas é sonda manual, não despacho.
  `MessagesAPI` não sobe o `claude` (e está fora do suportado, D-002).
- *Chave/caminho que desligue o sandbox?* Na fábrica, nenhum: o bloco é constante de compilação e só depende
  do `--tools`. `--setting-sources user` (incondicional) impede que um `<raiz>/.claude/settings.json` escrito
  pelo próprio agente desligue o sandbox no despacho seguinte. Resíduo fora da fábrica, NÃO medido: o
  `~/.claude/settings.json` do operador continua carregado (`user`), e chaves de lista do sandbox lá
  (`excludedCommands`, `filesystem.allowWrite`) se somariam ao bloco; o agente não alcança esse arquivo (o
  sandbox nega a escrita em `$HOME`; `Write`/`Edit` fora da raiz são auditados). Fica como nota.
- *A citação sobrevive ao shell real?* `sh`: sim, provado pelo teste do argv (`conversar/2` + executável falso)
  e pela sonda. `cmd` (Windows): pela análise, sim — alternando o estado a cada `"`, o que fica FORA de aspas são
  só letras e `\` (nenhum `& | < > ( ) ^ %`), não há `)` solto dentro do `( ... )` do `.bat`, e o parser de argv
  do executável desfaz `\"`. Não medido (sem Windows). No Windows o papel com Bash não sobe de qualquer forma;
  o binário (`/opt/claude-code/bin/claude`, 2.1.287) mostra que o caminho de recusa é o MESMO para qualquer
  motivo (`sandbox required but unavailable: ${motivo}` + o `result` no stream-json) — logo o Windows cai no
  mesmo defeito do C2.
- *Colide com cota (T-087) ou com a recusa?* Com a cota, não: a recusa por sandbox acontece antes de falar com a
  API (não há `rate_limit_event`), o `subtype` é `error_during_execution` (erro próprio conhecido, não parede), e a
  checagem vem antes da cota. Com a recusa, SIM — é o defeito do C2.
- *`.claude/.cc-writes/` vazio nos projetos gerados vira tarefa?* Não agora. Diretório vazio não é rastreado
  pelo `git` nem aparece no `git status --porcelain` (diretório não rastreado só aparece com arquivo dentro), e o
  `--setting-sources user` não lê o `.claude/` do projeto. Vira tarefa (`.claude/` no `.gitignore` dos projetos
  gerados) só se algum dia aparecer arquivo dentro dele — aí ele entraria no `git add` do agente.

Prova visual: não se aplica (tarefa sem interface).

### Ciclo 2

Conformidade: cumpre

- [C1 — `--settings` com o bloco para papel com Bash, e só para ele] → inalterado desde o ciclo 1:
  `git diff 949db1b HEAD -- lib test` contém SÓ as mudanças de `45d002e`, e elas não tocam `linha/1`,
  `@sandbox_cli`, `sandbox_do_shell/1` nem os testes por papel. **Cumprido (sem regressão).**
- [C2 (corrigido) — a saída REAL stream-json da recusa vira `{:erro, :sandbox_indisponivel}`] →
  `lib/fabrica/operario/claude_cli.ex`, `sandbox_indisponivel?/2` + `nao_subiu?/1` + `causa_sem_sandbox/2`;
  fixture byte a byte da saída real (`@stdout_sem_sandbox` 1042 bytes / `@stderr_sem_sandbox` 341 bytes, com
  teste que trava a forma: `error_during_execution`, `is_error`, `num_turns: 0`, `errors`) em
  `test/fabrica/operario/claude_cli_test.exs`, describe T-090; asserções por `interpretar/1`, `/2` e
  `responder/2`; recaptura INDEPENDENTE do orquestrador (Verificação, Ciclo 2) dando
  `{:erro, :sandbox_indisponivel}` nos dois. **Cumprido.**
- [C3 — sonda real: escrita fora negada, `42` dentro] → Notas, Ciclo 1 (sonda com a linha de `linha/1`); a
  linha não mudou, então a prova continua valendo. **Cumprido (sem regressão).**
- [C4 — moduledoc] → seção "O shell roda no sandbox do próprio `claude`" mantida; o "stdout vazio" falso (menor
  do ciclo 1, `claude_cli.ex:118` e o comentário do reconhecedor) foi trocado pela forma real (linha `result`
  de erro, zero voltas, + stderr) e diz por que a checagem vem antes de `montar/2`. **Cumprido.**
- [C5 — bateria verde] → Verificação, Ciclo 2: `mix fabrica.ci` 6/6 no HEAD `7df4b97` (a 1ª corrida caiu só na
  intermitente conhecida `classe_falha_test.exs:315`, fora das áreas). **Cumprido.**

**Objetivo.** As duas metades agora acontecem no despacho real: o shell do papel com Bash roda confinado
(ciclo 1, intacto) e, onde não há sandbox, o operário diz isso com `:sandbox_indisponivel` — não mais
`:recusa`. Escopo: só o reconhecedor, a fixture e duas frases de doc, dentro das `areas`; nada além do pedido.
Respeita D-016 (sem chave de fuga; o bloco segue constante de compilação).

## Revisão

### Ciclo 1

**REPROVADA.**

- [importante] `lib/fabrica/operario/claude_cli.ex:693-695` (`sandbox_indisponivel?/2`) — exige "nenhum `result`
  no stdout", mas o `claude` que recusa subir por falta de sandbox, rodado com a linha REAL de `linha/1`
  (`--output-format stream-json`), escreve UM `result` no stdout antes de sair. Cenário: Linux sem `bwrap`/`socat`
  (ou Windows nativo) → o construtor/verificador é despachado → rc=1, stdout com
  `{"type":"result","subtype":"error_during_execution","is_error":true,"num_turns":0,"total_cost_usd":0,...,
  "errors":["Sandbox required but unavailable: sandbox is enabled but dependencies are missing: bubblewrap (bwrap)
  not installed, socat not installed · ... Set sandbox.failIfUnavailable=false to allow unsandboxed execution."]}`
  e o stderr literal do Contexto → `interpretar/2` e `responder/2` devolvem
  `{:ok, %Resposta{motivo_parada: :recusa, blocos: [], consumo: zerado}}`: o piloto recebe uma "recusa do modelo",
  o `Logger.warning` com a causa (o que instalar) nunca sai, e o `:sandbox_indisponivel` não existe para ninguém.
  O teste (`claude_cli_test.exs:1284`) passa porque usa `stdout: ""`, a forma da sonda do orquestrador, que NÃO
  usava `--output-format stream-json`. O guarda contra "sessão que subiu repete o texto" continua válido, mas o
  discriminador certo não é "há `result`": uma sessão que subiu tem `system/init` e `num_turns >= 1`; a recusa
  tem só esse `result` de erro, `num_turns: 0`, e o texto em `errors`. A fixture do teste tem de ser a saída
  stream-json real.
  **Reproduzir (sem modelo, sem credencial — `env -i` sem token; o `bwrap` sai do PATH, US$ 0):**
  `cd <mktemp -d>/raiz && env -i HOME=<mktemp>/home PATH=<dir vazio> /opt/claude-code/bin/claude --print --verbose
  --output-format stream-json --permission-mode acceptEdits --tools "Bash,Edit,Glob,Grep,Read,Write" --allowedTools
  "Bash" --max-turns 1 --setting-sources user --settings '<bloco>' --model haiku < prompt > out 2> err` → rc=1,
  `out` = a linha `result` acima (1042 bytes), `err` = o stderr literal. Alimentando `out`/`err` em
  `ClaudeCLI.interpretar(%{stdout: out, stderr: err, codigo: 1}, "/tmp/raiz")` via `mix run` →
  `{:ok, %Resposta{motivo_parada: :recusa}}`; com `stdout: ""` → `{:erro, :sandbox_indisponivel}`.
  (O binário confirma a ordem: no ramo `outputFormat==="stream-json"` ele grava o `result` de erro e só depois
  escreve o stderr e sai com 1.)
- [menor] `lib/fabrica/operario/claude_cli.ex:118` e `:681` — moduledoc e comentário afirmam "stdout vazio" na
  recusa; é falso para a linha que esta fábrica monta. Corrigir junto com o achado acima.
- [menor] Verificação, critério 3 — o "Prompt" registrado não grava no irmão, mas o "Obtido" cita
  `Read-only file system` em `/tmp/.../irmao/`, e o nome do arquivo em `$HOME` traz o mesmo sufixo
  (`15685-1790902604`) da sonda do executor. Não dá para distinguir se a sonda foi rodada de novo ou transcrita
  das Notas. Não muda o veredito do C3 (a sonda do executor está registrada com comando e saída).

O que verifiquei: o diff inteiro de `949db1b`; a montagem da linha e a regra única com a aprovação do Bash; a
ausência de qualquer `Application.get_env` no caminho do bloco; os chamadores de `linha/1`/`conversar/2` e a
ausência de outro construtor de linha do `claude` em `lib/`; `Comando.escrever_script/4` (precisei abrir para
julgar a citação no `sh` e no `.bat`); o tratamento genérico de `{:erro, motivo}` no `Laco` e no `Planejador`
(o erro nomeado não quebraria ninguém a jusante — ele só não chega); as mensagens de recusa no binário do
`claude` 2.1.287; e a sonda sem modelo acima.

### Ciclo 2

**APROVADA — sem ressalvas que reprovem.** O achado `importante` do ciclo 1 está resolvido e o `menor` do
moduledoc também.

**O discriminador novo, julgado contra a T-087.** `sandbox_indisponivel?/2` = `nao_subiu?/1` (TODOS os
eventos são `%{"type" => "result", "num_turns" => 0}`; lista vazia conta) **e** o texto do
`failIfUnavailable` no stderr ou no `errors` de um `result`. Por construção:
- *Sessão que subiu nunca vira `:sandbox_indisponivel`:* qualquer `system/init`, `assistant`, `user` ou
  `rate_limit_event` no stdout faz `nao_subiu?/1` falhar, e `num_turns >= 1` também — o texto, onde quer que
  esteja, deixa de importar. `result` sem a chave `num_turns` ou linha JSON não-objeto também falham o
  `match?` — erro na direção segura (cai no caminho normal).
- *Parede de cota real não é engolida:* toda forma de parede que `cota/2` reconhece traz `rate_limit_event`
  (falha `nao_subiu?`) ou não traz o texto do sandbox (falha a 2ª condição). E a recusa por sandbox é
  anterior à API, então as duas não coexistem.
- *Recusa legítima do modelo não é engolida:* ela tem `system/init` + `assistant`.
- `error_during_execution` de sessão que rodou continua erro próprio (`@erros_proprios`) e segue para
  `cota/2`/`montar/2` sem mudança — `atendida?/1`, `erro_por_limite?/1` e `@erros_proprios` não foram tocados.

**Sonda sem modelo (US$ 0) — `mix run --no-start` alimentando `interpretar/2` com 10 saídas sintéticas**
(script no scratchpad do revisor, fora do projeto):

| saída | resultado |
|---|---|
| só `result` n0 de erro com o texto em `errors` + stderr do sandbox | `{:erro, :sandbox_indisponivel}` |
| o mesmo, stderr vazio | `{:erro, :sandbox_indisponivel}` |
| `init` + `rate_limit_event` `rejected` + `result` `is_error` (parede 2.1.287) + stderr do sandbox | `{:erro, {:cota, ...}}` |
| `rate_limit_event` + `result` n0 com "You've hit your limit", sem texto do sandbox | `{:erro, {:cota, ...}}` |
| só `result` n0 com "You've hit your limit" | `{:erro, {:cota, nil}}` |
| `init` + `assistant` recusando + `result` success + stderr do sandbox | `{:ok, _}` (caminho normal) |
| `priv/probes/amostras/sessao-com-ferramenta.jsonl` (sessão real) + stderr do sandbox | caminho normal (`:fora_do_confinamento` da amostra) |
| só `init` (sessão cortada) + stderr do sandbox | `{:erro, :saida_ininteligivel}` |
| só `result` n0 de erro com outro texto ("Invalid API key") | `{:ok, %Resposta{motivo_parada: :recusa}}` (como antes) |
| ruído não-JSON + stderr do sandbox | `{:erro, :sandbox_indisponivel}` |

Nenhuma sessão que subiu virou `:sandbox_indisponivel`; nenhuma parede virou outra coisa.

**Sem regressão do aprovado no ciclo 1:** `git diff 949db1b HEAD -- lib test` = exatamente o `45d002e` (77 + 70
linhas); `linha/1`, `@sandbox_cli`, `sandbox_do_shell/1` e os testes dos critérios 1/3/4 intactos. Os commits
`cfd8692`, `7df4b97` e `5ac2b3d` tocam só o arquivo da tarefa.

- [menor] `lib/fabrica/operario/claude_cli.ex:124` (moduledoc) — a linha "viraria pelo caminho normal), nao
  parede de cota. O mesmo vale para o **Windows nativo**..." ficou com ~120 colunas, fora do padrão do resto do
  bloco. Só estética; o lint passou.
- [menor] (registro, não defeito) O caso "ruído não-JSON no stdout + texto do sandbox no stderr" também fecha
  como `:sandbox_indisponivel`, porque `eventos/1` descarta linhas não-JSON. É coerente (nada subiu e o CLI
  disse por quê) e só o próprio CLI escreve no stderr do processo — o stderr dos comandos do agente vai para o
  `tool_result`, no stdout.

O que verifiquei: o diff inteiro de `45d002e` (lib e teste) e o stat dos três commits de gestão; a faixa
`949db1b..HEAD` em `lib/` e `test/`; `eventos/1`, `cota/2`, `atendida?/1` e `@erros_proprios` em
`claude_cli.ex:742-870` (abri para julgar a interação com a T-087, que o diff não mostra) e `responder/2`
(`:396-403`, para confirmar que o erro nomeado sai sem envelope); a sonda sem modelo acima. Não rodei
`mix test` nem `mix fabrica.ci` (medidos neste HEAD pelo orquestrador) nem o `claude` com modelo.

