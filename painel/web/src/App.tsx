import { Link, NavLink, Route, Routes } from "react-router-dom";
import { useJobsAoVivo } from "./lib/useJobsAoVivo";
import { avisoParede, paredeDeCota } from "./lib/cota";
import { ESTADOS_JOB_ATIVOS } from "./lib/formato";
import { Ajustes } from "./paginas/ajustes/Ajustes";
import { ComoFunciona } from "./paginas/como-funciona/ComoFunciona";
import { Git } from "./paginas/git/Git";
import { Inicio } from "./paginas/inicio/Inicio";
import { Jobs } from "./paginas/jobs/Jobs";
import { Projeto } from "./paginas/projeto/Projeto";

export function App() {
  // Atividade GLOBAL no cabeçalho: sem isto só dá para saber que a fábrica está
  // trabalhando se você já estiver na aba certa — e o painel inteiro parece parado.
  const { jobs } = useJobsAoVivo();
  const ativos = jobs.filter((j) => ESTADOS_JOB_ATIVOS.has(j.estado));
  // Parede de cota: vale para a fábrica inteira, então o aviso é global — quem dispara pela
  // página inicial precisa vê-lo tanto quanto quem dispara pela página do projeto. Ver
  // `lib/cota.ts`: é derivado da lista de jobs que já está na tela, sem estado novo.
  const parede = paredeDeCota(jobs);

  return (
    <div className="aplicacao">
      <header className="cabecalho">
        <h1 className="cabecalho-titulo">Painel da Fábrica</h1>
        <nav className="navegacao" aria-label="Navegação principal">
          <NavLink to="/" end>
            Início
          </NavLink>
          <NavLink to="/jobs">
            Jobs
            {ativos.length > 0 && (
              <span className="selo-vivo" title={ativos.map((j) => j.titulo).join(" · ")}>
                <span className="pulso-mini" aria-hidden="true" />
                {ativos.length}
              </span>
            )}
          </NavLink>
          <NavLink to="/git">Git</NavLink>
          <NavLink to="/como-funciona">Como funciona</NavLink>
          <NavLink to="/ajustes">Ajustes</NavLink>
        </nav>
      </header>
      <main className="conteudo">
        {parede !== null && (
          <div className="faixa-cota">
            <strong>Limite de uso da assinatura.</strong> {avisoParede(parede)}{" "}
            <Link to={`/jobs?job=${encodeURIComponent(parede.jobId)}`}>Ver a execução</Link>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/projeto/:nome" element={<Projeto />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/git" element={<Git />} />
          <Route path="/ajustes" element={<Ajustes />} />
          <Route path="/como-funciona" element={<ComoFunciona />} />
          <Route path="*" element={<PaginaNaoEncontrada />} />
        </Routes>
      </main>
    </div>
  );
}

function PaginaNaoEncontrada() {
  return (
    <div className="pagina">
      <section className="intro">
        <h2 className="intro-titulo">Página não encontrada</h2>
        <p className="intro-sub">
          O endereço acessado não existe no painel. Talvez o projeto tenha sido renomeado
          ou removido.
        </p>
      </section>
      <div>
        <Link className="botao botao-acao" to="/">
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
