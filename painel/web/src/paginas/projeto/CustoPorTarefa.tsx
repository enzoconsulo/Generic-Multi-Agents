/**
 * CUSTO POR TAREFA E FATIA DE RETRABALHO (T-060).
 *
 * A tela que faltava: até aqui o painel sabia dizer quanto um JOB custou, e uma tarefa
 * atravessa vários jobs. Descobrir que a T-030 do banco-imobiliario custou US$ 12,90 exigiu
 * abrir cinco JSONs à mão.
 *
 * Duas decisões de apresentação que carregam a doutrina da fase:
 * - **custo nunca aparece sozinho.** Cada linha diz se a tarefa CONCLUIU, e o resumo mostra
 *   média por tarefa concluída — porque execução que não faz nada é sempre a mais barata
 *   (armadilha registrada em `painel/CLAUDE.md`), e coluna de custo sem coluna de entrega
 *   premiaria a rodada que não entregou;
 * - **valor rateado não se veste de medido.** Job anterior à T-060 não tem contabilidade por
 *   tarefa; o rateio vem marcado e a UI o prefixa com `~`, mesma convenção de `lib/custo.ts`.
 */
import { retratoDeCusto, type CustoDaTarefa } from "../../lib/custo-tarefas";
import type { Job } from "../../lib/tipos";

/** Rótulos das naturezas de reprovação que `diagnostico.ts` classifica. */
const ROTULO_NATUREZA: Record<string, string> = {
  mecanica: "critério objetivo",
  funcional: "reprovou executando",
  conformidade: "entregou outra coisa",
  defeito: "defeito no diff",
};

function dinheiro(usd: number, aproximado: boolean): string {
  return `${aproximado ? "~" : ""}$${usd.toFixed(2)}`;
}

function porcento(fracao: number): string {
  return `${Math.round(fracao * 100)}%`;
}

function Linha({ c }: { c: CustoDaTarefa }): JSX.Element {
  const fatia = c.usd > 0 ? c.retrabalhoUsd / c.usd : 0;
  return (
    <li className="linha-gestao">
      <span className="linha-gestao-alvo">{c.tarefa}</span>
      <span className="linha-gestao-meta">
        {/* A entrega vem antes do valor, de propósito: é o que dá sentido ao valor. */}
        <span className={c.concluiu ? "dep-info" : "dep-info dep-trava"}>
          {c.concluiu ? "concluída" : "não concluiu"}
        </span>
        <span
          className="dep-info"
          title={
            c.exato
              ? `${c.despachos} despacho(s) de agente nesta tarefa`
              : "Rateado: este job é anterior ao registro de custo por tarefa, então o valor é" +
                " o total do job dividido entre as tarefas que ele nomeia."
          }
        >
          {dinheiro(c.usd, !c.exato)}
        </span>
        {c.retrabalhoUsd > 0 && (
          <span
            className="dep-info dep-trava"
            title={`${c.retrabalhoDespachos} despacho(s) feitos depois de uma reprovação`}
          >
            {porcento(fatia)} em retrabalho
          </span>
        )}
        {c.naturezas.length > 0 && (
          <span className="texto-suave">
            {" "}
            {c.naturezas.map((n) => ROTULO_NATUREZA[n] ?? n).join(" → ")}
          </span>
        )}
      </span>
    </li>
  );
}

export function CustoPorTarefa({ jobs }: { jobs: Job[] }): JSX.Element | null {
  const retrato = retratoDeCusto(jobs);
  // Sem nenhuma tarefa contabilizada não há o que mostrar — e uma seção vazia com "US$ 0,00"
  // afirmaria que nada foi gasto, que é diferente de "nada foi registrado".
  if (retrato.tarefas.length === 0) return null;

  return (
    <section className="secao">
      <h3 className="secao-titulo">Custo por tarefa</h3>
      <p className="texto-suave secao-desc">
        Quanto cada tarefa custou somando todos os jobs que a tocaram, e quanto disso foi
        retrabalho. Retrabalho aqui é despacho feito depois de uma reprovação — fato observado no
        momento do despacho, não estimativa.
      </p>

      <p className="texto-suave bloco-gestao-ajuda">
        {dinheiro(retrato.totalUsd, retrato.temRateio)} no total ·{" "}
        {retrato.concluidas === 0 ? (
          <strong>nenhuma tarefa concluída</strong>
        ) : (
          <>
            {retrato.concluidas} concluída(s) ·{" "}
            {retrato.medioPorConcluidaUsd !== null && (
              <strong>
                {dinheiro(retrato.medioPorConcluidaUsd, retrato.temRateio)} por tarefa concluída
              </strong>
            )}
          </>
        )}
        {retrato.fatiaRetrabalho !== null && retrato.retrabalhoUsd > 0 && (
          <> · {porcento(retrato.fatiaRetrabalho)} do gasto foi retrabalho</>
        )}
        {retrato.temRateio && (
          <>
            {" "}
            · <span title="Jobs anteriores ao registro de custo por tarefa entram rateados.">
              valores com <code>~</code> são rateados
            </span>
          </>
        )}
      </p>

      <ul className="lista-gestao">
        {retrato.tarefas.slice(0, 15).map((c) => (
          <Linha key={c.tarefa} c={c} />
        ))}
      </ul>
    </section>
  );
}
