import { createElement, type ReactNode } from "react";
import { parseMarkdown, type Bloco, type BlocoLista, type Inline } from "../lib/markdown";

/**
 * Renderiza os documentos da fábrica (ANALISE/DECISOES/PROGRESSO, seções de tarefa) como
 * conteúdo formatado, em vez de despejar markdown cru numa `<pre>` — que era uma parede
 * de `#`, `**` e `-` que ninguém lê.
 *
 * Gera ELEMENTOS (nunca `dangerouslySetInnerHTML`): o React escapa tudo, então nem um
 * documento com `<script>` dentro consegue injetar nada.
 */
export function Markdown({ texto }: { texto: string }) {
  const blocos = parseMarkdown(texto);
  return <Blocos blocos={blocos} />;
}

/** Renderiza blocos já parseados — usado por `Documento`, que fatia o texto por seção. */
export function Blocos({ blocos }: { blocos: Bloco[] }) {
  if (blocos.length === 0) return null;
  return (
    <div className="md">
      {blocos.map((b, i) => (
        <RenderBloco key={i} bloco={b} />
      ))}
    </div>
  );
}

function RenderBloco({ bloco }: { bloco: Bloco }) {
  switch (bloco.tipo) {
    case "titulo":
      // Começa em h4: o título da seção da página já é h3, então h1 do documento não
      // pode competir com ele na hierarquia visual.
      return createElement(
        `h${Math.min(bloco.nivel + 3, 6)}`,
        { className: `md-titulo md-h${bloco.nivel}` },
        <Linha conteudo={bloco.conteudo} />,
      );
    case "paragrafo":
      return (
        <p className="md-p">
          <Linha conteudo={bloco.conteudo} />
        </p>
      );
    case "lista":
      return <Lista bloco={bloco} />;
    case "definicao":
      // Ficha rótulo → valor. Cada par ocupa a própria linha: emendados num parágrafo
      // (o que acontecia antes), "Decisão", "Motivo" e "Quem" viravam uma frase só.
      return (
        <dl className="md-def">
          {bloco.itens.map((par, i) => (
            <div key={i} className="md-def-par">
              <dt className="md-def-rot">{par.rotulo}</dt>
              <dd className="md-def-val">
                <Linha conteudo={par.conteudo} />
              </dd>
            </div>
          ))}
        </dl>
      );
    case "codigo":
      return <pre className="md-codigo">{bloco.texto}</pre>;
    case "citacao":
      return (
        <blockquote className="md-citacao">
          <Linha conteudo={bloco.conteudo} />
        </blockquote>
      );
    case "regua":
      return <hr className="md-regua" />;
  }
}

/** Lista com aninhamento — a análise descreve módulo e submódulo em dois níveis. */
function Lista({ bloco }: { bloco: BlocoLista }) {
  const itens = bloco.itens.map((it, i) => (
    <li key={i}>
      <Linha conteudo={it.conteudo} />
      {it.sublista !== null && <Lista bloco={it.sublista} />}
    </li>
  ));
  return bloco.ordenada ? (
    <ol className="md-lista">{itens}</ol>
  ) : (
    <ul className="md-lista">{itens}</ul>
  );
}

function Linha({ conteudo }: { conteudo: Inline[] }): ReactNode {
  return (
    <>
      {conteudo.map((p, i) => {
        switch (p.tipo) {
          case "forte":
            return <strong key={i}>{p.valor}</strong>;
          case "enfase":
            return <em key={i}>{p.valor}</em>;
          case "codigo":
            return (
              <code key={i} className="md-cod-inline">
                {p.valor}
              </code>
            );
          case "link":
            // Documentos podem citar links externos; abrir fora não rouba o painel.
            return (
              <a key={i} href={p.href} target="_blank" rel="noreferrer">
                {p.valor}
              </a>
            );
          default:
            return <span key={i}>{p.valor}</span>;
        }
      })}
    </>
  );
}
