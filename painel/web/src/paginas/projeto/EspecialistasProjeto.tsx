import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import { useDados } from "../../lib/useDados";
import type {
  AcaoProjetoCatalogo,
  EstrategiaModelo,
  Job,
  RespostaAcao,
  RespostaAcoesProjeto,
  RespostaFabrica,
} from "../../lib/tipos";
import { estimarCusto, rotuloEstadoJob, rotuloPeso } from "../../lib/formato";
import { ultimoCustoDaAcao } from "../../lib/gestao";
import { ExplicaAcao, SeloEscrita } from "../../componentes/ExplicaAcao";

/**
 * Chamar UM especialista para UM projeto (T-033).
 *
 * Fica separado de `AcoesProjeto` de propósito, porque responde a uma pergunta diferente:
 * lá é "o que a fábrica faz por mim agora" (planejar tudo / executar tudo); aqui é "quero
 * uma coisa específica feita por quem entende dela". Antes desta seção só existiam os
 * dois extremos, e todo o meio-termo da gestão de um projeto ficava fora do painel.
 *
 * O catálogo vem do servidor (`/api/acoes-projeto`) — a UI não repete a lista de ações,
 * senão ela sai de sincronia com o backend na primeira ação nova.
 */
export function EspecialistasProjeto({
  projeto,
  jobAtivo,
  jobs,
}: {
  projeto: string;
  jobAtivo: Job | null;
  /** Histórico — de onde sai o custo REAL da última execução de cada ação (T-040). */
  jobs: Job[];
}) {
  const catalogo = useDados<RespostaAcoesProjeto>("/api/acoes-projeto");
  const fabrica = useDados<RespostaFabrica>("/api/fabrica");

  if (catalogo.dados === null || fabrica.dados === null) return null;

  const { estrategias, estrategiaPadrao } = fabrica.dados;
  const doGrupo = (grupo: AcaoProjetoCatalogo["grupo"]) =>
    catalogo.dados!.acoes.filter((a) => a.grupo === grupo);

  // Duas seções, não uma: chamar um ESPECIALISTA e cuidar do PROJETO são decisões
  // diferentes. Numa lista só, "Conferir integridade" apareceria sob o título "chamar um
  // especialista" com o agente `orquestrador` — título mentindo sobre o conteúdo.
  return (
    <>
      <GrupoAcoes
        titulo="Chamar um especialista"
        descricao={
          <>
            Cada um faz uma coisa e faz bem. Diferente de <strong>Trabalhar</strong>, que roda o
            pipeline inteiro, aqui você pede um serviço só — e o projeto continua onde estava.
          </>
        }
        acoes={doGrupo("especialista")}
        projeto={projeto}
        estrategias={estrategias}
        estrategiaPadrao={estrategiaPadrao}
        jobAtivo={jobAtivo}
        jobs={jobs}
      />

      <GrupoAcoes
        titulo="Cuidar deste projeto"
        descricao={
          <>
            Zeladoria com escopo fechado NESTE projeto — o que antes só existia para a fábrica
            inteira, e por isso saía caro para conferir um projeto só.
          </>
        }
        acoes={doGrupo("cuidado")}
        projeto={projeto}
        estrategias={estrategias}
        estrategiaPadrao={estrategiaPadrao}
        jobAtivo={jobAtivo}
        jobs={jobs}
      />
    </>
  );
}

/**
 * Só os cards de um grupo, sem moldura de seção — para quem quer embutir as ações dentro
 * de outra seção (a de Equipe usa isto para pôr "Recriar equipe" junto do que ela altera,
 * em vez de solta numa lista de botões longe do efeito).
 */
export function AcoesDoGrupo({
  grupo,
  projeto,
  jobAtivo,
  jobs = [],
}: {
  grupo: AcaoProjetoCatalogo["grupo"];
  projeto: string;
  jobAtivo: Job | null;
  jobs?: Job[];
}) {
  const catalogo = useDados<RespostaAcoesProjeto>("/api/acoes-projeto");
  const fabrica = useDados<RespostaFabrica>("/api/fabrica");

  if (catalogo.dados === null || fabrica.dados === null) return null;
  const acoes = catalogo.dados.acoes.filter((a) => a.grupo === grupo);
  if (acoes.length === 0) return null;

  return (
    <div className="grade-cards">
      {acoes.map((acao) => (
        <CartaoEspecialista
          key={acao.id}
          acao={acao}
          projeto={projeto}
          estrategias={fabrica.dados!.estrategias}
          estrategiaPadrao={fabrica.dados!.estrategiaPadrao}
          bloqueado={jobAtivo !== null}
          custoReal={ultimoCustoDaAcao(jobs, projeto, acao.rotulo)}
        />
      ))}
    </div>
  );
}

function GrupoAcoes({
  titulo,
  descricao,
  acoes,
  projeto,
  estrategias,
  estrategiaPadrao,
  jobAtivo,
  jobs,
}: {
  titulo: string;
  descricao: React.ReactNode;
  acoes: AcaoProjetoCatalogo[];
  projeto: string;
  estrategias: EstrategiaModelo[];
  estrategiaPadrao: string;
  jobAtivo: Job | null;
  jobs: Job[];
}) {
  if (acoes.length === 0) return null;

  return (
    <section className="secao">
      <h3 className="secao-titulo">{titulo}</h3>
      <p className="texto-suave secao-desc">{descricao}</p>

      {jobAtivo !== null && (
        <p className="aviso aviso-info aviso-compacto">
          Projeto ocupado por <strong>{jobAtivo.titulo}</strong> ({rotuloEstadoJob(jobAtivo.estado)})
          — as ações reabrem sozinhas quando terminar.
        </p>
      )}

      <div className="grade-cards">
        {acoes.map((acao) => (
          <CartaoEspecialista
            key={acao.id}
            acao={acao}
            projeto={projeto}
            estrategias={estrategias}
            estrategiaPadrao={estrategiaPadrao}
            bloqueado={jobAtivo !== null}
            custoReal={ultimoCustoDaAcao(jobs, projeto, acao.rotulo)}
          />
        ))}
      </div>
    </section>
  );
}

function CartaoEspecialista({
  acao,
  projeto,
  estrategias,
  estrategiaPadrao,
  bloqueado,
  custoReal,
}: {
  acao: AcaoProjetoCatalogo;
  projeto: string;
  estrategias: EstrategiaModelo[];
  estrategiaPadrao: string;
  bloqueado: boolean;
  /** Custo da última execução desta ação neste projeto; null = nunca rodou aqui. */
  custoReal: number | null;
}) {
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [estrategiaId, setEstrategiaId] = useState(estrategiaPadrao);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const estrategia = estrategias.find((e) => e.id === estrategiaId) ?? estrategias[0];
  const estimativa = estrategia ? estimarCusto(acao.peso, estrategia.custo) : null;

  // Quem decide se o texto é obrigatório é o catálogo do servidor (o recorte do
  // `replanejar`, por exemplo, é opcional). O servidor valida de novo; isto aqui é só
  // para o botão não prometer o que vai dar 400.
  const exigeTexto = acao.entrada?.obrigatoria === true;
  const faltaTexto = exigeTexto && texto.trim() === "";

  async function disparar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const { job } = await api<RespostaAcao>(`/api/acoes-projeto/${acao.id}`, {
        method: "POST",
        body: JSON.stringify({
          projeto,
          ...(acao.entrada ? { entrada: texto.trim() } : {}),
          estrategia: estrategiaId,
        }),
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
        <h4 className="card-titulo">{acao.rotulo}</h4>
        {/* O selo agora responde "isso altera meu projeto?" — o peso do fluxo é
            detalhe interno e migrou para dentro da explicação. */}
        <SeloEscrita acao={acao} />
      </div>
      <p className="card-desc">{acao.resumo}</p>
      <p className="card-args">
        <span className="card-args-rot">Agente</span>
        <code>{acao.agente}</code>
      </p>

      <ExplicaAcao
        acao={acao}
        custoReal={custoReal}
        custoEstimado={estimativa?.rotulo ?? rotuloPeso(acao.peso)}
      />

      {!aberto ? (
        <button
          type="button"
          className="botao botao-acao"
          onClick={() => setAberto(true)}
          disabled={bloqueado}
          title={bloqueado ? "Projeto ocupado por outro job — aguarde terminar." : undefined}
        >
          {acao.rotulo}
        </button>
      ) : (
        <form className="form-acao" onSubmit={disparar}>
          {acao.entrada && (
            <label className="campo-form">
              <span>{acao.entrada.rotulo}</span>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={acao.entrada.placeholder}
                rows={3}
                required={exigeTexto}
                autoFocus
              />
            </label>
          )}

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

          {erro !== null && <div className="aviso aviso-erro aviso-compacto">{erro}</div>}

          <div className="form-acoes">
            <button
              type="submit"
              className="botao botao-acao"
              disabled={enviando || bloqueado || faltaTexto}
            >
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
