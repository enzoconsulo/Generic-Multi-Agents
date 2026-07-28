import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Rotas de publicação (T-030). Fábrica falsa com um projeto que É repositório e outro
 * que ainda NÃO é — os dois casos aparecem na lista.
 */

const FABRICA = mkdtempSync(join(tmpdir(), "fab-pub-"));
const PROJETO = join(FABRICA, "projetos", "demo");
mkdirSync(PROJETO, { recursive: true });
mkdirSync(join(FABRICA, "projetos", "sem-git"), { recursive: true });
execFileSync("git", ["init", "-q", "-b", "main"], { cwd: PROJETO });
execFileSync("git", ["config", "user.name", "Teste"], { cwd: PROJETO });
execFileSync("git", ["config", "user.email", "teste@exemplo.com"], { cwd: PROJETO });
writeFileSync(join(PROJETO, "a.txt"), "1\n");
execFileSync("git", ["add", "-A"], { cwd: PROJETO });
execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: PROJETO });

process.env.FABRICA_RAIZ = FABRICA;
const { criarApp } = await import("../../src/app.js");
const app = await criarApp();

afterAll(() => {
  rmSync(FABRICA, { recursive: true, force: true });
});

describe("GET /api/repos", () => {
  it("lista a fábrica e os projetos, marcando quem ainda não é repositório", async () => {
    const r = await request(app).get("/api/repos");

    expect(r.status).toBe(200);
    const ids = (r.body.repos as { id: string }[]).map((x) => x.id);
    expect(ids).toEqual(["_fabrica", "demo", "sem-git"]);

    const demo = (r.body.repos as { id: string; ehRepo: boolean; branch: string }[]).find(
      (x) => x.id === "demo",
    );
    expect(demo?.ehRepo).toBe(true);
    expect(demo?.branch).toBe("main");

    const semGit = (r.body.repos as { id: string; ehRepo: boolean }[]).find(
      (x) => x.id === "sem-git",
    );
    expect(semGit?.ehRepo).toBe(false);
  }, 30_000);
});

describe("PUT /api/repos/:id/remoto", () => {
  it("grava um endereço válido e recusa ext:: com 400", async () => {
    const ok = await request(app)
      .put("/api/repos/demo/remoto")
      .send({ url: "https://github.com/usuario/demo.git" });
    expect(ok.status).toBe(200);
    expect(ok.body.remoto).toBe("https://github.com/usuario/demo.git");

    const mau = await request(app)
      .put("/api/repos/demo/remoto")
      .send({ url: "ext::sh -c 'algo'" });
    expect(mau.status).toBe(400);
    expect(mau.body.erro).toMatch(/executar um comando/i);

    // O endereço bom continua lá: a recusa não pode ter apagado nada.
    const lista = await request(app).get("/api/repos");
    const demo = (lista.body.repos as { id: string; remoto: string | null }[]).find(
      (x) => x.id === "demo",
    );
    expect(demo?.remoto).toBe("https://github.com/usuario/demo.git");
  }, 30_000);

  it("recusa corpo sem url (400) e repositório inexistente (404)", async () => {
    expect((await request(app).put("/api/repos/demo/remoto").send({})).status).toBe(400);
    expect(
      (await request(app).put("/api/repos/nao-existe/remoto").send({ url: "https://a.com/b" }))
        .status,
    ).toBe(404);
  });
});

describe("POST /api/repos/:id/push", () => {
  it("recusa quando a pasta não é repositório e quando o repo não existe", async () => {
    const semGit = await request(app).post("/api/repos/sem-git/push");
    expect(semGit.status).toBe(409);
    expect(semGit.body.erro).toMatch(/repositório git/i);

    expect((await request(app).post("/api/repos/nao-existe/push")).status).toBe(404);
  });
});
