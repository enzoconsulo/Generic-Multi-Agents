import type { AnaliseEstruturada } from "../../lib/tipos";

/**
 * Análise do projeto em painel visual (T-041).
 *
 * Pedido do usuário: *"não é minha intenção ficar lendo textos extensos .md para entender
 * o projeto"*. O conteúdo da análise sempre foi bom; o formato é que exigia leitura linear
 * de uma página inteira. Aqui a mesma informação vira blocos que se leem de relance —
 * o que faz, de que peças é feito, como corre, e onde doer.
 *
 * O `.md` continua existindo e acessível: é o que se lê fora do painel.
 */
export function PainelAnalise({ analise }: { analise: AnaliseEstruturada }) {
  const temAlgo =
    analise.oQueFaz !== "" ||
    analise.pecas.length > 0 ||
    analise.fluxo.length > 0 ||
    analise.atencao.length > 0;
  if (!temAlgo) return null;

  return (
    <div className="analise-painel">
      {analise.oQueFaz !== "" && (
        <div className="analise-destaque">
          <span className="analise-rot">O que faz</span>
          <p className="analise-oquefaz">{analise.oQueFaz}</p>
          {analise.stack.length > 0 && (
            <ul className="analise-stack">
              {analise.stack.map((s) => (
                <li key={s} className="analise-chip">
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="analise-colunas">
        {analise.pecas.length > 0 && (
          <div className="analise-bloco">
            <span className="analise-rot">Peças</span>
            <ul className="analise-pecas">
              {analise.pecas.map((p) => (
                <li key={p.nome} className="analise-peca">
                  <code className="analise-peca-nome">{p.nome}</code>
                  {p.papel !== "" && <span className="analise-peca-papel">{p.papel}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {analise.atencao.length > 0 && (
          <div className="analise-bloco">
            <span className="analise-rot">Pontos de atenção</span>
            <ul className="analise-atencao">
              {/* Ordenado por gravidade: o que dói mais primeiro, senão a lista vira
                  inventário e o usuário lê tudo de novo para achar o que importa. */}
              {[...analise.atencao]
                .sort((a, b) => peso(b.gravidade) - peso(a.gravidade))
                .map((a, i) => (
                  <li key={i} className={`analise-item grav-${a.gravidade}`}>
                    <span className="analise-marca" aria-hidden="true">
                      {a.gravidade === "alta" ? "▲" : a.gravidade === "media" ? "■" : "▪"}
                    </span>
                    {a.texto}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>

      {analise.fluxo.length > 0 && (
        <div className="analise-bloco">
          <span className="analise-rot">Fluxo de execução</span>
          <ol className="analise-fluxo">
            {analise.fluxo.map((passo, i) => (
              <li key={i} className="analise-passo">
                <span className="analise-passo-n" aria-hidden="true">
                  {i + 1}
                </span>
                {passo}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function peso(g: AnaliseEstruturada["atencao"][number]["gravidade"]): number {
  return g === "alta" ? 3 : g === "media" ? 2 : 1;
}
