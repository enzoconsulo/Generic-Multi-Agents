import { useSyncExternalStore } from "react";
import { api } from "./api";
import type {
  EstagioCiAoVivo,
  EventoJob,
  Job,
  LinhaLog,
  Pendencia,
  RespostaInputs,
  RespostaJobs,
  ResumoTrecho,
} from "./tipos";

export interface EstadoAoVivo {
  jobs: Job[];
  /** Log acumulado por jobId (a partir dos eventos "log" do SSE). */
  logs: Record<string, LinhaLog[]>;
  /** Inputs pendentes (T-010): fluxos pausados esperando resposta do usuário. */
  pendencias: Pendencia[];
  /** Estágios de CI ao vivo (T-017/T-018): jobId → estágio → estado em tempo real. */
  estagiosCi: Record<string, Record<string, EstagioCiAoVivo>>;
  conectado: boolean;
  /** Carga inicial da lista ainda em andamento. */
  carregando: boolean;
  /**
   * Falha na carga inicial (T-020): sem isto a tela de Jobs mostrava "nenhuma execução
   * ainda" com o backend fora do ar — mentira que faz o usuário procurar o problema no
   * lugar errado.
   */
  erro: string | null;
}

interface DadosTransicao {
  job?: Job;
}
interface DadosLog {
  nivel?: unknown;
  texto?: unknown;
  estagio?: unknown;
  fluxo?: unknown;
}
interface DadosEstagioInicio {
  estagio?: unknown;
  comando?: unknown;
}
interface DadosEstagioFim {
  estagio?: unknown;
  estado?: unknown;
  comando?: unknown;
  aviso?: unknown;
  codigoSaida?: unknown;
  duracaoMs?: unknown;
}

/** Estado bruto do canal, indexado por id (a ordenação só acontece no instantâneo). */
interface EstadoInterno {
  jobs: Record<string, Job>;
  logs: Record<string, LinhaLog[]>;
  pendencias: Record<string, Pendencia>;
  estagiosCi: Record<string, Record<string, EstagioCiAoVivo>>;
  conectado: boolean;
  carregando: boolean;
  erro: string | null;
}

/**
 * ─── Canal ÚNICO, compartilhado por todos os componentes (T-042) ───────────────────
 *
 * "Uma conexão SSE por página" sempre foi decisão do projeto, e a página do projeto
 * abria DUAS: o `App` assina para o selo de atividade do cabeçalho e a página assina de
 * novo. Medido no navegador com a página em produção: `/api/eventos` 2×, `/api/jobs` 2×
 * e `/api/inputs` 2×. Cada assinatura extra é uma conexão que o servidor mantém aberta e
 * um fanout duplicado de TODO evento — e o volume de eventos é a parte cara do console
 * ao vivo, não a carga inicial.
 *
 * O estado passou a morar no módulo, e o hook virou uma assinatura dele. Assim a conta
 * não depende de disciplina de quem chama: um terceiro componente pode chamar
 * `useJobsAoVivo()` à vontade que continua havendo UMA conexão.
 */
const ASSINANTES = new Set<() => void>();
let interno: EstadoInterno = {
  jobs: {},
  logs: {},
  pendencias: {},
  estagiosCi: {},
  conectado: false,
  carregando: true,
  erro: null,
};
let fonte: EventSource | null = null;
let jaCarregou = false;

/** Listas ordenadas memoizadas pela IDENTIDADE do mapa de origem. */
let cacheJobs: { de: Record<string, Job>; lista: Job[] } | null = null;
let cachePendencias: { de: Record<string, Pendencia>; lista: Pendencia[] } | null = null;

function ordenarJobs(mapa: Record<string, Job>): Job[] {
  // Evento de `log` não mexe no mapa de jobs — sem este cache, cada linha de log de um
  // fluxo verboso reordenaria a lista inteira à toa.
  if (cacheJobs?.de === mapa) return cacheJobs.lista;
  const lista = Object.values(mapa).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  cacheJobs = { de: mapa, lista };
  return lista;
}

function ordenarPendencias(mapa: Record<string, Pendencia>): Pendencia[] {
  if (cachePendencias?.de === mapa) return cachePendencias.lista;
  const lista = Object.values(mapa).sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
  cachePendencias = { de: mapa, lista };
  return lista;
}

function derivar(e: EstadoInterno): EstadoAoVivo {
  return {
    jobs: ordenarJobs(e.jobs),
    logs: e.logs,
    pendencias: ordenarPendencias(e.pendencias),
    estagiosCi: e.estagiosCi,
    conectado: e.conectado,
    carregando: e.carregando,
    erro: e.erro,
  };
}

/**
 * Instantâneo ESTÁVEL: `useSyncExternalStore` exige que `getSnapshot` devolva o mesmo
 * objeto enquanto nada mudar — devolver um objeto novo a cada chamada põe o React em
 * laço infinito de render.
 */
let instantaneo: EstadoAoVivo = derivar(interno);

function publicar(mudanca: Partial<EstadoInterno>): void {
  interno = { ...interno, ...mudanca };
  instantaneo = derivar(interno);
  for (const avisar of ASSINANTES) avisar();
}

function carregarInicial(): void {
  api<RespostaJobs>("/api/jobs")
    .then((r) => {
      const mapa = { ...interno.jobs };
      for (const job of r.jobs) mapa[job.id] = job;
      publicar({ jobs: mapa, erro: null, carregando: false });
    })
    .catch((e: unknown) => {
      publicar({
        erro: e instanceof Error ? e.message : "Falha ao carregar as execuções",
        carregando: false,
      });
    });

  api<RespostaInputs>("/api/inputs")
    .then((r) => {
      const mapa = { ...interno.pendencias };
      for (const p of r.inputs) mapa[p.id] = p;
      publicar({ pendencias: mapa });
    })
    .catch(() => {
      /* idem: o SSE ainda traz input-pendente ao vivo */
    });
}

function aoEvento(e: Event): void {
  let evento: EventoJob;
  try {
    evento = JSON.parse((e as MessageEvent).data) as EventoJob;
  } catch {
    return;
  }

  if (evento.tipo === "input-pendente") {
    const p = evento.dados as Pendencia | undefined;
    if (p?.id) publicar({ pendencias: { ...interno.pendencias, [p.id]: p } });
    return;
  }
  if (evento.tipo === "input-respondido") {
    const id = (evento.dados as { pendencia?: { id?: string } } | undefined)?.pendencia?.id;
    if (id) publicar({ pendencias: remover(interno.pendencias, id) });
    return;
  }

  if (evento.tipo === "resumo") {
    // O resumo chega assim que o trecho fecha (T-039) e mora NO JOB — atualizar aqui
    // faz o cartão aparecer ao vivo, sem esperar a próxima transição de estado.
    const resumo = evento.dados as ResumoTrecho | undefined;
    if (resumo === undefined || typeof resumo.indice !== "number") return;
    const job = interno.jobs[evento.jobId];
    if (job === undefined) return;
    const outros = (job.resumos ?? []).filter((r) => r.indice !== resumo.indice);
    const resumos = [...outros, resumo].sort((a, b) => a.indice - b.indice);
    publicar({ jobs: { ...interno.jobs, [evento.jobId]: { ...job, resumos } } });
    return;
  }

  if (evento.tipo === "estado") {
    const job = (evento.dados as DadosTransicao | undefined)?.job;
    if (job) publicar({ jobs: { ...interno.jobs, [job.id]: job } });
  } else if (evento.tipo === "log") {
    const d = evento.dados as DadosLog | undefined;
    const linha: LinhaLog = {
      nivel: typeof d?.nivel === "string" ? d.nivel : "log",
      texto: typeof d?.texto === "string" ? d.texto : "",
      em: evento.em,
      ...(typeof d?.estagio === "string" ? { estagio: d.estagio } : {}),
      ...(d?.fluxo === "stdout" || d?.fluxo === "stderr" ? { fluxo: d.fluxo } : {}),
    };
    publicar({
      logs: { ...interno.logs, [evento.jobId]: [...(interno.logs[evento.jobId] ?? []), linha] },
    });
  } else if (evento.tipo === "ci-estagio-inicio") {
    const d = evento.dados as DadosEstagioInicio | undefined;
    if (typeof d?.estagio === "string") {
      const estagio = d.estagio as EstagioCiAoVivo["estagio"];
      const comando = typeof d.comando === "string" ? d.comando : null;
      publicar({
        estagiosCi: {
          ...interno.estagiosCi,
          [evento.jobId]: {
            ...interno.estagiosCi[evento.jobId],
            [estagio]: { estagio, estado: "rodando", comando },
          },
        },
      });
    }
  } else if (evento.tipo === "ci-estagio") {
    const d = evento.dados as DadosEstagioFim | undefined;
    if (typeof d?.estagio === "string" && typeof d.estado === "string") {
      const estagio = d.estagio as EstagioCiAoVivo["estagio"];
      const linha: EstagioCiAoVivo = {
        estagio,
        estado: d.estado as EstagioCiAoVivo["estado"],
        comando: typeof d.comando === "string" ? d.comando : null,
        aviso: typeof d.aviso === "string" ? d.aviso : null,
        codigoSaida: typeof d.codigoSaida === "number" ? d.codigoSaida : null,
        duracaoMs: typeof d.duracaoMs === "number" ? d.duracaoMs : null,
      };
      publicar({
        estagiosCi: {
          ...interno.estagiosCi,
          [evento.jobId]: { ...interno.estagiosCi[evento.jobId], [estagio]: linha },
        },
      });
    }
  }
}

function abrir(): void {
  if (fonte !== null) return;
  if (!jaCarregou) {
    jaCarregou = true;
    carregarInicial();
  }
  const nova = new EventSource("/api/eventos");
  nova.onopen = () => publicar({ conectado: true });
  nova.onerror = () => publicar({ conectado: false });
  nova.addEventListener("job", aoEvento);
  fonte = nova;
}

function fechar(): void {
  fonte?.close();
  fonte = null;
  // A lista fica: reabrir sem dado nenhum piscaria a tela vazia. O que se perde é só a
  // atualidade, e o backend reenvia o intervalo pelo Last-Event-ID ao reconectar.
  jaCarregou = false;
  publicar({ conectado: false });
}

/**
 * Assina o canal de jobs ao vivo: lista viva, log por job, pendências e estágios de CI.
 * Carga inicial por GET /api/jobs + /api/inputs e depois as transições pelo `EventSource`
 * (que reconecta sozinho; o backend reenvia o que faltou via Last-Event-ID).
 *
 * Pode ser chamado por quantos componentes quiserem — a conexão é uma só (ver acima).
 */
export function useJobsAoVivo(): EstadoAoVivo {
  return useSyncExternalStore(assinar, () => instantaneo);
}

/** Contrato de `useSyncExternalStore`: registra o ouvinte e devolve como cancelar. */
function assinar(avisar: () => void): () => void {
  ASSINANTES.add(avisar);
  if (ASSINANTES.size === 1) abrir();
  return () => {
    ASSINANTES.delete(avisar);
    if (ASSINANTES.size === 0) fechar();
  };
}

/** Remove uma chave de um Record sem mutar o original. */
function remover<T>(mapa: Record<string, T>, id: string): Record<string, T> {
  if (!(id in mapa)) return mapa;
  const copia = { ...mapa };
  delete copia[id];
  return copia;
}
