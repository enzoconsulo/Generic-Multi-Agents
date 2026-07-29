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

/** Tipo de pendência de input (T-010): aprovação de ferramenta ou pergunta ao usuário. */
export type TipoPendencia = "aprovacao-ferramenta" | "pergunta";

/** Descrição de um input necessário (o runner diz o que precisa; textos em PT-BR). */
export interface NovaPendencia {
  tipo: TipoPendencia;
  titulo: string;
  descricao: string;
  /** Opções para escolha (perguntas); ausente = aprovação ou resposta livre. */
  opcoes?: string[];
}

/** Resposta do usuário a uma pendência. */
export interface RespostaInput {
  /** aprovacao-ferramenta: true = allow, false = deny. */
  aprovado?: boolean;
  /** Mensagem opcional repassada ao agente (ex.: motivo da negação). */
  mensagem?: string;
  /** pergunta: opção escolhida ou texto digitado. */
  escolha?: string;
}

/** Pendência de input exposta pela API e persistida no metadado do job (auditoria). */
export interface Pendencia extends NovaPendencia {
  id: string;
  jobId: string;
  criadaEm: string;
  respondidaEm?: string;
  resposta?: RespostaInput;
}

/** Um item do resumo de trecho: o que foi entregue ou o que merece atenção (T-039). */
export interface ItemResumoTrecho {
  tipo: "feito" | "atencao";
  texto: string;
}

/** Resumo de um trecho de agente, gerado por modelo barato (T-039). */
export interface ResumoTrecho {
  /** Índice do trecho dentro do job — casa com a segmentação do console. */
  indice: number;
  agente: string | null;
  linhas: string[];
  itens: ItemResumoTrecho[];
  custoUsd: number | null;
  /** true = não houve resumo utilizável; a UI mostra o texto cru. */
  naoDeu: boolean;
}

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
  /**
   * Resumos dos trechos de agente (T-039). Ficam NO JOB porque as linhas de log são
   * efêmeras (só trafegam pelo SSE): depois de um F5 o resumo é a única memória do que
   * cada agente fez.
   */
  resumos?: ResumoTrecho[];
  /** Histórico de pendências de input (abertas e respondidas) — auditoria (T-010). */
  inputs?: Pendencia[];
  /**
   * Metadados de RETOMADA MANUAL (T-019), gravados assim que conhecidos — não só no fim.
   * É o que permite retomar à mão um fluxo que o processo interrompeu no meio: sem
   * registrar na hora, o `sessionId` só existiria no resultado do job concluído, ou seja,
   * justamente nunca nos casos em que a retomada importa.
   */
  sessionId?: string;
  cwd?: string;
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
  /**
   * Pede um input ao usuário (T-010): cria a pendência, põe o job em `aguardando-input`,
   * emite o evento `input-pendente` e resolve quando a resposta chegar pela API. Rejeita
   * se o job for cancelado enquanto espera (o runner deve deixar o erro propagar).
   */
  pedirInput(pendencia: NovaPendencia): Promise<RespostaInput>;
  /**
   * Grava metadados de retomada no job e persiste na hora (T-019). O runner chama assim
   * que os conhece (ex.: `session_id` no `system/init` do SDK), para que sobrevivam a uma
   * interrupção — não adianta só devolvê-los no resultado final.
   */
  anotar(dados: { sessionId?: string; cwd?: string }): void;
}

/**
 * Runner plugável: executa um job do seu tipo. Resolve com o resultado (job
 * `concluido`), lança para falha (job `falhou`). Se o cancelamento foi pedido,
 * o estado final é `cancelado` independentemente de como o runner terminar.
 */
export interface Runner {
  executar(job: Job, contexto: ContextoExecucao): Promise<unknown>;
}
