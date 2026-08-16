import { argumentoEhTextoLongo } from "../src/lib/formato";
import { describe, expect, it } from "vitest";

/**
 * A ideia de um projeto — o texto que mais decide a qualidade do plano — era digitada num
 * `<input>` de uma linha, ao lado da instrução para descrever o que é, para quem, o que
 * entra na v1 e o que NÃO entra. Nome de projeto continua no input: é um identificador.
 */
describe("argumentoEhTextoLongo", () => {
  it("ideia e projeto novo pedem caixa grande", () => {
    expect(argumentoEhTextoLongo("novo-projeto")).toBe(true);
    expect(argumentoEhTextoLongo("ideia")).toBe(true);
  });

  it("quem recebe nome de projeto continua no campo de uma linha", () => {
    expect(argumentoEhTextoLongo("trabalhar")).toBe(false);
    expect(argumentoEhTextoLongo("status")).toBe(false);
    expect(argumentoEhTextoLongo("manutencao")).toBe(false);
    expect(argumentoEhTextoLongo("acao-que-nao-existe")).toBe(false);
  });
});
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
