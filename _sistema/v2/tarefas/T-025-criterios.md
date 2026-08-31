---
id: T-025
titulo: Criterios executaveis: leitura, allowlist e passada mecanica
projeto: fabrica-v2
versao: v0.3
status: concluida
prioridade: alta
dependencias: [T-013, T-022]
areas: [lib/fabrica/criterios.ex, lib/fabrica/criterios/allowlist.ex, test/fabrica/criterios_test.exs, _gestao/GUIA.md]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-31
---

## Objetivo
Rodar de graca, antes de despachar qualquer verificador, todo criterio que tem comando —
e recusar comando inseguro por allowlist, nunca por lista de proibicoes.

## Contexto
Porte de `pipeline/criterios.ts` da v1 (728 linhas, ja puro em grande parte). E a terceira
alavanca de custo: criterio que um comando resolve deixa de gastar um despacho inteiro.

**Allowlist, nunca denylist.** A v1 aprendeu isso por estrago com `ext::<comando>` na URL
de remoto: "proibir o perigoso" e uma lista infinita, "permitir o conhecido" e finita.
Comece com: `mix`, `git`, `elixir`, `npm`, `node`, `python`, `pytest`, `cargo`, `go`,
`dotnet`. Qualquer outro binario devolve `{:recusado, :binario_nao_permitido}`.

Recuse tambem: encadeamento (`&&`, `||`, `;`, `|`), redirecionamento, e substituicao de
comando. Um criterio precisa de UM comando, nao de um script.

Deduplique dentro do lote: dois criterios que rodam o mesmo comando executam UMA vez. A v1
mede isso por uma "chave de comando" normalizada — porte a ideia.

Ao fim, produza o relatorio no formato da escada de prova: cada criterio rotulado
`[executado]`, `[inspecionado]` ou `[julgado]`, e a linha `Graus de prova:` fechando.

## Criterios de aceite
- [x] Criterio com comando na allowlist executa; com binario fora dela e recusado com motivo nomeado.
      `verificar: mix test test/fabrica/criterios_test.exs`
- [x] Encadeamento, redirecionamento e substituicao de comando sao recusados (um teste cada).
      `verificar: mix test test/fabrica/criterios_test.exs`
- [x] Dois criterios com o mesmo comando executam UMA vez so.
      `verificar: mix test test/fabrica/criterios_test.exs`
- [x] O relatorio sai com cada criterio rotulado e a linha `Graus de prova:` no fim.
      `verificar: mix test test/fabrica/criterios_test.exs`

## Notas de execucao

**Uma divergencia da lista da v1, e ela e de seguranca: `npx` esta FORA.**

A v1 permite `npx`, e ele e diferente em ESPECIE dos demais. `mix`, `npm run` e `cargo`
executam codigo **do projeto** — e e disso que verificar se trata. `npx <pacote>` **baixa da
rede e executa codigo que nao esta no projeto**, o que faz a allowlist de binarios deixar de
significar alguma coisa: o binario permitido vira porta para qualquer outro, e a lista finita
e auditavel volta a ser infinita.

Nao e falha explorada na v1 — quem escreve criterio e o planejador, nao o agente que executa,
e o construtor por contrato nao pode alterar criterio. Mas manter `npx` seria manter uma
allowlist que se auto-anula, e o argumento inteiro da allowlist e que ela FALHA FECHADA. Um
criterio que precise de ferramenta externa deve declara-la como dependencia do projeto e
chama-la pelo script. Ha teste nomeando a exclusao.

**O modelo de ameaca ficou escrito, porque sem ele a lista parece arbitraria.** A ameaca aqui
e *criterio mal especificado*, e nao *criterio malicioso* — e por isso `mix` e `cargo` entram
sem constrangimento apesar de rodarem codigo do projeto: rodar o codigo do projeto e o
objetivo. Quem ler a lista daqui a seis meses precisa saber disso antes de decidir se
acrescenta um binario.

**A recusa acontece em duas camadas, e a ordem importa.** Primeiro os metacaracteres
(encadeamento, cano, redirecionamento, substituicao, quebra de linha), depois o binario. Ha
teste so para a ordem: `mix test && curl x` tem que ser recusado por ENCADEAMENTO, e nao
passar pela porta do primeiro binario ser permitido.

**`git` entra so em modo leitura**, filtrado pelo subcomando — `push`, `reset`, `clean`,
`checkout` e `commit` sao recusados com motivo proprio (`:git_nao_leitura`, distinto de
`:binario_nao_permitido`). `git` nu, sem subcomando, tambem.

**A leitura le a CONTINUACAO indentada, e isso nao e detalhe de parser.** O planejador quebra
linha o tempo todo; a primeira versao da v1 lia so a linha do `- [ ]` e numa rodada real
**truncou 11 criterios no meio da frase** — inclusive no relatorio que o verificador le para
saber o que julgar. Portei com teste que usa o proprio exemplo da v1.

O parser e **tolerante por construcao**: linha malformada nao derruba a leitura das outras,
vira criterio sem comando e vai para julgamento. Parser rigido transformaria erro de digitacao
do planejador em tarefa que nao roda.

**A deduplicacao herda o veredito, nao o criterio.** O segundo criterio com o mesmo comando
mantem o proprio texto e ganha `espelho: true`. Nao e so economia de CPU: repetir a mesma
parede de saida por criterio e o que fazia o relatorio da v1 deixar de ser lido, e afirmar
duas verificacoes onde houve uma e **mentira sobre o grau de prova**.

A chave e conservadora de proposito — normaliza extensao (`mix.bat` = `mix`) e as formas
equivalentes de chamar o script de teste (`npm run test` = `npm t` = `npm test`), e nada mais.
Ha teste afirmando que `mix test` e `mix test test/` **nao** compartilham chave: reconhecer que
cobrem o mesmo exigiria interpretar o manifesto de cada ecossistema, e chave que erra dizendo
"e o mesmo" faz um criterio herdar veredito de outro. Na duvida, executa.

**A escada de prova tem tres degraus e esta passada produz DOIS.** `[executado]` e `[julgado]`
saem daqui; `[inspecionado]` vem do verificador, porque maquina executa ou nao executa — nao
inspeciona. `relatorio/1` aceita o terceiro rotulo assim mesmo, para que o verificador some os
dele ao mesmo formato: se fossem dois formatos, ninguem somaria as duas metades e a linha
`Graus de prova:` nao fecharia sobre a tarefa inteira. Ha teste montando um resultado
`:inspecionado` como se viesse do verificador.

**Grau com zero nao entra na linha.** Uma linha que diz "0 inspecionado" em toda rodada
saudavel vira ruido e para de ser lida justamente quando o numero deixa de ser zero.

**Nao existe `aprovou?/1`, e a ausencia e deliberada** — ha teste afirmando que a funcao nao
existe. Passar na mecanica nao aprova nada: os criterios de julgamento continuam por conferir,
e uma funcao com esse nome convidaria a pular o verificador. A passada mecanica reprova cedo e
adianta trabalho; ela nao e um portao.

**Comando RECUSADO nao reprova a tarefa**, e ha teste para isso. Devolver a tarefa ao
construtor porque o comando do criterio esta quebrado e exatamente o laco que custou **4
ciclos e US$ 12,90** na T-030 do banco-imobiliario: nenhum construtor conserta um criterio que
por contrato ele nao pode alterar. `recusados/1` existe para o motor levar isso ao relatorio da
rodada como defeito de PLANEJAMENTO.

**Reuso, e nao reimplementacao:** a execucao vai por `Ferramentas.Comando.rodar/4` (T-013), que
recebe programa e argumentos separados e nao passa por shell nenhum. A allowlist devolve o
argv ja quebrado — quebrar na avaliacao e nao na execucao e o que garante que **o que foi
avaliado e exatamente o que sera executado**.

**Fora do escopo, de proposito:** classificar POR QUE um comando falhou (o teste reprovou, ou o
comando esta quebrado?) e a T-026, e o estado `inconclusivo` entra com ela; o criterio implicito
da suite e a T-027. O `@moduledoc` diz isso, para que a proxima tarefa saiba onde encaixar.

## Verificacao

**Criterio 1 — comando na allowlist executa; binario fora dela e recusado com motivo
nomeado.** `verificar: mix test test/fabrica/criterios_test.exs` -> **exit 0**

    5 doctests, 41 tests, 0 failures

Cinco binarios fora da lista conferidos (`curl`, `wget`, `rm`, `powershell`, `bash`), mais a
normalizacao de extensao do Windows, mais os tres subcomandos de escrita do `git` com motivo
proprio, mais a exclusao nomeada do `npx`.

**Criterio 2 — encadeamento, redirecionamento e substituicao recusados (um teste cada).**
`verificar: mix test test/fabrica/criterios_test.exs` -> **exit 0**

Seis testes: encadeamento (`&&`, `||`, `;`), cano, redirecionamento (`>` e `<`), substituicao
(`$(...)` e crase), quebra de linha, e **a ordem** — encadeado com primeiro binario permitido
tem de cair por encadeamento.

**Criterio 3 — dois criterios com o mesmo comando executam UMA vez.**
`verificar: mix test test/fabrica/criterios_test.exs` -> **exit 0**

O segundo vem `espelho: true` com o veredito do primeiro e o **proprio** texto. Ha o par
negativo (comandos diferentes nao se espelham), o teste da normalizacao da chave, e o que
trava a conservadoria dela.

**Criterio 4 — relatorio com cada criterio rotulado e a linha `Graus de prova:` no fim.**
`verificar: mix test test/fabrica/criterios_test.exs` -> **exit 0**

Sete testes: os rotulos, a linha final com a contagem, o veredito em negrito, a saida do que
falhou em bloco de codigo, o espelho anunciado **sem** repetir a parede de saida (conferido
contando as cercas de codigo), o motivo da recusa distinto de sem-comando, o `[inspecionado]`
vindo do verificador, o grau com zero fora da linha, e lista vazia devolvendo texto vazio em
vez de cabecalho orfao.

**Bateria completa** — `verificar: mix fabrica.ci` -> **exit 0**

      formato    ok        2.4s
      compilar   ok        2.2s
      lint       ok        8.9s
      testes     ok       23.1s
      tipos      ok       15.3s

    bateria passou: 5 estagio(s) ok, 0 pulado(s)

    7 doctests, 610 tests, 0 failures

Eram 569 antes; a T-025 acrescentou 41 testes e 2 doctests.

## Conformidade

Os quatro criterios estao cumpridos, e o porte foi feito lendo a fonte da v1 (728 linhas) em
vez de reimplementar de cabeca — inclusive os comentarios que carregam o preco de cada regra.

**A unica divergencia da v1 e a exclusao do `npx`**, e ela esta argumentada nas Notas e travada
em teste. E uma decisao de seguranca, nao de gosto: e o unico binario da lista que executa
codigo de fora do projeto.

**O que ficou de fora, por pertencer a outra tarefa:** `ClasseFalha` e o estado `inconclusivo`
(T-026), e o criterio implicito da suite (T-027). Nao e omissao — o `@moduledoc` aponta as duas,
e o desenho ja acomoda: `estado` e um atomo, e `relatorio/1` tem clausula por estado.

**As `areas` foram ampliadas antes de comecar** para incluir o `GUIA.md`.

## Revisao

Revisao do proprio diff. Nada precisou de conserto — a bateria completa passou na primeira
tentativa, inclusive `tipos`. Tres pontos merecem registro:

- **Os testes de execucao rodam comandos DE VERDADE** (`git rev-parse`, `git cat-file`), e nao
  dublagem. Dublar aqui provaria menos: o ponto da passada mecanica e que ela roda o comando de
  verdade. O custo e 2,4 s no arquivo inteiro, o que e barato pelo que compra.
- **O corte de saida tem teste com um comando que gera saida grande de verdade**
  (`git log --format=%H%n%B`), e nao uma string montada. Corte que so foi testado com entrada
  fabricada costuma errar no encoding ou no limite.
- **`recusados/1` exclui `:sem_comando` de proposito.** Criterio sem comando e normal — a
  maioria dos criterios de julgamento e assim. So comando declarado E recusado e defeito de
  planejamento, e misturar os dois faria a lista de defeitos ter uma entrada por criterio de
  julgamento, o que a tornaria inutil.

Sem achado de correcao, seguranca ou caso de borda pendente.
