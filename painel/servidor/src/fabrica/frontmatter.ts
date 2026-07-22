import matter from "gray-matter";

/** Resultado do parse de frontmatter que nunca lança: YAML inválido vira `erro`. */
export interface ResultadoFrontmatter {
  dados: Record<string, unknown>;
  /** Corpo após o frontmatter; com YAML inválido, o TEXTO INTEGRAL do arquivo. */
  corpo: string;
  erro: string | null;
}

export function separarFrontmatter(texto: string): ResultadoFrontmatter {
  try {
    // ARMADILHA do gray-matter: sem options ele CACHEIA o objeto ANTES de parsear;
    // se o YAML lança, o cache fica envenenado e a chamada seguinte com o mesmo
    // conteúdo retorna "sucesso" com data vazio. Passar um objeto (mesmo vazio)
    // desativa o cache e mantém o erro determinístico.
    const { data, content } = matter(texto, {});
    return { dados: data as Record<string, unknown>, corpo: content, erro: null };
  } catch (causa) {
    return {
      dados: {},
      corpo: texto,
      erro: `frontmatter inválido: ${mensagemDoErro(causa)}`,
    };
  }
}

export function mensagemDoErro(causa: unknown): string {
  if (causa instanceof Error) {
    // js-yaml embute um trecho multilinha do arquivo na mensagem; só a 1ª linha importa.
    return causa.message.split("\n", 1)[0] ?? causa.message;
  }
  return String(causa);
}

/** String não vazia (trim aplicado) ou null. Números/booleans do YAML viram texto —
 *  `prioridade: 1` aparece como "1" na UI e reprova na validação de vocabulário. */
export function campoTexto(valor: unknown): string | null {
  if (typeof valor === "string") {
    const limpo = valor.trim();
    return limpo === "" ? null : limpo;
  }
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  return null;
}

/** Lista de strings ou null quando o valor não é um array. Itens não-string são
 *  convertidos (YAML pode ler `T-002` de formas criativas dependendo de aspas). */
export function campoLista(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) return null;
  return valor.map((item) => String(item).trim()).filter((item) => item !== "");
}

/** Normaliza data do YAML para "AAAA-MM-DD". O js-yaml converte `2026-07-21` em Date
 *  (UTC), por isso o slice do toISOString é seguro; strings já no formato passam direto. */
export function normalizarData(valor: unknown): string | null {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) {
    return valor.trim();
  }
  return null;
}
