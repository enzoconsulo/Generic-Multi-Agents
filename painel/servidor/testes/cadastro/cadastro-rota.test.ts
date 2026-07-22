import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { Runner } from "../../src/jobs/tipos.js";

// Fábrica falsa fixa (com projetos/) — FABRICA_RAIZ tem que valer ANTES de o config carregar.
const FABRICA = mkdtempSync(join(tmpdir(), "cad-fab-"));
mkdirSync(join(FABRICA, "projetos"), { recursive: true });
process.env.FABRICA_RAIZ = FABRICA;
const { criarApp } = await import("../../src/app.js");
const { obterGerenciador, reiniciarGerenciador } = await import("../../src/jobs/instancia.js");

const runnerFake: Runner = {
  async executar() {
    return { ok: true };
  },
};

/** Pasta de origem fora da fábrica. */
function novaOrigem(): string {
  const dir = mkdtempSync(join(tmpdir(), "cad-src-"));
  writeFileSync(join(dir, "index.js"), "console.log('oi')\n");
  return dir;
}

async function app(registrar = true): Promise<Express> {
  reiniciarGerenciador({ dirJobs: mkdtempSync(join(tmpdir(), "cad-jobs-")), tetoClaude: 2 });
  if (registrar) obterGerenciador().registrarRunner("importar", runnerFake);
  return criarApp();
}

describe("POST /api/projetos/importar (T-013)", () => {
  it("origem válida cria job de importação não-Claude com lock por projeto (201)", async () => {
    const resp = await request(await app())
      .post("/api/projetos/importar")
      .send({ caminho: novaOrigem(), nome: "Meu App" });
    expect(resp.status).toBe(201);
    expect(resp.body.job.tipo).toBe("importar");
    expect(resp.body.job.usaClaude).toBe(false);
    expect(resp.body.job.escopo).toBe("projeto:meu-app");
  });

  it("caminho relativo → 400", async () => {
    const resp = await request(await app())
      .post("/api/projetos/importar")
      .send({ caminho: "./relativo" });
    expect(resp.status).toBe(400);
  });

  it("caminho inexistente → 400", async () => {
    const resp = await request(await app())
      .post("/api/projetos/importar")
      .send({ caminho: join(FABRICA, "nao-existe-xyz") });
    expect(resp.status).toBe(400);
  });

  it("nome já usado → 409", async () => {
    mkdirSync(join(FABRICA, "projetos", "ocupado"), { recursive: true });
    const resp = await request(await app())
      .post("/api/projetos/importar")
      .send({ caminho: novaOrigem(), nome: "ocupado" });
    expect(resp.status).toBe(409);
  });

  it("importar a raiz da fábrica → 400", async () => {
    const resp = await request(await app()).post("/api/projetos/importar").send({ caminho: FABRICA });
    expect(resp.status).toBe(400);
  });

  it("importar pasta dentro de projetos/ → 400", async () => {
    const dentro = join(FABRICA, "projetos", "algum-dir");
    mkdirSync(dentro, { recursive: true });
    const resp = await request(await app()).post("/api/projetos/importar").send({ caminho: dentro });
    expect(resp.status).toBe(400);
  });

  it("estratégia inválida → 400", async () => {
    const resp = await request(await app())
      .post("/api/projetos/importar")
      .send({ caminho: novaOrigem(), estrategia: "gpt" });
    expect(resp.status).toBe(400);
  });

  it("sem runner de importação registrado → 503", async () => {
    const resp = await request(await app(false))
      .post("/api/projetos/importar")
      .send({ caminho: novaOrigem(), nome: "sem-runner" });
    expect(resp.status).toBe(503);
  });
});
