/**
 * Aviso de cota da assinatura (T-045).
 *
 * A decisão mora aqui, e não no JSX, porque é ela que precisa de teste: os testes da web
 * são de lógica pura (sem DOM, por escolha do projeto), então lógica dentro de componente
 * é lógica não verificada. O componente fica sendo só a moldura.
 *
 * Por que um aviso separado do campo "Erro": cota batida NÃO é bug da fábrica. Só o
 * relógio resolve, e redisparar antes da hora gasta contexto para parar no mesmo ponto —
 * reação oposta à de um erro comum, que pede olhar o log e corrigir. Mostrar os dois do
 * mesmo jeito fazia o usuário tratar um pelo outro.
 */

/** Trecho de `job.resultado` que interessa para o aviso. */
export interface ResultadoComMotivo {
  motivo?: string;
  reabreEm?: string | null;
}

/**
 * Texto do aviso quando o job parou por cota, ou `null` quando não foi o caso (e aí o
 * campo "Erro" normal é que deve aparecer).
 */
export function avisoLimiteDeUso(resultado: ResultadoComMotivo | null | undefined): string | null {
  if (resultado?.motivo !== "limite-uso") return null;

  const quando =
    typeof resultado.reabreEm === "string" && resultado.reabreEm.trim() !== ""
      ? ` A cota retoma após ${resultado.reabreEm.trim()}.`
      : "";
  return (
    "O fluxo foi interrompido para não gastar sem entregar." +
    quando +
    " Redispare depois disso; antes, qualquer tentativa gasta contexto e para no mesmo ponto."
  );
}
