---
id: T-014
titulo: Guarda de processos e guarda de ferramental
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-013]
areas: [lib/fabrica/ferramentas/guardas.ex, test/fabrica/ferramentas/guardas_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Duas guardas que avaliam um comando ANTES de ele rodar: o agente nao pode matar a propria
fabrica, e nao pode reinventar uma ferramenta que a fabrica ja tem.

## Contexto
Os dois mecanismos existem na v1 (`pipeline/guarda-processos.ts` e
`pipeline/guarda-ferramental.ts`) e nao aparecem em documento nenhum do TCC. Ver
`MIGRACAO_V2.md`, secao 3.

**Guarda de processos.** Recusa comando que mataria o proprio runtime: `taskkill` sem PID
alvo, `taskkill /IM beam.exe`, `Stop-Process -Name beam|erl`, `pkill beam`, e qualquer
morte que alcance o PID do no atual ou seus ancestrais. A regra e a mesma da coleta de
orfaos da v1: **exige prova de propriedade** — so pode matar o que a propria fabrica
lancou.

**Guarda de ferramental.** Avisa (nao recusa) quando o comando reinventa algo que a
fabrica ja tem — por exemplo escrever um parser de frontmatter em vez de usar o modulo
existente, ou `curl` para algo que o cliente HTTP ja faz. A saida e um aviso anexado ao
resultado da ferramenta, que o agente le na volta seguinte.

A diferenca entre RECUSAR e AVISAR e deliberada: matar a fabrica e irreversivel; reinventar
uma roda e caro mas recuperavel, e uma recusa errada aqui bloquearia trabalho legitimo.

Ambas sao funcoes PURAS sobre a string do comando — sem I/O. E por isso que sao
testaveis exaustivamente, e e la que mora todo o julgamento.

## Criterios de aceite
- [ ] A guarda de processos recusa cada forma conhecida de matar o runtime, uma por teste.
      `verificar: mix test test/fabrica/ferramentas/guardas_test.exs`
- [ ] A guarda de processos PERMITE matar um processo que a fabrica lancou (com prova de propriedade).
      `verificar: mix test test/fabrica/ferramentas/guardas_test.exs`
- [ ] A guarda de ferramental AVISA e nao recusa (o comando roda, com aviso anexado).
      `verificar: mix test test/fabrica/ferramentas/guardas_test.exs`
- [ ] Ambas as guardas sao puras: nenhuma chamada de I/O no caminho (inspecionavel).

## Notas de execucao
Feito em 2026-08-28. Commit do projeto: `f337961`. 2 arquivos, 31 testes.

**A assimetria recusar × avisar e a regra, e ficou escrita no `@moduledoc`.** A guarda de
processos RECUSA porque matar a fabrica e irreversivel — o agente morre junto e ninguem
escreve o relatorio. A de ferramental AVISA porque reinventar uma roda e caro mas
recuperavel. Uma guarda de ferramental que recusasse transformaria um palpite sobre intencao
numa parede, e palpite sobre intencao erra.

**Prova de propriedade**, a mesma regra da coleta de orfaos da v1: so se pode encerrar o que
a fabrica lancou, e por PID. Morte por NOME de imagem e o caso perigoso — `taskkill /IM
beam.exe` nao pergunta de quem e o processo, e a fabrica roda dentro de um deles. Um comando
com varios alvos nao pode ser meio permitido: basta um PID alheio para recusar tudo.

A lista de PIDs lancados vem **de fora**, por parametro. E o que mantem a funcao pura com o
julgamento inteiro aqui dentro — se ela consultasse o sistema, o teste exaustivo deixaria de
ser barato e a guarda deixaria de ser testavel sem montar um mundo.

**O detector de nome usa palavra inteira**, e o teste disso olha o MOTIVO e nao o veredito:
`taskkill /IM beamer.exe` continua recusado — e certo que seja, e morte por nome sem PID —
mas por `:sem_alvo`, nunca por `:mataria_o_runtime`. Um detector que confundisse `beamer` com
`beam` acusaria o inocente, e detector que acusa o inocente deixa de ser levado a serio.

**O MARCO DA v0.1 PEGOU ESTE COMMIT, e essa e a melhor noticia dele.** O catalogo da guarda
de ferramental citava o nome da biblioteca HTTP num texto de sugestao, e o teste do marco —
que procura clientes HTTP por palavra inteira em TODO `lib/` — reprovou. O detector e grosso
de proposito: ele nao distingue codigo de texto.

A escolha foi entre afrouxar o detector para aceitar mencoes em string, ou nao nomear
biblioteca HTTP em fonte de producao. Afrouxar trocaria uma garantia forte por uma frase, que
e exatamente o que a v2 existe para nao fazer. O texto passou a referenciar a **tarefa**
(T-019) em vez da biblioteca, e nao perdeu nada — quem le o aviso quer saber o que usar, e a
tarefa diz isso melhor que o nome do pacote. Ficou registrado em comentario ao lado, para
ninguem "consertar" de volta.

**Um teste meu estava errado**, e o codigo certo: eu havia escrito que
`taskkill /IM beamer.exe` deveria ser `:permitido`. Nao deveria — e encerramento sem PID, e
recusar e o comportamento seguro. Corrigi a assercao para o que de fato importa ali.

## Verificacao

**Criterio 1 — a guarda de processos recusa cada forma conhecida de matar o runtime, uma por
teste.** `verificar: mix test test/fabrica/ferramentas/guardas_test.exs` → **exit 0**

    31 tests, 0 failures

Dez testes no bloco: `taskkill /IM beam.exe`, `taskkill /IM erl.exe`,
`Stop-Process -Name beam`, `pkill beam.smp`, `killall erl`, `taskkill /IM mix.bat`,
`pkill epmd` (sem o daemon de nomes o no perde a identidade), mais os dois de morte
indiscriminada (`/IM *` e `kill -9 -1`) e um que confere que a recusa **explica o que
aconteceria**, e nao so que foi recusada.

**Criterio 2 — a guarda PERMITE matar um processo que a fabrica lancou (com prova de
propriedade).** Sete testes: PID proprio passa; varios PIDs proprios passam; PID alheio e
recusado com o numero dele na explicacao; um alheio entre proprios recusa tudo; sem PID
nenhum e `:sem_alvo`; sem lista de lancados nenhum PID e proprio; e `kill -TERM` com PID
proprio passa.

**Criterio 3 — a guarda de ferramental AVISA e nao recusa (o comando roda, com aviso
anexado).** Oito testes. O primeiro afirma que o retorno e uma LISTA de avisos e nunca um
`{:recusado, _, _}`; outro confere que o aviso diz **o que usar no lugar** e traz "RODOU
assim mesmo"; ha um por entrada do catalogo, um que confere que comando limpo nao gera aviso,
e um que confere que um comando pode disparar mais de um aviso.

**Criterio 4 — ambas as guardas sao puras: nenhuma chamada de I/O no caminho
(inspecionavel).** INSPECIONADO e travado por teste: `o codigo nao faz I/O nenhum` le o
proprio fonte e falha se aparecer `File`, `System.cmd`, `Port`, `:file`, `:os`, `IO`,
`Process`, `Application` ou `Ecto`. Ao lado dele, um teste de que a mesma entrada da sempre a
mesma saida, e um terceiro que prova que o detector de I/O **ainda dispara** — sensor que
nunca dispara e indistinguivel de sensor quebrado.

**Extra — `mix verificar` continua passando** → **exit 0**

    347 mods/funs, found no issues.
    296 tests, 0 failures

## Conformidade


## Revisao
