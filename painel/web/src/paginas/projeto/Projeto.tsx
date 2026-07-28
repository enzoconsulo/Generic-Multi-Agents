import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDados } from "../../lib/useDados";
import { useJobsAoVivo, type EstadoAoVivo } from "../../lib/useJobsAoVivo";
import { api, ErroApi } from "../../lib/api";
import type {
  EquipeProjeto,
  EstrategiaModelo,
  FasePlano,
  Job,
  ProjetoDetalhe,
  RespostaAcao,
  RespostaFabrica,
  TarefaCompleta,
} from "../../lib/tipos";
import {
  ESTADOS_JOB_TERMINAIS,
  ORDEM_STATUS,
  classePrioridade,
  estimarCusto,
  rotuloPrioridade,
  rotuloStatus,
} from "../../lib/formato";
import { Carregando, MensagemErro } from "../../componentes/Estados";
import { GrafoGit } from "../../componentes/GrafoGit";
import { PublicacaoRepo } from "../../componentes/PublicacaoRepo";
import { EstadoPublicacao } from "../git/Git";
import type { ListaRepos } from "../../lib/tipos";
import { Markdown } from "../../componentes/Markdown";
import { TextoLongo } from "../../componentes/TextoLongo";
import { BadgeMarco, ChipStatus, ResumoStatus } from "../../componentes/Indicadores";
import { AcoesProjeto, jobAtivoDoProjeto } from "./AcoesProjeto";
import { EquipeAoVivo } from "./EquipeAoVivo";
import { MapaPlano } from "./MapaPlano";
import { SecaoCi } from "./ci/PainelCi";

export function Projeto() {
  const { nome } = useParams<{ nome: string }>();
  const alvo = nome ?? "";
  const { carregando, dados, erro, recarregar } = useDados<ProjetoDetalhe>(
    `/api/projetos/${encodeURIComponent(alvo)}`,
  );
  const aoVivo = useJobsAoVivo();
  const { jobs } = aoVivo;
  const jobAtivo = jobAtivoDoProjeto(jobs, alvo);

  // Refetch automático (T-016): quando um job com lock NESTE projeto termina — disparado
  // por este navegador ou não —, o detalhe (kanban/plano/análise) se atualiza sozinho, sem
  // precisar de F5. `vistos` evita reagir a jobs que já chegaram terminais (histórico
  // carregado no mount) e a re-disparar refetch repetido pela mesma transição.
  const vistos = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    let mudou = false;
    for (const job of jobs) {
      if (job.escopo !== `projeto:${alvo}`) continue;
      const anterior = vistos.current.get(job.id);
      vistos.current.set(job.id, job.estado);
      if (
        anterior !== undefined &&
        !ESTADOS_JOB_TERMINAIS.has(anterior) &&
        ESTADOS_JOB_TERMINAIS.has(job.estado)
      ) {
        mudou = true;
      }
    }
    if (mudou) recarregar();
  }, [jobs, alvo, recarregar]);

  return (
    <div className="pagina">
      <div className="voltar">
        <Link to="/">← Todos os projetos</Link>
      </div>

      {carregando && dados === null && <Carregando texto={`Carregando ${alvo}…`} />}
      {erro !== null && (
        <MensagemErro erro={erro} dica="Verifique se o nome do projeto existe na fábrica." />
      )}
      {dados !== null && <DetalheProjeto projeto={dados} jobAtivo={jobAtivo} aoVivo={aoVivo} />}
    </div>
  );
}

function DetalheProjeto({
  projeto,
  jobAtivo,
  aoVivo,
}: {
  projeto: ProjetoDetalhe;
  jobAtivo: Job | null;
  aoVivo: EstadoAoVivo;
}) {
  // Seleção de tarefa sobe para cá: o mapa do plano e o quadro apontam para a MESMA
  // tarefa, então clicar num bloco do mapa abre o detalhe no quadro.
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const refQuadro = useRef<HTMLDivElement>(null);

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

      <AcoesProjeto projeto={projeto} jobAtivo={jobAtivo} />

      <EquipeAoVivo
        equipe={projeto.equipe}
        tarefas={projeto.tarefas}
        logs={jobAtivo !== null ? (aoVivo.logs[jobAtivo.id] ?? []) : []}
        jobAtivo={jobAtivo}
      />

      <MapaPlano
        plano={projeto.plano}
        tarefas={projeto.tarefas}
        aoSelecionar={(arquivo) => {
          setSelecionada(arquivo);
          refQuadro.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      <div ref={refQuadro}>
        <QuadroTarefas
          tarefas={projeto.tarefas}
          selecionada={selecionada}
          aoSelecionar={setSelecionada}
        />
      </div>

      <GrafoGit repo={projeto.nome} titulo="Histórico do código" />

      <SecaoPublicacao projeto={projeto.nome} />

      <SecaoCi projeto={projeto.nome} jobAtivo={jobAtivo} aoVivo={aoVivo} />

      <SecaoAnalise projeto={projeto.nome} analise={projeto.analise} bloqueado={jobAtivo !== null} />

      <SecaoTexto titulo="Decisões" texto={projeto.decisoes} vazio="Sem DECISOES.md." />
      <SecaoTexto titulo="Progresso" texto={projeto.progresso} vazio="Sem PROGRESSO.md." />
    </>
  );
}

/**
 * Publicação DESTE projeto (T-031). Cada projeto é um repositório próprio, com endereço
 * próprio na nuvem — e é aqui, na página dele, que se olha o projeto. Obrigar a ir até a
 * aba Git para publicar seria o mesmo erro da T-023: entregar longe de onde se olha.
 */
function SecaoPublicacao({ projeto }: { projeto: string }) {
  const { dados, erro, recarregar } = useDados<ListaRepos>("/api/repos");
  const repo = dados?.repos.find((r) => r.id === projeto) ?? null;

  return (
    <section className="secao">
      <div className="secao-cab-acao">
        <h3 className="secao-titulo">Publicação</h3>
        {repo !== null && <EstadoPublicacao repo={repo} />}
      </div>
      {erro !== null && <MensagemErro erro={erro} />}
      {repo === null && erro === null && <p className="texto-suave">Lendo o repositório…</p>}
      {repo !== null && <PublicacaoRepo repo={repo} aoMudar={recarregar} />}
    </section>
  );
}

/** Kanban por status + painel de detalhe da tarefa selecionada. */
function QuadroTarefas({
  tarefas,
  selecionada,
  aoSelecionar,
}: {
  tarefas: TarefaCompleta[];
  selecionada: string | null;
  aoSelecionar: (arquivo: string | null) => void;
}) {
  const setSelecionada = (f: (atual: string | null) => string | null) => aoSelecionar(f(selecionada));
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
            <DetalheTarefa tarefa={tarefaSel} aoFechar={() => aoSelecionar(null)} />
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
        <div className="bloco-texto">
          <Markdown texto={conteudo} />
        </div>
      )}
    </div>
  );
}

/**
 * Seção "Análise do código": mostra o ANALISE.md (se houver) e um botão para DISPARAR a
 * ação de análise (T-012), que lê o projeto de ponta a ponta e gera/atualiza o arquivo.
 * As estratégias de modelo vêm de /api/fabrica (mesmas da home).
 */
function SecaoAnalise({
  projeto,
  analise,
  bloqueado,
}: {
  projeto: string;
  analise: string | null;
  bloqueado: boolean;
}) {
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
            bloqueado={bloqueado}
          />
        )}
      </div>
      {temAnalise ? (
        <TextoLongo texto={(analise as string).trim()} />
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
  bloqueado,
}: {
  projeto: string;
  estrategias: EstrategiaModelo[];
  estrategiaPadrao: string;
  temAnalise: boolean;
  bloqueado: boolean;
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
        disabled={bloqueado}
        title={bloqueado ? "Projeto ocupado por outro job — aguarde terminar." : undefined}
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
        <TextoLongo texto={texto.trim()} />
      )}
    </section>
  );
}
