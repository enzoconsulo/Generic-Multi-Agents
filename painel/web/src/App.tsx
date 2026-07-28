import { NavLink, Route, Routes } from "react-router-dom";
import { useJobsAoVivo } from "./lib/useJobsAoVivo";
import { ESTADOS_JOB_ATIVOS } from "./lib/formato";
import { ComoFunciona } from "./paginas/como-funciona/ComoFunciona";
import { Inicio } from "./paginas/inicio/Inicio";
import { Jobs } from "./paginas/jobs/Jobs";
import { Projeto } from "./paginas/projeto/Projeto";

export function App() {
  // Atividade GLOBAL no cabeçalho: sem isto só dá para saber que a fábrica está
  // trabalhando se você já estiver na aba certa — e o painel inteiro parece parado.
  const { jobs } = useJobsAoVivo();
  const ativos = jobs.filter((j) => ESTADOS_JOB_ATIVOS.has(j.estado));

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
          <NavLink to="/como-funciona">Como funciona</NavLink>
        </nav>
      </header>
      <main className="conteudo">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/projeto/:nome" element={<Projeto />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/como-funciona" element={<ComoFunciona />} />
          <Route path="*" element={<PaginaNaoEncontrada />} />
        </Routes>
      </main>
    </div>
  );
}

function PaginaNaoEncontrada() {
  return (
    <section>
      <h2>Página não encontrada</h2>
      <p>O endereço acessado não existe no painel.</p>
    </section>
  );
}
