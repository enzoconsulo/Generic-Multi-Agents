import { describe, expect, it } from "vitest";
import { avisoTetoCusto } from "../src/lib/teto-custo";

describe("avisoTetoCusto", () => {
  it("não avisa quando o job não parou pelo teto", () => {
    expect(avisoTetoCusto({ motivo: "limite-uso" })).toBeNull();
    expect(avisoTetoCusto({})).toBeNull();
    expect(avisoTetoCusto(null)).toBeNull();
    expect(avisoTetoCusto(undefined)).toBeNull();
  });

  // O ponto do aviso inteiro: parada no orçamento é o sistema funcionando. Se o texto
  // soasse como erro, o usuário reagiria como reage a bug — que é a confusão que o aviso
  // de cota (T-045) já tinha custado uma vez.
  it("afirma que NÃO é falha e que nada foi cortado", () => {
    const t = avisoTetoCusto({ motivo: "teto-custo" });
    expect(t).toContain("não é falha");
    expect(t).toContain("nenhum agente foi cortado");
  });

  it("mostra o gasto real quando existe", () => {
    expect(avisoTetoCusto({ motivo: "teto-custo", custoUsd: 8.129 })).toContain("US$ 8.13");
  });

  it("cai na estimativa quando o custo real não veio (job cortado antes do result)", () => {
    const t = avisoTetoCusto({ motivo: "teto-custo", custoUsd: null, custoEstimadoUsd: 7.5 });
    expect(t).toContain("US$ 7.50");
  });

  it("sem número utilizável, omite o gasto em vez de escrever NaN", () => {
    const t = avisoTetoCusto({ motivo: "teto-custo", custoUsd: Number.NaN, custoEstimadoUsd: 0 });
    expect(t).not.toContain("NaN");
    expect(t).not.toContain("US$");
  });

  it("diz que o trabalho vale quando houve turnos concluídos", () => {
    expect(avisoTetoCusto({ motivo: "teto-custo", numTurnos: 12 })).toContain("12 turno(s)");
  });

  // Redisparar com o MESMO teto pararia no mesmo lugar: o conselho tem de ser sobre o
  // orçamento, não sobre repetir o disparo.
  it("orienta a decidir o teto, não a redisparar às cegas", () => {
    expect(avisoTetoCusto({ motivo: "teto-custo" })).toContain("teto maior");
  });
});
