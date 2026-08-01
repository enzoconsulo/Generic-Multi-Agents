import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOMINIO_PADRAO, type AgenteEspecialista, type EquipeProjeto } from "./tipos.js";

/**
 * Leitor da EQUIPE do projeto (agentes dinâmicos) — `projetos/<nome>/_gestao/equipe.json`.
 * Especialistas sintetizados pela ideia do projeto (gerados pelo planejador). Ausência do
 * arquivo é NORMAL (projeto usa o construtor genérico); nunca lança — arquivo malformado ou
 * agente inválido aparece com `erros` preenchido e o resto segue.
 *
 * Formato de `equipe.json`:
 *   { "dominio": "software"?, "agentes": [ { "id","nome","descricao","prompt","ferramentas": string[]? } ] }
 *
 * `dominio` é o campo que ROTEIA a trilha (CLAUDE.md, "As duas trilhas"). Ele é opcional
 * de propósito: ausente = `software`, então nenhum projeto anterior à trilha genérica muda
 * de comportamento por existir esse campo.
 */
export async function lerEquipe(raiz: string, nomeProjeto: string): Promise<EquipeProjeto> {
  const caminho = join(raiz, "projetos", nomeProjeto, "_gestao", "equipe.json");

  let texto: string;
  try {
    texto = await readFile(caminho, "utf8");
  } catch {
    // sem equipe.json = sem especialistas e trilha de software (o normal)
    return { dominio: DOMINIO_PADRAO, agentes: [], erros: [] };
  }

  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    return {
      dominio: DOMINIO_PADRAO,
      agentes: [],
      erros: [`equipe.json inválido: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const dominio = lerDominio((dados as { dominio?: unknown }).dominio);

  const bruto = (dados as { agentes?: unknown }).agentes;
  if (!Array.isArray(bruto)) {
    return { dominio, agentes: [], erros: ["equipe.json sem o array `agentes`"] };
  }

  const agentes: AgenteEspecialista[] = [];
  const idsVistos = new Set<string>();
  for (let i = 0; i < bruto.length; i++) {
    const item = (bruto[i] ?? {}) as Record<string, unknown>;
    const erros: string[] = [];

    const id = typeof item["id"] === "string" ? item["id"].trim() : "";
    const prompt = typeof item["prompt"] === "string" ? item["prompt"] : "";
    const nome = typeof item["nome"] === "string" && item["nome"].trim() !== "" ? item["nome"] : id;
    const descricao = typeof item["descricao"] === "string" ? item["descricao"] : "";
    const ferramentas = Array.isArray(item["ferramentas"])
      ? item["ferramentas"].filter((f): f is string => typeof f === "string")
      : null;

    if (id === "") erros.push("agente sem `id`");
    else if (!/^[a-z0-9-]+$/.test(id)) erros.push(`id inválido "${id}" (use minúsculas, números e hífen)`);
    if (prompt.trim() === "") erros.push("agente sem `prompt`");
    if (id !== "" && idsVistos.has(id)) erros.push(`id duplicado "${id}"`);
    if (id !== "") idsVistos.add(id);

    agentes.push({ id: id !== "" ? id : `agente-${i}`, nome, descricao, prompt, ferramentas, erros });
  }

  return { dominio, agentes, erros: [] };
}

/**
 * Normaliza o `dominio` declarado. Valor ausente, vazio ou de tipo errado cai no padrão —
 * **nunca vira erro que bloqueia a leitura**: um typo no domínio não pode impedir o painel
 * de mostrar o projeto, e cair em `software` é o desfecho conservador (é a trilha calibrada).
 */
function lerDominio(bruto: unknown): string {
  if (typeof bruto !== "string") return DOMINIO_PADRAO;
  const limpo = bruto.trim().toLowerCase();
  return /^[a-z0-9-]+$/.test(limpo) ? limpo : DOMINIO_PADRAO;
}

/** `true` quando o projeto roda na trilha genérica (qualquer domínio != software). */
export function ehTrilhaGenerica(equipe: EquipeProjeto): boolean {
  return equipe.dominio !== DOMINIO_PADRAO;
}

/** Só os agentes prontos para injeção (id + prompt válidos, sem erros de validação). */
export function agentesValidos(equipe: EquipeProjeto): AgenteEspecialista[] {
  return equipe.agentes.filter((a) => a.erros.length === 0 && a.prompt.trim() !== "");
}
