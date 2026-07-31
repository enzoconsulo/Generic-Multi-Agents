import { describe, expect, it } from "vitest";
import { estimarCusto, precoDe, ERRO_MEDIO_ESTIMATIVA } from "../src/jobs/claude/precos.js";

/**
 * A tabela de `precos.ts` foi CALIBRADA contra jobs reais (ver o cabeçalho de lá). Um teste
 * que só conferisse aritmética não protegeria nada: o risco real é a tabela envelhecer —
 * preço muda, modelo novo entra — e a estimativa passar a mentir em silêncio nos jobs
 * cortados, que são justamente os que não têm custo real para comparar.
 *
 * Por isso os casos abaixo são AMOSTRAS REAIS de `dados/jobs/`, com o custo que o SDK
 * reportou. Elas ficam embutidas aqui (e não lidas do disco) de propósito: `dados/` é
 * descartável e está fora do git, então um teste que o lesse passaria a "não encontrar
 * caso" e ficaria verde sem testar nada — o mesmo modo de falha do guardrail que ninguém
 * consumia.
 */
interface Amostra {
  id: string;
  real: number;
  porModelo: Record<
    string,
    { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number }
  >;
}

/**
 * `cacheEscrita` por modelo foi rateado pela participação na leitura de cache, porque o
 * formato antigo do `porModelo` só guardava o total do job — é a mesma aproximação usada na
 * varredura que calibrou o multiplicador, e por isso as tolerâncias aqui a acompanham.
 */
const AMOSTRAS: readonly Amostra[] = [
  {
    id: "358c14f1",
    real: 7.4203,
    porModelo: {
      "claude-sonnet-5": { entrada: 360, saida: 95592, cacheLeitura: 11235358, cacheEscrita: 501033 },
      "claude-haiku-4-5-20251001": { entrada: 907, saida: 34307, cacheLeitura: 2268838, cacheEscrita: 101159 },
    },
  },
  {
    id: "5dfb1fe3",
    real: 0.3162,
    porModelo: {
      "claude-sonnet-5": { entrada: 131, saida: 2226, cacheLeitura: 119328, cacheEscrita: 40959 },
      "claude-haiku-4-5-20251001": { entrada: 788, saida: 18, cacheLeitura: 0, cacheEscrita: 0 },
    },
  },
  {
    id: "e4df9392",
    real: 1.1651,
    porModelo: {
      "claude-sonnet-5": { entrada: 80, saida: 13808, cacheLeitura: 1004515, cacheEscrita: 124972 },
      "claude-haiku-4-5-20251001": { entrada: 519, saida: 11, cacheLeitura: 0, cacheEscrita: 0 },
    },
  },
  {
    id: "e6d810ca",
    real: 0.5732,
    porModelo: {
      "claude-sonnet-5": { entrada: 29, saida: 5454, cacheLeitura: 484012, cacheEscrita: 64170 },
      "claude-haiku-4-5-20251001": { entrada: 589, saida: 17, cacheLeitura: 0, cacheEscrita: 0 },
    },
  },
];

describe("tabela de preços", () => {
  it("reconhece os modelos da fábrica, incluindo a forma datada dos subagentes", () => {
    expect(precoDe("claude-sonnet-5")?.entrada).toBe(3);
    expect(precoDe("claude-haiku-4-5-20251001")?.entrada).toBe(1);
    expect(precoDe("claude-opus-5")?.entrada).toBe(5);
    expect(precoDe("claude-fable-5")?.entrada).toBe(10);
  });

  it("deriva leitura e escrita de cache da entrada", () => {
    const sonnet = precoDe("claude-sonnet-5");
    expect(sonnet?.cacheLeitura).toBeCloseTo(0.3, 10);
    // 1,75 é calibragem medida, não valor de tabela — ver cabeçalho de precos.ts.
    expect(sonnet?.cacheEscrita).toBeCloseTo(5.25, 10);
  });

  it("modelo fora da tabela é DENUNCIADO, não silenciosamente cobrado como zero", () => {
    const est = estimarCusto({
      "modelo-do-futuro": { entrada: 1000, saida: 1000, cacheLeitura: 0, cacheEscrita: 0 },
    });
    expect(est?.modelosDesconhecidos).toEqual(["modelo-do-futuro"]);
    expect(est?.usd).toBe(0);
  });

  it("distingue 'sem uso' de 'custou zero'", () => {
    expect(estimarCusto({})).toBeNull();
  });

  // O teste que realmente importa: a tabela ainda descreve a realidade?
  it.each(AMOSTRAS)("estima $id dentro de 12% do custo real", ({ real, porModelo }) => {
    const est = estimarCusto(porModelo);
    expect(est).not.toBeNull();
    expect(est?.modelosDesconhecidos).toEqual([]);
    const desvio = Math.abs((est as { usd: number }).usd - real) / real;
    expect(desvio).toBeLessThan(0.12);
  });

  it("mantém o erro MÉDIO na faixa anunciada pela UI", () => {
    const desvios = AMOSTRAS.map(({ real, porModelo }) => {
      const est = estimarCusto(porModelo) as { usd: number };
      return Math.abs(est.usd - real) / real;
    });
    const medio = desvios.reduce((a, b) => a + b, 0) / desvios.length;
    // Se este teste cair, a UI passou a prometer precisão que a tabela não entrega:
    // recalibre `MULT_ESCRITA_CACHE` e ajuste `ERRO_MEDIO_ESTIMATIVA` junto.
    expect(medio).toBeLessThanOrEqual(ERRO_MEDIO_ESTIMATIVA + 0.02);
  });

  it("não subestima sistematicamente (a falha original era sempre para baixo)", () => {
    const abaixo = AMOSTRAS.filter(({ real, porModelo }) => {
      const est = estimarCusto(porModelo) as { usd: number };
      return est.usd < real;
    });
    expect(abaixo.length).toBeLessThan(AMOSTRAS.length);
  });
});
