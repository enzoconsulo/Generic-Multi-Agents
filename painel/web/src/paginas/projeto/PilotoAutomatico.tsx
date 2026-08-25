import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import type { EstadoPiloto, EstrategiaModelo, Job, RespostaPiloto } from "../../lib/tipos";
import {
  avisoDeCusto,
  fracaoDoTeto,
  situacaoDoPiloto,
  validarConfig,
  type ConfigPilotoForm,
} from "../../lib/piloto";
import { textoEstrategia } from "../../lib/formato";

/**
 * PILOTO AUTOMÁTICO — o toggle que encadeia rodadas de Trabalhar sozinho.
 *
 * O componente é moldura: quem decide o que mostrar é `lib/piloto.ts`. Duas escolhas de
 * interface que não são cosméticas:
 *
 * 1. **Os dois freios são obrigatórios no formulário.** Não há "rodar até acabar" sem teto:
 *    é o único fluxo do painel que dispara sem clique, e o custo de esquecer um limite não
 *    é uma tela feia, é a fatura.
 * 2. **O estado é do SERVIDOR, não desta aba.** Fechar o navegador não para nem duplica
 *    rodada; a tela só reflete `dados/piloto.json`. Por isso ela recarrega quando um job
 *    deste projeto muda de estado, em vez de manter contagem própria.
 */
export function PilotoAutomatico({
  projeto,
  estrategias,
  estrategiaPadrao,
  estimativaPorRodadaUsd,
  jobs,
}: {
  projeto: string;
  estrategias: EstrategiaModelo[];
  estrategiaPadrao: string;
  /** Custo medido de uma rodada deste projeto; `null` quando não há histórico. */
  estimativaPorRodadaUsd: number | null;
  /** Só para saber QUANDO recarregar: o piloto muda de estado quando um job assenta. */
  jobs: Job[];
}) {
  const [piloto, setPiloto] = useState<EstadoPiloto | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [estrategiaId, setEstrategiaId] = useState(estrategiaPadrao);
  const [tetoTotal, setTetoTotal] = useState("15");
  const [maxRodadas, setMaxRodadas] = useState("6");

  // Assinatura dos estados dos jobs deste projeto: muda exatamente quando uma rodada
  // assenta, que é quando o piloto decide. Evita polling e evita uma segunda conexão SSE.
  const marcaJobs = jobs
    .filter((j) => j.escopo === `projeto:${projeto}`)
    .map((j) => `${j.id}:${j.estado}`)
    .join("|");

  useEffect(() => {
    let vivo = true;
    api<RespostaPiloto>("/api/piloto")
      .then((r) => {
        if (vivo) setPiloto(r.piloto);
      })
      .catch(() => {
        // Falha de leitura não pode esconder o resto da página: o cartão fica no estado
        // "desligado", e ligar (que é o que importa) devolveria o erro de verdade.
      });
    return () => {
      vivo = false;
    };
  }, [marcaJobs]);

  const situacao = situacaoDoPiloto(piloto);
  const config: ConfigPilotoForm = {
    tetoTotalUsd: Number(tetoTotal.replace(",", ".")),
    maxRodadas: Number(maxRodadas),
    tetoUsdPorRodada: null,
  };
  const invalido = validarConfig(config);

  async function ligar(evento: React.FormEvent) {
    evento.preventDefault();
    if (invalido !== null) {
      setErro(invalido);
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const r = await api<RespostaPiloto>("/api/piloto", {
        method: "POST",
        body: JSON.stringify({
          projeto,
          estrategia: estrategiaId,
          tetoTotalUsd: config.tetoTotalUsd,
          maxRodadas: config.maxRodadas,
        }),
      });
      setPiloto(r.piloto);
      setAbrindo(false);
    } catch (e) {
      setErro(e instanceof ErroApi || e instanceof Error ? e.message : "Falha ao ligar o piloto");
    } finally {
      setEnviando(false);
    }
  }

  async function desligar() {
    setEnviando(true);
    setErro(null);
    try {
      const r = await api<RespostaPiloto>("/api/piloto", { method: "DELETE" });
      setPiloto(r.piloto);
    } catch (e) {
      setErro(e instanceof ErroApi || e instanceof Error ? e.message : "Falha ao desligar");
    } finally {
      setEnviando(false);
    }
  }

  // Piloto ligado em OUTRO projeto: o estado é único por instalação, e escondê-lo faria a
  // tela deste projeto mentir sobre o que a fábrica está fazendo agora.
  const deOutroProjeto = piloto !== null && piloto.ligado && piloto.projeto !== projeto;

  return (
    <section className="secao">
      <h3 className="secao-titulo">Piloto automático</h3>

      <div className={`piloto piloto-${situacao.tom}`}>
        <div className="piloto-texto">
          <strong className="piloto-titulo">{situacao.titulo}</strong>
          <p className="piloto-detalhe">{situacao.detalhe}</p>
          {piloto !== null && piloto.limites.tetoTotalUsd > 0 && (
            <div className="piloto-barra" title="Gasto acumulado do piloto">
              <span style={{ width: `${Math.round(fracaoDoTeto(piloto) * 100)}%` }} />
            </div>
          )}
        </div>
        <div className="piloto-acoes">
          {piloto !== null && piloto.ultimoJobId !== null && (
            <Link
              className="botao botao-secundario botao-compacto"
              to={`/jobs?job=${encodeURIComponent(piloto.ultimoJobId)}`}
            >
              Ver rodada
            </Link>
          )}
          {piloto !== null && piloto.ligado ? (
            <button
              type="button"
              className="botao botao-perigo botao-compacto"
              onClick={desligar}
              disabled={enviando}
            >
              {enviando ? "Desligando…" : "Desligar"}
            </button>
          ) : (
            !abrindo && (
              <button
                type="button"
                className="botao botao-acao botao-compacto"
                onClick={() => setAbrindo(true)}
                disabled={deOutroProjeto}
                title={
                  deOutroProjeto
                    ? `O piloto está ligado em ${piloto?.projeto}. Desligue-o lá antes.`
                    : undefined
                }
              >
                Ligar piloto
              </button>
            )
          )}
        </div>
      </div>

      {abrindo && (
        <form className="form-acao" onSubmit={ligar}>
          <p className="aviso aviso-alerta aviso-compacto">
            ⚠ Ligar JÁ dispara a primeira rodada, e as seguintes nascem sozinhas quando cada
            uma termina. O piloto para quando acabar tarefa pronta, a cota bater, duas rodadas
            seguidas não concluírem nada, ou um dos dois tetos abaixo for atingido.
          </p>

          <label className="campo-form">
            <span>Modelo de cada rodada</span>
            <select value={estrategiaId} onChange={(e) => setEstrategiaId(e.target.value)}>
              {estrategias.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.rotulo}
                  {e.id === estrategiaPadrao ? " (padrão)" : ""}
                </option>
              ))}
            </select>
            {estrategias.find((e) => e.id === estrategiaId) && (
              <span className="campo-ajuda">
                {textoEstrategia(estrategias.find((e) => e.id === estrategiaId)!)}
              </span>
            )}
          </label>

          <div className="piloto-freios">
            <label className="campo-form">
              <span>Teto de gasto acumulado (US$)</span>
              <input
                type="number"
                min="0.5"
                max="200"
                step="0.5"
                value={tetoTotal}
                onChange={(e) => setTetoTotal(e.target.value)}
                required
              />
            </label>
            <label className="campo-form">
              <span>Máximo de rodadas</span>
              <input
                type="number"
                min="1"
                max="50"
                step="1"
                value={maxRodadas}
                onChange={(e) => setMaxRodadas(e.target.value)}
                required
              />
            </label>
          </div>

          <p className="campo-ajuda">{avisoDeCusto(config, estimativaPorRodadaUsd)}</p>
          {erro !== null && <div className="aviso aviso-erro aviso-compacto">{erro}</div>}

          <div className="form-acoes">
            <button type="submit" className="botao botao-acao" disabled={enviando}>
              {enviando ? "Ligando…" : "Ligar e começar agora"}
            </button>
            <button
              type="button"
              className="botao botao-secundario"
              onClick={() => setAbrindo(false)}
              disabled={enviando}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
