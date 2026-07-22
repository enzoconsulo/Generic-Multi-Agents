/**
 * Tipos do frontend que espelham o contrato da API de leitura (T-004), definido no
 * servidor em `servidor/src/fabrica/tipos.ts` e `servidor/src/fabrica/catalogo-acoes.ts`.
 * Mantidos aqui para a SPA não depender de import cruzado entre workspaces.
 */

export const STATUS_TAREFA = [
  "backlog",
  "pronta",
  "em-execucao",
  "em-teste",
  "em-revisao",
  "concluida",
  "bloqueada",
  "cancelada",
] as const;
export type StatusTarefa = (typeof STATUS_TAREFA)[number];

export type ContagemPorStatus = Record<StatusTarefa, number>;

export type PesoAcao = "leve" | "medio" | "pesado";
export type TierCusto = "baixo" | "medio" | "alto";

export interface EstrategiaModelo {
  id: string;
  rotulo: string;
  modelo: string;
  fallback: string | null;
  custo: TierCusto;
  descricao: string;
}

export interface AcaoFabrica {
  id: string;
  nome: string;
  descricao: string;
  argumentos: string | null;
  peso: PesoAcao;
  disponivel: boolean;
}

export interface MarcoFase {
  bruto: string;
  estado: "pendente" | "aprovado" | "reprovado" | "desconhecido";
  data: string | null;
}

export interface FaseAtual {
  nome: string;
  marco: MarcoFase;
}

export interface FasePlano {
  nome: string;
  meta: string;
  marco: MarcoFase | null;
  tarefas: string[];
}

export interface Plano {
  titulo: string;
  visao: string;
  fases: FasePlano[];
  erros: string[];
}

export interface SecoesTarefa {
  objetivo: string;
  contexto: string;
  criteriosAceite: string;
  notasExecucao: string;
  verificacao: string;
  revisao: string;
}

export interface TarefaCompleta {
  arquivo: string;
  id: string;
  titulo: string;
  status: string;
  prioridade: string;
  dependencias: string[];
  areas: string[];
  tentativas: number;
  replanejadaDe: string | null;
  /** Id do especialista da equipe que executa (null = executor genérico). */
  agente: string | null;
  criada: string | null;
  atualizada: string | null;
  erros: string[];
  secoes: SecoesTarefa;
}

export interface AgenteEspecialista {
  id: string;
  nome: string;
  descricao: string;
  prompt: string;
  ferramentas: string[] | null;
  erros: string[];
}

export interface EquipeProjeto {
  agentes: AgenteEspecialista[];
  erros: string[];
}

export interface ProjetoResumo {
  nome: string;
  contagemPorStatus: ContagemPorStatus;
  faseAtual: FaseAtual | null;
  erros: string[];
}

export interface ProjetoDetalhe {
  nome: string;
  tarefas: TarefaCompleta[];
  contagemPorStatus: ContagemPorStatus;
  faseAtual: FaseAtual | null;
  plano: Plano | null;
  equipe: EquipeProjeto;
  decisoes: string | null;
  progresso: string | null;
  analise: string | null;
  erros: string[];
}

/** GET /api/fabrica */
export interface RespostaFabrica {
  acoes: AcaoFabrica[];
  resumo: { projetos: number; tarefasPorStatus: ContagemPorStatus };
  estrategias: EstrategiaModelo[];
  estrategiaPadrao: string;
  erros: string[];
}

/** GET /api/projetos */
export interface RespostaProjetos {
  projetos: ProjetoResumo[];
}

/* ----------------------------- Jobs e eventos ----------------------------- */

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

export interface Job {
  id: string;
  tipo: string;
  titulo: string;
  escopo: string;
  usaClaude: boolean;
  params: Record<string, unknown>;
  estado: EstadoJob;
  criadoEm: string;
  iniciadoEm?: string;
  terminadoEm?: string;
  resultado?: unknown;
  erro?: string;
}

/** GET /api/jobs */
export interface RespostaJobs {
  jobs: Job[];
}

/** Pendência de input (T-010): o fluxo pausou esperando aprovação ou uma resposta. */
export interface Pendencia {
  id: string;
  jobId: string;
  tipo: "aprovacao-ferramenta" | "pergunta";
  titulo: string;
  descricao: string;
  opcoes?: string[];
  criadaEm: string;
  respondidaEm?: string;
}

/** GET /api/inputs */
export interface RespostaInputs {
  inputs: Pendencia[];
}

/** POST /api/acoes/:id */
export interface RespostaAcao {
  job: Job;
}

/** Evento que chega pelo SSE (`GET /api/eventos`, event: "job"). */
export interface EventoJob {
  jobId: string;
  /** "estado" (transição, dados = { de, para, job }) ou "log" (dados = { nivel, texto }). */
  tipo: string;
  dados?: unknown;
  em: string;
}

/** Linha de log acumulada por job na UI. */
export interface LinhaLog {
  nivel: string;
  texto: string;
  em: string;
}
