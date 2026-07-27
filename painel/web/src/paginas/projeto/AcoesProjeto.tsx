import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import { useDados } from "../../lib/useDados";
import type {
  AcaoFabrica,
  EstrategiaModelo,
  Job,
  ProjetoDetalhe,
  RespostaAcao,
  RespostaFabrica,
} from "../../lib/tipos";
import { ESTADOS_JOB_ATIVOS, estimarCusto, rotuloEstadoJob, rotuloPeso } from "../../lib/formato";
import { proximoPasso, type AcaoSugerida } from "./proximo-passo";

/**
 * Ações por projeto (T-016) + "próximo passo sugerido" (T-022).
 *
 * As três ações cobrem os dois modos de usar a fábrica, que antes não estavam explícitos
 * em lugar nenhum da tela:
 *  - **Pedir funcionalidade** (`/ideia`): VOCÊ decide o que entra; a fábrica planeja,
 *    divide em tarefas e monta a equipe de especialistas.
 *  - **Trabalhar** (`/trabalhar`): a fábrica EXECUTA sozinha o que já está planejado.
 *  - **Status**: leitura rápida.
 * Ou seja: a autonomia é na execução, não na decisão do que fazer.
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

export function AcoesProjeto({
  projeto,
  jobAtivo,
}: {
  projeto: ProjetoDetalhe;
  jobAtivo: Job | null;
}) {
  const fabrica = useDados<RespostaFabrica>("/api/fabrica");
  const refPedir = useRef<HTMLDivElement>(null);
  const [abrirPedido, setAbrirPedido] = useState(false);

  const passo = proximoPasso(projeto, jobAtivo);
  if (fabrica.dados === null) return null;

  const acaoPor = (id: string) => fabrica.dados!.acoes.find((a) => a.id === id);
  const ideia = acaoPor("ideia");
  const trabalhar = acaoPor("trabalhar");
  const status = acaoPor("status");
  const ehPainelFabrica = projeto.nome === "painel-fabrica";

  /** O CTA do "próximo passo" leva direto para a ação certa, sem o usuário caçar botão. */
  function irPara(acao: AcaoSugerida) {
    if (acao === "pedir") {
      setAbrirPedido(true);
      refPedir.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  return (
    <section className="secao">
      <h3 className="secao-titulo">O que fazer agora</h3>

      <div className={`passo passo-${passo.tom}`}>
        <div className="passo-texto">
          <strong className="passo-titulo">{passo.titulo}</strong>
          <p className="passo-detalhe">{passo.detalhe}</p>
        </div>
        {passo.acao === "jobs" && jobAtivo !== null && (
          <Link className="botao botao-acao botao-compacto" to={`/jobs?job=${encodeURIComponent(jobAtivo.id)}`}>
            Ver ao vivo
          </Link>
        )}
        {passo.acao === "pedir" && (
          <button type="button" className="botao botao-acao botao-compacto" onClick={() => irPara("pedir")}>
            Pedir funcionalidade
          </button>
        )}
      </div>

      {jobAtivo !== null && (
        <p className="aviso aviso-info aviso-compacto">
          Projeto ocupado por <strong>{jobAtivo.titulo}</strong> ({rotuloEstadoJob(jobAtivo.estado)})
          — as ações reabrem sozinhas quando terminar.
        </p>
      )}

      <div className="grade-cards" ref={refPedir}>
        {ideia && (
          <CartaoAcaoProjeto
            acao={ideia}
            rotulo="Pedir funcionalidade"
            resumo="Você diz o que quer; a fábrica planeja, cria as tarefas e a equipe de especialistas."
            projeto={projeto.nome}
            estrategias={fabrica.dados.estrategias}
            estrategiaPadrao={fabrica.dados.estrategiaPadrao}
            bloqueado={jobAtivo !== null}
            avisoEspecial={null}
            campoTexto={{
              rotulo: "O que você quer que seja feito?",
              placeholder:
                "Ex.: adicionar busca por voz na tela principal; trocar o banco por SQLite; criar testes do módulo de login",
              montarArgumentos: (texto) => `no ${projeto.nome}, ${texto}`,
            }}
            forcarAberto={abrirPedido}
          />
        )}
        {trabalhar && (
          <CartaoAcaoProjeto
            acao={trabalhar}
            rotulo="Trabalhar neste projeto"
            resumo="Executa sozinha o que já está planejado: constrói, testa e revisa cada tarefa."
            projeto={projeto.nome}
            estrategias={fabrica.dados.estrategias}
            estrategiaPadrao={fabrica.dados.estrategiaPadrao}
            bloqueado={jobAtivo !== null}
            avisoEspecial={
              ehPainelFabrica
                ? "Este é o painel da própria fábrica: o fluxo pode alterar o código que está " +
                  "rodando agora. Prossiga só se souber o que está fazendo."
                : null
            }
            campoTexto={null}
          />
        )}
        {status && (
          <CartaoAcaoProjeto
            acao={status}
            rotulo="Ver status agora"
            resumo="Relatório do estado atual do projeto, sem alterar nada."
            projeto={projeto.nome}
            estrategias={fabrica.dados.estrategias}
            estrategiaPadrao={fabrica.dados.estrategiaPadrao}
            bloqueado={jobAtivo !== null}
            avisoEspecial={null}
            campoTexto={null}
          />
        )}
      </div>
    </section>
  );
}

interface CampoTexto {
  rotulo: string;
  placeholder: string;
  /** Monta o argumento do comando a partir do que o usuário escreveu. */
  montarArgumentos: (texto: string) => string;
}

function CartaoAcaoProjeto({
  acao,
  rotulo,
  resumo,
  projeto,
  estrategias,
  estrategiaPadrao,
  bloqueado,
  avisoEspecial,
  campoTexto,
  forcarAberto = false,
}: {
  acao: AcaoFabrica;
  rotulo: string;
  resumo: string;
  projeto: string;
  estrategias: EstrategiaModelo[];
  estrategiaPadrao: string;
  bloqueado: boolean;
  avisoEspecial: string | null;
  campoTexto: CampoTexto | null;
  forcarAberto?: boolean;
}) {
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [estrategiaId, setEstrategiaId] = useState(estrategiaPadrao);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const estrategia = estrategias.find((e) => e.id === estrategiaId) ?? estrategias[0];
  const estimativa = estrategia ? estimarCusto(acao.peso, estrategia.custo) : null;
  const expandido = aberto || forcarAberto;

  async function disparar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const argumentos = campoTexto ? campoTexto.montarArgumentos(texto.trim()) : projeto;
      const { job } = await api<RespostaAcao>(`/api/acoes/${acao.id}`, {
        method: "POST",
        body: JSON.stringify({ argumentos, estrategia: estrategiaId }),
      });
      navegar(`/jobs?job=${encodeURIComponent(job.id)}`);
    } catch (e) {
      setErro(e instanceof ErroApi || e instanceof Error ? e.message : "Falha ao disparar");
      setEnviando(false);
    }
  }

  return (
    <article className={`card card-acao ${expandido ? "aberto" : ""}`}>
      <div className="card-cab">
        <h4 className="card-titulo">{rotulo}</h4>
        <span className={`badge peso-${acao.peso}`} title="Peso típico do fluxo">
          {rotuloPeso(acao.peso)}
        </span>
      </div>
      <p className="card-desc">{resumo}</p>
      <p className="card-args">
        <span className="card-args-rot">Comando</span>
        <code>{acao.nome}</code>
      </p>

      {!expandido ? (
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
          {campoTexto && (
            <label className="campo-form">
              <span>{campoTexto.rotulo}</span>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={campoTexto.placeholder}
                rows={4}
                required
                autoFocus
              />
              <span className="campo-ajuda">
                Quanto mais claro o pedido (o que é, para quem, o que NÃO entra), melhor o
                plano que sai.
              </span>
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

          {avisoEspecial !== null && (
            <p className="aviso aviso-alerta aviso-compacto">⚠ {avisoEspecial}</p>
          )}
          {erro !== null && <div className="aviso aviso-erro aviso-compacto">{erro}</div>}

          <div className="form-acoes">
            <button
              type="submit"
              className="botao botao-acao"
              disabled={enviando || bloqueado || (campoTexto !== null && texto.trim() === "")}
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
