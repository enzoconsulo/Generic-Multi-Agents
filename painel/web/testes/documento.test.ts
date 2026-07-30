import { describe, expect, it } from "vitest";
import { estruturarDocumento } from "../src/lib/documento";

/** Abertura real do DECISOES.md da fábrica: cabeçalho + gabarito + entradas datadas. */
const DECISOES = `# Decisões — projeto-x

Registro apenas-adição (nunca apagar). Formato de cada entrada:

## AAAA-MM-DD — <título da decisão>
**Decisão:** <o que foi decidido>
**Motivo:** <por quê>
**Quem:** <planejador | executor>

## 2026-07-27 — Usar OpenAI REST direto
**Decisão:** cliente REST via requests, sem SDK.
**Motivo:** já é o padrão do app principal.
**Quem:** planejador

## 2026-07-21 — Pinar a versão do SDK
**Decisão:** sem \`^\` no package.json.
**Quem:** orquestrador
`;

describe("estruturarDocumento", () => {
  it("separa o título do arquivo, o gabarito e as entradas reais", () => {
    const doc = estruturarDocumento(DECISOES);
    expect(doc.titulo).toBe("Decisões — projeto-x");
    expect(doc.entradas.map((e) => e.data)).toEqual(["2026-07-27", "2026-07-21"]);
    expect(doc.entradas[0]?.titulo).toBe("Usar OpenAI REST direto");
  });

  // O gabarito é rótulo sem dado: mostrado como entrada, era ele que ocupava a tela.
  it("o gabarito `AAAA-MM-DD` não vira entrada — vai para o guia", () => {
    const doc = estruturarDocumento(DECISOES);
    expect(doc.entradas.some((e) => e.titulo.includes("título da decisão"))).toBe(false);
    expect(doc.guia.length).toBeGreaterThan(0);
  });

  it("a prévia mostra o começo do conteúdo da entrada fechada", () => {
    const doc = estruturarDocumento(DECISOES);
    expect(doc.entradas[0]?.previa).toBe("Decisão: cliente REST via requests, sem SDK.");
  });

  it("documento sem seções não inventa entradas", () => {
    const doc = estruturarDocumento("# Só um título\n\nUm parágrafo solto.");
    expect(doc.entradas).toEqual([]);
    expect(doc.guia).toHaveLength(1);
  });

  it("seções sem data (ANALISE.md) viram entradas com data nula", () => {
    const doc = estruturarDocumento(
      "# Análise\n\n## Visão geral\nFaz X.\n\n## Pontos de atenção\n- cuidado com Y\n",
    );
    expect(doc.entradas.map((e) => e.titulo)).toEqual(["Visão geral", "Pontos de atenção"]);
    expect(doc.entradas.every((e) => e.data === null)).toBe(true);
    expect(doc.entradas[1]?.previa).toBe("cuidado com Y");
  });

  // PROGRESSO.md usa `## 2026-07-30` puro: a data É o título, e devolvê-la também como
  // título faria a tela mostrar o mesmo dado duas vezes lado a lado.
  it("seção cujo título é só a data devolve título vazio", () => {
    const doc = estruturarDocumento("# Progresso\n\n## 2026-07-30\nAvançou X.");
    expect(doc.entradas[0]).toMatchObject({ data: "2026-07-30", titulo: "" });
  });

  it("texto antes da primeira seção fica no guia, não some", () => {
    const doc = estruturarDocumento("# T\n\nabertura importante\n\n## 2026-01-01 — algo\ncorpo");
    expect(doc.guia).toHaveLength(1);
    expect(doc.entradas).toHaveLength(1);
  });
});
