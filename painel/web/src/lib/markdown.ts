/**
 * Parser de Markdown mínimo (T-026) — converte o texto dos documentos da fábrica
 * (`ANALISE.md`, `DECISOES.md`, `PROGRESSO.md`, seções das tarefas) numa árvore de blocos
 * que o React renderiza como elementos.
 *
 * POR QUE NÃO USAR UMA BIBLIOTECA: o conteúdo é gerado pelos próprios agentes e usa um
 * subconjunto pequeno e previsível (títulos, listas, negrito, código). Um parser de ~100
 * linhas evita mais uma dependência num projeto que já rejeitou dependência redundante
 * antes (ver `taskkill` vs `tree-kill` em DECISOES.md).
 *
 * POR QUE NÃO `dangerouslySetInnerHTML`: gerando ELEMENTOS, o React escapa tudo sozinho —
 * não há caminho para injeção, mesmo que um agente escreva `<script>` num documento.
 *
 * Limitação assumida: tabelas não são suportadas (o conteúdo real não usa). Linha de
 * tabela cai como parágrafo, legível, sem quebrar nada.
 */

export type Inline =
  | { tipo: "texto"; valor: string }
  | { tipo: "forte"; valor: string }
  | { tipo: "enfase"; valor: string }
  | { tipo: "codigo"; valor: string }
  | { tipo: "link"; valor: string; href: string };

export type Bloco =
  | { tipo: "titulo"; nivel: number; conteudo: Inline[] }
  | { tipo: "paragrafo"; conteudo: Inline[] }
  | { tipo: "lista"; ordenada: boolean; itens: Inline[][] }
  | { tipo: "codigo"; texto: string }
  | { tipo: "citacao"; conteudo: Inline[] }
  | { tipo: "regua" };

/** Ordem importa: código inline primeiro, para `**` dentro de crase não virar negrito. */
const PADRAO_INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)/;

/** Quebra uma linha em pedaços (texto/negrito/código/link/ênfase). */
export function parseInline(texto: string): Inline[] {
  const saida: Inline[] = [];
  let resto = texto;

  while (resto !== "") {
    const achado = PADRAO_INLINE.exec(resto);
    if (achado === null || achado.index === undefined) break;

    if (achado.index > 0) saida.push({ tipo: "texto", valor: resto.slice(0, achado.index) });
    const bruto = achado[0];

    if (bruto.startsWith("`")) {
      saida.push({ tipo: "codigo", valor: bruto.slice(1, -1) });
    } else if (bruto.startsWith("**")) {
      saida.push({ tipo: "forte", valor: bruto.slice(2, -2) });
    } else if (bruto.startsWith("[")) {
      const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(bruto);
      if (m) saida.push({ tipo: "link", valor: m[1] ?? "", href: m[2] ?? "" });
    } else {
      saida.push({ tipo: "enfase", valor: bruto.slice(1, -1) });
    }
    resto = resto.slice(achado.index + bruto.length);
  }

  if (resto !== "") saida.push({ tipo: "texto", valor: resto });
  return saida;
}

/** Converte o texto inteiro em blocos. Nunca lança: entrada estranha vira parágrafo. */
export function parseMarkdown(texto: string): Bloco[] {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const blocos: Bloco[] = [];

  let paragrafo: string[] = [];
  const fecharParagrafo = () => {
    if (paragrafo.length === 0) return;
    blocos.push({ tipo: "paragrafo", conteudo: parseInline(paragrafo.join(" ")) });
    paragrafo = [];
  };

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i] ?? "";

    // Bloco de código cercado: consome literal até o fechamento (ou o fim do texto).
    if (/^\s*```/.test(linha)) {
      fecharParagrafo();
      const dentro: string[] = [];
      i++;
      while (i < linhas.length && !/^\s*```/.test(linhas[i] ?? "")) {
        dentro.push(linhas[i] ?? "");
        i++;
      }
      blocos.push({ tipo: "codigo", texto: dentro.join("\n") });
      continue;
    }

    if (linha.trim() === "") {
      fecharParagrafo();
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(linha)) {
      fecharParagrafo();
      blocos.push({ tipo: "regua" });
      continue;
    }

    const titulo = /^(#{1,6})\s+(.*)$/.exec(linha);
    if (titulo) {
      fecharParagrafo();
      blocos.push({
        tipo: "titulo",
        nivel: (titulo[1] ?? "#").length,
        conteudo: parseInline(titulo[2] ?? ""),
      });
      continue;
    }

    const citacao = /^\s*>\s?(.*)$/.exec(linha);
    if (citacao) {
      fecharParagrafo();
      blocos.push({ tipo: "citacao", conteudo: parseInline(citacao[1] ?? "") });
      continue;
    }

    const item = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(linha);
    if (item) {
      fecharParagrafo();
      const ordenada = /\d/.test(item[1] ?? "");
      const ultimo = blocos.at(-1);
      // Continua a lista anterior em vez de abrir uma nova a cada item.
      if (ultimo?.tipo === "lista" && ultimo.ordenada === ordenada) {
        ultimo.itens.push(parseInline(item[2] ?? ""));
      } else {
        blocos.push({ tipo: "lista", ordenada, itens: [parseInline(item[2] ?? "")] });
      }
      continue;
    }

    paragrafo.push(linha.trim());
  }

  fecharParagrafo();
  return blocos;
}
