import { useMemo, useState } from "react";
import { estruturarDocumento } from "../lib/documento";
import { Blocos } from "./Markdown";
import { TextoLongo } from "./TextoLongo";

/**
 * Documento de gestão (ANALISE/DECISOES/PROGRESSO) apresentado por ENTRADAS.
 *
 * Antes, o arquivo inteiro ia para um recorte de 14 linhas do markdown cru — e como os
 * documentos da fábrica começam pelo GABARITO do formato, o que aparecia na tela era
 * `**Decisão:** <o que foi decidido>`: rótulo sem dado. O conteúdo real, que é o que
 * interessa, ficava todo atrás do "Mostrar tudo".
 *
 * Aqui o gabarito vai para um "como este arquivo é organizado" recolhido, e cada seção do
 * documento vira um item com cabeçalho próprio: a estrutura toda se vê de relance e o
 * corpo abre onde a pessoa quiser. A entrada mais recente já vem aberta, porque é a que
 * responde "e aí, como está o projeto?".
 */
export function Documento({ texto }: { texto: string }) {
  const doc = useMemo(() => estruturarDocumento(texto), [texto]);
  const [abertas, setAbertas] = useState<ReadonlySet<number>>(() => new Set([0]));

  // Sem seções não há o que organizar (documento curto, ou fora do formato da fábrica):
  // cai no comportamento antigo, que continua correto para esse caso.
  if (doc.entradas.length === 0) return <TextoLongo texto={texto} />;

  const temGuia = doc.guia.length > 0;
  const datadas = doc.entradas.some((e) => e.data !== null);
  const rotulo = datadas ? "entrada" : "seção";
  const plural = datadas ? "entradas" : "seções";
  const todasAbertas = abertas.size === doc.entradas.length;

  function alternar(i: number) {
    setAbertas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(i)) proximo.delete(i);
      else proximo.add(i);
      return proximo;
    });
  }

  return (
    <div className="doc">
      <div className="doc-barra">
        <span className="texto-suave doc-contagem">
          {doc.entradas.length} {doc.entradas.length === 1 ? rotulo : plural}
          {datadas && doc.entradas[0]?.data !== undefined && doc.entradas[0]?.data !== null && (
            <> · mais recente em {doc.entradas[0].data}</>
          )}
        </span>
        <div className="doc-barra-acoes">
          {temGuia && (
            <details className="doc-guia">
              <summary>Como este arquivo é organizado</summary>
              <div className="doc-guia-corpo">
                <Blocos blocos={doc.guia} />
              </div>
            </details>
          )}
          <button
            type="button"
            className="botao botao-secundario botao-compacto"
            onClick={() =>
              setAbertas(todasAbertas ? new Set() : new Set(doc.entradas.map((_, i) => i)))
            }
          >
            {todasAbertas ? "Fechar todas" : "Abrir todas"}
          </button>
        </div>
      </div>

      <ol className="doc-entradas">
        {doc.entradas.map((entrada, i) => {
          const aberta = abertas.has(i);
          return (
            <li key={i} className={`doc-entrada ${aberta ? "doc-entrada-aberta" : ""}`}>
              <button
                type="button"
                className="doc-cab"
                aria-expanded={aberta}
                onClick={() => alternar(i)}
              >
                <span className="doc-seta" aria-hidden="true">
                  ▸
                </span>
                <span className="doc-cab-texto">
                  <span className="doc-cab-linha">
                    {/* Entrada só datada (PROGRESSO.md): a data É o título — mostrar as
                        duas coisas repetiria o mesmo dado lado a lado. */}
                    {entrada.data !== null && entrada.titulo !== "" && (
                      <span className="doc-data">{entrada.data}</span>
                    )}
                    <span className="doc-titulo">
                      {entrada.titulo !== "" ? entrada.titulo : entrada.data}
                    </span>
                  </span>
                  {!aberta && entrada.previa !== "" && (
                    <span className="doc-previa">{entrada.previa}</span>
                  )}
                </span>
              </button>
              {aberta && (
                <div className="doc-corpo">
                  <Blocos blocos={entrada.blocos} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
