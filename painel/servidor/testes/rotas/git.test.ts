import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Rotas de git (T-028/T-029), contra uma fábrica falsa com repositório DE VERDADE.
 *
 * O que se prova aqui e não dá para provar na unidade: o 404 de projeto inexistente, a
 * amarração do corpo JSON no POST e o mapeamento erro→status (400 sem mensagem, 409 sem
 * nada a commitar). `POST /commit` é a ÚNICA escrita do painel no git — merece rota
 * testada, não só a função.
 */

// A fábrica falsa precisa existir ANTES do config.ts carregar (ele lê FABRICA_RAIZ na
// carga do módulo) — daí o setup no topo e o import dinâmico do app.
const FABRICA = mkdtempSync(join(tmpdir(), "fab-git-"));
const PROJETO = join(FABRICA, "projetos", "demo");
mkdirSync(PROJETO, { recursive: true });
execFileSync("git", ["init", "-q", "-b", "main"], { cwd: PROJETO });
execFileSync("git", ["config", "user.name", "Teste"], { cwd: PROJETO });
execFileSync("git", ["config", "user.email", "teste@exemplo.com"], { cwd: PROJETO });
writeFileSync(join(PROJETO, "a.txt"), "1\n2\n");
execFileSync("git", ["add", "-A"], { cwd: PROJETO });
execFileSync("git", ["commit", "-q", "-m", "base do projeto"], { cwd: PROJETO });
const HASH = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: PROJETO,
  encoding: "utf8",
}).trim();

process.env.FABRICA_RAIZ = FABRICA;
const { criarApp } = await import("../../src/app.js");
const app = await criarApp();

afterAll(() => {
  rmSync(FABRICA, { recursive: true, force: true });
});

describe("GET /api/git/:projeto/commit/:hash", () => {
  it("devolve arquivos e linhas do commit", async () => {
    const r = await request(app).get(`/api/git/demo/commit/${HASH}`);

    expect(r.status).toBe(200);
    expect(r.body.arquivos).toHaveLength(1);
    expect(r.body.arquivos[0].caminho).toBe("a.txt");
    expect(r.body.adicoes).toBe(2);
    expect(r.body.remocoes).toBe(0);
  });

  it("responde 404 para hash inexistente e para hash malformado", async () => {
    expect((await request(app).get(`/api/git/demo/commit/${"0".repeat(40)}`)).status).toBe(404);
    // Não-hexadecimal é barrado antes do git: não pode virar flag (`--upload-pack=...`).
    expect((await request(app).get("/api/git/demo/commit/HEAD")).status).toBe(404);
  });

  it("responde 404 para projeto inexistente", async () => {
    const r = await request(app).get(`/api/git/nao-existe/commit/${HASH}`);
    expect(r.status).toBe(404);
  });
});

describe("GET /api/git/:projeto/alteracoes", () => {
  it("lista o que está pendente de commit", async () => {
    writeFileSync(join(PROJETO, "pendente.txt"), "x\n");
    try {
      const r = await request(app).get("/api/git/demo/alteracoes");

      expect(r.status).toBe(200);
      const caminhos = (r.body.alteracoes as { caminho: string }[]).map((a) => a.caminho);
      expect(caminhos).toContain("pendente.txt");
    } finally {
      rmSync(join(PROJETO, "pendente.txt"), { force: true });
    }
  });

  it("responde 404 para projeto inexistente", async () => {
    expect((await request(app).get("/api/git/nao-existe/alteracoes")).status).toBe(404);
  });
});

describe("POST /api/git/:projeto/commit", () => {
  it("recusa sem mensagem (400) e sem nada a commitar (409)", async () => {
    const semMensagem = await request(app).post("/api/git/demo/commit").send({});
    expect(semMensagem.status).toBe(400);

    // Árvore limpa: não há o que commitar.
    const semNada = await request(app)
      .post("/api/git/demo/commit")
      .send({ mensagem: "nada mudou" });
    expect(semNada.status).toBe(409);
  });

  it("commita as pendências e devolve o hash", async () => {
    writeFileSync(join(PROJETO, "b.txt"), "novo\n");

    const r = await request(app)
      .post("/api/git/demo/commit")
      .send({ mensagem: "pelo painel" });

    expect(r.status).toBe(200);
    expect(r.body.hash).toMatch(/^[0-9a-f]{40}$/);
    expect(r.body.curto).toBe((r.body.hash as string).slice(0, 7));

    // A árvore ficou limpa e o commit aparece no histórico.
    const alteracoes = await request(app).get("/api/git/demo/alteracoes");
    expect(alteracoes.body.alteracoes).toEqual([]);

    const historico = await request(app).get("/api/git/demo");
    expect(historico.body.commits[0].assunto).toBe("pelo painel");
  });

  it("responde 404 para projeto inexistente", async () => {
    const r = await request(app).post("/api/git/nao-existe/commit").send({ mensagem: "x" });
    expect(r.status).toBe(404);
  });
});
