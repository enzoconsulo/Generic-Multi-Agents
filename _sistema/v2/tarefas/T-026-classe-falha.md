---
id: T-026
titulo: Classe de falha: o comando quebrou, ou a entrega falhou?
projeto: fabrica-v2
versao: v0.3
status: concluida
prioridade: alta
dependencias: [T-025]
areas: [lib/fabrica/criterios/classe_falha.ex, test/fabrica/criterios/classe_falha_test.exs, lib/fabrica/criterios.ex, test/fabrica/criterios_test.exs, _gestao/GUIA.md]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-31
---

## Objetivo
Distinguir, quando um criterio nao passa, se o problema e o COMANDO (mal escrito,
dependencia ausente, ambiente) ou a ENTREGA. Sao consequencias opostas.

## Contexto
E o mecanismo mais caro que a v1 aprendeu, e ele nao esta em documento nenhum do TCC.
Sem ele, um `verificar:` mal escrito manda a tarefa de volta ao construtor repetidamente:
a T-030 do banco-imobiliario gastou 4 ciclos e US$ 12,90 com o deliverable CORRETO desde o
primeiro, porque o criterio tinha um `node --test tests` impossivel naquela maquina.

Classes, e o que cada uma dispara:

- `:ferramenta_quebrada` — binario ausente, comando nao encontrado, erro de sintaxe do
  proprio comando. **NAO conta ciclo.** Vai para o orquestrador corrigir o criterio.
- `:ambiente` — porta ocupada, arquivo travado, prazo estourado por lentidao. **Reexecuta
  UMA vez** antes de concluir; conta quantas reexecucoes houve.
- `:entrega` — o comando rodou e o resultado esta errado. **Conta ciclo**, volta ao
  construtor.

A classificacao usa: codigo de saida, stderr (separado do stdout — por isso a T-013 os
separa), e o motivo de encerramento (`:prazo` nao e `:normal`).

Funcao pura sobre o resultado do comando. Todo julgamento mora aqui, e por isso e aqui que
os testes precisam ser exaustivos.

## Criterios de aceite
- [x] Binario ausente e classificado como `:ferramenta_quebrada` e NAO conta ciclo.
      `verificar: mix test test/fabrica/criterios/classe_falha_test.exs`
- [x] Falha de ambiente reexecuta uma vez e registra quantas reexecucoes houve.
      `verificar: mix test test/fabrica/criterios/classe_falha_test.exs`
- [x] Comando que roda e devolve resultado errado e `:entrega` e conta ciclo.
      `verificar: mix test test/fabrica/criterios/classe_falha_test.exs`
- [x] Prazo estourado nao e confundido com reprovacao de entrega.
      `verificar: mix test test/fabrica/criterios/classe_falha_test.exs`

## Notas de execucao

**O achado da tarefa: rodar o comando de verdade mostrou que o detector portado da v1 estava
INCOMPLETO.** O teste integrado usava `git log --opcao-invalida` esperando
`:ferramenta_quebrada` e voltou `:entrega`. O motivo: o `git` real diz
`fatal: unrecognized argument: --opcao-invalida`, e a lista da v1 so tinha `unrecognized
option`.

Isso e exatamente a falha que esta tarefa existe para impedir, e ela **nao falha
ruidosamente**: um sinal que falta na lista classifica criterio quebrado como `:entrega`,
devolve a tarefa ao construtor, e o construtor — que por contrato **nao pode alterar
criterio** — e despachado de novo a cada volta. E o laco de 4 ciclos e US$ 12,90 da T-030.

Acrescentei `unrecognized argument`, `unknown argument`, `unknown switch` e `unknown flag`, e
o caso literal do git virou teste unitario para nao regredir. **A licao e a do CLAUDE.md:
tente usar o mecanismo pelo caminho REAL antes de dar por pronto** — a lista tinha teste,
tinha documentacao e vinha de codigo em producao, e ainda assim errava no primeiro comando de
verdade.

**O caso dificil ficou com seis testes, porque e onde a funcao quase nasceu errada.**
`Cannot find module` significa coisas OPOSTAS:

    node --test tests               -> o diretorio EXISTE, o runner nao sabe consumi-lo
    node --test tests/turno.test.js -> o arquivo NAO existe, a tarefa nao o criou

O discriminador nao e a mensagem, e o **disco**. E ha um segundo filtro no mesmo ponto: o alvo
so conta quando e ARGUMENTO do proprio comando — um modulo qualquer que um teste nao conseguiu
importar e falha da tarefa, nao do criterio. Casar so o nome do argumento (a primeira
tentativa da v1) transformaria toda tarefa que esquece de criar o proprio arquivo de teste num
"criterio suspeito", e o portao pararia de pegar o defeito mais comum que existe.

**A ordem das checagens e regra, e tem teste proprio.** Recurso esgotado e consultado POR
ULTIMO: a mensagem pode aparecer dentro da saida de uma suite que rodou inteira e reprovou por
outro motivo. Se `:ambiente` viesse antes de `:ferramenta_quebrada`, um criterio quebrado cuja
saida mencionasse `EBUSY` seria reexecutado para sempre em vez de consertado. Ha teste com
exatamente essa saida ambigua.

E o inverso tambem: prazo, sinal e NTSTATUS vem PRIMEIRO, porque nada ali e opiniao. Ha teste
afirmando que prazo estourado manda mesmo com saida que pareceria reprovacao (`3 tests, 2
failures`).

**A escada continuou com TRES degraus, e a v1 tinha quatro.** La `inconclusivo` era rotulo
proprio. Aqui ele sai como `[julgado]` — nao houve prova mecanica, entao o grau e esse mesmo —
e o sinal foi para uma **linha propria** abaixo da `Graus de prova:`. A razao: o que
`inconclusivo` acrescenta nao e um grau, e uma ACAO (quem conserta o que), e as duas trilhas
compartilham a escada de tres degraus do `DOMINIOS.md`. Cunhar um quarto rotulo aqui faria a
linha do verificador e a da passada mecanica deixarem de somar. Ha teste afirmando que
`[inconclusivo]` **nao** aparece no relatorio.

**A reexecucao unica ficou em `Criterios`, e nao aqui.** `ClasseFalha` responde *se* vale
reexecutar (`reexecuta?/1`); quem reexecuta e a passada, porque so ela tem o comando e a raiz.
A troca e assimetrica em ordens de grandeza: reexecutar custa segundos de CPU e **zero token**;
uma reprovacao falsa custa um despacho inteiro **mais uma das tres fichas** — e a ficha e o
recurso escasso, porque na terceira a tarefa bloqueia.

**`ciclos_gastos/1` devolve 0 ou 1, e nao a contagem de criterios reprovados.** A passada
inteira e UM ciclo. Ha teste com duas reprovacoes conferindo que ainda e 1: contar por criterio
faria uma tarefa com tres criterios quebrados bloquear numa volta so.

**Dois testes de integracao trocaram de comando no meio da tarefa, e vale registrar por que.**
Comecaram como `mix tarefa_que_nao_existe` e `mix test` com prazo curto — e o arquivo levava
**14,6 s**. Pior que a lentidao: spawnar `mix test` de dentro de `mix test` mexe no `_build`
enquanto a suite roda. Trocados por `git log --opcao-invalida` e `git rev-parse --git-dir`, o
arquivo caiu para **1,6 s** e nenhum processo filho toca o build.

**A armadilha do TODO em portugues cobrou pedagio de novo**, agora com *"Todo o julgamento"* —
o que mostra que o check do Credo e **insensivel a maiusculas**, e nao so pega `TODOS` como a
entrada do GUIA dizia. Atualizei a entrada com as duas ocorrencias e a correcao.

## Verificacao

**Criterio 1 — binario ausente e `:ferramenta_quebrada` e NAO conta ciclo.**
`verificar: mix test test/fabrica/criterios/classe_falha_test.exs` -> **exit 0**

    2 doctests, 36 tests, 0 failures

`ENOENT` do disparo, as quatro mensagens de shell (ingles, portugues, `cmd.exe`, `spawn`), os
codigos universais 127 e 9009, e o codigo do binario que **so vale acompanhado da mensagem** —
porque fora de contexto um 9 nao significa nada. Mais o teste integrado, que confere
`ciclos_gastos == 0`.

**Criterio 2 — falha de ambiente reexecuta uma vez e registra quantas reexecucoes houve.**
`verificar: mix test test/fabrica/criterios/classe_falha_test.exs` -> **exit 0**

Teste integrado com prazo estourado de verdade: `reexecutado: true`, `reexecucoes/1 == 1`, e
**nao reprova a tarefa**. Mais o par negativo — comando que passa nao reexecuta e
`reexecucoes/1 == 0`.

**Criterio 3 — comando que roda e devolve resultado errado e `:entrega` e conta ciclo.**
`verificar: mix test test/fabrica/criterios/classe_falha_test.exs` -> **exit 0**

Reprovacao comum de suite, o "na duvida `:entrega`" com saida vazia e com codigo desconhecido,
codigo nulo, e o contexto sem os campos opcionais. Integrado: `git cat-file` num objeto
inexistente da `:falhou` com `classe: :entrega` e `ciclos_gastos == 1`.

**Criterio 4 — prazo estourado nao e confundido com reprovacao de entrega.**
`verificar: mix test test/fabrica/criterios/classe_falha_test.exs` -> **exit 0**

Dois testes puros (prazo sozinho; prazo com saida que pareceria reprovacao) e um integrado com
prazo de 1 ms, que confere `:inconclusivo`, `:ambiente`, a reexecucao e a ausencia de
reprovacao.

**Bateria completa** — `verificar: mix fabrica.ci` -> **exit 0**

      formato    ok        2.4s
      compilar   ok        2.4s
      lint       ok        5.4s
      testes     ok       18.5s
      tipos      ok       13.6s

    bateria passou: 5 estagio(s) ok, 0 pulado(s)

    9 doctests, 646 tests, 0 failures

Eram 610 antes; a T-026 acrescentou 36 testes e 2 doctests.

## Conformidade

Os quatro criterios estao cumpridos, e as tres classes disparam as tres consequencias opostas
que a tarefa pediu — verificadas tanto nas funcoes puras (`conta_ciclo?/1`, `reexecuta?/1`,
`quem_conserta/1`) quanto no caminho integrado da passada mecanica.

**O que a tarefa pediu e nao esta nos criterios:** *"funcao pura, e por isso e aqui que os
testes precisam ser exaustivos"*. Foi levado ao pe da letra — 36 testes, e o bloco do caso
dificil sozinho tem seis, incluindo os quatro ecossistemas de mensagem de alvo e o separador de
caminho do Windows.

**Uma decisao alem do texto:** a escada continuou com tres degraus em vez de ganhar o quarto
rotulo da v1. Argumentada nas Notas e travada em teste — se o desejado for o rotulo proprio, e
uma clausula de `linha_de/1`, mas as duas trilhas deixariam de somar sobre a mesma escada.

**Ampliei as `areas`** para incluir `lib/fabrica/criterios.ex` (onde a reexecucao e o estado
`:inconclusivo` entram), o teste da T-025 e o `GUIA.md` — ANTES de tocar em qualquer um deles.

## Revisao

Revisao do proprio diff. Achados, todos tratados:

- **Lacuna real no detector portado** (`unrecognized argument`), encontrada por rodar o comando
  de verdade e nao por leitura. Corrigida e travada em teste unitario. Ver Notas.
- **Dois testes de integracao spawnavam `mix` filho**, e um deles era `mix test` dentro de
  `mix test` — 14,6 s no arquivo e risco de mexer no `_build` com a suite rodando. Trocados por
  `git`; 1,6 s.
- **`Enum.map/2 |> Enum.join/2`** apontado pelo Credo, trocado por `Enum.map_join/3`.
- **"Todo o julgamento"** lido como tag TODO. Reescrito, e a entrada do GUIA corrigida — ela
  afirmava que o gatilho era `TODOS` maiusculo, e o check e insensivel a maiusculas.

Um ponto que fica registrado sem conserto, porque o conserto seria pior: **a lista de sinais e
inerentemente incompleta.** Nenhuma lista de mensagens de erro cobre todos os ecossistemas. O
que o desenho garante e o lado do erro: falta de sinal cai em `:entrega`, que gasta um ciclo —
e nao em `:ferramenta_quebrada`, que deixaria uma entrega ruim passar. **Na duvida, reprova.**
