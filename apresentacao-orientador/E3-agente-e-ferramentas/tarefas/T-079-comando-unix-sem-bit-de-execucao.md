---
id: T-079
titulo: "Portabilidade Linux (A): `Comando` roda o script temporário sem depender do bit de execução"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: []
areas: [lib/fabrica/ferramentas/comando.ex, test/fabrica/ferramentas/comando_test.exs]
tentativas: 1
criada: 2026-10-01
atualizada: 2026-10-01
---

## Objetivo
Fazer o ramo unix de `Fabrica.Ferramentas.Comando` executar de verdade: hoje TODO comando que a
fábrica roda no Linux sai com exit 126 (`Permission denied`) antes de chegar ao programa. Ao fim,
`test/fabrica/ferramentas/comando_test.exs` passa inteiro no Linux, e os 2 testes T-018d de
`claude_cli_test.exs` que dependem do `Comando` também.

## Contexto
Causa raiz **A** da linha de base da bateria na nuvem
(`_gestao/evidencias/linha-de-base-nuvem-2026-10-01.txt`, 14 das 23 falhas). O projeto só tinha
rodado no Windows; o ramo unix nunca foi exercitado.

- `escrever_script/4` (~l. 165-181 de `lib/fabrica/ferramentas/comando.ex`) grava
  `/tmp/fabrica-cmd-*.sh` com `File.write!/2` — sem bit de execução.
- `shell/0` (~l. 286-291) devolve `{"sh", ["-c"]}`, e o caminho do script vai como argumento do
  `-c`: o `sh` tenta EXECUTAR o arquivo como comando → `Permission denied`, exit 126. No Windows,
  `cmd /c arquivo.bat` não exige bit nenhum, por isso nunca apareceu.
- Conserto provável: `sh <arquivo>` (o `sh` LÊ o script; dispensa bit de execução e não abre
  janela para interpretar o caminho). Alternativa pior: `chmod` no temporário — mais uma syscall
  que pode falhar e mais estado para limpar. Confirme lendo o código antes de fixar.

**Pode haver uma segunda causa unix escondida atrás desta.** Com o exit 126 na frente, os testes de
prazo e de árvore de processos (`comando_test.exs:278` e `:315`) nunca chegaram a exercitar o
encerramento por prazo no Linux. Se, consertado o 126, algum deles ainda falhar por outra razão de
plataforma, ela é desta tarefa (mesma área, mesmo ramo nunca exercitado) — registre nas Notas o que
era e como ficou.

**O ramo Windows não muda.** Esta máquina não tem como provar o Windows; qualquer alteração ali é
regressão não verificada. Se o conserto exigir mexer em código compartilhado pelos dois ramos,
registre nas Notas o porquê.

Os testes falhando hoje (linha de base): `comando_test.exs` :40, :53, :66, :85, :138, :168, :240,
:278, :315, :387, :399, :419; `claude_cli_test.exs` :800, :826.

## Critérios de aceite
- [ ] `comando_test.exs` passa inteiro no Linux — os 12 testes da linha de base incluídos.
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] Os 2 testes T-018d de `claude_cli_test.exs` (:800 e :826 na linha de base) passam, sem
      alteração em `claude_cli.ex` nem no teste.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] O ramo `{:win32, _}` de `escrever_script/4` e de `shell/0` sai do diff byte a byte igual, e a
      execução no unix não depende do modo do arquivo temporário. (inspecionável — o revisor confere
      no diff)

## Notas de execução

### Ciclo 1

**Causa 1 (a da linha de base) — exit 126.** Confirmada lendo o código: `shell/0` devolvia
`{"sh", ["-c"]}` e o caminho do script ia como argumento do `-c`, então o `sh` tentava EXECUTAR o
arquivo gravado por `File.write!/2` (sem bit de execução). Conserto: o ramo unix de `shell/0` passa a
`{"sh", []}` — o `sh` LÊ o script (`sh <arquivo>`). Sem `chmod`, sem estado novo. Comentário no
código explica o porquê.

**Causa 2 (a escondida atrás do 126, como o Contexto previa) — teste do NETO (`:315`).** Consertado
o 126, o teste passou a falhar com "o neto sobreviveu ao prazo". Medido fora da suíte (script de
rascunho reproduzindo o cenário): o `sh` lançado pela `Port` já nasce líder de grupo e de sessão
(`pid == pgid == sid`, o `erl_child_setup` faz o `setsid`), e `kill -TERM -- -<pgid>` MATA o grupo
inteiro — mas o neto, órfão, é adotado pelo PID 1 e fica `Z <defunct>` até ser colhido. Neste
contêiner o PID 1 (`process_api`) colhe preguiçosamente (o zumbi sumiu em ~5 s), e `kill -0` — que é
o que `ArvoreProcessos.vivo?/1` usa no unix — ACHA o zumbi. Ou seja: o encerramento já funcionava; o
oráculo do teste é que confundia "terminado e não colhido" com "vivo". Conserto no teste (dentro das
`areas`): `sobreviveu?/1` = `vivo?/1` **e não** zumbi (`ps -o stat= -p <pid>` começando com `Z`).
Um neto que realmente escape do prazo está `S`/`R`, nunca `Z`, e continua reprovando (conferido:
`sleep` em segundo plano aparece como `S`). No Windows `zumbi?/1` é sempre `false` — comportamento
idêntico ao anterior. Nada foi alterado em `arvore_processos.ex` (fora das `areas`).
`setsid` como alternativa foi MEDIDO e descartado: como o processo já é líder de grupo, o `setsid(1)`
faz `fork` e o `os_pid` da porta deixaria de ser o do grupo — pioraria.

**Causa 3 — `:419` ("esta execução exercitou o caminho desta máquina").** Afirmava `:windows`
incondicionalmente: só passava porque o projeto nunca tinha rodado fora do Windows. Reescrito para
afirmar o caminho DESTA máquina, e não só pela detecção (seria tautológico): roda `echo "$0"` /
`echo %~x0` e confere que o script lido foi o `.sh` no unix / o `.bat` no Windows.

**Teste novo (critério 3):** `describe "o script temporario (T-079)"` — no unix roda
`if [ -x "$0" ] ...` e exige `codigo 0` + `"sem-bit\n"`: prova que o comando rodou E que o arquivo
lido NÃO tinha bit de execução (um `chmod` faria este teste falhar). No Windows, só confere que o
`.bat` roda (não há bit de execução lá).

**Prova vermelho → verde** (com `git stash` só de `comando.ex`, devolvido em seguida; HEAD sempre em
`master`): sem o conserto, `comando_test.exs` → 29 testes, **13 falhas** (as 12 da linha de base + o
teste novo); com o conserto → **29 testes, 0 falhas**. Teste do neto repetido 5× isolado: 5/5 verde.
`claude_cli_test.exs` → **67 testes, 0 falhas** (inclui `:800` e `:826`), sem tocar em `claude_cli.ex`
nem no teste. `mix format --check-formatted` e `mix credo --strict` nos dois arquivos: limpos (o credo
leu "todo comando..." no começo de uma linha de comentário como tag TODO — reescrito para "qualquer").

**Ramo Windows:** `escrever_script/4` não foi tocado; em `shell/0` só a linha do ramo `_` mudou
(`{"sh", ["-c"]}` → `{"sh", []}`) — a linha `{:win32, _} -> {"cmd", ["/c"]}` sai igual no diff.
Nenhum código compartilhado entre os ramos foi alterado.

**Arquivos alterados:** `lib/fabrica/ferramentas/comando.ex`, `test/fabrica/ferramentas/comando_test.exs`.
Deps novas: nenhuma.

**MAPA não regenerado no commit — de propósito.** `node ../../_sistema/ferramentas/mapa.mjs .` nesta
máquina Linux despeja `_build/dev/**` (101 linhas de `.beam`) no `_gestao/MAPA.md`, apesar de
`/_build/` estar no `.gitignore`. Nenhum símbolo público mudou nesta tarefa (`shell/0` é privada, os
helpers novos são `defp` do teste), então o MAPA do HEAD continua correto; descartei o regerado em vez
de commitar lixo.

**Sugestões para o orquestrador (não feitas — fora das `areas`):**
1. `ArvoreProcessos.vivo?/1` no unix deveria tratar zumbi como morto (`ps -o stat=`), em vez de
   cada chamador ter de saber disso; hoje o único chamador é este teste.
2. `rodar/4` (sem shell) lança o programa direto pela `Port`; não foi exercitado com prazo no Linux
   por nenhum teste. Pela medição acima ele também nasce líder de grupo, então deve funcionar — mas
   não há teste que prove.
3. `_sistema/ferramentas/mapa.mjs` no Linux inclui `_build/` no MAPA (provavelmente o filtro de
   ignorados depende de algo do Windows) — é da raiz da fábrica, não deste projeto.

**Reproduzir:** `cd /home/user/Generic-Multi-Agents/projetos/fabrica-v2 && mix test test/fabrica/ferramentas/comando_test.exs && mix test test/fabrica/operario/claude_cli_test.exs`

**Commit:** `4113383`


## Verificação

### Ciclo 1

- **[PASSOU] [executado] Critério 1: `comando_test.exs` passa inteiro no Linux**
  Comando: `mix test test/fabrica/ferramentas/comando_test.exs`
  Saída: 29 tests, 0 failures (7.5s). Inclui os 12 testes da linha de base (`:40, :53, :66, :85, :138, :168, :240, :278, :315, :387, :399, :419`).

- **[PASSOU] [executado] Critério 2: Os 2 testes T-018d de `claude_cli_test.exs` (:800 e :826) passam**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: 67 tests, 0 failures (1.1s). Inclui `:800` (prompt com quebras de linha, aspas, &) e `:826` (limpeza de temporário em prazo estourado).

- **[PASSOU] [inspecionado] Critério 3: Ramo Windows sai do diff igual; execução unix não depende do bit de execução**
  Comando: `git show 4113383 lib/fabrica/ferramentas/comando.ex` (inspeção do diff)
  Base: Linha 295 `{:win32, _} -> {"cmd", ["/c"]}` sai intacta no diff. Única alteração no ramo unix: `_ -> {"sh", ["-c"]}` → `_ -> {"sh", []}` (comentário longo explicando que o arquivo vai como ARGUMENTO do `sh`, não como comando com `-c`, dispensando bit de execução).

Suíte completa: 1192 testes, 5 falhas — `mix test`. A suíte inteira foi executada para verificar regressões. As 5 falhas remanescentes (ferramentas_test:43, confinamento_test:97/208/224, exclusao_test:149) não estão entre os 14 critérios de T-079 e já existiam na linha de base (T-080 e posteriores as abordam).

Graus de prova: 2 executados, 1 inspecionado, 0 julgados.

## Conformidade

### Ciclo 1

Conformidade: cumpre

- [Critério 1 — `comando_test.exs` passa inteiro no Linux, 12 da linha de base incluídos] →
  `lib/fabrica/ferramentas/comando.ex:296` (`_ -> {"sh", []}`; o único chamador de `shell/0` é
  `rodar_separado/3`, l. 107-110, que monta `prefixo ++ [para_o_shell(script)]` → `sh <arquivo>`),
  mais os dois ajustes de teste que o Contexto autorizava: o oráculo do neto
  (`comando_test.exs:350`, `sobreviveu?/1` em l. 469-480) e o `:419` reescrito para a plataforma
  corrente (l. 419-440). Medido pelo testador: 29 testes, 0 falhas.
- [Critério 2 — T-018d de `claude_cli_test.exs` (:800, :826) passam sem tocar `claude_cli.ex`
  nem o teste] → `git show --stat 4113383`: só `comando.ex`, `comando_test.exs` e o arquivo da
  tarefa. Testador: 67 testes, 0 falhas.
- [Critério 3 — ramo `{:win32, _}` de `escrever_script/4` e `shell/0` byte a byte igual; unix
  independe do modo do temporário] → conferido no diff: `escrever_script/4` não aparece no diff;
  em `shell/0` a linha `{:win32, _} -> {"cmd", ["/c"]}` é contexto, não `+`/`-`. Independência do
  modo: `sh <arquivo>` só exige leitura; provado por `comando_test.exs:443-460` (o script se
  autoexamina com `[ -x "$0" ]` e exige `sem-bit`, o que um `chmod` faria falhar).

**Objetivo (no espírito):** cumpre. O ramo unix passa a executar de fato, pelo conserto que o
Contexto apontava como o certo (sem `chmod`, sem estado novo). A "segunda causa escondida" que o
Contexto previa apareceu (neto zumbi) e foi tratada dentro das `areas`, com medição e com o motivo
nas Notas. O oráculo novo continua reprovando um neto que de fato escape (estado `S`/`R`), então
não afrouxa o teste.
**Escopo:** nada além do pedido. `areas` respeitadas; nenhuma dep nova; o MAPA não foi regerado
porque nenhum símbolo público mudou (justificado nas Notas).
**Prova visual:** não se aplica (sem interface).
**Fora desta tarefa, já anotado pelo executor:** `ArvoreProcessos.vivo?/1` segue tratando zumbi
como vivo no unix (fora das `areas`), e `rodar/4` com prazo no Linux não tem teste.

## Revisão

### Ciclo 1

Aprovado sem achados `critica`/`importante`.

Verificado: o diff inteiro de `4113383` (código + teste) e `8124053` (só o hash). O commit está
registrado nas Notas, como pede o protocolo. Para confirmar que trocar `["-c"]` por `[]` não quebra
nenhum outro chamador de `shell/0`, abri o trecho de `comando.ex` em volta (l. 97-124, 147-182 e
279-318). O único chamador é `rodar_separado/3`, que sempre passa o CAMINHO de um script e nunca uma
linha solta. Por isso `sh <arquivo>` é equivalente ao antigo `sh -c <arquivo>` com shebang
`#!/bin/sh`: o mesmo interpretador, `$0` igual, redirecionamentos explícitos dentro do script.
`para_o_shell/1` é a identidade no unix. O caminho do temporário é absoluto e vai como argv da
`Port`, sem passar por interpolação de shell. De brinde, isso também funciona com `/tmp` montado
`noexec`. Também abri `comando_test.exs:312-362` (contexto do teste do neto) para confirmar que
o `refute` alterado roda no ramo unix.

Notas `menor` (não reprovam):
- [menor] `test/fabrica/ferramentas/comando_test.exs:475` — `zumbi?/1` chama
  `System.cmd("ps", ...)`. Numa imagem mínima sem `procps`, isso levanta `ErlangError :enoent` em
  vez de devolver `false`. Isso só acontece quando `vivo?/1` já deu `true`, então o teste do neto
  quebraria com exceção no lugar da mensagem explicativa. Não afeta este ambiente nem o Windows.
- [menor] `test/fabrica/ferramentas/comando_test.exs:455-457` — o teste `sem-bit` supõe que o
  sistema de arquivos de `System.tmp_dir!()` respeita os bits de modo. Num `TMPDIR` em montagem
  que mostra tudo como `0777` (drvfs/FUSE), `[ -x "$0" ]` dá verdadeiro e o teste falha com o
  código correto. É fragilidade do oráculo e não da entrega.
- [menor] O teste `:419` reescrito passou a afirmar `echo %~x0` → `.bat` no Windows, e isso não
  pôde ser executado aqui. A expansão está correta para um `.bat` chamado por `cmd /c <caminho>`,
  mas a primeira bateria no Windows é que vai confirmar.

