import type { FasePlano, LinhaLog, Plano, TarefaCompleta } from "./tipos";

/**
 * Extração da ATIVIDADE dos agentes a partir do log ao vivo, e agregação do PLANO com o
 * progresso real das tarefas (T-023).
 *
 * Tudo aqui é função PURA: é o que permite testar "quem está trabalhando" e "quanto da
 * fase está pronto" sem navegador e sem SSE.
 */

/**
 * O runner loga o despacho de subagente como `Agent → domain` (ou `(subagente) Task →
 * testador`, em outros SDKs) — ver `runner-claude.ts`. Este regex é o contrato entre
 * aquele formato e a visualização da equipe.
 */
const DESPACHO = /(?:\(subagente\)\s*)?(?:Agent|Task)\s*→\s*(.+?)\s*$/;

export interface AtividadeAgente {
  /** Id do agente despachado (`domain`, `testador`, `revisor`…). */
  id: string;
  /** Quantas vezes foi despachado no log. */
  vezes: number;
  /** Momento do despacho mais recente (ISO). */
  ultimoEm: string;
}

/** Id do agente do despacho mais recente, ou null se nenhum despacho no log. */
export function agenteAtivo(linhas: readonly LinhaLog[]): string | null {
  for (let i = linhas.length - 1; i >= 0; i--) {
    const linha = linhas[i];
    if (linha === undefined || linha.nivel !== "ferramenta") continue;
    const casou = DESPACHO.exec(linha.texto);
    if (casou?.[1] !== undefined) return casou[1];
  }
  return null;
}

/** Quantas vezes cada agente foi despachado, do mais recente para o mais antigo. */
export function atividadePorAgente(linhas: readonly LinhaLog[]): AtividadeAgente[] {
  const porId = new Map<string, AtividadeAgente>();
  for (const linha of linhas) {
    if (linha.nivel !== "ferramenta") continue;
    const id = DESPACHO.exec(linha.texto)?.[1];
    if (id === undefined) continue;
    const atual = porId.get(id);
    if (atual === undefined) porId.set(id, { id, vezes: 1, ultimoEm: linha.em });
    else {
      atual.vezes += 1;
      atual.ultimoEm = linha.em;
    }
  }
  return [...porId.values()].sort((a, b) => b.ultimoEm.localeCompare(a.ultimoEm));
}

/* ------------------------- Linha do tempo do job ------------------------- */

/** Etapa do pipeline da fábrica, deduzida de QUEM está trabalhando. */
export type EtapaPipeline = "construtor" | "testador" | "revisor";

/** Testador e revisor são fixos; qualquer outro agente é um construtor. */
export function etapaDoAgente(agente: string | null): EtapaPipeline | null {
  if (agente === null) return null;
  if (agente === "testador") return "testador";
  if (agente === "revisor") return "revisor";
  return "construtor";
}

export interface SegmentoAgente {
  /** Agente do trecho; null = orquestrador (antes do primeiro despacho). */
  agente: string | null;
  etapa: EtapaPipeline | null;
  inicio: string;
  /** Último evento do trecho (o trecho corrente usa o último que chegou). */
  fim: string;
  linhas: LinhaLog[];
  duracaoMs: number;
}

/**
 * Agrupa o log em TRECHOS POR AGENTE (T-024): cada despacho `Agent → X` abre um trecho, e
 * tudo que vem depois pertence a ele até o próximo despacho.
 *
 * É o que troca "parede de linhas soltas" por "blocos do que cada agente fez" — a mesma
 * informação, na unidade em que a pessoa raciocina.
 */
export function segmentarPorAgente(linhas: readonly LinhaLog[]): SegmentoAgente[] {
  const segmentos: SegmentoAgente[] = [];

  const abrir = (agente: string | null, em: string): SegmentoAgente => {
    const s: SegmentoAgente = {
      agente,
      etapa: etapaDoAgente(agente),
      inicio: em,
      fim: em,
      linhas: [],
      duracaoMs: 0,
    };
    segmentos.push(s);
    return s;
  };

  let atual: SegmentoAgente | null = null;

  for (const linha of linhas) {
    const despachado = linha.nivel === "ferramenta" ? DESPACHO.exec(linha.texto)?.[1] : undefined;

    if (despachado !== undefined) {
      atual = abrir(despachado, linha.em);
      continue; // a linha do despacho é o cabeçalho do trecho, não conteúdo dele
    }
    if (atual === null) atual = abrir(null, linha.em);

    atual.linhas.push(linha);
    atual.fim = linha.em;
    const ms = Date.parse(atual.fim) - Date.parse(atual.inicio);
    atual.duracaoMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  }

  // Trecho de orquestrador vazio no fim (despacho sem nada depois ainda) não é ruído:
  // é justamente "acabou de despachar, aguardando" — mantido de propósito.
  return segmentos;
}

/** Última tarefa (T-NNN) citada no log — o orquestrador cita o id ao despachar. */
export function tarefaEmFoco(linhas: readonly LinhaLog[]): string | null {
  for (let i = linhas.length - 1; i >= 0; i--) {
    const casou = /\bT-\d{3,}\b/.exec(linhas[i]?.texto ?? "");
    if (casou !== null) return casou[0];
  }
  return null;
}

/* --------------------------------- Plano --------------------------------- */

export interface FaseComProgresso {
  nome: string;
  meta: string;
  marco: FasePlano["marco"];
  /** Tarefas da fase, já resolvidas (as que o PLANO cita e existem em disco). */
  tarefas: TarefaCompleta[];
  /** Ids citados no plano que NÃO têm arquivo de tarefa (plano desatualizado). */
  idsAusentes: string[];
  concluidas: number;
  total: number;
  /** 0–100; fase sem tarefa nenhuma conta como 0 (e não como 100). */
  percentual: number;
}

export interface MapaPlano {
  fases: FaseComProgresso[];
  /** Tarefas que existem mas nenhuma fase cita — não podem sumir da visão. */
  semFase: TarefaCompleta[];
}

/**
 * Cruza o PLANO.md (fases → ids de tarefa) com as tarefas reais, produzindo progresso por
 * fase. Duas escolhas deliberadas de honestidade:
 *  - id citado no plano sem arquivo correspondente vira `idsAusentes` (plano desatualizado
 *    fica VISÍVEL, em vez de sumir da conta e inflar o percentual);
 *  - tarefa órfã (existe mas nenhuma fase cita) vai para `semFase`, nunca é escondida.
 */
export function montarMapaPlano(plano: Plano | null, tarefas: readonly TarefaCompleta[]): MapaPlano {
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  const usadas = new Set<string>();
  const fases: FaseComProgresso[] = [];

  for (const fase of plano?.fases ?? []) {
    const daFase: TarefaCompleta[] = [];
    const idsAusentes: string[] = [];
    for (const id of fase.tarefas) {
      const tarefa = porId.get(id);
      if (tarefa === undefined) {
        idsAusentes.push(id);
        continue;
      }
      daFase.push(tarefa);
      usadas.add(id);
    }
    const concluidas = daFase.filter((t) => t.status === "concluida").length;
    const total = daFase.length;
    fases.push({
      nome: fase.nome,
      meta: fase.meta,
      marco: fase.marco,
      tarefas: daFase,
      idsAusentes,
      concluidas,
      total,
      percentual: total === 0 ? 0 : Math.round((concluidas / total) * 100),
    });
  }

  return { fases, semFase: tarefas.filter((t) => !usadas.has(t.id)) };
}
