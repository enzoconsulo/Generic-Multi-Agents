import { describe, expect, it } from "vitest";
import { julgar, linhasSignificativas, nomeCanonicoDeAcao, similaridade, type Entrega } from "../integracao/veredito.js";

/**
 * Estes casos são REGRESSÕES de medições reais (31/07). O instrumento de A/B declarou
 * "economia real" em duas situações onde não havia sinal, e as duas quase viraram decisão:
 *
 *  - `projeto:conferir`: −68% comparando duas execuções que entregaram ZERO cada. O projeto
 *    alvo estava de escopo fechado; não havia defeito a achar.
 *  - `projeto:progresso`: −44% com 26 → 16 linhas escritas. Contagem de ARQUIVOS batia (1 e
 *    1), então o veredito antigo chamou de comparável.
 *
 * A regra que isto trava está no CLAUDE.md do painel: *execução que não faz nada é sempre a
 * mais barata*. Um instrumento de custo tem de saber dizer "não sei".
 */
const nada: Entrega = { artefato: [], tipoArtefato: "nada" };
const commit = (linhas: string[]): Entrega => ({ artefato: linhas, tipoArtefato: "commit" });
const relatorio = (linhas: string[]): Entrega => ({ artefato: linhas, tipoArtefato: "relatorio" });

const N = (n: number, prefixo = "linha") =>
  Array.from({ length: n }, (_, i) => `${prefixo} ${i}`);

describe("julgar — o veredito que estava errado", () => {
  it("as duas pernas sem entregar nada é INCONCLUSIVO, não economia", () => {
    const v = julgar(nada, nada);
    expect(v.tipo).toBe("inconclusivo");
    expect(v.texto).toContain("nenhuma das duas pernas entregou nada");
    // A recomendação precisa estar no texto: sem ela o operador repete o mesmo experimento.
    expect(v.texto).toContain("defeito plantado");
  });

  it("perna barata não entrega e a cara entrega: NÃO é economia", () => {
    expect(julgar(commit(N(20)), nada).tipo).toBe("nao-economia");
  });

  it("perna CARA não entrega e a barata entrega: inconclusivo, não vitória", () => {
    const v = julgar(nada, commit(N(20)));
    expect(v.tipo).toBe("inconclusivo");
    expect(v.texto).toContain("ao contrário");
  });

  it("26 → 16 linhas NÃO é entrega comparável (o caso projeto:progresso)", () => {
    const caro = commit(N(26));
    const barato = commit(N(16)); // subconjunto: mesmas linhas, menos delas
    const v = julgar(caro, barato);
    expect(v.tipo).toBe("entrega-menor");
    expect(v.texto).toContain("62% do volume");
    expect(v.texto).toContain("ENTREGA DIFERENTE");
  });

  it("mesma entrega é economia real", () => {
    const v = julgar(commit(N(26)), commit(N(26)));
    expect(v.tipo).toBe("economia");
    expect(v.texto).toContain("equivalente");
  });

  it("mesmo volume mas conteúdo divergente NÃO passa como economia", () => {
    const v = julgar(commit(N(20, "a")), commit(N(20, "b")));
    expect(v.tipo).toBe("entrega-menor");
    expect(v.texto).toContain("similaridade 0%");
  });

  it("relatório conta como entrega — ação read-only não pode sumir da avaliação", () => {
    // `/status` nunca commita. Antes isso virava "0 arquivos" e a ação ficava sem veredito.
    const v = julgar(relatorio(N(30)), relatorio(N(30)));
    expect(v.tipo).toBe("economia");
  });

  it("relatório que encolhe é tratado como entrega menor, igual a commit", () => {
    expect(julgar(relatorio(N(30)), relatorio(N(12))).tipo).toBe("entrega-menor");
  });
});

describe("similaridade", () => {
  it("idênticos = 1, disjuntos = 0", () => {
    expect(similaridade(["a", "b"], ["a", "b"])).toBe(1);
    expect(similaridade(["a"], ["b"])).toBe(0);
  });

  it("subconjunto pela metade fica perto de 0,5", () => {
    expect(similaridade(N(10), N(5))).toBeCloseTo(0.5, 2);
  });

  it("vazio contra vazio é 1 — quem trata isso é o veredito, não a métrica", () => {
    expect(similaridade([], [])).toBe(1);
  });
});

describe("nomeCanonicoDeAcao — filtro --acoes sob o Git Bash do Windows", () => {
  it("aceita a grafia com e sem barra", () => {
    expect(nomeCanonicoDeAcao("/status")).toBe("status");
    expect(nomeCanonicoDeAcao("status")).toBe("status");
  });

  it("sobrevive à conversão de caminho do MSYS — o caso que custou uma rodada", () => {
    // `--acoes=/status` chega ao processo como um caminho absoluto do Windows.
    expect(nomeCanonicoDeAcao("C:/Program Files/Git/status")).toBe("status");
    expect(nomeCanonicoDeAcao("C:\\Program Files\\Git\\status")).toBe("status");
  });

  it("não destrói rótulo com dois-pontos, que não é caminho", () => {
    expect(nomeCanonicoDeAcao("projeto:conferir")).toBe("projeto:conferir");
  });
});

describe("linhasSignificativas", () => {
  it("descarta linhas vazias e espaço de borda", () => {
    expect(linhasSignificativas("  a  \n\n\n  b\n   \n")).toEqual(["a", "b"]);
  });
});
