---
id: T-037
titulo: Watchdog por ação — a coluna watchdogMs da tabela nunca foi lida
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: []
areas: [servidor/src/jobs/robustez/watchdog.ts, servidor/src/acoes/acoes.ts, servidor/src/acoes/acoes-projeto.ts]
tentativas: 1
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Fazer o `watchdogMs` por ação valer de verdade, em vez de todo job ser cortado pelo
limite padrão de 15 min.

## Contexto
Achado numa execução REAL, não em teste: a ação `pesquisar` do `ia-hibrida-limpa` foi
interrompida com *"nenhum sinal de atividade por mais de 15 min"* — mas ela está
configurada com 20 min na tabela de guardrails.

A causa é que o watchdog é construído UMA vez, em `inicializar.ts`, com
`GUARDRAILS_PADRAO.watchdogMs`, e nunca consulta a tabela por ação. `guardrailsParaAcao()`
é chamada só para o `maxTurns`. Ou seja, **a coluna `watchdogMs` é configuração morta
desde a T-019** — vale para as entradas que eu acabei de acrescentar e para as antigas:
`trabalhar` pede 20 min e recebe 15; `status` pede 10 e recebe 15.

Não é detalhe cosmético: `pesquisar` (espera de rede) e `testar` (suíte longa) ficam
legitimamente mudos, e são justamente os que o limite curto corta no meio.

## Critérios de aceite
- [x] O limite de silêncio usado por um job é o da SUA ação, com o padrão como fallback.
- [x] A mensagem de interrupção informa o limite que de fato valeu para aquele job.
- [x] Job sem limite próprio continua no padrão (nada regride).
- [x] Teste que falharia com o comportamento antigo (limites diferentes, um job cortado e
      outro vivo na mesma varredura).

## Notas de execução
O limite viaja no job, junto do `maxTurns`: quem monta o job já resolve os guardrails, e o
watchdog passa a ler o valor de lá. A alternativa — o watchdog recalcular a ação a partir
do título/prompt do job — exigiria adivinhar de que ação o job veio, que é exatamente o
tipo de acoplamento que a tabela data-driven existe para evitar.

## Verificação
Suíte: **304 (servidor, +4) + 88 (web)**, build limpo.

**Os testes novos foram provados contra a regressão**, não só contra o código novo:
revertendo `varrer()` para o limite global, o teste "job paciente sobrevive à varredura
que mata o job de limite padrão" FALHA. Teste que passa nos dois comportamentos não
prova nada, e este era o risco óbvio aqui.

Cobertura: dois jobs com limites diferentes na mesma varredura (um morre, outro vive), o
paciente cortado ao passar do PRÓPRIO limite, a mensagem citando o limite que valeu, e
`watchdogMs` inválido (0, negativo, texto, null) caindo no padrão — nunca virando "não
vigia mais", que seria pior que o bug original.

**Enganei-me no caminho, e vale registrar:** os 4 testes falharam de primeira e cheguei a
suspeitar do código de produção. Não era: a transição do watchdog é ASSÍNCRONA (o abort
viaja até o runner) e eu checava o estado logo depois de `varrer()`, lendo o estado
velho — os testes antigos já usavam `await aguardarEstado(...)`. Instrumentar a varredura
mostrou `delta=61000 limite=60000` e "vai interromper", ou seja, a decisão estava certa.
Foi o teste que estava errado, não o código — que é exatamente a pergunta que o CLAUDE.md
manda fazer antes de "consertar o código até o teste passar".

## Revisão
O risco de deixar o limite viajar no job é alguém mandar `watchdogMs` gigante e desligar a
vigilância na prática. Hoje o valor não vem do cliente: é resolvido no servidor a partir da
tabela de guardrails, junto do `maxTurns` — a rota não aceita esse campo. Se algum dia
aceitar, precisa de teto.

O limite é congelado na ENTRADA da vigilância, não relido a cada varredura: reler faria um
job trocar de limite no meio do silêncio e saltar de "quase cortado" para "recém-visto".