import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GerenciadorJobs } from "../../src/jobs/fila.js";
import { criarRunnerFake } from "../../src/jobs/runner-fake.js";
import type { EscopoLock, EventoJob } from "../../src/jobs/tipos.js";
import { aguardarEstado, criarRunnerManual, dirTemporario, type RunnerManual } from "./ajudantes.js";

describe("fila de jobs — locks de concorrência", () => {
  let dir: string;
  let ger: GerenciadorJobs;
  let manual: RunnerManual;

  beforeEach(() => {
    dir = dirTemporario();
    ger = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 2 });
    manual = criarRunnerManual();
    ger.registrarRunner("manual", manual.runner);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function jobDeProjeto(projeto: string, usaClaude = true) {
    return ger.criarJob({
      tipo: "manual",
      titulo: `Job do projeto ${projeto}`,
      escopo: `projeto:${projeto}`,
      usaClaude,
    });
  }

  it("(a) job global só executa com a máquina vazia e bloqueia tudo enquanto executa", async () => {
    const alfa = jobDeProjeto("alfa");
    await aguardarEstado(ger, alfa.id, "executando");

    const global = ger.criarJob({
      tipo: "manual",
      titulo: "Job global",
      escopo: "global",
      usaClaude: true,
    });
    expect(ger.obter(global.id)?.estado).toBe("na-fila"); // alfa ainda roda

    // Job de projeto LIVRE enfileirado depois do global também espera (anti-starvation).
    const beta = jobDeProjeto("beta");
    expect(ger.obter(beta.id)?.estado).toBe("na-fila");

    manual.concluir(alfa.id);
    await aguardarEstado(ger, alfa.id, "concluido");
    await aguardarEstado(ger, global.id, "executando");

    // Global executando: beta continua esperando, mesmo sem conflito de projeto/teto.
    expect(ger.obter(beta.id)?.estado).toBe("na-fila");
    expect(ger.executandoAgora).toBe(1);

    manual.concluir(global.id);
    await aguardarEstado(ger, global.id, "concluido");
    await aguardarEstado(ger, beta.id, "executando");
    manual.concluir(beta.id);
    await aguardarEstado(ger, beta.id, "concluido");
  });

  it("(b) dois jobs do MESMO projeto nunca executam juntos", async () => {
    const primeiro = jobDeProjeto("alfa");
    const segundo = jobDeProjeto("alfa");

    await aguardarEstado(ger, primeiro.id, "executando");
    expect(ger.obter(segundo.id)?.estado).toBe("na-fila");
    expect(manual.iniciados).toEqual([primeiro.id]);

    manual.concluir(primeiro.id);
    await aguardarEstado(ger, primeiro.id, "concluido");
    await aguardarEstado(ger, segundo.id, "executando");
    expect(manual.iniciados).toEqual([primeiro.id, segundo.id]);

    manual.concluir(segundo.id);
    await aguardarEstado(ger, segundo.id, "concluido");
  });

  it("(c) projetos diferentes executam juntos até o teto Claude; não-Claude ignora o teto", async () => {
    const alfa = jobDeProjeto("alfa");
    const beta = jobDeProjeto("beta");
    const gama = jobDeProjeto("gama"); // 3º Claude: espera o teto (2) liberar

    await aguardarEstado(ger, alfa.id, "executando");
    await aguardarEstado(ger, beta.id, "executando");
    expect(ger.obter(gama.id)?.estado).toBe("na-fila");
    expect(ger.executandoAgora).toBe(2);

    // Job não-Claude conta no lock de projeto, mas NÃO no teto Claude.
    const delta = jobDeProjeto("delta", false);
    await aguardarEstado(ger, delta.id, "executando");
    expect(ger.executandoAgora).toBe(3);

    manual.concluir(alfa.id);
    await aguardarEstado(ger, alfa.id, "concluido");
    await aguardarEstado(ger, gama.id, "executando"); // vaga do teto liberada

    for (const id of [beta.id, gama.id, delta.id]) {
      manual.concluir(id);
      await aguardarEstado(ger, id, "concluido");
    }
  });

  it("(d) cancelar job na-fila remove da fila e ele nunca executa", async () => {
    const primeiro = jobDeProjeto("alfa");
    const segundo = jobDeProjeto("alfa"); // preso no lock do projeto
    await aguardarEstado(ger, primeiro.id, "executando");
    expect(ger.obter(segundo.id)?.estado).toBe("na-fila");

    const cancelado = ger.cancelar(segundo.id);
    expect(cancelado.estado).toBe("cancelado");
    expect(cancelado.terminadoEm).toBeTruthy();

    manual.concluir(primeiro.id);
    await aguardarEstado(ger, primeiro.id, "concluido");

    // O lock do projeto liberou, mas o job cancelado não pode ter iniciado.
    expect(manual.iniciados).toEqual([primeiro.id]);
    expect(ger.obter(segundo.id)?.estado).toBe("cancelado");
  });

  it("(e) cancelar job executando aciona o AbortSignal e o estado final é cancelado", async () => {
    // Runner fake com muitos passos: sem o abort, levaria ~5s — o cancelamento
    // terminar em instantes prova que o sinal foi respeitado.
    ger.registrarRunner("fake", criarRunnerFake({ passos: 250, delayMs: 20 }));
    const job = ger.criarJob({
      tipo: "fake",
      titulo: "Job fake demorado",
      escopo: "projeto:alfa",
      usaClaude: true,
    });
    await aguardarEstado(ger, job.id, "executando");

    ger.cancelar(job.id);
    const final = await aguardarEstado(ger, job.id, "cancelado");
    expect(final.terminadoEm).toBeTruthy();
    expect(ger.executandoAgora).toBe(0);
  });

  it("runner que lança leva o job a falhou com a mensagem registrada", async () => {
    ger.registrarRunner("fake-quebrado", criarRunnerFake({ passos: 1, delayMs: 1, falharCom: "Deu ruim de propósito" }));
    const job = ger.criarJob({
      tipo: "fake-quebrado",
      titulo: "Job que falha",
      escopo: "projeto:alfa",
      usaClaude: true,
    });
    const final = await aguardarEstado(ger, job.id, "falhou");
    expect(final.erro).toBe("Deu ruim de propósito");
  });

  it("emite eventos no canal único: transições de estado e logs do runner, com jobId", async () => {
    ger.registrarRunner("fake", criarRunnerFake({ passos: 2, delayMs: 1 }));
    const eventos: EventoJob[] = [];
    ger.emissor.on("evento", (evento: EventoJob) => eventos.push(evento));

    const job = ger.criarJob({
      tipo: "fake",
      titulo: "Job com eventos",
      escopo: "projeto:alfa",
      usaClaude: true,
    });
    await aguardarEstado(ger, job.id, "concluido");

    const doJob = eventos.filter((e) => e.jobId === job.id);
    expect(doJob.map((e) => e.tipo)).toEqual(["estado", "estado", "log", "log", "estado"]);
    const transicoes = doJob
      .filter((e) => e.tipo === "estado")
      .map((e) => (e.dados as { para: string }).para);
    expect(transicoes).toEqual(["na-fila", "executando", "concluido"]);
  });

  it("rejeita tipo de job sem runner registrado e escopo de lock inválido", () => {
    expect(() =>
      ger.criarJob({ tipo: "inexistente", titulo: "x", escopo: "global", usaClaude: false }),
    ).toThrow(/Tipo de job desconhecido/);
    expect(() =>
      // "projeto:" passa no tipo (template literal), mas o runtime exige nome não-vazio
      ger.criarJob({ tipo: "manual", titulo: "x", escopo: "projeto:", usaClaude: false }),
    ).toThrow(/Escopo de lock inválido/);
    const escopoInvalido = "banana" as unknown as EscopoLock; // entrada vinda de fora
    expect(() =>
      ger.criarJob({ tipo: "manual", titulo: "x", escopo: escopoInvalido, usaClaude: false }),
    ).toThrow(/Escopo de lock inválido/);
  });

  it("cancelar job em estado terminal lança ErroJobNaoCancelavel", async () => {
    const job = jobDeProjeto("alfa");
    await aguardarEstado(ger, job.id, "executando");
    manual.concluir(job.id);
    await aguardarEstado(ger, job.id, "concluido");

    expect(() => ger.cancelar(job.id)).toThrow(/não pode ser cancelado/);
  });
});
