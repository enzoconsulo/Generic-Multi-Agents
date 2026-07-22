import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApp } from "../../src/app.js";
import { obterGerenciador, reiniciarGerenciador } from "../../src/jobs/instancia.js";
import type { Runner } from "../../src/jobs/tipos.js";

const runnerFake: Runner = {
  async executar() {
    return { ok: true };
  },
};

function reiniciarComTemp(comRunner: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "acoes-"));
  reiniciarGerenciador({ dirJobs: dir, tetoClaude: 2 });
  if (comRunner) obterGerenciador().registrarRunner("claude", runnerFake);
}

describe("POST /api/acoes/:id", () => {
  let app: Express;

  beforeEach(async () => {
    reiniciarComTemp(true);
    app = await criarApp();
  });

  it("cria um job claude para uma ação válida (201)", async () => {
    const resp = await request(app).post("/api/acoes/status").send({ estrategia: "haiku" });
    expect(resp.status).toBe(201);
    expect(resp.body.job.tipo).toBe("claude");
    expect(resp.body.job.titulo).toBe("/status");
    expect(typeof resp.body.job.id).toBe("string");
  });

  it("passa argumentos para o comando", async () => {
    const resp = await request(app)
      .post("/api/acoes/trabalhar")
      .send({ argumentos: "painel-fabrica", estrategia: "sonnet" });
    expect(resp.status).toBe(201);
    expect(resp.body.job.titulo).toBe("/trabalhar painel-fabrica");
    expect(resp.body.job.escopo).toBe("projeto:painel-fabrica");
  });

  it("rejeita estratégia inválida (400)", async () => {
    const resp = await request(app).post("/api/acoes/status").send({ estrategia: "gpt" });
    expect(resp.status).toBe(400);
    expect(typeof resp.body.erro).toBe("string");
  });

  it("estratégia com fallback resolve modelo primário + fallback nos params", async () => {
    const resp = await request(app).post("/api/acoes/status").send({ estrategia: "fable-opus" });
    expect(resp.status).toBe(201);
    expect(resp.body.job.params.modelo).toBe("fable");
    expect(resp.body.job.params.fallback).toBe("opus");
  });

  it("ação desconhecida → 404", async () => {
    const resp = await request(app).post("/api/acoes/inexistente").send({ estrategia: "haiku" });
    expect(resp.status).toBe(404);
  });

  it("sem runner claude registrado → 503 (mensagem clara)", async () => {
    reiniciarComTemp(false);
    const appSemRunner = await criarApp();
    const resp = await request(appSemRunner).post("/api/acoes/status").send({ estrategia: "haiku" });
    expect(resp.status).toBe(503);
    expect(resp.body.erro).toMatch(/runner Claude/i);
  });
});
