import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ESTADOS_JOB, type EstadoJob, type Job } from "./tipos.js";

/**
 * Persistência dos metadados de job em `<dirJobs>/<id>.json`, um arquivo por job,
 * reescrito a cada transição. Escrita SÍNCRONA de propósito: garante a ordem das
 * transições no disco sem fila de escrita (arquivos minúsculos, transições raras).
 * `dados/` é descartável — criado sob demanda, nunca versionado.
 */

export function salvarJob(dirJobs: string, job: Job): void {
  mkdirSync(dirJobs, { recursive: true });
  // Escrita atômica (temp + rename): crash no meio da escrita nunca deixa um
  // `<id>.json` truncado — no pior caso sobra um `.json.tmp`, que `carregarJobs`
  // ignora (só lê `.json`) e a próxima transição sobrescreve.
  const destino = join(dirJobs, `${job.id}.json`);
  const temporario = `${destino}.tmp`;
  writeFileSync(temporario, JSON.stringify(job, null, 2), "utf8");
  renameSync(temporario, destino);
}

/** Carrega todos os jobs persistidos; arquivo ilegível/malformado é avisado e pulado. */
export function carregarJobs(dirJobs: string): Job[] {
  if (!existsSync(dirJobs)) return [];
  const jobs: Job[] = [];
  for (const nome of readdirSync(dirJobs)) {
    if (!nome.endsWith(".json")) continue;
    const caminho = join(dirJobs, nome);
    try {
      const bruto: unknown = JSON.parse(readFileSync(caminho, "utf8"));
      if (!pareceJob(bruto)) {
        console.warn(`[jobs] ${caminho} ignorado: não parece um metadado de job válido`);
        continue;
      }
      jobs.push(bruto);
    } catch (erro) {
      console.warn(`[jobs] ${caminho} ignorado: ${erro instanceof Error ? erro.message : erro}`);
    }
  }
  return jobs;
}

/** Validação estrutural mínima do JSON lido do disco. */
function pareceJob(valor: unknown): valor is Job {
  if (typeof valor !== "object" || valor === null) return false;
  const v = valor as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.tipo === "string" &&
    typeof v.titulo === "string" &&
    typeof v.escopo === "string" &&
    typeof v.usaClaude === "boolean" &&
    typeof v.criadoEm === "string" &&
    typeof v.estado === "string" &&
    (ESTADOS_JOB as readonly string[]).includes(v.estado as EstadoJob)
  );
}
