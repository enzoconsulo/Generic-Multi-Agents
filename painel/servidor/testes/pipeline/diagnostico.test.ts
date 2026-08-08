import { describe, expect, it } from "vitest";
import {
  blocoDeFoco,
  classificar,
  lerAchados,
  lerConformidade,
  politicaDe,
  VOLTAS_MEDIO,
  VOLTAS_PONTUAL,
  type Diagnostico,
} from "../../src/pipeline/diagnostico.js";

/**
 * O diagnóstico decide COMO refazer. Errar para o lado barato custa qualidade; errar para o
 * caro custa dinheiro. Por isso a regra do módulo é "na dúvida, o caro" — e é ela que a
 * maior parte destes testes protege.
 */

describe("lerConformidade", () => {
  it("lê o veredito do contrato do revisor", () => {
    expect(lerConformidade("Conformidade: cumpre\n- tudo certo")).toBe("cumpre");
    expect(lerConformidade("Conformidade: nao-cumpre")).toBe("nao-cumpre");
    expect(lerConformidade("Conformidade: não-cumpre")).toBe("nao-cumpre");
    expect(lerConformidade("Conformidade: cumpre-parcial")).toBe("cumpre-parcial");
  });

  /**
   * As seções ACUMULAM ciclos. Pegar a primeira ocorrência faria o ciclo 3 ser julgado pelo
   * texto do ciclo 1 — e um `nao-cumpre` já corrigido mandaria a tarefa para o calibre
   * máximo para sempre.
   */
  it("vale o veredito MAIS RECENTE, não o primeiro", () => {
    const secao = [
      "### Ciclo 1",
      "Conformidade: nao-cumpre",
      "### Ciclo 2",
      "Conformidade: cumpre",
    ].join("\n");
    expect(lerConformidade(secao)).toBe("cumpre");
  });

  it("seção vazia ou sem veredito devolve null", () => {
    expect(lerConformidade("")).toBeNull();
    expect(lerConformidade("prosa qualquer sem veredito")).toBeNull();
  });
});

describe("lerAchados", () => {
  it("lê gravidade e texto no formato do contrato", () => {
    const achados = lerAchados(
      "[critica] a.js:10 — quebra em uso normal\n[menor] b.js:2 — nota estética",
    );
    expect(achados).toEqual([
      { gravidade: "critica", texto: "a.js:10 — quebra em uso normal" },
      { gravidade: "menor", texto: "b.js:2 — nota estética" },
    ]);
  });

  it("aceita `crítica` com acento", () => {
    expect(lerAchados("[crítica] x — y")[0]?.gravidade).toBe("critica");
  });

  /**
   * Achado já corrigido continua escrito na seção. Mandá-lo de volta faria o construtor
   * "consertar" o que já está certo — trabalho pago para desfazer trabalho bom.
   */
  it("só os achados do ÚLTIMO ciclo", () => {
    const secao = [
      "### Ciclo 1",
      "[critica] antigo.js — já corrigido",
      "### Ciclo 2",
      "[importante] novo.js — este ainda vale",
    ].join("\n");
    expect(lerAchados(secao)).toEqual([
      { gravidade: "importante", texto: "novo.js — este ainda vale" },
    ]);
  });

  it("seção sem achados devolve lista vazia", () => {
    expect(lerAchados("Aprovado sem ressalvas")).toEqual([]);
  });
});

describe("classificar — a natureza vem do PORTÃO observado", () => {
  it("passada mecânica → falha objetiva e localizada", () => {
    expect(classificar("mecanica", null).natureza).toBe("mecanica");
  });

  it("verificador → falha funcional", () => {
    expect(classificar("verificador", null).natureza).toBe("funcional");
  });

  it("revisor com conformidade reprovada → conformidade (o caso caro)", () => {
    const d = classificar("revisor", {
      conformidade: "Conformidade: nao-cumpre",
      revisao: "[menor] x — y",
    });
    expect(d.natureza).toBe("conformidade");
  });

  /** Falta pedaço do que foi pedido é a mesma família de erro que entregar outra coisa. */
  it("`cumpre-parcial` também é conformidade", () => {
    expect(
      classificar("revisor", { conformidade: "Conformidade: cumpre-parcial", revisao: "" })
        .natureza,
    ).toBe("conformidade");
  });

  it("revisor que cumpre mas achou defeitos → defeito", () => {
    const d = classificar("revisor", {
      conformidade: "Conformidade: cumpre",
      revisao: "[importante] a.js — bug",
    });
    expect(d.natureza).toBe("defeito");
    expect(d.grave).toBe(true);
  });

  it("só achados `menor` não é grave", () => {
    const d = classificar("revisor", {
      conformidade: "Conformidade: cumpre",
      revisao: "[menor] a.js — estética",
    });
    expect(d.natureza).toBe("defeito");
    expect(d.grave).toBe(false);
  });

  /** NA DÚVIDA, O CARO: revisor reprovou e o texto não deixa ler por quê. */
  it("revisor sem veredito legível e sem achados → cai no caro (conformidade)", () => {
    const d = classificar("revisor", { conformidade: "texto ilegível", revisao: "" });
    expect(d.natureza).toBe("conformidade");
    expect(d.grave).toBe(true);
  });

  it("portão desconhecido (tarefa herdada de outra rodada) → nenhuma", () => {
    expect(classificar(null, null).natureza).toBe("nenhuma");
  });
});

describe("politicaDe — as duas travas que impedem economia burra", () => {
  const diag = (parcial: Partial<Diagnostico>): Diagnostico => ({
    natureza: "defeito",
    achados: [],
    grave: false,
    conformidade: null,
    ...parcial,
  });

  it("primeira execução: sem reforço e sem teto especial", () => {
    const p = politicaDe(diag({ natureza: "nenhuma" }), 0, true);
    expect(p.reforcar).toBe(false);
    expect(p.escopo).toBe("completo");
    expect(p.maxTurns).toBeNull();
  });

  /** TRAVA 1: a próxima reprovação bloqueia a tarefa. Economizar aqui é péssimo negócio. */
  it("tentativas >= 2 é sempre calibre máximo, seja qual for a natureza", () => {
    for (const natureza of ["mecanica", "defeito", "funcional", "conformidade"] as const) {
      const p = politicaDe(diag({ natureza }), 2, true);
      expect(p.reforcar, natureza).toBe(true);
      expect(p.escopo, natureza).toBe("completo");
      expect(p.maxTurns, natureza).toBeNull();
    }
  });

  /** TRAVA 2: o barato já provou que não entendeu o pedido. */
  it("conformidade nunca barateia", () => {
    const p = politicaDe(diag({ natureza: "conformidade" }), 1, true);
    expect(p.reforcar).toBe(true);
    expect(p.escopo).toBe("completo");
    expect(p.maxTurns).toBeNull();
  });

  /** A economia principal: comando falhou, o comando já disse o quê. */
  it("falha mecânica não escala modelo e roda estreita", () => {
    const p = politicaDe(diag({ natureza: "mecanica" }), 1, true);
    expect(p.reforcar).toBe(false);
    expect(p.escopo).toBe("pontual");
    expect(p.maxTurns).toBe(VOLTAS_PONTUAL);
  });

  it("defeito grave reforça, mas ataca só o que foi apontado", () => {
    const p = politicaDe(diag({ natureza: "defeito", grave: true }), 1, true);
    expect(p.reforcar).toBe(true);
    expect(p.escopo).toBe("pontual");
    expect(p.maxTurns).toBe(VOLTAS_MEDIO);
  });

  it("só achados menores: nem reforça nem gasta voltas", () => {
    const p = politicaDe(diag({ natureza: "defeito", grave: false }), 1, true);
    expect(p.reforcar).toBe(false);
    expect(p.maxTurns).toBe(VOLTAS_PONTUAL);
  });

  /** Sem modelo de reforço configurado não há para onde subir — e não pode "inventar". */
  it("sem reforço disponível, nunca marca reforçar", () => {
    for (const natureza of ["conformidade", "defeito", "funcional"] as const) {
      expect(politicaDe(diag({ natureza, grave: true }), 2, false).reforcar, natureza).toBe(false);
    }
  });
});

describe("blocoDeFoco", () => {
  it("ordena por gravidade e manda NÃO recomeçar", () => {
    const texto = blocoDeFoco({
      natureza: "defeito",
      grave: true,
      conformidade: "cumpre",
      achados: [
        { gravidade: "menor", texto: "c.js — estética" },
        { gravidade: "critica", texto: "a.js — quebra" },
        { gravidade: "importante", texto: "b.js — bug" },
      ],
    });
    expect(texto.indexOf("a.js")).toBeLessThan(texto.indexOf("b.js"));
    expect(texto.indexOf("b.js")).toBeLessThan(texto.indexOf("c.js"));
    expect(texto).toContain("não recomece do zero");
  });

  /**
   * Falha objetiva não tem achado nomeado, mas o relatório está no arquivo da tarefa — e a
   * instrução de NÃO recomeçar é justamente o que evita o desperdício do retrabalho.
   */
  it("falha mecânica sem achados aponta para o relatório e manda não recomeçar", () => {
    const texto = blocoDeFoco({
      natureza: "mecanica",
      achados: [],
      grave: false,
      conformidade: null,
    });
    expect(texto).toContain("não recomece do zero");
    expect(texto).toContain("passada mecânica");
    expect(texto).toContain("## Verificação");
  });

  it("falha funcional aponta para a reprodução do verificador", () => {
    const texto = blocoDeFoco({
      natureza: "funcional",
      achados: [],
      grave: false,
      conformidade: null,
    });
    expect(texto).toContain("verificador");
  });

  /** Sem natureza objetiva e sem achado, nada é acrescentado — despacho normal não paga. */
  it("natureza sem foco possível devolve vazio", () => {
    expect(
      blocoDeFoco({ natureza: "conformidade", achados: [], grave: true, conformidade: null }),
    ).toBe("");
  });
});
