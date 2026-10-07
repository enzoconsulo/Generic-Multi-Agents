---
id: T-022a
titulo: A bateria completa esta vermelha desde a T-019 — os 8 erros do Dialyzer
projeto: fabrica-v2
versao: v0.3
status: concluida
prioridade: alta
dependencias: [T-022]
areas: [lib/fabrica/ferramentas/comando.ex, lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs, mix.exs, .dialyzer_ignore.exs, _gestao/ci.json, _gestao/GUIA.md]
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
- [x] `mix fabrica.ci` passa nos cinco estagios, `tipos` incluido.
      `verificar: mix fabrica.ci`
- [x] Os 5 `unmatched_return` de `comando.ex` sao tratados explicitamente, e o arquivo diz numa linha por que o retorno da limpeza pode ser descartado.
      `verificar: mix dialyzer`
- [x] A opacidade do `Ecto.Multi` e silenciada de forma NOMINAL (as duas entradas), e nao desligando a checagem no projeto; a decisao esta no GUIA.
      `verificar: mix dialyzer`
- [x] O spec de `interpretar/1` aceita o que `Comando.rodar_separado/3` realmente devolve, com teste que passa um resultado completo do `Comando` (e nao um mapa de duas chaves montado a mao).
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [x] A brecha de processo esta fechada: rodar a bateria COMPLETA e parte de fechar tarefa, e isso esta escrito onde quem fecha tarefa vai ler.
      `verificar: mix fabrica.ci`
- [x] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao

**Grupo 1 — os 5 `unmatched_return` de `comando.ex`.** A pergunta que a tarefa mandou fazer
("se apagar o temporario falhar, alguem deveria saber?") tem respostas DIFERENTES nos dois
tipos de sitio, e por isso o conserto tambem e diferente:

- **`File.rm` de temporario (4 sitios): sim, alguem deveria saber.** Nao pode derrubar a
  chamada — o comando ja rodou e o resultado ja esta em maos —, mas tambem nao pode sumir:
  no Windows, um antivirus segurando o handle deixa lixo em `System.tmp_dir!()` a CADA
  comando, e vazamento invisivel so aparece quando o disco enche. Virou `apagar/1`, que
  trata `:enoent` como sucesso (nao existir era o objetivo) e registra o resto em
  `Logger.warning`. O tipo de retorno e unico (`:ok`) de proposito: e isso que deixa
  descartar a chamada sem `unmatched_return` **e sem um `_ =` mudo**.
- **`ArvoreProcessos.encerrar/1` (1 sitio): nao, e sem perda** — ele ja registra a propria
  falha em log (`arvore_processos.ex:64`), e aqui nao ha o que decidir com o retorno: o prazo
  estourou e a porta vai fechar de um jeito ou de outro. Ficou `_ =`, com o porque na linha
  de cima.

**Grupo 2 — a opacidade do `Ecto.Multi`.** Fui pela lista NOMINAL (`.dialyzer_ignore.exs`,
duas entradas `{arquivo, :call_without_opaque}`) e nao pela flag global, pela razao que a
propria tarefa antecipou: `flags: [:no_opaque]` calaria a checagem no projeto inteiro, e a
proxima quebra de opacidade DE VERDADE passaria sem ninguem ver. Seria trocar um sensor cego
por outro — que e o defeito que esta tarefa existe para corrigir.

Acrescentei `list_unused_filters: true` junto. E o par que faltava: sem ele, uma entrada que
deixa de ser necessaria fica na lista para sempre, silenciando um aviso que ninguem mais
recebe. Com ele, o proprio Dialyzer avisa quando um filtro parou de casar. **Sensor com
atuador, desta vez de nascenca.**

**Grupo 3 — o spec mentiroso.** `interpretar/1` declarava `%{stdout: ..., stderr: ...}`, um
mapa de exatamente duas chaves, enquanto `Comando.rodar_separado/3` devolve tambem `motivo`,
`codigo` e a duracao. Em execucao sempre funcionou — a clausula casa e ignora o resto —, mas o
Dialyzer estava certo: como tipada, a chamada nunca sucede. Optei pelo **mapa aberto**
(`optional(atom()) => term()`) em vez de `Comando.resultado()`: acoplar os dois modulos
tiraria justamente o que torna `interpretar/1` publica, que e poder exercita-la com um mapa
montado a mao, sem processo nenhum.

**Por que nenhum teste pegou isso:** os 25 testes do `ClaudeCLI` montavam o mapa de duas
chaves a mao, exatamente como o spec dizia. O spec e os testes concordavam entre si e ambos
discordavam do unico chamador real. Acrescentei o teste que faltava — o que passa um
resultado COMPLETO do `Comando`.

**A brecha de processo, que era a parte que mais importava.** Consertar os 8 avisos sem mexer
no processo deixaria a mesma armadilha armada. Duas mudancas:

1. **`_gestao/ci.json`** — a frase que abriu a brecha era *"PODE ser pulado no dia a dia"*,
   verdadeira e razoavel, mas que **nunca dizia quando ele voltava**. Agora diz: pular entre
   edicoes, obrigatorio antes de marcar tarefa como concluida.
2. **`_gestao/GUIA.md`, receita "verificacao completa"** — o passo 3 virou obrigatorio, com o
   motivo em uma frase: `mix verificar` responde *"o que eu escrevi roda?"*; `mix fabrica.ci`
   responde *"o que eu escrevi e coerente?"*, e e a segunda pergunta que esta versao existe
   para mover para o compilador.

**A armadilha de CRLF cobrou pedagio na propria tarefa em que foi documentada:** o `lint`
reprovou por `comando.ex` com terminacao de linha do Windows, depois do `mix format`. A
entrada no GUIA (escrita na T-022) estava certa em dizer que reaparece em toda tarefa.

## Verificacao

**Criterio 1 — `mix fabrica.ci` passa nos cinco estagios.** `verificar: mix fabrica.ci`
-> **exit 0**

      formato    ok        2.9s
      compilar   ok        2.7s
      lint       ok        5.4s
      testes     ok       22.4s
      tipos      ok       17.2s

    bateria passou: 5 estagio(s) ok, 0 pulado(s)

E a primeira vez que a bateria completa fecha verde desde a T-018.

**Criterio 2 — os 5 `unmatched_return` de `comando.ex` tratados explicitamente.**
`verificar: mix dialyzer` -> **exit 0**. Os quatro `File.rm` viraram `apagar/1`, que diz na
docstring por que o retorno pode ser descartado (e por que a falha ainda assim vai para o
log); o `if` sem `else` ficou `_ =`, com o motivo na linha de cima.

**Criterio 3 — opacidade silenciada de forma nominal, decisao no GUIA.**
`verificar: mix dialyzer` -> **exit 0**

    Total errors: 2, Skipped: 2, Unnecessary Skips: 0

Os dois erros restantes sao exatamente os dois filtrados, e `Unnecessary Skips: 0` prova que
nenhum filtro esta sobrando. A tabela "ja existe — nao reinvente" do GUIA ganhou a linha, e o
proprio `.dialyzer_ignore.exs` carrega a razao e o que ja foi tentado sem sucesso.

**Criterio 4 — o spec de `interpretar/1` aceita o que o `Comando` devolve, com teste.**
`verificar: mix test test/fabrica/operario/claude_cli_test.exs` -> **exit 0**

O teste novo passa `%{stdout:, stderr:, motivo:, codigo:, duracao_ms:}` — o resultado
completo do `Comando`, e nao o mapa de duas chaves que os outros montavam.

**Criterio 5 — a brecha de processo fechada onde quem fecha tarefa vai ler.** `ci.json` (a
fonte que as tarefas copiam) e `GUIA.md` (a receita de fechar tarefa), ambos com o incidente
citado pelo numero da tarefa, para que a regra nao pareca zelo abstrato.

**Criterio 6 — `mix verificar` continua passando.** `verificar: mix verificar` -> **exit 0**

    536 mods/funs, found no issues.
    2 doctests, 514 tests, 0 failures

## Conformidade

Os 8 avisos foram resolvidos, cada um pela natureza dele e nao por supressao em bloco: 5
tratados no codigo, 1 corrigido no spec, 2 filtrados nominalmente com a razao escrita. A
tarefa pediu explicitamente que a opacidade NAO fosse silenciada desligando a checagem do
projeto, e nao foi.

**O sexto criterio era o que fazia esta tarefa valer a pena** — sem ele, seriam 8 consertos e
a mesma brecha. Ele esta cumprido nos dois lugares que quem fecha tarefa realmente le.

**O que NAO foi feito, de proposito:** nao mexi em `registrar_resultado.ex` nem em
`transicao.ex`, embora estivessem nas `areas` iniciais. O aviso dos dois nao tem conserto no
codigo (ja foi tentado na T-022), entao editar qualquer um deles seria mexer sem motivo. As
`areas` foram reduzidas ao que a tarefa de fato tocou.

## Revisao

Revisao do proprio diff. Dois pontos mereciam decisao consciente e ficam registrados:

- **`apagar/1` engole `:enoent` como sucesso.** E correto — o arquivo nao existir E o
  objetivo da funcao —, mas vale dizer que mascara um caso: o temporario ter sido apagado por
  outra coisa antes da hora. Nao ha como distinguir com `File.rm`, e a consequencia seria
  apenas ler um arquivo vazio, que `ler_e_apagar/1` ja trata devolvendo `""`.
- **`list_unused_filters: true` pode reprovar a bateria** quando um filtro deixa de casar. E o
  comportamento desejado: filtro obsoleto e exatamente o tipo de coisa que deve interromper, e
  nao acumular em silencio.

Sem achado de correcao ou seguranca pendente.
