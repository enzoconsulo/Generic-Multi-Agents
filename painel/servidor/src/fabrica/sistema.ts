import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { campoTexto, separarFrontmatter } from "./frontmatter.js";
import { STATUS_IDEIA, type Ideia, type LogDiario } from "./tipos.js";

/** Ideias da caixa de entrada `_sistema/ideias/` (README.md excluído), em ordem de
 *  nome de arquivo (= cronológica, pelo prefixo AAAA-MM-DD). Pasta ausente = []. */
export async function lerIdeias(raiz: string): Promise<Ideia[]> {
  const dir = join(raiz, "_sistema", "ideias");
  let nomes: string[];
  try {
    nomes = await readdir(dir);
  } catch {
    return [];
  }
  const arquivos = nomes
    .filter((nome) => nome.toLowerCase().endsWith(".md"))
    .filter((nome) => nome.toLowerCase() !== "readme.md")
    .sort();

  const ideias: Ideia[] = [];
  for (const nome of arquivos) {
    const texto = await readFile(join(dir, nome), "utf8");
    ideias.push(parsearIdeia(nome, texto));
  }
  return ideias;
}

/** Parse de um arquivo de ideia; nunca lança (problemas vão para `erros`). */
export function parsearIdeia(arquivo: string, texto: string): Ideia {
  const erros: string[] = [];
  const { dados, corpo, erro } = separarFrontmatter(texto);
  if (erro !== null) erros.push(erro);

  const status = campoTexto(dados["status"]) ?? "";
  if (status === "") {
    erros.push("campo status ausente ou inválido");
  } else if (!(STATUS_IDEIA as readonly string[]).includes(status)) {
    erros.push(`status desconhecido: "${status}"`);
  }

  const conteudo = corpo.trim();
  const tituloDoCorpo = conteudo.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const slug = arquivo
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/\.md$/i, "");

  return {
    arquivo,
    titulo: tituloDoCorpo ?? slug,
    status,
    data: arquivo.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null,
    conteudo,
    erros,
  };
}

/** Log diário mais recente de `_sistema/logs/` (nome `AAAA-MM-DD.md`; a ordenação
 *  lexicográfica do nome É a cronológica). Sem logs (ou sem pasta) → null. */
export async function lerLogMaisRecente(raiz: string): Promise<LogDiario | null> {
  const dir = join(raiz, "_sistema", "logs");
  let nomes: string[];
  try {
    nomes = await readdir(dir);
  } catch {
    return null;
  }
  const maisRecente = nomes
    .filter((nome) => /^\d{4}-\d{2}-\d{2}\.md$/.test(nome))
    .sort()
    .at(-1);
  if (maisRecente === undefined) return null;

  return {
    arquivo: maisRecente,
    data: maisRecente.slice(0, 10),
    conteudo: await readFile(join(dir, maisRecente), "utf8"),
  };
}
