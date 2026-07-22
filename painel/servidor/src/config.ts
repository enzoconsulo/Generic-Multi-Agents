import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Este arquivo vive em servidor/src/ (dev via tsx) ou servidor/dist/ (produção);
// nos dois casos a raiz do painel está dois níveis acima.
const raizPainel = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Raiz da fábrica: o painel é ferramenta do sistema e vive em <fabrica>/painel.
// Sobrescrevível pela env FABRICA_RAIZ (testes usam fábricas falsas temporárias);
// resolve() blinda contra caminho relativo na env (dependeria do cwd). Env vazia = default.
const fabricaRaiz = process.env.FABRICA_RAIZ
  ? resolve(process.env.FABRICA_RAIZ)
  : resolve(raizPainel, "..");

// Porta da env validada na subida: valor inválido falha com mensagem clara,
// em vez de app.listen(NaN) estourar com RangeError críptico.
function portaDaEnv(): number {
  const bruto = process.env.PORTA;
  if (bruto === undefined || bruto.trim() === "") return 8765;
  const porta = Number(bruto);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
    throw new Error(
      `Env PORTA inválida: "${bruto}". Use um inteiro entre 1 e 65535 (padrão: 8765).`,
    );
  }
  return porta;
}

// Teto de execuções Claude simultâneas (jobs de projetos diferentes em paralelo).
// Decisão em _gestao/DECISOES.md (2026-07-21): default 2, sobrescrevível pela env.
function tetoJobsClaudeDaEnv(): number {
  const bruto = process.env.TETO_JOBS_CLAUDE;
  if (bruto === undefined || bruto.trim() === "") return 2;
  const teto = Number(bruto);
  if (!Number.isInteger(teto) || teto < 1) {
    throw new Error(
      `Env TETO_JOBS_CLAUDE inválida: "${bruto}". Use um inteiro >= 1 (padrão: 2).`,
    );
  }
  return teto;
}

// Modelos que o painel pode usar para disparar fluxos (headless não herda o modelo da
// sessão — precisa ser explícito). Ordenados do mais barato ao mais caro; o default é
// econômico de propósito (lição de custo registrada em DECISOES.md 2026-07-21).
const MODELOS_PERMITIDOS = ["haiku", "sonnet", "opus", "fable"] as const;
export type ModeloClaude = (typeof MODELOS_PERMITIDOS)[number];

function modeloPadraoDaEnv(): ModeloClaude {
  const bruto = process.env.MODELO_PADRAO?.trim();
  if (bruto === undefined || bruto === "") return "sonnet";
  if (!(MODELOS_PERMITIDOS as readonly string[]).includes(bruto)) {
    throw new Error(
      `Env MODELO_PADRAO inválida: "${bruto}". Use um de: ${MODELOS_PERMITIDOS.join(", ")}.`,
    );
  }
  return bruto as ModeloClaude;
}

export const config = {
  /** O servidor escuta SOMENTE em loopback — nunca expor fora da máquina. */
  host: "127.0.0.1",
  porta: portaDaEnv(),
  raizPainel,
  fabricaRaiz,
  /** Build da SPA servido em produção local. */
  webDist: resolve(raizPainel, "web", "dist"),
  /** Dados operacionais do painel (jobs, logs, CI) — pasta descartável, fora do git. */
  dirDados: resolve(raizPainel, "dados"),
  /** Máximo de jobs que usam Claude executando ao mesmo tempo. */
  tetoJobsClaude: tetoJobsClaudeDaEnv(),
  /** Modelo usado quando o disparo não especifica um (econômico por padrão). */
  modeloPadrao: modeloPadraoDaEnv(),
  /** Modelos que a UI pode escolher, do mais barato ao mais caro. */
  modelosPermitidos: MODELOS_PERMITIDOS,
} as const;

export function fabricaRaizExiste(): boolean {
  return existsSync(config.fabricaRaiz);
}
