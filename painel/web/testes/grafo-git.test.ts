import { describe, expect, it } from "vitest";
import { montarGrafo } from "../src/lib/grafo-git";
import type { CommitGit } from "../src/lib/tipos";

function c(hash: string, pais: string[] = []): CommitGit {
  return {
    hash,
    curto: hash.slice(0, 7),
    pais,
    autor: "a",
    data: "2026-07-28T00:00:00Z",
    assunto: `commit ${hash}`,
    refs: [],
  };
}

describe("montarGrafo", () => {
  it("histórico linear usa uma faixa só", () => {
    const g = montarGrafo([c("c", ["b"]), c("b", ["a"]), c("a")]);
    expect(g.faixas).toBe(1);
    expect(g.nos.map((n) => n.faixa)).toEqual([0, 0, 0]);
    // A faixa termina no commit raiz (sem pai), então não sobra aresta pendurada.
    expect(g.arestas.filter((a) => a.ate === null)).toEqual([]);
  });

  it("commit raiz fecha a faixa", () => {
    const g = montarGrafo([c("a")]);
    expect(g.nos[0]?.faixa).toBe(0);
    expect(g.arestas).toEqual([]);
  });

  it("dois ramos independentes ocupam faixas diferentes", () => {
    // b e c são pontas de branch distintas; ambas descendem de a.
    const g = montarGrafo([c("c", ["a"]), c("b", ["a"]), c("a")]);
    expect(g.faixas).toBeGreaterThanOrEqual(2);
    expect(g.nos[0]?.faixa).not.toBe(g.nos[1]?.faixa);
    // Ao chegar em `a`, as duas faixas convergem: uma delas se fecha.
    expect(g.nos[2]?.commit.hash).toBe("a");
  });

  it("merge (dois pais) gera duas arestas saindo do mesmo commit", () => {
    const g = montarGrafo([c("m", ["a", "b"]), c("a", ["r"]), c("b", ["r"]), c("r")]);
    const doMerge = g.arestas.filter((a) => a.linha === 0);
    expect(doMerge).toHaveLength(2);
    expect(g.faixas).toBeGreaterThanOrEqual(2);
  });

  it("pai fora do trecho carregado vira aresta com `ate` nulo (não some do desenho)", () => {
    // "b" é pai de "a" mas não veio na página — a linha tem que continuar para baixo.
    const g = montarGrafo([c("a", ["b"])]);
    expect(g.arestas).toHaveLength(1);
    expect(g.arestas[0]?.ate).toBeNull();
  });

  it("o primeiro pai HERDA a faixa: a linha principal fica reta", () => {
    const g = montarGrafo([c("m", ["a", "b"]), c("a", ["r"]), c("b", ["r"]), c("r")]);
    const merge = g.nos[0];
    const primeiroPai = g.nos.find((n) => n.commit.hash === "a");
    expect(primeiroPai?.faixa).toBe(merge?.faixa);
  });

  it("cada nó recebe uma cor e a faixa 0 é estável no histórico linear", () => {
    const g = montarGrafo([c("c", ["b"]), c("b", ["a"]), c("a")]);
    expect(g.nos.every((n) => typeof n.cor === "number")).toBe(true);
    expect(new Set(g.nos.map((n) => n.cor)).size).toBe(1);
  });

  it("lista vazia não quebra e devolve ao menos uma faixa (largura mínima)", () => {
    const g = montarGrafo([]);
    expect(g.nos).toEqual([]);
    expect(g.arestas).toEqual([]);
    expect(g.faixas).toBe(1);
  });
});
