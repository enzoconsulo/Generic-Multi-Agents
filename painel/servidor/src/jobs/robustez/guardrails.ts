/**
 * Guardrails por tipo de ação (T-019): tetos que impedem um fluxo de girar sem fim.
 * Data-driven, no mesmo espírito das estratégias de modelo (`config.ts`) e do peso das
 * ações (`catalogo-acoes.ts`): para ajustar, edite SÓ a tabela abaixo.
 *
 * `maxTurns` vai para as options do SDK (o runner já lê `params.maxTurns`).
 * `maxBudgetUsd` é INFORMACIONAL: a assinatura não cobra por chamada, então não há o que
 * cortar — serve para a UI avisar. Fica `null` (sem teto) por default, de propósito.
 */

export interface Guardrails {
  maxTurns: number;
  maxBudgetUsd: number | null;
  /** Silêncio tolerado pelo watchdog neste tipo de fluxo (ms). */
  watchdogMs: number;
}

const MINUTO = 60_000;

/** Teto para quem não tem entrada própria (ação nova nasce protegida, não ilimitada). */
export const GUARDRAILS_PADRAO: Guardrails = {
  maxTurns: 80,
  maxBudgetUsd: null,
  watchdogMs: 15 * MINUTO,
};

/**
 * Só o que difere do padrão. `/trabalhar` roda o pipeline inteiro (executor → testador →
 * revisor, várias tarefas) e precisa de teto alto e paciência maior; `/status` é leve e
 * um silêncio longo ali já é sintoma.
 */
const POR_ACAO: Readonly<Record<string, Partial<Guardrails>>> = {
  trabalhar: { maxTurns: 200, watchdogMs: 20 * MINUTO },
  "novo-projeto": { maxTurns: 150 },
  manutencao: { maxTurns: 120 },
  "encerrar-dia": { maxTurns: 100 },
  ideia: { maxTurns: 100 },
  status: { maxTurns: 40, watchdogMs: 10 * MINUTO },
  /** Análise não é um dos 6 comandos, mas é um fluxo Claude e também merece teto. */
  analisar: { maxTurns: 100 },
};

/** Guardrails efetivos de uma ação (padrão + ajustes da tabela). */
export function guardrailsParaAcao(idAcao: string): Guardrails {
  return { ...GUARDRAILS_PADRAO, ...(POR_ACAO[idAcao] ?? {}) };
}
