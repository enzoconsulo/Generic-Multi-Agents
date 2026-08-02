import { describe, expect, it } from "vitest";
import { montarJobAcao, usaPipelineEmCodigo } from "../../src/acoes/acoes.js";

/**
 * Qual motor roda o quê — a decisão central da virada para o pipeline em código.
 *
 * O "meio termo": o laço MECÂNICO de um projeto (promover, ordenar, despachar, mover
 * status) sai do modelo; JULGAMENTO continua nele. O corte é o argumento: `/trabalhar app`
 * é uma máquina de estados sobre um projeto; `/trabalhar` sem argumento varre a fábrica,
 * escolhe entre projetos e escreve o log do dia — isso é orquestração de verdade.
 */
describe("usaPipelineEmCodigo", () => {
  it("um projeto no argumento → pipeline em código", () => {
    expect(usaPipelineEmCodigo("trabalhar", "banco-imobiliario")).toBe(true);
    expect(usaPipelineEmCodigo("trabalhar", "  app  ")).toBe(true);
  });

  it("sem projeto → continua no modelo (é orquestração, não máquina de estados)", () => {
    expect(usaPipelineEmCodigo("trabalhar", "")).toBe(false);
    expect(usaPipelineEmCodigo("trabalhar", "   ")).toBe(false);
  });

  it("mais de um argumento → modelo (há instrução em linguagem natural junto)", () => {
    expect(usaPipelineEmCodigo("trabalhar", "app só as tarefas de UI")).toBe(false);
  });

  it("outras ações nunca usam o pipeline", () => {
    for (const id of ["status", "novo-projeto", "ideia", "encerrar-dia", "manutencao"]) {
      expect(usaPipelineEmCodigo(id, "app"), id).toBe(false);
    }
  });

  // Escape hatch nos DOIS sentidos: trocar o caminho quente de uma fábrica que já falhou em
  // silêncio duas vezes sem deixar como voltar seria imprudente.
  it("`motor` sobrescreve a decisão automática", () => {
    expect(usaPipelineEmCodigo("trabalhar", "", "codigo")).toBe(true);
    expect(usaPipelineEmCodigo("trabalhar", "app", "modelo")).toBe(false);
  });

  // Nome de projeto vira caminho: barrar aqui, e de novo no runner.
  it("nome de projeto com travessia não vira job de pipeline", () => {
    expect(usaPipelineEmCodigo("trabalhar", "../fora")).toBe(false);
    expect(usaPipelineEmCodigo("trabalhar", "/etc")).toBe(false);
  });
});

describe("montarJobAcao — job de pipeline", () => {
  it("monta job do tipo `pipeline`, com params próprios e teto", () => {
    const job = montarJobAcao(
      { id: "trabalhar", argumentos: "app", modelo: "sonnet", reforco: "opus" },
      "C:/fabrica",
    );
    expect(job.tipo).toBe("pipeline");
    expect(job.escopo).toBe("projeto:app");
    expect(job.params).toMatchObject({
      raiz: "C:/fabrica",
      projeto: "app",
      modelo: "sonnet",
      reforco: "opus",
      tetoUsd: 8,
    });
  });

  // O job de pipeline NÃO tem prompt: não existe orquestrador para instruir. Se um prompt
  // aparecesse aqui, seria sinal de que o caminho velho voltou por engano.
  it("job de pipeline não carrega prompt nenhum", () => {
    const job = montarJobAcao({ id: "trabalhar", argumentos: "app", modelo: "sonnet" }, "C:/f");
    expect(job.params?.["prompt"]).toBeUndefined();
  });

  it("sem projeto, continua sendo job `claude` com prompt e preâmbulo", () => {
    const job = montarJobAcao({ id: "trabalhar", argumentos: "", modelo: "sonnet" }, "C:/f");
    expect(job.tipo).toBe("claude");
    expect(String(job.params?.["prompt"])).toContain("/trabalhar");
    expect(String(job.params?.["prompt"])).toContain("execucao-headless");
  });

  it("`motor: modelo` devolve o caminho antigo mesmo com projeto", () => {
    const job = montarJobAcao(
      { id: "trabalhar", argumentos: "app", modelo: "sonnet", motor: "modelo" },
      "C:/f",
    );
    expect(job.tipo).toBe("claude");
  });
});
