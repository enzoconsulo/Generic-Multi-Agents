import { IDS_ACOES, type IdAcao } from "../fabrica/catalogo-acoes.js";
import type { NovoJob } from "../jobs/fila.js";
import type { EscopoLock } from "../jobs/tipos.js";

/**
 * Traduz uma ação da fábrica (um dos 6 comandos) num job "claude" (T-011). O prompt é o
 * próprio comando (`/status painel-fabrica`) — o Claude Code expande commands/skills no
 * headless (ver pesquisa §1). O cwd é SEMPRE a raiz da fábrica: é o que carrega o
 * CLAUDE.md do orquestrador, os agentes e o allowlist, como a sessão interativa do Enzo.
 */

/** Ação inexistente (a rota traduz para 404). */
export class ErroAcaoDesconhecida extends Error {
  constructor(id: string) {
    super(`Ação desconhecida: "${id}"`);
    this.name = "ErroAcaoDesconhecida";
  }
}

/** Ações que sempre travam a fábrica inteira (orquestração ou escrita global). */
const ACOES_SEMPRE_GLOBAIS: ReadonlySet<IdAcao> = new Set([
  "novo-projeto",
  "ideia",
  "encerrar-dia",
  "manutencao",
]);

export interface PedidoAcao {
  id: string;
  /** Texto dos argumentos do comando (ex.: nome do projeto). */
  argumentos?: string;
  /** Modelo primário (alias) já resolvido da estratégia. */
  modelo: string;
  /** Fallback (alias) já resolvido da estratégia; ausente = sem fallback. */
  fallback?: string | null;
  /** Agentes dinâmicos (options.agents do SDK) — só para /trabalhar com equipe. */
  agentes?: Record<string, unknown>;
  /** Guarda de custo opcional. */
  maxTurns?: number;
}

/**
 * Escopo de lock (decisão em DECISOES.md 2026-07-21): ações globais travam tudo;
 * `trabalhar`/`status` COM um projeto no 1º argumento travam só aquele projeto; sem
 * argumento, são globais (varrem a fábrica inteira).
 */
function escopoDaAcao(id: IdAcao, argumentos: string): EscopoLock {
  if (ACOES_SEMPRE_GLOBAIS.has(id)) return "global";
  if (id === "trabalhar" || id === "status") {
    const projeto = argumentos.split(/\s+/)[0]?.trim();
    if (projeto !== undefined && projeto !== "") return `projeto:${projeto}`;
  }
  return "global";
}

export function montarJobAcao(pedido: PedidoAcao, fabricaRaiz: string): NovoJob {
  if (!(IDS_ACOES as readonly string[]).includes(pedido.id)) {
    throw new ErroAcaoDesconhecida(pedido.id);
  }
  const id = pedido.id as IdAcao;
  const args = (pedido.argumentos ?? "").trim();
  const prompt = args === "" ? `/${id}` : `/${id} ${args}`;

  return {
    tipo: "claude",
    titulo: prompt,
    escopo: escopoDaAcao(id, args),
    usaClaude: true,
    params: {
      prompt,
      cwd: fabricaRaiz,
      modelo: pedido.modelo,
      ...(pedido.fallback ? { fallback: pedido.fallback } : {}),
      ...(pedido.agentes && Object.keys(pedido.agentes).length > 0
        ? { agentes: pedido.agentes }
        : {}),
      ...(pedido.maxTurns !== undefined ? { maxTurns: pedido.maxTurns } : {}),
    },
  };
}
