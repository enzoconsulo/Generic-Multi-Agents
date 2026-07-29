---
id: T-039
titulo: Resumo automático de cada trecho de agente no console — parar de despejar texto cru
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: []
areas: [servidor/src/jobs/resumo/, servidor/src/rotas/resumos.ts, web/src/paginas/jobs/Jobs.tsx]
tentativas: 1
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Cada trecho do console vira um cartão curto — 2 linhas e tópicos do que foi feito — com o
texto integral atrás de "ver na íntegra".

## Contexto
Pedido do usuário, com as palavras dele: *"não é minha intenção ficar lendo textos extensos
para entender o projeto, quero tudo muito visual, didático e organizado"*, e sobre o
console: *"adorei a ideia das bolinhas que pouco a pouco acendem, mas está difícil de
compreender e muito texto"*, além de *"textos super extensos dependendo do scroll para
verificar o que foi feito"*.

Hoje o `Trecho` do `Jobs.tsx` despeja TODA linha de texto do segmento, uma por parágrafo.
Um `/trabalhar` produz páginas disso. A informação está lá e mesmo assim não se lê.

A ideia de resumir com modelo barato é do próprio usuário: *"se o custo for baixo, acho que
até vale... usar o modelo haiku ou outro super baratinho para resumir a própria saída do
agente sobre uma tarefa em apenas 2 linhas ou com algo visual e claro"*.

## Critérios de aceite
- [x] Trecho fechado ganha resumo: 2 linhas em prosa + tópicos com marca (feito / atenção).
- [x] Texto integral fica atrás de "ver na íntegra", fechado por padrão.
- [x] O resumo é gerado UMA vez no servidor e persistido — reabrir a página não regera.
- [x] Chega ao vivo, acumulando conforme os trechos fecham.
- [x] Custo do resumo visível e somado à parte, para o usuário julgar se compensa.
- [x] Falha ao resumir NÃO quebra o console: cai no texto cru de sempre.

## Notas de execução
Haiku fixo aqui, e é decisão de custo: resumir é mecânico, e o volume (um por trecho) é
justamente onde o preço escalaria com modelo caro. Mesma lógica que já pôs o testador em
haiku.

Segmentação PRECISA existir no servidor (hoje só existe em `web/src/lib/atividade.ts`),
porque o resumo tem de ser gerado uma vez e persistido — fazer no cliente significaria
regerar e recobrar a cada F5.

Modo de falha a evitar: resumo que inventa. O prompt manda dizer "não deu para resumir"
em vez de preencher, e o cartão cai no texto cru nesse caso.

## Verificação
Suíte: **336 (servidor, +31) + 88 (web)**, build limpo. Conferido AO VIVO com captura, com
resumo REAL gerado por haiku sobre um job de verdade: duas linhas em prosa e cinco tópicos
marcados, no lugar do texto cru.

**O custo é a história desta tarefa.** Primeira medição real: **US$ 0,057 por resumo** —
~50x a estimativa, e mais caro que o trabalho que ele resume em jobs curtos. A causa não
estava no prompt: o Agent SDK monta um agente de codificação por padrão. Duas opções
resolveram, e ambas ficaram travadas por teste porque removê-las não quebra nada visível —
o resumo continua saindo, só que caro:
- `settingSources: []` — omitido, o SDK carrega TODOS os settings do disco, e o do projeto
  arrasta os `CLAUDE.md` (fábrica + painel, inteiros) para resumir duas linhas.
- `systemPrompt` próprio e curto — omitido, usa o preset do Claude Code.

Medido depois: **US$ 0,0157** (~3,6x mais barato). Honestamente: não é desprezível. Num job
com 10 trechos são ~US$ 0,16, e vale outra rodada de ajuste se incomodar.

**Defeito de desenho que só a captura pegou — e era o pior possível para o pedido.** O
cartão só aparecia dentro do `Trecho`, que depende do log; o log é EFÊMERO (só trafega pelo
SSE). Ou seja: ao reabrir uma execução antiga — exatamente o caso de "rolar para ver o que
foi feito", que motivou a tarefa — a tela dizia "o log não está mais em memória" e o resumo
persistido ficava invisível. Corrigido com um ramo que renderiza os resumos sozinhos.

**Calibragem do prompt, também vista na tela:** o modelo marcava com ⚠ fatos neutros
("Fase 1: marco aprovado"). Cartão onde tudo é alerta não distingue mais nada — o prompt
agora define "atenção" como só o que exige ação, com exemplos dos dois lados e "na dúvida,
use feito".

**Errei três vezes do mesmo jeito e vale registrar:** conferi os resumos cedo demais e
concluí "zero resumos" em três ocasiões. Eles chegam ASSÍNCRONOS, segundos depois do job
terminar. Numa delas ainda havia uma instância antiga do painel na porta 8765, servindo
build velho — a mesma armadilha da T-031.

## Revisão
O risco central era resumo que INVENTA: quem passa a confiar no cartão para de abrir o
texto, então um resumo errado é pior que nenhum. Coberto pelo `naoDeu` (o prompt manda
devolver isso em vez de preencher) e pelo fallback para o texto cru — com teste de resposta
sem JSON e de SDK que explode.

A segunda garantia é o resumo nunca poder derrubar o fluxo: é disparado fora da cadeia da
fila, todo erro morre no gerente, e há teste provando que um resumidor que lança não muda
o estado do job.

Trecho sem texto não gasta chamada (teste) — resumir "o agente não disse nada" seria
desperdício com cara de funcionalidade.