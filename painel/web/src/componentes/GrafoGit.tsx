import { useState } from "react";
import { useDados } from "../lib/useDados";
import { montarGrafo } from "../lib/grafo-git";
import type { CommitGit, HistoricoGit } from "../lib/tipos";
import { Carregando, MensagemErro } from "./Estados";

/**
 * Grafo de commits estilo Git Graph (T-028).
 *
 * O painel já mostrava o PLANO (o que se pretende) e as tarefas (o que está em curso).
 * Faltava o que de fato ACONTECEU no código — e como a fábrica commita uma vez por
 * tarefa, o histórico é a prova do trabalho: dá para ver cada `T-NNN:` virando commit.
 *
 * Desenho em SVG puro, sem biblioteca: o layout vem de `montarGrafo` (função testada) e
 * aqui só se traduz faixa/linha em coordenada.
 */

const ALTURA = 30; // altura de cada linha (casada com o CSS da lista)
const LARGURA_FAIXA = 16;
const RAIO = 4.5;

export function GrafoGit({ repo, titulo }: { repo: string; titulo: string }) {
  const [limite, setLimite] = useState(40);
  const { carregando, dados, erro } = useDados<HistoricoGit>(
    `/api/git/${encodeURIComponent(repo)}?limite=${limite}`,
  );

  return (
    <section className="secao">
      <div className="secao-cab-acao">
        <h3 className="secao-titulo">{titulo}</h3>
        {dados?.branch !== undefined && dados.branch !== "" && (
          <span className="badge badge-suave mono">{dados.branch}</span>
        )}
      </div>

      {carregando && dados === null && <Carregando texto="Lendo o histórico…" />}
      {erro !== null && <MensagemErro erro={erro} />}

      {dados !== null && !dados.ehRepo && (
        <p className="texto-suave">Esta pasta ainda não é um repositório git.</p>
      )}
      {dados?.aviso != null && <p className="texto-suave">{dados.aviso}</p>}

      {dados !== null && dados.commits.length > 0 && (
        <>
          <Desenho commits={dados.commits} />
          {dados.truncado && (
            <button
              type="button"
              className="botao botao-secundario botao-compacto"
              onClick={() => setLimite((l) => l + 60)}
            >
              Carregar mais commits
            </button>
          )}
        </>
      )}
    </section>
  );
}

function Desenho({ commits }: { commits: CommitGit[] }) {
  const grafo = montarGrafo(commits);
  const largura = (grafo.faixas + 1) * LARGURA_FAIXA;
  const altura = commits.length * ALTURA;

  const x = (faixa: number) => faixa * LARGURA_FAIXA + LARGURA_FAIXA / 2;
  const y = (linha: number) => linha * ALTURA + ALTURA / 2;

  return (
    <div className="grafo">
      <svg
        className="grafo-svg"
        width={largura}
        height={altura}
        viewBox={`0 0 ${largura} ${altura}`}
        aria-hidden="true"
      >
        {grafo.arestas.map((a, i) => {
          // Pai fora do trecho carregado: a linha desce até a borda, sinalizando que o
          // histórico continua — cortar seco daria a impressão de fim de história.
          const fim = a.ate ?? commits.length;
          const x1 = x(a.de);
          const x2 = x(a.para);
          const y1 = y(a.linha);
          const y2 = a.ate === null ? altura : y(fim);
          // Curva suave quando muda de faixa; reta quando fica na mesma.
          const d =
            x1 === x2
              ? `M ${x1} ${y1} L ${x2} ${y2}`
              : `M ${x1} ${y1} C ${x1} ${y1 + ALTURA * 0.6}, ${x2} ${y2 - ALTURA * 0.6}, ${x2} ${y2}`;
          return <path key={i} d={d} className={`grafo-linha cor-${a.cor}`} fill="none" />;
        })}
        {grafo.nos.map((n) => (
          <circle
            key={n.commit.hash}
            cx={x(n.faixa)}
            cy={y(n.linha)}
            r={n.commit.pais.length > 1 ? RAIO + 1.5 : RAIO}
            className={`grafo-no cor-${n.cor} ${n.commit.pais.length > 1 ? "grafo-merge" : ""}`}
          />
        ))}
      </svg>

      <ol className="grafo-lista">
        {commits.map((c) => (
          <li key={c.hash} className="grafo-item" title={`${c.hash}\n${c.autor}`}>
            <span className="grafo-assunto">{c.assunto}</span>
            <span className="grafo-meta">
              {c.refs.map((r) => (
                <span key={r} className={`grafo-ref ${r.startsWith("tag:") ? "grafo-tag" : ""}`}>
                  {r.replace(/^tag:\s*/, "")}
                </span>
              ))}
              <code className="grafo-hash">{c.curto}</code>
              <span className="texto-suave">{dataCurta(c.data)}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function dataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
