---
id: T-013a
titulo: O Comando sabe alimentar stdin a partir de um arquivo, sem interpolar nada
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-018b]
areas: [lib/fabrica/ferramentas/comando.ex, test/fabrica/ferramentas/comando_test.exs]
tentativas: 1
criada: 2026-09-01
atualizada: 2026-09-03
---

## Objetivo
Dar a `Comando.rodar_separado/3` a opcao de alimentar o `stdin` do processo a partir de um
arquivo, preservando o padrao atual (entrada vinda do vazio) para todo comando que nao pedir
nada.

## Contexto

**Esforco estimado: 30 a 45 min.** Tarefa pequena e de fundacao: ela existe para a T-018d, que
tira o prompt da linha de comando do `ClaudeCLI`. Sem ela, nenhuma tarefa REAL cabe num
despacho — e isso e o marco 1 inteiro.

**O que foi medido (T-020, ciclo 3).** `ClaudeCLI.linha/1` monta a linha por interpolacao de
string e o prompt vai como argumento entre aspas, depois de um `escapar/1` que troca `"` por
`'`. `Comando.escrever_script/4` grava essa linha num `.bat` (Windows) ou `.sh`. Resultado
medido: **prompt multi-linha quebra o script** — exit 255, stdout e stderr vazios,
`{:erro, :saida_ininteligivel}`. O probe do marco so passou porque usou prompt de uma linha, de
proposito; e na segunda volta o texto GERADO pela propria conversa (serializado por `inspect/1`)
quebrou a linha de novo. E a mesma classe de defeito que abriu a T-018a, agora disparada por
conteudo que ninguem digitou.

Um prompt de tarefa real tem quebra de linha, aspas, `&`, `|`, crase e `%VAR%`. Nenhuma
quantidade de escape resolve isso de forma confiavel em dois shells diferentes. **O caminho e
nao interpolar:** o texto vai para um arquivo e o processo o le em `stdin`.

**O que NAO pode regredir.** `escrever_script/4` hoje redireciona `stdin` do vazio (`< nul` no
`.bat`, `< /dev/null` no `.sh`) e isso e deliberado: sem ele o `claude` perde **3 segundos por
chamada** esperando entrada que nunca vem e ainda suja o `stderr` com um aviso — que e
justamente o fluxo que a classificacao de falha da T-026 le. A economia foi medida na T-018a e
esta escrita no proprio `escrever_script/4`. Portanto: **a opcao nova tem padrao `:vazio`**, e o
comportamento de quem nao a usa fica identico.

### O desenho

Uma opcao em `rodar_separado/3`, com dois valores e nada alem:

    entrada: :vazio | {:arquivo, caminho}

`:vazio` e o padrao e mantem `< nul` / `< /dev/null`. `{:arquivo, caminho}` redireciona daquele
arquivo. O caminho passa pelo mesmo tratamento de separador que ja existe para os arquivos de
saida (`para_o_shell/1`) — a armadilha do `cmd` com barra normal esta medida e comentada no
proprio modulo, nao a redescubra.

**Fora de escopo:** `{:texto, ...}` (quem tem o texto que escreva o arquivo — inventar um
segundo caminho aqui e criar duas formas de fazer a mesma coisa), `stdin` por pipe sem arquivo,
e qualquer mudanca em `rodar/4`. Se achar que falta, ANOTE nas Notas e nao mexa.

**A T-018b mediu** se o `claude` aceita o pedido por `stdin` (secao 7 do probe de governanca).
Confira o resultado antes de comecar: se a resposta tiver sido "nao aceita", esta tarefa muda de
justificativa — a opcao continua util, mas quem consome vira outro, e o caso deve ser levantado
como impedimento em vez de resolvido por conta propria.

## Criterios de aceite
- [ ] Um texto com quebras de linha, aspas duplas, `&`, `|`, crase e `%VAR%` chega INTEGRO ao processo pelo `stdin` — byte a byte igual ao arquivo de origem.
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] O padrao e `:vazio`: um comando chamado sem a opcao continua com `stdin` vindo do vazio, e ha teste que falha se o redirecionamento sumir.
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] `stdout` e `stderr` continuam voltando SEPARADOS quando ha entrada — a garantia da T-013 nao pode ser efeito colateral da opcao nova.
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] Arquivo de entrada inexistente devolve erro nomeado, e nao um comando que roda com entrada vazia em silencio.
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] A bateria completa passa nos cinco estagios, `tipos` incluido.
      `verificar: mix fabrica.ci`

## Notas de execucao

**Ciclo de retrabalho (executor reforcado, 2026-09-03).**

**Causa raiz da reprovacao anterior: nao ha causa registrada e nenhuma reproduz.** As secoes
Verificacao/Conformidade/Revisao estavam VAZIAS ao abrir o ciclo — nenhum `arquivo:linha`,
nenhum passo de reproducao. O commit `16cfc82` apenas virou o cabecalho (`pronta`/`tentativas: 0`
-> `em-execucao`/`tentativas: 1`); a entrega ficou no working tree, nao commitada. E o mesmo
padrao do commit imediatamente anterior no pipeline (T-018e: "falha da passada mecanica era
intermitente em teste alheio, nao reproduz").

**O que aproveitei / o que refiz:** aproveitei 100% da entrega anterior; refiz 0 linha de codigo.
Retrabalho aqui foi diagnostico, nao refacao — a base entregue ja e o pedido, entao remendar seria
introduzir defeito onde nao ha.

**O que rodei (tudo verde nesta maquina Windows):**
- `mix test test/fabrica/ferramentas/comando_test.exs` -> 23 testes, 0 falhas.
- `mix test` (suite inteira, o estagio `testes` do CI) -> 17 doctests + 834 testes, 0 falhas.
- `mix format --check-formatted` -> ok. `mix compile --warnings-as-errors` -> ok.
- `mix credo --strict` -> 860 mods/funs, no issues.
- `mix dialyzer` (estagio `tipos`) -> "done (passed successfully)".

**Conformidade com o desenho (revisada linha a linha do diff HEAD):** a opcao entregue e
exatamente `entrada: :vazio | {:arquivo, caminho}`, com padrao `:vazio`. O caminho passa por
`para_o_shell/1` (mesmo tratamento de separador dos arquivos de saida). Nada de `{:texto, ...}`,
nada de `stdin` por pipe, `rodar/4` intocada — todos os fora-de-escopo respeitados.

**Dependencia T-018b conferida (a tarefa mandou):** T-018b esta `concluida` e a secao 7 do probe
mediu que o `claude` ACEITA o prompt vindo de `stdin` por arquivo redirecionado (`codigo: 0`,
aspas e `&` intactos), enquanto o argumento de linha quebra (`255`). Logo a justificativa desta
tarefa se mantem e o consumidor (T-018d) tem base — nao ha impedimento a levantar.

**Veredito:** entrega completa e conforme; os 5 criterios de aceite passam; a reprovacao anterior
nao reproduz. Recomendo seguir para os portoes.

## Verificacao


## Conformidade


## Revisao


## Notas de execução

**Commit:** `ac1f9248e214039eb31bad57dfd0d29e357a58a2`

Registrado pelo MOTOR, não pelo construtor: a etapa terminou com as `areas` modificadas e sem status, hash ou commit. O trabalho foi preservado e commitado em nome da tarefa para seguir aos portões de verificação e revisão. Se a entrega estiver incompleta, é lá que isso aparece — recuperar o trabalho não é aprová-lo.


## Verificação

### Ciclo 2

- **[PASSOU] [executado] Critério 1: Um texto com quebras de linha, aspas duplas, `&`, `|`, crase e `%VAR%` chega INTEGRO ao processo pelo `stdin` — byte a byte igual ao arquivo de origem**
  Comando: `mix test test/fabrica/ferramentas/comando_test.exs -n "entrada por arquivo"`
  Saída: 4 tests, 0 failures — teste "um texto com quebras de linha, aspas, & | crase e %VAR% chega INTEGRO ao stdin" executado com sucesso

- **[PASSOU] [executado] Critério 2: O padrao e `:vazio`: um comando chamado sem a opcao continua com `stdin` vindo do vazio, e ha teste que falha se o redirecionamento sumir**
  Comando: `mix test test/fabrica/ferramentas/comando_test.exs -n "entrada por arquivo"`
  Saída: teste "sem a opcao entrada, o padrao continua vazio" PASSOU (motivo :normal, stdout vazio)

- **[PASSOU] [executado] Critério 3: `stdout` e `stderr` continuam voltando SEPARADOS quando ha entrada — a garantia da T-013 nao pode ser efeito colateral da opcao nova**
  Comando: `mix test test/fabrica/ferramentas/comando_test.exs -n "entrada por arquivo"`
  Saída: teste "stdout e stderr continuam SEPARADOS quando ha entrada por arquivo" PASSOU (stderr isolado de stdout)

- **[PASSOU] [executado] Critério 4: Arquivo de entrada inexistente devolve erro nomeado, e nao um comando que roda com entrada vazia em silencio**
  Comando: `mix test test/fabrica/ferramentas/comando_test.exs -n "entrada por arquivo"`
  Saída: teste "arquivo de entrada inexistente devolve erro nomeado" PASSOU (retorna {:erro, {:arquivo_entrada_ausente, caminho}})

- **[PASSOU] [executado] Critério 5: A bateria completa passa nos cinco estagios, `tipos` incluido**
  Comando: `mix fabrica.ci`
  Saída: formato ok (3.0s), compilar ok (3.0s), lint ok (7.1s), testes ok (26.0s), tipos ok (17.2s) — bateria passou: 5 estagio(s) ok

**Conformidade com o desenho:**
- Opcao `entrada: :vazio | {:arquivo, caminho}` implementada em `rodar_separado/3` (linha 98)
- Padrao `:vazio` mantido (linha 98: `Keyword.get(opcoes, :entrada, :vazio)`)
- Validacao de entrada implementada (linhas 126-134)
- Caminho do arquivo passa por `para_o_shell/1` (linha 185), garantindo separadores corretos no Windows
- Redirecionamento do stdin em ambas as plataformas (linhas 168-176): `< "caminho"` no batch, `< "caminho"` no shell
- Nenhuma interpolacao do conteudo na linha de comando — arquivo separado

**Suíte completa:** 23 tests (comando_test.exs) + 851 tests (suite completa) = 874 tests, 0 failures

**Mutação:** Removi a validação `File.regular?(caminho)` e o teste "arquivo de entrada inexistente devolve erro nomeado" **FALHOU** (esperado) — a prova realmente detecta quando a validação é removida. Reverted com sucesso, todos os testes passam novamente.

Graus de prova: 5 executado(s), 0 inspecionado(s), 0 julgado(s).

## Conformidade

Conformidade: cumpre

Revisão do commit `ac1f9248e214039eb31bad57dfd0d29e357a58a2` (o único que toca código; `4d20530`
e `1c4d4f8` só anexam a Verificação do testador).

- Critério 1 (texto com quebra de linha/aspas/`&`/`|`/crase/`%VAR%` chega íntegro) →
  `lib/fabrica/ferramentas/comando.ex:184-185` (`origem_stdin/2` redireciona do arquivo, sem
  interpolar conteúdo) + `test/fabrica/ferramentas/comando_test.exs:132-148` (teste byte a byte).
- Critério 2 (padrão `:vazio`, sem regressão do `< nul`/`< /dev/null`) →
  `comando.ex:98` (`Keyword.get(opcoes, :entrada, :vazio)`) + `comando_test.exs:150-160` (prazo de
  3s prova que não regrediu).
- Critério 3 (stdout/stderr separados com entrada por arquivo) → nenhuma mudança em
  `rodar_bruto/4` nem no agrupamento `( ... )`/`{ ... ; }`; confirmado por
  `comando_test.exs:162-178`.
- Critério 4 (arquivo ausente → erro nomeado, não silêncio) →
  `comando.ex:126-134` (`validar_entrada/1`, checado ANTES de escrever o script) +
  `comando_test.exs:180-186`.
- Critério 5 (bateria completa, `tipos` incluído) → verificado pelo testador na seção
  Verificação (Ciclo 2): `mix fabrica.ci` com os 5 estágios ok.

**Objetivo e escopo:** a opção entregue é exatamente `entrada: :vazio | {:arquivo, caminho}`
descrita no desenho da tarefa — nenhum `{:texto, ...}`, nenhum pipe, `rodar/4` intocada. O
caminho do arquivo passa por `para_o_shell/1`, reaproveitando o tratamento de separador já
medido para os arquivos de saída, exatamente como o desenho pediu. Sem sobra fora de escopo.

**Dependência T-018b:** confirmada `concluida` no frontmatter de
`_gestao/tarefas/T-018b-superficie-cli.md`; a alegação do executor de que o probe da T-018b
mediu aceitação de `stdin` por arquivo não foi reaberta aqui (não é o objeto do diff), mas a
tarefa depende apenas do status concluída, que bate.

**Sem interface** — não há critério de UI; prova visual não se aplica.

## Revisão

Aprovado sem ressalvas.

Verifiquei: a ordem de validação (`validar_entrada/1` roda dentro do `with`, antes de gravar o
script — um arquivo ausente nunca chega a rodar com stdin vazio em silêncio); a montagem do
`origem_stdin/2` em ambas as plataformas (Windows citado com `para_o_shell/1`, Unix sem citar,
espelhando o padrão já usado para `saida`/`erro`); que `rodar/4` e `rodar_bruto/4` não foram
tocadas; e que os quatro testes novos exercitam exatamente os quatro critérios verificáveis por
`mix test` (conteúdo íntegro, padrão vazio com prova por prazo, separação stdout/stderr,
arquivo ausente). O teste de mutação registrado pelo testador (remoção da validação →
teste correspondente falha) reforça que a prova do critério 4 é real, não cosmética.

Nota `menor`: o `@spec rodar_separado/3` continua `keyword()` genérico para `opcoes`, sem
refletir a nova chave `entrada:` no tipo — não é defeito (Dialyzer não acusou nada e o padrão já
era esse antes desta tarefa para `:dentro`/`:prazo`), só uma oportunidade que não bloqueia.
