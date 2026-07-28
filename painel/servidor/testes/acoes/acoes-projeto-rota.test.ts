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

// Mesmo padrão do teste da análise: override da raiz ANTES de o config.ts carregar, por
// isso os imports são dinâmicos.
process.env.FABRICA_RAIZ = FIXTURE;
const { criarApp } = await import("../../src/app.js");
const { obterGerenciador, reiniciarGerenciador } = await import("../../src/jobs/instancia.js");

const runnerFake: Runner = {
  async executar() {
    return { ok: true };
  },
};

async function appComRunner(registrar: boolean): Promise<Express> {
  const dir = mkdtempSync(join(tmpdir(), "acoes-projeto-rota-"));
  reiniciarGerenciador({ dirJobs: dir, tetoClaude: 2 });
  if (registrar) obterGerenciador().registrarRunner("claude", runnerFake);
  return criarApp();
}

describe("GET /api/acoes-projeto", () => {
  it("lista o catálogo com o que a UI precisa para desenhar o card", async () => {
    const app = await appComRunner(true);
    const resp = await request(app).get("/api/acoes-projeto");
    expect(resp.status).toBe(200);
    expect(Array.isArray(resp.body.acoes)).toBe(true);
    expect(resp.body.acoes).toHaveLength(7);
    for (const acao of resp.body.acoes) {
      expect(typeof acao.id).toBe("string");
      expect(typeof acao.rotulo).toBe("string");
      expect(typeof acao.resumo).toBe("string");
      expect(["leve", "medio", "pesado"]).toContain(acao.peso);
    }
  });
});

describe("POST /api/acoes-projeto/:id", () => {
  it("cria o job com lock do projeto e cwd na RAIZ da fábrica (201)", async () => {
    const app = await appComRunner(true);
    const resp = await request(app)
      .post("/api/acoes-projeto/documentar")
      .send({ projeto: "alfa", estrategia: "haiku" });
    expect(resp.status).toBe(201);
    expect(resp.body.job.escopo).toBe("projeto:alfa");
    // A decisão da T-033: roda da raiz, para poder despachar os .claude/agents/.
    expect(resp.body.job.params.cwd).toBe(FIXTURE);
    expect(resp.body.job.params.cwd).not.toContain(join("projetos", "alfa"));
  });

  it("o prompt carrega o caminho do projeto (confinamento) e a pergunta do usuário", async () => {
    const app = await appComRunner(true);
    const resp = await request(app)
      .post("/api/acoes-projeto/pesquisar")
      .send({ projeto: "alfa", entrada: "qual banco usar", estrategia: "haiku" });
    expect(resp.status).toBe(201);
    const prompt: string = resp.body.job.params.prompt;
    expect(prompt).toContain(join(FIXTURE, "projetos", "alfa"));
    expect(prompt).toContain("qual banco usar");
  });

  it("ações de projetos diferentes não disputam o mesmo lock", async () => {
    const app = await appComRunner(true);
    const a = await request(app).post("/api/acoes-projeto/testar").send({ projeto: "alfa" });
    const b = await request(app).post("/api/acoes-projeto/testar").send({ projeto: "beta" });
    expect(a.body.job.escopo).toBe("projeto:alfa");
    expect(b.body.job.escopo).toBe("projeto:beta");
    expect(a.body.job.escopo).not.toBe(b.body.job.escopo);
  });

  it("pesquisar sem pergunta → 400 (o agente inventaria o próprio objetivo)", async () => {
    const app = await appComRunner(true);
    const resp = await request(app)
      .post("/api/acoes-projeto/pesquisar")
      .send({ projeto: "alfa", entrada: "   " });
    expect(resp.status).toBe(400);
    expect(typeof resp.body.erro).toBe("string");
  });

  it("replanejar aceita entrada vazia (o recorte é opcional)", async () => {
    const app = await appComRunner(true);
    const resp = await request(app).post("/api/acoes-projeto/replanejar").send({ projeto: "alfa" });
    expect(resp.status).toBe(201);
  });

  it("sem o campo `projeto` → 400", async () => {
    const app = await appComRunner(true);
    const resp = await request(app).post("/api/acoes-projeto/documentar").send({});
    expect(resp.status).toBe(400);
  });

  it("ação fora do catálogo → 404", async () => {
    const app = await appComRunner(true);
    const resp = await request(app).post("/api/acoes-projeto/formatar-hd").send({ projeto: "alfa" });
    expect(resp.status).toBe(404);
  });

  it("projeto inexistente e travessia de caminho → 404", async () => {
    const app = await appComRunner(true);
    const inexistente = await request(app)
      .post("/api/acoes-projeto/documentar")
      .send({ projeto: "nao-existe" });
    expect(inexistente.status).toBe(404);

    const travessia = await request(app)
      .post("/api/acoes-projeto/documentar")
      .send({ projeto: "../alfa" });
    expect(travessia.status).toBe(404);
  });

  it("estratégia inválida → 400", async () => {
    const app = await appComRunner(true);
    const resp = await request(app)
      .post("/api/acoes-projeto/documentar")
      .send({ projeto: "alfa", estrategia: "gpt" });
    expect(resp.status).toBe(400);
  });

  it("sem runner claude registrado → 503", async () => {
    const app = await appComRunner(false);
    const resp = await request(app)
      .post("/api/acoes-projeto/documentar")
      .send({ projeto: "alfa", estrategia: "haiku" });
    expect(resp.status).toBe(503);
    expect(resp.body.erro).toMatch(/runner Claude/i);
  });
});
