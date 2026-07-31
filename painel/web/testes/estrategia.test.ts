import { describe, expect, it } from "vitest";
import { textoEstrategia } from "../src/lib/formato";

/**
 * O escalonamento de modelo é decidido pela estratégia escolhida no disparo — e quem
 * escolhe precisa saber disso na hora de escolher. Comportamento que existe e não aparece
 * onde a decisão é tomada é a mesma família do `watchdogMs` que ninguém lia.
 */
describe("textoEstrategia", () => {
  it("anuncia o modelo de retrabalho quando existe", () => {
    const texto = textoEstrategia({ descricao: "Equilíbrio entre qualidade e custo.", reforco: "opus" });
    expect(texto).toContain("Equilíbrio entre qualidade e custo.");
    expect(texto).toContain("opus");
    expect(texto).toContain("reprovada");
  });

  it("estratégia no topo mostra só a descrição, sem prometer escalonamento", () => {
    const d = "Fable puro, o mais capaz.";
    expect(textoEstrategia({ descricao: d, reforco: null })).toBe(d);
    expect(textoEstrategia({ descricao: d, reforco: "" })).toBe(d);
  });
});
