import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import { useDados } from "../../lib/useDados";
import type { ListaRepos, RepoResumo, ResultadoPush } from "../../lib/tipos";
import { Carregando, MensagemErro } from "../../componentes/Estados";
import { PainelCommit } from "../../componentes/PainelCommit";

/**
 * Aba Git (T-030): os repositórios da fábrica num lugar só.
 *
 * A fábrica é uma BIFURCAÇÃO deliberada — a raiz é um repositório (sistema + painel) e
 * cada projeto é um repositório INDEPENDENTE, com endereço próprio na nuvem. Antes disso
 * só dava para operar cada um abrindo um terminal na pasta certa.
 */
export function Git() {
  const { carregando, dados, erro, recarregar } = useDados<ListaRepos>("/api/repos");

  return (
    <div className="pagina">
      <section className="intro">
        <h2 className="intro-titulo">Git</h2>
        <p className="intro-sub">
          Cada repositório da fábrica com seu endereço na nuvem, o que falta commitar e o
          que falta publicar. A <strong>raiz</strong> versiona o sistema e o painel; cada{" "}
          <strong>projeto</strong> é um repositório independente, com endereço próprio — a
          raiz nem versiona a pasta <code>projetos/</code>.
        </p>
      </section>

      {carregando && dados === null && <Carregando texto="Lendo os repositórios…" />}
      {erro !== null && <MensagemErro erro={erro} />}

      {dados !== null && (
        <div className="repos">
          {dados.repos.map((repo) => (
            <CartaoRepo key={repo.id} repo={repo} aoMudar={recarregar} />
          ))}
        </div>
      )}
    </div>
  );
}

function CartaoRepo({ repo, aoMudar }: { repo: RepoResumo; aoMudar: () => void }) {
  return (
    <section className="repo-cartao">
      <div className="repo-cab">
        <div className="repo-identidade">
          <h3 className="repo-nome">
            {repo.ehFabrica ? (
              repo.rotulo
            ) : (
              <Link to={`/projeto/${encodeURIComponent(repo.id)}`}>{repo.rotulo}</Link>
            )}
          </h3>
          <span className={`badge ${repo.ehFabrica ? "badge-acento" : "badge-suave"}`}>
            {repo.ehFabrica ? "raiz" : "projeto"}
          </span>
          {repo.ehRepo && repo.branch !== "" && (
            <span className="badge badge-suave mono">{repo.branch}</span>
          )}
        </div>
        <EstadoPublicacao repo={repo} />
      </div>

      {!repo.ehRepo ? (
        <p className="texto-suave">
          Esta pasta ainda não é um repositório git — não há o que commitar nem publicar.
        </p>
      ) : (
        <>
          <PainelCommit repo={repo.id} aoCommitar={aoMudar} />
          <Remoto repo={repo} aoMudar={aoMudar} />
          <Publicar repo={repo} aoMudar={aoMudar} />
        </>
      )}
    </section>
  );
}

/** O selo que responde "falta publicar alguma coisa?" sem precisar abrir nada. */
function EstadoPublicacao({ repo }: { repo: RepoResumo }) {
  if (!repo.ehRepo) return null;
  if (repo.remoto === null) {
    return <span className="repo-selo selo-neutro">sem endereço</span>;
  }
  if (!repo.temUpstream) {
    return (
      <span className="repo-selo selo-atencao">
        nunca publicado · {repo.totalLocal} commit(s)
      </span>
    );
  }
  if ((repo.aFrente ?? 0) > 0) {
    return (
      <span className="repo-selo selo-atencao">{repo.aFrente} commit(s) não publicado(s)</span>
    );
  }
  if ((repo.atras ?? 0) > 0) {
    return <span className="repo-selo selo-neutro">{repo.atras} commit(s) atrás</span>;
  }
  return <span className="repo-selo selo-ok">publicado — em dia</span>;
}

/* ------------------------------ Link na nuvem ------------------------------ */

function Remoto({ repo, aoMudar }: { repo: RepoResumo; aoMudar: () => void }) {
  const [editando, setEditando] = useState(false);
  const [url, setUrl] = useState(repo.remoto ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await api<{ remoto: string }>(`/api/repos/${encodeURIComponent(repo.id)}/remoto`, {
        method: "PUT",
        body: JSON.stringify({ url }),
      });
      setEditando(false);
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroApi || e instanceof Error ? e.message : "Falha ao gravar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="repo-remoto">
      <div className="repo-remoto-linha">
        <span className="repo-rotulo">Repositório na nuvem</span>
        {repo.remoto === null ? (
          <span className="texto-suave">não configurado</span>
        ) : (
          <code className="repo-url" title={repo.remoto}>
            {repo.remoto}
          </code>
        )}
        <button
          type="button"
          className="botao botao-secundario botao-compacto"
          onClick={() => {
            setUrl(repo.remoto ?? "");
            setErro(null);
            setEditando((e) => !e);
          }}
        >
          {editando ? "Cancelar" : repo.remoto === null ? "Definir…" : "Trocar…"}
        </button>
      </div>

      {editando && (
        <div className="repo-remoto-form">
          <input
            className="commit-entrada mono"
            value={url}
            spellCheck={false}
            placeholder="https://github.com/usuario/repositorio.git"
            onChange={(e) => setUrl(e.target.value)}
          />
          <p className="texto-suave commit-aviso">
            Cole o endereço que o GitHub oferece: <code>https://…</code> ou{" "}
            <code>git@github.com:…</code>. O painel só grava o endereço — não cria o
            repositório na nuvem nem publica nada agora.
          </p>
          {erro !== null && <MensagemErro erro={erro} />}
          <button
            type="button"
            className="botao"
            disabled={salvando || url.trim() === ""}
            onClick={() => void salvar()}
          >
            {salvando ? "Gravando…" : "Salvar endereço"}
          </button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Publicar --------------------------------- */

function Publicar({ repo, aoMudar }: { repo: RepoResumo; aoMudar: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [feito, setFeito] = useState<ResultadoPush | null>(null);

  const nadaAPublicar = repo.temUpstream && (repo.aFrente ?? 0) === 0;
  const semRemoto = repo.remoto === null;

  const publicar = async () => {
    setEnviando(true);
    setErro(null);
    setDetalhe(null);
    try {
      const r = await api<ResultadoPush>(`/api/repos/${encodeURIComponent(repo.id)}/push`, {
        method: "POST",
      });
      setFeito(r);
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroApi || e instanceof Error ? e.message : "Falha ao publicar");
      // A saída crua do git só existe quando o backend a anexou (falha de push).
      setDetalhe(e instanceof ErroApi ? e.detalhe : null);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="repo-publicar">
      <button
        type="button"
        className="botao botao-acao"
        disabled={enviando || semRemoto || nadaAPublicar}
        title={
          semRemoto
            ? "Configure o endereço do repositório antes"
            : nadaAPublicar
              ? "O remoto já está em dia"
              : undefined
        }
        onClick={() => void publicar()}
      >
        {enviando
          ? "Publicando…"
          : repo.temUpstream
            ? `Publicar ${repo.aFrente ?? 0} commit(s)`
            : `Publicar tudo (${repo.totalLocal} commit(s))`}
      </button>

      <span className="texto-suave repo-publicar-nota">
        Faz <code>git push</code> do branch atual. Não faz pull, não faz merge e nunca
        força.
      </span>

      {feito !== null && (
        <p className="repo-ok">
          ✓ Publicado {feito.publicados} commit(s) em <code>{feito.branch}</code>
          {feito.criouUpstream && " (primeira publicação deste branch)"}.
        </p>
      )}

      {erro !== null && (
        <>
          <MensagemErro erro={erro} />
          {detalhe !== null && <pre className="repo-detalhe">{detalhe}</pre>}
        </>
      )}
    </div>
  );
}
