/**
 * CUSTO POR TAREFA, somado ao longo dos jobs de um projeto (T-060).
 *
 * POR QUE ISTO EXISTE. Para descobrir que a T-030 do banco-imobiliario custou US$ 12,90 foi
 * preciso abrir cinco JSONs de job à mão, cruzar com o histórico do git e ler as Notas de cinco
 * ciclos de retrabalho. A fábrica não sabia dizer quanto uma tarefa custou, nem que fatia disso
 * foi retrabalho — e o que não é medido não é otimizado. A Fase 4 inteira só existiu porque o
 * usuário estranhou uma fatura; ele não deveria ter precisado estranhar.
 *
 * A REGRA QUE MANDA AQUI: custo nunca aparece sozinho, sempre ao lado do que foi ENTREGUE. A
 * armadilha está registrada em `painel/CLAUDE.md` — *execução que não faz nada é sempre a mais
 * barata* —, então uma coluna de custo sem coluna de entrega premiaria a rodada que não fez
 * nada. É por isso que `concluiu` viaja junto do começo ao fim.
 *
 * HISTÓRICO. `custoPorTarefa` passou a ser gravado pelo motor na T-060; jobs anteriores não o
 * têm. Para eles há um rateio explícito e ADMITIDO (ver `ratear`), nunca silencioso: o campo
 * `exato` desce até a UI, que rotula com `~` pela convenção da casa.
 */
import type { Job } from "./tipos";

/** Uma tarefa, com o que ela custou somado em todos os jobs que a tocaram. */
export interface CustoDaTarefa {
  tarefa: string;
  usd: number;
  despachos: number;
  retrabalhoUsd: number;
  retrabalhoDespachos: number;
  /** Naturezas de reprovação vistas, em ordem de ocorrência, sem repetir vizinhas. */
  naturezas: string[];
  /** Concluiu em alguma das rodadas — o denominador honesto. */
  concluiu: boolean;
  /**
   * O valor veio da contabilidade do motor (`true`) ou de rateio sobre o total do job
   * (`false`). Rateado nunca se apresenta como medido.
   */
  exato: boolean;
}

/** Forma da contabilidade que o motor grava em `job.resultado.custoPorTarefa`. */
interface CustoGravado {
  tarefa?: unknown;
  custoUsd?: unknown;
  despachos?: unknown;
  retrabalhoUsd?: unknown;
  retrabalhoDespachos?: unknown;
  naturezas?: unknown;
  concluiu?: unknown;
}

interface ResultadoPipeline {
  custoPorTarefa?: unknown;
  custoEstimadoUsd?: unknown;
  tarefasConcluidas?: unknown;
  despachos?: unknown;
  etapasFalhas?: unknown;
  paraReplanejar?: unknown;
  bloqueadas?: unknown;
}

function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function textos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Tarefas que um job SEM contabilidade tocou, para o rateio.
 *
 * As QUATRO pontas em que o relatório antigo nomeia tarefa que consumiu despacho: concluiu,
 * etapa falhou, esgotou os ciclos (replanejada) ou bloqueou. Usar só as duas primeiras — que foi
 * a versão inicial — subestimou a T-030 em mais da metade (~$5,09 contra os US$ 12,90 medidos à
 * mão), porque o job do replanejamento a registra em `paraReplanejar` e em nenhuma das outras.
 * Errar para BAIXO é o lado ruim aqui: esconde desperdício na única tela feita para expô-lo.
 *
 * `saneadas` fica FORA de propósito: sanear é escrever status, não despachar agente — atribuir
 * custo a isso inventaria gasto onde não houve.
 *
 * Job que não nomeia tarefa nenhuma fica de fora: melhor não atribuir do que atribuir errado.
 */
function tarefasTocadas(r: ResultadoPipeline): string[] {
  const falhas = Array.isArray(r.etapasFalhas)
    ? r.etapasFalhas
        .map((e) => (e as { tarefa?: unknown }).tarefa)
        .filter((t): t is string => typeof t === "string")
    : [];
  return [
    ...new Set([
      ...textos(r.tarefasConcluidas),
      ...falhas,
      ...textos(r.paraReplanejar),
      ...textos(r.bloqueadas),
    ]),
  ];
}

/**
 * Rateio para jobs anteriores à T-060: o custo do job dividido igualmente entre as tarefas que
 * ele nomeia.
 *
 * É grosseiro de propósito, e por isso vem marcado `exato: false`. Dividir por despacho seria
 * igualmente arbitrário (um despacho de `opus` em retrabalho custa múltiplos de um de `haiku`) e
 * daria a impressão falsa de precisão. O rateio existe porque a alternativa — não mostrar nada
 * do que já aconteceu — apagaria justamente a evidência que motivou a fase. **Retrabalho não é
 * rateado**: sem o rótulo por despacho não há como saber, e inventar zero seria mentir para
 * baixo exatamente na coluna que a fase quer vigiar.
 */
function ratear(r: ResultadoPipeline, alvo: Map<string, CustoDaTarefa>): void {
  const total = numero(r.custoEstimadoUsd);
  const tarefas = tarefasTocadas(r);
  if (total === null || total === 0 || tarefas.length === 0) return;

  const fatia = total / tarefas.length;
  const concluidas = new Set(textos(r.tarefasConcluidas));
  for (const t of tarefas) {
    const atual = entrada(alvo, t);
    atual.usd += fatia;
    atual.exato = false;
    if (concluidas.has(t)) atual.concluiu = true;
  }
}

function entrada(mapa: Map<string, CustoDaTarefa>, tarefa: string): CustoDaTarefa {
  const existente = mapa.get(tarefa);
  if (existente !== undefined) return existente;
  const nova: CustoDaTarefa = {
    tarefa,
    usd: 0,
    despachos: 0,
    retrabalhoUsd: 0,
    retrabalhoDespachos: 0,
    naturezas: [],
    concluiu: false,
    exato: true,
  };
  mapa.set(tarefa, nova);
  return nova;
}

/**
 * Soma a contabilidade de todos os jobs de pipeline recebidos, por tarefa.
 *
 * Recebe os jobs JÁ filtrados pelo projeto (`jobsDoProjeto`) — filtrar aqui de novo duplicaria
 * a regra de escopo, que é justamente o tipo de invariante que se perde quando mora em dois
 * lugares.
 */
export function custoPorTarefa(jobs: readonly Job[]): CustoDaTarefa[] {
  const mapa = new Map<string, CustoDaTarefa>();

  for (const job of jobs) {
    const r = (job.resultado ?? null) as ResultadoPipeline | null;
    if (r === null || typeof r !== "object") continue;

    const gravado = Array.isArray(r.custoPorTarefa) ? (r.custoPorTarefa as CustoGravado[]) : null;
    if (gravado === null || gravado.length === 0) {
      ratear(r, mapa);
      continue;
    }

    for (const c of gravado) {
      if (typeof c.tarefa !== "string" || c.tarefa === "") continue;
      const atual = entrada(mapa, c.tarefa);
      atual.usd += numero(c.custoUsd) ?? 0;
      atual.despachos += numero(c.despachos) ?? 0;
      atual.retrabalhoUsd += numero(c.retrabalhoUsd) ?? 0;
      atual.retrabalhoDespachos += numero(c.retrabalhoDespachos) ?? 0;
      if (c.concluiu === true) atual.concluiu = true;
      for (const n of textos(c.naturezas)) {
        if (atual.naturezas.at(-1) !== n) atual.naturezas.push(n);
      }
    }
  }

  return [...mapa.values()].sort((a, b) => b.usd - a.usd);
}

/** Retrato do projeto: as duas réguas da Fase 4, mais o que sustenta a leitura delas. */
export interface RetratoDeCusto {
  tarefas: CustoDaTarefa[];
  totalUsd: number;
  retrabalhoUsd: number;
  /** Quantas tarefas realmente concluíram — o denominador. */
  concluidas: number;
  /**
   * Custo médio por tarefa CONCLUÍDA. `null` quando nada concluiu: dividir por zero entrega
   * `Infinity`, e mostrar "média" de uma rodada que não entregou nada é pior que não mostrar.
   */
  medioPorConcluidaUsd: number | null;
  /** Fração do gasto que foi retrabalho, de 0 a 1. `null` sem gasto. */
  fatiaRetrabalho: number | null;
  /** Algum valor é rateado — o total é aproximado. */
  temRateio: boolean;
}

export function retratoDeCusto(jobs: readonly Job[]): RetratoDeCusto {
  const tarefas = custoPorTarefa(jobs);
  const totalUsd = tarefas.reduce((s, t) => s + t.usd, 0);
  const retrabalhoUsd = tarefas.reduce((s, t) => s + t.retrabalhoUsd, 0);
  const concluidas = tarefas.filter((t) => t.concluiu).length;

  return {
    tarefas,
    totalUsd,
    retrabalhoUsd,
    concluidas,
    medioPorConcluidaUsd: concluidas > 0 ? totalUsd / concluidas : null,
    fatiaRetrabalho: totalUsd > 0 ? retrabalhoUsd / totalUsd : null,
    temRateio: tarefas.some((t) => !t.exato),
  };
}
