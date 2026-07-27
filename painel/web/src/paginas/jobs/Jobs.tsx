import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import { useJobsAoVivo } from "../../lib/useJobsAoVivo";
import type { Job, LinhaLog, Pendencia } from "../../lib/tipos";
import { classeEstadoJob, jobCancelavel, rotuloEstadoJob } from "../../lib/formato";
import { Carregando, MensagemErro } from "../../componentes/Estados";

export function Jobs() {
  const { jobs, logs, pendencias, conectado, carregando, erro } = useJobsAoVivo();
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

      {erro !== null && (
        <MensagemErro
          erro={erro}
          dica="O servidor do painel está no ar? Rode `npm start` (ou `npm run dev`) na pasta do painel."
        />
      )}

      <PainelInputs pendencias={pendencias} />

      <div className="jobs-layout">
        <aside className="jobs-lista">
          {carregando ? (
            <Carregando texto="Carregando execuções…" />
          ) : jobs.length === 0 ? (
            <p className="texto-suave">
              {erro !== null
                ? "Não foi possível carregar as execuções."
                : "Nenhuma execução ainda. Dispare uma ação na página inicial."}
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

/**
 * Inputs pendentes (T-010): quando um fluxo pausa esperando aprovação ou uma resposta, o
 * cartão aparece aqui e destrava o fluxo ao responder. Some sozinho via evento SSE
 * `input-respondido`. Fica no topo por ser bloqueante.
 */
function PainelInputs({ pendencias }: { pendencias: Pendencia[] }) {
  if (pendencias.length === 0) return null;
  return (
    <section className="secao inputs-pendentes">
      <h3 className="secao-titulo">⏸ Aguardando você ({pendencias.length})</h3>
      <div className="grade-cards">
        {pendencias.map((p) => (
          <CartaoInput key={p.id} pendencia={p} />
        ))}
      </div>
    </section>
  );
}

function CartaoInput({ pendencia }: { pendencia: Pendencia }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [texto, setTexto] = useState("");

  async function responder(corpo: Record<string, unknown>) {
    setEnviando(true);
    setErro(null);
    try {
      // A resposta destrava o fluxo; o cartão some via evento SSE `input-respondido`.
      await api(`/api/inputs/${pendencia.id}/resposta`, {
        method: "POST",
        body: JSON.stringify(corpo),
      });
    } catch (e) {
      setErro(e instanceof ErroApi || e instanceof Error ? e.message : "Falha ao responder");
      setEnviando(false);
    }
  }

  return (
    <article className="card card-input">
      <div className="card-cab">
        <h4 className="card-titulo">{pendencia.titulo}</h4>
        <span className="badge badge-suave">
          {pendencia.tipo === "pergunta" ? "pergunta" : "aprovação"}
        </span>
      </div>
      <p className="card-desc">{pendencia.descricao}</p>

      {pendencia.tipo === "pergunta" ? (
        pendencia.opcoes && pendencia.opcoes.length > 0 ? (
          <div className="input-opcoes">
            {pendencia.opcoes.map((o) => (
              <button
                key={o}
                type="button"
                className="botao botao-acao botao-compacto"
                disabled={enviando}
                onClick={() => responder({ escolha: o })}
              >
                {o}
              </button>
            ))}
          </div>
        ) : (
          <div className="input-acoes">
            <input
              type="text"
              className="input-motivo"
              placeholder="sua resposta"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <button
              type="button"
              className="botao botao-acao botao-compacto"
              disabled={enviando || texto.trim() === ""}
              onClick={() => responder({ escolha: texto.trim() })}
            >
              Responder
            </button>
          </div>
        )
      ) : (
        <div className="input-acoes">
          <button
            type="button"
            className="botao botao-acao botao-compacto"
            disabled={enviando}
            onClick={() => responder({ aprovado: true })}
          >
            Aprovar
          </button>
          <input
            type="text"
            className="input-motivo"
            placeholder="motivo (opcional)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <button
            type="button"
            className="botao botao-perigo botao-compacto"
            disabled={enviando}
            onClick={() => responder({ aprovado: false, mensagem: motivo.trim() || undefined })}
          >
            Negar
          </button>
        </div>
      )}

      {erro !== null && <div className="aviso aviso-erro aviso-compacto">{erro}</div>}
    </article>
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
