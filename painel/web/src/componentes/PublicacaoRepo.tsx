import { useState } from "react";
import { api, ErroApi } from "../lib/api";
import type { AchadoSeguranca, RelatorioSeguranca, RepoResumo, ResultadoPush } from "../lib/tipos";
import { MensagemErro } from "./Estados";

/**
 * Publicação de UM repositório (T-030/T-031): endereço na nuvem, conferência de
 * segurança e push. Vale igual para a fábrica e para cada projeto — cada projeto é um
 * repositório PRÓPRIO, e é nele que isso mais importa.
 *
 * Usado na aba Git e na página do projeto; por isso vive em `componentes/`.
 */
export function PublicacaoRepo({
  repo,
  aoMudar,
}: {
  repo: RepoResumo;
  aoMudar: () => void;
}) {
  if (!repo.ehRepo) return <IniciarRepo repo={repo} aoMudar={aoMudar} />;

  return (
    <>
      <Remoto repo={repo} aoMudar={aoMudar} />
      <Publicar repo={repo} aoMudar={aoMudar} />
    </>
  );
}

/* ----------------- Projeto que ainda não é repositório git ----------------- */

/**
 * Sem isto a UI era um beco sem saída: dizia "não é um repositório git" e não oferecia
 * saída nenhuma. Projeto criado à mão (ou clonado) precisa de um começo.
 */
function IniciarRepo({ repo, aoMudar }: { repo: RepoResumo; aoMudar: () => void }) {
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const iniciar = async () => {
    setIndo(true);
    setErro(null);
    try {
      await api(`/api/repos/${encodeURIComponent(repo.id)}/init`, { method: "POST" });
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao iniciar");
    } finally {
      setIndo(false);
    }
  };

  return (
    <div className="repo-publicar">
      <p className="texto-suave" style={{ flexBasis: "100%", margin: 0 }}>
        Esta pasta ainda não é um repositório git — não há histórico, nem como publicar.
      </p>
      <button
        type="button"
        className="botao botao-acao"
        disabled={indo}
        onClick={() => void iniciar()}
      >
        {indo ? "Iniciando…" : "Iniciar repositório git"}
      </button>
      {erro !== null && <MensagemErro erro={erro} />}
    </div>
  );
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

/* ------------------ Conferência de segurança + publicação ------------------ */

function Publicar({ repo, aoMudar }: { repo: RepoResumo; aoMudar: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioSeguranca | null>(null);
  const [barrado, setBarrado] = useState(false);
  const [feito, setFeito] = useState<ResultadoPush | null>(null);

  const nadaAPublicar = repo.temUpstream && (repo.aFrente ?? 0) === 0;
  const semRemoto = repo.remoto === null;

  const conferir = async () => {
    setConferindo(true);
    setErro(null);
    try {
      setRelatorio(
        await api<RelatorioSeguranca>(`/api/repos/${encodeURIComponent(repo.id)}/seguranca`),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na conferência");
    } finally {
      setConferindo(false);
    }
  };

  const publicar = async (ignorarAvisos: boolean) => {
    setEnviando(true);
    setErro(null);
    setDetalhe(null);
    try {
      const r = await api<ResultadoPush>(`/api/repos/${encodeURIComponent(repo.id)}/push`, {
        method: "POST",
        body: JSON.stringify({ ignorarAvisos }),
      });
      setFeito(r);
      setBarrado(false);
      setRelatorio(null);
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao publicar");
      if (e instanceof ErroApi) {
        setDetalhe(e.detalhe);
        // 409 da conferência traz o relatório inteiro: é o que barrou.
        const corpo = e.corpo as { relatorio?: RelatorioSeguranca } | null;
        if (corpo?.relatorio !== undefined) {
          setRelatorio(corpo.relatorio);
          setBarrado(true);
        }
      }
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
        onClick={() => void publicar(false)}
      >
        {enviando
          ? "Publicando…"
          : repo.temUpstream
            ? `Publicar ${repo.aFrente ?? 0} commit(s)`
            : `Publicar tudo (${repo.totalLocal} commit(s))`}
      </button>

      <button
        type="button"
        className="botao botao-secundario botao-compacto"
        disabled={conferindo}
        onClick={() => void conferir()}
      >
        {conferindo ? "Conferindo…" : "Conferir segurança"}
      </button>

      <span className="texto-suave repo-publicar-nota">
        Toda publicação é conferida antes. Sem pull, sem merge, nunca força.
      </span>

      {feito !== null && (
        <p className="repo-ok">
          ✓ Publicado {feito.publicados} commit(s) em <code>{feito.branch}</code>
          {feito.criouUpstream && " (primeira publicação deste branch)"}.
        </p>
      )}

      {erro !== null && !barrado && (
        <>
          <MensagemErro erro={erro} />
          {detalhe !== null && <pre className="repo-detalhe">{detalhe}</pre>}
        </>
      )}

      {relatorio !== null && (
        <Conferencia
          repo={repo}
          relatorio={relatorio}
          barrado={barrado}
          enviando={enviando}
          aoIgnorar={() => void publicar(true)}
          aoMudar={() => {
            aoMudar();
            void conferir();
          }}
        />
      )}
    </div>
  );
}

function Conferencia({
  repo,
  relatorio,
  barrado,
  enviando,
  aoIgnorar,
  aoMudar,
}: {
  repo: RepoResumo;
  relatorio: RelatorioSeguranca;
  barrado: boolean;
  enviando: boolean;
  aoIgnorar: () => void;
  aoMudar: () => void;
}) {
  const altos = relatorio.achados.filter((a) => a.nivel === "alto");

  return (
    <div className={`conferencia ${barrado ? "conferencia-barrada" : ""}`}>
      <div className="conferencia-cab">
        <strong>
          {barrado
            ? "Publicação barrada pela conferência"
            : relatorio.achados.length === 0
              ? "Conferência limpa"
              : "Conferência com avisos"}
        </strong>
        <span className="texto-suave">
          {relatorio.arquivosVarridos} arquivo(s) varrido(s)
          {relatorio.truncado && " (parcial — repositório muito grande)"}
        </span>
      </div>

      {relatorio.achados.length === 0 && (
        <p className="repo-ok">
          ✓ Nada sensível encontrado no que está versionado nem no que entraria no próximo
          commit.
        </p>
      )}

      {relatorio.achados.length > 0 && (
        <ul className="conferencia-lista">
          {relatorio.achados.map((a, i) => (
            <ItemAchado key={`${a.caminho}-${i}`} achado={a} />
          ))}
        </ul>
      )}

      {!relatorio.temGitignore && (
        <CriarGitignore repo={repo} aoCriar={aoMudar} />
      )}

      {barrado && (
        <div className="conferencia-decisao">
          <p className="texto-suave">
            {altos.length} item(ns) grave(s). <strong>Segredo publicado não se apaga:</strong>{" "}
            fica no histórico, em forks e em caches mesmo depois de removido. Se for falso
            positivo, publique assim mesmo — é o seu repositório.
          </p>
          <button
            type="button"
            className="botao botao-perigo"
            disabled={enviando}
            onClick={aoIgnorar}
          >
            {enviando ? "Publicando…" : "Entendi o risco — publicar assim mesmo"}
          </button>
        </div>
      )}
    </div>
  );
}

function ItemAchado({ achado }: { achado: AchadoSeguranca }) {
  return (
    <li className={`conferencia-item nivel-${achado.nivel}`}>
      <span className="conferencia-nivel">{achado.nivel === "alto" ? "grave" : "aviso"}</span>
      <div className="conferencia-corpo">
        <code className="conferencia-caminho">
          {achado.caminho}
          {achado.linha !== null && `:${achado.linha}`}
        </code>
        <span className="texto-suave"> — {achado.detalhe}</span>
        {achado.tipo !== "sem-gitignore" && (
          <span className={`conferencia-onde ${achado.versionado ? "onde-grave" : ""}`}>
            {achado.versionado
              ? "já versionado (está no histórico)"
              : "entraria no próximo commit"}
          </span>
        )}
      </div>
    </li>
  );
}

function CriarGitignore({ repo, aoCriar }: { repo: RepoResumo; aoCriar: () => void }) {
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const criar = async () => {
    setIndo(true);
    setErro(null);
    try {
      await api(`/api/repos/${encodeURIComponent(repo.id)}/gitignore`, { method: "POST" });
      aoCriar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao criar");
    } finally {
      setIndo(false);
    }
  };

  return (
    <div className="conferencia-acao">
      <button
        type="button"
        className="botao botao-secundario botao-compacto"
        disabled={indo}
        onClick={() => void criar()}
      >
        {indo ? "Criando…" : "Criar .gitignore para este projeto"}
      </button>
      <span className="texto-suave">
        Gerado a partir do ecossistema detectado, já ignorando <code>.env</code>, chaves e
        caches.
      </span>
      {erro !== null && <MensagemErro erro={erro} />}
    </div>
  );
}
