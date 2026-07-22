import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GerenciadorJobs } from "../../src/jobs/fila.js";
import { criarRunnerFake } from "../../src/jobs/runner-fake.js";
import type { Job } from "../../src/jobs/tipos.js";
import { aguardarEstado, criarRunnerManual, dirTemporario } from "./ajudantes.js";

describe("persistência de jobs em dados/jobs/<id>.json", () => {
  let dir: string;

  beforeEach(() => {
    dir = dirTemporario();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function lerDoDisco(id: string): Job {
    return JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8")) as Job;
  }

  it("grava o metadado na criação e o atualiza a cada transição", async () => {
    const ger = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 2 });
    const manual = criarRunnerManual();
    ger.registrarRunner("manual", manual.runner);

    const job = ger.criarJob({
      tipo: "manual",
      titulo: "Job persistido",
      escopo: "projeto:alfa",
      usaClaude: true,
    });
    expect(existsSync(join(dir, `${job.id}.json`))).toBe(true);

    await aguardarEstado(ger, job.id, "executando");
    expect(lerDoDisco(job.id).estado).toBe("executando");
    expect(lerDoDisco(job.id).iniciadoEm).toBeTruthy();

    manual.concluir(job.id, { saida: 42 });
    await aguardarEstado(ger, job.id, "concluido");
    const finalNoDisco = lerDoDisco(job.id);
    expect(finalNoDisco.estado).toBe("concluido");
    expect(finalNoDisco.terminadoEm).toBeTruthy();
    expect(finalNoDisco.resultado).toEqual({ saida: 42 });
    // Escrita atômica (temp + rename) não deixa resíduo .tmp após as transições.
    expect(readdirSync(dir).filter((nome) => nome.endsWith(".tmp"))).toEqual([]);
  });

  it("após recriar a instância (reinício do processo), o histórico segue consultável", async () => {
    const ger1 = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 2 });
    ger1.registrarRunner("fake", criarRunnerFake({ passos: 2, delayMs: 1 }));
    const concluido = ger1.criarJob({
      tipo: "fake",
      titulo: "Terminou antes do reinício",
      escopo: "projeto:alfa",
      usaClaude: true,
    });
    await aguardarEstado(ger1, concluido.id, "concluido");

    // Novo processo: instância nova lendo o MESMO diretório.
    const ger2 = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 2 });
    const recuperado = ger2.obter(concluido.id);
    expect(recuperado?.estado).toBe("concluido");
    expect(recuperado?.titulo).toBe("Terminou antes do reinício");
    expect(ger2.listar().map((j) => j.id)).toContain(concluido.id);
  });

  it("job não-terminal deixado por um processo que caiu vira interrompido no boot", async () => {
    const ger1 = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 2 });
    const manual = criarRunnerManual();
    ger1.registrarRunner("manual", manual.runner);
    const pendurado = ger1.criarJob({
      tipo: "manual",
      titulo: "Ficou executando quando o processo caiu",
      escopo: "projeto:alfa",
      usaClaude: true,
    });
    await aguardarEstado(ger1, pendurado.id, "executando");
    // ger1 é abandonado aqui, com o job ainda "executando" no disco (processo caiu).

    const ger2 = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 2 });
    const orfao = ger2.obter(pendurado.id);
    expect(orfao?.estado).toBe("interrompido");
    expect(orfao?.erro).toMatch(/reiniciou/);
    expect(lerDoDisco(pendurado.id).estado).toBe("interrompido"); // corrigido também no disco
  });

  it("arquivo malformado no diretório é ignorado sem derrubar a carga", () => {
    writeFileSync(join(dir, "lixo.json"), "{ isso não é json", "utf8");
    writeFileSync(join(dir, "incompleto.json"), JSON.stringify({ id: "abc" }), "utf8");
    // Sobra de escrita atômica interrompida (crash entre write e rename): ignorada.
    writeFileSync(join(dir, "deadbeef.json.tmp"), '{ "id": "trunca', "utf8");
    const ger = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 2 });
    expect(ger.listar()).toEqual([]);
  });
});
