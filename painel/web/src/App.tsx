import { NavLink, Route, Routes } from "react-router-dom";
import { Inicio } from "./paginas/inicio/Inicio";
import { Jobs } from "./paginas/jobs/Jobs";
import { Projeto } from "./paginas/projeto/Projeto";

export function App() {
  return (
    <div className="aplicacao">
      <header className="cabecalho">
        <h1 className="cabecalho-titulo">Painel da Fábrica</h1>
        <nav className="navegacao" aria-label="Navegação principal">
          <NavLink to="/" end>
            Início
          </NavLink>
          <NavLink to="/jobs">Jobs</NavLink>
        </nav>
      </header>
      <main className="conteudo">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/projeto/:nome" element={<Projeto />} />
          <Route path="/jobs" element={<Jobs />} />
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
