import { describe, expect, it } from "vitest";
import { decorrido, duracaoLegivel } from "../src/lib/formato";

describe("duracaoLegivel", () => {
  it("escala a unidade para caber em pouco espaço", () => {
    expect(duracaoLegivel(0)).toBe("0s");
    expect(duracaoLegivel(5_400)).toBe("5s");
    expect(duracaoLegivel(59_000)).toBe("59s");
    expect(duracaoLegivel(60_000)).toBe("1min 00s");
    expect(duracaoLegivel(133_000)).toBe("2min 13s");
    expect(duracaoLegivel(3_600_000)).toBe("1h 00min");
    expect(duracaoLegivel(3_864_000)).toBe("1h 04min");
  });

  it("entrada inválida vira travessão, não NaN na tela", () => {
    expect(duracaoLegivel(-1)).toBe("—");
    expect(duracaoLegivel(Number.NaN)).toBe("—");
    expect(duracaoLegivel(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("decorrido", () => {
  const inicio = "2026-07-27T10:00:00.000Z";
  const base = Date.parse(inicio);

  it("calcula o tempo entre o início e o instante dado", () => {
    expect(decorrido(inicio, base + 90_000)).toBe("1min 30s");
  });

  it("sem início (job que nunca começou) devolve null — quem chama decide o que mostrar", () => {
    expect(decorrido(undefined, base)).toBeNull();
  });

  it("data ilegível devolve null em vez de NaN", () => {
    expect(decorrido("não é data", base)).toBeNull();
  });
});
