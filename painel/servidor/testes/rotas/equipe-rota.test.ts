import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const ORIGEM = resolve(aqui, "..", "fixtures", "fabrica-falsa");

// Cópia da fixture: estes testes GRAVAM, e sujar a fixture versionada faria os próximos
// rodarem sobre um estado que ninguém escolheu.
const FIXTURE = mkdtempSync(join(tmpdir(), "equipe-fix-"));
cpSync(ORIGEM, FIXTURE, { recursive: true });

process.env.FABRICA_RAIZ = FIXTURE;
const { criarApp } = await import("../../src/app.js");
const { reiniciarGerenciador } = await import("../../src/jobs/instancia.js");

async function app(): Promise<Express> {
  reiniciarGerenciador({ dirJobs: mkdtempSync(join(tmpdir(), "equipe-jobs-")), tetoClaude: 2 });
  return criarApp();
}

const AGENTE = { id: "audio", nome: "Áudio", descricao: "som", prompt: "cuide do áudio" };

describe("GET /api/equipe/:projeto", () => {
  it("projeto sem equipe.json responde lista vazia, não erro", async () => {
    // Ausência é NORMAL: o projeto usa o executor genérico.
    const resp = await request(await app()).get("/api/equipe/beta");
    expect(resp.status).toBe(200);
    expect(resp.body.agentes).toEqual([]);
  });

  it("projeto inexistente → 404", async () => {
    const resp = await request(await app()).get("/api/equipe/nao-existe");
    expect(resp.status).toBe(404);
  });
});

describe("PUT /api/equipe/:projeto", () => {
  it("grava a equipe e devolve o que ficou gravado", async () => {
    const servidor = await app();
    const resp = await request(servidor).put("/api/equipe/alfa").send({ agentes: [AGENTE] });
    expect(resp.status).toBe(200);
    expect(resp.body.gravado).toBe(true);
    expect(resp.body.agentes[0].id).toBe("audio");

    const arquivo = join(FIXTURE, "projetos", "alfa", "_gestao", "equipe.json");
    expect(JSON.parse(readFileSync(arquivo, "utf8")).agentes).toHaveLength(1);

    // E o GET seguinte lê o mesmo — grava e lê pelas mesmas regras.
    const lido = await request(servidor).get("/api/equipe/alfa");
    expect(lido.body.agentes[0].id).toBe("audio");
    expect(lido.body.agentes[0].erros).toEqual([]);
  });

  it("equipe inválida → 400 com a lista de problemas", async () => {
    const resp = await request(await app())
      .put("/api/equipe/alfa")
      .send({ agentes: [{ id: "MAIÚSCULO", prompt: "" }] });
    expect(resp.status).toBe(400);
    expect(Array.isArray(resp.body.problemas)).toBe(true);
    expect(resp.body.problemas.length).toBeGreaterThanOrEqual(2);
  });

  it("sem o campo `agentes` → 400", async () => {
    const resp = await request(await app()).put("/api/equipe/alfa").send({});
    expect(resp.status).toBe(400);
  });

  it("projeto inexistente e travessia de caminho → 404", async () => {
    const servidor = await app();
    expect((await request(servidor).put("/api/equipe/nao-existe").send({ agentes: [] })).status).toBe(404);
    expect((await request(servidor).put("/api/equipe/..%2Falfa").send({ agentes: [] })).status).toBe(404);
  });
});
