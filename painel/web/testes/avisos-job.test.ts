import { describe, expect, it } from "vitest";
import { avisoDespachoFundo } from "../src/lib/avisos-job";

describe("avisoDespachoFundo", () => {
  it("não avisa quando o fluxo não despachou em segundo plano", () => {
    expect(avisoDespachoFundo({ despachosFundo: 0 })).toBeNull();
    expect(avisoDespachoFundo({})).toBeNull();
    expect(avisoDespachoFundo(null)).toBeNull();
    expect(avisoDespachoFundo(undefined)).toBeNull();
  });

  it("avisa com a contagem e diz o que conferir", () => {
    const texto = avisoDespachoFundo({ despachosFundo: 2 });
    expect(texto).toContain("2 agente(s) em segundo plano");
    expect(texto).toContain("Confira os artefatos");
  });

  // Resultado vem do disco (`dados/jobs/*.json`), então é dado externo: campo torto não
  // pode virar "NaN agente(s)" na tela.
  it("valor não numérico não vira aviso", () => {
    expect(avisoDespachoFundo({ despachosFundo: Number.NaN })).toBeNull();
    expect(avisoDespachoFundo({ despachosFundo: -1 })).toBeNull();
  });
});
