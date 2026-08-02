import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { temTrabalhoParcial } from "../../src/pipeline/trabalho-parcial.js";

/** Repositório de mentira com um commit inicial. */
function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "parcial-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "a.js"), "const a = 1;\n", "utf8");
  writeFileSync(join(dir, "src", "b.js"), "const b = 2;\n", "utf8");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, stdio: "ignore", windowsHide: true });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "T");
  git("add", "-A");
  git("commit", "-qm", "inicial");
  return dir;
}

/**
 * Este módulo existe porque uma rodada REAL expôs o erro da versão anterior do saneamento,
 * que perguntava "as Notas de execução estão vazias?". Quase toda tarefa retomada já tem
 * Notas antigas, então a resposta era quase sempre "não" e a tarefa ficava presa em
 * `em-execucao` mesmo sem trabalho nenhum na árvore.
 */
describe("temTrabalhoParcial", () => {
  it("árvore limpa nas areas → false", async () => {
    expect(await temTrabalhoParcial(repo(), ["src/a.js"])).toBe(false);
  });

  it("arquivo modificado numa area → true", async () => {
    const dir = repo();
    writeFileSync(join(dir, "src", "a.js"), "const a = 99;\n", "utf8");
    expect(await temTrabalhoParcial(dir, ["src/a.js"])).toBe(true);
  });

  it("arquivo NOVO numa area → true (o construtor cria arquivo)", async () => {
    const dir = repo();
    writeFileSync(join(dir, "src", "novo.js"), "novo\n", "utf8");
    expect(await temTrabalhoParcial(dir, ["src/novo.js"])).toBe(true);
  });

  // O ponto do módulo: só olha o que a tarefa DECLAROU tocar. Sujeira alheia não pode
  // segurar uma tarefa que não fez nada.
  it("mudança FORA das areas não conta", async () => {
    const dir = repo();
    writeFileSync(join(dir, "src", "b.js"), "const b = 99;\n", "utf8");
    expect(await temTrabalhoParcial(dir, ["src/a.js"])).toBe(false);
  });

  // Falha para o lado seguro: preservar em dúvida é melhor que descartar em dúvida.
  it("sem areas declaradas, assume que há trabalho", async () => {
    expect(await temTrabalhoParcial(repo(), [])).toBe(true);
  });

  it("pasta que não é repositório assume que há trabalho", async () => {
    expect(await temTrabalhoParcial(mkdtempSync(join(tmpdir(), "sem-git-")), ["src/a.js"])).toBe(
      true,
    );
  });

  // `areas` vem de um modelo: caminho com travessia não pode virar argumento do git.
  it("areas com travessia são descartadas antes de chegar ao git", async () => {
    expect(await temTrabalhoParcial(repo(), ["../../fora.js"])).toBe(true);
  });
});
