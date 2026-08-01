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
 *
 * ACONTECEU DE NOVO em 01/08 (`f72534e8`, T-017a, US$ 0,89 por zero tarefa) porque este
 * aviso dependia de `despachosFundo`, que o runner só incrementava com
 * `run_in_background: true` — e segundo plano é o PADRÃO da ferramenta. O orquestrador
 * omitiu o campo, o contador leu 0, e a tela mostrou um sucesso pela segunda vez. Daí o
 * segundo aviso, `avisoDespachoEmVoo`, que não depende de flag nenhum: ele conta despacho
 * que terminou sem `tool_result`, que é dano OBSERVADO.
 */

/** Trecho de `job.resultado` que interessa para estes avisos. */
export interface ResultadoComDespachos {
  despachosFundo?: number;
  despachosEmVoo?: number;
}

/** Lê um contador do resultado, tolerando ausente/NaN/negativo. */
function contador(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Texto do aviso quando o fluxo despachou agente sem pedir execução bloqueante, ou `null`
 * quando não despachou (o caso normal). Não afirma que houve perda — para isso existe
 * `avisoDespachoEmVoo` —, diz o que conferir.
 */
export function avisoDespachoFundo(
  resultado: ResultadoComDespachos | null | undefined,
): string | null {
  const n = contador(resultado?.despachosFundo);
  if (n === null) return null;
  return (
    `Este fluxo fez ${n} despacho(s) de agente sem \`run_in_background: false\` — e segundo` +
    " plano é o padrão da ferramenta. Em job do painel não há quem entregue a notificação de" +
    " término: se o turno acabou antes do agente, o trabalho dele foi cortado no meio, mesmo" +
    " com o job marcado como concluído. Confira os artefatos — tarefas com arquivo, status e" +
    " commits — antes de dar por bom."
  );
}

/**
 * Aviso de trabalho COMPROVADAMENTE abandonado: agentes que não devolveram resultado até a
 * sessão fechar. Diferente de `avisoDespachoFundo`, aqui não há dúvida — se não veio
 * `tool_result`, aquele agente estava trabalhando na hora do corte. Por isso o texto afirma
 * em vez de sugerir.
 */
export function avisoDespachoEmVoo(
  resultado: ResultadoComDespachos | null | undefined,
): string | null {
  const n = contador(resultado?.despachosEmVoo);
  if (n === null) return null;
  return (
    `TRABALHO ABANDONADO: ${n} agente(s) ainda estavam trabalhando quando a sessão fechou e` +
    " foram cortados no meio. O que eles não tinham gravado em disco se perdeu. Este job NÃO" +
    " é uma entrega, mesmo marcado como concluído: confira o arquivo da tarefa, os commits e" +
    " a árvore suja do projeto antes de qualquer outra coisa."
  );
}
