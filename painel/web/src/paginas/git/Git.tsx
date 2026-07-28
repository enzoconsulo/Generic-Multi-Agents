import { Link } from "react-router-dom";
import { useDados } from "../../lib/useDados";
import type { ListaRepos, RepoResumo } from "../../lib/tipos";
import { Carregando, MensagemErro } from "../../componentes/Estados";
import { PainelCommit } from "../../componentes/PainelCommit";
import { PublicacaoRepo } from "../../componentes/PublicacaoRepo";

/**
 * Aba Git (T-030/T-031): os repositórios da fábrica num lugar só.
 *
 * A fábrica é uma BIFURCAÇÃO deliberada — a raiz é um repositório (sistema + painel) e
 * cada projeto é um repositório INDEPENDENTE, com endereço próprio na nuvem. O mesmo
 * ciclo (commitar → conferir → publicar) vale para todos, e é no PROJETO que ele mais
 * importa: é lá que mora código de verdade, com chave de API por perto.
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
          raiz nem versiona a pasta <code>projetos/</code>. Toda publicação passa por uma
          conferência de segurança antes de sair.
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

      {repo.ehRepo && <PainelCommit repo={repo.id} aoCommitar={aoMudar} />}
      <PublicacaoRepo repo={repo} aoMudar={aoMudar} />
    </section>
  );
}

/** O selo que responde "falta publicar alguma coisa?" sem precisar abrir nada. */
export function EstadoPublicacao({ repo }: { repo: RepoResumo }) {
  if (!repo.ehRepo) return <span className="repo-selo selo-neutro">sem repositório</span>;
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
