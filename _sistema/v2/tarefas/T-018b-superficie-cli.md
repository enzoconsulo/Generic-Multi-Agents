---
id: T-018b
titulo: Medir a superficie de governanca do `claude --print` real
projeto: fabrica-v2
versao: v0.2
status: pronta
prioridade: alta
dependencias: [T-018a]
areas: [priv/probes/cli_governanca.exs, _gestao/PROGRESSO.md]
tentativas: 0
criada: 2026-09-01
atualizada: 2026-09-01
---

## Objetivo
Descobrir, medindo contra o `claude` instalado nesta maquina, o que a linha de comando dele
oferece de governanca: modo de permissao, restricao de ferramentas, confinamento de diretorio,
teto de turnos, prompt por `stdin` e a forma exata do stream numa sessao que usa ferramenta.
Nenhum codigo de producao e escrito nesta tarefa.

## Contexto

**Esforco estimado: 60 a 90 min.** E a tarefa de FUNDACAO deste replanejamento: as outras nove
copiam dela a grafia das flags e a forma dos eventos. Ela vem primeiro por isso.

**Por que ela existe.** Este projeto ja pagou TRES vezes pela mesma forma de defeito: codigo
escrito a partir da documentacao do formato, com testes verdes, que nao provava nada sobre o
mundo. A T-026 (sinais de comando quebrado que o `git` real nao emite), a T-018a (a linha que o
CLI RECUSAVA, com 26 testes verdes) e agora o proprio marco 1 da v0.2 — em que o `Write` era
negado por falta de flag de permissao e ninguem sabia. A regra do `CLAUDE.md` da fabrica e
literal: *tente USAR o mecanismo pelo caminho real antes de dar por pronto.*

**Nao escreva flag de memoria.** O que esta tarefa entrega e justamente a grafia EXATA lida do
`--help` da versao instalada, com o numero da versao ao lado. Toda tarefa seguinte copia daqui.

**Consome cota da assinatura; nao gera fatura.** Sao poucas chamadas curtas, com modelo `haiku`
e prompts de uma linha. Nao use `ANTHROPIC_API_KEY` — nao existe nesta maquina e defini-la
quebraria o marco da v0.1.

**Como rodar comando aqui.** `Fabrica.Ferramentas.Comando.rodar_separado/3` (raiz, linha,
`prazo:`), que ja devolve `stdout` e `stderr` separados e alimenta `stdin` do vazio. O probe
existente `priv/probes/cli_real.exs` e o modelo de estilo a seguir, e
`Fabrica.Operario.ClaudeCLI.executavel/0` da o executavel configurado.

**As sete secoes que o probe precisa imprimir**, cada uma com o comando exato usado e a saida
observada:

1. **Versao e flags.** `claude --help` (e a ajuda do modo `--print`, se houver). Extraia a
   grafia exata das flags de: modo de permissao, ferramentas permitidas, ferramentas proibidas,
   diretorio adicional de trabalho, teto de turnos, configuracao de MCP, retomada de sessao.
   Imprima a versao do CLI junto — a grafia so vale para ela.
2. **Escrita de arquivo em headless.** Reproduza a negacao medida no marco (sem flag nenhuma:
   `tool_result` de `Write` com `is_error: true` e *"requires manual approval"*) e depois tente
   CADA candidato de modo de permissao ate achar o menor que faz a escrita passar. Diga qual e,
   e o que os outros fizeram.
3. **Restricao de vocabulario.** Com a flag de ferramentas permitidas contendo apenas leitura,
   uma sessao mandada escrever NAO escreve — e o stream mostra por que (recusa, ferramenta
   ausente, permissao negada; registre qual). Este e o mecanismo de que depende *"quem verifica
   nao corrige"* sob o CLI.
4. **Confinamento.** Com o diretorio de trabalho na raiz de um projeto de mentira, mande a
   sessao escrever FORA dela — uma vez por caminho absoluto (`%TEMP%\fora-<marca>.txt`) e uma
   vez por travessia (`..\fora-<marca>.txt`). Os arquivos aparecem? Responda com `File.exists?`
   sobre os dois caminhos, e nao com a impressao do modelo.
5. **Teto de turnos.** A flag existe? Com ela em 1 ou 2, uma tarefa que precisaria de mais
   turnos para nao pare — e o evento `result` sinaliza isso como o que? (`subtype`
   `error_max_turns` e o palpite atual do adaptador; confirme ou desminta.)
6. **A forma do stream numa sessao que USA ferramenta e termina bem.** SALVE o stdout bruto
   inteiro num arquivo ao lado do probe (`priv/probes/amostras/`) e imprima o caminho. Depois
   descreva: a sequencia de `type`, onde aparece `usage` (em cada evento `assistant`? so no
   `result`?), e **como se distingue um `tool_use` do ultimo turno de um `tool_use` ja resolvido
   no meio da sessao**. E esta ultima pergunta que a causa 3 do marco consome, e a amostra
   salva vira fixture de teste na T-018e.
7. **Prompt por `stdin`.** O CLI aceita o texto do pedido vindo de `stdin` (arquivo
   redirecionado) em vez de argumento de linha de comando? Teste com um prompt de VARIAS
   LINHAS, com aspas duplas e `&` — o que hoje quebra o `.bat` gerado e devolve exit 255 com
   stdout e stderr vazios. E a pergunta que a T-013a e a T-018d consomem.

**Escreva o probe em disco ANTES de rodar** — licao ja registrada na T-020: instrumento salvo
sobrevive a um corte por cota; instrumento na cabeca do agente, nao.

**Fronteira.** Nada em `lib/` muda nesta tarefa. Se voce descobrir um conserto obvio, ANOTE nas
Notas de execucao e deixe para a tarefa dona do arquivo — ha oito delas esperando este relatorio.

## Criterios de aceite
- [ ] O probe roda inteiro e imprime as sete secoes, cada uma com o comando exato usado e a saida observada.
      `verificar: mix run priv/probes/cli_governanca.exs`
- [ ] A tabela de flags traz a GRAFIA EXATA lida do `--help` da versao instalada, com a versao impressa ao lado.
      `verificar: mix run priv/probes/cli_governanca.exs`
- [ ] Uma sessao real com a combinacao escolhida CRIA um arquivo na raiz — o que o marco nao conseguiu —, conferido por `File.exists?` e nao pela resposta do modelo.
      `verificar: mix run priv/probes/cli_governanca.exs`
- [ ] As duas tentativas de escrever FORA da raiz sao reportadas com `File.exists?` sobre os caminhos de fora, uma por caminho absoluto e outra por travessia.
      `verificar: mix run priv/probes/cli_governanca.exs`
- [ ] O stdout bruto de uma sessao com uso de ferramenta fica salvo como amostra em `priv/probes/amostras/`, e o probe imprime o caminho.
      `verificar: mix run priv/probes/cli_governanca.exs`
- [ ] `_gestao/PROGRESSO.md` registra a tabela de flags e o veredito de cada uma das sete perguntas, incluindo as que nao tiveram resposta boa.
- [ ] Nenhum arquivo de `lib/` foi alterado (saida vazia).
      `verificar: git diff --stat HEAD~1 -- lib`
- [ ] A bateria completa passa nos cinco estagios — o probe novo nao pode quebrar formato nem lint.
      `verificar: mix fabrica.ci`

## Notas de execucao

### Ciclo 1 — CORTADO: o processo do Claude Code encerrou com o agente em voo

Nao e reprovacao e nao gasta ficha. Saneamento de 01/09 — **sobrou trabalho util, tudo em
disco e nao commitado**:

| arquivo | o que e |
|---|---|
| `priv/probes/cli_governanca.exs` (21 KB) | o probe, escrito inteiro |
| `priv/probes/amostras/sessao-com-ferramenta.jsonl` (25 KB) | amostra de stream real, criterio 5 |
| `priv/probes/_ultima_saida.txt` | saida da ultima corrida, ate o meio da Secao 2 |

**O que a corrida ja mediu contra o `claude` 2.1.258 instalado** (nao remedir do zero):

- `--permission-mode` aceita `acceptEdits, auto, bypassPermissions, manual, dontAsk, plan`.
- **Sem nenhuma flag, a escrita e negada** — reproduz o marco 1: *"requested permissions to
  write to ..., but you haven't granted it yet"*, arquivo nao criado.
- **`acceptEdits` ESCREVE.** `auto` nao escreveu; `bypassPermissions` nao escreveu (sem
  `tool_result` de erro capturado — merece segunda olhada).
- `--allowedTools` / `--disallowedTools` sao allow/deny de APROVACAO AUTOMATICA; quem
  restringe o VOCABULARIO de verdade e **`--tools`**, que aceita `""` para desligar todas.
- `--add-dir` existe (diretorio adicional de acesso).
- **`--max-turns` nao aparece no `--help`** da 2.1.258, e o probe registra que ela funciona
  assim mesmo, achado por teste comportamental. Nao-documentada: tratar como tal.

**Consequencia que ja da para adiantar, e e a boa noticia da tarefa:** o menor modo de
permissao que faz uma escrita passar e `acceptEdits`, **nao** `bypassPermissions` — entao a
questao do `--dangerously-skip-permissions` provavelmente nao se coloca. Confirmar no ciclo 2
antes de tratar como fato fechado.



## Verificacao


## Conformidade


## Revisao
