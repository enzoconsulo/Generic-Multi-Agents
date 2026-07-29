import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  lerAnaliseEstruturada,
  normalizarAnalise,
} from "../../src/fabrica/analise-estruturada.js";

function fabricaComAnalise(conteudo: string | null): string {
  const raiz = mkdtempSync(join(tmpdir(), "analise-estr-"));
  const gestao = join(raiz, "projetos", "fix", "_gestao");
  mkdirSync(gestao, { recursive: true });
  if (conteudo !== null) writeFileSync(join(gestao, "analise.json"), conteudo, "utf8");
  return raiz;
}

const COMPLETA = {
  oQueFaz: "Gera anúncio de Shopee a partir de uma foto.",
  pecas: [{ nome: "gerador_anuncio.py", papel: "monta o anúncio" }],
  fluxo: ["usuário envia foto", "modelo gera texto", "usuário edita e aprova"],
  stack: ["Python 3.11", "Streamlit"],
  atencao: [{ texto: "sem suíte automatizada", gravidade: "alta" }],
};

describe("normalizarAnalise (T-041)", () => {
  it("aceita a análise completa", () => {
    const a = normalizarAnalise(COMPLETA);
    expect(a?.oQueFaz).toContain("Shopee");
    expect(a?.pecas).toHaveLength(1);
    expect(a?.fluxo).toHaveLength(3);
    expect(a?.atencao[0]?.gravidade).toBe("alta");
  });

  it("gravidade desconhecida vira `media` em vez de sumir com o ponto", () => {
    // Perder um ponto de atenção é pior que classificá-lo no meio.
    const a = normalizarAnalise({ ...COMPLETA, atencao: [{ texto: "x", gravidade: "urgentíssimo" }] });
    expect(a?.atencao).toEqual([{ texto: "x", gravidade: "media" }]);
  });

  it("campo torto vira vazio e o RESTO continua aparecendo", () => {
    // O arquivo é escrito por um modelo: um campo errado não pode custar a tela inteira.
    const a = normalizarAnalise({ ...COMPLETA, fluxo: "isto devia ser lista", pecas: 42 });
    expect(a?.fluxo).toEqual([]);
    expect(a?.pecas).toEqual([]);
    expect(a?.oQueFaz).toContain("Shopee");
  });

  it("peça sem nome é descartada; sem papel apenas fica sem papel", () => {
    const a = normalizarAnalise({
      ...COMPLETA,
      pecas: [{ papel: "órfã" }, { nome: "app.py" }],
    });
    expect(a?.pecas).toEqual([{ nome: "app.py", papel: "" }]);
  });

  it("respeita os tetos (8 peças, 6 passos de fluxo)", () => {
    const a = normalizarAnalise({
      ...COMPLETA,
      pecas: Array.from({ length: 20 }, (_, i) => ({ nome: `p${i}`, papel: "x" })),
      fluxo: Array.from({ length: 20 }, (_, i) => `passo ${i}`),
    });
    expect(a?.pecas).toHaveLength(8);
    expect(a?.fluxo).toHaveLength(6);
  });

  it("objeto sem nada aproveitável vira null — melhor cair no .md que mostrar tela vazia", () => {
    expect(normalizarAnalise({})).toBeNull();
    expect(normalizarAnalise({ oQueFaz: "   ", pecas: [], fluxo: [] })).toBeNull();
  });

  it("lixo não lança", () => {
    for (const lixo of [null, undefined, 42, "texto", []]) {
      expect(normalizarAnalise(lixo)).toBeNull();
    }
  });

  it("`atencao` vazia é resposta legítima (projeto sem ressalva)", () => {
    const a = normalizarAnalise({ ...COMPLETA, atencao: [] });
    expect(a?.atencao).toEqual([]);
    expect(a?.oQueFaz).not.toBe("");
  });
});

describe("lerAnaliseEstruturada", () => {
  it("lê o arquivo quando existe", async () => {
    const raiz = fabricaComAnalise(JSON.stringify(COMPLETA));
    expect((await lerAnaliseEstruturada(raiz, "fix"))?.pecas).toHaveLength(1);
  });

  it("arquivo AUSENTE é null, não erro — projeto analisado antes da T-041 só tem o .md", async () => {
    const raiz = fabricaComAnalise(null);
    await expect(lerAnaliseEstruturada(raiz, "fix")).resolves.toBeNull();
  });

  it("JSON malformado não derruba a página do projeto", async () => {
    const raiz = fabricaComAnalise("{ isto não é json");
    await expect(lerAnaliseEstruturada(raiz, "fix")).resolves.toBeNull();
  });

  it("projeto inexistente é null", async () => {
    const raiz = fabricaComAnalise(JSON.stringify(COMPLETA));
    await expect(lerAnaliseEstruturada(raiz, "nao-existe")).resolves.toBeNull();
  });
});
