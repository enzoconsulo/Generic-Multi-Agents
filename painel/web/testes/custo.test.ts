import { describe, expect, it } from "vitest";
import { custoDoJob, explicarCusto, formatarCusto, somarCusto } from "../src/lib/custo";
import type { Job } from "../src/lib/tipos";

/**
 * A regressão que estes testes travam (T-049): a UI lia só `custoUsd`, que o servidor só
 * preenche quando o SDK manda `result`. Job cortado por cota nunca manda `result` — e é o
 * mais caro. Na prática o total do projeto somava US$ 0,00 para uma rodada de 40 min com 21
 * despachos de agente, enquanto um `/status` de 40 s aparecia com US$ 0,32: o painel
 * mostrava o INVERSO da realidade.
 */
function job(id: string, resultado: unknown, estado = "concluido"): Job {
  return {
    id,
    tipo: "claude",
    titulo: `job ${id}`,
    escopo: "projeto:x",
    usaClaude: true,
    params: {},
    estado,
    criadoEm: "2026-07-31T11:00:00.000Z",
    resultado,
  } as unknown as Job;
}

describe("custoDoJob", () => {
  it("prefere o custo REAL do SDK quando ele existe", () => {
    const c = custoDoJob(job("a", { custoUsd: 0.5, custoEstimadoUsd: 0.4 }));
    expect(c).toEqual({ usd: 0.5, estimado: false, incompleto: false });
  });

  it("cai para a estimativa quando o fluxo foi cortado antes do `result`", () => {
    const c = custoDoJob(job("b", { custoUsd: null, custoEstimadoUsd: 8.3 }));
    expect(c?.usd).toBe(8.3);
    expect(c?.estimado).toBe(true);
  });

  it("marca como incompleto quando havia modelo fora da tabela de preços", () => {
    const c = custoDoJob(
      job("c", { custoUsd: null, custoEstimadoUsd: 1, modelosSemPreco: ["modelo-novo"] }),
    );
    expect(c?.incompleto).toBe(true);
  });

  it("devolve null quando não há dado — que não é o mesmo que custo zero", () => {
    expect(custoDoJob(job("d", { custoUsd: null }))).toBeNull();
    expect(custoDoJob(job("e", null))).toBeNull();
  });

  it("custo real zero é um valor, não ausência de dado", () => {
    expect(custoDoJob(job("f", { custoUsd: 0 }))).toEqual({
      usd: 0,
      estimado: false,
      incompleto: false,
    });
  });
});

describe("somarCusto", () => {
  it("INCLUI job que falhou — a regressão original", () => {
    const total = somarCusto([
      job("ok", { custoUsd: 0.32 }),
      job("cortado", { custoUsd: null, custoEstimadoUsd: 8.5 }, "falhou"),
    ]);
    expect(total?.usd).toBeCloseTo(8.82, 6);
    expect(total?.jobs).toBe(2);
    expect(total?.temEstimativa).toBe(true);
  });

  it("conta separadamente os jobs sem contabilidade nenhuma", () => {
    const total = somarCusto([job("a", { custoUsd: 1 }), job("b", null)]);
    expect(total?.usd).toBe(1);
    expect(total?.jobs).toBe(1);
    expect(total?.semDado).toBe(1);
  });

  it("um único valor subestimado contamina o total inteiro", () => {
    const total = somarCusto([
      job("a", { custoUsd: 1 }),
      job("b", { custoUsd: null, custoEstimadoUsd: 2, modelosSemPreco: ["x"] }),
    ]);
    expect(total?.temIncompleto).toBe(true);
    expect(formatarCusto(total!, 2)).toBe("≥$3.00");
  });

  it("lista vazia devolve null, não um total de zero", () => {
    expect(somarCusto([])).toBeNull();
  });
});

describe("formatarCusto — o prefixo carrega a qualidade do número", () => {
  it("real sem prefixo, estimado com ~, subestimado com ≥", () => {
    expect(formatarCusto({ usd: 1.5, estimado: false, incompleto: false }, 2)).toBe("$1.50");
    expect(formatarCusto({ usd: 1.5, estimado: true, incompleto: false }, 2)).toBe("~$1.50");
    expect(formatarCusto({ usd: 1.5, estimado: true, incompleto: true }, 2)).toBe("≥$1.50");
  });

  it("a explicação acompanha o prefixo — símbolo sem legenda é ruído", () => {
    expect(explicarCusto({ usd: 1, estimado: false, incompleto: false })).toContain("real");
    expect(explicarCusto({ usd: 1, estimado: true, incompleto: false })).toContain("Estimado");
    expect(explicarCusto({ usd: 1, estimado: true, incompleto: true })).toContain("Piso");
  });
});
