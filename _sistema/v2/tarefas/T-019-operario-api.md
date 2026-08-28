---
id: T-019
titulo: Operario.MessagesAPI — Req, com controle de cache
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-003, T-011]
areas: [lib/fabrica/operario/messages_api.ex, test/fabrica/operario/messages_api_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
O adaptador que fala HTTP direto com a Messages API usando Req, com controle byte a byte do
prefixo, dos pontos de cache e do TTL. E ele que persegue os ~50% da conta que a escrita de
cache carrega.

## Contexto
POR QUE REQ E NAO BIBLIOTECA PRONTA (a escolha mais contraintuitiva do projeto, e ela
precisa continuar justificada): o nucleo precisa decidir, requisicao a requisicao, onde
marcar os pontos de cache e qual TTL pedir. Camada de conveniencia esconde exatamente isso.

Monte o corpo na ordem que a API impoe: `tools` -> `system` -> `messages`. Marque
`cache_control` no ultimo bloco de cada faixa estavel, com `ttl: "1h"` nos blocos 1 a 3.

TRES ARMADILHAS que este adaptador precisa tratar, e que a v1 nao tem como nem enxergar:

1. **Janela de 20 blocos.** Cada ponto de cache caminha para tras no MAXIMO 20 blocos de
   conteudo procurando entrada anterior. Uma volta com muitos `tool_use`/`tool_result` — e
   a v1 tem rodada com 472 chamadas de ferramenta — faz o ponto seguinte nao encontrar o
   anterior e ERRAR O CACHE EM SILENCIO. Insira ponto intermediario a cada ~15 blocos.
2. **Requisicoes paralelas identicas nao compartilham cache** — nenhuma le o que as outras
   ainda estao escrevendo. Quando houver fan-out, dispare UMA, espere o primeiro token, e
   so entao as demais.
3. **Mensagem de sistema no meio da conversa.** Para instrucao que muda por tarefa, use
   `{"role": "system"}` DENTRO de `messages` em vez de editar o `system` de topo — editar o
   topo invalida todo o historico cacheado. Disponivel em Opus 5 / Opus 4.8 / Fable 5, sem
   beta; nos demais, caia para bloco de texto no turno do usuario.

Verifique o ganho pelo unico lugar que nao mente: `cache_read_input_tokens` na resposta.
Se vier zero em requisicoes repetidas com o mesmo prefixo, ha invalidador silencioso.

Autenticacao por `ANTHROPIC_API_KEY`, lida SO neste modulo. O teste usa um `Req.Test` stub
— nenhuma chamada real, nenhuma leitura de credencial na suite.

## Criterios de aceite
- [ ] O corpo montado tem a ordem tools -> system -> messages, com no maximo 4 pontos de cache e `ttl: 1h` nos blocos estaveis.
      `verificar: mix test test/fabrica/operario/messages_api_test.exs`
- [ ] Um historico com mais de 20 blocos numa volta recebe ponto de cache intermediario.
      `verificar: mix test test/fabrica/operario/messages_api_test.exs`
- [ ] Instrucao por tarefa vai como mensagem de sistema dentro de `messages`, nunca editando o `system` de topo.
      `verificar: mix test test/fabrica/operario/messages_api_test.exs`
- [ ] O teste usa stub de HTTP; nenhuma credencial e lida durante a suite.
      `verificar: mix test test/fabrica/operario/messages_api_test.exs`

## Notas de execucao
Feito em 2026-08-28. Commit do projeto: `205075f`. 25 testes novos; 412 na suite.

**O que foi feito.** `lib/fabrica/operario/messages_api.ex`, o teste dele, `Req` no `mix.exs`,
o Plug de bloqueio de rede em `test/support/sem_rede.ex`, e a **reescrita da prova do marco da
v0.1**.

**A montagem do corpo e funcao PUBLICA de proposito.** E ela que permite provar as tres
armadilhas de cache sem gastar um centavo — testar a montagem e diferente de testar a chamada,
e so a segunda custa.

**As tres armadilhas, cada uma com teste:**

1. **Janela de 20 blocos** — ponto intermediario a cada 15, com folga deliberada. Marcar
   exatamente em 20 nao deixa margem: um bloco a mais e o cache erra em silencio. O teste
   compara historico curto (nenhum intermediario) com longo (pelo menos um).
2. **Requisicoes paralelas identicas nao compartilham cache** — registrado no cabecalho para a
   T-038 nao repetir o erro quando implementar o fan-out.
3. **Mensagem de sistema no meio da conversa** — e o teste que mais importa aqui e o que
   confere que o `system` de topo e **identico** com e sem instrucao por tarefa. E essa a
   propriedade: a instrucao variavel nao pode mexer no que esta cacheado.

**A PROVA DO MARCO DA v0.1 FOI REESCRITA, e o marco NAO mudou.** Quatro asercoes dela caíram
com a entrada do `Req`, e todas pela mesma razao: elas mediam a ausencia da **biblioteca**,
enquanto o marco sempre foi sobre a ausencia de **trafego**. O proprio texto da versao
anterior ja previa isso ("se ele entrou como dependencia, o adaptador que o usa precisa
mante-lo fora do caminho da suite").

A prova nova e mais forte, e o quadro esta no `_gestao/PROGRESSO.md`: nenhuma requisicao SAI
da maquina (Plug que levanta, com teste que o dispara), EXATAMENTE UM modulo le credencial, e
ninguem abre socket a mao com `:gen_tcp` — o que a versao antiga **nao** cobria. Ela passaria
para quem escrevesse um cliente HTTP a mao; esta nao passa.

Registrei a mudanca no `PROGRESSO.md` com a justificativa, porque alterar artefato de marco ja
aprovado sem dizer por que e indistinguivel de afrouxar o marco.

**Uma volta perdida, e o motivo vale registro:** o bloqueio comecou como `Req.Test.stub/2` no
`test_helper` e falhou com `cannot find mock/stub in process`. O stub e registrado **por
processo**, e a suite roda `async: true` — cada teste tem processo proprio. Virou um Plug em
configuracao, que nao tem dono e vale para todo processo. E o tipo de detalhe que so aparece
rodando.

**UM TESTE MEU ESTAVA ERRADO POR DOIS MOTIVOS.** Eu conferia a ordem das chaves no JSON
serializado. O motivo pratico: mapa do Elixir nao preserva ordem de insercao, entao a assercao
media o acaso. O motivo conceitual, que e o que importa: a ordem `tools -> system -> messages`
e definida sobre os **campos** do corpo, e nao sobre a posicao deles no texto — sao campos
distintos, nao uma sequencia, e a API monta o prefixo na ordem dela. Trocado por asercoes
sobre o que de fato precisa ser verdade: cada faixa no campo certo, e o ponto de cache
fechando a faixa certa.

**Sobre a T-020, a proxima.** Ela e o marco da v0.2 e exige *"um agente resolve uma tarefa
real"* e *"dois despachos seguidos, provado por `cache_read_input_tokens`"*. Isso **gasta cota
de verdade**, e pelo `MessagesAPI` gasta dinheiro. A propria tarefa manda declarar o teto
antes. Parei aqui.

## Verificacao

**Criterio 1 — o corpo montado tem a ordem tools -> system -> messages, com no maximo 4 pontos
de cache e `ttl: 1h` nos blocos estaveis.**
`verificar: mix test test/fabrica/operario/messages_api_test.exs` → **exit 0**

    25 tests, 0 failures

Cada faixa cai no campo certo (conferido pelo conteudo, nao pela posicao no JSON — ver Notas);
o `cache_control` fica no ULTIMO bloco de `tools` e de `system` e **nao** no de `messages`; o
TTL e `"1h"` nos dois; e o total de pontos nunca passa de 4, nem com 200 mensagens.

**Criterio 2 — um historico com mais de 20 blocos numa volta recebe ponto de cache
intermediario.** Tres testes: historico de 5 mensagens nao recebe nenhum, o de 60 recebe pelo
menos um, a janela e menor que os 20 da API, e os intermediarios respeitam o teto que sobra
depois das faixas estaveis (as estaveis tem precedencia — perder o ponto do prefixo custaria
mais).

**Criterio 3 — instrucao por tarefa vai como mensagem de sistema dentro de `messages`, nunca
editando o `system` de topo.** Tres testes, e o decisivo e
`o system de topo e IDENTICO com e sem instrucao por tarefa`.

**Criterio 4 — o teste usa stub de HTTP; nenhuma credencial e lida durante a suite.** Os
testes de chamada usam `Req.Test` via `plug:`. Alem disso o marco confere que
`ANTHROPIC_API_KEY` nao esta definida no ambiente e que **exatamente um** modulo a le em
codigo. E o Plug global garante que qualquer requisicao esquecida **levanta** em vez de sair.

**Extra — `mix verificar` continua passando** → **exit 0**

    501 mods/funs, found no issues.
    412 tests, 0 failures

## Conformidade


## Revisao
