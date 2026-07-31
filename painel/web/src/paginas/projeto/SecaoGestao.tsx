import { Link } from "react-router-dom";
import type { Job, TarefaCompleta } from "../../lib/tipos";
import {
  jobsDoProjeto,
  mapaDependencias,
  tarefasBloqueadas,
  tarefasPromoviveis,
  type SituacaoDependencia,
} from "../../lib/gestao";
import { decorrido, rotuloEstadoJob } from "../../lib/formato";
import { custoDoJob, explicarCusto, formatarCusto, somarCusto } from "../../lib/custo";
import { ChipStatus } from "../../componentes/Indicadores";

/**
 * Gestão do projeto (T-036): o que está travado, o que destrava o quê, e o que já rodou
 * AQUI.
 *
 * Os dados sempre vieram na API — `dependencias` em cada tarefa, e os jobs no mesmo canal
 * SSE da aba Jobs. O que faltava era cruzar: o kanban dizia "bloqueada" sem dizer por quê,
 * e o histórico só existia global, com todos os projetos misturados.
 *
 * NÃO abre canal SSE próprio: recebe os jobs por prop. `Projeto.tsx` chama
 * `useJobsAoVivo()` uma vez e distribui — uma conexão por página é decisão do projeto.
 */
export function SecaoGestao({
  projeto,
  tarefas,
  jobs,
  aoSelecionar,
}: {
  projeto: string;
  tarefas: TarefaCompleta[];
  jobs: Job[];
  /** Abre a tarefa no quadro, para o achado virar ação em vez de só informação. */
  aoSelecionar: (arquivo: string) => void;
}) {
  const mapa = mapaDependencias(tarefas);
  const bloqueadas = tarefasBloqueadas(tarefas);
  const promoviveis = tarefasPromoviveis(tarefas, mapa);
  const historico = jobsDoProjeto(jobs, projeto);

  // Dependência apontando para tarefa que não existe: erro de escrita no frontmatter, que
  // nunca se resolve sozinho. Fica separado dos bloqueios normais de propósito.
  const quebradas = tarefas
    .map((t) => ({ tarefa: t, inexistentes: mapa.get(t.id)?.inexistentes ?? [] }))
    .filter((x) => x.inexistentes.length > 0);

  // T-049: passa por `somarCusto`, que inclui os jobs CORTADOS (via estimativa). Antes,
  // "só o que tem custo conhecido" queria dizer "só quem terminou" — e quem não termina é
  // quem estourou a cota, ou seja, o mais caro do projeto ficava fora do total.
  const custoTotal = somarCusto(historico);

  const nadaAMostrar =
    bloqueadas.length === 0 &&
    promoviveis.length === 0 &&
    quebradas.length === 0 &&
    historico.length === 0;

  return (
    <section className="secao">
      <h3 className="secao-titulo">Gestão</h3>
      <p className="texto-suave secao-desc">
        O que trava, o que destrava e o que já rodou neste projeto.
      </p>

      {nadaAMostrar && (
        <p className="vazio">
          Nada travado e nenhum fluxo rodado aqui ainda. Quando houver, aparece nesta seção.
        </p>
      )}

      {quebradas.length > 0 && (
        <div className="aviso aviso-erro aviso-compacto">
          <strong>Dependência apontando para tarefa inexistente</strong> — isto não se resolve
          sozinho, é erro no frontmatter:
          <ul>
            {quebradas.map(({ tarefa, inexistentes }) => (
              <li key={tarefa.id}>
                <code>{tarefa.id}</code> espera por {inexistentes.map((d) => <code key={d}>{d}</code>)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {bloqueadas.length > 0 && (
        <div className="bloco-gestao">
          <h4 className="bloco-gestao-titulo">Bloqueadas ({bloqueadas.length})</h4>
          <p className="texto-suave bloco-gestao-ajuda">
            Esgotaram os ciclos ou dependem de uma decisão sua. É aqui que a fábrica parou de
            avançar sozinha.
          </p>
          <ul className="lista-gestao">
            {bloqueadas.map((t) => (
              <LinhaTarefa
                key={t.id}
                tarefa={t}
                situacao={mapa.get(t.id)}
                aoSelecionar={aoSelecionar}
              />
            ))}
          </ul>
        </div>
      )}

      {promoviveis.length > 0 && (
        <div className="bloco-gestao">
          <h4 className="bloco-gestao-titulo">Prontas para promover ({promoviveis.length})</h4>
          <p className="texto-suave bloco-gestao-ajuda">
            Estão em <code>backlog</code> com todas as dependências concluídas — só falta a
            promoção para <code>pronta</code>, que é ato do orquestrador.
          </p>
          <ul className="lista-gestao">
            {promoviveis.map((t) => (
              <LinhaTarefa
                key={t.id}
                tarefa={t}
                situacao={mapa.get(t.id)}
                aoSelecionar={aoSelecionar}
              />
            ))}
          </ul>
        </div>
      )}

      {historico.length > 0 && (
        <div className="bloco-gestao">
          <h4 className="bloco-gestao-titulo">
            Histórico deste projeto ({historico.length})
            {custoTotal !== null && custoTotal.jobs > 0 && (
              <span className="texto-suave" title={explicarCusto(custoTotal)}>
                {" "}
                · {formatarCusto(custoTotal, 2)} no total
                {/* Job sem contabilidade nenhuma não pode sumir do total em silêncio —
                    foi assim que o gasto ficou invisível em primeiro lugar. */}
                {custoTotal.semDado > 0 && ` (+${custoTotal.semDado} sem custo registrado)`}
              </span>
            )}
          </h4>
          <ul className="lista-gestao">
            {historico.slice(0, 12).map((j) => (
              <li key={j.id} className="linha-gestao">
                <Link className="linha-gestao-alvo" to={`/jobs?job=${encodeURIComponent(j.id)}`}>
                  {j.titulo}
                </Link>
                <span className="linha-gestao-meta">
                  {rotuloEstadoJob(j.estado)}
                  {j.terminadoEm !== undefined &&
                    j.iniciadoEm !== undefined &&
                    ` · ${decorrido(j.iniciadoEm, Date.parse(j.terminadoEm)) ?? "—"}`}
                  {(() => {
                    // Real quando o SDK reportou; estimado quando o fluxo foi cortado. O
                    // prefixo (`~`/`≥`) carrega essa diferença até aqui — antes toda linha
                    // dizia "~" e o job cortado não aparecia de jeito nenhum.
                    const c = custoDoJob(j);
                    return c === null ? null : (
                      <span className="dep-info" title={explicarCusto(c)}>
                        {formatarCusto(c, 2)}
                      </span>
                    );
                  })()}
                </span>
              </li>
            ))}
          </ul>
          {historico.length > 12 && (
            <p className="texto-suave bloco-gestao-ajuda">
              Mostrando os 12 mais recentes. <Link to="/jobs">Ver todos os jobs</Link>.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function LinhaTarefa({
  tarefa,
  situacao,
  aoSelecionar,
}: {
  tarefa: TarefaCompleta;
  situacao: SituacaoDependencia | undefined;
  aoSelecionar: (arquivo: string) => void;
}) {
  return (
    <li className="linha-gestao">
      <button type="button" className="linha-gestao-alvo" onClick={() => aoSelecionar(tarefa.arquivo)}>
        <code>{tarefa.id}</code> {tarefa.titulo}
      </button>
      <span className="linha-gestao-meta">
        <ChipStatus status={tarefa.status} />
        {situacao !== undefined && situacao.faltando.length > 0 && (
          <span className="dep-info">espera {situacao.faltando.join(", ")}</span>
        )}
        {situacao !== undefined && situacao.esperadaPor.length > 0 && (
          // O custo de ela não sair: quantas outras estão atrás dela.
          <span className="dep-info dep-trava">
            trava {situacao.esperadaPor.length} {situacao.esperadaPor.length === 1 ? "tarefa" : "tarefas"}
          </span>
        )}
      </span>
    </li>
  );
}
