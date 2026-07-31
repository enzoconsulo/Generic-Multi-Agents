/**
 * Aviso de trabalho possivelmente ABANDONADO por um job que terminou "bem" (T-048).
 *
 * Mesma razão de `limite-uso` para a lógica morar aqui e não no JSX: os testes da web são
 * de lógica pura, então decisão dentro de componente é decisão não verificada.
 *
 * O caso real: `/novo-projeto banco-imobiliario` despachou o `planejador` em segundo plano
 * e encerrou o turno para "aguardar a notificação". Em headless não existe quem notifique —
 * a sessão fechou, o agente foi cortado no meio da escrita das tarefas, e o job foi gravado
 * como `concluido`, sem erro, com 18 de 150 turnos e US$ 0,57. Do lado do usuário não havia
 * NADA na tela indicando que 9 das 22 tarefas do plano nunca tinham sido escritas: o painel
 * mostrava um sucesso.
 */

/** Trecho de `job.resultado` que interessa para este aviso. */
export interface ResultadoComDespachos {
  despachosFundo?: number;
}

/**
 * Texto do aviso quando o fluxo despachou agente em segundo plano, ou `null` quando não
 * despachou (o caso normal). Não afirma que houve perda — não dá para saber daqui —, diz
 * o que conferir.
 */
export function avisoDespachoFundo(
  resultado: ResultadoComDespachos | null | undefined,
): string | null {
  const n = resultado?.despachosFundo;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return (
    `Este fluxo despachou ${n} agente(s) em segundo plano. Em job do painel não há quem` +
    " entregue a notificação de término: se o turno acabou antes do agente, o trabalho dele" +
    " foi cortado no meio, mesmo com o job marcado como concluído. Confira os artefatos —" +
    " tarefas do plano com arquivo, status e commits — antes de dar por bom."
  );
}
