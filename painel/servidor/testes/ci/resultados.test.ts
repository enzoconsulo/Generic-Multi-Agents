import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lerResultados, salvarResultado, type ResultadoCi } from "../../src/ci/resultados.js";

function resultado(jobId: string, projeto = "app"): ResultadoCi {
  return {
    jobId,
    projeto,
    estado: "sucesso",
    iniciadoEm: new Date().toISOString(),
    terminadoEm: new Date().toISOString(),
    estagios: [],
  };
}

describe("resultados de CI", () => {
  it("nunca rodou → null", () => {
    const dir = mkdtempSync(join(tmpdir(), "ci-res-"));
    expect(lerResultados(dir, "app")).toBeNull();
  });

  it("salva e lê de volta (último + histórico)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ci-res-"));
    salvarResultado(dir, resultado("job1"));
    const lido = lerResultados(dir, "app");
    expect(lido?.ultimo.jobId).toBe("job1");
    expect(lido?.historico.map((r) => r.jobId)).toEqual(["job1"]);
  });

  it("execuções seguintes empilham no histórico, mais recente primeiro", () => {
    const dir = mkdtempSync(join(tmpdir(), "ci-res-"));
    salvarResultado(dir, resultado("job1"));
    salvarResultado(dir, resultado("job2"));
    const lido = lerResultados(dir, "app");
    expect(lido?.ultimo.jobId).toBe("job2");
    expect(lido?.historico.map((r) => r.jobId)).toEqual(["job2", "job1"]);
  });

  it("mesmo jobId reescreve a entrada (atualização durante a execução)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ci-res-"));
    salvarResultado(dir, { ...resultado("job1"), estado: "executando" });
    salvarResultado(dir, { ...resultado("job1"), estado: "sucesso" });
    const lido = lerResultados(dir, "app");
    expect(lido?.historico).toHaveLength(1);
    expect(lido?.ultimo.estado).toBe("sucesso");
  });

  it("projetos diferentes não se misturam", () => {
    const dir = mkdtempSync(join(tmpdir(), "ci-res-"));
    salvarResultado(dir, resultado("a1", "alfa"));
    salvarResultado(dir, resultado("b1", "beta"));
    expect(lerResultados(dir, "alfa")?.ultimo.jobId).toBe("a1");
    expect(lerResultados(dir, "beta")?.ultimo.jobId).toBe("b1");
  });
});
