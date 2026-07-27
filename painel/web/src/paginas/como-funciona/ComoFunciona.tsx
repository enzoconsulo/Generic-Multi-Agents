import { Link } from "react-router-dom";

/**
 * "Como funciona" (T-023): o modelo mental da fábrica em diagrama.
 *
 * Existe porque o usuário, no primeiro uso real, não conseguiu deduzir da tela nem quem
 * decide o que é feito, nem quem executa, nem o que cada agente faz. A resposta é sempre a
 * mesma e cabe num desenho: **você dirige o QUÊ; a fábrica cuida do COMO.**
 */
export function ComoFunciona() {
  return (
    <div className="pagina">
      <section className="intro">
        <h2 className="intro-titulo">Como a fábrica funciona</h2>
        <p className="intro-sub">
          A autonomia é na <strong>execução</strong>, não na decisão do que fazer. Você diz o
          que quer; a fábrica planeja, constrói, testa e revisa sozinha.
        </p>
      </section>

      <section className="secao">
        <h3 className="secao-titulo">O ciclo</h3>
        <ol className="fluxo">
          <PassoFluxo
            n={1}
            titulo="Você pede"
            quem="você"
            texto="“Quero busca por voz na tela principal.” Pelo botão Pedir funcionalidade, na página do projeto."
          />
          <PassoFluxo
            n={2}
            titulo="Planejador"
            quem="agente"
            texto="Lê o pedido e o código, escreve o plano em fases, quebra em tarefas e monta a EQUIPE de especialistas sob medida para este projeto."
          />
          <PassoFluxo
            n={3}
            titulo="Você manda trabalhar"
            quem="você"
            texto="Um clique em Trabalhar. Daqui em diante não precisa de você — dá para acompanhar ou fechar o navegador."
          />
          <PassoFluxo
            n={4}
            titulo="Especialista constrói"
            quem="agente"
            texto="Cada tarefa vai ao especialista da área (domínio, api, frontend…). Sem especialista designado, vai ao executor genérico."
          />
          <PassoFluxo
            n={5}
            titulo="Testador verifica"
            quem="agente"
            texto="Roda os critérios de aceite DE VERDADE, executando o software. Reprovou? Volta para o construtor."
          />
          <PassoFluxo
            n={6}
            titulo="Revisor caça bugs"
            quem="agente"
            texto="Lê o diff procurando erro real. Aprovou, a tarefa fecha e commita. Reprovou 3 vezes, a tarefa é bloqueada e chama você."
          />
        </ol>
      </section>

      <section className="secao">
        <h3 className="secao-titulo">Quem é quem</h3>
        <div className="grade-cards">
          <Papel
            nome="Especialistas do projeto"
            tag="sob demanda"
            texto="Criados pelo planejador a partir da sua ideia — 2 a 5, sob medida (domínio, api, frontend, infra…). Mudam de projeto para projeto: é o que faz a equipe parecer um time de verdade e não um agente genérico."
          />
          <Papel
            nome="Testador e revisor"
            tag="fixos"
            texto="Iguais em todo projeto, de propósito: quem verifica não pode ser especializado no que acabou de construir, senão valida o próprio viés."
          />
          <Papel
            nome="Executor"
            tag="reserva"
            texto="Construtor genérico. Pega o que não tem especialista designado."
          />
          <Papel
            nome="Planejador / Pesquisador / Documentador"
            tag="apoio"
            texto="Entram nos momentos certos: planejar um pedido, pesquisar antes de uma decisão técnica, atualizar a documentação depois de um lote de tarefas."
          />
        </div>
      </section>

      <section className="secao">
        <h3 className="secao-titulo">Os dois modos</h3>
        <div className="grade-cards">
          <Papel
            nome="Você dirige"
            tag="Pedir funcionalidade"
            texto="Diz o que entra. A fábrica planeja e executa. Use sempre que tiver algo específico em mente."
          />
          <Papel
            nome="Ela toca sozinha"
            tag="Trabalhar"
            texto="Executa tudo que já está planejado, do começo ao fim, sem parar para perguntar. Só chama você em bloqueio ou decisão de escopo."
          />
        </div>
        <p className="texto-suave">
          Onde ver o que está acontecendo: a página do projeto mostra a equipe e o mapa do
          plano; a aba <Link to="/jobs">Jobs</Link> mostra o passo a passo ao vivo, com qual
          agente está trabalhando em cada momento.
        </p>
      </section>
    </div>
  );
}

function PassoFluxo({
  n,
  titulo,
  quem,
  texto,
}: {
  n: number;
  titulo: string;
  quem: "você" | "agente";
  texto: string;
}) {
  return (
    <li className={`fluxo-passo fluxo-${quem === "você" ? "voce" : "agente"}`}>
      <span className="fluxo-num" aria-hidden="true">
        {n}
      </span>
      <div className="fluxo-corpo">
        <div className="fluxo-cab">
          <strong>{titulo}</strong>
          <span className="badge badge-suave">{quem}</span>
        </div>
        <p className="fluxo-texto">{texto}</p>
      </div>
    </li>
  );
}

function Papel({ nome, tag, texto }: { nome: string; tag: string; texto: string }) {
  return (
    <article className="card">
      <div className="card-cab">
        <h4 className="card-titulo">{nome}</h4>
        <span className="badge badge-suave">{tag}</span>
      </div>
      <p className="card-desc">{texto}</p>
    </article>
  );
}
