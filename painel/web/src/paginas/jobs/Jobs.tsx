import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import { useJobsAoVivo } from "../../lib/useJobsAoVivo";
import {
  agenteAtivo,
  segmentarPorAgente,
  segmentarPorEstagio,
  tarefaEmFoco,
  type EtapaPipeline,
  type SegmentoAgente,
} from "../../lib/atividade";
import type { Job, LinhaLog, Pendencia } from "../../lib/tipos";
import {
  classeEstadoJob,
  decorrido,
  duracaoLegivel,
  jobCancelavel,
  rotuloEstadoJob,
} from "../../lib/formato";
import { useAgora } from "../../lib/useAgora";
import { Carregando, MensagemErro } from "../../componentes/Estados";

/**
 * Página de Jobs (T-024): acompanhar a execução VENDO, não lendo.
 *
 * Antes era uma parede de log monoespaçado com prefixos. O pedido do usuário era
 * "detalhe dos jobs e o que está fazendo, assim como cada agente" — então a visão
 * principal passou a ser: quem trabalha agora, em que etapa do pipeline, em qual tarefa,
 * e o que cada agente fez (em blocos). O log cru continua, atrás de "ver log técnico".
 */
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
        <h2 className="intro-titulo">Execuções</h2>
        <p className="intro-sub">
          Cada fluxo que você dispara vira uma execução aqui. Veja qual agente está
          trabalhando, em que etapa do ciclo e o que cada um fez.{" "}
          <span className={`ponto-conexao ${conectado ? "on" : "off"}`} aria-hidden="true" />
          <span className="texto-suave">{conectado ? "ao vivo" : "reconectando…"}</span>
        </p>
      </section>

      {erro !== null && (
        <MensagemErro
          erro={erro}
          dica="O servidor do painel está no ar? Rode `npm start` (ou o INICIAR.bat) na pasta da fábrica."
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
              <ItemJob
                key={job.id}
                job={job}
                agente={agenteAtivo(logs[job.id] ?? [])}
                ativo={job.id === idSelecionado}
                aoClicar={() => selecionar(job.id)}
              />
            ))
          )}
        </aside>

        <section className="jobs-detalhe">
          {selecionado === null ? (
            <p className="texto-suave estado-mensagem">
              Selecione uma execução à esquerda.
            </p>
          ) : (
            <DetalheJob job={selecionado} linhas={logs[selecionado.id] ?? []} />
          )}
        </section>
      </div>
    </div>
  );
}

function ItemJob({
  job,
  agente,
  ativo,
  aoClicar,
}: {
  job: Job;
  agente: string | null;
  ativo: boolean;
  aoClicar: () => void;
}) {
  const rodando = jobCancelavel(job.estado);
  return (
    <button
      type="button"
      className={`job-item ${ativo ? "ativo" : ""}`}
      onClick={aoClicar}
      title={job.titulo}
    >
      <span className="job-item-topo">
        <span className={`badge job-estado ${classeEstadoJob(job.estado)}`}>
          {rotuloEstadoJob(job.estado)}
        </span>
        <span className="job-item-hora">{horaCurta(job.criadoEm)}</span>
      </span>
      <span className="job-item-titulo mono">{job.titulo}</span>
      {rodando && agente !== null && (
        <span className="job-item-agente">
          <span className="pulso-mini" aria-hidden="true" /> {agente}
        </span>
      )}
    </button>
  );
}

function DetalheJob({ job, linhas }: { job: Job; linhas: LinhaLog[] }) {
  const [cancelando, setCancelando] = useState(false);
  const [erroCancel, setErroCancel] = useState<string | null>(null);
  const [verLogCru, setVerLogCru] = useState(false);

  const rodando = jobCancelavel(job.estado);
  // Relógio só corre enquanto o job está vivo; terminado tem duração fixa.
  const agora = useAgora(rodando);
  const fim = rodando ? agora : Date.parse(job.terminadoEm ?? job.criadoEm);
  const tempo = decorrido(job.iniciadoEm ?? job.criadoEm, fim);
  const agente = rodando ? agenteAtivo(linhas) : null;
  // Job Claude segmenta por AGENTE; job de CI por ESTÁGIO — ele não tem agentes.
  const segmentos = job.usaClaude ? segmentarPorAgente(linhas) : segmentarPorEstagio(linhas);
  const tarefa = tarefaEmFoco(linhas);
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
        {rodando && (
          <button type="button" className="botao-perigo" onClick={cancelar} disabled={cancelando}>
            {cancelando ? "Cancelando…" : "Cancelar"}
          </button>
        )}
      </div>

      {/* Quem está trabalhando AGORA — a informação nº 1 que o usuário quer. */}
      {rodando && (
        <div className="agora">
          <span className="agora-avatar" aria-hidden="true">
            {(agente ?? "orq").slice(0, 2).toUpperCase()}
          </span>
          <div className="agora-texto">
            <strong className="agora-nome">
              {agente ?? (job.usaClaude ? "orquestrador" : "CI")}
              <span className="pulso" aria-hidden="true" />
            </strong>
            <span className="agora-sub">
              {!job.usaClaude
                ? "executando o pipeline"
                : agente !== null
                  ? "trabalhando agora"
                  : "organizando o trabalho"}
              {tarefa !== null && ` · tarefa ${tarefa}`}
              {tempo !== null && ` · há ${tempo}`}
            </span>
          </div>
        </div>
      )}

      {job.usaClaude && (
        <TrilhaPipeline etapa={agente !== null ? etapaDe(agente) : null} segmentos={segmentos} />
      )}

      <dl className="job-campos">
        <Campo rot="Modelo" valor={modelo} />
        <Campo rot="Escopo" valor={job.escopo} />
        {tempo !== null && <Campo rot={rodando ? "Rodando há" : "Durou"} valor={tempo} />}
        {resultado?.numTurnos != null && <Campo rot="Turnos" valor={String(resultado.numTurnos)} />}
        {resultado?.custoUsd != null && (
          <Campo rot="Custo real" valor={`~$${resultado.custoUsd.toFixed(4)}`} />
        )}
        {job.sessionId !== undefined && <Campo rot="Sessão" valor={job.sessionId} />}
        {job.erro !== undefined && <Campo rot="Erro" valor={job.erro} />}
      </dl>

      {erroCancel !== null && <div className="aviso aviso-erro">{erroCancel}</div>}

      <h4 className="secao-tarefa-rot">
        {job.usaClaude ? "O que cada agente fez" : "Passo a passo"}
      </h4>
      {linhas.length === 0 ? (
        <p className="texto-suave">
          {rodando
            ? "Aguardando os primeiros passos…"
            : "O log desta execução não está mais em memória. O painel guarda os metadados " +
              "do job, mas não o texto da saída entre reinícios do servidor."}
        </p>
      ) : (
        <ol className="trechos">
          {segmentos.map((s, i) => (
            <Trecho
              key={i}
              segmento={s}
              aberto={i === segmentos.length - 1}
              rotuloSemAgente={job.usaClaude ? "orquestrador" : "pipeline"}
            />
          ))}
        </ol>
      )}

      <button
        type="button"
        className="botao botao-secundario botao-compacto botao-log"
        onClick={() => setVerLogCru((v) => !v)}
      >
        {verLogCru ? "Esconder log técnico" : "Ver log técnico"}
      </button>
      {verLogCru && <Console linhas={linhas} estado={job.estado} />}
    </div>
  );
}

function etapaDe(agente: string): EtapaPipeline {
  if (agente === "testador") return "testador";
  if (agente === "revisor") return "revisor";
  return "construtor";
}

/** Onde a tarefa está no ciclo construir → testar → revisar. */
function TrilhaPipeline({
  etapa,
  segmentos,
}: {
  etapa: EtapaPipeline | null;
  segmentos: SegmentoAgente[];
}) {
  const etapas: { id: EtapaPipeline; rotulo: string }[] = [
    { id: "construtor", rotulo: "Construir" },
    { id: "testador", rotulo: "Testar" },
    { id: "revisor", rotulo: "Revisar" },
  ];
  const cumpridas = new Set(segmentos.map((s) => s.etapa).filter((e): e is EtapaPipeline => e !== null));

  return (
    <ol className="trilha" aria-label="Etapa do ciclo">
      {etapas.map((e) => {
        const atual = etapa === e.id;
        const feita = !atual && cumpridas.has(e.id);
        return (
          <li
            key={e.id}
            className={`trilha-etapa ${atual ? "trilha-atual" : ""} ${feita ? "trilha-feita" : ""}`}
          >
            <span className="trilha-ponto" aria-hidden="true" />
            <span className="trilha-rot">{e.rotulo}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Trecho({
  segmento,
  aberto,
  rotuloSemAgente,
}: {
  segmento: SegmentoAgente;
  aberto: boolean;
  /** Como chamar o trecho sem agente: "orquestrador" (Claude) ou "pipeline" (CI). */
  rotuloSemAgente: string;
}) {
  const [expandido, setExpandido] = useState(aberto);
  const nome = segmento.agente ?? rotuloSemAgente;
  const ferramentas = segmento.linhas.filter((l) => l.nivel === "ferramenta").length;
  // Inclui `log` e `resultado`: é o nível que o runner de CI emite (stdout dos estágios).
  // Filtrar só assistente/subagente fazia um job de CI dizer "sem texto produzido" com o
  // processo despejando saída — mentira visível na tela.
  const NIVEIS_TEXTO = new Set(["assistente", "subagente", "log", "resultado", "erro"]);
  const textos = segmento.linhas.filter((l) => NIVEIS_TEXTO.has(l.nivel) && l.texto.trim() !== "");

  return (
    <li className={`trecho trecho-${segmento.etapa ?? "orquestrador"}`}>
      <button type="button" className="trecho-cab" onClick={() => setExpandido((v) => !v)}>
        <span className="trecho-seta" aria-hidden="true">
          {expandido ? "▾" : "▸"}
        </span>
        <span className="trecho-nome">{nome}</span>
        {segmento.etapa !== null && <span className="badge badge-suave">{segmento.etapa}</span>}
        <span className="trecho-meta">
          {ferramentas > 0 && `${ferramentas} ferramenta(s)`}
          {segmento.duracaoMs > 0 && ` · ${duracaoLegivel(segmento.duracaoMs)}`}
        </span>
      </button>

      {expandido && (
        <div className="trecho-corpo">
          {textos.length === 0 ? (
            <p className="texto-suave">Sem texto produzido neste trecho.</p>
          ) : (
            textos.map((l, i) => (
              <p key={i} className={`trecho-fala nivel-${l.nivel}`}>
                {l.texto}
              </p>
            ))
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Inputs pendentes (T-010): quando um fluxo pausa esperando aprovação ou uma resposta, o
 * cartão aparece aqui e destrava o fluxo ao responder. Fica no topo por ser bloqueante.
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
