---
id: T-017a
titulo: O teto de voltas do agente completo e imposto pelo CLI, e nao pedido no prompt
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-018c, T-018e]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs, priv/probes/cli_real.exs]
tentativas: 0
criada: 2026-09-01
atualizada: 2026-09-01
---

## Objetivo
Fazer o `teto_de_voltas` da requisicao virar limite imposto ao `claude` pela linha de comando,
de modo que a regra *"o teto nao vai no prompt"* continue valendo quando quem roda o laco e o
CLI.

## Contexto

**Esforco estimado: 45 a 60 min.** E a segunda peca de governanca que a troca de familia obriga
a reconstruir (a primeira e o confinamento, T-012a).

**A regra que esta em risco.** `Fabrica.Agente.Estado` existe, textualmente, para tornar uma
regra impossivel de violar: *"o teto de voltas e o de gasto NAO vao no prompt. Eles moram no
estado do processo, e sao conferidos pelo laco. E a diferenca entre 'o prompt pede que voce pare
em 30 voltas' e 'a volta 31 nao acontece'"*.

Sob a familia `:agente_completo` (T-003a) o laco da fabrica faz **uma** volta, e os turnos
acontecem todos dentro do CLI. Se ninguem passar o teto adiante, a volta 31 acontece — e a 200
tambem. A regra teria virado exatamente o que ela existe para nao ser: uma exortacao. Nao ha
como o `Estado` conferir o que ele nao ve; **o unico ponto onde o teto ainda e imposto e a linha
de comando.**

**O desenho e curto:** `ClaudeCLI` le `requisicao.teto_de_voltas` (o campo ja existe, com padrao
30, e o `Laco` ja o preenche a partir do estado) e o traduz para a flag de teto de turnos do
CLI. A grafia da flag vem da **secao 5 da medicao da T-018b** — nao a escreva de memoria, e
confirme la se o evento terminal sinaliza o teto atingido e com que `subtype` (a T-018e ja
consumiu a mesma medicao para mapear o desfecho `:teto_de_voltas`).

**Se a medicao mostrar que a flag NAO existe nesta versao do CLI**, nao invente contorno:
declare `Impedimento:` nas Notas de execucao com a evidencia. Um teto que nao existe e uma
propriedade que o projeto perdeu na troca de familia, e isso e decisao de escopo — do Enzo, pelo
planejador, nao sua. Um `--max-turns` fantasiado de conserto seria pior que a ausencia, porque a
ausencia pelo menos apareceria.

**Fora de escopo:** o teto de GASTO (`teto_de_gasto_usd`), que sob assinatura e estimativa
contabil e nao corta nada; a contagem de chamadas de ferramenta (T-017b); e qualquer tentativa
de retomar a sessao apos o teto (`--resume`), que o `PLANO_V2.md` deixou explicitamente de fora.

**Prove contra o real.** Estenda `priv/probes/cli_real.exs`: uma sessao com o teto em 1 ou 2,
pedindo algo que exigiria mais turnos, tem de PARAR — e o adaptador tem de reportar
`:teto_de_voltas`. Consome cota da assinatura; nao gera fatura.

## Criterios de aceite
- [ ] A linha montada carrega o teto de turnos derivado de `requisicao.teto_de_voltas`, e tetos diferentes produzem linhas diferentes.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] O texto do teto NAO aparece no prompt enviado — o teto e flag, nunca frase. Ha teste que confere a ausencia no conteudo da conversa.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Uma sessao REAL com teto baixo, sobre um pedido que exigiria mais turnos, para; e o adaptador devolve `motivo_parada: :teto_de_voltas`.
      `verificar: mix run priv/probes/cli_real.exs`
- [ ] Uma sessao REAL com teto folgado, sobre o mesmo pedido, conclui normalmente — o teto nao pode estar cortando trabalho legitimo.
      `verificar: mix run priv/probes/cli_real.exs`
- [ ] A bateria completa passa nos cinco estagios, `tipos` incluido.
      `verificar: mix fabrica.ci`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao
