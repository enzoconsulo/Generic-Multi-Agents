import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { Runner } from "../../src/jobs/tipos.js";

// Fábrica falsa fixa (com projetos/) — FABRICA_RAIZ tem que valer ANTES de o config carregar.
// De propósito SEM criar `_gestao/`: um diretório sob projetos/ que nunca passou pelo
// /novo-projeto (pasta clonada à mão) é um projeto válido para o leitor, e a config de CI
// tem que funcionar nele — regressão de ENOENT→500 coberta também em config.test.ts.
const FABRICA = mkdtempSync(join(tmpdir(), "ci-rota-fab-"));
mkdirSync(join(FABRICA, "projetos", "comjson"), { recursive: true });
writeFileSync(
  join(FABRICA, "projetos", "comjson", "package.json"),
  JSON.stringify({ scripts: { test: "node t.js" } }),
  "utf8",
);
mkdirSync(join(FABRICA, "projetos", "semjson"), { recursive: true });
process.env.FABRICA_RAIZ = FABRICA;
process.env.DADOS_DIR = mkdtempSync(join(tmpdir(), "ci-rota-dados-"));
const { criarApp } = await import("../../src/app.js");
const { obterGerenciador, reiniciarGerenciador } = await import("../../src/jobs/instancia.js");

const runnerFake: Runner = {
  async executar() {
    return { estado: "sucesso", estagios: [] };
  },
};

async function app(registrar = true): Promise<Express> {
  reiniciarGerenciador({ dirJobs: mkdtempSync(join(tmpdir(), "ci-rota-jobs-")), tetoClaude: 2 });
  if (registrar) obterGerenciador().registrarRunner("ci", runnerFake);
  return criarApp();
}

describe("GET /api/ci/:projeto/config", () => {
  // Timeout generoso: I/O real (grava _gestao/ci.json) sob OneDrive pode espicaçar
  // quando a suíte roda vários testes com processos filhos em paralelo (ver DECISOES.md
  // 2026-07-21, achado do T-007: EBUSY/EPERM de OneDrive/antivírus em Documents\).
  it("projeto com package.json: cria/devolve defaults deduzidos (200)", async () => {
    const resp = await request(await app()).get("/api/ci/comjson/config");
    expect(resp.status).toBe(200);
    expect(resp.body.config.estagios.testes.habilitado).toBe(true);
    expect(resp.body.config.estagios.build.habilitado).toBe(false);
  }, 15000);

  it("projeto sem package.json: 422 com mensagem clara", async () => {
    const resp = await request(await app()).get("/api/ci/semjson/config");
    expect(resp.status).toBe(422);
    expect(resp.body.erro).toMatch(/package\.json/i);
  });

  it("projeto inexistente → 404", async () => {
    const resp = await request(await app()).get("/api/ci/nao-existe/config");
    expect(resp.status).toBe(404);
  });
});

describe("PUT /api/ci/:projeto/config", () => {
  it("config válida é gravada e devolvida (200)", async () => {
    const config = {
      estagios: {
        instalar: { comando: "npm install", habilitado: true },
        lint: { comando: null, habilitado: false },
        testes: { comando: "npm test", habilitado: true },
        build: { comando: null, habilitado: false },
      },
      timeoutMs: 30000,
    };
    const resp = await request(await app()).put("/api/ci/comjson/config").send(config);
    expect(resp.status).toBe(200);
    expect(resp.body.config).toEqual(config);
  }, 15000);

  it("config inválida → 400", async () => {
    const resp = await request(await app())
      .put("/api/ci/comjson/config")
      .send({ estagios: {}, timeoutMs: 1000 });
    expect(resp.status).toBe(400);
  });
});

describe("POST /api/ci/:projeto/rodar", () => {
  it("cria job de CI não-Claude com lock por projeto (201)", async () => {
    const resp = await request(await app()).post("/api/ci/comjson/rodar");
    expect(resp.status).toBe(201);
    expect(resp.body.job.tipo).toBe("ci");
    expect(resp.body.job.usaClaude).toBe(false);
    expect(resp.body.job.escopo).toBe("projeto:comjson");
  });

  it("projeto sem package.json → 422", async () => {
    const resp = await request(await app()).post("/api/ci/semjson/rodar");
    expect(resp.status).toBe(422);
  });

  it("projeto inexistente → 404", async () => {
    const resp = await request(await app()).post("/api/ci/nao-existe/rodar");
    expect(resp.status).toBe(404);
  });

  it("sem runner de CI registrado → 503", async () => {
    const resp = await request(await app(false)).post("/api/ci/comjson/rodar");
    expect(resp.status).toBe(503);
  });
});

describe("GET /api/ci/:projeto", () => {
  it("nunca rodou → ultimo null, historico vazio (200)", async () => {
    const resp = await request(await app()).get("/api/ci/comjson");
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ ultimo: null, historico: [] });
  });

  it("projeto inexistente → 404", async () => {
    const resp = await request(await app()).get("/api/ci/nao-existe");
    expect(resp.status).toBe(404);
  });
});
