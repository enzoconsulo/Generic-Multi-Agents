---
id: T-093
titulo: "Fallback por texto da parede de cota lê só result/errors/stderr, não o stdout inteiro"
projeto: fabrica-v2
versao: v1.0
status: pronta
prioridade: media
dependencias: [T-090]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs]
tentativas: 0
criada: 2026-10-02
atualizada: 2026-10-02
---

## Objetivo
Uma resposta ATENDIDA em que o agente apenas escreve (ou lê de um arquivo, ou recebe de um comando) a
frase de limite — "You've hit your weekly limit", "rate limit exceeded" — não vira parede de cota. Só
vira parede o texto que o próprio CLI escreve onde ele reporta erro.

## Contexto
Candidato registrado no adendo 4 da D-015 (T-087) e no log de 01/10. Em `ClaudeCLI.cota/2`
(`claude_cli.ex`, ~l. 792-810), o ramo `texto_de_limite?(texto) -> {:cota, ...}` recebe o `texto` =
stdout INTEIRO do stream. O stream carrega tudo o que a sessão produziu: blocos `assistant` com o texto
do modelo, `tool_use` com os argumentos, `tool_result` com a saída de comandos e o conteúdo de arquivos
lidos. Uma sessão que lê um arquivo com a frase (o próprio `claude_cli.ex` tem várias, nos comentários!)
ou cujo agente a escreve na resposta vira parede: o trabalho atendido e pago é descartado e o piloto
(depois da T-091) DORME até um horário inventado. O próprio comentário de `@mensagem_de_limite` já
admite o risco ("o fallback le o stdout inteiro").

Onde o CLI escreve a mensagem de limite de verdade: no `result` (campo `result`) e em `errors` de um
`result` de erro, e no stderr. A regra da T-087 para o caminho COM aviso (`erro_por_limite?/1`,
`textos_do_erro/1`) já olha só esses campos — o fallback deve usar a mesma fonte, sem segunda lista.
Cuidado com a ordem dos ramos de `cota/2` e com o caso "sem `result` nenhum" (stream cortado pela
parede): confira na Revisão da T-087 que formas de parede real existem, e não perca nenhuma.

## Critérios de aceite
- [ ] Sessão atendida (`result` success, `is_error: false`) cujo texto do `assistant` e/ou um
      `tool_result` contém "You've hit your weekly limit · resets 3am" NÃO vira `{:cota, _}` — a
      resposta segue normal (teste que falha antes do conserto).
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] As paredes reais continuam reconhecidas: a frase de limite no `result`, em `errors` de um
      `result` de erro, ou no stderr, com e sem `rate_limit_event` — os testes de parede que já existem
      (T-039/T-087) seguem verdes, e há um teste para o stderr.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução


## Verificação


## Conformidade


## Revisão

