/**
 * Preâmbulo injetado em TODO prompt de job do painel (T-048).
 *
 * Por que existe — falha real, com custo medido. No job `e6d810ca` (`/novo-projeto banco
 * imobiliario`, 30/07) o orquestrador despachou o `planejador` em SEGUNDO PLANO e encerrou
 * o turno com o texto: *"serei notificado automaticamente quando o planejador terminar. Vou
 * aguardar essa notificação"*. Numa sessão interativa isso funciona — o harness reabre a
 * conversa quando a tarefa termina. Num job headless (`query()` do Agent SDK) **não existe
 * quem entregue essa notificação**: quando o modelo para de emitir, a sessão fecha, o SDK
 * manda `result` e o job vira `concluido`. O planejador foi cortado no meio da escrita das
 * tarefas — o `PLANO.md` ficou citando T-014..T-022 sem nenhum arquivo correspondente, e os
 * passos seguintes do comando (promover, commitar, registrar no log) nunca rodaram.
 *
 * O job terminou com `erro: false`, 18 de 150 turnos e US$ 0,57 — não foi cota, não foi
 * watchdog, não foi teto de turnos. Nada na tela dizia que metade do trabalho tinha sido
 * abandonada. Por isso a instrução vai no PROMPT (determinístico, chega sempre) além da
 * regra no CLAUDE.md da fábrica: se o CLAUDE.md falhar em ser lido, a linha continua aqui.
 *
 * Efeito colateral que também importa para custo: cada despacho em segundo plano REABRE
 * sessão, e sessão nova é prefixo novo para ESCREVER no cache (1,25× contra 0,1× da
 * leitura). Um `/trabalhar` real abriu 8 sessões, com 602k de cache escrito e 13,5M relidos.
 */
export const PREAMBULO_HEADLESS = `<execucao-headless>
Você está rodando como JOB do painel (Claude Agent SDK, sem interface interativa).

REGRA DURA: todo despacho de subagente é SÍNCRONO e bloqueante. Chame o agente e ESPERE o
resultado dele na mesma resposta antes de seguir. É proibido:
- despachar agente em segundo plano (\`run_in_background\`) e encerrar o turno;
- encerrar o turno dizendo que vai "aguardar a notificação" de algo assíncrono;
- agendar wakeup, cron ou qualquer continuação futura.

Aqui não existe quem entregue notificação depois: quando você para de escrever, a sessão
FECHA e todo agente ainda em voo é cortado no meio do trabalho. Só termine o turno quando a
tarefa pedida estiver realmente concluída — ou quando estiver bloqueada, e então diga
explicitamente o que faltou e por quê.
</execucao-headless>

`;

/** Prefixa o preâmbulo a um prompt de job. */
export function comPreambuloHeadless(prompt: string): string {
  return `${PREAMBULO_HEADLESS}${prompt}`;
}
