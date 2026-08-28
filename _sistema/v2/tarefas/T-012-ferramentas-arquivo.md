---
id: T-012
titulo: Ferramentas de arquivo com confinamento
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-001]
areas: [lib/fabrica/ferramentas/arquivo.ex, lib/fabrica/ferramentas/confinamento.ex, test/fabrica/ferramentas/confinamento_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
As ferramentas `ler`, `escrever`, `editar`, `listar` e `buscar`, todas confinadas ao
diretorio do projeto — e o confinamento como propriedade do codigo, nunca como frase no
prompt.

## Contexto
A tese do TCC em uma tarefa: "uma regra que o sistema pede e uma regra opcional; uma regra
que a estrutura garante e uma propriedade". Na v1 o confinamento era uma linha no despacho
("nao toque em NADA fora de..."). Aqui ele e uma funcao que RECUSA.

`Confinamento.resolver(raiz, caminho)` devolve `{:ok, absoluto}` ou `{:erro, :fora_do_confinamento}`.
Ela precisa barrar, com teste para cada caso:

- caminho absoluto para fora (`C:\Windows\System32\...`)
- travessia (`../../..`), inclusive travessia que so aparece depois de normalizar
- link simbolico que aponta para fora (resolva o caminho REAL com
  `:file.read_link_all/1` antes de comparar)
- no Windows: caminho UNC (`\\servidor\share`) e nome de dispositivo (`CON`, `NUL`, `COM1`)

Compare sempre os caminhos NORMALIZADOS e em minusculas no Windows (o sistema de arquivos
e case-insensitive, e uma comparacao case-sensitive deixa passar `..\PROJETO`).

`editar` e substituicao exata de string, com erro se a string aparecer zero ou mais de uma
vez — a mesma disciplina da ferramenta que voce esta usando agora. Isso evita a edicao que
"quase" acerta e corrompe o arquivo em silencio.

## Criterios de aceite
- [ ] Cada forma de escapar do confinamento e barrada, uma por teste (absoluto, travessia, link, UNC, dispositivo).
      `verificar: mix test test/fabrica/ferramentas/confinamento_test.exs`
- [ ] A comparacao de caminhos e case-insensitive no Windows (teste com `..\PROJETO` em maiusculas).
      `verificar: mix test test/fabrica/ferramentas/confinamento_test.exs`
- [ ] `editar` recusa quando a string alvo aparece zero ou mais de uma vez, com erro nomeado.
      `verificar: mix test test/fabrica/ferramentas/arquivo_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao
Feito em 2026-08-28. Commit do projeto: `e25748d`. 4 arquivos, 56 testes.

**O que foi feito.** `lib/fabrica/ferramentas/confinamento.ex` (a funcao que recusa) e
`lib/fabrica/ferramentas/arquivo.ex` (`ler`, `escrever`, `editar`, `listar`, `buscar`), com
56 testes divididos nos dois arquivos que a tarefa pede.

**Cada forma de escapar tem teste proprio porque cada uma escapa por um motivo diferente:**
absoluto e o unico que uma checagem ingenua pega; travessia so aparece DEPOIS de normalizar;
link tem o caminho dentro e o destino fora; UNC nao tem raiz local para comparar; e
dispositivo nao e arquivo — escrever em `NUL` fala com o hardware. Acrescentei um sexto que a
tarefa nao lista e que e o erro classico: **o irmao com nome prefixo**. `/projeto-outro`
comeca com `/projeto` e passaria por estar "sob" a raiz se a comparacao nao incluisse a barra.

**O CASO DO LINK E EXERCITADO DE VERDADE — e a primeira versao nao exercitava.** `File.ln_s`
devolve `:eperm` no Windows sem privilegio de administrador (medido nesta maquina). Minha
primeira versao do teste, ao falhar em criar o link, imprimia "nao foi possivel testar" e
**passava** — que e exatamente o defeito que este projeto cataloga: sensor que nunca dispara
e indistinguivel de sensor quebrado, e o critério pede que a forma esteja barrada, nao que
alguem tenha tentado.

Medi as alternativas e achei uma que funciona: **juncao de diretorio (`mklink /J`) e criavel
por qualquer usuario**, e o `:file.read_link_all/1` a resolve exatamente como resolve um
symlink. O teste passou a usar juncao quando o symlink falha. Entrou tambem o caso oposto —
link apontando para DENTRO, que tem de continuar passando: o confinamento barra o DESTINO de
fora, nao o link em si, e recusar todo link tornaria a ferramenta inutil num projeto que use
link legitimamente.

**LIMITACAO DOCUMENTADA E NAO CORRIGIDA: nomes curtos 8.3 do Windows.** Foi ela que fez o
teste de link-para-dentro falhar na primeira execucao. `C:\Users\ENZOCO~1` e
`C:\Users\enzoconsulo` sao o MESMO diretorio, e o modulo os trata como diferentes, porque
`read_link_all` devolve sempre a forma longa e `System.tmp_dir!` a curta.

Decidi documentar em vez de corrigir, e o motivo esta escrito no `@moduledoc`: **a falha e
para o lado seguro** — ela nega acesso legitimo, nunca permite acesso indevido, e nao ha
caminho em que o nome curto faca um destino de fora parecer de dentro. Corrigir exigiria
`GetLongPathName`, que a OTP nao expoe, ou um subprocesso por resolucao — caro num caminho
que roda a cada chamada de ferramenta. E as raizes de projeto reais vem de configuracao na
forma longa; a curta so aparece em diretorio temporario. O teste passou a usar temporario sob
`_build`, que ja e caminho longo, sem subprocesso nem truque.

**Decisoes menores, com motivo:** `buscar` e literal e nao regex, porque o agente pede o que
quer achar e um regex mal formado dele viraria erro em vez de resultado vazio; `ler` tem teto
de tamanho, porque um arquivo de 50 MB no contexto de um agente e um estouro de janela com o
custo ja pago; e o nome do dispositivo e checado por SEGMENTO e sem extensao, porque
`pasta/nul.txt` ainda e o dispositivo nulo — mas `console.ex` nao e `con`, e barrar isso seria
recusar arquivo legitimo.

## Verificacao

**Criterio 1 — cada forma de escapar do confinamento e barrada, uma por teste (absoluto,
travessia, link, UNC, dispositivo).** `verificar: mix test test/fabrica/ferramentas/confinamento_test.exs`
→ **exit 0** (parte dos 56 testes do diretorio, todos passando)

Os cinco blocos `escape N:` cobrem exatamente as cinco formas: absoluto (3 testes, incluindo
o irmao do projeto), travessia (5, incluindo a que so aparece depois de normalizar, a de
barra invertida e o irmao com nome prefixo), link (3, com juncao real), UNC (2) e dispositivo
(5, incluindo com extensao, em subdiretorio, em caixa alternada e o negativo `console.ex`).

**Criterio 2 — a comparacao de caminhos e case-insensitive no Windows (teste com `..\PROJETO`
em maiusculas).** Bloco `caixa alta e caixa baixa`: `..\FORA\SEGREDO.TXT` e recusado, o
caminho absoluto em maiusculas tambem, e `normalizar("C:\Pasta\Sub\")` bate com
`normalizar("C:/pasta/sub")`.

**Criterio 3 — `editar` recusa quando a string alvo aparece zero ou mais de uma vez, com erro
nomeado.** `verificar: mix test test/fabrica/ferramentas/arquivo_test.exs` → **exit 0**

Sete testes no bloco `editar`: `:alvo_ausente` para zero e `:alvo_ambiguo` para varias, mais
— e sao estes que importam — dois que conferem que **o arquivo NAO e alterado** em nenhum dos
dois casos. Ha ainda o caso de ocorrencias sobrepostas (`"aaa"` procurando `"a"`) e o de alvo
multilinha.

**Criterio 4 — `mix verificar` continua passando.** → **exit 0**

    309 mods/funs, found no issues.
    246 tests, 0 failures

## Conformidade


## Revisao
