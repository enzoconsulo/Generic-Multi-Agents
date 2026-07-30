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
  /** Turnos concluídos antes da parada — decide se houve entrega. Ver abaixo. */
  numTurnos?: number | null;
}

/**
 * Texto do aviso quando o job parou por cota, ou `null` quando não foi o caso (e aí o
 * campo "Erro" normal é que deve aparecer).
 *
 * **Um job pode ter entregado muito antes de bater na cota** (T-047): numa rodada real o
 * fluxo concluiu 21 turnos — uma tarefa aprovada, outra num ciclo inteiro, 4 commits — e só
 * então parou. A primeira versão deste aviso dizia "interrompido sem entregar" nos dois
 * casos, o que mandaria o usuário refazer trabalho já commitado. Turnos concluídos é a
 * prova de entrega, então o texto muda com eles.
 */
export function avisoLimiteDeUso(resultado: ResultadoComMotivo | null | undefined): string | null {
  if (resultado?.motivo !== "limite-uso") return null;

  const quando =
    typeof resultado.reabreEm === "string" && resultado.reabreEm.trim() !== ""
      ? ` A cota retoma após ${resultado.reabreEm.trim()}.`
      : "";

  const turnos = resultado.numTurnos;
  if (typeof turnos === "number" && turnos > 0) {
    return (
      `O fluxo concluiu ${turnos} turno(s) antes de a cota acabar — o que foi commitado está` +
      ` valendo.${quando} Confira o estado das tarefas antes de redisparar, para não refazer` +
      " trabalho pronto."
    );
  }
  return (
    "O fluxo foi interrompido para não gastar sem entregar." +
    quando +
    " Redispare depois disso; antes, qualquer tentativa gasta contexto e para no mesmo ponto."
  );
}
