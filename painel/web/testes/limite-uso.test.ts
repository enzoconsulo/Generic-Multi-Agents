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

describe("avisoLimiteDeUso × entrega parcial (T-047)", () => {
  /**
   * Rodada real de 2026-07-30: 21 turnos concluídos, T-003 aprovada, T-004 num ciclo
   * inteiro, 4 commits — e SÓ ENTÃO a cota acabou. Dizer "não entregou" ali faria o
   * usuário refazer trabalho commitado.
   */
  it("com turnos concluídos, NÃO afirma que nada foi entregue", () => {
    const texto = avisoLimiteDeUso({ motivo: "limite-uso", reabreEm: "12:10pm", numTurnos: 21 });
    expect(texto).toContain("21 turno(s)");
    expect(texto).toContain("está valendo");
    expect(texto).not.toContain("sem entregar");
    expect(texto).toContain("antes de redisparar");
  });

  it("sem turnos, mantém o aviso de que nada saiu", () => {
    const texto = avisoLimiteDeUso({ motivo: "limite-uso", reabreEm: "12:10pm", numTurnos: 0 });
    expect(texto).toContain("sem entregar");
  });

  it("turnos desconhecidos são tratados como sem entrega (não promete o que não sabe)", () => {
    expect(avisoLimiteDeUso({ motivo: "limite-uso", numTurnos: null })).toContain("sem entregar");
    expect(avisoLimiteDeUso({ motivo: "limite-uso" })).toContain("sem entregar");
  });
});

/**
 * O PIPELINE EM CÓDIGO não conta turnos de SDK — conta TAREFAS. Sem este ramo, todo
 * `/trabalhar` cortado pela cota caía em "nada foi entregue" mesmo tendo fechado e commitado
 * tarefas, que é o conselho que manda refazer trabalho pronto. É a terceira vez que esta
 * mensagem erra por olhar o sinal do outro motor; por isso o teste é explícito.
 */
describe("avisoLimiteDeUso × pipeline em código", () => {
  it("tarefa concluída é prova de entrega mais forte que turno", () => {
    const texto = avisoLimiteDeUso({
      motivo: "limite-uso",
      reabreEm: "9:00am",
      tarefasConcluidas: ["T-011", "T-012"],
    });
    expect(texto).toContain("2 tarefa(s) fecharam");
    expect(texto).toContain("T-011, T-012");
    expect(texto).toContain("retoma de onde parou");
    expect(texto).not.toContain("sem entregar");
  });

  it("lista vazia não conta como entrega", () => {
    expect(avisoLimiteDeUso({ motivo: "limite-uso", tarefasConcluidas: [] })).toContain(
      "sem entregar",
    );
  });

  it("tarefa concluída vence turnos zerados (o pipeline não reporta turnos)", () => {
    const texto = avisoLimiteDeUso({
      motivo: "limite-uso",
      numTurnos: 0,
      tarefasConcluidas: ["T-011"],
    });
    expect(texto).toContain("1 tarefa(s) fecharam");
  });
});
