/**
 * QUANTO ESTA RODADA TENDE A CUSTAR — a estimativa que aparece ANTES do disparo (21/08).
 *
 * POR QUE ISTO EXISTE. O cartão de "Trabalhar neste projeto" mostrava a palavra "Alto", de
 * uma tabela de peso × modelo. Isso não é uma estimativa: não sai de execução nenhuma, não
 * conhece o projeto e não ajuda a escolher teto. E no painel **não existe disparo a seco** —
 * `POST /api/acoes/:id` já executa —, então o único momento em que o número muda uma decisão
 * é antes do clique.
 *
 * A MEDIÇÃO QUE ORIGINOU ISTO (47 jobs de pipeline, 21/08): a fábrica gastou US$ 179,48 em
 * 26 tarefas concluídas. O número que prevê a fatura é essa razão — US$ 6,90 por tarefa
 * ENTREGUE —, não o custo de uma tarefa que fecha (mediana US$ 2,08): a diferença é
 * retrabalho (46% do gasto) e trabalho pago em tarefa que não fechou naquela rodada. Estimar
 * pela mediana daria um número bonito e sempre otimista, que é a pior espécie de estimativa.
 *
 * O que a mesma medição DESMENTIU, e por isso não está aqui: não existe "custo fixo de
 * abertura de rodada". Saneamento, promoção e leitura de plano são código puro; o único job
 * com zero despachos gastou US$ 0,00. Parar no teto e redisparar não cobra pedágio.
 */
import { custoPorTarefa } from "./custo-tarefas";
import { mapaDependencias, tarefasPromoviveis } from "./gestao";
import type { Job, TarefaCompleta } from "./tipos";

/**
 * Custo por tarefa entregue quando o projeto ainda não tem histórico, em US$.
 *
 * Medido na fábrica inteira em 21/08 (US$ 179,48 / 26 tarefas). É grosso de propósito: o
 * primeiro disparo num projeto novo não tem como saber, e errar para o CARO faz o usuário
 * escolher um teto folgado, enquanto errar para o barato o faz descobrir o custo no extrato.
 */
export const CUSTO_POR_TAREFA_PADRAO_USD = 6.9;

/** Status em que a tarefa já está em circulação — o motor a despacha nesta rodada. */
const EM_CIRCULACAO = new Set(["pronta", "em-execucao", "em-teste", "em-revisao"]);

export interface EstimativaRodada {
  /** Custo esperado por tarefa ENTREGUE, em US$. */
  porTarefaUsd: number;
  /** De onde saiu o número: medição deste projeto ou o padrão da fábrica. */
  base: "projeto" | "fabrica";
  /** Tarefas concluídas que formaram a média (0 quando `base` é "fabrica"). */
  amostra: number;
  /** Algum custo da amostra é rateado (jobs anteriores à contabilidade por tarefa). */
  exato: boolean;
  /** Tarefas que o motor pode despachar nesta rodada (em circulação + promovíveis). */
  despachaveis: number;
  /** Quantas tarefas cabem no teto; `null` quando não há teto. */
  cabemNoTeto: number | null;
  /** Tarefas que a rodada tende a entregar: o menor entre despacháveis e o que cabe. */
  tarefasPrevistas: number;
  /** Gasto previsto da rodada, em US$. */
  totalUsd: number;
  /** O teto corta antes de o trabalho despachável acabar. */
  paraNoTeto: boolean;
}

/**
 * Estimativa da próxima rodada de `/trabalhar` neste projeto.
 *
 * `jobs` deve vir já filtrado pelo projeto (`jobsDoProjeto`) — a média de outro projeto não
 * diz nada sobre este, e misturar seria pior que usar o padrão da fábrica, porque pareceria
 * medido.
 */
export function estimarRodada(
  jobs: readonly Job[],
  tarefas: readonly TarefaCompleta[],
  tetoUsd: number | null,
): EstimativaRodada {
  const medido = custoPorTarefa(jobs);
  const concluidas = medido.filter((t) => t.concluiu);
  const gasto = medido.reduce((s, t) => s + t.usd, 0);

  // O denominador é a tarefa ENTREGUE e o numerador é TODO o gasto — inclusive o das tarefas
  // que não fecharam. É o que a rodada seguinte vai pagar de novo, então é o que prevê.
  const temMedicao = concluidas.length > 0 && gasto > 0;
  const porTarefaUsd = temMedicao ? gasto / concluidas.length : CUSTO_POR_TAREFA_PADRAO_USD;

  const lista = [...tarefas];
  const emCirculacao = lista.filter((t) => EM_CIRCULACAO.has(t.status)).length;
  const promoviveis = tarefasPromoviveis(lista, mapaDependencias(lista)).length;
  const despachaveis = emCirculacao + promoviveis;

  const cabemNoTeto =
    tetoUsd === null || porTarefaUsd <= 0 ? null : Math.floor(tetoUsd / porTarefaUsd);
  const tarefasPrevistas =
    cabemNoTeto === null ? despachaveis : Math.min(despachaveis, cabemNoTeto);

  return {
    porTarefaUsd,
    base: temMedicao ? "projeto" : "fabrica",
    amostra: temMedicao ? concluidas.length : 0,
    exato: medido.every((t) => t.exato),
    despachaveis,
    cabemNoTeto,
    tarefasPrevistas,
    totalUsd: porTarefaUsd * tarefasPrevistas,
    paraNoTeto: cabemNoTeto !== null && despachaveis > cabemNoTeto,
  };
}

/**
 * Frase da estimativa, pronta para a tela.
 *
 * O `~` é a convenção da casa para valor aproximado, e ele aparece SEMPRE: mesmo com
 * medição do projeto, isto é uma projeção sobre tarefas que ninguém executou ainda.
 */
export function textoEstimativa(e: EstimativaRodada): string {
  if (e.despachaveis === 0) {
    return "Nada despachável agora — a rodada abre e fecha sem gastar.";
  }
  const origem =
    e.base === "projeto"
      ? `medido neste projeto em ${e.amostra} tarefa(s) entregue(s)`
      : "estimativa da fábrica; este projeto ainda não entregou tarefa";
  const cabeca = `~US$ ${e.totalUsd.toFixed(2)} por ~${e.tarefasPrevistas} tarefa(s), a ~US$ ${e.porTarefaUsd.toFixed(2)} cada (${origem})`;
  if (!e.paraNoTeto) return `${cabeca}.`;
  return (
    `${cabeca}. Há ${e.despachaveis} despachável(is): o teto para a rodada antes de acabar` +
    " o trabalho — parada limpa, e redisparar não cobra nada a mais."
  );
}
