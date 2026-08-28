---
id: T-018
titulo: Operario.ClaudeCLI — o adaptador padrao de operacao
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-003, T-015]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
O adaptador que conversa com o Claude Code CLI. E o PADRAO de operacao: roda na assinatura,
sem chave de API e sem converter cota em fatura.

## Contexto
Decisao 6.1 de `MIGRACAO_V2.md`. A fabrica hoje NAO paga por token — consome cota (OAuth,
assinatura Pro, sem `ANTHROPIC_API_KEY`). Este adaptador preserva isso.

Converse com o CLI por processo, em modo nao interativo, com saida em JSON por linha
(o formato de streaming de eventos). Cada evento vira um bloco de conteudo ou uma linha de
consumo. Traduza o vocabulario do CLI para o do `behaviour` — o resto da fabrica nao pode
saber qual adaptador esta rodando.

O QUE ESTE ADAPTADOR NAO CONSEGUE FAZER, e precisa estar escrito no cabecalho do arquivo:
posicionar pontos de cache. O CLI gerencia o cache sozinho e nao expoe `cache_control` nem
TTL (conferido na v1, registrado em `DECISOES_FECHADAS.md`). Por isso o `MessagesAPI`
existe — e por isso o marco desta versao mede a escrita de prefixo.

**Reconheca a parede de cota.** O CLI sinaliza limite de uso com mensagem e horario de
reabertura. Traduza para `{:erro, {:cota, reabre_em}}` — a v0.4 depende disso para dormir e
rearmar, e esse mecanismo esta ausente da documentacao inteira do TCC.

O teste NAO chama o CLI de verdade: injete o executavel por configuracao e aponte para um
script falso que imprime eventos JSON conhecidos. Assim a suite continua sem rede e sem
cota, que e o marco da v0.1 e nao pode ser quebrado aqui.

## Criterios de aceite
- [ ] O adaptador traduz eventos JSON do CLI para `Resposta` e `Consumo` do behaviour.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Mensagem de limite de uso vira `{:erro, {:cota, reabre_em}}` com o horario extraido.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] O teste usa um executavel FALSO injetado por configuracao; a suite segue sem rede e sem cota.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] O cabecalho do arquivo registra que este adaptador nao posiciona pontos de cache, e por que (inspecionavel).

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

