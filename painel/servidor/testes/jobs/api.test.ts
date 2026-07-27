import { rmSync } from "node:fs";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { criarApp } from "../../src/app.js";
import type { GerenciadorJobs } from "../../src/jobs/fila.js";
import { reiniciarGerenciador } from "../../src/jobs/instancia.js";
import { criarRunnerFake } from "../../src/jobs/runner-fake.js";
import type { Job } from "../../src/jobs/tipos.js";
import { aguardarEstado, criarRunnerManual, dirTemporario, type RunnerManual } from "./ajudantes.js";

describe("API /api/jobs", () => {
  let dir: string;
  let ger: GerenciadorJobs;
  let manual: RunnerManual;
  let app: Express;

  beforeEach(async () => {
    dir = dirTemporario();
    // A rota resolve o gerenciador a cada request — reiniciar aqui aponta a API
    // para um diretório temporário isolado deste teste.
    ger = reiniciarGerenciador({ dirJobs: dir, tetoClaude: 2 });
    manual = criarRunnerManual();
    ger.registrarRunner("manual", manual.runner);
    ger.registrarRunner("fake", criarRunnerFake({ passos: 2, delayMs: 1 }));
    app = await criarApp();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function criarJobManual(projeto: string): Job {
    return ger.criarJob({
      tipo: "manual",
      titulo: `Job de ${projeto}`,
      escopo: `projeto:${projeto}`,
      usaClaude: true,
    });
  }

  it("GET /api/jobs lista os jobs (e vazio quando não há nenhum)", async () => {
    const vazio = await request(app).get("/api/jobs");
    expect(vazio.status).toBe(200);
    expect(vazio.body.jobs).toEqual([]);

    const a = criarJobManual("alfa");
    const b = criarJobManual("beta");
    const resposta = await request(app).get("/api/jobs");
    expect(resposta.status).toBe(200);
    const ids = (resposta.body.jobs as Job[]).map((j) => j.id);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  it("GET /api/jobs?estado= filtra por estado e rejeita estado inválido com 400", async () => {
    const executando = criarJobManual("alfa");
    const naFila = criarJobManual("alfa"); // preso no lock do projeto
    await aguardarEstado(ger, executando.id, "executando");

    const soNaFila = await request(app).get("/api/jobs?estado=na-fila");
    expect(soNaFila.status).toBe(200);
    expect((soNaFila.body.jobs as Job[]).map((j) => j.id)).toEqual([naFila.id]);

    const soExecutando = await request(app).get("/api/jobs?estado=executando");
    expect((soExecutando.body.jobs as Job[]).map((j) => j.id)).toEqual([executando.id]);

    const invalido = await request(app).get("/api/jobs?estado=fritando");
    expect(invalido.status).toBe(400);
    expect(invalido.body.erro).toMatch(/Estado inválido/);
  });

  it("GET /api/jobs/:id retorna o job; 404 em JSON quando não existe", async () => {
    const job = criarJobManual("alfa");
    const resposta = await request(app).get(`/api/jobs/${job.id}`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.id).toBe(job.id);
    expect(resposta.body.titulo).toBe("Job de alfa");

    const sumido = await request(app).get("/api/jobs/nao-existe");
    expect(sumido.status).toBe(404);
    expect(sumido.body.erro).toMatch(/não encontrado/);
  });

  it("POST /api/jobs/:id/cancelar cancela job na-fila na hora (200)", async () => {
    const executando = criarJobManual("alfa");
    const naFila = criarJobManual("alfa");
    await aguardarEstado(ger, executando.id, "executando");

    const resposta = await request(app).post(`/api/jobs/${naFila.id}/cancelar`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.estado).toBe("cancelado");

    manual.concluir(executando.id);
    await aguardarEstado(ger, executando.id, "concluido");
    expect(manual.iniciados).toEqual([executando.id]); // o cancelado nunca executou
  });

  // Runner MANUAL (não o fake): o fake termina em ~2ms (2 passos × 1ms) e a ida-e-volta
  // HTTP do supertest demora bem mais, então o job já estava `concluido` quando o POST
  // chegava e a rota respondia 409 — o teste perdia essa corrida sempre. O manual fica
  // pendurado até o teste mandar, e ainda rejeita no abort, que é justamente o caminho
  // que este teste quer exercitar.
  it("POST /api/jobs/:id/cancelar em job executando aborta e termina cancelado (202)", async () => {
    const job = criarJobManual("alfa");
    await aguardarEstado(ger, job.id, "executando");

    const resposta = await request(app).post(`/api/jobs/${job.id}/cancelar`);
    expect(resposta.status).toBe(202);

    const final = await aguardarEstado(ger, job.id, "cancelado");
    expect(final.terminadoEm).toBeTruthy();
  });

  it("POST /api/jobs/:id/cancelar responde 404 para job inexistente e 409 para terminal", async () => {
    const sumido = await request(app).post("/api/jobs/nao-existe/cancelar");
    expect(sumido.status).toBe(404);

    const job = criarJobManual("alfa");
    await aguardarEstado(ger, job.id, "executando");
    manual.concluir(job.id);
    await aguardarEstado(ger, job.id, "concluido");

    const terminal = await request(app).post(`/api/jobs/${job.id}/cancelar`);
    expect(terminal.status).toBe(409);
    expect(terminal.body.erro).toMatch(/não pode ser cancelado/);
  });

  it("após reiniciar a instância (simula restart do processo), o histórico segue na API", async () => {
    const job = ger.criarJob({
      tipo: "fake",
      titulo: "Sobrevive ao restart",
      escopo: "projeto:alfa",
      usaClaude: true,
    });
    await aguardarEstado(ger, job.id, "concluido");

    // "Reinício do processo": instância nova lendo o mesmo diretório; a API deve
    // enxergar a nova instância sem recriar o app.
    reiniciarGerenciador({ dirJobs: dir, tetoClaude: 2 });

    const porId = await request(app).get(`/api/jobs/${job.id}`);
    expect(porId.status).toBe(200);
    expect(porId.body.estado).toBe("concluido");
    expect(porId.body.titulo).toBe("Sobrevive ao restart");

    const lista = await request(app).get("/api/jobs?estado=concluido");
    expect((lista.body.jobs as Job[]).map((j) => j.id)).toContain(job.id);
  });
});
