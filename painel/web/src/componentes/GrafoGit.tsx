import { useEffect, useRef, useState } from "react";
import { api, ErroApi } from "../lib/api";
import { useDados } from "../lib/useDados";
import { montarGrafo } from "../lib/grafo-git";
import type {
  AlteracoesPendentes,
  CommitGit,
  DetalheCommit,
  HistoricoGit,
} from "../lib/tipos";
import { Carregando, MensagemErro } from "./Estados";

/**
 * Grafo de commits estilo Git Graph (T-028) dentro de uma caixa que abre ao clicar
 * (T-029).
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
  const [aberto, setAberto] = useState(false);

  return (
    <section className="secao caixa">
      <button
        type="button"
        className="caixa-cab"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
      >
        <span className="caixa-seta" aria-hidden="true">
          {aberto ? "▾" : "▸"}
        </span>
        <span className="caixa-titulo">{titulo}</span>
        <span className="caixa-dica">
          {aberto ? "clique para fechar" : "commits e alterações — clique para abrir"}
        </span>
      </button>

      {/* Só monta (e só busca) quando aberto: fechado não gasta requisição nem espaço. */}
      {aberto && <ConteudoGit repo={repo} />}
    </section>
  );
}

function ConteudoGit({ repo }: { repo: string }) {
  const [limite, setLimite] = useState(40);
  const historico = useDados<HistoricoGit>(
    `/api/git/${encodeURIComponent(repo)}?limite=${limite}`,
  );
  const pendentes = useDados<AlteracoesPendentes>(
    `/api/git/${encodeURIComponent(repo)}/alteracoes`,
  );
  const { carregando, dados, erro } = historico;

  const aposCommit = () => {
    historico.recarregar();
    pendentes.recarregar();
  };

  return (
    <div className="caixa-corpo">
      {dados?.branch !== undefined && dados.branch !== "" && (
        <p className="caixa-sub">
          Branch atual: <span className="badge badge-suave mono">{dados.branch}</span>
        </p>
      )}

      {dados?.ehRepo === true && (
        <PainelCommit
          repo={repo}
          alteracoes={pendentes.dados?.alteracoes ?? []}
          carregando={pendentes.carregando && pendentes.dados === null}
          aoCommitar={aposCommit}
        />
      )}

      {carregando && dados === null && <Carregando texto="Lendo o histórico…" />}
      {erro !== null && <MensagemErro erro={erro} />}

      {dados !== null && !dados.ehRepo && (
        <p className="texto-suave">Esta pasta ainda não é um repositório git.</p>
      )}
      {dados?.aviso != null && <p className="texto-suave">{dados.aviso}</p>}

      {dados !== null && dados.commits.length > 0 && (
        <>
          <Desenho commits={dados.commits} repo={repo} />
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
    </div>
  );
}

/* ----------------------------- Commitar pelo app ----------------------------- */

function PainelCommit({
  repo,
  alteracoes,
  carregando,
  aoCommitar,
}: {
  repo: string;
  alteracoes: AlteracoesPendentes["alteracoes"];
  carregando: boolean;
  aoCommitar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);

  if (carregando) return <p className="texto-suave">Vendo o que mudou…</p>;

  if (alteracoes.length === 0) {
    return (
      <p className="commit-limpo">
        <span className="commit-ok" aria-hidden="true">
          ✓
        </span>{" "}
        Tudo commitado — nenhuma alteração pendente.
        {feito !== null && (
          <>
            {" "}
            Último commit pelo painel: <code className="grafo-hash">{feito}</code>.
          </>
        )}
      </p>
    );
  }

  const enviar = async () => {
    setEnviando(true);
    setErro(null);
    try {
      const r = await api<{ curto: string }>(
        `/api/git/${encodeURIComponent(repo)}/commit`,
        { method: "POST", body: JSON.stringify({ mensagem }) },
      );
      setFeito(r.curto);
      setMensagem("");
      setAberto(false);
      aoCommitar();
    } catch (e) {
      setErro(e instanceof ErroApi || e instanceof Error ? e.message : "Falha ao commitar");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="commit-caixa">
      <div className="commit-cab">
        <span className="commit-contagem">
          {alteracoes.length} {alteracoes.length === 1 ? "alteração" : "alterações"} sem
          commit
        </span>
        <button
          type="button"
          className="botao botao-compacto"
          onClick={() => setAberto((a) => !a)}
        >
          {aberto ? "Cancelar" : "Commitar…"}
        </button>
      </div>

      {aberto && (
        <div className="commit-form">
          <ul className="commit-arquivos">
            {alteracoes.map((a) => (
              <li key={a.caminho} title={`código do git: "${a.codigo}"`}>
                <span className={`commit-situacao sit-${slugSituacao(a.situacao)}`}>
                  {a.situacao}
                </span>
                <code>{a.caminho}</code>
              </li>
            ))}
          </ul>

          <label className="commit-campo">
            <span className="commit-rotulo">Mensagem do commit</span>
            <textarea
              className="commit-entrada"
              rows={2}
              value={mensagem}
              placeholder="ex.: ajusta o layout da página de jobs"
              onChange={(e) => setMensagem(e.target.value)}
            />
          </label>

          <p className="texto-suave commit-aviso">
            Commita <strong>tudo</strong> que está listado acima (<code>git add -A</code>),
            só no repositório local. O painel <strong>não faz push</strong>.
          </p>

          {erro !== null && <MensagemErro erro={erro} />}

          <button
            type="button"
            className="botao"
            disabled={enviando || mensagem.trim() === ""}
            onClick={() => void enviar()}
          >
            {enviando ? "Commitando…" : `Commitar ${alteracoes.length} arquivo(s)`}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Situação → sufixo de classe conhecido. Códigos exóticos do porcelain (`UU`, `!!`)
 * caem em "outro" em vez de virar nome de classe inventado.
 */
function slugSituacao(situacao: string): string {
  const primeira = situacao.split(" ")[0] ?? "";
  return ["novo", "apagado", "renomeado", "adicionado", "modificado"].includes(primeira)
    ? primeira
    : "outro";
}

/* -------------------------------- O desenho -------------------------------- */

function Desenho({ commits, repo }: { commits: CommitGit[]; repo: string }) {
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const grafo = montarGrafo(commits);
  const largura = (grafo.faixas + 1) * LARGURA_FAIXA;
  const altura = commits.length * ALTURA;

  const x = (faixa: number) => faixa * LARGURA_FAIXA + LARGURA_FAIXA / 2;
  const y = (linha: number) => linha * ALTURA + ALTURA / 2;

  return (
    <>
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

        {/*
         * A lista NÃO expande no lugar: cada item tem exatamente ALTURA px, e é isso que
         * mantém cada nó do SVG na altura da sua linha. O resumão abre FORA da lista,
         * logo abaixo — crescer um item aqui desalinharia o desenho inteiro.
         */}
        <ol className="grafo-lista">
          {commits.map((c) => (
            <li key={c.hash}>
              <button
                type="button"
                className={`grafo-item ${selecionado === c.hash ? "grafo-item-sel" : ""}`}
                title={`${c.hash}\n${c.autor}`}
                onClick={() => setSelecionado((s) => (s === c.hash ? null : c.hash))}
              >
                <span className="grafo-assunto">{c.assunto}</span>
                <span className="grafo-meta">
                  {c.refs.map((r) => (
                    <span
                      key={r}
                      className={`grafo-ref ${r.startsWith("tag:") ? "grafo-tag" : ""}`}
                    >
                      {r.replace(/^tag:\s*/, "")}
                    </span>
                  ))}
                  <code className="grafo-hash">{c.curto}</code>
                  <span className="texto-suave">{dataCurta(c.data)}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {selecionado !== null && (
        <Resumao
          repo={repo}
          commit={commits.find((c) => c.hash === selecionado) ?? null}
          aoFechar={() => setSelecionado(null)}
        />
      )}
    </>
  );
}

/* --------------------------- Resumão de um commit --------------------------- */

/**
 * O "resumão": o que aquele commit mexeu, em números. Sai inteiro do `git show
 * --numstat` — instantâneo e sem custo nenhum de assinatura. A descrição do commit já é
 * a mensagem; o que faltava era a FORMA da mudança (quantos arquivos, quanto cresceu,
 * onde encostou).
 */
function Resumao({
  repo,
  commit,
  aoFechar,
}: {
  repo: string;
  commit: CommitGit | null;
  aoFechar: () => void;
}) {
  const hash = commit?.hash ?? "";
  const { carregando, dados, erro } = useDados<DetalheCommit>(
    `/api/git/${encodeURIComponent(repo)}/commit/${hash}`,
  );
  const alvo = useRef<HTMLDivElement>(null);

  // O resumão nasce ABAIXO da lista inteira (crescer um item desalinharia o SVG). Com 40
  // commits carregados, quem clica no primeiro abre um painel a ~1000px daqui — clicava e
  // "não acontecia nada". Trazer o painel para a tela é o que fecha esse laço.
  useEffect(() => {
    alvo.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [hash]);

  if (commit === null) return null;

  return (
    <div className="resumao" ref={alvo}>
      <div className="resumao-cab">
        <div>
          <strong className="resumao-assunto">{commit.assunto}</strong>
          <span className="resumao-autor texto-suave">
            {commit.autor} · {dataCompleta(commit.data)} ·{" "}
            <code className="grafo-hash">{commit.curto}</code>
          </span>
        </div>
        <button
          type="button"
          className="botao botao-secundario botao-compacto"
          onClick={aoFechar}
        >
          Fechar
        </button>
      </div>

      {carregando && dados === null && <Carregando texto="Lendo o commit…" />}
      {erro !== null && <MensagemErro erro={erro} />}

      {dados !== null && (
        <>
          <p className="resumao-numeros">
            <span className="resumao-chip">
              {dados.arquivos.length}{" "}
              {dados.arquivos.length === 1 ? "arquivo" : "arquivos"}
            </span>
            <span className="resumao-mais">+{dados.adicoes}</span>
            <span className="resumao-menos">−{dados.remocoes}</span>
            <Barra adicoes={dados.adicoes} remocoes={dados.remocoes} />
          </p>

          {dados.corpo !== "" && <pre className="resumao-corpo">{dados.corpo}</pre>}

          <ul className="resumao-arquivos">
            {dados.arquivos.map((a) => (
              <li key={a.caminho}>
                <code className="resumao-caminho">{a.caminho}</code>
                {a.binario ? (
                  <span className="texto-suave">binário</span>
                ) : (
                  <span className="resumao-linhas">
                    <span className="resumao-mais">+{a.adicoes}</span>{" "}
                    <span className="resumao-menos">−{a.remocoes}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>

          {dados.arquivos.length === 0 && (
            <p className="texto-suave">
              Commit sem alteração de arquivo (merge ou commit vazio).
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Barra proporcional verde/vermelha — dá a proporção da mudança num relance. */
function Barra({ adicoes, remocoes }: { adicoes: number; remocoes: number }) {
  const total = adicoes + remocoes;
  if (total === 0) return null;
  const pct = Math.round((adicoes / total) * 100);
  return (
    <span className="resumao-barra" aria-hidden="true">
      <span className="resumao-barra-mais" style={{ width: `${pct}%` }} />
      <span className="resumao-barra-menos" style={{ width: `${100 - pct}%` }} />
    </span>
  );
}

function dataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function dataCompleta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
