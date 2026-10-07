---
id: T-081
titulo: "Portabilidade Linux (C): barra invertida é separador em toda plataforma; caixa segue o SO — e os testes dizem isso"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-080]
areas: [lib/fabrica/ferramentas/confinamento.ex, test/fabrica/ferramentas/confinamento_test.exs, test/fabrica/fila/exclusao_test.exs, test/fabrica/agente/ferramentas_test.exs]
tentativas: 1
criada: 2026-10-01
atualizada: 2026-10-01
---

## Objetivo
Definir e provar a semântica de caminho do confinamento no Linux, que até hoje só foi escrita para
o Windows: **barra invertida é separador em QUALQUER plataforma** (contrato de entrada do agente) e
**a comparação ignora caixa SÓ no Windows** (é propriedade do sistema de arquivos). Os 4 testes
que hoje falham no Linux passam a afirmar a regra da plataforma em que rodam — sem pular nenhum.

## Contexto
Causa raiz **C** da linha de base da bateria na nuvem
(`_gestao/evidencias/linha-de-base-nuvem-2026-10-01.txt`, 4 das 23 falhas). Decisão do
orquestrador registrada em `_gestao/DECISOES.md` (D-014); resumo:

1. **Barra invertida = separador, sempre.** `normalizar/1` já troca `\` por `/` em toda plataforma,
   mas `juntar/2` NÃO: no Linux, `resolver(raiz, "..\\fora\\segredo.txt")` expande para
   `<raiz>/..\fora\segredo.txt` (um nome só, DENTRO da raiz), `dentro?/2` compara a forma
   normalizada `<raiz>/../fora/segredo.txt` (que "começa com a raiz") e devolve `{:ok, …}`. Não é
   fuga no Linux, mas é o pior dos dois mundos: o módulo julga um caminho e devolve outro, e um
   agente que escreva `lib\foo.ex` (a doutrina e os exemplos da fábrica são do Windows) cria um
   arquivo chamado literalmente `lib\foo.ex` na raiz. Conserto: `juntar/2` aplica a mesma troca de
   barra antes de expandir. Isto faz passar `confinamento_test.exs` :97 ("recusa travessia com
   barra invertida") e :208 (cuja 1ª asserção, `..\FORA\SEGREDO.TXT`, falha pelo MESMO motivo, não
   por caixa).
2. **Caixa segue o SO.** No Linux `/home/x/PROJETO` e `/home/x/projeto` são diretórios DIFERENTES:
   comparar sem caixa ali abriria fuga (um irmão com o mesmo nome em outra caixa passaria por
   "dentro"). O código já faz isso certo (`windows?/0`); errados são os testes que afirmam a regra
   do Windows sem checar o SO:
   - `confinamento_test.exs:224` ("normalizar deixa tudo comparável") — no Windows segue afirmando
     a igualdade com caixa diferente; no Linux afirma que a barra é normalizada e a caixa
     PRESERVADA;
   - `fila/exclusao_test.exs:149` ("a comparação ignora barra invertida e caixa") — barra invertida
     ignorada nas duas plataformas; caixa ignorada só no Windows, e no Linux caixa diferente dá
     `{:erro, :fora_das_areas}`.
   Siga o padrão que o próprio arquivo já usa em :217 (`if match?({:win32, _}, :os.type())`), mas
   com asserção nos DOIS ramos — teste que no Linux não afirma nada é teste pulado em silêncio.

3. **Um quinto teste da mesma causa, achado pelo executor da T-080:** `agente/ferramentas_test.exs:43`
   ("cada ferramenta chama o módulo real") roda, na linha 56,
   `ferramentas["rodar"].(%{"programa" => "cmd", "args" => ["/c", "echo", "oi"]}, raiz)` — `cmd` não
   existe no Linux (`{:erro, {:executavel_ausente, "cmd"}}`). A T-080 tirou dele a causa B (as linhas
   de `ler`/`escrever`); o `cmd` é desta tarefa. O que o teste prova é que `rodar` chama o
   `Comando` REAL — escolha o programa pelo SO (`cmd /c echo oi` no Windows, `echo oi` fora dele) ou
   use um programa que exista nas duas, sem enfraquecer a asserção sobre a saída.

Depende da T-080 porque as duas mexem em `confinamento.ex`; rode sobre o conserto dela.

## Critérios de aceite
- [ ] `confinamento_test.exs` passa inteiro no Linux, e `resolver/2` recusa com
      `:fora_do_confinamento` uma travessia escrita só com barra invertida.
      `verificar: mix test test/fabrica/ferramentas/confinamento_test.exs`
- [ ] `exclusao_test.exs` passa inteiro no Linux, com um teste que afirma, no Linux, que a mesma
      área com caixa diferente é recusada.
      `verificar: mix test test/fabrica/fila/exclusao_test.exs`
- [ ] `agente/ferramentas_test.exs` passa inteiro no Linux, e no Windows o teste :43 continua
      exercitando o mesmo programa de antes (`cmd /c echo oi`).
      `verificar: mix test test/fabrica/agente/ferramentas_test.exs`
- [ ] Nenhum dos 4 testes da causa C (`confinamento_test.exs` :97, :208, :224;
      `exclusao_test.exs` :149) foi removido, marcado `@tag :skip`/excluído por tag, ou ficou sem
      asserção em alguma das duas plataformas; a expectativa do ramo Windows de cada um continua a
      mesma de antes. (inspecionável — o revisor confere no diff)
- [ ] `normalizar/1` continua sensível a caixa fora do Windows (o `windows?/0` não foi removido nem
      contornado). (inspecionável — o revisor confere no diff)

## Notas de execução

**O que mudou (D-014 implementada):**
- `lib/fabrica/ferramentas/confinamento.ex` — `juntar/2` troca `\` por `/` ANTES de expandir, em
  toda plataforma (a mesma troca de `normalizar/1`). Antes, no Linux, `..\fora\segredo.txt` virava
  UM nome dentro da raiz, `dentro?/2` julgava a forma normalizada e o módulo devolvia a outra.
  `normalizar/1` e `windows?/0` intocados (caixa continua preservada fora do Windows). Moduledoc
  ganhou as duas regras ("barra invertida é separador em qualquer plataforma"; "caixa segue o SO").
- `test/fabrica/ferramentas/confinamento_test.exs`
  - :97 e :208 — corpo INTOCADO; passam pelo conserto de `juntar/2` (a 1ª asserção de :208 caía
    pelo mesmo motivo de :97, não por caixa).
  - :224 — `if match?({:win32, _}, :os.type())`: ramo Windows com a MESMA asserção de antes;
    ramo Linux afirma `normalizar("C:\\Pasta\\Sub\\") == "C:/Pasta/Sub"` (barra normalizada, caixa
    preservada) e `refute` a igualdade com `C:/pasta/sub`.
  - novo `describe "semantica de caminho por SO (T-081, D-014)"` no FIM do arquivo (não move
    :97/:208/:224): :318 `resolver(raiz, "sub\\novo.txt")` devolve exatamente
    `<raiz>/sub/novo.txt`; :327 raiz em OUTRA caixa — Windows: `{:ok, _}`; Linux: irmão `PROJETO`
    criado de verdade e recusado como `:fora_do_confinamento` (absoluto e via `..\\PROJETO\\…`).
- `test/fabrica/fila/exclusao_test.exs:149` — barra invertida aceita nas duas plataformas; caixa
  diferente: Windows `:ok` (mesma expectativa de antes), Linux `{:erro, :fora_das_areas}` (dois
  casos). Nome do teste ajustado para não mentir no Linux: "a comparacao ignora barra invertida, e
  caixa so no Windows — como o confinamento" (mesma linha).
- `test/fabrica/agente/ferramentas_test.exs:43` — programa escolhido pelo SO: `cmd /c echo oi` no
  Windows (o de antes), `echo oi` fora dele (`/usr/bin/echo`, executável real). Asserção
  REFORÇADA: além de `codigo == 0`, agora `resultado.stdout =~ "oi"`.

**Prova do antes/depois (teste primeiro):** com os testes já escritos e `juntar/2` ainda antigo,
os 3 arquivos deram `61 tests, 4 failures` (:97, :208, :318, :327 — todas de `juntar/2`); :224,
:149 e :43 já passavam só com o ajuste do teste. Depois do conserto: `37/14/10 tests, 0 failures`.
Linha de base antes de qualquer edição: as 5 falhas da causa C (:97, :208, :224, :149, :43).
Consumidores de `Confinamento` também verdes: `arquivo_test`+`guardas_test` (61, 0 falhas),
`claude_cli_test`+`comando_test` (96, 0 falhas). `mix format --check-formatted` limpo.

**Fluxo real (Linux):** `Arquivo.escrever(raiz, "lib\\foo.ex", "oi", [])` → `{:ok, ".../lib/foo.ex"}`
e o único arquivo criado é `lib/foo.ex` (antes nasceria `lib\foo.ex` na raiz);
`resolver(raiz, "..\\fora\\segredo.txt")` → `{:erro, :fora_do_confinamento}`;
`normalizar("/X/Projeto")` → `"/X/Projeto"`.

**Não verificado aqui:** os ramos Windows (sem máquina Windows no contêiner). Ramos :224/:149/:43
mantêm a expectativa literal de antes; o ramo Windows do novo :327 (`{:ok, _}` para
`<base>/PROJETO/dentro.txt`) é o comportamento de `normalizar/1` com `downcase`.

**Sugestões (fora das `areas`, não feitas):**
- `lib/fabrica/fila/exclusao.ex:70-74` (doc de `permitir?/2`) só descreve a regra do Windows;
  acrescentar "fora do Windows a caixa distingue arquivos" (D-014).
- `confinamento_test.exs:217` ("o mesmo diretorio em maiusculas continua DENTRO") ainda não
  afirma nada fora do Windows — o novo :327 cobre a regra do Linux, mas o :217 poderia ganhar o
  ramo `else`.

**Reproduzir:** `cd /home/user/Generic-Multi-Agents/projetos/fabrica-v2 && mix test test/fabrica/ferramentas/confinamento_test.exs test/fabrica/fila/exclusao_test.exs test/fabrica/agente/ferramentas_test.exs`

**Commit:** `5281113`


## Verificação

### Ciclo 1

- **[PASSOU] [executado] Critério 1: `confinamento_test.exs` passa inteiro no Linux**
  Comando: `mix test test/fabrica/ferramentas/confinamento_test.exs`
  Saída: 37 tests, 0 failures (executado 3 vezes para garantir)

- **[PASSOU] [executado] Critério 2: `exclusao_test.exs` passa inteiro no Linux**
  Comando: `mix test test/fabrica/fila/exclusao_test.exs`
  Saída: 14 tests, 0 failures (executado 3 vezes)

- **[PASSOU] [executado] Critério 3: `agente/ferramentas_test.exs` passa inteiro no Linux**
  Comando: `mix test test/fabrica/agente/ferramentas_test.exs`
  Saída: 10 tests, 0 failures (executado 3 vezes)

- **[PASSOU] [inspecionado] Critério 4: Nenhum dos 4 testes foi removido ou pulado**
  Base: Inspeção do código em confinamento_test.exs (:97, :208, :224), exclusao_test.exs (:149).
  Resultado: Nenhum teste marcado com `@tag :skip`, não removidos. Asserções presentes nos dois ramos (if match?({:win32, _}, :os.type())).

- **[PASSOU] [inspecionado] Critério 5: `normalizar/1` continua sensível a caixa fora do Windows**
  Base: Inspeção do confinamento.ex linha 122: `if windows?(), do: String.downcase(normalizado), else: normalizado`.
  A função `windows?/0` (linha 227) não foi removida nem contornada. No Linux, caixa é PRESERVADA.

Suíte completa: 1194 tests, 0 failures da causa C
Bateria: `mix fabrica.ci` → 6 estágios OK (formato, compilar, lint, testes, tipos, backup)

**Nota sobre falhas intermitentes:** Durante as execuções, apareceram falhas intermitentes em `busca_test.exs:242` e `classe_falha_test.exs:315`. Estas:
1. Não estão na linha de base de 23 falhas (linha-de-base-nuvem-2026-10-01.txt)
2. Não estão nas áreas modificadas pela T-081 (confinamento.ex, confinamento_test.exs, exclusao_test.exs, ferramentas_test.exs)
3. Aparecem de forma não-determinística (às vezes sim, às vezes não)
4. São alheiras ao escopo desta tarefa (conforme PROTOCOLO_TAREFAS.md)

Graus de prova: 3 executados, 2 inspecionados, 0 julgados

## Conformidade

### Ciclo 1

Conformidade: cumpre

Revisado sobre `5281113` (código + testes) e `c04928e` (hash). Julgado contra o Objetivo e a
D-014 (barra invertida é separador em toda plataforma; caixa segue o SO).

- [C1 — `confinamento_test.exs` inteiro no Linux; `resolver/2` recusa travessia só com `\`] →
  `lib/fabrica/ferramentas/confinamento.ex:137-148` (`juntar/2` troca `\` por `/` antes de
  expandir); asserção em `confinamento_test.exs:97` (`"..\\fora\\segredo.txt"` →
  `:fora_do_confinamento`), corpo intocado; testador: 37 testes, 0 falhas.
- [C2 — `exclusao_test.exs` inteiro no Linux, com teste que afirma recusa da mesma área em
  outra caixa] → `test/fabrica/fila/exclusao_test.exs:149` ramo `else` (`lib\\FABRICA\\…` e
  `lib/fabrica/fila/Exclusao.ex` → `{:erro, :fora_das_areas}`); testador: 14 testes, 0 falhas.
- [C3 — `agente/ferramentas_test.exs` inteiro no Linux; no Windows segue `cmd /c echo oi`] →
  `test/fabrica/agente/ferramentas_test.exs:56-68` (programa pelo SO; ramo Windows literal ao de
  antes) e a asserção foi REFORÇADA (`stdout =~ "oi"`), não enfraquecida; testador: 10 testes.
- [C4 — os 4 testes da causa C não removidos/pulados/sem asserção; ramo Windows inalterado] →
  conferido no diff: :97 e :208 sem nenhuma linha alterada (passam pelo conserto de `juntar/2`);
  :224 com `if win32` e asserção nos dois ramos, ramo Windows idêntico ao anterior; :149 com
  asserção nos dois ramos, ramo Windows idêntico (`lib\\FABRICA\\fila\\Exclusao.ex == :ok`) — só
  o NOME do teste mudou, para não afirmar no Linux uma regra que lá é falsa. Nenhum `@tag :skip`.
- [C5 — `normalizar/1` continua sensível a caixa fora do Windows] → `confinamento.ex:115-123`:
  no diff, `normalizar/1` só ganhou uma frase de doc; `windows?/0` (:227) e o `if windows?()`
  (:122) intocados.

Objetivo (espírito): cumprido. O defeito de fundo — o módulo julgava uma forma e devolvia outra —
foi removido na origem (`juntar/2`), não contornado nos testes; os testes agora afirmam a regra
da plataforma em que rodam, e o novo `describe` (`confinamento_test.exs:313-346`) prova as duas
regras da D-014 com o caso que importa no Linux (irmão `PROJETO` criado de verdade e recusado,
por caminho absoluto e por `..\\PROJETO\\…`). Escopo: tudo dentro das `areas`; o moduledoc ganhou
as duas regras, o que é parte de "definir" a semântica. Sem sobra fora de escopo.

Pendências acessórias (fora das `areas`, já apontadas pelo executor; não reprovam): o doc de
`Exclusao.permitir?/2` (`lib/fabrica/fila/exclusao.ex:70-74`) ainda descreve só a regra do
Windows; `confinamento_test.exs:217` segue sem ramo Linux (a regra do Linux está coberta pelo
novo teste :327).

## Revisão

### Ciclo 1

Aprovado sem achados `critica`/`importante`.

**O que verifiquei.** Diff inteiro de `5281113` (6 arquivos). Abri `confinamento.ex` além do diff
num ponto só: a ordem `recusar_unc` → `recusar_dispositivo` → `juntar` → `dentro?` em
`resolver/2` (:72-79) e o `real/1` (:200-218), para confirmar que a troca de barra em `juntar/2`
não roda ANTES da recusa de UNC nem muda o que `dentro?/2` julga. Ela roda depois das duas
recusas, e o caminho devolvido passa a ser o MESMO que é julgado.

**Sonda de segurança no Linux** (módulo carregado isolado com `elixir -r`, sem tocar a suíte;
raiz `<base>/projeto`, irmãos `<base>/fora` e `<base>/PROJETO` existentes):

| entrada | resultado |
|---|---|
| `..\fora\segredo.txt`, `..\../fora/…`, `../..\fora`, `sub\..\..\fora\x`, `sub/..\../fora/x` | `:fora_do_confinamento` |
| `\/srv/share/x`, `/\srv\share\x` (UNC misto) | `:fora_do_confinamento` (`Path.expand("//srv/share")` = `/srv/share`) |
| `\\srv\share\x`, `//srv/share/x` | `:caminho_unc` |
| `\..\etc\passwd`, `\etc\passwd`, `C:\Windows\x`, `c:/windows/x` | `:fora_do_confinamento` |
| `..\PROJETO\segredo.txt`, `<base>/PROJETO\x` (caixa) | `:fora_do_confinamento` |
| `C:..\..\fora` | `{:ok, <raiz>/fora}` — no Linux `C:..` é nome comum; resultado DENTRO e igual ao julgado |
| `lib\foo.ex`, `sub\.\a\..\b.txt` | `{:ok, <raiz>/lib/foo.ex}`, `{:ok, <raiz>/sub/b.txt}` |
| `pasta\nul.txt` | `:dispositivo` |

Nenhuma fuga aberta pela troca. Caixa fora do Windows segue sensível (`normalizar/1` intocado).
Ramos Windows: só por inspeção — lá `Path`/`:filename` já tratam `\` como separador, então a
troca é equivalente ao comportamento anterior.

Achados:
- [menor] `lib/fabrica/ferramentas/confinamento.ex:160-166` (`recusar_unc/1`, fora do diff,
  pré-existente) — só reconhece prefixo homogêneo (`\\` ou `//`); `\/srv/share` e `/\srv\share`
  passam pela recusa de UNC. No Linux caem em `:fora_do_confinamento` (sondado acima), então não
  é fuga aqui; no Windows (só inspeção) o caminho chegaria a `real/1`, que faz
  `:file.read_link_all` num caminho de rede ANTES de recusar — um toque SMB que não deveria
  existir. Não foi introduzido por esta tarefa (a troca de barra no Windows é equivalente à de
  antes); conserto barato seria checar o prefixo `//` depois de trocar as barras. Fica para o
  orquestrador decidir se vira tarefa.
- [menor] `lib/fabrica/fila/exclusao.ex:70-74` — doc de `permitir?/2` ainda diz que a caixa é
  ignorada, sem o "só no Windows" da D-014 (fora das `areas`; o executor já registrou).

