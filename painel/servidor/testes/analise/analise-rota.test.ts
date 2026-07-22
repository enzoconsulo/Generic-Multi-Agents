import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { Runner } from "../../src/jobs/tipos.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(aqui, "..", "fixtures", "fabrica-falsa");

// Override da raiz da fábrica ANTES de o config.ts carregar (ele lê FABRICA_RAIZ na carga
// do módulo) — por isso os imports do app/gerenciador são dinâmicos. O vitest isola os
// módulos por arquivo de teste, então o override não vaza para os demais.
process.env.FABRICA_RAIZ = FIXTURE;
const { criarApp } = await import("../../src/app.js");
const { obterGerenciador, reiniciarGerenciador } = await import("../../src/jobs/instancia.js");

const runnerFake: Runner = {
  async executar() {
    return { ok: true };
  },
};

async function appComRunner(registrar: boolean): Promise<Express> {
  const dir = mkdtempSync(join(tmpdir(), "analise-rota-"));
  reiniciarGerenciador({ dirJobs: dir, tetoClaude: 2 });
  if (registrar) obterGerenciador().registrarRunner("claude", runnerFake);
  return criarApp();
}

describe("POST /api/acoes/analisar (T-012)", () => {
  it("cria job de análise com lock projeto:<nome> e cwd no projeto (201)", async () => {
    const app = await appComRunner(true);
    const resp = await request(app)
      .post("/api/acoes/analisar")
      .send({ projeto: "alfa", estrategia: "haiku" });
    expect(resp.status).toBe(201);
    expect(resp.body.job.tipo).toBe("claude");
    expect(resp.body.job.escopo).toBe("projeto:alfa");
    expect(resp.body.job.params.cwd).toContain(join("projetos", "alfa"));
    expect(resp.body.job.params.modelo).toBe("haiku");
  });

  it("sem o campo `projeto` → 400", async () => {
    const app = await appComRunner(true);
    const resp = await request(app).post("/api/acoes/analisar").send({ estrategia: "haiku" });
    expect(resp.status).toBe(400);
    expect(typeof resp.body.erro).toBe("string");
  });

  it("projeto inexistente → 404", async () => {
    const app = await appComRunner(true);
    const resp = await request(app).post("/api/acoes/analisar").send({ projeto: "nao-existe" });
    expect(resp.status).toBe(404);
    expect(resp.body.erro).toContain("não encontrado");
  });

  it("nome com travessia de caminho → 404 (nunca sai de projetos/)", async () => {
    const app = await appComRunner(true);
    const resp = await request(app).post("/api/acoes/analisar").send({ projeto: "../alfa" });
    expect(resp.status).toBe(404);
  });

  it("estratégia inválida → 400", async () => {
    const app = await appComRunner(true);
    const resp = await request(app)
      .post("/api/acoes/analisar")
      .send({ projeto: "alfa", estrategia: "gpt" });
    expect(resp.status).toBe(400);
  });

  it("não confunde com a rota /:id — 'analisar' não é tratado como ação (não vira 404 de ação)", async () => {
    // Se a rota /:id capturasse "analisar", faltando `projeto` daria 404 (ação desconhecida);
    // a rota certa devolve 400 (campo obrigatório). Garante a ordem das rotas.
    const app = await appComRunner(true);
    const resp = await request(app).post("/api/acoes/analisar").send({});
    expect(resp.status).toBe(400);
  });

  it("sem runner claude registrado → 503", async () => {
    const app = await appComRunner(false);
    const resp = await request(app)
      .post("/api/acoes/analisar")
      .send({ projeto: "alfa", estrategia: "haiku" });
    expect(resp.status).toBe(503);
    expect(resp.body.erro).toMatch(/runner Claude/i);
  });
});
