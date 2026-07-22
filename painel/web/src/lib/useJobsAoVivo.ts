import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type {
  EventoJob,
  Job,
  LinhaLog,
  Pendencia,
  RespostaInputs,
  RespostaJobs,
} from "./tipos";

interface EstadoAoVivo {
  jobs: Job[];
  /** Log acumulado por jobId (a partir dos eventos "log" do SSE). */
  logs: Record<string, LinhaLog[]>;
  /** Inputs pendentes (T-010): fluxos pausados esperando resposta do usuário. */
  pendencias: Pendencia[];
  conectado: boolean;
}

interface DadosTransicao {
  job?: Job;
}
interface DadosLog {
  nivel?: unknown;
  texto?: unknown;
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
  const [conectado, setConectado] = useState(false);
  const jaCarregou = useRef(false);

  useEffect(() => {
    let ativo = true;

    if (!jaCarregou.current) {
      jaCarregou.current = true;
      api<RespostaJobs>("/api/jobs")
        .then((r) => {
          if (!ativo) return;
          setJobs((atual) => {
            const mapa = { ...atual };
            for (const job of r.jobs) mapa[job.id] = job;
            return mapa;
          });
        })
        .catch(() => {
          /* a lista inicial pode falhar; o SSE ainda popula ao vivo */
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
        };
        setLogs((atual) => ({
          ...atual,
          [evento.jobId]: [...(atual[evento.jobId] ?? []), linha],
        }));
      }
    });

    return () => {
      ativo = false;
      fonte.close();
    };
  }, []);

  const lista = Object.values(jobs).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const pend = Object.values(pendencias).sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
  return { jobs: lista, logs, pendencias: pend, conectado };
}

/** Remove uma chave de um Record sem mutar o original. */
function remover<T>(mapa: Record<string, T>, id: string): Record<string, T> {
  if (!(id in mapa)) return mapa;
  const copia = { ...mapa };
  delete copia[id];
  return copia;
}
