import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDados } from "../../lib/useDados";
import { api, ErroApi } from "../../lib/api";
import type {
  EquipeProjeto,
  EstrategiaModelo,
  FasePlano,
  ProjetoDetalhe,
  RespostaAcao,
  RespostaFabrica,
  TarefaCompleta,
} from "../../lib/tipos";
import {
  ORDEM_STATUS,
  classePrioridade,
  estimarCusto,
  rotuloPrioridade,
  rotuloStatus,
} from "../../lib/formato";
import { Carregando, MensagemErro } from "../../componentes/Estados";
import { BadgeMarco, ChipStatus, ResumoStatus } from "../../componentes/Indicadores";

export function Projeto() {
  const { nome } = useParams<{ nome: string }>();
  const alvo = nome ?? "";
  const { carregando, dados, erro } = useDados<ProjetoDetalhe>(
    `/api/projetos/${encodeURIComponent(alvo)}`,
  );

  return (
    <div className="pagina">
      <div className="voltar">
        <Link to="/">← Todos os projetos</Link>
      </div>

      {carregando && <Carregando texto={`Carregando ${alvo}…`} />}
      {erro !== null && (
        <MensagemErro erro={erro} dica="Verifique se o nome do projeto existe na fábrica." />
      )}
      {dados !== null && <DetalheProjeto projeto={dados} />}
    </div>
  );
}

function DetalheProjeto({ projeto }: { projeto: ProjetoDetalhe }) {
  return (
    <>
      <header className="projeto-cab">
        <h2 className="projeto-titulo">{projeto.nome}</h2>
        {projeto.faseAtual !== null && (
          <div className="projeto-fase">
            <span className="projeto-fase-nome">{projeto.faseAtual.nome}</span>
            <BadgeMarco marco={projeto.faseAtual.marco} />
          </div>
        )}
      </header>

      {projeto.erros.length > 0 && (
        <div className="aviso aviso-info">
          {projeto.erros.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}

      <section className="secao">
        <h3 className="secao-titulo">Resumo</h3>
        <ResumoStatus contagem={projeto.contagemPorStatus} />
      </section>

      <BlocoEquipe equipe={projeto.equipe} />

      <QuadroTarefas tarefas={projeto.tarefas} />

      {projeto.plano !== null && <BlocoPlano fases={projeto.plano.fases} />}

      <SecaoAnalise projeto={projeto.nome} analise={projeto.analise} />

      <SecaoTexto titulo="Decisões" texto={projeto.decisoes} vazio="Sem DECISOES.md." />
      <SecaoTexto titulo="Progresso" texto={projeto.progresso} vazio="Sem PROGRESSO.md." />
    </>
  );
}

/** Kanban por status + painel de detalhe da tarefa selecionada. */
function QuadroTarefas({ tarefas }: { tarefas: TarefaCompleta[] }) {
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const colunas = ORDEM_STATUS.filter((s) => tarefas.some((t) => t.status === s));
  const tarefaSel = tarefas.find((t) => t.arquivo === selecionada) ?? null;

  return (
    <section className="secao">
      <h3 className="secao-titulo">Tarefas</h3>
      {tarefas.length === 0 ? (
        <p className="texto-suave">Nenhuma tarefa neste projeto.</p>
      ) : (
        <>
          <div className="kanban">
            {colunas.map((status) => {
              const daColuna = tarefas.filter((t) => t.status === status);
              return (
                <div key={status} className={`coluna st-${status}`}>
                  <div className="coluna-cab">
                    <span className="chip-ponto" aria-hidden="true" />
                    <span className="coluna-nome">{rotuloStatus(status)}</span>
                    <span className="coluna-num">{daColuna.length}</span>
                  </div>
                  <div className="coluna-lista">
                    {daColuna.map((t) => (
                      <button
                        key={t.arquivo}
                        type="button"
                        className={`tarefa-card ${t.arquivo === selecionada ? "ativa" : ""}`}
                        onClick={() =>
                          setSelecionada((atual) => (atual === t.arquivo ? null : t.arquivo))
                        }
                      >
                        <div className="tarefa-topo">
                          <span className="tarefa-id mono">{t.id}</span>
                          <span className={`bolha-pri ${classePrioridade(t.prioridade)}`}>
                            {rotuloPrioridade(t.prioridade)}
                          </span>
                        </div>
                        <span className="tarefa-titulo">{t.titulo}</span>
                        <div className="tarefa-meta">
                          {t.dependencias.length > 0 && (
                            <span title="Dependências">⛓ {t.dependencias.length}</span>
                          )}
                          {t.tentativas > 0 && (
                            <span title="Tentativas">↻ {t.tentativas}</span>
                          )}
                          {t.erros.length > 0 && (
                            <span className="meta-alerta" title="Avisos de parse">
                              ⚠ {t.erros.length}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {tarefaSel !== null && (
            <DetalheTarefa tarefa={tarefaSel} aoFechar={() => setSelecionada(null)} />
          )}
        </>
      )}
    </section>
  );
}

function DetalheTarefa({
  tarefa,
  aoFechar,
}: {
  tarefa: TarefaCompleta;
  aoFechar: () => void;
}) {
  const s = tarefa.secoes;
  return (
    <div className="detalhe-tarefa">
      <div className="detalhe-cab">
        <div>
          <span className="detalhe-id mono">{tarefa.id}</span>
          <h4 className="detalhe-titulo">{tarefa.titulo}</h4>
        </div>
        <button type="button" className="botao-fechar" onClick={aoFechar} aria-label="Fechar">
          ×
        </button>
      </div>

      <div className="detalhe-badges">
        <ChipStatus status={tarefa.status} />
        <span className={`bolha-pri ${classePrioridade(tarefa.prioridade)}`}>
          Prioridade {rotuloPrioridade(tarefa.prioridade)}
        </span>
        {tarefa.tentativas > 0 && <span className="badge badge-suave">↻ {tarefa.tentativas} tentativa(s)</span>}
        {tarefa.replanejadaDe !== null && (
          <span className="badge badge-suave">replanejada de {tarefa.replanejadaDe}</span>
        )}
      </div>

      <dl className="detalhe-campos">
        {tarefa.dependencias.length > 0 && (
          <Campo rot="Dependências" valor={tarefa.dependencias.join(", ")} />
        )}
        {tarefa.areas.length > 0 && <Campo rot="Áreas" valor={tarefa.areas.join(", ")} />}
        {tarefa.agente !== null && <Campo rot="Agente" valor={tarefa.agente} />}
        {tarefa.atualizada !== null && <Campo rot="Atualizada" valor={tarefa.atualizada} />}
      </dl>

      {tarefa.erros.length > 0 && (
        <div className="aviso aviso-erro">{tarefa.erros.join(" · ")}</div>
      )}

      <CampoSecao rot="Objetivo" texto={s.objetivo} />
      <CampoSecao rot="Contexto" texto={s.contexto} />
      <CampoSecao rot="Critérios de aceite" texto={s.criteriosAceite} />
      <CampoSecao rot="Notas de execução" texto={s.notasExecucao} />
      <CampoSecao rot="Verificação" texto={s.verificacao} />
      <CampoSecao rot="Revisão" texto={s.revisao} />
    </div>
  );
}

function Campo({ rot, valor }: { rot: string; valor: string }) {
  return (
    <div className="campo">
      <dt>{rot}</dt>
      <dd className="mono">{valor}</dd>
    </div>
  );
}

function CampoSecao({ rot, texto }: { rot: string; texto: string }) {
  const conteudo = texto.trim();
  return (
    <div className="secao-tarefa">
      <h5 className="secao-tarefa-rot">{rot}</h5>
      {conteudo === "" ? (
        <p className="texto-suave secao-tarefa-vazia">(vazio)</p>
      ) : (
        <pre className="bloco-texto">{conteudo}</pre>
      )}
    </div>
  );
}

function BlocoEquipe({ equipe }: { equipe: EquipeProjeto }) {
  return (
    <section className="secao">
      <h3 className="secao-titulo">Equipe de especialistas</h3>
      {equipe.erros.length > 0 && (
        <div className="aviso aviso-erro">{equipe.erros.join(" · ")}</div>
      )}
      {equipe.agentes.length === 0 ? (
        <p className="texto-suave">
          Sem equipe definida. Os especialistas são criados pelo planejador a partir da ideia
          do projeto (em <code>_gestao/equipe.json</code>); enquanto não houver, o{" "}
          <span className="mono">/trabalhar</span> usa o executor genérico.
        </p>
      ) : (
        <div className="grade-cards">
          {equipe.agentes.map((a) => (
            <article key={a.id} className="card">
              <div className="card-cab">
                <h4 className="card-titulo">{a.nome}</h4>
                <span className="badge badge-suave mono">{a.id}</span>
              </div>
              {a.descricao !== "" && <p className="card-desc">{a.descricao}</p>}
              {a.ferramentas !== null && a.ferramentas.length > 0 && (
                <p className="card-args">
                  <span className="card-args-rot">Ferramentas</span>
                  <code>{a.ferramentas.join(", ")}</code>
                </p>
              )}
              {a.erros.length > 0 && (
                <span className="badge badge-alerta">{a.erros.join(" · ")}</span>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function BlocoPlano({ fases }: { fases: FasePlano[] }) {
  return (
    <section className="secao">
      <h3 className="secao-titulo">Plano</h3>
      {fases.length === 0 ? (
        <p className="texto-suave">Plano sem fases.</p>
      ) : (
        <div className="fases">
          {fases.map((fase, i) => (
            <article key={i} className="fase">
              <div className="fase-cab">
                <h4 className="fase-nome">{fase.nome}</h4>
                {fase.marco !== null && <BadgeMarco marco={fase.marco} />}
              </div>
              {fase.meta !== "" && <p className="fase-meta">{fase.meta}</p>}
              {fase.tarefas.length > 0 && (
                <p className="fase-tarefas mono">{fase.tarefas.join(" · ")}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Seção "Análise do código": mostra o ANALISE.md (se houver) e um botão para DISPARAR a
 * ação de análise (T-012), que lê o projeto de ponta a ponta e gera/atualiza o arquivo.
 * As estratégias de modelo vêm de /api/fabrica (mesmas da home).
 */
function SecaoAnalise({ projeto, analise }: { projeto: string; analise: string | null }) {
  const fabrica = useDados<RespostaFabrica>("/api/fabrica");
  const temAnalise = analise !== null && analise.trim() !== "";

  return (
    <section className="secao">
      <div className="secao-cab-acao">
        <h3 className="secao-titulo">Análise do código</h3>
        {fabrica.dados !== null && (
          <ControleAnalise
            projeto={projeto}
            estrategias={fabrica.dados.estrategias}
            estrategiaPadrao={fabrica.dados.estrategiaPadrao}
            temAnalise={temAnalise}
          />
        )}
      </div>
      {temAnalise ? (
        <pre className="bloco-texto bloco-texto-grande">{(analise as string).trim()}</pre>
      ) : (
        <p className="texto-suave">
          Análise ainda não gerada. Clique em <strong>Analisar</strong> — o painel lê o código
          de ponta a ponta e gera o <code>_gestao/ANALISE.md</code> (arquitetura, fluxo, stack e
          pontos de atenção), acompanhável ao vivo na aba <Link to="/jobs">Jobs</Link>.
        </p>
      )}
    </section>
  );
}

function ControleAnalise({
  projeto,
  estrategias,
  estrategiaPadrao,
  temAnalise,
}: {
  projeto: string;
  estrategias: EstrategiaModelo[];
  estrategiaPadrao: string;
  temAnalise: boolean;
}) {
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [estrategiaId, setEstrategiaId] = useState(estrategiaPadrao);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const estrategia = estrategias.find((e) => e.id === estrategiaId) ?? estrategias[0];
  // Análise lê o projeto todo mas escreve só um arquivo: peso "médio" para a estimativa.
  const estimativa = estrategia ? estimarCusto("medio", estrategia.custo) : null;

  async function analisar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const { job } = await api<RespostaAcao>("/api/acoes/analisar", {
        method: "POST",
        body: JSON.stringify({ projeto, estrategia: estrategiaId }),
      });
      navegar(`/jobs?job=${encodeURIComponent(job.id)}`);
    } catch (e) {
      setErro(e instanceof ErroApi || e instanceof Error ? e.message : "Falha ao disparar");
      setEnviando(false);
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        className="botao botao-acao botao-compacto"
        onClick={() => setAberto(true)}
      >
        {temAnalise ? "Reanalisar" : "Analisar"}
      </button>
    );
  }

  return (
    <form className="form-acao form-acao-inline" onSubmit={analisar}>
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
      </label>
      {estimativa && (
        <span
          className={`badge custo-${estimativa.tier}`}
          title="Estimativa — a análise lê o projeto inteiro; o custo real aparece ao terminar."
        >
          Custo ~{estimativa.rotulo}
        </span>
      )}
      {erro !== null && <div className="aviso aviso-erro aviso-compacto">{erro}</div>}
      <div className="form-acoes">
        <button type="submit" className="botao botao-acao botao-compacto" disabled={enviando}>
          {enviando ? "Disparando…" : "Gerar análise"}
        </button>
        <button
          type="button"
          className="botao botao-secundario botao-compacto"
          onClick={() => setAberto(false)}
          disabled={enviando}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function SecaoTexto({
  titulo,
  texto,
  vazio,
}: {
  titulo: string;
  texto: string | null;
  vazio: string;
}) {
  return (
    <section className="secao">
      <h3 className="secao-titulo">{titulo}</h3>
      {texto === null || texto.trim() === "" ? (
        <p className="texto-suave">{vazio}</p>
      ) : (
        <pre className="bloco-texto bloco-texto-grande">{texto.trim()}</pre>
      )}
    </section>
  );
}
