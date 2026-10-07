---
id: T-083
titulo: "Confinamento: UNC com barras MISTAS (`\\/servidor`, `/\\servidor`) é recusado antes de qualquer acesso ao disco"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-081]
areas: [lib/fabrica/ferramentas/confinamento.ex, test/fabrica/ferramentas/confinamento_test.exs]
tentativas: 1
criada: 2026-10-01
atualizada: 2026-10-02T00:48:10Z
---

## Objetivo
`Confinamento.resolver/2` recusa com `{:erro, :caminho_unc}` todo caminho de rede, inclusive os
escritos com as duas barras misturadas no prefixo, ANTES de qualquer chamada ao sistema de arquivos.

## Contexto
Achado `menor` do revisor da T-081 (seção Revisão de `T-081-semantica-de-caminho-por-so.md`),
pré-existente e fora do diff daquela tarefa:

- `recusar_unc/1` (~l. 160-166 de `lib/fabrica/ferramentas/confinamento.ex`) só reconhece prefixo
  HOMOGÊNEO: `\\` ou `//`. `\/srv/share/x` e `/\srv\share\x` passam pela recusa.
- No Linux não é fuga (sondado pelo revisor: caem em `:fora_do_confinamento`). No Windows (só
  inspeção), o caminho chega a `real/1`, que faz `:file.read_link_all/1` num caminho de REDE antes de
  recusar — um acesso SMB que não deveria existir. Um agente que mande `\/servidor-externo/x` faz a
  máquina abrir conexão com o servidor (e, no Windows, oferecer credenciais NTLM a ele).
- Conserto barato e provável: checar o prefixo depois de trocar `\` por `/` (o mesmo contrato da
  D-014: `\` é separador em toda plataforma). Confirme lendo o código.

## Critérios de aceite
- [ ] `resolver/2` devolve `{:erro, :caminho_unc}` para `\/srv/share/x`, `/\srv\share\x`,
      `\\srv\share\x` e `//srv/share/x` — teste novo com as quatro formas, que falha antes do conserto
      nas duas primeiras.
      `verificar: mix test test/fabrica/ferramentas/confinamento_test.exs`
- [ ] Caminho absoluto unix comum (`/home/x/...`) e caminho relativo começando com uma barra
      invertida só (`\lib\foo.ex`) NÃO viram `:caminho_unc` (teste explícito).
      `verificar: mix test test/fabrica/ferramentas/confinamento_test.exs`

## Notas de execução

### Ciclo 1

**O que foi feito.** `recusar_unc/1` (`lib/fabrica/ferramentas/confinamento.ex`) passou a julgar o
prefixo DEPOIS de trocar `\` por `/` — o mesmo contrato da D-014 já usado em `juntar/2` e
`normalizar/1`: `caminho |> String.replace("\\", "/") |> String.starts_with?("//")`. Com isso
`\/srv` e `/\srv` viram o `//srv` que o Windows abre como caminho de rede e são recusados como
`:caminho_unc`. Uma barra só (`/home/...`, `\lib\...`) continua não sendo prefixo de rede.
A recusa segue sendo o PRIMEIRO passo do `with` de `resolver/2`, antes de `juntar/2` e
`dentro?/2` (onde mora `real/1`): nenhum acesso ao disco antes dela. `real/1`/`andar/3`/
`partir_destino/2` da T-082 não foram tocados.

**Arquivos alterados**
- `lib/fabrica/ferramentas/confinamento.ex` — `recusar_unc/1` + comentário (por que normalizar
  antes, e por que isso importa no Windows: SMB/NTLM).
- `test/fabrica/ferramentas/confinamento_test.exs` — novo `describe "escape 8: UNC com barras
  MISTAS no prefixo (T-083)"` no FIM do arquivo, 2 testes (um por critério):
  - as quatro formas (`\/srv/share/x`, `/\srv\share\x`, `\\srv\share\x`, `//srv/share/x`) →
    `{:erro, :caminho_unc}`; asserção por mapa forma→resultado, para a falha dizer QUAL escapou;
  - absoluto unix dentro da raiz → `{:ok, _}`; `/home/x/arq.txt` e `\lib\foo.ex` → erro que NÃO é
    `:caminho_unc` (ambos dão `:fora_do_confinamento`).

**Prova do "antes" (teste escrito primeiro, `git stash` só do `lib/`).** Sem o conserto: 43 testes,
1 falha, e o diff mostra exatamente as duas formas mistas em `{:erro, :fora_do_confinamento}` e as
duas homogêneas já em `:caminho_unc`. Com o conserto: 43 testes, 0 falhas.

**Prova de "antes de qualquer acesso ao disco" (strace, Linux).** Script resolvendo
`\/srvt083/share/x` e `/\srvt083\share\x`, sob `strace -f -e trace=readlink,readlinkat,newfstatat,statx,stat,lstat,openat`:
- SEM o conserto (stash): 6 syscalls em `srvt083` — `readlink("/srvt083")`,
  `readlink("/srvt083/share")`, `readlink("/srvt083/share/x")`, ×2 formas. É exatamente o
  `read_link_all` de `real/1` que, no Windows, seria um acesso SMB ao servidor.
- COM o conserto: 0 syscalls em `srvt083`.

**Fluxo real (`Arquivo.ler/2`, raiz = projeto):** as quatro formas → `{:erro, :caminho_unc}`;
`/home/x/arq.txt` e `\lib\foo.ex` → `{:erro, :fora_do_confinamento}`; `mix.exs` → lido.

**Lint/format:** `mix format --check-formatted` e `mix credo --strict` nos 2 arquivos: limpos.

**Bateria `mix fabrica.ci`:**
- Corrida 1: `testes` FALHOU só pela intermitente conhecida
  `test/fabrica/criterios/classe_falha_test.exs:315` (1269 testes, 1 falha; fora das áreas desta
  tarefa); formato/compilar/lint ok, tipos/backup não rodaram.
- Corrida 2: **6/6 ok** (formato, compilar, lint, testes, tipos, backup).

**Reproduzir:** `mix test test/fabrica/ferramentas/confinamento_test.exs`

Sem dependência nova. Sem decisão de arquitetura nova (aplica a D-014).

**Commit:** `7a51370`

Nota para o orquestrador (não feito, fora do escopo): `\\?\C:\...` e `\\.\COM1` (namespaces de
dispositivo do Win32) já caem em `:caminho_unc` pelo prefixo `//` — antes e depois deste conserto.
Se um dia quiserem motivo próprio para eles, é tarefa nova.


## Verificação

### Ciclo 1

- **[PASSOU] [executado] Critério 1: `resolver/2` devolve `{:erro, :caminho_unc}` para as quatro formas de UNC (barras mistas e homogêneas)**
  Comando: `mix test test/fabrica/ferramentas/confinamento_test.exs`
  Saída: 43 tests, 0 failures (inclui os 2 novos testes de escape 8)
  Detalhes: As quatro formas testadas — `\/srv/share/x`, `/\srv\share\x`, `\\srv\share\x`, `//srv/share/x` — retornam `{:erro, :caminho_unc}` conforme esperado. O teste usa um mapa forma→resultado para evidenciar qual forma eventualmente escapasse.

- **[PASSOU] [executado] Critério 2: Caminho absoluto unix e barra invertida única NÃO viram `:caminho_unc`**
  Comando: `mix test test/fabrica/ferramentas/confinamento_test.exs`
  Saída: 43 tests, 0 failures (inclui os 2 novos testes de escape 8)
  Detalhes: `/home/x/arq.txt` e `\lib\foo.ex` retornam `{:erro, :fora_do_confinamento}`, não `:caminho_unc`, confirmando que uma barra só não dispara a recusa de UNC.

Suíte completa: Bateria 1 falhou (intermitente conhecida em classe_falha_test.exs:315), Bateria 2 passou 6/6 estágios (formato, compilar, lint, testes, tipos, backup) — `mix fabrica.ci`

Segurança (strace): Confirmado que a recusa de UNC ocorre ANTES de qualquer acesso ao disco:
- UNC com `\/srvT083`, `/\srvT083`, `\\srvT083`, `//srvT083` recusados como `:caminho_unc`
- Strace log (20224 linhas) não contém NENHUMA syscall relacionada a `srvT083` — zero readlink, stat, ou openat sobre caminho de rede
- Caminho válido (`mix.exs`) resolve corretamente como `{:ok, "...projeto/mix.exs"}`

Graus de prova: 2 executados, 0 inspecionados, 0 julgados

HEAD: 7a51370


## Conformidade

### Ciclo 1

Conformidade: cumpre

- [Critério 1 — `\/srv/share/x`, `/\srv\share\x`, `\\srv\share\x`, `//srv/share/x` → `{:erro, :caminho_unc}`,
  teste novo que falha antes do conserto nas duas primeiras] →
  `lib/fabrica/ferramentas/confinamento.ex:166-172` (`recusar_unc/1` normaliza `\`→`/` e testa o
  prefixo `//`) + `test/fabrica/ferramentas/confinamento_test.exs:472-478` (as quatro formas,
  asserção por mapa forma→resultado). O "falha antes" vale por construção: o código antigo
  (`starts_with?(c, ["\\\\", "//"])`) é falso para `\/` e `/\`, que então caíam em
  `juntar`/`dentro?` e saíam `:fora_do_confinamento` — o mesmo que as Notas mediram com `git stash`.
- [Critério 2 — `/home/x/...` e `\lib\foo.ex` NÃO viram `:caminho_unc`, teste explícito] →
  `confinamento_test.exs:480-489` (absoluto dentro da raiz → `{:ok, _}`; `/home/x/arq.txt` e
  `\lib\foo.ex` → erro com `refute motivo == :caminho_unc`).
- [Objetivo — recusa ANTES de qualquer chamada ao sistema de arquivos] → `recusar_unc/1` é o
  primeiro passo do `with` de `resolver/2` (`confinamento.ex:73`) e é pura (só `String.replace` +
  `starts_with?`); `real/1` só roda dentro de `dentro?/2`, passo 4. Todo caminho de agente chega
  ao disco por `resolver/2` (`arquivo.ex:48,70,88,100`, `comando.ex:57,100`,
  `claude_cli.ex:884`); `dentro?/2` não é chamado de fora com entrada de agente. Strace do
  executor e do testador: 0 syscalls no nome do "servidor" com o conserto.
- [Escopo/areas] → diff de código confinado às duas `areas` (+ `MAPA.md` regenerado e o arquivo da
  tarefa). `real/1`, `andar/3` e `partir_destino/2` da T-082 intocados (`git show 7a51370` só
  altera `recusar_unc/1` e o comentário dela; `git diff 7a51370 HEAD` só toca o arquivo da tarefa).
- [Decisões] → aplica exatamente a D-014 regra 1 (`\` é separador em toda plataforma), a mesma
  troca já usada em `juntar/2`, `normalizar/1` e `recusar_dispositivo/1`. Sem dependência nova.

Nada ficou de fora. Tarefa sem interface: prova visual não se aplica.

## Revisão

### Ciclo 1

**Aprovado sem ressalvas** (nenhum achado `critica`/`importante`; nenhuma nota `menor` de processo:
`**Commit:** \`7a51370\`` estava gravado).

**O que verifiquei**
- Diff inteiro de `7a51370` (código + teste). Abri `confinamento.ex` na íntegra só para conferir
  dois invariantes que o trecho alterado assume: (a) que `recusar_unc/1` continua o 1º passo do
  `with` de `resolver/2`, antes de `real/1`; (b) que a T-082 não foi tocada. Ambos confirmados.
- Grep dos chamadores de `Confinamento.*` em `lib/`: toda entrada de agente passa por
  `resolver/2`; nenhum atalho por `dentro?/2`.
- **Sonda isolada** (`MIX_ENV=test mix run --no-start <script no scratchpad>`, raiz temporária em
  `/tmp`, nada escrito no projeto), caso a caso:
  - **Recusados como `:caminho_unc` (22/22):** as 4 formas do critério; 3+ barras em toda
    combinação — `/\/srv`, `\/\srv`, `///srv`, `\\\srv`, `/\\srv`, `\//srv`, `////srv`;
    namespaces Win32 — `\\?\C:\x`, `\\?\UNC\srv\share\x`, `\\.\COM1`, `\\.\pipe\x`,
    `//?/UNC/srv/x`, `/\?\UNC\srv\x`, `\/.\pipe\x`; e os prefixos nus `\\`, `//`, `\/`, `/\`.
    A regra equivale a "os dois primeiros caracteres são separadores, qualquer mistura" — cobre
    por construção todo prefixo que vira `//` depois de `\`→`/`.
  - **Não recusados como UNC (23/23):** relativos `lib/foo.ex`, `lib\foo.ex`, `./lib/foo.ex`,
    `.\lib\foo.ex`, `lib//foo.ex`, `lib\\foo.ex`, `.`, `""` → `{:ok, ...}`; absoluto unix dentro da
    raiz, com `/` e com `\` → `{:ok, ...}`; `\lib\foo.ex`, `/home/x/arq.txt`, `C:/x/y`, `C:\x\y`,
    `c:\\srv\share` → `:fora_do_confinamento`; separador duplo no MEIO (`./\/srv`, `a/\/b`) →
    dentro da raiz; `/..//srv/share`, `/.//srv/share`, `/./\srv`, `\??\UNC\srv\share` →
    `:fora_do_confinamento`; ` \\srv\share` (espaço à frente) e `file://srv/share` → relativos,
    dentro da raiz.
- **Formas que não começam com dois separadores mas poderiam VIRAR UNC no Windows** (só inspeção,
  fonte do Elixir 1.19.4 instalado, `lib/elixir/lib/path.ex`): em `win32`, `Path.absname` só
  produz `//` pela cláusula UNC de `do_absname_join/4`, que exige `result == []` — isto é, dois
  separadores no INÍCIO do texto, exatamente o que a recusa agora pega. `/x` (volume-relativo)
  passa por `absname_vr/3`, que antepõe o volume do cwd (`c:/`), e `expand_dot/2` nunca remove
  esse cabeçalho; `//` no meio é colapsado. Logo `/..//srv`, `/.//srv` e `\??\UNC\...` viram
  `c:/srv...`/`c:/??/...` — locais, sem SMB.

**Observações (não são achados, não reprovam):**
- Falso positivo seguro, PRÉ-EXISTENTE: `\\?\C:\<raiz>\x` (caminho LOCAL no namespace estendido
  do Win32) e `//home/...` no Linux (POSIX ≡ `/home/...`) são recusados como `:caminho_unc` — já
  eram antes da T-083 (prefixo homogêneo). A T-083 só estende o mesmo fail-closed a `/\home...`.
  Nenhum caminho que o agente escreveria normalmente (os quatro grupos do pedido: relativo,
  absoluto unix, `\lib\foo.ex`, `C:/...`) passou a ser recusado. O executor já sinalizou o motivo
  próprio para namespaces como tarefa eventual.
- Limite fora do escopo do texto: letra de unidade MAPEADA para compartilhamento (`Z:\...`) é
  rede e é indistinguível no texto; chega a `real/1` e é julgada por confinamento. Não é servidor
  escolhido pelo agente (a sessão SMB já existe, configurada pelo usuário), então não é a fuga
  de NTLM que a tarefa fecha. Idem se o próprio cwd do BEAM estiver num UNC (ambiente, não
  entrada).

**O que só a bateria de casa (Windows) confirma**
- Que os 2 testes novos passam lá também — esperado por construção: `recusar_unc/1` não tem ramo
  por SO (sem `windows?/0`), e a decisão é tomada antes de qualquer chamada dependente de
  plataforma.
- A ausência de tráfego SMB de fato (Procmon/captura de rede ao resolver `\/servidor/x`): aqui
  ela está provada por strace no Linux (o `read_link_all` some), não observada no Windows.
- A análise acima de `Path.expand` em `win32` (nenhuma forma sem prefixo duplo vira `//`), que
  foi feita lendo a fonte, não executada.

