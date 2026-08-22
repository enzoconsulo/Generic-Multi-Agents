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
  if (comRunner) {
    obterGerenciador().registrarRunner("claude", runnerFake);
    // `/trabalhar <projeto>` gera job `pipeline` desde 02/08 — sem este registro, a rota
    // responderia 503 e o teste falaria de outra coisa.
    obterGerenciador().registrarRunner("pipeline", runnerFake);
  }
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
    // A mensagem deixou de nomear só o runner Claude: `/trabalhar <projeto>` usa o
    // `pipeline`, e apontar o runner errado manda quem diagnostica para o lugar errado.
    expect(resp.body.erro).toMatch(/runner não registrado/i);
    expect(resp.body.erro).toMatch(/pipeline/i);
  });
});

/**
 * TETO ESCOLHIDO NO DISPARO (21/08). O cartão passou a mostrar a estimativa medida do
 * projeto ao lado do teto vigente; mostrar o número sem deixar mexer nele seria informar e
 * não dar decisão. A tabela de guardrails continua sendo o padrão.
 */
describe("POST /api/acoes/:id — teto escolhido no disparo", () => {
  let app: Express;

  beforeEach(async () => {
    reiniciarComTemp(true);
    app = await criarApp();
  });

  it("sem `tetoUsd`, vale o teto da tabela (/trabalhar = 8)", async () => {
    const resp = await request(app).post("/api/acoes/trabalhar").send({ argumentos: "proj" });
    expect(resp.status).toBe(201);
    expect(resp.body.job.params.tetoUsd).toBe(8);
  });

  it("`tetoUsd` sobrepõe a tabela, inclusive para MENOS (rodada curta é pedido legítimo)", async () => {
    const resp = await request(app)
      .post("/api/acoes/trabalhar")
      .send({ argumentos: "proj", tetoUsd: 3.5 });
    expect(resp.status).toBe(201);
    expect(resp.body.job.params.tetoUsd).toBe(3.5);
  });

  it("vale também no job `claude` (o /trabalhar sem projeto e as outras ações)", async () => {
    const resp = await request(app).post("/api/acoes/status").send({ tetoUsd: 5 });
    expect(resp.status).toBe(201);
    expect(resp.body.job.tipo).toBe("claude");
    expect(resp.body.job.params.tetoUsd).toBe(5);
  });

  /** Anteparo de DIGITAÇÃO: um zero a mais viraria uma rodada de centenas de dólares. */
  it("recusa teto fora da faixa ou que não é número (400), sem criar job", async () => {
    for (const tetoUsd of [0, -1, 101, "oito"]) {
      const resp = await request(app)
        .post("/api/acoes/trabalhar")
        .send({ argumentos: "proj", tetoUsd });
      expect(resp.status, `teto ${String(tetoUsd)}`).toBe(400);
    }
  });
});
