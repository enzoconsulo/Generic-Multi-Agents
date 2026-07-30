import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GerenciadorJobs } from "../../src/jobs/fila.js";
import { criarRunnerFake } from "../../src/jobs/runner-fake.js";
import { podarJobs, salvarJob } from "../../src/jobs/persistencia.js";
import type { EstadoJob, Job } from "../../src/jobs/tipos.js";
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

describe("poda do histórico (T-045) — crescimento sem teto degrada devagar", () => {
  function jobEm(id: string, estado: EstadoJob, criadoEm: string): Job {
    return {
      id,
      tipo: "claude",
      titulo: `job ${id}`,
      escopo: "global",
      usaClaude: true,
      params: { prompt: "/status" },
      estado,
      criadoEm,
    };
  }

  it("apaga os terminais mais antigos além do teto e devolve os mantidos", () => {
    const dir = dirTemporario();
    try {
      const jobs = Array.from({ length: 10 }, (_, i) =>
        jobEm(`j${i}`, "concluido", `2026-07-${String(10 + i).padStart(2, "0")}T00:00:00.000Z`),
      );
      for (const j of jobs) salvarJob(dir, j);

      const { mantidos, apagados } = podarJobs(dir, jobs, 4);

      expect(apagados).toBe(6);
      // Sobram os QUATRO mais recentes (j9..j6), não os primeiros lidos do diretório.
      expect(mantidos.map((j) => j.id).sort()).toEqual(["j6", "j7", "j8", "j9"]);
      expect(readdirSync(dir).sort()).toEqual(["j6.json", "j7.json", "j8.json", "j9.json"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("NUNCA poda job vivo, nem quando é o mais antigo de todos", () => {
    const dir = dirTemporario();
    try {
      const vivo = jobEm("vivo", "executando", "2026-01-01T00:00:00.000Z");
      const jobs = [
        vivo,
        ...Array.from({ length: 5 }, (_, i) =>
          jobEm(`t${i}`, "concluido", `2026-07-${String(20 + i)}T00:00:00.000Z`),
        ),
      ];
      for (const j of jobs) salvarJob(dir, j);

      const { mantidos, apagados } = podarJobs(dir, jobs, 2);

      expect(apagados).toBe(3);
      expect(mantidos.some((j) => j.id === "vivo")).toBe(true);
      expect(existsSync(join(dir, "vivo.json"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("abaixo do teto não toca em nada", () => {
    const dir = dirTemporario();
    try {
      const jobs = [jobEm("a", "concluido", "2026-07-01T00:00:00.000Z")];
      salvarJob(dir, jobs[0]!);

      const { mantidos, apagados } = podarJobs(dir, jobs, 400);

      expect(apagados).toBe(0);
      expect(mantidos).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
