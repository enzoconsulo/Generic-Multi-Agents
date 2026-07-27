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

// Dados operacionais do painel: sobrescrevível pela env DADOS_DIR (mesmo motivo da
// FABRICA_RAIZ — testes usam pastas temporárias em vez do `dados/` real do painel).
function dirDadosDaEnv(): string {
  return process.env.DADOS_DIR ? resolve(process.env.DADOS_DIR) : resolve(raizPainel, "dados");
}

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

// Tier de custo relativo (não é preço — é referência de "quão caro tende a ser").
export type TierCusto = "baixo" | "medio" | "alto";

/**
 * Estratégia de modelo oferecida ao disparar um fluxo. É DATA-DRIVEN: para adicionar,
 * remover ou mudar modelos/fallbacks, edite SÓ esta lista — o resto do sistema lê daqui.
 * `fallback` (opcional) usa o suporte nativo do SDK (`fallbackModel`): quando o primário
 * está sem limite/sobrecarregado, o fluxo cai para o fallback e re-tenta o primário a
 * cada turno (uma indisponibilidade temporária não rebaixa a sessão para sempre).
 */
export interface EstrategiaModelo {
  id: string;
  rotulo: string;
  modelo: string;
  fallback: string | null;
  custo: TierCusto;
  descricao: string;
}

const ESTRATEGIAS_MODELO: readonly EstrategiaModelo[] = [
  {
    id: "fable-opus",
    rotulo: "Fable → Opus",
    modelo: "fable",
    fallback: "opus",
    custo: "alto",
    descricao:
      "Prioriza o Fable (o mais capaz); se estiver sem limite ou sobrecarregado, cai automaticamente para o Opus. Melhor qualidade, com rede de segurança.",
  },
  {
    id: "fable",
    rotulo: "Fable",
    modelo: "fable",
    fallback: null,
    custo: "alto",
    descricao: "Fable puro, o mais capaz. Sem fallback: se ficar sem limite, o fluxo falha em vez de cair para o Opus.",
  },
  {
    id: "opus",
    rotulo: "Opus",
    modelo: "opus",
    fallback: null,
    custo: "alto",
    descricao: "Opus 4.8 — alta capacidade, um pouco mais barato que o Fable.",
  },
  {
    id: "sonnet",
    rotulo: "Sonnet",
    modelo: "sonnet",
    fallback: null,
    custo: "medio",
    descricao: "Equilíbrio entre qualidade e custo. Boa escolha padrão para trabalho rotineiro.",
  },
  {
    id: "haiku",
    rotulo: "Haiku",
    modelo: "haiku",
    fallback: null,
    custo: "baixo",
    descricao: "O mais rápido e barato. Ideal para ações leves como /status ou testes rápidos.",
  },
];

function estrategiaPadraoDaEnv(): string {
  const bruto = process.env.ESTRATEGIA_PADRAO?.trim();
  const ids = ESTRATEGIAS_MODELO.map((e) => e.id);
  if (bruto === undefined || bruto === "") return "sonnet";
  if (!ids.includes(bruto)) {
    throw new Error(`Env ESTRATEGIA_PADRAO inválida: "${bruto}". Use um de: ${ids.join(", ")}.`);
  }
  return bruto;
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
  dirDados: dirDadosDaEnv(),
  /** Máximo de jobs que usam Claude executando ao mesmo tempo. */
  tetoJobsClaude: tetoJobsClaudeDaEnv(),
  /** Estratégias de modelo que a UI oferece (data-driven). */
  estrategiasModelo: ESTRATEGIAS_MODELO,
  /** Estratégia usada quando o disparo não especifica uma (econômica por padrão). */
  estrategiaPadrao: estrategiaPadraoDaEnv(),
} as const;

/** Resolve uma estratégia pelo id (ou undefined se não existir). */
export function resolverEstrategia(id: string): EstrategiaModelo | undefined {
  return config.estrategiasModelo.find((e) => e.id === id);
}

export function fabricaRaizExiste(): boolean {
  return existsSync(config.fabricaRaiz);
}
