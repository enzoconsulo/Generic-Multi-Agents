import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { EstagioCi } from "./config.js";

/**
 * Persistência dos resultados de execução de CI (T-017): decisão em DECISOES.md
 * 2026-07-21 — resultado da execução é operacional, fica em `dados/ci/<projeto>.json`
 * do PAINEL (não do projeto), descartável e fora do git.
 */

export type EstadoEstagioCi = "sucesso" | "falhou" | "pulado" | "cancelado";
export type EstadoResultadoCi =
  | "executando"
  | "sucesso"
  | "falhou"
  | "cancelado"
  /** O processo do painel caiu no meio do pipeline (reconciliado no boot — T-019). */
  | "interrompido";

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

/**
 * Reconcilia resultados de CI deixados como `executando` por um processo que caiu (T-019).
 * No boot nada está rodando, então todo `executando` no disco é órfão: sem isto, a aba
 * CI/CD (T-018) exibiria "executando" para sempre. Devolve quantos foram corrigidos;
 * nunca lança (boot não pode falhar por causa de arquivo de histórico).
 */
export function reconciliarResultadosOrfaos(dirDados: string): number {
  const dir = dirCi(dirDados);
  if (!existsSync(dir)) return 0;

  let corrigidos = 0;
  for (const nome of readdirSync(dir)) {
    if (!nome.endsWith(".json")) continue;
    const projeto = nome.slice(0, -".json".length);
    try {
      const arquivo = lerResultados(dirDados, projeto);
      if (arquivo === null) continue;

      let mudou = false;
      const orfao = (r: ResultadoCi): ResultadoCi => {
        if (r.estado !== "executando") return r;
        mudou = true;
        return {
          ...r,
          estado: "interrompido",
          terminadoEm: r.terminadoEm ?? new Date().toISOString(),
          estagios: r.estagios.map((e) =>
            e.estado === "sucesso" || e.estado === "falhou" || e.estado === "pulado"
              ? e
              : { ...e, estado: "cancelado" },
          ),
        };
      };

      const atualizado = {
        ultimo: orfao(arquivo.ultimo),
        historico: arquivo.historico.map(orfao),
      };
      if (!mudou) continue;

      const destino = caminhoResultado(dirDados, projeto);
      const temporario = `${destino}.tmp`;
      writeFileSync(temporario, JSON.stringify(atualizado, null, 2), "utf8");
      renameSync(temporario, destino);
      corrigidos += 1;
    } catch (erro) {
      console.warn(
        `[ci] Não foi possível reconciliar o histórico de "${projeto}": ` +
          `${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }
  return corrigidos;
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
