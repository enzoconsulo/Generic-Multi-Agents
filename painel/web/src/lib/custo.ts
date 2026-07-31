import type { Job, ResultadoContabil } from "./tipos";

/**
 * Leitura de custo de um job (T-049) — o ÚNICO ponto da UI que decide o que é "o custo".
 *
 * Existe porque a decisão estava duplicada em três telas e as três estavam erradas do mesmo
 * jeito: liam só `custoUsd`, que o servidor só preenche quando o SDK manda `result`. Job
 * cortado por cota nunca manda `result` — e é o mais caro. Na prática, uma rodada de 40 min
 * com 21 despachos de agente e 5 tarefas concluídas somava US$ 0,00 no total do projeto,
 * enquanto um `/status` de 40 segundos aparecia com US$ 0,32. O painel mostrava exatamente
 * o inverso da realidade.
 *
 * Regra: custo real vence sempre; estimativa entra só onde o real não existe, e SEMPRE
 * carimbada como estimativa até a superfície.
 */
export interface CustoJob {
  usd: number;
  /** `true` = veio da tabela de preços, não do SDK. A UI precisa exibir o "~". */
  estimado: boolean;
  /** Estimativa subestimada (modelo fora da tabela de preços do servidor). */
  incompleto: boolean;
}

const contabil = (job: Job): ResultadoContabil | null =>
  (job.resultado as ResultadoContabil | null | undefined) ?? null;

const finito = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Custo de um job, real ou estimado. `null` só quando não há dado nenhum — que é diferente
 * de "custou zero" e precisa continuar sendo diferente na tela.
 */
export function custoDoJob(job: Job): CustoJob | null {
  const r = contabil(job);
  if (r === null) return null;

  const incompleto = (r.modelosSemPreco?.length ?? 0) > 0;
  if (finito(r.custoUsd)) return { usd: r.custoUsd, estimado: false, incompleto: false };
  if (finito(r.custoEstimadoUsd)) return { usd: r.custoEstimadoUsd, estimado: true, incompleto };
  return null;
}

export interface TotalCusto {
  usd: number;
  /** Quantos jobs entraram na soma. */
  jobs: number;
  /** Algum valor somado é estimativa → o total inteiro vira aproximado. */
  temEstimativa: boolean;
  /** Algum valor está subestimado → o total é um PISO, não um total. */
  temIncompleto: boolean;
  /**
   * Jobs sem custo algum. Não é o mesmo que gasto zero: são execuções cuja contabilidade
   * se perdeu (job antigo, runner que não é Claude). Exibir isto evita repetir o erro
   * original em outra escala — um total que parece fechado e não é.
   */
  semDado: number;
}

/** Soma o custo de uma lista de jobs preservando o que se sabe sobre a qualidade do número. */
export function somarCusto(jobs: Job[]): TotalCusto | null {
  let usd = 0;
  let contados = 0;
  let temEstimativa = false;
  let temIncompleto = false;
  let semDado = 0;

  for (const job of jobs) {
    const c = custoDoJob(job);
    if (c === null) {
      semDado += 1;
      continue;
    }
    usd += c.usd;
    contados += 1;
    if (c.estimado) temEstimativa = true;
    if (c.incompleto) temIncompleto = true;
  }

  if (contados === 0 && semDado === 0) return null;
  return { usd, jobs: contados, temEstimativa, temIncompleto, semDado };
}

/**
 * Formata um custo com o prefixo que declara a sua qualidade:
 *   `$1,2345`   valor real do SDK
 *   `~$1,2345`  estimado pela tabela de preços (erro médio medido: ~6%)
 *   `≥$1,2345`  estimado E subestimado (havia modelo fora da tabela)
 */
export function formatarCusto(c: CustoJob | TotalCusto, casas = 4): string {
  const estimado = "estimado" in c ? c.estimado : c.temEstimativa;
  const incompleto = "incompleto" in c ? c.incompleto : c.temIncompleto;
  const prefixo = incompleto ? "≥" : estimado ? "~" : "";
  return `${prefixo}$${c.usd.toFixed(casas)}`;
}

/** Texto de ajuda (title) coerente com o prefixo — o "~" sozinho não se explica. */
export function explicarCusto(c: CustoJob | TotalCusto): string {
  const estimado = "estimado" in c ? c.estimado : c.temEstimativa;
  const incompleto = "incompleto" in c ? c.incompleto : c.temIncompleto;
  if (incompleto) {
    return (
      "Piso, não total: parte do uso é de um modelo fora da tabela de preços do painel," +
      " então o gasto real é maior."
    );
  }
  if (estimado) {
    return (
      "Estimado a partir dos tokens, porque o fluxo foi cortado antes de o SDK reportar o" +
      " custo (cota, cancelamento ou watchdog). Erro médio medido contra jobs reais: ~6%."
    );
  }
  return "Custo real reportado pelo SDK ao fim do fluxo.";
}
