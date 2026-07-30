import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { ESTADOS_JOB, ESTADOS_TERMINAIS, type EstadoJob, type Job } from "./tipos.js";

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

/**
 * Retenção do histórico (T-045). Sem isto o `dados/jobs/` cresce para sempre: cada job
 * guarda o prompt inteiro e o resultado, o boot lê TODOS com `readFileSync` em laço (sob
 * OneDrive, que é lento por arquivo), a memória segura todos, e o payload de `/api/jobs`
 * cresce linear e sem teto. Degrada devagar e não aparece em nenhum teste — só depois de
 * meses de uso diário.
 *
 * O teto é generoso de propósito: o histórico é o que dá para auditar custo depois, e
 * 400 jobs cobrem semanas de uso pesado ocupando poucos MB.
 */
export const MAX_JOBS_RETIDOS = 400;

/**
 * Apaga do disco os jobs terminais mais antigos que excedem o teto e devolve os que
 * ficaram — assim o chamador não precisa reler o diretório.
 *
 * Só poda estado TERMINAL: job vivo (`na-fila`, `executando`, `aguardando-input`) nunca é
 * candidato, por mais antigo que o `criadoEm` pareça — apagar um desses perderia trabalho
 * em curso. Roda no boot, quando não há execução concorrente.
 */
export function podarJobs(
  dirJobs: string,
  jobs: Job[],
  max = MAX_JOBS_RETIDOS,
): { mantidos: Job[]; apagados: number } {
  const terminais = jobs.filter((j) => ESTADOS_TERMINAIS.has(j.estado));
  if (terminais.length <= max) return { mantidos: jobs, apagados: 0 };

  // Mais recentes primeiro; o excedente do fim da lista é o que sai.
  const ordenados = [...terminais].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const aRemover = new Set(ordenados.slice(max).map((j) => j.id));

  let apagados = 0;
  for (const id of [...aRemover]) {
    try {
      rmSync(join(dirJobs, `${id}.json`), { force: true });
      apagados++;
    } catch (erro) {
      // Disco ocupado/EPERM (OneDrive) não pode impedir o painel de subir: o arquivo fica
      // mais um ciclo e a próxima poda tenta de novo. Mantido na memória para a UI não
      // perder de vista um job cujo arquivo ainda existe.
      console.warn(
        `[jobs] Não deu para podar ${id}: ${erro instanceof Error ? erro.message : erro}`,
      );
      aRemover.delete(id);
    }
  }
  return { mantidos: jobs.filter((j) => !aRemover.has(j.id)), apagados };
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
