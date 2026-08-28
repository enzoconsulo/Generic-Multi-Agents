---
id: T-019
titulo: Operario.MessagesAPI — Req, com controle de cache
projeto: fabrica-v2
versao: v0.2
status: backlog
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


## Verificacao


## Conformidade


## Revisao

