import { rmSync } from "node:fs";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { criarApp } from "../../src/app.js";
import type { GerenciadorJobs } from "../../src/jobs/fila.js";
import { reiniciarGerenciador } from "../../src/jobs/instancia.js";
import type { Runner } from "../../src/jobs/tipos.js";
import { aguardarEstado, dirTemporario } from "../jobs/ajudantes.js";

/**
 * O CAMINHO REAL do botão Retomar: `POST /api/jobs/:id/retomar` (16/08).
 *
 * A decisão pura já tem teste em `jobs/retomada.test.ts`. Este arquivo existe por causa da
 * armadilha da casa — *"ao terminar um mecanismo, USE-O pelo caminho real antes de dar por
 * pronto"*. O `captura.mjs --exigir` tinha teste, documentação e um agente que o havia
 * usado com sucesso, e ainda assim era inalcançável pela passada mecânica.
 *
 * Aqui o risco concreto é de roteamento: `rotas/retomada.ts` monta um SEGUNDO router no
 * mesmo prefixo `/api/jobs`, e `rotas/jobs.ts` — carregado ANTES, por ordem alfabética — já
 * declara `/:id`. Se o Express casasse aquele primeiro, o POST cairia em 404 e nada no
 * código acusaria.
 */
describe("POST /api/jobs/:id/retomar", () => {
  let dir: string;
  let ger: GerenciadorJobs;
  let app: Express;

  beforeEach(async () => {
    dir = dirTemporario();
    ger = reiniciarGerenciador({ dirJobs: dir, tetoClaude: 2 });
    app = await criarApp();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Runner que anota a sessão (como o RunnerClaude no `system/init`) e termina. */
  const runnerRapido: Runner = {
    async executar(_job, ctx) {
      ctx.anotar({ sessionId: "sess-abc123", cwd: "C:\\fabrica" });
      return { motivo: "limite-uso" };
    },
  };

  async function jobTerminado() {
    ger.registrarRunner("claude", runnerRapido);
    const job = ger.criarJob({
      tipo: "claude",
      titulo: "/ideia no banco-imobiliario",
      escopo: "global",
      usaClaude: true,
      params: { prompt: "/ideia tabuleiro no celular", cwd: "C:\\fabrica", modelo: "sonnet", tetoUsd: 6 },
    });
    await aguardarEstado(ger, job.id, "concluido");
    return job;
  }

  it("cria o job de retomada com a sessão do original", async () => {
    const job = await jobTerminado();
    const r = await request(app).post(`/api/jobs/${job.id}/retomar`).send({});

    expect(r.status).toBe(201);
    expect(r.body.modo).toBe("sessao");
    expect(r.body.job.params.retomarSessao).toBe("sess-abc123");
    // O pedido original NÃO é recolado — é o ponto inteiro do botão.
    expect(r.body.job.params.prompt).not.toContain("tabuleiro no celular");
    expect(ger.obter(r.body.job.id)).toBeDefined();
  });

  it("aceita teto maior no corpo", async () => {
    const job = await jobTerminado();
    const r = await request(app).post(`/api/jobs/${job.id}/retomar`).send({ tetoUsd: 12 });
    expect(r.body.job.params.tetoUsd).toBe(12);
  });

  it("teto torto é 400, não ignorado em silêncio", async () => {
    const job = await jobTerminado();
    for (const torto of [0, -3, "muito"]) {
      const r = await request(app).post(`/api/jobs/${job.id}/retomar`).send({ tetoUsd: torto });
      expect(r.status).toBe(400);
    }
  });

  it("job inexistente é 404", async () => {
    const r = await request(app).post("/api/jobs/nao-existe/retomar").send({});
    expect(r.status).toBe(404);
  });

  it("job ainda vivo é 409 — retomar criaria dois fluxos nos mesmos arquivos", async () => {
    ger.registrarRunner("pendurado", {
      executar: () => new Promise(() => {}),
    });
    const job = ger.criarJob({
      tipo: "pendurado",
      titulo: "rodando",
      escopo: "global",
      usaClaude: true,
    });
    await aguardarEstado(ger, job.id, "executando");
    const r = await request(app).post(`/api/jobs/${job.id}/retomar`).send({});
    expect(r.status).toBe(409);
  });
});
