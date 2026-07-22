import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { config } from "../config.js";
import type { NovoJob } from "../jobs/fila.js";

/**
 * Ação de ANÁLISE (T-012): um job "claude" que lê o código de um projeto e gera/atualiza
 * `_gestao/ANALISE.md` — arquitetura e funcionamento deduzidos só da leitura.
 *
 * Duas diferenças em relação às 6 ações de comando (acoes.ts):
 * 1. o `cwd` é o DIRETÓRIO DO PROJETO (não a raiz da fábrica) — o agente carrega o
 *    CLAUDE.md do projeto e enxerga o código como contexto (convenção do CLAUDE.md do painel);
 * 2. o prompt não é um slash-command e sim o texto versionado em `prompts/analise.md`.
 */

/** Projeto inexistente (ou nome com travessia de caminho) — a rota traduz para 404. */
export class ErroProjetoInexistente extends Error {
  constructor(projeto: string) {
    super(`Projeto não encontrado: "${projeto}"`);
    this.name = "ErroProjetoInexistente";
  }
}

/**
 * Resolve o diretório de um projeto sob `<fabrica>/projetos/`, barrando travessia de
 * caminho (nome com `..`, barra absoluta etc.). Retorna o caminho absoluto do projeto,
 * ou null se o nome escapa de `projetos/` ou a pasta não existe.
 */
export function dirProjeto(fabricaRaiz: string, projeto: string): string | null {
  const base = resolve(fabricaRaiz, "projetos");
  const alvo = resolve(base, projeto);
  // alvo tem que ser um SUBdiretório de base (não a própria base, não fora dela).
  if (alvo === base || !alvo.startsWith(base + sep)) return null;
  if (!existsSync(alvo) || !statSync(alvo).isDirectory()) return null;
  return alvo;
}

/** Caminho do prompt versionado, lido de `src/` (que acompanha o repo em dev e prod). */
function caminhoPrompt(raizPainel: string): string {
  return join(raizPainel, "servidor", "src", "acoes", "prompts", "analise.md");
}

/** Lê o prompt de análise versionado. Lança se o arquivo sumir (erro de instalação). */
export async function lerPromptAnalise(raizPainel: string = config.raizPainel): Promise<string> {
  return readFile(caminhoPrompt(raizPainel), "utf8");
}

export interface OpcoesAnalise {
  /** Modelo primário (alias) já resolvido da estratégia. */
  modelo: string;
  /** Fallback (alias) já resolvido; ausente/null = sem fallback. */
  fallback?: string | null;
  /** Guarda de custo opcional. */
  maxTurns?: number;
}

/**
 * Monta o job "claude" da análise de um projeto. Valida a existência do projeto (senão
 * lança `ErroProjetoInexistente`) e injeta o prompt versionado. Lock `projeto:<nome>`:
 * a análise trava só aquele projeto, então roda em paralelo com fluxos de outros.
 */
export async function montarJobAnalise(
  projeto: string,
  fabricaRaiz: string,
  opcoes: OpcoesAnalise,
): Promise<NovoJob> {
  const dir = dirProjeto(fabricaRaiz, projeto);
  if (dir === null) throw new ErroProjetoInexistente(projeto);

  const prompt = await lerPromptAnalise();

  return {
    tipo: "claude",
    titulo: `Analisar ${projeto}`,
    escopo: `projeto:${projeto}`,
    usaClaude: true,
    params: {
      prompt,
      cwd: dir,
      modelo: opcoes.modelo,
      ...(opcoes.fallback ? { fallback: opcoes.fallback } : {}),
      ...(opcoes.maxTurns !== undefined ? { maxTurns: opcoes.maxTurns } : {}),
    },
  };
}
