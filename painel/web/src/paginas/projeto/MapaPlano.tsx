import { montarMapaPlano, type FaseComProgresso } from "../../lib/atividade";
import { rotuloStatus } from "../../lib/formato";
import { BadgeMarco } from "../../componentes/Indicadores";
import type { Plano, TarefaCompleta } from "../../lib/tipos";

/**
 * Mapa visual do planejamento (T-023): as fases do PLANO.md com progresso real, e cada
 * tarefa como um bloco colorido pelo status — para ver o plano inteiro de relance, sem
 * abrir arquivo nenhum.
 *
 * Mostra também o que costuma ficar escondido: id citado no plano sem arquivo
 * correspondente (plano desatualizado) e tarefa que nenhuma fase cita (órfã).
 */
export function MapaPlano({
  plano,
  tarefas,
  aoSelecionar,
}: {
  plano: Plano | null;
  tarefas: TarefaCompleta[];
  /** Clicar num bloco abre a tarefa no quadro abaixo. */
  aoSelecionar: (arquivo: string) => void;
}) {
  const mapa = montarMapaPlano(plano, tarefas);
  const semNada = mapa.fases.length === 0 && mapa.semFase.length === 0;

  return (
    <section className="secao">
      <h3 className="secao-titulo">Mapa do planejamento</h3>

      {plano?.erros !== undefined && plano.erros.length > 0 && (
        <div className="aviso aviso-info aviso-compacto">{plano.erros.join(" · ")}</div>
      )}

      {semNada ? (
        <p className="texto-suave">
          Sem plano e sem tarefas ainda. Use <strong>Pedir funcionalidade</strong> acima: o
          planejador escreve o plano em fases e cria as tarefas.
        </p>
      ) : (
        <>
          {plano !== null && plano.visao.trim() !== "" && (
            <p className="mapa-visao">{plano.visao}</p>
          )}

          <div className="mapa-fases">
            {mapa.fases.map((fase, i) => (
              <Fase key={i} fase={fase} indice={i + 1} aoSelecionar={aoSelecionar} />
            ))}
          </div>

          {mapa.semFase.length > 0 && (
            <div className="mapa-fase mapa-fase-orfas">
              <div className="mapa-fase-cab">
                <strong className="mapa-fase-nome">Fora do plano</strong>
                <span className="texto-suave">
                  {mapa.semFase.length} tarefa(s) que nenhuma fase cita
                </span>
              </div>
              <div className="mapa-blocos">
                {mapa.semFase.map((t) => (
                  <Bloco key={t.arquivo} tarefa={t} aoSelecionar={aoSelecionar} />
                ))}
              </div>
            </div>
          )}

          <Legenda />
        </>
      )}
    </section>
  );
}

function Fase({
  fase,
  indice,
  aoSelecionar,
}: {
  fase: FaseComProgresso;
  indice: number;
  aoSelecionar: (arquivo: string) => void;
}) {
  const completa = fase.total > 0 && fase.concluidas === fase.total;
  return (
    <article className={`mapa-fase ${completa ? "mapa-fase-completa" : ""}`}>
      <div className="mapa-fase-cab">
        <span className="mapa-fase-num" aria-hidden="true">
          {indice}
        </span>
        <strong className="mapa-fase-nome">{fase.nome}</strong>
        {fase.marco !== null && <BadgeMarco marco={fase.marco} />}
        <span className="mapa-fase-prog">
          {fase.concluidas}/{fase.total}
        </span>
      </div>

      {fase.meta !== "" && <p className="mapa-fase-meta">{fase.meta}</p>}

      <div
        className="barra"
        role="progressbar"
        aria-valuenow={fase.percentual}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progresso da fase ${fase.nome}`}
      >
        <div className="barra-preenchida" style={{ width: `${fase.percentual}%` }} />
      </div>

      <div className="mapa-blocos">
        {fase.tarefas.map((t) => (
          <Bloco key={t.arquivo} tarefa={t} aoSelecionar={aoSelecionar} />
        ))}
        {fase.idsAusentes.map((id) => (
          <span
            key={id}
            className="bloco bloco-ausente"
            title="O plano cita esta tarefa, mas não existe arquivo dela"
          >
            {id}?
          </span>
        ))}
      </div>
    </article>
  );
}

function Bloco({
  tarefa,
  aoSelecionar,
}: {
  tarefa: TarefaCompleta;
  aoSelecionar: (arquivo: string) => void;
}) {
  return (
    <button
      type="button"
      className={`bloco st-${tarefa.status}`}
      onClick={() => aoSelecionar(tarefa.arquivo)}
      title={`${tarefa.id} — ${tarefa.titulo} (${rotuloStatus(tarefa.status)})${
        tarefa.agente !== null ? ` · ${tarefa.agente}` : ""
      }`}
    >
      <span className="bloco-id">{tarefa.id}</span>
      {tarefa.agente !== null && <span className="bloco-agente">{tarefa.agente}</span>}
    </button>
  );
}

/** Só os status que realmente aparecem no mapa — legenda cheia de status ausente é ruído. */
function Legenda() {
  const status = ["pronta", "em-execucao", "em-teste", "em-revisao", "concluida", "bloqueada"];
  return (
    <div className="mapa-legenda">
      {status.map((s) => (
        <span key={s} className="mapa-legenda-item">
          <span className={`chip-ponto st-${s}`} aria-hidden="true" />
          {rotuloStatus(s)}
        </span>
      ))}
    </div>
  );
}
