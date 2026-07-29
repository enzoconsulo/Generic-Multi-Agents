import { useState } from "react";
import type { AcaoProjetoCatalogo } from "../lib/tipos";

/**
 * "O que isso faz?" — o toggle ao lado do botão (T-040).
 *
 * Pedido do usuário: saber, ANTES de clicar, o que a ação faz, o que ela escreve e quanto
 * tende a custar. Antes o cartão só tinha uma frase e um selo `leve/médio/pesado`, que só
 * significa algo para quem conhece a tabela interna do painel.
 *
 * A informação que muda a decisão é `escreve`: separa "isso só me conta uma coisa" de
 * "isso altera meu projeto". Sem ela, toda ação parece igualmente arriscada.
 */
export function ExplicaAcao({
  acao,
  custoReal,
  custoEstimado,
}: {
  acao: AcaoProjetoCatalogo;
  /** Custo da última execução DESTA ação NESTE projeto; null = nunca rodou aqui. */
  custoReal: number | null;
  /** Estimativa qualitativa, usada enquanto não há execução real. */
  custoEstimado: string;
}) {
  const [aberto, setAberto] = useState(false);
  const soLe = acao.escreve.length === 0;

  return (
    <div className="explica">
      <button
        type="button"
        className="explica-gatilho"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
      >
        {aberto ? "▾" : "▸"} o que isso faz?
      </button>

      {aberto && (
        <div className="explica-caixa" role="note">
          {/* O `resumo` NÃO se repete aqui: ele já está no card, dois centímetros acima.
              Repetir empurra para baixo a informação nova, que é o que a caixa existe
              para dar. */}
          <div className="explica-campo">
            <span className="explica-rot">Escreve no disco</span>
            {soLe ? (
              <span className="explica-so-le">nada — só lê e relata</span>
            ) : (
              <ul className="explica-lista">
                {acao.escreve.map((caminho) => (
                  <li key={caminho}>
                    <code>{caminho}</code>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="explica-campo">
            <span className="explica-rot">Custo</span>
            {custoReal !== null ? (
              // O que aconteceu nesta máquina, neste projeto — vale mais que a tabela.
              <span className="explica-custo">
                ~${custoReal.toFixed(2)} <span className="texto-suave">na última vez aqui</span>
              </span>
            ) : (
              <span className="explica-custo texto-suave">
                {custoEstimado} — estimativa; nunca rodou neste projeto
              </span>
            )}
          </div>

          <div className="explica-campo">
            <span className="explica-rot">Quem executa</span>
            <code>{acao.agente}</code>
          </div>
        </div>
      )}
    </div>
  );
}

/** Selo curto ao lado do título: separa ação que ALTERA de ação que só lê. */
export function SeloEscrita({ acao }: { acao: AcaoProjetoCatalogo }) {
  const soLe = acao.escreve.length === 0;
  return (
    <span
      className={`badge ${soLe ? "selo-le" : "selo-escreve"}`}
      title={soLe ? "Só lê e relata — não altera nada" : `Altera: ${acao.escreve.join(", ")}`}
    >
      {soLe ? "só lê" : "altera arquivos"}
    </span>
  );
}
