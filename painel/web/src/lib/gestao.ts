import type { Job, TarefaCompleta } from "./tipos";
import { ESTADOS_JOB_ATIVOS } from "./formato";

/**
 * Leitura de gestão do projeto (T-036): dependências nos dois sentidos, o que trava o
 * quê, e o que já pode ser promovido.
 *
 * Os dados sempre estiveram na API (`dependencias` vem em cada tarefa); o que faltava era
 * alguém CRUZAR. O kanban mostrava "bloqueada" sem dizer por quê nem o que falta fechar.
 */

/** Situação de UMA tarefa em relação às suas dependências. */
export interface SituacaoDependencia {
  /** Ids que esta tarefa declara esperar. */
  espera: string[];
  /** Ids das dependências que ainda NÃO estão concluídas — o que de fato trava. */
  faltando: string[];
  /** Dependências que apontam para tarefa inexistente: erro de gestão, não bloqueio real. */
  inexistentes: string[];
  /** Ids das tarefas que esperam por ESTA — o custo de ela não sair. */
  esperadaPor: string[];
  /**
   * `backlog` com todas as dependências concluídas: está esperando só a promoção, que é
   * um ato do orquestrador. É o achado mais acionável desta tela.
   */
  prontaParaPromover: boolean;
}

export type MapaDependencias = Map<string, SituacaoDependencia>;

/**
 * Cruza a lista de tarefas e devolve a situação de cada uma, indexada por id.
 *
 * Dependência para id inexistente é separada de dependência não concluída de propósito:
 * a primeira é um erro de escrita no frontmatter (nunca vai fechar sozinha), a segunda é
 * o funcionamento normal do plano. Tratar as duas como "bloqueado" esconderia a primeira.
 */
export function mapaDependencias(tarefas: TarefaCompleta[]): MapaDependencias {
  const porId = new Map<string, TarefaCompleta>();
  for (const t of tarefas) porId.set(t.id, t);

  const esperadaPor = new Map<string, string[]>();
  for (const t of tarefas) {
    for (const dep of t.dependencias) {
      const atual = esperadaPor.get(dep) ?? [];
      atual.push(t.id);
      esperadaPor.set(dep, atual);
    }
  }

  const mapa: MapaDependencias = new Map();
  for (const t of tarefas) {
    const inexistentes = t.dependencias.filter((d) => !porId.has(d));
    const faltando = t.dependencias.filter((d) => {
      const alvo = porId.get(d);
      return alvo !== undefined && alvo.status !== "concluida";
    });

    mapa.set(t.id, {
      espera: t.dependencias,
      faltando,
      inexistentes,
      esperadaPor: esperadaPor.get(t.id) ?? [],
      // Dependência quebrada NÃO conta como pronta: promover assim esconderia o erro.
      prontaParaPromover:
        t.status === "backlog" && faltando.length === 0 && inexistentes.length === 0,
    });
  }
  return mapa;
}

/** Tarefas `bloqueada`, que são as que exigem decisão humana. */
export function tarefasBloqueadas(tarefas: TarefaCompleta[]): TarefaCompleta[] {
  return tarefas.filter((t) => t.status === "bloqueada");
}

/**
 * Tarefas que já podem sair do backlog. Ordenadas por prioridade (alta primeiro) e depois
 * por id, para a lista não dançar entre recargas.
 */
export function tarefasPromoviveis(
  tarefas: TarefaCompleta[],
  mapa: MapaDependencias,
): TarefaCompleta[] {
  const peso: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
  return tarefas
    .filter((t) => mapa.get(t.id)?.prontaParaPromover === true)
    .sort((a, b) => {
      const pa = peso[a.prioridade] ?? 9;
      const pb = peso[b.prioridade] ?? 9;
      return pa !== pb ? pa - pb : a.id.localeCompare(b.id);
    });
}

/**
 * Jobs deste projeto, mais recentes primeiro. Cai para `criadoEm` quando o job nunca
 * chegou a iniciar — senão os que falharam na fila apareceriam sempre no fim, que é
 * justamente onde ninguém olha.
 */
export function jobsDoProjeto(jobs: Job[], projeto: string): Job[] {
  const instante = (j: Job) => Date.parse(j.iniciadoEm ?? j.criadoEm) || 0;
  return jobs.filter((j) => j.escopo === `projeto:${projeto}`).sort((a, b) => instante(b) - instante(a));
}

/** Há algum job deste projeto ainda em andamento? */
export function temJobAtivo(jobs: Job[], projeto: string): boolean {
  return jobs.some((j) => j.escopo === `projeto:${projeto}` && ESTADOS_JOB_ATIVOS.has(j.estado));
}
