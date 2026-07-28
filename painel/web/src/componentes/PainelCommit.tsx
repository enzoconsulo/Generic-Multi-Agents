import { useState } from "react";
import { api, ErroApi } from "../lib/api";
import { useDados } from "../lib/useDados";
import type { AlteracoesPendentes } from "../lib/tipos";
import { MensagemErro } from "./Estados";

/**
 * Commitar pelo painel (T-029), reusável (T-030).
 *
 * Busca a própria lista de pendências: quem usa passa só o repositório. Dois lugares
 * mostram isto — o histórico (aba do projeto/início) e a aba Git — e duplicar o
 * formulário significaria corrigir bug em dois lugares.
 */
export function PainelCommit({
  repo,
  aoCommitar,
}: {
  repo: string;
  /** Chamado depois de um commit bem-sucedido, para quem precisa se atualizar junto. */
  aoCommitar?: () => void;
}) {
  const pendentes = useDados<AlteracoesPendentes>(
    `/api/git/${encodeURIComponent(repo)}/alteracoes`,
  );
  const [aberto, setAberto] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);

  const alteracoes = pendentes.dados?.alteracoes ?? [];

  if (pendentes.carregando && pendentes.dados === null) {
    return <p className="texto-suave">Vendo o que mudou…</p>;
  }

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
      const r = await api<{ curto: string }>(`/api/git/${encodeURIComponent(repo)}/commit`, {
        method: "POST",
        body: JSON.stringify({ mensagem }),
      });
      setFeito(r.curto);
      setMensagem("");
      setAberto(false);
      pendentes.recarregar();
      aoCommitar?.();
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
            só no repositório local. Publicar é um passo separado.
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
