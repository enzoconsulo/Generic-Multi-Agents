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
  /** Metadados de retomada manual (T-019), gravados assim que conhecidos. */
  sessionId?: string;
  cwd?: string;
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
  /** Presente só em jobs de CI (T-017): identifica de qual estágio a linha veio. */
  estagio?: string;
  fluxo?: "stdout" | "stderr";
}

/* ----------------------------------- CI/CD (T-017/T-018) ----------------------------------- */

export const ESTAGIOS_CI = ["instalar", "lint", "testes", "build"] as const;
export type EstagioCi = (typeof ESTAGIOS_CI)[number];

export interface ConfigEstagioCi {
  comando: string | null;
  habilitado: boolean;
}

export interface ConfigCi {
  estagios: Record<EstagioCi, ConfigEstagioCi>;
  timeoutMs: number;
  /** Ecossistema detectado (`node`, `python`, `go`…); null = nada reconhecido. */
  ecossistema?: string | null;
}

export type EstadoEstagioCi = "sucesso" | "falhou" | "pulado" | "cancelado";
export type EstadoResultadoCi =
  | "executando"
  | "sucesso"
  | "falhou"
  | "cancelado"
  /** O painel caiu no meio do pipeline (reconciliado no boot — T-019). */
  | "interrompido";

export interface ResultadoEstagio {
  estagio: EstagioCi;
  estado: EstadoEstagioCi;
  comando: string | null;
  iniciadoEm: string | null;
  terminadoEm: string | null;
  duracaoMs: number | null;
  codigoSaida: number | null;
  aviso: string | null;
}

export interface ResultadoCi {
  jobId: string;
  projeto: string;
  estado: EstadoResultadoCi;
  iniciadoEm: string;
  terminadoEm: string | null;
  estagios: ResultadoEstagio[];
}

/** GET /api/ci/:projeto */
export interface RespostaCi {
  ultimo: ResultadoCi | null;
  historico: ResultadoCi[];
}

/** GET/PUT /api/ci/:projeto/config */
export interface RespostaConfigCi {
  config: ConfigCi;
}

/** Estágio ao vivo (T-018): estado derivado dos eventos SSE `ci-estagio-inicio`/`ci-estagio`
 *  ENQUANTO o job ainda está rodando — junta com `ResultadoEstagio` quando o job termina. */
export interface EstagioCiAoVivo {
  estagio: EstagioCi;
  estado: "rodando" | EstadoEstagioCi;
  comando: string | null;
  aviso?: string | null;
  codigoSaida?: number | null;
  duracaoMs?: number | null;
}

/* ------------------------------ Git (T-028) ------------------------------ */

export interface CommitGit {
  hash: string;
  curto: string;
  /** Hashes dos pais: 0 = raiz, 2+ = merge. */
  pais: string[];
  autor: string;
  data: string;
  assunto: string;
  /** Branches/tags apontando para este commit. */
  refs: string[];
}

/** GET /api/git/:projeto (use `_fabrica` para o repositório da raiz). */
export interface HistoricoGit {
  ehRepo: boolean;
  branch: string;
  commits: CommitGit[];
  truncado: boolean;
  aviso: string | null;
}

export interface ArquivoAlterado {
  caminho: string;
  adicoes: number;
  remocoes: number;
  binario: boolean;
}

/** GET /api/git/:projeto/commit/:hash — o "resumão" de um commit. */
export interface DetalheCommit {
  hash: string;
  arquivos: ArquivoAlterado[];
  adicoes: number;
  remocoes: number;
  corpo: string;
}

export interface AlteracaoPendente {
  caminho: string;
  codigo: string;
  situacao: string;
}

/** GET /api/git/:projeto/alteracoes. */
export interface AlteracoesPendentes {
  alteracoes: AlteracaoPendente[];
}

/* ---------- Publicação: link na nuvem e push (T-030) ---------- */

/** Um repositório da fábrica: a raiz (`_fabrica`) ou um subprojeto. */
export interface RepoResumo {
  id: string;
  rotulo: string;
  ehFabrica: boolean;
  ehRepo: boolean;
  branch: string;
  remoto: string | null;
  pendentes: number;
  /** Commits locais não publicados. `null` = branch sem upstream. */
  aFrente: number | null;
  atras: number | null;
  temUpstream: boolean;
  totalLocal: number;
}

/** GET /api/repos */
export interface ListaRepos {
  repos: RepoResumo[];
}

/** POST /api/repos/:id/push */
export interface ResultadoPush {
  branch: string;
  publicados: number;
  criouUpstream: boolean;
  saida: string;
}

/* ---------- Conferência de segurança pré-publicação (T-031) ---------- */

export interface AchadoSeguranca {
  nivel: "alto" | "medio";
  tipo: "segredo" | "arquivo-sensivel" | "sem-gitignore";
  caminho: string;
  detalhe: string;
  /** Já está no histórico (grave) ou entraria no próximo commit? */
  versionado: boolean;
  linha: number | null;
}

export interface RelatorioSeguranca {
  achados: AchadoSeguranca[];
  arquivosVarridos: number;
  truncado: boolean;
  temGitignore: boolean;
  /** Há achado alto — publicar exige decisão explícita. */
  bloqueia: boolean;
}

/* ---------- Ajustes e contas (T-032) ---------- */

export interface ContaGitHub {
  meio: "https" | "ssh" | "nenhum";
  conectado: boolean;
  identidadeNome: string | null;
  identidadeEmail: string | null;
  credentialHelper: string | null;
  chavesSsh: string[];
  ghInstalado: boolean;
  ghConta: string | null;
  comoResolver: string | null;
}

export interface ContaClaude {
  conectado: boolean;
  cliInstalado: boolean;
  versao: string | null;
  temCredenciais: boolean;
  comoResolver: string | null;
}

export interface AjustesPainel {
  porta: number;
  fabricaRaiz: string;
  dirDados: string;
  tetoJobsClaude: number;
  estrategias: string[];
}

export interface Ajustes {
  github: ContaGitHub;
  claude: ContaClaude;
  painel: AjustesPainel;
}
