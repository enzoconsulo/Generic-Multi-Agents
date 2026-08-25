import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Runner } from "../../src/jobs/tipos.js";

/**
 * A rota do piloto. Import DINÂMICO e `FABRICA_RAIZ` antes de tudo: `config.ts` lê a env na
 * carga do módulo, e um import estático apontaria para a fábrica REAL — o teste ligaria um
 * piloto de verdade num projeto de verdade (ver a armadilha no CLAUDE.md).
 */

const aqui = dirname(fileURLToPath(import.meta.url));
const FIXTURE = mkdtempSync(join(tmpdir(), "piloto-fix-"));
cpSync(resolve(aqui, "..", "fixtures", "fabrica-falsa"), FIXTURE, { recursive: true });

process.env.FABRICA_RAIZ = FIXTURE;
process.env.DADOS_DIR = mkdtempSync(join(tmpdir(), "piloto-dados-"));
const { criarApp } = await import("../../src/app.js");
const { reiniciarGerenciador, obterGerenciador } = await import("../../src/jobs/instancia.js");
const { reiniciarPiloto } = await import("../../src/jobs/piloto/instancia.js");

/** Runner que só fica pendurado: a rodada nasce e não termina — é o que a rota promete. */
const runnerParado: Runner = {
  executar: () => new Promise<unknown>(() => {}),
};

let app: Express;

beforeEach(async () => {
  reiniciarPiloto();
  reiniciarGerenciador({ dirJobs: mkdtempSync(join(tmpdir(), "piloto-jobs-")), tetoClaude: 2 });
  obterGerenciador().registrarRunner("pipeline", runnerParado);
  app = await criarApp();
});

afterEach(() => {
  reiniciarPiloto();
});

const LIGAR = { projeto: "alfa", estrategia: "sonnet", tetoTotalUsd: 10, maxRodadas: 3 };

describe("GET /api/piloto", () => {
  it("piloto nunca ligado devolve null, não erro", async () => {
    const resp = await request(app).get("/api/piloto");
    expect(resp.status).toBe(200);
    expect(resp.body.piloto).toBeNull();
  });
});

describe("POST /api/piloto", () => {
  it("liga e JÁ dispara a primeira rodada", async () => {
    const resp = await request(app).post("/api/piloto").send(LIGAR);
    expect(resp.status).toBe(201);
    expect(resp.body.piloto.ligado).toBe(true);
    expect(resp.body.piloto.rodadas).toBe(1);
    expect(resp.body.piloto.ultimoJobId).toEqual(expect.any(String));

    const job = obterGerenciador().obter(resp.body.piloto.ultimoJobId);
    expect(job?.tipo).toBe("pipeline");
    expect(job?.titulo).toBe("/trabalhar alfa");
    expect(job?.escopo).toBe("projeto:alfa");
  });

  it("projeto inexistente → 404", async () => {
    const resp = await request(app).post("/api/piloto").send({ ...LIGAR, projeto: "nao-existe" });
    expect(resp.status).toBe(404);
  });

  it("recusa estratégia inválida", async () => {
    const resp = await request(app).post("/api/piloto").send({ ...LIGAR, estrategia: "gpt" });
    expect(resp.status).toBe(400);
  });

  it("exige os dois freios e barra o zero a mais na digitação", async () => {
    for (const corpo of [
      { projeto: "alfa", maxRodadas: 3 },
      { projeto: "alfa", tetoTotalUsd: 10 },
      { ...LIGAR, tetoTotalUsd: 5000 },
      { ...LIGAR, maxRodadas: 0 },
      { ...LIGAR, maxRodadas: 999 },
    ]) {
      const resp = await request(app).post("/api/piloto").send(corpo);
      expect(resp.status, JSON.stringify(corpo)).toBe(400);
    }
  });

  it("teto por rodada maior que o acumulado é contradição, não configuração", async () => {
    const resp = await request(app)
      .post("/api/piloto")
      .send({ ...LIGAR, tetoTotalUsd: 5, tetoUsdPorRodada: 8 });
    expect(resp.status).toBe(400);
  });
});

describe("DELETE /api/piloto", () => {
  it("desliga sem cancelar a rodada em voo", async () => {
    const ligado = await request(app).post("/api/piloto").send(LIGAR);
    const jobId = ligado.body.piloto.ultimoJobId as string;

    const resp = await request(app).delete("/api/piloto");
    expect(resp.status).toBe(200);
    expect(resp.body.piloto.ligado).toBe(false);
    expect(resp.body.piloto.parouPor).toBe("desligado");
    expect(obterGerenciador().obter(jobId)?.estado).not.toBe("cancelado");
  });

  it("desligar o que nunca foi ligado é 409, não 500", async () => {
    const resp = await request(app).delete("/api/piloto");
    expect(resp.status).toBe(409);
  });
});
