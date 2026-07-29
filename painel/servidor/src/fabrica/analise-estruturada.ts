import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Leitor da análise ESTRUTURADA do projeto (T-041) — `_gestao/analise.json`.
 *
 * O `.md` continua sendo o que um humano lê fora do painel; este JSON existe para a tela
 * poder DESENHAR a análise (cards, fluxo, pontos de atenção) em vez de exibir texto
 * corrido. Os dois são gerados na mesma passada do fluxo de análise — em momentos
 * diferentes eles divergiriam, e aí a tela mentiria sobre o `.md`.
 *
 * Nunca lança e nunca exige o arquivo: projeto analisado ANTES da T-041 só tem o `.md`, e
 * a tela precisa continuar funcionando com ele. Ausência é `null`, não erro.
 */

export interface PecaAnalise {
  nome: string;
  papel: string;
}

export type GravidadeAtencao = "alta" | "media" | "baixa";

export interface PontoAtencao {
  texto: string;
  gravidade: GravidadeAtencao;
}

export interface AnaliseEstruturada {
  oQueFaz: string;
  pecas: PecaAnalise[];
  fluxo: string[];
  stack: string[];
  atencao: PontoAtencao[];
}

const GRAVIDADES: ReadonlySet<string> = new Set(["alta", "media", "baixa"]);

/** Texto não-vazio, ou null. Corta o que viria como número, objeto ou string em branco. */
function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

/** Lista de textos, ignorando os itens inválidos em vez de derrubar a análise inteira. */
function listaDeTextos(valor: unknown, teto: number): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map(texto)
    .filter((t): t is string => t !== null)
    .slice(0, teto);
}

/**
 * Normaliza o que veio do disco. Tolerante de propósito: o arquivo é escrito por um
 * modelo, e um campo torto não pode custar a tela inteira — vira vazio e o resto aparece.
 */
export function normalizarAnalise(dados: unknown): AnaliseEstruturada | null {
  if (dados === null || typeof dados !== "object" || Array.isArray(dados)) return null;
  const obj = dados as Record<string, unknown>;

  const oQueFaz = texto(obj["oQueFaz"]) ?? "";

  const pecas = Array.isArray(obj["pecas"])
    ? obj["pecas"]
        .map((p) => {
          const item = (p ?? {}) as Record<string, unknown>;
          const nome = texto(item["nome"]);
          return nome === null ? null : { nome, papel: texto(item["papel"]) ?? "" };
        })
        .filter((p): p is PecaAnalise => p !== null)
        .slice(0, 8)
    : [];

  const atencao = Array.isArray(obj["atencao"])
    ? obj["atencao"]
        .map((a) => {
          const item = (a ?? {}) as Record<string, unknown>;
          const t = texto(item["texto"]);
          if (t === null) return null;
          const g = typeof item["gravidade"] === "string" ? item["gravidade"] : "";
          // Gravidade desconhecida vira `media`: sumir com o ponto seria pior que
          // classificá-lo no meio.
          return { texto: t, gravidade: (GRAVIDADES.has(g) ? g : "media") as GravidadeAtencao };
        })
        .filter((a): a is PontoAtencao => a !== null)
    : [];

  const analise: AnaliseEstruturada = {
    oQueFaz,
    pecas,
    fluxo: listaDeTextos(obj["fluxo"], 6),
    stack: listaDeTextos(obj["stack"], 20),
    atencao,
  };

  // Objeto sem NADA aproveitável não vale uma tela vazia — melhor cair no `.md`.
  const vazio =
    analise.oQueFaz === "" &&
    analise.pecas.length === 0 &&
    analise.fluxo.length === 0 &&
    analise.stack.length === 0 &&
    analise.atencao.length === 0;
  return vazio ? null : analise;
}

/**
 * Lê `projetos/<nome>/_gestao/analise.json`. `null` quando o arquivo não existe (projeto
 * nunca analisado, ou analisado antes da T-041) ou quando o conteúdo não é aproveitável —
 * nos dois casos a tela cai no `.md`, que continua sendo gravado.
 */
export async function lerAnaliseEstruturada(
  raiz: string,
  nomeProjeto: string,
): Promise<AnaliseEstruturada | null> {
  const caminho = join(raiz, "projetos", nomeProjeto, "_gestao", "analise.json");
  let bruto: string;
  try {
    bruto = await readFile(caminho, "utf8");
  } catch {
    return null; // ausência é normal, não erro
  }
  try {
    return normalizarAnalise(JSON.parse(bruto));
  } catch {
    // JSON malformado não pode derrubar a página do projeto — cai no `.md`.
    return null;
  }
}
