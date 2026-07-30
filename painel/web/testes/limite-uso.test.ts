import { describe, expect, it } from "vitest";
import { avisoLimiteDeUso } from "../src/lib/limite-uso";

describe("avisoLimiteDeUso (T-045) — cota não é bug", () => {
  it("avisa e diz quando a cota volta", () => {
    const texto = avisoLimiteDeUso({ motivo: "limite-uso", reabreEm: "2:40pm (America/Sao_Paulo)" });
    expect(texto).toContain("A cota retoma após 2:40pm (America/Sao_Paulo).");
    expect(texto).toContain("para no mesmo ponto");
  });

  it("avisa mesmo sem hora — o provedor não sempre anuncia", () => {
    const texto = avisoLimiteDeUso({ motivo: "limite-uso", reabreEm: null });
    expect(texto).not.toBeNull();
    expect(texto).not.toContain("retoma após");
  });

  it("hora em branco não vira frase pela metade", () => {
    const texto = avisoLimiteDeUso({ motivo: "limite-uso", reabreEm: "   " });
    expect(texto).not.toContain("retoma após");
  });

  it("falha comum não vira aviso de cota (o campo Erro é que aparece)", () => {
    expect(avisoLimiteDeUso({ motivo: undefined })).toBeNull();
    expect(avisoLimiteDeUso({})).toBeNull();
    expect(avisoLimiteDeUso(null)).toBeNull();
    expect(avisoLimiteDeUso(undefined)).toBeNull();
  });
});
