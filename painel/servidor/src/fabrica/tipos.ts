/**
 * Tipos do estado da fábrica — o contrato destes dados é `_sistema/PROTOCOLO_TAREFAS.md`
 * (frontmatter e vocabulário de status), `_sistema/templates/PLANO.md` (linhas Meta:/
 * Marco:/Tarefas:) e `_sistema/ideias/` (frontmatter `status: nova|roteada|descartada`).
 *
 * Princípio do módulo inteiro: arquivo malformado NUNCA derruba o scan — o item aparece
 * no resultado com `erros: string[]` preenchido e o resto segue.
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

export const PRIORIDADES_TAREFA = ["alta", "media", "baixa"] as const;
export type PrioridadeTarefa = (typeof PRIORIDADES_TAREFA)[number];

export const STATUS_IDEIA = ["nova", "roteada", "descartada"] as const;
export type StatusIdeia = (typeof STATUS_IDEIA)[number];

/** Contagem por status válido do protocolo — sempre com as 8 chaves (zeros incluídos).
 *  Tarefa com status fora do vocabulário NÃO entra na contagem (o problema fica
 *  registrado em `erros` da própria tarefa). */
export type ContagemPorStatus = Record<StatusTarefa, number>;

/** Frontmatter de uma tarefa. Campos de texto guardam o valor BRUTO do arquivo
 *  (mesmo inválido) para a UI exibir; a validação vai para `erros`. */
export interface TarefaResumo {
  /** Nome do arquivo (T-NNN-slug.md) — âncora estável mesmo com frontmatter quebrado. */
  arquivo: string;
  id: string;
  titulo: string;
  status: string;
  prioridade: string;
  dependencias: string[];
  areas: string[];
  tentativas: number;
  /** Presente apenas em tarefas nascidas de replanejamento automático. */
  replanejadaDe: string | null;
  /** AAAA-MM-DD ou null quando ausente/inválida. */
  criada: string | null;
  atualizada: string | null;
  /** Problemas de parse/validação; vazio = tarefa bem-formada. */
  erros: string[];
}

/** Corpo (seções markdown) de uma tarefa; seção ausente = string vazia. */
export interface SecoesTarefa {
  objetivo: string;
  contexto: string;
  criteriosAceite: string;
  notasExecucao: string;
  verificacao: string;
  revisao: string;
}

export interface TarefaCompleta extends TarefaResumo {
  secoes: SecoesTarefa;
}

/** Linha `Marco:` de uma fase do PLANO.md
 *  (`pendente` | `aprovado AAAA-MM-DD` | `reprovado AAAA-MM-DD (correções: ...)`). */
export interface MarcoFase {
  /** Texto após "Marco:", como está no arquivo. */
  bruto: string;
  estado: "pendente" | "aprovado" | "reprovado" | "desconhecido";
  /** AAAA-MM-DD quando aprovado/reprovado; null em pendente. */
  data: string | null;
}

export interface FasePlano {
  nome: string;
  meta: string;
  /** null = fase sem linha Marco (problema registrado em `Plano.erros`). */
  marco: MarcoFase | null;
  /** IDs T-NNN extraídos da linha `Tarefas:`. */
  tarefas: string[];
}

export interface Plano {
  titulo: string;
  visao: string;
  fases: FasePlano[];
  erros: string[];
}

/** Fase atual = primeira fase cujo marco está `pendente` (contrato); se nenhuma,
 *  a primeira `reprovado` — fase reprovada ainda está em andamento. */
export interface FaseAtual {
  nome: string;
  marco: MarcoFase;
}

export interface ProjetoResumo {
  nome: string;
  tarefas: TarefaResumo[];
  contagemPorStatus: ContagemPorStatus;
  faseAtual: FaseAtual | null;
  /** Problemas no nível do projeto (sem _gestao/, PLANO.md ausente/malformado...). */
  erros: string[];
}

export interface ProjetoDetalhe {
  nome: string;
  tarefas: TarefaCompleta[];
  contagemPorStatus: ContagemPorStatus;
  faseAtual: FaseAtual | null;
  plano: Plano | null;
  /** Conteúdo integral dos arquivos de gestão; null quando o arquivo não existe. */
  decisoes: string | null;
  progresso: string | null;
  analise: string | null;
  erros: string[];
}

/** Ideia da caixa de entrada `_sistema/ideias/` (README.md é excluído). */
export interface Ideia {
  arquivo: string;
  /** Primeiro título `# ` do corpo; fallback: slug do nome do arquivo. */
  titulo: string;
  status: string;
  /** AAAA-MM-DD do prefixo do nome do arquivo, ou null. */
  data: string | null;
  /** Corpo sem o frontmatter. */
  conteudo: string;
  erros: string[];
}

/** Log diário `_sistema/logs/AAAA-MM-DD.md`. */
export interface LogDiario {
  arquivo: string;
  data: string;
  conteudo: string;
}

export interface EstadoFabrica {
  projetos: ProjetoResumo[];
  ideias: Ideia[];
  logMaisRecente: LogDiario | null;
  /** Problemas no nível da raiz (ex.: pasta projetos/ inexistente). */
  erros: string[];
}
