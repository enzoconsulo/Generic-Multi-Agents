import { describe, expect, it } from "vitest";
import {
  parseInline,
  parseMarkdown,
  textoPuro,
  type BlocoDefinicao,
  type BlocoLista,
} from "../src/lib/markdown";

describe("parseInline", () => {
  it("reconhece negrito, código, ênfase e link", () => {
    expect(parseInline("a **forte** b `cod` c *it* [x](http://y)")).toEqual([
      { tipo: "texto", valor: "a " },
      { tipo: "forte", valor: "forte" },
      { tipo: "texto", valor: " b " },
      { tipo: "codigo", valor: "cod" },
      { tipo: "texto", valor: " c " },
      { tipo: "enfase", valor: "it" },
      { tipo: "texto", valor: " " },
      { tipo: "link", valor: "x", href: "http://y" },
    ]);
  });

  // Código inline vem antes na ordem justamente para isto.
  it("`**` DENTRO de crase é código, não negrito", () => {
    expect(parseInline("use `**assim**`")).toEqual([
      { tipo: "texto", valor: "use " },
      { tipo: "codigo", valor: "**assim**" },
    ]);
  });

  it("texto sem marcação nenhuma passa inteiro", () => {
    expect(parseInline("só texto")).toEqual([{ tipo: "texto", valor: "só texto" }]);
  });

  it("asterisco solto não vira ênfase (não quebra o texto)", () => {
    expect(parseInline("2 * 3 = 6")).toEqual([{ tipo: "texto", valor: "2 * 3 = 6" }]);
  });
});

describe("parseMarkdown", () => {
  it("títulos com nível", () => {
    const b = parseMarkdown("# Um\n\n### Três");
    expect(b[0]).toMatchObject({ tipo: "titulo", nivel: 1 });
    expect(b[1]).toMatchObject({ tipo: "titulo", nivel: 3 });
  });

  it("linhas seguidas de lista viram UMA lista, não várias", () => {
    const b = parseMarkdown("- a\n- b\n- c");
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ tipo: "lista", ordenada: false });
    expect((b[0] as { itens: unknown[] }).itens).toHaveLength(3);
  });

  // A ANALISE.md quebra a linha do item na margem o tempo todo: antes, a continuação
  // virava parágrafo NO MEIO da lista, partindo a lista em duas e separando o item do
  // próprio texto.
  it("continuação indentada continua o item, sem partir a lista", () => {
    const b = parseMarkdown("- **`db_pool.py`** — pool de conexões\n  thread-safe.\n- outro item");
    expect(b).toHaveLength(1);
    const lista = b[0] as BlocoLista;
    expect(lista.itens).toHaveLength(2);
    expect(textoPuro(lista.itens[0]!.conteudo)).toBe("`db_pool.py` — pool de conexões thread-safe.");
  });

  it("marcação que atravessa a quebra de linha do item sobrevive", () => {
    const b = parseMarkdown("- **um negrito que\n  continua** e acaba");
    const lista = b[0] as BlocoLista;
    expect(lista.itens[0]!.conteudo).toEqual([
      { tipo: "forte", valor: "um negrito que continua" },
      { tipo: "texto", valor: " e acaba" },
    ]);
  });

  it("item mais indentado vira sublista, não irmão do pai", () => {
    const b = parseMarkdown("- pai\n  - filho um\n  - filho dois\n- tio");
    const lista = b[0] as BlocoLista;
    expect(lista.itens).toHaveLength(2);
    expect(lista.itens[0]!.sublista?.itens).toHaveLength(2);
    expect(textoPuro(lista.itens[1]!.conteudo)).toBe("tio");
    expect(lista.itens[1]!.sublista).toBeNull();
  });

  it("parágrafo depois da lista encerra a lista", () => {
    const b = parseMarkdown("- a\n- b\n\nFora do app principal: outra coisa.");
    expect(b.map((x) => x.tipo)).toEqual(["lista", "paragrafo"]);
  });

  // O caso que aparecia quebrado na tela: os três rótulos de uma decisão saíam grudados
  // numa frase só, porque linhas seguidas viram um parágrafo.
  it("linhas `**Rótulo:** valor` viram uma ficha, não um parágrafo corrido", () => {
    const b = parseMarkdown(
      "**Decisão:** usar X\n**Motivo:** porque Y,\ne também Z\n**Quem:** planejador",
    );
    expect(b).toHaveLength(1);
    const def = b[0] as BlocoDefinicao;
    expect(def.itens.map((p) => p.rotulo)).toEqual(["Decisão", "Motivo", "Quem"]);
    expect(textoPuro(def.itens[1]!.conteudo)).toBe("porque Y, e também Z");
  });

  it("negrito que NÃO é rótulo continua parágrafo", () => {
    // Sem `:` colado no fecha-negrito não é ficha — senão qualquer frase em negrito viraria.
    const b = parseMarkdown("**Risco resolvido** (autorizado): o submódulo estava atrás.");
    expect(b[0]).toMatchObject({ tipo: "paragrafo" });
  });

  it("lista ordenada é distinguida da não-ordenada", () => {
    const b = parseMarkdown("1. um\n2. dois");
    expect(b[0]).toMatchObject({ tipo: "lista", ordenada: true });
  });

  it("linhas seguidas de texto viram UM parágrafo", () => {
    const b = parseMarkdown("linha um\nlinha dois\n\noutro");
    expect(b).toHaveLength(2);
    expect(b[0]).toMatchObject({ tipo: "paragrafo" });
  });

  it("bloco de código cercado sai literal, sem interpretar marcação dentro", () => {
    const b = parseMarkdown("```\n# não é título\n**nem negrito**\n```");
    expect(b).toEqual([{ tipo: "codigo", texto: "# não é título\n**nem negrito**" }]);
  });

  it("cerca de código sem fechamento não engole o resto silenciosamente", () => {
    const b = parseMarkdown("```\nfim do arquivo");
    expect(b).toEqual([{ tipo: "codigo", texto: "fim do arquivo" }]);
  });

  it("régua e citação", () => {
    const b = parseMarkdown("---\n\n> citado");
    expect(b[0]).toMatchObject({ tipo: "regua" });
    expect(b[1]).toMatchObject({ tipo: "citacao" });
  });

  it("texto vazio não gera bloco", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n\n  \n")).toEqual([]);
  });

  it("documento real da fábrica (trecho de ANALISE.md) é parseado sem perder nada", () => {
    const b = parseMarkdown(
      "# Análise\n\n## Visão geral\nO sistema é **híbrido** e usa `pandas`.\n\n- item um\n- item dois\n",
    );
    expect(b.map((x) => x.tipo)).toEqual(["titulo", "titulo", "paragrafo", "lista"]);
  });
});
