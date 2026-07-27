import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDados } from "../../lib/useDados";
import { api, ErroApi } from "../../lib/api";
import type {
  AcaoFabrica,
  EstrategiaModelo,
  ProjetoResumo,
  RespostaAcao,
  RespostaFabrica,
  RespostaProjetos,
} from "../../lib/tipos";
import { Carregando, MensagemErro } from "../../componentes/Estados";
import { BadgeMarco, ResumoStatus } from "../../componentes/Indicadores";
import { estimarCusto, rotuloPeso } from "../../lib/formato";

export function Inicio() {
  const fabrica = useDados<RespostaFabrica>("/api/fabrica");
  const projetos = useDados<RespostaProjetos>("/api/projetos");

  return (
    <div className="pagina">
      <section className="intro">
        <h2 className="intro-titulo">Painel da Fábrica</h2>
        <p className="intro-sub">
          Seu cockpit da fábrica de software multi-agente. Aqui você vê o estado de tudo e
          dispara os fluxos reais da fábrica pela web — sem abrir uma pasta ou um terminal.
        </p>
      </section>

      <section className="secao">
        <h3 className="secao-titulo">Panorama</h3>
        {fabrica.carregando && <Carregando />}
        {fabrica.erro !== null && (
          <MensagemErro
            erro={fabrica.erro}
            dica="O servidor do painel está no ar? Rode `npm run dev` na pasta do painel."
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
          </>
        )}
      </section>

      <section className="secao">
        <h3 className="secao-titulo">Ações da fábrica</h3>
        <p className="texto-suave secao-desc">
          Cada ação executa um fluxo real da fábrica. Clique em <strong>Executar</strong>,
          escolha o <strong>modelo</strong> (afeta custo e qualidade) e acompanhe a saída ao
          vivo na aba <Link to="/jobs">Jobs</Link>. O selo de <strong>peso</strong> e a{" "}
          <strong>estimativa de custo</strong> ajudam a decidir antes de gastar.
        </p>
        {fabrica.carregando && <Carregando />}
        {fabrica.dados !== null && (
          <div className="grade-cards">
            {fabrica.dados.acoes.map((acao) => (
              <CartaoAcao
                key={acao.id}
                acao={acao}
                estrategias={fabrica.dados!.estrategias}
                estrategiaPadrao={fabrica.dados!.estrategiaPadrao}
              />
            ))}
          </div>
        )}
      </section>

      <section className="secao">
        <h3 className="secao-titulo">Projetos</h3>
        {fabrica.dados !== null && (
          <ImportarProjeto
            estrategias={fabrica.dados.estrategias}
            estrategiaPadrao={fabrica.dados.estrategiaPadrao}
          />
        )}
        {projetos.carregando && <Carregando />}
        {projetos.erro !== null && <MensagemErro erro={projetos.erro} />}
        {projetos.dados !== null &&
          (projetos.dados.projetos.length === 0 ? (
            <PrimeiroProjeto />
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

/**
 * Estado vazio da fábrica (T-020): em vez de uma linha cinza dizendo que não há nada,
 * mostra os DOIS caminhos concretos de primeiro passo — que é a dúvida real de quem
 * abre o painel pela primeira vez.
 */
function PrimeiroProjeto() {
  return (
    <div className="vazio-orientado">
      <p className="vazio-titulo">Sua fábrica ainda não tem projetos.</p>
      <p className="texto-suave">Dois caminhos para o primeiro:</p>
      <ol className="vazio-passos">
        <li>
          <strong>Começar do zero</strong> — no cartão{" "}
          <span className="mono">/novo-projeto</span> acima, clique em{" "}
          <strong>Executar</strong> e descreva a ideia (o que é · para quem · o que precisa
          ter na v1 · o que NÃO entra). A fábrica escreve especificação, plano e tarefas.
        </li>
        <li>
          <strong>Trazer código que já existe</strong> — use{" "}
          <strong>Importar pasta existente</strong> logo acima: o painel copia a pasta para{" "}
          <span className="mono">projetos/</span>, inicializa o git se faltar e roda uma
          análise do código automaticamente.
        </li>
      </ol>
    </div>
  );
}

function CartaoAcao({
  acao,
  estrategias,
  estrategiaPadrao,
}: {
  acao: AcaoFabrica;
  estrategias: EstrategiaModelo[];
  estrategiaPadrao: string;
}) {
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [args, setArgs] = useState("");
  const [estrategiaId, setEstrategiaId] = useState(estrategiaPadrao);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const estrategia = useMemo(
    () => estrategias.find((e) => e.id === estrategiaId) ?? estrategias[0],
    [estrategias, estrategiaId],
  );
  const estimativa = estrategia ? estimarCusto(acao.peso, estrategia.custo) : null;
  const pesado = acao.peso === "pesado";

  async function disparar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const { job } = await api<RespostaAcao>(`/api/acoes/${acao.id}`, {
        method: "POST",
        body: JSON.stringify({ argumentos: args.trim(), estrategia: estrategiaId }),
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
      {acao.argumentos !== null && !aberto && (
        <p className="card-args">
          <span className="card-args-rot">Argumentos</span>
          <code>{acao.argumentos}</code>
        </p>
      )}

      {!aberto ? (
        <button type="button" className="botao botao-acao" onClick={() => setAberto(true)}>
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
              <span className="campo-ajuda">{acao.argumentos}</span>
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
              <span className="estimativa-nota">
                {acao.nome} é <strong>{rotuloPeso(acao.peso).toLowerCase()}</strong>; o custo real
                aparece ao terminar.
              </span>
            </div>
          )}

          {pesado && (
            <p className="aviso aviso-alerta aviso-compacto">
              ⚠ Fluxo pesado: escala com o volume de trabalho e pode custar bastante. Comece
              por um modelo barato — dá para cancelar a qualquer momento.
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

/**
 * Importação de uma pasta existente pela web (T-013): POST /api/projetos/importar cria um
 * job não-Claude que copia a pasta para projetos/, garante git + _gestao/ e dispara a
 * análise. Criar projeto NOVO continua sendo a ação /novo-projeto (cards acima).
 */
function ImportarProjeto({
  estrategias,
  estrategiaPadrao,
}: {
  estrategias: EstrategiaModelo[];
  estrategiaPadrao: string;
}) {
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [caminho, setCaminho] = useState("");
  const [nome, setNome] = useState("");
  const [estrategiaId, setEstrategiaId] = useState(estrategiaPadrao);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhendo, setEscolhendo] = useState(false);
  /** false = esta máquina não tem seletor nativo (não-Windows): só resta digitar. */
  const [temSeletor, setTemSeletor] = useState(true);

  /**
   * Abre o seletor NATIVO no backend. Precisa ser no servidor porque o navegador não
   * revela caminho absoluto de pasta — ver `servidor/src/projetos/seletor-pasta.ts`.
   */
  async function escolherPasta() {
    setEscolhendo(true);
    setErro(null);
    try {
      const { caminho: escolhido } = await api<{ caminho: string | null }>(
        "/api/projetos/escolher-pasta",
        { method: "POST" },
      );
      // null = usuário cancelou o diálogo: não é erro, não mexe no que ele já digitou.
      if (escolhido !== null) setCaminho(escolhido);
    } catch (e) {
      if (e instanceof ErroApi && e.status === 501) {
        setTemSeletor(false);
        setErro("Esta máquina não tem seletor nativo. Cole o caminho da pasta no campo.");
      } else {
        setErro(e instanceof ErroApi || e instanceof Error ? e.message : "Falha ao abrir o seletor");
      }
    } finally {
      setEscolhendo(false);
    }
  }

  async function importar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const { job } = await api<RespostaAcao>("/api/projetos/importar", {
        method: "POST",
        body: JSON.stringify({
          caminho: caminho.trim(),
          nome: nome.trim() !== "" ? nome.trim() : undefined,
          estrategia: estrategiaId,
        }),
      });
      navegar(`/jobs?job=${encodeURIComponent(job.id)}`);
    } catch (e) {
      setErro(e instanceof ErroApi || e instanceof Error ? e.message : "Falha ao importar");
      setEnviando(false);
    }
  }

  if (!aberto) {
    return (
      <div className="importar-projeto">
        <button
          type="button"
          className="botao botao-secundario botao-compacto"
          onClick={() => setAberto(true)}
        >
          + Importar pasta existente…
        </button>
      </div>
    );
  }

  return (
    <form className="form-acao importar-projeto" onSubmit={importar}>
      <label className="campo-form">
        <span>Pasta do projeto</span>
        <div className="campo-com-botao">
          <input
            type="text"
            value={caminho}
            onChange={(e) => setCaminho(e.target.value)}
            placeholder="C:\Users\voce\meu-projeto"
            autoFocus
            required
          />
          {temSeletor && (
            <button
              type="button"
              className="botao botao-secundario botao-compacto"
              onClick={escolherPasta}
              disabled={escolhendo || enviando}
              title="Abre o seletor de pastas do Windows"
            >
              {escolhendo ? "Escolhendo…" : "Escolher…"}
            </button>
          )}
        </div>
        <span className="campo-ajuda">
          {escolhendo
            ? "O seletor abriu — se não estiver visível, procure a janela atrás do navegador."
            : "Clique em Escolher para navegar pelo seu PC, ou cole o caminho."}
        </span>
      </label>
      <label className="campo-form">
        <span>Nome (opcional — derivado da pasta se vazio)</span>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="meu-projeto"
        />
      </label>
      <label className="campo-form">
        <span>Modelo da análise automática</span>
        <select value={estrategiaId} onChange={(e) => setEstrategiaId(e.target.value)}>
          {estrategias.map((e) => (
            <option key={e.id} value={e.id}>
              {e.rotulo}
              {e.id === estrategiaPadrao ? " (padrão)" : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="texto-suave campo-ajuda">
        A pasta é copiada para <code>projetos/</code> (ignorando <code>node_modules</code>), com
        git e <code>_gestao/</code> mínimos; a análise do código roda logo em seguida.
      </p>
      {erro !== null && <div className="aviso aviso-erro aviso-compacto">{erro}</div>}
      <div className="form-acoes">
        <button type="submit" className="botao botao-acao" disabled={enviando}>
          {enviando ? "Importando…" : "Importar"}
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
