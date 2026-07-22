import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDados } from "../../lib/useDados";
import { api, ErroApi } from "../../lib/api";
import type {
  AcaoFabrica,
  ProjetoResumo,
  RespostaAcao,
  RespostaFabrica,
  RespostaProjetos,
} from "../../lib/tipos";
import { Carregando, MensagemErro, Vazio } from "../../componentes/Estados";
import { BadgeMarco, ResumoStatus } from "../../componentes/Indicadores";

export function Inicio() {
  const fabrica = useDados<RespostaFabrica>("/api/fabrica");
  const projetos = useDados<RespostaProjetos>("/api/projetos");

  return (
    <div className="pagina">
      <section className="intro">
        <h2 className="intro-titulo">Painel da Fábrica</h2>
        <p className="intro-sub">
          Visão única da sua fábrica de software multi-agente: o que cada ação faz, o
          panorama de todos os projetos e a situação detalhada de cada um — tudo lido ao
          vivo dos arquivos da fábrica, sem você abrir uma pasta sequer.
        </p>
      </section>

      <section className="secao">
        <h3 className="secao-titulo">Panorama</h3>
        {fabrica.carregando && <Carregando />}
        {fabrica.erro !== null && (
          <MensagemErro
            erro={fabrica.erro}
            dica="O servidor do painel está no ar? Rode `npm run dev` na raiz do projeto."
          />
        )}
        {fabrica.dados !== null && (
          <>
            <div className="tiles">
              <div className="tile tile-destaque">
                <span className="tile-num">{fabrica.dados.resumo.projetos}</span>
                <span className="tile-rot">Projetos</span>
              </div>
            </div>
            <div className="espaco-sm" />
            <ResumoStatus contagem={fabrica.dados.resumo.tarefasPorStatus} />
            {fabrica.dados.erros.length > 0 && (
              <div className="aviso aviso-info">
                {fabrica.dados.erros.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="secao">
        <h3 className="secao-titulo">Ações da fábrica</h3>
        <p className="texto-suave secao-desc">
          As seis operações que conduzem a fábrica. Clique em “Executar” para disparar o
          fluxo real pela web — escolha o modelo (quanto mais barato, menor o custo) e
          acompanhe a saída ao vivo na página de Jobs.
        </p>
        {fabrica.carregando && <Carregando />}
        {fabrica.dados !== null && (
          <div className="grade-cards">
            {fabrica.dados.acoes.map((acao) => (
              <CartaoAcao
                key={acao.id}
                acao={acao}
                modelos={fabrica.dados!.modelos}
                modeloPadrao={fabrica.dados!.modeloPadrao}
              />
            ))}
          </div>
        )}
      </section>

      <section className="secao">
        <h3 className="secao-titulo">Projetos</h3>
        {projetos.carregando && <Carregando />}
        {projetos.erro !== null && <MensagemErro erro={projetos.erro} />}
        {projetos.dados !== null &&
          (projetos.dados.projetos.length === 0 ? (
            <Vazio texto="Nenhum projeto na fábrica ainda." />
          ) : (
            <div className="grade-cards">
              {projetos.dados.projetos.map((p) => (
                <CartaoProjeto key={p.nome} projeto={p} />
              ))}
            </div>
          ))}
      </section>
    </div>
  );
}

function CartaoAcao({
  acao,
  modelos,
  modeloPadrao,
}: {
  acao: AcaoFabrica;
  modelos: string[];
  modeloPadrao: string;
}) {
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [args, setArgs] = useState("");
  const [modelo, setModelo] = useState(modeloPadrao);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pesado = acao.id === "trabalhar";

  async function disparar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const { job } = await api<RespostaAcao>(`/api/acoes/${acao.id}`, {
        method: "POST",
        body: JSON.stringify({ argumentos: args.trim(), modelo }),
      });
      navegar(`/jobs?job=${encodeURIComponent(job.id)}`);
    } catch (e) {
      setErro(e instanceof ErroApi || e instanceof Error ? e.message : "Falha ao disparar");
      setEnviando(false);
    }
  }

  return (
    <article className="card card-acao">
      <div className="card-cab">
        <h4 className="card-titulo mono">{acao.nome}</h4>
        <span className={`badge ${acao.disponivel ? "badge-ok" : "badge-em-breve"}`}>
          {acao.disponivel ? "disponível" : "em breve"}
        </span>
      </div>
      <p className="card-desc">{acao.descricao}</p>
      {acao.argumentos !== null && (
        <p className="card-args">
          <span className="card-args-rot">Argumentos</span>
          <code>{acao.argumentos}</code>
        </p>
      )}

      {!aberto ? (
        <button
          type="button"
          className="botao botao-acao"
          onClick={() => setAberto(true)}
          disabled={!acao.disponivel}
        >
          Executar
        </button>
      ) : (
        <form className="form-acao" onSubmit={disparar}>
          {acao.argumentos !== null && (
            <label className="campo-form">
              <span>Argumentos</span>
              <input
                type="text"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder={acao.argumentos ?? ""}
                autoFocus
              />
            </label>
          )}
          <label className="campo-form">
            <span>Modelo</span>
            <select value={modelo} onChange={(e) => setModelo(e.target.value)}>
              {modelos.map((m) => (
                <option key={m} value={m}>
                  {m}
                  {m === modeloPadrao ? " (padrão)" : ""}
                </option>
              ))}
            </select>
          </label>
          {pesado && (
            <p className="aviso aviso-info aviso-compacto">
              Este fluxo pode ser longo e consumir bastante — comece com um modelo barato e
              acompanhe pelos Jobs (dá pra cancelar a qualquer momento).
            </p>
          )}
          {erro !== null && <div className="aviso aviso-erro aviso-compacto">{erro}</div>}
          <div className="form-acoes">
            <button type="submit" className="botao botao-acao" disabled={enviando}>
              {enviando ? "Disparando…" : "Disparar fluxo"}
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

function CartaoProjeto({ projeto }: { projeto: ProjetoResumo }) {
  return (
    <Link to={`/projeto/${encodeURIComponent(projeto.nome)}`} className="card card-projeto">
      <div className="card-cab">
        <h4 className="card-titulo">{projeto.nome}</h4>
      </div>
      {projeto.faseAtual !== null ? (
        <div className="card-fase">
          <span className="card-fase-nome">{projeto.faseAtual.nome}</span>
          <BadgeMarco marco={projeto.faseAtual.marco} />
        </div>
      ) : (
        <p className="texto-suave card-fase-vazia">Sem plano de fases definido.</p>
      )}
      <div className="card-projeto-resumo">
        <ResumoStatus contagem={projeto.contagemPorStatus} />
      </div>
      {projeto.erros.length > 0 && (
        <span className="badge badge-alerta">{projeto.erros.length} aviso(s)</span>
      )}
    </Link>
  );
}
