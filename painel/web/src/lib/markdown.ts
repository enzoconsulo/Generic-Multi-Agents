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
 * O que os documentos REAIS usam e que a primeira versão não atendia (e por isso a tela
 * mostrava rótulo sem o dado):
 * - **Continuação de item de lista**: a segunda linha, indentada, virava um parágrafo
 *   solto NO MEIO da lista — partia a lista em duas e separava o item do próprio texto.
 * - **Sublista indentada**: os sub-itens caíam no mesmo nível do pai, achatando a
 *   hierarquia que a análise usa para descrever módulos e submódulos.
 * - **Linhas `**Rótulo:** valor`** (DECISOES/PROGRESSO): linhas seguidas viram um
 *   parágrafo só, então "Decisão: … Motivo: … Quem: …" saía tudo grudado numa frase.
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

/** Item de lista, com a sublista que estiver pendurada nele. */
export interface ItemLista {
  conteudo: Inline[];
  sublista: BlocoLista | null;
}

export interface BlocoLista {
  tipo: "lista";
  ordenada: boolean;
  itens: ItemLista[];
}

/** Um `**Rótulo:** valor` — o formato das entradas de DECISOES.md e PROGRESSO.md. */
export interface ParDefinicao {
  rotulo: string;
  conteudo: Inline[];
}

export interface BlocoDefinicao {
  tipo: "definicao";
  itens: ParDefinicao[];
}

export type Bloco =
  | { tipo: "titulo"; nivel: number; conteudo: Inline[] }
  | { tipo: "paragrafo"; conteudo: Inline[] }
  | BlocoLista
  | BlocoDefinicao
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

/** Texto sem marcação — para prévias e para casar título com data. */
export function textoPuro(conteudo: Inline[]): string {
  return conteudo.map((p) => p.valor).join("");
}

const RE_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
/** `**Rótulo:** valor` no começo da linha. O rótulo é curto por definição. */
const RE_DEFINICAO = /^\*\*([^*]{1,80}):\*\*\s*(.*)$/;

/** Converte o texto inteiro em blocos. Nunca lança: entrada estranha vira parágrafo. */
export function parseMarkdown(texto: string): Bloco[] {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const blocos: Bloco[] = [];

  // Acumuladores de texto CRU: a marcação atravessa quebra de linha nos documentos reais
  // (`**um negrito que\ncontinua**`), então o inline só é parseado no fechamento — como
  // já acontecia com o parágrafo desde a primeira versão.
  let paragrafo: string[] = [];
  let item: { bruto: string[]; alvo: ItemLista } | null = null;
  let definicao: { bruto: string[]; alvo: ParDefinicao } | null = null;
  /** Listas abertas, da mais externa para a mais interna, com o recuo de cada nível. */
  let pilha: { lista: BlocoLista; recuo: number }[] = [];

  const fecharParagrafo = () => {
    if (paragrafo.length === 0) return;
    blocos.push({ tipo: "paragrafo", conteudo: parseInline(paragrafo.join(" ")) });
    paragrafo = [];
  };
  const fecharItem = () => {
    if (item === null) return;
    item.alvo.conteudo = parseInline(item.bruto.join(" "));
    item = null;
  };
  const fecharDefinicao = () => {
    if (definicao === null) return;
    definicao.alvo.conteudo = parseInline(definicao.bruto.join(" "));
    definicao = null;
  };
  const fecharListas = () => {
    fecharItem();
    pilha = [];
  };
  const fecharTudo = () => {
    fecharParagrafo();
    fecharDefinicao();
    fecharListas();
  };

  const recuoDe = (espacos: string) => espacos.replace(/\t/g, "    ").length;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i] ?? "";

    // Bloco de código cercado: consome literal até o fechamento (ou o fim do texto).
    if (/^\s*```/.test(linha)) {
      fecharTudo();
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
      // Fecha o que está em curso, mas NÃO a pilha de listas: item separado por linha em
      // branco continua na mesma lista (é lista "solta", não lista nova).
      fecharParagrafo();
      fecharDefinicao();
      fecharItem();
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(linha)) {
      fecharTudo();
      blocos.push({ tipo: "regua" });
      continue;
    }

    const titulo = /^(#{1,6})\s+(.*)$/.exec(linha);
    if (titulo) {
      fecharTudo();
      blocos.push({
        tipo: "titulo",
        nivel: (titulo[1] ?? "#").length,
        conteudo: parseInline(titulo[2] ?? ""),
      });
      continue;
    }

    const citacao = /^\s*>\s?(.*)$/.exec(linha);
    if (citacao) {
      fecharTudo();
      blocos.push({ tipo: "citacao", conteudo: parseInline(citacao[1] ?? "") });
      continue;
    }

    const def = RE_DEFINICAO.exec(linha);
    if (def) {
      fecharParagrafo();
      fecharListas();
      fecharDefinicao();
      const par: ParDefinicao = { rotulo: (def[1] ?? "").trim(), conteudo: [] };
      // Rótulos seguidos (Decisão/Motivo/Quem) formam UM bloco: é uma ficha, não três
      // parágrafos avulsos.
      const ultimo = blocos.at(-1);
      if (ultimo !== undefined && ultimo.tipo === "definicao") ultimo.itens.push(par);
      else blocos.push({ tipo: "definicao", itens: [par] });
      definicao = { bruto: [def[2] ?? ""], alvo: par };
      continue;
    }

    const marcado = RE_ITEM.exec(linha);
    if (marcado) {
      fecharParagrafo();
      fecharDefinicao();
      fecharItem();

      const recuo = recuoDe(marcado[1] ?? "");
      const ordenada = /^\d/.test(marcado[2] ?? "");
      const novo: ItemLista = { conteudo: [], sublista: null };

      // Volta para o nível deste item, fechando as sublistas mais fundas.
      while (pilha.length > 1 && (pilha.at(-1)?.recuo ?? 0) > recuo) pilha.pop();
      const topo = pilha.at(-1);

      if (topo === undefined) {
        const lista: BlocoLista = { tipo: "lista", ordenada, itens: [novo] };
        blocos.push(lista);
        pilha = [{ lista, recuo }];
      } else if (recuo >= topo.recuo + 2 && topo.lista.itens.length > 0) {
        // Indentado a mais: sublista pendurada no item anterior deste nível.
        const pai = topo.lista.itens[topo.lista.itens.length - 1] as ItemLista;
        const lista: BlocoLista = { tipo: "lista", ordenada, itens: [novo] };
        pai.sublista = lista;
        pilha.push({ lista, recuo });
      } else if (pilha.length === 1 && topo.lista.ordenada !== ordenada) {
        // Trocou de tipo no nível raiz: lista nova, senão o marcador mentiria.
        const lista: BlocoLista = { tipo: "lista", ordenada, itens: [novo] };
        blocos.push(lista);
        pilha = [{ lista, recuo }];
      } else {
        topo.lista.itens.push(novo);
      }

      item = { bruto: [marcado[3] ?? ""], alvo: novo };
      continue;
    }

    // Linha sem marcação: continua o que estiver aberto antes de virar parágrafo novo.
    if (item !== null && /^\s/.test(linha)) {
      // Continuação indentada do item — o texto pertence ao item, não à lista.
      item.bruto.push(linha.trim());
      continue;
    }
    if (definicao !== null) {
      // Continuação do valor. Aqui NÃO se exige indentação: os documentos da fábrica
      // quebram a linha do `**Decisão:**` na margem, sem indentar.
      definicao.bruto.push(linha.trim());
      continue;
    }

    fecharListas();
    paragrafo.push(linha.trim());
  }

  fecharTudo();
  return blocos;
}
