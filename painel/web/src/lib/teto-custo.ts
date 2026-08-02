/**
 * Aviso de parada pelo TETO DE CUSTO.
 *
 * Vizinho de `limite-uso.ts` e deliberadamente DIFERENTE dele, porque as duas paradas pedem
 * reações opostas do usuário:
 *
 * - **cota** (`limite-uso`): a assinatura acabou. Só o relógio resolve; não há decisão a
 *   tomar, e redisparar antes da hora gasta contexto para parar no mesmo ponto. É FALHA.
 * - **teto** (`teto-custo`): o orçamento configurado para o job acabou e ele parou limpo,
 *   sem cortar agente nenhum. **Não é falha, é o sistema funcionando** — o que foi entregue
 *   vale, e a decisão é do usuário: aumentar o teto ou parar por aqui.
 *
 * Mostrar as duas do mesmo jeito faria o usuário tratar uma pela outra — foi exatamente o
 * que acontecia antes de a cota ganhar aviso próprio (T-045). Antes disso, dos 55 jobs da
 * fábrica, 10 morreram na cota SEM teto nenhum configurado: o teto existe para essa morte
 * virar uma parada escolhida.
 *
 * A lógica mora aqui e não no JSX porque os testes da web são de lógica pura: decisão dentro
 * de componente é decisão não verificada.
 */

/** Trecho de `job.resultado` que interessa para este aviso. */
export interface ResultadoComTeto {
  motivo?: string;
  custoUsd?: number | null;
  custoEstimadoUsd?: number | null;
  /** Turnos concluídos — a prova de que houve entrega antes da parada. */
  numTurnos?: number | null;
}

/** Formata US$ com 2 casas; `null` quando não há número utilizável. */
function usd(valor: unknown): string | null {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0
    ? `US$ ${valor.toFixed(2)}`
    : null;
}

/**
 * Texto do aviso quando o job parou pelo teto de custo, ou `null` quando não foi o caso.
 *
 * Nunca sugere "redisparar" sem qualificar: o job parou porque ALGUÉM definiu um orçamento,
 * então a ação certa é decidir sobre o orçamento — redisparar com o mesmo teto pararia no
 * mesmo lugar, que é o conselho ruim que o aviso de cota já tinha aprendido a não dar.
 */
export function avisoTetoCusto(resultado: ResultadoComTeto | null | undefined): string | null {
  if (resultado?.motivo !== "teto-custo") return null;

  const gasto = usd(resultado.custoUsd) ?? usd(resultado.custoEstimadoUsd);
  const quanto = gasto !== null ? ` Gasto: ${gasto}.` : "";
  const turnos = resultado.numTurnos;
  const entregou =
    typeof turnos === "number" && turnos > 0
      ? ` O fluxo concluiu ${turnos} turno(s) — o que foi commitado está valendo.`
      : "";

  return (
    "O job atingiu o teto de custo e encerrou de forma planejada — nenhum agente foi cortado" +
    ` no meio, e nenhuma tarefa foi começada sem orçamento para terminar.${quanto}${entregou}` +
    " Isto não é falha: para continuar de onde parou, redispare com um teto maior."
  );
}
