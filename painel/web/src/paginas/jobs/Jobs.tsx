import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import { useJobsAoVivo } from "../../lib/useJobsAoVivo";
import type { Job, LinhaLog } from "../../lib/tipos";
import { classeEstadoJob, jobCancelavel, rotuloEstadoJob } from "../../lib/formato";

export function Jobs() {
  const { jobs, logs, conectado } = useJobsAoVivo();
  const [params, setParams] = useSearchParams();
  const idSelecionado = params.get("job");
  const selecionado = jobs.find((j) => j.id === idSelecionado) ?? null;

  function selecionar(id: string) {
    setParams((p) => {
      const novo = new URLSearchParams(p);
      novo.set("job", id);
      return novo;
    });
  }

  return (
    <div className="pagina">
      <section className="intro">
        <h2 className="intro-titulo">Jobs</h2>
        <p className="intro-sub">
          Cada fluxo que você dispara vira um “job” aqui: escolha um à esquerda para ver a
          saída ao vivo, o modelo usado, o custo real ao terminar e o botão de cancelar.{" "}
          <span className={`ponto-conexao ${conectado ? "on" : "off"}`} aria-hidden="true" />
          <span className="texto-suave">{conectado ? "conectado ao vivo" : "reconectando…"}</span>
        </p>
      </section>

      <div className="jobs-layout">
        <aside className="jobs-lista">
          {jobs.length === 0 ? (
            <p className="texto-suave">
              Nenhuma execução ainda. Dispare uma ação na página inicial.
            </p>
          ) : (
            jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                className={`job-item ${job.id === idSelecionado ? "ativo" : ""}`}
                onClick={() => selecionar(job.id)}
              >
                <span className="job-item-topo">
                  <span className={`badge job-estado ${classeEstadoJob(job.estado)}`}>
                    {rotuloEstadoJob(job.estado)}
                  </span>
                  <span className="job-item-hora">{horaCurta(job.criadoEm)}</span>
                </span>
                <span className="job-item-titulo mono">{job.titulo}</span>
              </button>
            ))
          )}
        </aside>

        <section className="jobs-detalhe">
          {selecionado === null ? (
            <p className="texto-suave estado-mensagem">
              Selecione uma execução à esquerda para ver o log.
            </p>
          ) : (
            <DetalheJob job={selecionado} linhas={logs[selecionado.id] ?? []} />
          )}
        </section>
      </div>
    </div>
  );
}

function DetalheJob({ job, linhas }: { job: Job; linhas: LinhaLog[] }) {
  const [cancelando, setCancelando] = useState(false);
  const [erroCancel, setErroCancel] = useState<string | null>(null);
  const modelo = typeof job.params["modelo"] === "string" ? job.params["modelo"] : "—";
  const resultado = job.resultado as { custoUsd?: number | null; numTurnos?: number | null } | null;

  async function cancelar() {
    setCancelando(true);
    setErroCancel(null);
    try {
      await api(`/api/jobs/${job.id}/cancelar`, { method: "POST" });
    } catch (e) {
      setErroCancel(e instanceof ErroApi || e instanceof Error ? e.message : "Falha ao cancelar");
    } finally {
      setCancelando(false);
    }
  }

  return (
    <div className="job-detalhe">
      <div className="job-detalhe-cab">
        <div>
          <span className={`badge job-estado ${classeEstadoJob(job.estado)}`}>
            {rotuloEstadoJob(job.estado)}
          </span>
          <h3 className="job-detalhe-titulo mono">{job.titulo}</h3>
        </div>
        {jobCancelavel(job.estado) && (
          <button type="button" className="botao-perigo" onClick={cancelar} disabled={cancelando}>
            {cancelando ? "Cancelando…" : "Cancelar"}
          </button>
        )}
      </div>

      <dl className="job-campos">
        <Campo rot="Modelo" valor={modelo} />
        <Campo rot="Escopo" valor={job.escopo} />
        {resultado?.custoUsd != null && (
          <Campo rot="Custo estimado" valor={`~$${resultado.custoUsd}`} />
        )}
        {resultado?.numTurnos != null && <Campo rot="Turnos" valor={String(resultado.numTurnos)} />}
        {job.erro !== undefined && <Campo rot="Erro" valor={job.erro} />}
      </dl>

      {erroCancel !== null && <div className="aviso aviso-erro">{erroCancel}</div>}

      <div className="console-legenda" aria-hidden="true">
        <span>▶ início</span>
        <span>◆ resposta</span>
        <span>↳ subagente</span>
        <span>⚙ ferramenta</span>
        <span>■ resultado</span>
      </div>
      <Console linhas={linhas} estado={job.estado} />
    </div>
  );
}

function Console({ linhas, estado }: { linhas: LinhaLog[]; estado: string }) {
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [linhas.length]);

  return (
    <div className="console" role="log" aria-live="polite">
      {linhas.length === 0 ? (
        <p className="console-vazio">
          {estado === "na-fila" ? "Aguardando início na fila…" : "Sem saída registrada nesta sessão."}
        </p>
      ) : (
        linhas.map((l, i) => (
          <div key={i} className={`console-linha nivel-${l.nivel}`}>
            <span className="console-rot">{rotuloNivel(l.nivel)}</span>
            <span className="console-texto">{l.texto}</span>
          </div>
        ))
      )}
      <div ref={fim} />
    </div>
  );
}

function Campo({ rot, valor }: { rot: string; valor: string }) {
  return (
    <div className="campo">
      <dt>{rot}</dt>
      <dd className="mono">{valor}</dd>
    </div>
  );
}

const ROTULO_NIVEL: Record<string, string> = {
  inicio: "▶",
  assistente: "◆",
  subagente: "↳",
  ferramenta: "⚙",
  resultado: "■",
  erro: "✖",
  log: "·",
};
function rotuloNivel(nivel: string): string {
  return ROTULO_NIVEL[nivel] ?? "·";
}

function horaCurta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR");
}
