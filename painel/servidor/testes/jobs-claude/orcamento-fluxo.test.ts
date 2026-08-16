import { describe, expect, it } from "vitest";
import { decidirFluxo } from "../../src/jobs/claude/orcamento-fluxo.js";

/**
 * O teste que faltava, e que teria pegado o alarme falso: **com o teto de US$ 3 do `/ideia`,
 * um gasto de US$ 0,40 tem de ser silêncio.**
 *
 * A régua antiga (a do pipeline) respondia "não começo outra tarefa" ali, porque comparava o
 * restante com o custo de um CICLO DE TAREFA (US$ 2,10 × 1,25 = US$ 2,63) — grandeza que um
 * fluxo de agente único não tem. Resultado medido: o alarme tocou nos 5 de 5 jobs de
 * `/ideia` com log em disco, sempre nos primeiros 15% do gasto.
 */
describe("decidirFluxo", () => {
  it("silêncio no começo do fluxo — foi aqui que o alarme antigo tocava", () => {
    expect(decidirFluxo(3, 0.4, 0).acao).toBe("seguir");
    expect(decidirFluxo(3, 0.53, 0).acao).toBe("seguir");
    // O gasto que os jobs reais tinham quando o alarme tocava (US$ 0,39 a US$ 0,55).
    expect(decidirFluxo(6, 0.55, 0).acao).toBe("seguir");
  });

  it("avisa uma vez, perto do fim, e o texto diz o que VAI acontecer", () => {
    const d = decidirFluxo(3, 2.5, 0);
    expect(d.acao).toBe("avisar");
    expect(d.motivo).toContain("Retomar");
    expect(d.motivo).toContain("2.50");
  });

  it("80% é o gatilho do aviso — abaixo disso não há decisão a comunicar", () => {
    expect(decidirFluxo(10, 7.99, 0).acao).toBe("seguir");
    expect(decidirFluxo(10, 8, 0).acao).toBe("avisar");
  });

  it("estourado com agente em voo ESPERA — cortar destrói o trabalho dele", () => {
    const d = decidirFluxo(3, 3.2, 2);
    expect(d.acao).toBe("esperar");
    // "ainda trabalhando" é a frase que o teste do runner casa — mudar a redação aqui
    // apagaria a prova de que a parada limpa está ligada, sem nada acusar.
    expect(d.motivo).toContain("2 agente(s) ainda trabalhando");
  });

  it("estourado e nada em voo encerra", () => {
    expect(decidirFluxo(3, 3, 0).acao).toBe("encerrar");
    expect(decidirFluxo(3, 99, 0).acao).toBe("encerrar");
  });

  it("sem teto é sempre seguir — o freio não existe onde não foi pedido", () => {
    expect(decidirFluxo(null, 100, 0).acao).toBe("seguir");
  });

  it("teto torto vira SEM teto, nunca um freio quebrado que compara falso", () => {
    for (const torto of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(decidirFluxo(torto, 100, 0).acao).toBe("seguir");
    }
  });

  it("gasto torto conta como zero em vez de derrubar o fluxo", () => {
    expect(decidirFluxo(3, Number.NaN, 0).acao).toBe("seguir");
    expect(decidirFluxo(3, -1, 0).acao).toBe("seguir");
  });
});
