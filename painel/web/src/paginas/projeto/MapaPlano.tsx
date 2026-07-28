import { useState } from "react";
import {
  montarGrafoExecucao,
  montarMapaPlano,
  type FaseComProgresso,
} from "../../lib/atividade";
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
          <OrdemDeExecucao tarefas={tarefas} aoSelecionar={aoSelecionar} />
        </>
      )}
    </section>
  );
}

/**
 * Ordem de execução e paralelismo (T-025). Responde "o que pode rodar ao mesmo tempo?",
 * pergunta que o painel não sabia responder — o usuário teve que perguntar no chat.
 *
 * Cada NÍVEL é um degrau de dependência: o nível 0 pode começar já; o 1 só depois que o 0
 * concluir. Dentro do nível, o LOTE é o que a fábrica de fato roda junto (áreas disjuntas,
 * teto de 3) — não basta não ter dependência, porque os agentes dividem a mesma árvore
 * de arquivos.
 */
function OrdemDeExecucao({
  tarefas,
  aoSelecionar,
}: {
  tarefas: TarefaCompleta[];
  aoSelecionar: (arquivo: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const grafo = montarGrafoExecucao(tarefas);
  if (grafo.niveis.length === 0 && grafo.ciclos.length === 0) return null;

  return (
    <div className="ordem">
      <button type="button" className="ordem-toggle" onClick={() => setAberto((v) => !v)}>
        <span aria-hidden="true">{aberto ? "▾" : "▸"}</span> Ordem de execução e paralelismo
        <span className="badge badge-suave">
          até {grafo.paralelismoMaximo} em paralelo
        </span>
      </button>

      {aberto && (
        <>
          <p className="texto-suave ordem-ajuda">
            Cada degrau só começa quando o anterior termina. Dentro do degrau, as tarefas
            marcadas com <span className="marca-paralelo">∥</span> rodam{" "}
            <strong>ao mesmo tempo</strong> — as demais esperam porque mexem nos mesmos
            arquivos (os agentes dividem a mesma árvore) ou porque o teto é 3 por vez.
          </p>

          {grafo.ciclos.length > 0 && (
            <div className="aviso aviso-erro aviso-compacto">
              Ciclo de dependência entre {grafo.ciclos.join(", ")} — essas tarefas nunca
              vão executar. Corrija o campo `dependencias` delas.
            </div>
          )}
          {grafo.quebradas.length > 0 && (
            <div className="aviso aviso-info aviso-compacto">
              {grafo.quebradas.map((q) => `${q.tarefa} depende de ${q.falta}, que não existe`).join(" · ")}
            </div>
          )}

          <ol className="degraus">
            {grafo.niveis.map((n) => (
              <li key={n.nivel} className="degrau">
                <div className="degrau-num">
                  <span className="degrau-rot">{n.nivel + 1}º</span>
                  {n.loteParalelo.length > 1 && (
                    <span className="degrau-par" title="Tarefas que rodam simultaneamente">
                      ∥ {n.loteParalelo.length}
                    </span>
                  )}
                </div>
                <div className="degrau-blocos">
                  {n.tarefas.map((t) => (
                    <button
                      key={t.arquivo}
                      type="button"
                      className={`bloco st-${t.status} ${
                        n.loteParalelo.includes(t.id) && n.loteParalelo.length > 1
                          ? "bloco-paralelo"
                          : ""
                      }`}
                      onClick={() => aoSelecionar(t.arquivo)}
                      title={`${t.id} — ${t.titulo}${
                        t.dependencias.length > 0
                          ? `\ndepende de: ${t.dependencias.join(", ")}`
                          : "\nsem dependências"
                      }${t.areas.length > 0 ? `\nmexe em: ${t.areas.join(", ")}` : ""}`}
                    >
                      <span className="bloco-id">{t.id}</span>
                      {t.agente !== null && <span className="bloco-agente">{t.agente}</span>}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
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
