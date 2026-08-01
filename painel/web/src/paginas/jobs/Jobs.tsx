import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import { avisoLimiteDeUso } from "../../lib/limite-uso";
import { avisoDespachoEmVoo, avisoDespachoFundo } from "../../lib/avisos-job";
import { useHistoricoLog } from "../../lib/useHistoricoLog";
import { useJobsAoVivo } from "../../lib/useJobsAoVivo";
import {
  agenteAtivo,
  segmentarPorAgente,
  segmentarPorEstagio,
  tarefaEmFoco,
  type EtapaPipeline,
  type SegmentoAgente,
} from "../../lib/atividade";
import type { Job, LinhaLog, Pendencia, ResumoTrecho, ResultadoContabil } from "../../lib/tipos";
import { custoDoJob, explicarCusto, formatarCusto, ratearPorAgente } from "../../lib/custo";
import {
  classeEstadoJob,
  decorrido,
  duracaoLegivel,
  jobCancelavel,
  milhares,
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

function DetalheJob({ job, linhas: linhasAoVivo }: { job: Job; linhas: LinhaLog[] }) {
  // Ao vivo vem do SSE; job já terminado (ou fora do buffer de replay) é lido do
  // `<id>.log.jsonl` gravado no fim da execução. Ver `useHistoricoLog`.
  const historico = useHistoricoLog(job.id, linhasAoVivo);
  const linhas = historico.linhas;
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
  const resultado = job.resultado as
    | (ResultadoContabil & { motivo?: string; reabreEm?: string | null })
    | null;
  // Real ou estimado, com o prefixo que declara qual é. Ver `lib/custo`.
  const custo = custoDoJob(job);
  const fatias = ratearPorAgente(job);
  // Decisão e texto vivem em `lib/limite-uso` — os testes da web são de lógica pura, então
  // lógica dentro do componente seria lógica não verificada.
  const avisoCota = avisoLimiteDeUso(resultado);
  const avisoFundo = avisoDespachoFundo(resultado);
  const avisoEmVoo = avisoDespachoEmVoo(resultado);

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
        {/* Só quando passa de 1: um job com uma sessão é o esperado e o campo viraria ruído.
            Acima disso importa — cada sessão reescreve o prefixo do cache, a linha mais cara
            da conta (~1,75x contra 0,1x da leitura). Ver `sessoes` no runner. */}
        {resultado?.sessoes != null && resultado.sessoes > 1 && (
          <Campo rot="Sessões abertas" valor={String(resultado.sessoes)} />
        )}
        {/* T-049: o campo aparece MESMO em job cortado, com "~" (estimado) ou "≥"
            (subestimado). Antes ele simplesmente não renderizava quando `custoUsd` era
            null — e job cortado por cota é justamente o mais caro, então o painel calava
            exatamente onde precisava falar. */}
        {custo !== null && (
          <Campo
            rot={custo.estimado ? "Custo estimado" : "Custo real"}
            valor={formatarCusto(custo)}
            ajuda={explicarCusto(custo)}
          />
        )}
        {/* Tokens ao lado do preço (T-044): preço diz QUANTO, token diz POR QUÊ. Numa
            auditoria de custo é a diferença entre saber que ficou caro e saber onde. */}
        {resultado?.tokens != null && (
          <>
            <Campo rot="Tokens de saída" valor={milhares(resultado.tokens.saida)} />
            <Campo
              rot="Contexto relido"
              valor={`${milhares(resultado.tokens.cacheLeitura)} de cache`}
              ajuda={
                "Contexto reenviado a cada volta. Num fluxo agêntico costuma ser a maior" +
                " parcela do volume: se ele domina, o caro é o TAMANHO DO CONTEXTO, não o" +
                " que o modelo escreveu."
              }
            />
            {/* A razão que responde "está eficiente?" numa olhada. Preço e token isolados
                não comparam entre jobs de tamanhos diferentes; a razão compara. */}
            {resultado.tokens.saida > 0 && (
              <Campo
                rot="Relido por token escrito"
                valor={`${Math.round(resultado.tokens.cacheLeitura / resultado.tokens.saida)}×`}
                ajuda={
                  "Quantos tokens de contexto foram relidos para cada token produzido." +
                  " É a medida de eficiência do fluxo: sobe quando os agentes carregam" +
                  " contexto demais ou dão voltas curtas demais."
                }
              />
            )}
          </>
        )}
        {resultado?.tokensParciais === true && (
          <Campo
            rot="Contabilidade"
            valor="parcial"
            ajuda={
              "O fluxo foi cortado antes de o SDK fechar a conta. Os números vêm do que foi" +
              " observado durante a execução — são um PISO do consumo real."
            }
          />
        )}
        {job.sessionId !== undefined && <Campo rot="Sessão" valor={job.sessionId} />}
        {job.erro !== undefined && avisoCota === null && <Campo rot="Erro" valor={job.erro} />}
      </dl>

      {/* Onde o dinheiro foi (T-050). O total sozinho não é acionável: o pipeline despacha
          3 agentes por tarefa e é a repartição que diz em qual mexer. */}
      {fatias.length > 1 && (
        <div className="rateio">
          <h4 className="rateio-titulo">Custo por agente</h4>
          <ul className="rateio-lista">
            {fatias.map((f) => (
              <li key={f.agente} className="rateio-linha">
                <span className="rateio-nome mono">{f.agente}</span>
                <span className="rateio-barra" aria-hidden="true">
                  <span className="rateio-preenchida" style={{ width: `${(f.fracao * 100).toFixed(1)}%` }} />
                </span>
                <span
                  className="rateio-valor mono"
                  title={
                    `${f.despachos} despacho(s) · ${f.voltas} volta(s) ao modelo · ` +
                    `${f.ferramentas} chamada(s) de ferramenta. O custo cresce com o QUADRADO ` +
                    "das idas ao modelo: dobrar as chamadas quadruplica o gasto do agente."
                  }
                >
                  {(f.fracao * 100).toFixed(0)}% · {f.ferramentas} ferr.
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {avisoCota !== null && (
        <div className="aviso aviso-erro">
          <strong>Limite de uso da assinatura.</strong> {avisoCota}
        </div>
      )}

      {/* Dano consumado vem ANTES do risco: quando os dois aparecem, é este que decide. */}
      {avisoEmVoo !== null && (
        <div className="aviso aviso-erro">
          <strong>Agente cortado no meio do trabalho.</strong> {avisoEmVoo}
        </div>
      )}

      {avisoFundo !== null && (
        <div className="aviso aviso-erro">
          <strong>Pode ter ficado trabalho pela metade.</strong> {avisoFundo}
        </div>
      )}

      {erroCancel !== null && <div className="aviso aviso-erro">{erroCancel}</div>}

      <h4 className="secao-tarefa-rot">
        {job.usaClaude ? "O que cada agente fez" : "Passo a passo"}
      </h4>
      {linhas.length === 0 && (job.resumos?.length ?? 0) > 0 ? (
        // Log perdido mas resumo preservado — este é o caso NORMAL ao rever uma execução
        // antiga, porque as linhas de log só trafegam pelo SSE e o resumo mora no job.
        // Sem este ramo o resumo ficaria invisível justamente quando é a única memória
        // do que aconteceu.
        <>
          <p className="texto-suave">
            O texto integral não está mais em memória — o resumo de cada trecho ficou:
          </p>
          <ol className="trechos">
            {job.resumos!.map((r) => (
              <ResumoSolto key={r.indice} resumo={r} />
            ))}
          </ol>
        </>
      ) : linhas.length === 0 ? (
        <p className="texto-suave">
          {rodando
            ? "Aguardando os primeiros passos…"
            : "Sem log gravado para esta execução — ela é anterior ao histórico persistido, " +
              "ou o servidor caiu antes de fechá-la."}
        </p>
      ) : (
        <ol className="trechos">
          {historico.descartadas > 0 && (
            <li className="texto-suave trecho-aviso">
              {historico.descartadas} linha(s) do meio foram omitidas pelo teto de histórico —
              começo e fim estão inteiros.
            </li>
          )}
          {segmentos.map((s, i) => (
            <Trecho
              key={i}
              segmento={s}
              aberto={i === segmentos.length - 1}
              rotuloSemAgente={job.usaClaude ? "orquestrador" : "pipeline"}
              // O `indice` do servidor é a posição do segmento aqui: as duas pontas usam
              // a mesma regra de corte (despacho de subagente abre trecho).
              resumo={job.resumos?.find((r) => r.indice === i)}
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

/**
 * Resumo exibido sem o trecho de log correspondente — o que sobra de uma execução depois
 * que o log efêmero se foi. Mesma aparência do cartão dentro do `Trecho`, sem o "ver na
 * íntegra" (não há íntegra para mostrar).
 */
function ResumoSolto({ resumo }: { resumo: ResumoTrecho }) {
  if (resumo.naoDeu || resumo.linhas.length === 0) return null;
  return (
    <li className="trecho trecho-orquestrador">
      <div className="trecho-cab-linha">
        <span className="trecho-nome">{resumo.agente ?? "orquestrador"}</span>
        {resumo.custoUsd != null && (
          <span className="trecho-meta">resumo ~${resumo.custoUsd.toFixed(4)}</span>
        )}
      </div>
      <div className="trecho-resumo">
        {resumo.linhas.map((l, i) => (
          <p key={i} className="resumo-linha">
            {l}
          </p>
        ))}
        {resumo.itens.length > 0 && (
          <ul className="resumo-itens">
            {resumo.itens.map((item, i) => (
              <li key={i} className={`resumo-item resumo-${item.tipo}`}>
                <span className="resumo-marca" aria-hidden="true">
                  {item.tipo === "feito" ? "✓" : "⚠"}
                </span>
                {item.texto}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function Trecho({
  segmento,
  aberto,
  rotuloSemAgente,
  resumo,
}: {
  segmento: SegmentoAgente;
  aberto: boolean;
  /** Como chamar o trecho sem agente: "orquestrador" (Claude) ou "pipeline" (CI). */
  rotuloSemAgente: string;
  /** Resumo do trecho (T-039); ausente = ainda não chegou ou não deu. */
  resumo?: ResumoTrecho | undefined;
}) {
  const [expandido, setExpandido] = useState(aberto);
  const nome = segmento.agente ?? rotuloSemAgente;
  const ferramentas = segmento.linhas.filter((l) => l.nivel === "ferramenta").length;
  // Inclui `log` e `resultado`: é o nível que o runner de CI emite (stdout dos estágios).
  // Filtrar só assistente/subagente fazia um job de CI dizer "sem texto produzido" com o
  // processo despejando saída — mentira visível na tela.
  const NIVEIS_TEXTO = new Set(["assistente", "subagente", "log", "resultado", "erro"]);
  const textos = segmento.linhas.filter((l) => NIVEIS_TEXTO.has(l.nivel) && l.texto.trim() !== "");

  // Com resumo utilizável, ele é o conteúdo do trecho e o texto cru vira opcional. Foi o
  // pedido explícito do usuário: o console despejava páginas de texto e, por isso mesmo,
  // não era lido.
  const temResumo = resumo !== undefined && !resumo.naoDeu && resumo.linhas.length > 0;

  return (
    <li className={`trecho trecho-${segmento.etapa ?? "orquestrador"}`}>
      <div className="trecho-cab-linha">
        <span className="trecho-nome">{nome}</span>
        {segmento.etapa !== null && <span className="badge badge-suave">{segmento.etapa}</span>}
        <span className="trecho-meta">
          {ferramentas > 0 && `${ferramentas} ferramenta(s)`}
          {segmento.duracaoMs > 0 && ` · ${duracaoLegivel(segmento.duracaoMs)}`}
          {resumo?.custoUsd != null && ` · resumo ~$${resumo.custoUsd.toFixed(4)}`}
        </span>
      </div>

      {temResumo && (
        <div className="trecho-resumo">
          {resumo.linhas.map((l, i) => (
            <p key={i} className="resumo-linha">
              {l}
            </p>
          ))}
          {resumo.itens.length > 0 && (
            <ul className="resumo-itens">
              {resumo.itens.map((item, i) => (
                <li key={i} className={`resumo-item resumo-${item.tipo}`}>
                  <span className="resumo-marca" aria-hidden="true">
                    {item.tipo === "feito" ? "✓" : "⚠"}
                  </span>
                  {item.texto}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {textos.length > 0 && (
        <button
          type="button"
          className="trecho-verbatim"
          onClick={() => setExpandido((v) => !v)}
          aria-expanded={expandido}
        >
          {expandido ? "▾ esconder o texto integral" : `▸ ver na íntegra (${textos.length} trecho(s))`}
        </button>
      )}

      {/* Sem resumo, o texto cru abre por padrão: é melhor texto demais que tela vazia. */}
      {(expandido || (!temResumo && aberto)) && (
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

/**
 * `ajuda` vira `title` no rótulo (T-049). Existe porque os campos de custo passaram a
 * carregar QUALIFICAÇÃO — "~" é estimativa, "≥" é piso — e um símbolo que ninguém consegue
 * decifrar não informa: ou explica onde está, ou vira ruído com cara de precisão.
 */
function Campo({ rot, valor, ajuda }: { rot: string; valor: string; ajuda?: string }) {
  return (
    <div className="campo">
      <dt {...(ajuda !== undefined ? { title: ajuda, className: "campo-com-ajuda" } : {})}>
        {rot}
      </dt>
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
