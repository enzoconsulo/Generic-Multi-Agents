/**
 * Guardrails por tipo de ação (T-019): tetos que impedem um fluxo de girar sem fim.
 * Data-driven, no mesmo espírito das estratégias de modelo (`config.ts`) e do peso das
 * ações (`catalogo-acoes.ts`): para ajustar, edite SÓ a tabela abaixo.
 *
 * `maxTurns` vai para as options do SDK (o runner já lê `params.maxTurns`).
 *
 * `maxBudgetUsd` DEIXOU DE SER INFORMACIONAL (01/08). O comentário antigo dizia "a
 * assinatura não cobra por chamada, então não há o que cortar" — e isso estava errado por
 * confundir fatura com recurso escasso. **O que acaba é a COTA**, e o custo estimado é o
 * melhor proxy dela que existe aqui. O histórico decidiu a questão: dos 55 jobs já rodados,
 * **10 falharam e os 10 falharam por cota**, nenhum por bug.
 *
 * `maxTurns` não substituía isso, e o histórico também prova: ele limita só o laço do
 * orquestrador, enquanto `num_turns` é somado entre os `result` inclusive dos subagentes —
 * jobs somaram 211 e 212 voltas com o teto configurado em 120.
 *
 * Hoje o valor vai para `params.tetoUsd` e o runner o aplica com parada limpa
 * (`pipeline/orcamento.ts`). Há teste travando esse consumo: campo de tabela data-driven
 * que ninguém lê é a armadilha da casa (`watchdogMs` existiu assim desde a T-019).
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
  /**
   * Teto de custo do job em US$ (proxy da cota). `null` = sem teto.
   *
   * Vira `params.tetoUsd`; o runner para LIMPO ao atingi-lo — nunca cortando agente em voo,
   * e recusando COMEÇAR tarefa que não caberia. Calibrado nos jobs reais: um ciclo completo
   * de tarefa (construtor + verificador + revisor) custou ~US$ 2,14 no banco-imobiliario.
   */
  maxBudgetUsd: number | null;
  /** Silêncio tolerado pelo watchdog neste tipo de fluxo (ms). */
  watchdogMs: number;
}

const MINUTO = 60_000;

/** Teto para quem não tem entrada própria (ação nova nasce protegida, não ilimitada). */
export const GUARDRAILS_PADRAO: Guardrails = {
  maxTurns: 80,
  // Uma ação de agente único não deveria passar disto. Ação nova nasce protegida — o
  // default anterior era `null`, e "ilimitado por omissão" foi o que produziu os 10 jobs
  // mortos por cota.
  maxBudgetUsd: 3,
  watchdogMs: 15 * MINUTO,
};

/**
 * Só o que difere do padrão. `/trabalhar` roda o pipeline inteiro (executor → testador →
 * revisor, várias tarefas) e precisa de teto alto e paciência maior; `/status` é leve e
 * um silêncio longo ali já é sintoma.
 */
const POR_ACAO: Readonly<Record<string, Partial<Guardrails>>> = {
  /**
   * US$ 8 ≈ 3 a 4 ciclos completos de tarefa pela medição atual (~US$ 2,14 cada). É o único
   * fluxo que roda o pipeline inteiro, então é o único que precisa de folga para VÁRIAS
   * tarefas — e mesmo assim com teto: as rodadas de 30/07 e 01/08 gastaram US$ 7,45 e
   * US$ 6,55 SEM teto e morreram na parede da cota, deixando tarefa pela metade.
   */
  trabalhar: { maxTurns: 200, watchdogMs: 20 * MINUTO, maxBudgetUsd: 8 },
  /**
   * Planejar um projeto inteiro: especificação, plano, equipe e ~20 tarefas. É
   * estritamente MAIS trabalho que um `/ideia` (medido em até US$ 4,61), então um teto
   * menor que o do `/ideia` seria incoerente. US$ 8. O `/novo-projeto banco-imobiliario`
   * que fechou com US$ 0,57 não é contraexemplo — é o que terminou com 9 das 22 tarefas
   * nunca escritas, e é justamente o desfecho que um teto apertado produz de novo.
   */
  "novo-projeto": { maxTurns: 150, maxBudgetUsd: 8 },
  manutencao: { maxTurns: 120, maxBudgetUsd: 3 },
  "encerrar-dia": { maxTurns: 100, maxBudgetUsd: 2 },
  /**
   * US$ 6, e o número é MEDIDO (16/08), não estimado. `/ideia` é o "Pedir funcionalidade" —
   * o fluxo que o usuário mais dispara — e ele não é leve: registra a ideia, LÊ o projeto e
   * despacha o planejador, que reescreve plano e escreve as tarefas. Os 5 jobs com
   * contabilidade final custaram US$ 0,62 · 1,87 · 2,99 · 3,29 · 4,61.
   *
   * Ou seja: **o teto anterior de US$ 3 ficava abaixo da mediana do próprio trabalho.** Ele
   * nunca chegou a cortar ninguém — nenhum dos 108 jobs em `dados/jobs/` encerrou por
   * `teto-custo` — porque o medidor ao vivo lê mais baixo que o `total_cost_usd` final. Isso
   * é sorte, não projeto: no dia em que o medidor apertar, US$ 3 passa a cortar `/ideia` no
   * meio do planejador, e tarefa pela metade é o desperdício mais caro que existe aqui.
   * Um teto tem de ser maior que o trabalho que ele protege; senão não é freio, é tesoura.
   */
  ideia: { maxTurns: 100, maxBudgetUsd: 6 },
  // /status é leitura e sumarização — mecânico pela mesma régua.
  status: { maxTurns: 40, watchdogMs: 10 * MINUTO, esforco: "medium", maxBudgetUsd: 1 },
  /** Análise não é um dos 6 comandos, mas é um fluxo Claude e também merece teto. */
  analisar: { maxTurns: 100, maxBudgetUsd: 4 },

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
  "projeto:replanejar": { maxTurns: 120, maxBudgetUsd: 4 }, // reescreve plano e tarefas
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
  "projeto:marco": { maxTurns: 100, watchdogMs: 20 * MINUTO, maxBudgetUsd: 4 },
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
