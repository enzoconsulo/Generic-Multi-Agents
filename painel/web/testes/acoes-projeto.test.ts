import { describe, expect, it } from "vitest";
import { jobAtivoDoProjeto } from "../src/paginas/projeto/AcoesProjeto";
import type { Job } from "../src/lib/tipos";

function job(parcial: Partial<Job> & Pick<Job, "id" | "escopo" | "estado">): Job {
  return {
    tipo: "claude",
    titulo: `Job ${parcial.id}`,
    usaClaude: true,
    params: {},
    criadoEm: new Date().toISOString(),
    ...parcial,
  };
}

describe("jobAtivoDoProjeto (T-016)", () => {
  it("nenhum job do projeto → null", () => {
    const jobs = [job({ id: "a", escopo: "projeto:outro", estado: "executando" })];
    expect(jobAtivoDoProjeto(jobs, "meu-projeto")).toBeNull();
  });

  it("ignora jobs terminais do mesmo projeto", () => {
    const jobs = [job({ id: "a", escopo: "projeto:meu-projeto", estado: "concluido" })];
    expect(jobAtivoDoProjeto(jobs, "meu-projeto")).toBeNull();
  });

  it("ignora jobs de OUTRO escopo mesmo com nome parecido (sem match parcial)", () => {
    const jobs = [job({ id: "a", escopo: "projeto:meu-projeto-2", estado: "executando" })];
    expect(jobAtivoDoProjeto(jobs, "meu-projeto")).toBeNull();
  });

  it("um job ativo do projeto → ele mesmo", () => {
    const alvo = job({ id: "a", escopo: "projeto:meu-projeto", estado: "executando" });
    expect(jobAtivoDoProjeto([alvo], "meu-projeto")?.id).toBe("a");
  });

  it("prioriza o job executando/aguardando-input sobre os que só esperam na fila", () => {
    const naFila = job({ id: "fila", escopo: "projeto:meu-projeto", estado: "na-fila" });
    const executando = job({ id: "exec", escopo: "projeto:meu-projeto", estado: "executando" });
    expect(jobAtivoDoProjeto([naFila, executando], "meu-projeto")?.id).toBe("exec");
    expect(jobAtivoDoProjeto([executando, naFila], "meu-projeto")?.id).toBe("exec");
  });

  it("sem nenhum executando: cai no primeiro da fila", () => {
    const fila1 = job({ id: "f1", escopo: "projeto:meu-projeto", estado: "na-fila" });
    const fila2 = job({ id: "f2", escopo: "projeto:meu-projeto", estado: "na-fila" });
    expect(jobAtivoDoProjeto([fila1, fila2], "meu-projeto")?.id).toBe("f1");
  });

  it("aguardando-input também conta como ativo/bloqueante", () => {
    const alvo = job({ id: "a", escopo: "projeto:meu-projeto", estado: "aguardando-input" });
    expect(jobAtivoDoProjeto([alvo], "meu-projeto")?.id).toBe("a");
  });
});
