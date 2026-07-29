/**
 * Guardrails por tipo de ação (T-019): tetos que impedem um fluxo de girar sem fim.
 * Data-driven, no mesmo espírito das estratégias de modelo (`config.ts`) e do peso das
 * ações (`catalogo-acoes.ts`): para ajustar, edite SÓ a tabela abaixo.
 *
 * `maxTurns` vai para as options do SDK (o runner já lê `params.maxTurns`).
 * `maxBudgetUsd` é INFORMACIONAL: a assinatura não cobra por chamada, então não há o que
 * cortar — serve para a UI avisar. Fica `null` (sem teto) por default, de propósito.
 */

/**
 * Profundidade de raciocínio do fluxo. Ausente = o padrão do modelo (`high`).
 *
 * O tipo sai da lista, e não o contrário, porque o runner precisa VALIDAR em tempo de
 * execução (o job atravessa o disco em `dados/` antes de chegar ao SDK). Com duas listas
 * — uma no tipo, outra na validação — acrescentar um nível aqui passaria pelo compilador
 * e seria descartado calado lá.
 */
export const ESFORCOS = ["low", "medium", "high"] as const;
export type Esforco = (typeof ESFORCOS)[number];

/** Guarda de tipo para o valor que volta do disco. */
export function ehEsforco(valor: unknown): valor is Esforco {
  return typeof valor === "string" && (ESFORCOS as readonly string[]).includes(valor);
}

export interface Guardrails {
  maxTurns: number;
  /**
   * `effort` do SDK. Ausente = padrão do modelo.
   *
   * A régua NÃO é "a ação parece simples", é **o que a ação precisa DESCOBRIR**. Medido
   * na T-042, com a mesma entrada nas duas pernas: em `projeto:progresso` — redigir o que
   * já aconteceu — `medium` entregou trabalho equivalente por metade do preço; em
   * `projeto:conferir` — procurar desvio que ninguém viu — `medium` simplesmente não
   * achou o problema e devolveu 74% de "economia" sem ter feito nada.
   *
   * Por isso, ao rebaixar uma ação, compare o TRABALHO ENTREGUE, nunca só a fatura:
   * execução que não faz nada é sempre a mais barata.
   */
  esforco?: Esforco;
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
  // /status é leitura e sumarização — mecânico pela mesma régua.
  status: { maxTurns: 40, watchdogMs: 10 * MINUTO, esforco: "medium" },
  /** Análise não é um dos 6 comandos, mas é um fluxo Claude e também merece teto. */
  analisar: { maxTurns: 100 },

  /**
   * Ações de agente por projeto (T-033), com a chave prefixada `projeto:<id>` para não
   * colidir com um comando de mesmo nome. Tetos menores que os dos comandos globais de
   * propósito: cada uma despacha UM especialista para UM projeto, então um fluxo que
   * passa de ~80 turnos aí não está trabalhando, está girando.
   */
  "projeto:documentar": { maxTurns: 80 },
  "projeto:pesquisar": { maxTurns: 60, watchdogMs: 20 * MINUTO }, // espera de rede é normal aqui
  "projeto:revisar": { maxTurns: 80 },
  "projeto:testar": { maxTurns: 80, watchdogMs: 20 * MINUTO }, // suíte longa é silêncio legítimo
  "projeto:replanejar": { maxTurns: 120 }, // reescreve plano e tarefas: mais fôlego
  /** T-034 — escopo de um projeto, então bem abaixo dos comandos globais equivalentes. */
  /**
   * Fica no PADRÃO, e isso foi medido (T-042), não suposto. Rodando a MESMA entrada duas
   * vezes, o padrão achou o PROGRESSO.md fora de sincronia com o marco da Fase 1 e
   * corrigiu (commit, +11 linhas); em `medium` a ação não achou nada e terminou sem
   * entregar. Os "−74% de custo" eram uma execução que não fez o trabalho. Conferir
   * integridade é procurar desvio que ninguém viu — a última coisa a fazer com pressa.
   */
  "projeto:conferir": { maxTurns: 80 },
  /** Marco roda software de verdade e ainda promove tarefas: silêncio longo é legítimo. */
  "projeto:marco": { maxTurns: 100, watchdogMs: 20 * MINUTO },
  /**
   * Aqui `medium` se pagou: mesma entrada, trabalho equivalente (commit de +33 linhas
   * contra +40 do padrão) por metade do custo e 2,6× mais rápido. Consolidar um
   * PROGRESSO.md é redigir o que já aconteceu, não descobrir nada.
   */
  "projeto:progresso": { maxTurns: 60, esforco: "medium" },
  /** T-035 — ler o projeto e sintetizar os especialistas. */
  "projeto:recriar-equipe": { maxTurns: 80 },
};

/** Guardrails efetivos de uma ação (padrão + ajustes da tabela). */
export function guardrailsParaAcao(idAcao: string): Guardrails {
  return { ...GUARDRAILS_PADRAO, ...(POR_ACAO[idAcao] ?? {}) };
}
