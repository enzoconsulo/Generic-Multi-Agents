import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GerenciadorJobs } from "../../src/jobs/fila.js";
import type { EstadoJob, EventoJob, Job, Runner } from "../../src/jobs/tipos.js";

/** Diretório temporário exclusivo do teste (fora do projeto; descartável). */
export function dirTemporario(): string {
  return mkdtempSync(join(tmpdir(), "painel-jobs-"));
}

export interface RunnerManual {
  runner: Runner;
  /** IDs dos jobs que o runner de fato começou a executar, na ordem. */
  iniciados: string[];
  /** Resolve a execução do job (o gerenciador o levará a `concluido`). */
  concluir(id: string, resultado?: unknown): void;
  /** Rejeita a execução do job (o gerenciador o levará a `falhou`). */
  falhar(id: string, erro: Error): void;
}

/**
 * Runner controlado pelo teste: cada execução fica pendurada até o teste chamar
 * `concluir`/`falhar` — locks de concorrência viram assertivas determinísticas,
 * sem depender de delays. Abort rejeita na hora (simula runner bem-comportado).
 */
export function criarRunnerManual(): RunnerManual {
  const pendentes = new Map<string, { resolver: (v: unknown) => void; rejeitar: (e: Error) => void }>();
  const iniciados: string[] = [];
  return {
    runner: {
      executar(job, contexto) {
        iniciados.push(job.id);
        return new Promise<unknown>((resolver, rejeitar) => {
          pendentes.set(job.id, { resolver, rejeitar });
          contexto.sinal.addEventListener(
            "abort",
            () => {
              pendentes.delete(job.id);
              rejeitar(new Error("Execução abortada pelo cancelamento"));
            },
            { once: true },
          );
        });
      },
    },
    iniciados,
    concluir(id, resultado) {
      const pendente = pendentes.get(id);
      if (!pendente) throw new Error(`Runner manual: job "${id}" não está executando`);
      pendentes.delete(id);
      pendente.resolver(resultado);
    },
    falhar(id, erro) {
      const pendente = pendentes.get(id);
      if (!pendente) throw new Error(`Runner manual: job "${id}" não está executando`);
      pendentes.delete(id);
      pendente.rejeitar(erro);
    },
  };
}

/** Espera (via emissor) o job alcançar o estado; resolve na hora se já está nele. */
export function aguardarEstado(
  gerenciador: GerenciadorJobs,
  jobId: string,
  estado: EstadoJob,
  timeoutMs = 2000,
): Promise<Job> {
  return new Promise((resolver, rejeitar) => {
    const atual = gerenciador.obter(jobId);
    if (atual?.estado === estado) return resolver(atual);

    const aoEvento = (evento: EventoJob): void => {
      if (evento.jobId !== jobId || evento.tipo !== "estado") return;
      const dados = evento.dados as { para: EstadoJob; job: Job };
      if (dados.para === estado) {
        limpar();
        resolver(dados.job);
      }
    };
    const timer = setTimeout(() => {
      limpar();
      rejeitar(
        new Error(
          `Timeout (${timeoutMs}ms) esperando o job ${jobId} chegar a "${estado}" ` +
            `(estado atual: "${gerenciador.obter(jobId)?.estado}")`,
        ),
      );
    }, timeoutMs);
    function limpar(): void {
      clearTimeout(timer);
      gerenciador.emissor.off("evento", aoEvento);
    }
    gerenciador.emissor.on("evento", aoEvento);
  });
}
