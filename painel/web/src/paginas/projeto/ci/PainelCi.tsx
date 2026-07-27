import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ErroApi } from "../../../lib/api";
import { useDados } from "../../../lib/useDados";
import { ESTADOS_JOB_ATIVOS, ESTADOS_JOB_TERMINAIS } from "../../../lib/formato";
import type { EstadoAoVivo } from "../../../lib/useJobsAoVivo";
import {
  ESTAGIOS_CI,
  type ConfigCi,
  type EstagioCi,
  type EstagioCiAoVivo,
  type Job,
  type LinhaLog,
  type ResultadoCi,
  type RespostaCi,
  type RespostaConfigCi,
} from "../../../lib/tipos";

/**
 * Aba/seção CI/CD (T-018): dispara o pipeline (T-017), mostra os 4 estágios como
 * cartões (ao vivo enquanto roda, ou o resultado persistido depois), histórico e
 * editor de `_gestao/ci.json`. Não há sistema de abas na página do projeto hoje (T-006
 * ficou como lista vertical de seções) — encaixa como mais uma `<section>`, mesmo
 * padrão das demais (Análise, Plano, Decisões).
 */

const ROTULO_ESTAGIO: Record<EstagioCi, string> = {
  instalar: "Instalar",
  lint: "Lint",
  testes: "Testes",
  build: "Build",
};

type EstadoEstagioUi = "pendente" | EstagioCiAoVivo["estado"];

const ROTULO_ESTADO_CI: Record<string, string> = {
  pendente: "Pendente",
  rodando: "Rodando",
  executando: "Rodando",
  sucesso: "OK",
  falhou: "Falhou",
  pulado: "Pulado",
  cancelado: "Cancelado",
  interrompido: "Interrompido",
};

function duracaoLegivel(ms: number | null): string {
  if (ms === null) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatarData(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
}

export function SecaoCi({
  projeto,
  jobAtivo,
  aoVivo,
}: {
  projeto: string;
  /** Job ativo do projeto (T-016) — usado só para desabilitar "Rodar pipeline". */
  jobAtivo: Job | null;
  aoVivo: Pick<EstadoAoVivo, "jobs" | "logs" | "estagiosCi">;
}) {
  const resultados = useDados<RespostaCi>(`/api/ci/${encodeURIComponent(projeto)}`);
  const [configAberta, setConfigAberta] = useState(false);
  const [disparando, setDisparando] = useState(false);
  const [erroDisparo, setErroDisparo] = useState<string | null>(null);

  const jobCi =
    aoVivo.jobs.find(
      (j) =>
        j.tipo === "ci" && j.escopo === `projeto:${projeto}` && ESTADOS_JOB_ATIVOS.has(j.estado),
    ) ?? null;

  // Refetch do resultado persistido quando o JOB DE CI (não qualquer job do projeto)
  // termina — cobre reabrir a aba depois e um CI disparado por fora do navegador.
  const vistos = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    let terminou = false;
    for (const job of aoVivo.jobs) {
      if (job.tipo !== "ci" || job.escopo !== `projeto:${projeto}`) continue;
      const anterior = vistos.current.get(job.id);
      vistos.current.set(job.id, job.estado);
      if (
        anterior !== undefined &&
        !ESTADOS_JOB_TERMINAIS.has(anterior) &&
        ESTADOS_JOB_TERMINAIS.has(job.estado)
      ) {
        terminou = true;
      }
    }
    if (terminou) resultados.recarregar();
  }, [aoVivo.jobs, projeto, resultados.recarregar]);

  async function rodar() {
    setDisparando(true);
    setErroDisparo(null);
    try {
      await api(`/api/ci/${encodeURIComponent(projeto)}/rodar`, { method: "POST" });
    } catch (e) {
      setErroDisparo(
        e instanceof ErroApi || e instanceof Error ? e.message : "Falha ao disparar o CI",
      );
    } finally {
      setDisparando(false);
    }
  }

  const bloqueado = jobAtivo !== null;
  const ultimo = resultados.dados?.ultimo ?? null;
  const historico = resultados.dados?.historico ?? [];

  return (
    <section className="secao">
      <div className="secao-cab-acao">
        <h3 className="secao-titulo">CI/CD</h3>
        <div className="form-acoes">
          <button
            type="button"
            className="botao botao-acao botao-compacto"
            onClick={rodar}
            disabled={bloqueado || disparando}
            title={bloqueado ? "Projeto ocupado por outro job — aguarde terminar." : undefined}
          >
            {disparando ? "Disparando…" : "Rodar pipeline"}
          </button>
          <button
            type="button"
            className="botao botao-secundario botao-compacto"
            onClick={() => setConfigAberta((a) => !a)}
          >
            {configAberta ? "Fechar config" : "Configurar"}
          </button>
        </div>
      </div>

      {erroDisparo !== null && <div className="aviso aviso-erro aviso-compacto">{erroDisparo}</div>}

      {configAberta && <EditorConfigCi projeto={projeto} />}

      {resultados.erro !== null && <div className="aviso aviso-erro aviso-compacto">{resultados.erro}</div>}

      {jobCi !== null ? (
        <>
          <p className="texto-suave ci-estagio-meta">
            Rodando agora — <Link to={`/jobs?job=${encodeURIComponent(jobCi.id)}`}>ver no console</Link>.
          </p>
          <EstagiosAoVivo
            estagiosAoVivo={aoVivo.estagiosCi[jobCi.id] ?? {}}
            logs={aoVivo.logs[jobCi.id] ?? []}
          />
        </>
      ) : ultimo !== null ? (
        <EstagiosResultado resultado={ultimo} />
      ) : (
        <p className="texto-suave">Nenhuma execução de CI ainda. Clique em "Rodar pipeline".</p>
      )}

      {historico.length > 1 && <Historico historico={historico} />}
    </section>
  );
}

function EstagiosAoVivo({
  estagiosAoVivo,
  logs,
}: {
  estagiosAoVivo: Record<string, EstagioCiAoVivo>;
  logs: LinhaLog[];
}) {
  return (
    <div className="grade-ci">
      {ESTAGIOS_CI.map((nome) => {
        const info = estagiosAoVivo[nome];
        const estado: EstadoEstagioUi = info?.estado ?? "pendente";
        const linhasEstagio = logs.filter((l) => l.estagio === nome);
        return (
          <CartaoEstagio
            key={nome}
            nome={nome}
            estado={estado}
            comando={info?.comando ?? null}
            aviso={info?.aviso ?? null}
            duracaoMs={info?.duracaoMs ?? null}
            linhasLog={estado === "rodando" || estado === "falhou" ? linhasEstagio.slice(-30) : []}
          />
        );
      })}
    </div>
  );
}

function EstagiosResultado({ resultado }: { resultado: ResultadoCi }) {
  return (
    <>
      <p className="texto-suave ci-estagio-meta">
        Última execução: {formatarData(resultado.iniciadoEm)} —{" "}
        <span className={`badge ci-badge ci-badge-${resultado.estado}`}>
          {ROTULO_ESTADO_CI[resultado.estado] ?? resultado.estado}
        </span>{" "}
        — <Link to={`/jobs?job=${encodeURIComponent(resultado.jobId)}`}>ver log completo</Link>
      </p>
      <div className="grade-ci">
        {ESTAGIOS_CI.map((nome) => {
          const e = resultado.estagios.find((x) => x.estagio === nome) ?? null;
          return (
            <CartaoEstagio
              key={nome}
              nome={nome}
              estado={e?.estado ?? "pendente"}
              comando={e?.comando ?? null}
              aviso={e?.aviso ?? null}
              duracaoMs={e?.duracaoMs ?? null}
              linhasLog={[]}
            />
          );
        })}
      </div>
    </>
  );
}

function CartaoEstagio({
  nome,
  estado,
  comando,
  aviso,
  duracaoMs,
  linhasLog,
}: {
  nome: EstagioCi;
  estado: EstadoEstagioUi;
  comando: string | null;
  aviso: string | null;
  duracaoMs: number | null;
  linhasLog: LinhaLog[];
}) {
  return (
    <article className={`ci-estagio-card ${estado === "falhou" ? "ci-estagio-card--falhou" : ""}`}>
      <div className="ci-estagio-cab">
        <span className="ci-estagio-nome">{ROTULO_ESTAGIO[nome]}</span>
        <span className={`badge ci-badge ci-badge-${estado}`}>
          {ROTULO_ESTADO_CI[estado] ?? estado}
        </span>
      </div>
      {comando !== null && <code className="ci-estagio-meta">{comando}</code>}
      {duracaoMs !== null && <p className="ci-estagio-meta">{duracaoLegivel(duracaoMs)}</p>}
      {aviso !== null && <p className="ci-estagio-meta">{aviso}</p>}
      {linhasLog.length > 0 && (
        <div className="console ci-estagio-log" role="log" aria-live="polite">
          {linhasLog.map((l, i) => (
            <div key={i} className="console-linha">
              <span className="console-texto">{l.texto}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function Historico({ historico }: { historico: ResultadoCi[] }) {
  return (
    <div className="ci-historico">
      <h5 className="secao-tarefa-rot">Histórico</h5>
      {historico.map((r) => (
        <div key={r.jobId} className="ci-historico-item">
          <span className={`badge ci-badge ci-badge-${r.estado}`}>
            {ROTULO_ESTADO_CI[r.estado] ?? r.estado}
          </span>
          <span className="texto-suave">{formatarData(r.iniciadoEm)}</span>
          <Link to={`/jobs?job=${encodeURIComponent(r.jobId)}`}>ver log</Link>
        </div>
      ))}
    </div>
  );
}

/** Editor de `_gestao/ci.json` (comando + habilitado por estágio, timeout). */
function EditorConfigCi({ projeto }: { projeto: string }) {
  const config = useDados<RespostaConfigCi>(`/api/ci/${encodeURIComponent(projeto)}/config`);
  const [rascunho, setRascunho] = useState<ConfigCi | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (config.dados !== null) setRascunho(config.dados.config);
  }, [config.dados]);

  if (config.carregando) return <p className="texto-suave">Carregando config…</p>;
  if (config.erro !== null) return <div className="aviso aviso-erro aviso-compacto">{config.erro}</div>;
  if (rascunho === null) return null;

  function mudarEstagio(nome: EstagioCi, campo: "comando" | "habilitado", valor: string | boolean) {
    setRascunho((atual) =>
      atual === null
        ? atual
        : { ...atual, estagios: { ...atual.estagios, [nome]: { ...atual.estagios[nome], [campo]: valor } } },
    );
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (rascunho === null) return;
    setSalvando(true);
    setErro(null);
    setOk(false);
    try {
      await api(`/api/ci/${encodeURIComponent(projeto)}/config`, {
        method: "PUT",
        body: JSON.stringify(rascunho),
      });
      setOk(true);
    } catch (e) {
      setErro(e instanceof ErroApi || e instanceof Error ? e.message : "Falha ao salvar a config");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="form-acao" onSubmit={salvar}>
      {ESTAGIOS_CI.map((nome) => {
        const e = rascunho.estagios[nome];
        return (
          <label key={nome} className="campo-form">
            <span>
              <input
                type="checkbox"
                checked={e.habilitado}
                onChange={(ev) => mudarEstagio(nome, "habilitado", ev.target.checked)}
              />{" "}
              {ROTULO_ESTAGIO[nome]}
            </span>
            <input
              type="text"
              value={e.comando ?? ""}
              onChange={(ev) => mudarEstagio(nome, "comando", ev.target.value)}
              placeholder="comando (ex.: npm test)"
            />
          </label>
        );
      })}
      <label className="campo-form">
        <span>Timeout por estágio (ms)</span>
        <input
          type="number"
          min={1000}
          value={rascunho.timeoutMs}
          onChange={(ev) =>
            setRascunho((atual) =>
              atual === null ? atual : { ...atual, timeoutMs: Number(ev.target.value) },
            )
          }
        />
      </label>

      {erro !== null && <div className="aviso aviso-erro aviso-compacto">{erro}</div>}
      {ok && <p className="texto-suave">Config salva.</p>}

      <div className="form-acoes">
        <button type="submit" className="botao botao-acao botao-compacto" disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar config"}
        </button>
      </div>
    </form>
  );
}
