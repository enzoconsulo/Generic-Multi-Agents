import { useState } from "react";
import { Markdown } from "./Markdown";

/**
 * Documento longo (ANALISE/DECISOES/PROGRESSO) com colapso (T-026).
 *
 * Esses arquivos crescem sem parar — a ANÁLISE de um projeto real já ocupava várias telas
 * de rolagem, empurrando tudo que vem depois para fora do alcance. Mostra o começo e
 * deixa o resto a um clique, em vez de despejar tudo.
 */
export function TextoLongo({ texto, limiteLinhas = 14 }: { texto: string; limiteLinhas?: number }) {
  const [aberto, setAberto] = useState(false);
  const linhas = texto.split("\n");
  const longo = linhas.length > limiteLinhas;
  const visivel = aberto || !longo ? texto : linhas.slice(0, limiteLinhas).join("\n");

  return (
    <div className="texto-longo">
      <div className={longo && !aberto ? "texto-longo-cortado" : ""}>
        <Markdown texto={visivel} />
      </div>
      {longo && (
        <button
          type="button"
          className="botao botao-secundario botao-compacto"
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? "Mostrar menos" : `Mostrar tudo (${linhas.length} linhas)`}
        </button>
      )}
    </div>
  );
}
