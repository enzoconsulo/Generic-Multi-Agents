import { describe, expect, it } from "vitest";
import { montarJobAcao } from "../../src/acoes/acoes.js";
import { GUARDRAILS_PADRAO, guardrailsParaAcao } from "../../src/jobs/robustez/guardrails.js";

describe("guardrailsParaAcao", () => {
  it("/trabalhar tem teto de turnos alto (roda o pipeline inteiro)", () => {
    const g = guardrailsParaAcao("trabalhar");
    expect(g.maxTurns).toBe(200);
    expect(g.watchdogMs).toBeGreaterThan(GUARDRAILS_PADRAO.watchdogMs);
  });

  it("/status é leve: teto baixo e paciência menor que o padrão", () => {
    const g = guardrailsParaAcao("status");
    expect(g.maxTurns).toBeLessThan(GUARDRAILS_PADRAO.maxTurns);
    expect(g.watchdogMs).toBeLessThan(GUARDRAILS_PADRAO.watchdogMs);
  });

  it("ação sem entrada própria cai no padrão (nasce protegida, não ilimitada)", () => {
    expect(guardrailsParaAcao("acao-que-nao-existe")).toEqual(GUARDRAILS_PADRAO);
  });

  it("maxBudgetUsd é null por default (informacional; assinatura não cobra por chamada)", () => {
    expect(guardrailsParaAcao("trabalhar").maxBudgetUsd).toBeNull();
  });
});

describe("montarJobAcao aplica os guardrails", () => {
  const base = { modelo: "haiku" };

  it("sem maxTurns explícito, usa o teto da ação", () => {
    const job = montarJobAcao({ ...base, id: "trabalhar", argumentos: "alfa" }, "/raiz");
    expect(job.params?.maxTurns).toBe(200);
  });

  it("maxTurns explícito do disparo vence o default", () => {
    const job = montarJobAcao({ ...base, id: "trabalhar", maxTurns: 7 }, "/raiz");
    expect(job.params?.maxTurns).toBe(7);
  });

  it("toda ação sai com algum teto (nenhum fluxo sobe sem guardrail)", () => {
    for (const id of ["novo-projeto", "ideia", "trabalhar", "status", "encerrar-dia", "manutencao"]) {
      const job = montarJobAcao({ ...base, id }, "/raiz");
      expect(typeof job.params?.maxTurns).toBe("number");
      expect(job.params?.maxTurns).toBeGreaterThan(0);
    }
  });
});
