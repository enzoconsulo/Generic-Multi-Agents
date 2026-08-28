---
id: T-013
titulo: Ferramenta de comando, com prazo e morte da ARVORE de processos
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-012]
areas: [lib/fabrica/ferramentas/comando.ex, lib/fabrica/ferramentas/arvore_processos.ex, test/fabrica/ferramentas/comando_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Executar um comando externo no diretorio do projeto, com prazo, captura de saida e —
o ponto dificil — encerramento da ARVORE de processos, nao so do processo lancado.

## Contexto
ARMADILHA MEDIDA NA v1: matar o processo lancado nao mata os filhos dele. A suite de um
projeto Node deixou OITO `node.exe` orfaos por estouro de prazo, numa maquina com 1,3 GB
livres. A v1 resolveu isso com `encerrarArvore(pid)`; a v2 precisa do equivalente.

No Windows: `taskkill /PID <pid> /T /F` (o `/T` e a arvore). No Unix: matar o grupo de
processos (`:erlang.open_port` com `:spawn_executable` e um wrapper `setsid`). Detecte a
plataforma e teste a que a maquina atual roda; a outra fica com teste marcado para pular.

Capture stdout e stderr SEPARADOS. Juntar os dois e o que faz o diagnostico da v0.3 nao
conseguir distinguir "o comando esta quebrado" de "a entrega falhou".

O resultado devolvido carrega: codigo de saida, stdout, stderr, duracao, e o motivo do
encerramento (`:normal` | `:prazo` | `:cancelado`). O motivo importa: prazo estourado NAO
e a mesma coisa que teste reprovado, e a v0.3 depende dessa distincao.

Prazo padrao de 2 minutos por comando, configuravel por chamada.

## Criterios de aceite
- [ ] Um comando que passa do prazo e encerrado e devolve motivo `:prazo`, nao `:normal`.
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] stdout e stderr voltam SEPARADOS (teste com comando que escreve nos dois).
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] Encerrar um comando que lancou um filho mata TAMBEM o filho (teste que confere o pid do neto).
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] O comando roda com o diretorio de trabalho no projeto, nunca na raiz da fabrica.
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`

## Notas de execucao
Feito em 2026-08-28. Commit do projeto: `85ba5f0`. 3 arquivos, 19 testes.

**O que foi feito.** `lib/fabrica/ferramentas/arvore_processos.ex` (encerrar a arvore, por
plataforma) e `lib/fabrica/ferramentas/comando.ex` (executar com prazo, fluxos separados e
motivo explicito), com 19 testes.

**O TESTE DO NETO e a razao desta tarefa existir.** O comando lanca um filho que grava o
proprio PID; depois do prazo, o teste confere que esse PID **nao esta mais vivo**. Um teste
que so confirmasse "o comando terminou" reproduziria exatamente o ponto cego da v1, onde oito
`node.exe` sobreviveram sem nada acusar. Ao lado dele entrou um teste de que
`ArvoreProcessos.vivo?/1` reconhece o proprio BEAM: sem essa contraprova, um `vivo?` que
devolvesse sempre `false` faria o teste do neto passar por vazio.

**TRES ARMADILHAS DO WINDOWS, todas medidas e nao presumidas.** As tres apareceram como
falha de teste e foram diagnosticadas antes de qualquer conserto:

1. **`Port.open` com `args:` ja CITA cada argumento que contenha espaco.** Passar
   `echo x > "caminho"` como argumento unico faz o Erlang envolve-lo em aspas de novo, e o
   `cmd` engasga com as aspas aninhadas. O sintoma — *"A sintaxe do nome do arquivo, do nome
   do diretorio ou do rotulo do volume esta incorreta"* — nao menciona aspas e manda procurar
   no lugar errado. Medi numa matriz: **sem aspas funciona, com aspas falha**. Mas tirar as
   aspas quebraria qualquer caminho com espaco, entao nao havia saida boa nessa direcao.
   A solucao foi **escrever um script temporario** (`.bat` ou `.sh`): as aspas passam a ser
   do arquivo, ninguem as cita de novo, e de quebra o agente pode mandar uma linha com pipes,
   `&&` e aspas — o que ele VAI fazer — sem que a citacao de argumento a desmonte.
2. **O redirecionamento precisa de AGRUPAMENTO.** Sem `( ... )` no `cmd` (e `{ ... ; }` no
   `sh`), uma linha composta como `echo a & echo b 1>&2` faz o `> saida` valer so para o
   ULTIMO comando. O sintoma foi o **stdout recebendo o texto do stderr** — o oposto exato do
   que o criterio 2 pede, e o tipo de defeito que passaria despercebido num teste menos
   especifico.
3. **Caminho com separadores misturados.** `Path.join` produz `C:\...\Temp/arquivo`, e o
   `cmd` recusa no redirecionamento.

**stdout e stderr separados exigem dois arquivos.** A `Port` da OTP nao expoe o `stderr`
separadamente — ela oferece `:stderr_to_stdout` ou o descarte, e nada no meio. Redirecionar
pelo shell e o unico caminho que preserva os dois, e preserva-los e requisito do diagnostico
da v0.3.

**O motivo do encerramento e campo proprio**, e nao inferido do codigo de saida: `:normal`,
`:prazo` ou `:cancelado`. Prazo estourado **nao e** teste reprovado, e a escada de resposta ao
fracasso (T-030) decide coisas diferentes para cada um. Um `exit_status` sozinho nao conta
essa historia — no prazo nem existe codigo de saida, porque o comando nao chegou a terminar.

**Ordem importa ao encerrar:** primeiro matar a arvore pelo PID, DEPOIS fechar a porta.
Fechar antes perderia o `os_pid` e deixaria os filhos exatamente como a v1 os deixava.

## Verificacao

**Criterio 1 — um comando que passa do prazo e encerrado e devolve motivo `:prazo`, nao
`:normal`.** `verificar: mix test test/fabrica/ferramentas/comando_test.exs` → **exit 0**

    19 tests, 0 failures

O teste roda `ping -n 30` com prazo de 800 ms e confere `motivo == :prazo` **e**
`codigo == nil` — sem codigo de saida, porque o comando nao terminou. Ha o par: comando
rapido com prazo de 10 s devolve `:normal`.

**Criterio 2 — stdout e stderr voltam SEPARADOS (teste com comando que escreve nos dois).**
Mesmo arquivo. O teste roda `echo saida-normal & echo saida-de-erro 1>&2` e faz **quatro**
asercoes: cada fluxo contem o seu texto **e nao contem o do outro**. Foram as duas asercoes
negativas que pegaram a armadilha do agrupamento. Um segundo teste confere que um comando que
so escreve em stderr deixa o stdout vazio.

**Criterio 3 — encerrar um comando que lancou um filho mata TAMBEM o filho (teste que confere
o pid do neto).** Teste `encerrar por prazo mata TAMBEM o filho`: o filho grava o proprio PID
num arquivo, o prazo estoura, e o teste le esse PID e afirma `refute vivo?(neto)`. Se o PID
nao tiver sido gravado, o teste **falha explicitamente** (`flunk`) em vez de passar — porque
sem o PID ele so confirmaria que o comando terminou, que e o ponto cego que ele existe para
cobrir.

**Criterio 4 — o comando roda com o diretorio de trabalho no projeto, nunca na raiz da
fabrica.** Tres testes: um cria um arquivo com marca unica na raiz do projeto e confere que
`dir /b` o lista; outro roda num subdiretorio; o terceiro confere que `dentro: "../.."` e
recusado com `:fora_do_confinamento`. Um comando que rode no lugar errado nao apenas falha —
ele pode ACERTAR, sobre os arquivos de outro projeto.

**Extra — `mix verificar` continua passando** → **exit 0**

    336 mods/funs, found no issues.
    265 tests, 0 failures

## Conformidade


## Revisao
