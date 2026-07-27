import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type {
  EstagioCiAoVivo,
  EventoJob,
  Job,
  LinhaLog,
  Pendencia,
  RespostaInputs,
  RespostaJobs,
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

/**
 * Assina o stream SSE de jobs e mantém a lista viva + o log por job. Faz a carga inicial
 * via GET /api/jobs e depois aplica as transições/logs que chegam pelo `EventSource`.
 * Reconecta sozinho (comportamento nativo do EventSource; o backend reenvia o que faltou
 * via Last-Event-ID).
 */
export function useJobsAoVivo(): EstadoAoVivo {
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [logs, setLogs] = useState<Record<string, LinhaLog[]>>({});
  const [pendencias, setPendencias] = useState<Record<string, Pendencia>>({});
  const [estagiosCi, setEstagiosCi] = useState<Record<string, Record<string, EstagioCiAoVivo>>>({});
  const [conectado, setConectado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const jaCarregou = useRef(false);

  useEffect(() => {
    let ativo = true;

    if (!jaCarregou.current) {
      jaCarregou.current = true;
      api<RespostaJobs>("/api/jobs")
        .then((r) => {
          if (!ativo) return;
          setErro(null);
          setJobs((atual) => {
            const mapa = { ...atual };
            for (const job of r.jobs) mapa[job.id] = job;
            return mapa;
          });
        })
        .catch((e: unknown) => {
          if (!ativo) return;
          setErro(e instanceof Error ? e.message : "Falha ao carregar as execuções");
        })
        .finally(() => {
          if (ativo) setCarregando(false);
        });

      api<RespostaInputs>("/api/inputs")
        .then((r) => {
          if (!ativo) return;
          setPendencias((atual) => {
            const mapa = { ...atual };
            for (const p of r.inputs) mapa[p.id] = p;
            return mapa;
          });
        })
        .catch(() => {
          /* idem: o SSE ainda traz input-pendente ao vivo */
        });
    }

    const fonte = new EventSource("/api/eventos");
    fonte.onopen = () => ativo && setConectado(true);
    fonte.onerror = () => ativo && setConectado(false);

    fonte.addEventListener("job", (e) => {
      if (!ativo) return;
      let evento: EventoJob;
      try {
        evento = JSON.parse((e as MessageEvent).data) as EventoJob;
      } catch {
        return;
      }

      if (evento.tipo === "input-pendente") {
        const p = evento.dados as Pendencia | undefined;
        if (p?.id) setPendencias((atual) => ({ ...atual, [p.id]: p }));
        return;
      }
      if (evento.tipo === "input-respondido") {
        const id = (evento.dados as { pendencia?: { id?: string } } | undefined)?.pendencia?.id;
        if (id) setPendencias((atual) => remover(atual, id));
        return;
      }

      if (evento.tipo === "estado") {
        const job = (evento.dados as DadosTransicao | undefined)?.job;
        if (job) setJobs((atual) => ({ ...atual, [job.id]: job }));
      } else if (evento.tipo === "log") {
        const d = evento.dados as DadosLog | undefined;
        const linha: LinhaLog = {
          nivel: typeof d?.nivel === "string" ? d.nivel : "log",
          texto: typeof d?.texto === "string" ? d.texto : "",
          em: evento.em,
          ...(typeof d?.estagio === "string" ? { estagio: d.estagio } : {}),
          ...(d?.fluxo === "stdout" || d?.fluxo === "stderr" ? { fluxo: d.fluxo } : {}),
        };
        setLogs((atual) => ({
          ...atual,
          [evento.jobId]: [...(atual[evento.jobId] ?? []), linha],
        }));
      } else if (evento.tipo === "ci-estagio-inicio") {
        const d = evento.dados as DadosEstagioInicio | undefined;
        if (typeof d?.estagio === "string") {
          const estagio = d.estagio as EstagioCiAoVivo["estagio"];
          const comando = typeof d.comando === "string" ? d.comando : null;
          setEstagiosCi((atual) => ({
            ...atual,
            [evento.jobId]: {
              ...atual[evento.jobId],
              [estagio]: { estagio, estado: "rodando", comando },
            },
          }));
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
          setEstagiosCi((atual) => ({
            ...atual,
            [evento.jobId]: { ...atual[evento.jobId], [estagio]: linha },
          }));
        }
      }
    });

    return () => {
      ativo = false;
      fonte.close();
    };
  }, []);

  const lista = Object.values(jobs).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const pend = Object.values(pendencias).sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
  return { jobs: lista, logs, pendencias: pend, estagiosCi, conectado, carregando, erro };
}

/** Remove uma chave de um Record sem mutar o original. */
function remover<T>(mapa: Record<string, T>, id: string): Record<string, T> {
  if (!(id in mapa)) return mapa;
  const copia = { ...mapa };
  delete copia[id];
  return copia;
}
