/** Indicadores visuais compartilhados: chip de status, badge de marco e resumo. */
import type { ContagemPorStatus, MarcoFase } from "../lib/tipos";
import {
  ORDEM_STATUS,
  classeMarco,
  classeStatus,
  rotuloMarco,
  rotuloStatus,
} from "../lib/formato";

/** Bolinha colorida + rótulo do status de uma tarefa. */
export function ChipStatus({ status }: { status: string }) {
  return (
    <span className={`chip-status ${classeStatus(status)}`}>
      <span className="chip-ponto" aria-hidden="true" />
      {rotuloStatus(status)}
    </span>
  );
}

/** Estado do marco de uma fase (pendente/aprovado/reprovado) com data, se houver. */
export function BadgeMarco({ marco }: { marco: MarcoFase }) {
  return (
    <span className={`badge marco ${classeMarco(marco.estado)}`}>
      {rotuloMarco(marco.estado)}
      {marco.data !== null && ` · ${marco.data}`}
    </span>
  );
}

/**
 * Fileira de blocos com a contagem de tarefas por status. Mostra apenas os status
 * com ao menos uma tarefa (a menos que `mostrarZeros`), sempre na ordem do pipeline.
 */
export function ResumoStatus({
  contagem,
  mostrarZeros = false,
}: {
  contagem: ContagemPorStatus;
  mostrarZeros?: boolean;
}) {
  const itens = ORDEM_STATUS.filter((s) => mostrarZeros || contagem[s] > 0);
  const total = ORDEM_STATUS.reduce((soma, s) => soma + contagem[s], 0);

  if (total === 0) {
    return <p className="texto-suave">Nenhuma tarefa ainda.</p>;
  }

  return (
    <div className="tiles">
      {itens.map((s) => (
        <div key={s} className={`tile ${classeStatus(s)}`}>
          <span className="tile-num">{contagem[s]}</span>
          <span className="tile-rot">
            <span className="chip-ponto" aria-hidden="true" />
            {rotuloStatus(s)}
          </span>
        </div>
      ))}
    </div>
  );
}
