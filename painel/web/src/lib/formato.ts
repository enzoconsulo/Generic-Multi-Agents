/** Rótulos e ordenação em PT-BR para os vocabulários da fábrica. */
import { STATUS_TAREFA, type StatusTarefa } from "./tipos";

/** Ordem canônica do pipeline (usada nas colunas do kanban e nos resumos). */
export const ORDEM_STATUS: readonly StatusTarefa[] = STATUS_TAREFA;

export const ROTULO_STATUS: Record<StatusTarefa, string> = {
  backlog: "Backlog",
  pronta: "Pronta",
  "em-execucao": "Em execução",
  "em-teste": "Em teste",
  "em-revisao": "Em revisão",
  concluida: "Concluída",
  bloqueada: "Bloqueada",
  cancelada: "Cancelada",
};

export const ROTULO_PRIORIDADE: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

/** Classe CSS de cor por status (ex.: "em-execucao" → "st-em-execucao"). */
export function classeStatus(status: string): string {
  return `st-${status}`;
}

/** Classe CSS de cor por prioridade; desconhecida cai em "media". */
export function classePrioridade(prioridade: string): string {
  const p = prioridade === "alta" || prioridade === "baixa" ? prioridade : "media";
  return `pri-${p}`;
}

export function rotuloStatus(status: string): string {
  return (ROTULO_STATUS as Record<string, string>)[status] ?? status;
}

export function rotuloPrioridade(prioridade: string): string {
  return ROTULO_PRIORIDADE[prioridade] ?? prioridade;
}

export function rotuloMarco(estado: string): string {
  switch (estado) {
    case "pendente":
      return "Marco pendente";
    case "aprovado":
      return "Marco aprovado";
    case "reprovado":
      return "Marco reprovado";
    default:
      return "Marco desconhecido";
  }
}

export function classeMarco(estado: string): string {
  return `marco-${estado}`;
}

export const ROTULO_ESTADO_JOB: Record<string, string> = {
  "na-fila": "Na fila",
  executando: "Executando",
  "aguardando-input": "Aguardando input",
  concluido: "Concluído",
  falhou: "Falhou",
  cancelado: "Cancelado",
  interrompido: "Interrompido",
};

export function rotuloEstadoJob(estado: string): string {
  return ROTULO_ESTADO_JOB[estado] ?? estado;
}

export function classeEstadoJob(estado: string): string {
  return `job-${estado}`;
}

/** Estados não-terminais: job ainda ocupa o lock do escopo dele (T-016 usa para "job ativo"). */
export const ESTADOS_JOB_ATIVOS: ReadonlySet<string> = new Set([
  "na-fila",
  "executando",
  "aguardando-input",
]);
export function jobCancelavel(estado: string): boolean {
  return ESTADOS_JOB_ATIVOS.has(estado);
}

export const ESTADOS_JOB_TERMINAIS: ReadonlySet<string> = new Set([
  "concluido",
  "falhou",
  "cancelado",
  "interrompido",
]);

/* ----------------------------- Peso e custo ----------------------------- */

export const ROTULO_PESO: Record<string, string> = {
  leve: "Leve",
  medio: "Médio",
  pesado: "Pesado",
};
export function rotuloPeso(peso: string): string {
  return ROTULO_PESO[peso] ?? peso;
}

const NIVEL_PESO: Record<string, number> = { leve: 1, medio: 2, pesado: 3 };
const NIVEL_CUSTO: Record<string, number> = { baixo: 1, medio: 2, alto: 3 };

export interface Estimativa {
  rotulo: string;
  /** Classe de cor: baixo | medio | alto | muito-alto. */
  tier: string;
}

/**
 * Estimativa qualitativa de custo = peso da ação + tier de custo do modelo. É referência,
 * não preço; o custo real aparece no fim do job (campo do evento result do SDK).
 */
export function estimarCusto(peso: string, custoModelo: string): Estimativa {
  const soma = (NIVEL_PESO[peso] ?? 2) + (NIVEL_CUSTO[custoModelo] ?? 2);
  switch (soma) {
    case 2:
      return { rotulo: "Muito baixo", tier: "baixo" };
    case 3:
      return { rotulo: "Baixo", tier: "baixo" };
    case 4:
      return { rotulo: "Moderado", tier: "medio" };
    case 5:
      return { rotulo: "Alto", tier: "alto" };
    default:
      return { rotulo: "Muito alto", tier: "muito-alto" };
  }
}
