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
 *
 * REESCRITO em 01/08, depois de a mesma falha acontecer de novo (job `f72534e8`, T-017a,
 * US$ 0,89 por zero tarefa). A versão anterior PROIBIA "despachar em segundo plano
 * (`run_in_background`)" — proibia o flag LIGADO. Mas segundo plano é o **padrão** da
 * ferramenta `Agent`: o orquestrador nunca precisou ligar nada, bastou omitir o campo. Ele
 * cumpriu a regra ao pé da letra, despachou o `servidor`, encerrou o turno em 2min37 para
 * "aguardar a notificação", e o agente seguiu 10 minutos órfão até ser cortado escrevendo
 * o arquivo de teste. Regra que proíbe uma forma sem EXIGIR a outra deixa o caminho padrão
 * aberto — hoje o texto MANDA passar `run_in_background: false`, que é acionável e
 * verificável (o runner mede em `despachosFundo`/`despachosEmVoo`).
 */
import { SUFIXO_REFORCO } from "./agentes-dinamicos.js";

export const PREAMBULO_HEADLESS = `<execucao-headless>
Você está rodando como JOB do painel (Claude Agent SDK, sem interface interativa).

REGRA DURA: todo despacho de subagente é SÍNCRONO e bloqueante. Em TODA chamada da
ferramenta \`Agent\` (ou \`Task\`) passe **\`run_in_background: false\`** — explicitamente,
sempre, sem exceção. Segundo plano é o PADRÃO da ferramenta: omitir esse campo já abandona
o agente. Depois de chamar, ESPERE o resultado dele na mesma resposta antes de seguir.

É proibido:
- despachar sem \`run_in_background: false\`, ou com ele em \`true\`;
- encerrar o turno dizendo que vai "aguardar a notificação" / "seguir quando chegar";
- agendar wakeup, cron ou qualquer continuação futura.

Aqui não existe quem entregue notificação depois: quando você para de escrever, a sessão
FECHA e todo agente ainda em voo é cortado no meio do trabalho — o que ele não tinha
gravado em disco se perde, e o job aparece como sucesso. Se você está prestes a terminar o
turno e algum agente que você despachou ainda não devolveu resultado, você está prestes a
destruir o trabalho dele.

Só termine o turno quando a tarefa pedida estiver realmente concluída — ou quando estiver
bloqueada, e então diga explicitamente o que faltou e por quê.
</execucao-headless>

`;

/**
 * Bloco de escalonamento de modelo (protocolo, regra 12). Só entra quando a estratégia do
 * disparo TEM para onde subir e a ação injetou especialistas — senão seria instrução para
 * usar agente que não existe, que é como se perde turno em despacho condenado.
 */
export function blocoReforco(modelo: string, reforco: string, ids: readonly string[]): string {
  const lista = ids.length > 0 ? ids.map((id) => `\`${id}\``).join(", ") : "(nenhum)";
  return `<escalonamento-de-modelo>
Este fluxo roda em \`${modelo}\`. Para RETRABALHO existe uma versão reforçada de cada
especialista, rodando em \`${reforco}\`: ${lista}.

Regra: tarefa com \`tentativas >= 1\` no frontmatter — isto é, que JÁ voltou reprovada —
deve ser despachada ao gêmeo \`<id>${SUFIXO_REFORCO}\`, não ao normal. Uma reprovação é
prova de que o modelo atual não resolveu; repetir a mesma aposta gasta executor, testador e
revisor outra vez e queima uma das 3 tentativas antes do bloqueio.
</escalonamento-de-modelo>

`;
}

/** Prefixa o preâmbulo a um prompt de job. */
export function comPreambuloHeadless(prompt: string, extra = ""): string {
  return `${PREAMBULO_HEADLESS}${extra}${prompt}`;
}
