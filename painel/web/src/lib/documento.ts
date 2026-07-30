import { parseMarkdown, textoPuro, type Bloco } from "./markdown";

/**
 * Quebra um documento de gestão (`ANALISE.md`, `DECISOES.md`, `PROGRESSO.md`) nas seções
 * de que ele é feito, para a tela mostrar ENTRADAS em vez de um muro de texto cortado no
 * meio.
 *
 * O que estava errado antes: o documento inteiro ia para um recorte de 14 LINHAS do
 * markdown cru. Nos arquivos da fábrica as primeiras linhas são o GABARITO do formato
 * (`## AAAA-MM-DD — <título da decisão>`, `**Decisão:** <o que foi decidido>`) — ou seja,
 * a tela mostrava rótulo com placeholder no lugar do dado, e o conteúdo real ficava
 * inteiro atrás do "Mostrar tudo". Aqui o gabarito é separado do conteúdo e as entradas
 * reais vêm primeiro.
 */

export interface EntradaDoc {
  /**
   * Título da seção, sem a data quando ela abre o título. Vazio quando o título é SÓ a
   * data (`## 2026-07-30`, o formato do PROGRESSO.md) — aí a data já é o título e
   * repeti-la ao lado seria ruído.
   */
  titulo: string;
  /** `2026-07-30` quando a seção é datada (DECISOES/PROGRESSO); null na ANALISE. */
  data: string | null;
  blocos: Bloco[];
  /** Começo do conteúdo, para o cabeçalho dizer algo com a entrada fechada. */
  previa: string;
}

export interface DocEstruturado {
  /** Título de nível 1 do arquivo, quando existe (a seção da página já o repete). */
  titulo: string | null;
  /** Abertura do arquivo + gabarito de formato: contexto, não conteúdo. */
  guia: Bloco[];
  entradas: EntradaDoc[];
}

/** `2026-07-30 — Título` → data + título. Traço opcional, en/em dash ou hífen. */
const RE_DATA = /^(\d{4}-\d{2}-\d{2})\s*[—–-]?\s*(.*)$/;

/**
 * Seção que descreve o FORMATO do arquivo, não uma entrada: o gabarito dos templates da
 * fábrica usa `AAAA-MM-DD` literal no título. É o bloco que mais confundia a leitura,
 * porque parece uma entrada e não tem dado nenhum.
 */
function ehGabarito(titulo: string): boolean {
  return /AAAA-MM-DD/.test(titulo);
}

function previaDe(blocos: Bloco[]): string {
  for (const b of blocos) {
    let texto = "";
    if (b.tipo === "paragrafo" || b.tipo === "citacao") texto = textoPuro(b.conteudo);
    else if (b.tipo === "definicao") {
      const primeiro = b.itens[0];
      if (primeiro !== undefined) texto = `${primeiro.rotulo}: ${textoPuro(primeiro.conteudo)}`;
    } else if (b.tipo === "lista") {
      const primeiro = b.itens[0];
      if (primeiro !== undefined) texto = textoPuro(primeiro.conteudo);
    }
    texto = texto.trim();
    if (texto !== "") return texto;
  }
  return "";
}

/**
 * Estrutura o documento. Sem seções (`##`), devolve tudo como uma entrada única sem
 * título — quem chama decide se vale a pena montar cards ou renderizar direto.
 */
export function estruturarDocumento(texto: string): DocEstruturado {
  const blocos = parseMarkdown(texto);

  let titulo: string | null = null;
  let inicio = 0;
  const primeiro = blocos[0];
  if (primeiro !== undefined && primeiro.tipo === "titulo" && primeiro.nivel === 1) {
    titulo = textoPuro(primeiro.conteudo).trim();
    inicio = 1;
  }

  const corpo = blocos.slice(inicio);
  // Nível de corte: o título mais alto usado no corpo. Documento que só usa `###` ainda
  // se divide em entradas.
  const niveis = corpo
    .filter((b): b is Extract<Bloco, { tipo: "titulo" }> => b.tipo === "titulo")
    .map((b) => b.nivel);
  const nivelCorte = niveis.length > 0 ? Math.min(...niveis) : 0;

  const guia: Bloco[] = [];
  const entradas: EntradaDoc[] = [];
  let atual: { titulo: string; data: string | null; blocos: Bloco[]; gabarito: boolean } | null =
    null;

  const fechar = () => {
    if (atual === null) return;
    if (atual.gabarito) {
      // O gabarito volta para o guia, junto do texto que o apresenta.
      guia.push({ tipo: "titulo", nivel: nivelCorte, conteudo: [{ tipo: "texto", valor: atual.titulo }] });
      guia.push(...atual.blocos);
    } else {
      entradas.push({
        titulo: atual.titulo,
        data: atual.data,
        blocos: atual.blocos,
        previa: previaDe(atual.blocos),
      });
    }
    atual = null;
  };

  for (const bloco of corpo) {
    if (nivelCorte > 0 && bloco.tipo === "titulo" && bloco.nivel === nivelCorte) {
      fechar();
      const bruto = textoPuro(bloco.conteudo).trim();
      const comData = RE_DATA.exec(bruto);
      atual = {
        titulo: comData !== null ? (comData[2] ?? "").trim() : bruto,
        data: comData !== null ? (comData[1] ?? null) : null,
        blocos: [],
        gabarito: ehGabarito(bruto),
      };
      continue;
    }
    if (atual === null) guia.push(bloco);
    else atual.blocos.push(bloco);
  }
  fechar();

  return { titulo, guia, entradas };
}
