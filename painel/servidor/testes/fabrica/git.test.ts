import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ErroCommit,
  commitar,
  lerAlteracoes,
  lerDetalheCommit,
  lerHistorico,
} from "../../src/fabrica/git.js";

/**
 * Resumão de commit e commit pelo painel (T-029).
 *
 * `commitar` é a ÚNICA escrita do módulo git — testada contra repositórios de verdade em
 * pasta temporária, porque o que interessa aqui é o comportamento do git, não o de um
 * dublê.
 */

/** Repositório de verdade, com identidade local (não depende do git config da máquina). */
function repoTemp(): string {
  const dir = mkdtempSync(join(tmpdir(), "git-t-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Teste"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "teste@exemplo.com"], { cwd: dir });
  return dir;
}

function commitarNoRepo(dir: string, mensagem: string): string {
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", mensagem], { cwd: dir });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
}

describe("lerDetalheCommit", () => {
  it("conta arquivos e linhas somadas/removidas", async () => {
    const dir = repoTemp();
    try {
      writeFileSync(join(dir, "a.txt"), "1\n2\n3\n");
      commitarNoRepo(dir, "primeiro");

      writeFileSync(join(dir, "a.txt"), "1\n2\n9\n9\n"); // -1 +2
      writeFileSync(join(dir, "b.txt"), "novo\n"); // +1
      const hash = commitarNoRepo(dir, "segundo");

      const d = await lerDetalheCommit(dir, hash);
      expect(d).not.toBeNull();
      expect(d?.arquivos.map((a) => a.caminho).sort()).toEqual(["a.txt", "b.txt"]);
      expect(d?.adicoes).toBe(3);
      expect(d?.remocoes).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("separa o corpo da mensagem do assunto", async () => {
    const dir = repoTemp();
    try {
      writeFileSync(join(dir, "a.txt"), "x\n");
      const hash = commitarNoRepo(dir, "assunto aqui\n\ncorpo explicando o porquê");

      const d = await lerDetalheCommit(dir, hash);
      expect(d?.corpo).toBe("corpo explicando o porquê");
      // O assunto NÃO deve vazar para o corpo.
      expect(d?.corpo).not.toContain("assunto aqui");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("marca arquivo binário em vez de contar linhas", async () => {
    const dir = repoTemp();
    try {
      writeFileSync(join(dir, "bin.dat"), Buffer.from([0, 1, 2, 0, 255, 0]));
      const hash = commitarNoRepo(dir, "binário");

      const d = await lerDetalheCommit(dir, hash);
      expect(d?.arquivos[0]?.binario).toBe(true);
      expect(d?.adicoes).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("recusa hash que não é hexadecimal (não deixa virar flag do git)", async () => {
    const dir = repoTemp();
    try {
      expect(await lerDetalheCommit(dir, "--upload-pack=rm")).toBeNull();
      expect(await lerDetalheCommit(dir, "HEAD")).toBeNull();
      expect(await lerDetalheCommit(dir, "..")).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("devolve null para commit inexistente", async () => {
    const dir = repoTemp();
    try {
      expect(await lerDetalheCommit(dir, "0".repeat(40))).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("lerAlteracoes", () => {
  it("lista pendências com situação legível e ignora pasta sem git", async () => {
    const dir = repoTemp();
    try {
      writeFileSync(join(dir, "a.txt"), "1\n");
      commitarNoRepo(dir, "base");

      writeFileSync(join(dir, "a.txt"), "1\n2\n");
      writeFileSync(join(dir, "novo.txt"), "x\n");

      const alt = await lerAlteracoes(dir);
      const porCaminho = new Map(alt.map((a) => [a.caminho, a.situacao]));
      expect(porCaminho.get("a.txt")).toBe("modificado");
      expect(porCaminho.get("novo.txt")).toBe("novo");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("devolve lista vazia em pasta que não é repositório", async () => {
    const dir = mkdtempSync(join(tmpdir(), "git-nao-"));
    try {
      expect(await lerAlteracoes(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("commitar", () => {
  it("commita tudo e devolve o hash novo", async () => {
    const dir = repoTemp();
    try {
      writeFileSync(join(dir, "a.txt"), "1\n");
      commitarNoRepo(dir, "base");

      mkdirSync(join(dir, "sub"), { recursive: true });
      writeFileSync(join(dir, "sub", "b.txt"), "novo\n");
      writeFileSync(join(dir, "a.txt"), "1\n2\n");

      const hash = await commitar(dir, "feito pelo painel");
      expect(hash).toMatch(/^[0-9a-f]{40}$/);
      expect(await lerAlteracoes(dir)).toEqual([]);

      const historico = await lerHistorico(dir);
      expect(historico.commits[0]?.assunto).toBe("feito pelo painel");
      expect(historico.commits[0]?.hash).toBe(hash);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("aceita mensagem com aspas, ponto-e-vírgula e quebra de linha, literalmente", async () => {
    const dir = repoTemp();
    try {
      writeFileSync(join(dir, "a.txt"), "1\n");
      // Se algo passasse por shell, o `;` viraria separador de comando.
      const hash = await commitar(dir, 'corrige "aspas"; e & cia\n\ncorpo do commit');

      const d = await lerDetalheCommit(dir, hash);
      expect(d?.corpo).toBe("corpo do commit");
      const historico = await lerHistorico(dir);
      expect(historico.commits[0]?.assunto).toBe('corrige "aspas"; e & cia');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("recusa mensagem vazia ou só espaços", async () => {
    const dir = repoTemp();
    try {
      writeFileSync(join(dir, "a.txt"), "1\n");
      await expect(commitar(dir, "   \n ")).rejects.toBeInstanceOf(ErroCommit);
      // Nada foi commitado.
      expect((await lerAlteracoes(dir)).length).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("recusa quando não há nada para commitar", async () => {
    const dir = repoTemp();
    try {
      writeFileSync(join(dir, "a.txt"), "1\n");
      commitarNoRepo(dir, "base");

      await expect(commitar(dir, "nada mudou")).rejects.toThrow(/nenhuma|não há/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("recusa pasta que não é repositório", async () => {
    const dir = mkdtempSync(join(tmpdir(), "git-nao-"));
    try {
      writeFileSync(join(dir, "a.txt"), "1\n");
      await expect(commitar(dir, "oi")).rejects.toThrow(/repositório git/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
