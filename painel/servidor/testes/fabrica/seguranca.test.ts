import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { varrerRepo } from "../../src/fabrica/seguranca.js";
import { ErroBloqueioSeguranca, publicar } from "../../src/fabrica/publicacao.js";

/**
 * Conferência de segurança pré-publicação (T-031).
 *
 * O que estes testes protegem: que a varredura veja as DUAS frentes — o que já está
 * versionado e o que `git add -A` varreria no próximo commit — e que ela não seja tão
 * barulhenta a ponto de ninguém olhar (placeholder de `.env.example` não é achado).
 */

function repoTemp(): string {
  const dir = mkdtempSync(join(tmpdir(), "seg-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Teste"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "teste@exemplo.com"], { cwd: dir });
  return dir;
}

function versionar(dir: string): void {
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "commit"], { cwd: dir });
}

describe("varrerRepo", () => {
  it("acha .env JÁ VERSIONADO e marca como o caso mais grave", async () => {
    const dir = repoTemp();
    try {
      writeFileSync(join(dir, ".env"), "TOKEN=abc\n");
      versionar(dir);

      const r = await varrerRepo(dir);
      const env = r.achados.find((a) => a.caminho === ".env");
      expect(env?.nivel).toBe("alto");
      expect(env?.versionado).toBe(true);
      expect(r.bloqueia).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("acha .env AINDA NÃO versionado — é o que `git add -A` varreria", async () => {
    const dir = repoTemp();
    try {
      writeFileSync(join(dir, "leia.md"), "ok\n");
      versionar(dir);
      writeFileSync(join(dir, ".env"), "TOKEN=abc\n"); // não commitado

      const r = await varrerRepo(dir);
      const env = r.achados.find((a) => a.caminho === ".env");
      expect(env?.nivel).toBe("alto");
      expect(env?.versionado).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("NÃO acusa .env.example nem valor que é claramente placeholder", async () => {
    const dir = repoTemp();
    try {
      writeFileSync(
        join(dir, ".env.example"),
        "FAL_KEY=sua_chave_fal_ai\nGROQ=sua_chave_groq\nAPI_KEY=<coloque_aqui>\n",
      );
      versionar(dir);

      const r = await varrerRepo(dir);
      expect(r.achados.filter((a) => a.caminho === ".env.example")).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("acha chave de provedor dentro de arquivo comum, com a linha", async () => {
    const dir = repoTemp();
    try {
      writeFileSync(
        join(dir, "config.py"),
        ["import os", "", 'CLIENTE = "sk-ant-api03-" + "x".rjust(30, "y")', ""].join("\n"),
      );
      // Chave realista, montada aqui para não deixar padrão real no repositório.
      writeFileSync(join(dir, "app.js"), `const k = "sk-ant-${"a1b2c3d4".repeat(4)}";\n`);
      versionar(dir);

      const r = await varrerRepo(dir);
      const achado = r.achados.find((a) => a.caminho === "app.js");
      expect(achado?.nivel).toBe("alto");
      expect(achado?.detalhe).toMatch(/Anthropic/i);
      expect(achado?.linha).toBe(1);
      // O relatório NUNCA repete o segredo — só onde ele está.
      expect(JSON.stringify(r)).not.toContain("a1b2c3d4a1b2c3d4");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("avisa (sem bloquear) quando não há .gitignore", async () => {
    const dir = repoTemp();
    try {
      writeFileSync(join(dir, "leia.md"), "só texto\n");
      versionar(dir);

      const r = await varrerRepo(dir);
      const aviso = r.achados.find((a) => a.tipo === "sem-gitignore");
      expect(aviso?.nivel).toBe("medio");
      expect(r.temGitignore).toBe(false);
      expect(r.bloqueia).toBe(false); // aviso não impede publicar
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("repositório limpo com .gitignore não gera achado nenhum", async () => {
    const dir = repoTemp();
    try {
      writeFileSync(join(dir, ".gitignore"), ".env\nnode_modules/\n");
      writeFileSync(join(dir, "leia.md"), "documentação\n");
      writeFileSync(join(dir, "codigo.ts"), 'export const oi = "mundo";\n');
      versionar(dir);

      const r = await varrerRepo(dir);
      expect(r.achados).toEqual([]);
      expect(r.bloqueia).toBe(false);
      expect(r.arquivosVarridos).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("ignora pasta que não é repositório", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nao-"));
    try {
      writeFileSync(join(dir, ".env"), "TOKEN=abc\n");
      const r = await varrerRepo(dir);
      expect(r.achados).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("publicar com a guarda de segurança", () => {
  it("BARRA o push quando há achado alto e publica quando o usuário decide ignorar", async () => {
    const dir = repoTemp();
    const bare = mkdtempSync(join(tmpdir(), "bare-seg-"));
    execFileSync("git", ["init", "-q", "--bare", "-b", "main"], { cwd: bare });
    try {
      writeFileSync(join(dir, ".env"), "TOKEN=abc\n");
      versionar(dir);
      execFileSync("git", ["remote", "add", "origin", bare], { cwd: dir });

      // Sem opção nenhuma: a guarda impede, e diz por quê.
      await expect(publicar(dir)).rejects.toBeInstanceOf(ErroBloqueioSeguranca);

      // A decisão explícita do usuário passa — é o repositório dele.
      const r = await publicar(dir, { ignorarAvisos: true });
      expect(r.publicados).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(bare, { recursive: true, force: true });
    }
  }, 40_000);
});
