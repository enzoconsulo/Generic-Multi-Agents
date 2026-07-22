import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgenteEspecialista, EquipeProjeto } from "./tipos.js";

/**
 * Leitor da EQUIPE do projeto (agentes dinâmicos) — `projetos/<nome>/_gestao/equipe.json`.
 * Especialistas sintetizados pela ideia do projeto (gerados pelo planejador). Ausência do
 * arquivo é NORMAL (projeto usa o executor genérico); nunca lança — arquivo malformado ou
 * agente inválido aparece com `erros` preenchido e o resto segue.
 *
 * Formato de `equipe.json`:
 *   { "agentes": [ { "id","nome","descricao","prompt","ferramentas": string[]? } ] }
 */
export async function lerEquipe(raiz: string, nomeProjeto: string): Promise<EquipeProjeto> {
  const caminho = join(raiz, "projetos", nomeProjeto, "_gestao", "equipe.json");

  let texto: string;
  try {
    texto = await readFile(caminho, "utf8");
  } catch {
    return { agentes: [], erros: [] }; // sem equipe.json = sem especialistas (normal)
  }

  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    return {
      agentes: [],
      erros: [`equipe.json inválido: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const bruto = (dados as { agentes?: unknown }).agentes;
  if (!Array.isArray(bruto)) {
    return { agentes: [], erros: ["equipe.json sem o array `agentes`"] };
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

  return { agentes, erros: [] };
}

/** Só os agentes prontos para injeção (id + prompt válidos, sem erros de validação). */
export function agentesValidos(equipe: EquipeProjeto): AgenteEspecialista[] {
  return equipe.agentes.filter((a) => a.erros.length === 0 && a.prompt.trim() !== "");
}
