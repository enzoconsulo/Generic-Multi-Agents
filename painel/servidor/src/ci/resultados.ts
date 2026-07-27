import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EstagioCi } from "./config.js";

/**
 * Persistência dos resultados de execução de CI (T-017): decisão em DECISOES.md
 * 2026-07-21 — resultado da execução é operacional, fica em `dados/ci/<projeto>.json`
 * do PAINEL (não do projeto), descartável e fora do git.
 */

export type EstadoEstagioCi = "sucesso" | "falhou" | "pulado" | "cancelado";
export type EstadoResultadoCi = "executando" | "sucesso" | "falhou" | "cancelado";

export interface ResultadoEstagio {
  estagio: EstagioCi;
  estado: EstadoEstagioCi;
  comando: string | null;
  iniciadoEm: string | null;
  terminadoEm: string | null;
  duracaoMs: number | null;
  codigoSaida: number | null;
  /** Motivo do "pulado" (estágio desabilitado) — texto em PT-BR. */
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

interface ArquivoResultadosCi {
  ultimo: ResultadoCi;
  /** Mais recentes primeiro; inclui o `ultimo`. Capado em MAX_HISTORICO. */
  historico: ResultadoCi[];
}

const MAX_HISTORICO = 20;

function dirCi(dirDados: string): string {
  return join(dirDados, "ci");
}

function caminhoResultado(dirDados: string, projeto: string): string {
  return join(dirCi(dirDados), `${projeto}.json`);
}

/** Lê o arquivo de resultados do projeto (último + histórico); null se nunca rodou. */
export function lerResultados(dirDados: string, projeto: string): ArquivoResultadosCi | null {
  const caminho = caminhoResultado(dirDados, projeto);
  if (!existsSync(caminho)) return null;
  try {
    return JSON.parse(readFileSync(caminho, "utf8")) as ArquivoResultadosCi;
  } catch {
    return null;
  }
}

/** Grava/atualiza o resultado (mesmo jobId reescreve a entrada — usado durante a execução). */
export function salvarResultado(dirDados: string, resultado: ResultadoCi): void {
  mkdirSync(dirCi(dirDados), { recursive: true });
  const atual = lerResultados(dirDados, resultado.projeto);
  const semEsteJob = (atual?.historico ?? []).filter((r) => r.jobId !== resultado.jobId);
  const historico = [resultado, ...semEsteJob].slice(0, MAX_HISTORICO);
  const arquivo: ArquivoResultadosCi = { ultimo: resultado, historico };

  const destino = caminhoResultado(dirDados, resultado.projeto);
  const temporario = `${destino}.tmp`;
  writeFileSync(temporario, JSON.stringify(arquivo, null, 2), "utf8");
  renameSync(temporario, destino);
}
