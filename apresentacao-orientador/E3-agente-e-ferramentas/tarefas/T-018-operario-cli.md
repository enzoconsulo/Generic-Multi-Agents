---
id: T-018
titulo: Operario.ClaudeCLI — o adaptador padrao de operacao
projeto: fabrica-v2
versao: v0.2
status: concluida
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
Feito em 2026-08-28. Commit do projeto: `5da4c76`. 3 arquivos (2 novos + o teste do marco),
25 testes.

**A traducao e a razao deste modulo existir.** O vocabulario do CLI (`tool_use`,
`input_tokens`, `cache_creation_input_tokens`) para aqui; o resto da fabrica nao pode saber
qual adaptador esta rodando. Ha teste que inspeciona a `Resposta` inteira e falha se
`tool_use` ou `input_tokens` vazarem.

**O que ele NAO consegue fazer esta no cabecalho**, como a tarefa exige: ele nao posiciona
pontos de cache, porque o CLI gerencia o cache sozinho e nao expoe `cache_control` nem TTL.
Isso nao e defeito do adaptador — e a razao de o `MessagesAPI` existir e de o marco da v0.2
medir a escrita de prefixo. Pelo mesmo motivo o `ttl_cache` do `Consumo` fica `:sem_cache`,
que aqui significa **"nao sei"** e nao "nao houve": a reparticao de tokens mostra que houve.
Ha teste travando essa distincao.

**A parede de cota e reconhecida de duas formas**, evento estruturado e texto, com
precedencia para o estruturado. O CLI sinaliza de formas diferentes conforme a versao, e
perder a parede por causa do formato faria a v0.4 dormir sem saber ate quando. **Limite sem
horario ainda e limite**: devolver `:nao` ali faria a fabrica seguir batendo na parede.

**A suite nao chama o CLI.** O executavel vem de `config :fabrica, :claude_cli`, e a
interpretacao dos eventos e funcao PUBLICA — o teste a exercita com JSON conhecido, sem
processo nenhum no meio. Uma suite que chamasse o CLI de verdade gastaria cota a cada
`mix test`, e o marco da v0.1 cairia junto com ela.

**Linha que nao e JSON e ignorada** em vez de derrubar o despacho: o CLI as vezes escreve
texto solto, e trocar a entrega por rigor formal seria caro. Mas saida SEM evento nenhum
devolve `{:erro, :saida_ininteligivel}` — silencio total nao pode virar resposta vazia.

**O MARCO DA v0.1 REPROVOU ESTE COMMIT, e foi a TERCEIRA vez com a mesma forma.** O detector
de credencial pegou o `@moduledoc` que **enuncia a ausencia**: *"roda na assinatura, sem
`ANTHROPIC_API_KEY`"*. Nas duas vezes anteriores (T-014 com o nome da biblioteca HTTP, T-016
com `tarefas.status`) a saida foi reescrever o texto de producao. Na terceira o padrao ficou
inegavel, e o conserto foi no **detector**.

Ele passou a separar duas coisas que estavam juntas:

- **forma literal de segredo** (`sk-ant-`, `Bearer `) continua sendo procurada no arquivo
  INTEIRO, docstring inclusive — uma chave colada num comentario vaza igual;
- **nome de variavel de credencial** passou a ser procurado so no CODIGO, sem docstring nem
  comentario, porque nome de variavel de ambiente so tem efeito quando executado.

A garantia nao afrouxou: o teste de `System.get_env` continua valendo sobre o mesmo texto
limpo, o teste de que as variaveis nao estao definidas no ambiente e independente, e entrou um
teste do proprio filtro — que prova que ele enxerga `System.get_env("API_KEY")` em codigo e
ignora a mesma palavra numa docstring. **Alterei um teste de marco ja aprovado**, e registro
isso aqui de proposito: e uma correcao de precisao do detector, nao um relaxamento, e o
`mix fabrica.ci` completo continua verde.

## Verificacao

**Criterio 1 — o adaptador traduz eventos JSON do CLI para `Resposta` e `Consumo` do
behaviour.** `verificar: mix test test/fabrica/operario/claude_cli_test.exs` → **exit 0**

    25 tests, 0 failures

Sete testes de traducao (texto, uso de ferramenta com id e argumentos, varios blocos em
ordem, tipo desconhecido, linha nao-JSON, saida ininteligivel, e o de que o vocabulario nao
vaza), quatro de motivo de parada e tres de contabilidade.

**Criterio 2 — mensagem de limite de uso vira `{:erro, {:cota, reabre_em}}` com o horario
extraido.** Seis testes: evento estruturado com `resetsAt` ISO, horario em unix, mensagem em
TEXTO com o horario extraido por regex, limite sem horario (que ainda e limite), a
precedencia do estruturado sobre o texto, e a contraprova de que resposta normal nao e
confundida com cota.

**Criterio 3 — o teste usa um executavel FALSO injetado por configuracao; a suite segue sem
rede e sem cota.** Dois testes sobre `executavel/0` (o padrao `claude` e a substituicao por
configuracao). E a prova mais forte esta na estrutura: `interpretar/1` e publica e recebe a
saida ja pronta, entao **nenhum teste deste arquivo lanca processo**. O marco da v0.1
continua passando na mesma execucao.

**Criterio 4 — o cabecalho do arquivo registra que este adaptador nao posiciona pontos de
cache, e por que.** INSPECIONADO e travado por dois testes que leem o proprio fonte: um
confere `nao posiciona pontos de cache`, `cache_control` e `MessagesAPI`; o outro confere que
a parede de cota esta registrada como `ausente da documentacao` do TCC.

**Extra — `mix verificar` continua passando** → **exit 0**

    447 mods/funs, found no issues.
    384 tests, 0 failures

## Conformidade


## Revisao
