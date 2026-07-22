/**
 * Modelo de job do painel (T-007). Estados e modelo de concorrência decididos em
 * _gestao/DECISOES.md (2026-07-21): escopo `global` é exclusivo total; `projeto:<nome>`
 * é exclusivo por projeto; jobs com `usaClaude` contam no teto de execuções Claude
 * simultâneas (config.tetoJobsClaude), jobs não-Claude contam só no lock de projeto.
 */

export const ESTADOS_JOB = [
  "na-fila",
  "executando",
  "aguardando-input",
  "concluido",
  "falhou",
  "cancelado",
  "interrompido",
] as const;

export type EstadoJob = (typeof ESTADOS_JOB)[number];

/** Estados finais: o job nunca sai deles. */
export const ESTADOS_TERMINAIS: ReadonlySet<EstadoJob> = new Set<EstadoJob>([
  "concluido",
  "falhou",
  "cancelado",
  "interrompido",
]);

/** Estados em que um pedido de cancelamento é aceito. */
export const ESTADOS_CANCELAVEIS: ReadonlySet<EstadoJob> = new Set<EstadoJob>([
  "na-fila",
  "executando",
  "aguardando-input",
]);

/** Escopo de lock: `global` (exclusivo total) ou `projeto:<nome>` (exclusivo por projeto). */
export type EscopoLock = "global" | `projeto:${string}`;

export interface Job {
  /** Identificador curto e único (8 hex). */
  id: string;
  /** Tipo do job — decide qual Runner executa (ex.: "fake"; "claude" chega na T-008). */
  tipo: string;
  /** Título em PT-BR exibido na UI. */
  titulo: string;
  escopo: EscopoLock;
  /** Conta no teto de execuções Claude simultâneas? (CI futuro será false.) */
  usaClaude: boolean;
  /** Prompt e demais parâmetros específicos do tipo de job. */
  params: Record<string, unknown>;
  estado: EstadoJob;
  criadoEm: string;
  iniciadoEm?: string;
  terminadoEm?: string;
  /** Presente quando `estado === "concluido"` (valor retornado pelo runner). */
  resultado?: unknown;
  /** Mensagem em PT-BR quando `falhou`/`interrompido`. */
  erro?: string;
}

/**
 * Evento interno de job — vai para o EventEmitter do gerenciador (canal único;
 * a T-009 pluga o SSE nele). `tipo === "estado"` são as transições emitidas pelo
 * próprio gerenciador; os demais tipos são livres para os runners (ex.: "log").
 */
export interface EventoJob {
  jobId: string;
  tipo: string;
  dados?: unknown;
  em: string;
}

/** Transição de estado transportada em `EventoJob.dados` quando `tipo === "estado"`. */
export interface DadosTransicao {
  de: EstadoJob | null;
  para: EstadoJob;
  /** Snapshot do job no momento da transição. */
  job: Job;
}

/** O que o gerenciador entrega ao runner durante a execução. */
export interface ContextoExecucao {
  /** Emite um evento de progresso do job (aparece no canal único com o jobId certo). */
  emitir(tipo: string, dados?: unknown): void;
  /** Acionado quando o usuário cancela o job — o runner deve encerrar o quanto antes. */
  sinal: AbortSignal;
}

/**
 * Runner plugável: executa um job do seu tipo. Resolve com o resultado (job
 * `concluido`), lança para falha (job `falhou`). Se o cancelamento foi pedido,
 * o estado final é `cancelado` independentemente de como o runner terminar.
 */
export interface Runner {
  executar(job: Job, contexto: ContextoExecucao): Promise<unknown>;
}
