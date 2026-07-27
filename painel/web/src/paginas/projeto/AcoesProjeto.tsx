import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import { useDados } from "../../lib/useDados";
import type { AcaoFabrica, EstrategiaModelo, Job, RespostaAcao, RespostaFabrica } from "../../lib/tipos";
import { ESTADOS_JOB_ATIVOS, estimarCusto, rotuloEstadoJob, rotuloPeso } from "../../lib/formato";

/**
 * Ações por projeto (T-016): Trabalhar e Status, disparados COM o nome do projeto já
 * fixado (mesmo padrão de card-expansível da T-015). Enquanto há um job ativo com o
 * lock `projeto:<nome>` deste projeto, os botões ficam desabilitados — o mesmo lock que
 * a fila (T-007) já usa para nunca rodar dois fluxos do mesmo projeto ao mesmo tempo.
 */

/** Job ativo (não-terminal) com lock neste projeto; null se nenhum. Prioriza o que já
 * está executando/aguardando input sobre os que só esperam na fila atrás dele. */
export function jobAtivoDoProjeto(jobs: Job[], projeto: string): Job | null {
  const doProjeto = jobs.filter(
    (j) => j.escopo === `projeto:${projeto}` && ESTADOS_JOB_ATIVOS.has(j.estado),
  );
  if (doProjeto.length === 0) return null;
  return doProjeto.find((j) => j.estado !== "na-fila") ?? doProjeto[0] ?? null;
}

export function AcoesProjeto({ projeto, jobAtivo }: { projeto: string; jobAtivo: Job | null }) {
  const fabrica = useDados<RespostaFabrica>("/api/fabrica");
  if (fabrica.dados === null) return null;

  const trabalhar = fabrica.dados.acoes.find((a) => a.id === "trabalhar");
  const status = fabrica.dados.acoes.find((a) => a.id === "status");
  const ehPainelFabrica = projeto === "painel-fabrica";

  return (
    <section className="secao">
      <h3 className="secao-titulo">Ações</h3>
      {jobAtivo !== null && (
        <p className="aviso aviso-info aviso-compacto">
          Projeto ocupado por <strong>{jobAtivo.titulo}</strong> (
          {rotuloEstadoJob(jobAtivo.estado)}) —{" "}
          <Link to={`/jobs?job=${encodeURIComponent(jobAtivo.id)}`}>acompanhar</Link>.
        </p>
      )}
      <div className="grade-cards">
        {trabalhar && (
          <BotaoAcaoProjeto
            acao={trabalhar}
            rotulo="Trabalhar neste projeto"
            projeto={projeto}
            estrategias={fabrica.dados.estrategias}
            estrategiaPadrao={fabrica.dados.estrategiaPadrao}
            bloqueado={jobAtivo !== null}
            avisoEspecial={
              ehPainelFabrica
                ? "Este é o painel da própria fábrica: o fluxo pode alterar o código que está " +
                  "rodando agora. Prossiga só se souber o que está fazendo."
                : null
            }
          />
        )}
        {status && (
          <BotaoAcaoProjeto
            acao={status}
            rotulo="Ver status agora"
            projeto={projeto}
            estrategias={fabrica.dados.estrategias}
            estrategiaPadrao={fabrica.dados.estrategiaPadrao}
            bloqueado={jobAtivo !== null}
            avisoEspecial={null}
          />
        )}
      </div>
    </section>
  );
}

function BotaoAcaoProjeto({
  acao,
  rotulo,
  projeto,
  estrategias,
  estrategiaPadrao,
  bloqueado,
  avisoEspecial,
}: {
  acao: AcaoFabrica;
  rotulo: string;
  projeto: string;
  estrategias: EstrategiaModelo[];
  estrategiaPadrao: string;
  bloqueado: boolean;
  avisoEspecial: string | null;
}) {
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [estrategiaId, setEstrategiaId] = useState(estrategiaPadrao);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const estrategia = estrategias.find((e) => e.id === estrategiaId) ?? estrategias[0];
  const estimativa = estrategia ? estimarCusto(acao.peso, estrategia.custo) : null;

  async function disparar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const { job } = await api<RespostaAcao>(`/api/acoes/${acao.id}`, {
        method: "POST",
        body: JSON.stringify({ argumentos: projeto, estrategia: estrategiaId }),
      });
      navegar(`/jobs?job=${encodeURIComponent(job.id)}`);
    } catch (e) {
      setErro(e instanceof ErroApi || e instanceof Error ? e.message : "Falha ao disparar");
      setEnviando(false);
    }
  }

  return (
    <article className={`card card-acao ${aberto ? "aberto" : ""}`}>
      <div className="card-cab">
        <h4 className="card-titulo mono">{acao.nome}</h4>
        <span className={`badge peso-${acao.peso}`} title="Peso típico do fluxo">
          {rotuloPeso(acao.peso)}
        </span>
      </div>
      <p className="card-desc">{acao.descricao}</p>

      {!aberto ? (
        <button
          type="button"
          className="botao botao-acao"
          onClick={() => setAberto(true)}
          disabled={bloqueado}
          title={bloqueado ? "Projeto ocupado por outro job — aguarde terminar." : undefined}
        >
          {rotulo}
        </button>
      ) : (
        <form className="form-acao" onSubmit={disparar}>
          <label className="campo-form">
            <span>Modelo</span>
            <select value={estrategiaId} onChange={(e) => setEstrategiaId(e.target.value)}>
              {estrategias.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.rotulo}
                  {e.id === estrategiaPadrao ? " (padrão)" : ""}
                </option>
              ))}
            </select>
            {estrategia && <span className="campo-ajuda">{estrategia.descricao}</span>}
          </label>

          {estimativa && (
            <div className="estimativa">
              <span className="estimativa-rot">Custo estimado</span>
              <span className={`badge custo-${estimativa.tier}`}>{estimativa.rotulo}</span>
            </div>
          )}

          {avisoEspecial !== null && (
            <p className="aviso aviso-alerta aviso-compacto">⚠ {avisoEspecial}</p>
          )}
          {erro !== null && <div className="aviso aviso-erro aviso-compacto">{erro}</div>}

          <div className="form-acoes">
            <button type="submit" className="botao botao-acao" disabled={enviando}>
              {enviando ? "Disparando…" : "Confirmar"}
            </button>
            <button
              type="button"
              className="botao botao-secundario"
              onClick={() => setAberto(false)}
              disabled={enviando}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
