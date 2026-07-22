import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ErroImportacao,
  executarImportacao,
  normalizarNome,
  validarImportacao,
} from "../../src/projetos/importar.js";
import { RunnerImportar } from "../../src/projetos/runner-importar.js";
import { obterGerenciador, reiniciarGerenciador } from "../../src/jobs/instancia.js";
import type { ContextoExecucao, Job, Runner } from "../../src/jobs/tipos.js";

const ctxFake: ContextoExecucao = {
  emitir: () => {},
  sinal: new AbortController().signal,
  pedirInput: async () => ({}),
};

/** Fábrica falsa com projetos/ e templates mínimos. */
function fabricaTemp(): string {
  const raiz = mkdtempSync(join(tmpdir(), "imp-fab-"));
  mkdirSync(join(raiz, "projetos"), { recursive: true });
  const tpl = join(raiz, "_sistema", "templates");
  mkdirSync(tpl, { recursive: true });
  writeFileSync(join(tpl, "CLAUDE-projeto.md"), "# <nome do projeto>\n\n<descrição>\n");
  writeFileSync(join(tpl, "DECISOES.md"), "# Decisões — <nome do projeto>\n");
  writeFileSync(join(tpl, "PROGRESSO.md"), "# Progresso — <nome do projeto>\n");
  return raiz;
}

/** Pasta de origem com código; opcionalmente com .git, node_modules e _gestao custom. */
function origemTemp(opcoes: { git?: boolean; nodeModules?: boolean; gestaoCustom?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "imp-src-"));
  writeFileSync(join(dir, "index.js"), "console.log(1)\n");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "app.js"), "export const x = 1\n");
  if (opcoes.nodeModules) {
    mkdirSync(join(dir, "node_modules", "lixo"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "lixo", "index.js"), "// pesado\n");
  }
  if (opcoes.gestaoCustom) {
    mkdirSync(join(dir, "_gestao"), { recursive: true });
    writeFileSync(join(dir, "_gestao", "DECISOES.md"), "DECISOES EXISTENTES DO USUÁRIO\n");
  }
  if (opcoes.git) {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync(
      "git",
      ["-c", "user.name=T", "-c", "user.email=t@t", "commit", "-q", "-m", "commit-de-origem"],
      { cwd: dir },
    );
  }
  return dir;
}

describe("normalizarNome", () => {
  it("gera kebab-case sem acentos, espaços ou símbolos", () => {
    expect(normalizarNome("Ação Legal!")).toBe("acao-legal");
    expect(normalizarNome("Meu   App 2")).toBe("meu-app-2");
    expect(normalizarNome("--já--existe--")).toBe("ja-existe");
    expect(normalizarNome("São Paulo/Núcleo")).toBe("sao-paulo-nucleo");
  });
});

describe("validarImportacao", () => {
  it("caminho relativo, inexistente, raiz da fábrica e dentro de projetos/ → 400", () => {
    const raiz = fabricaTemp();
    expect(() => validarImportacao("./rel", undefined, raiz)).toThrow(ErroImportacao);
    expect(() => validarImportacao(join(raiz, "nao-existe"), undefined, raiz)).toThrow(ErroImportacao);
    expect(() => validarImportacao(raiz, undefined, raiz)).toThrow(ErroImportacao);
    const dentro = join(raiz, "projetos", "algo");
    mkdirSync(dentro, { recursive: true });
    expect(() => validarImportacao(dentro, undefined, raiz)).toThrow(ErroImportacao);
  });

  it("nome já usado → 409", () => {
    const raiz = fabricaTemp();
    const origem = origemTemp();
    mkdirSync(join(raiz, "projetos", "ocupado"), { recursive: true });
    try {
      validarImportacao(origem, "ocupado", raiz);
      expect.unreachable("deveria lançar");
    } catch (e) {
      expect(e).toBeInstanceOf(ErroImportacao);
      expect((e as ErroImportacao).status).toBe(409);
    }
  });

  it("origem válida devolve origem/nome/destino resolvidos (nome derivado normalizado)", () => {
    const raiz = fabricaTemp();
    const origem = origemTemp();
    const v = validarImportacao(origem, "Meu App", raiz);
    expect(v.nome).toBe("meu-app");
    expect(v.destino).toBe(join(raiz, "projetos", "meu-app"));
    expect(v.origem).toBe(origem);
  });
});

describe("executarImportacao", () => {
  it("copia sem node_modules, faz git init + commit e cria _gestao mínimo", async () => {
    const raiz = fabricaTemp();
    const origem = origemTemp({ nodeModules: true });
    const destino = join(raiz, "projetos", "app");

    await executarImportacao(origem, destino, raiz, "app", ctxFake);

    expect(existsSync(join(destino, "index.js"))).toBe(true);
    expect(existsSync(join(destino, "src", "app.js"))).toBe(true);
    expect(existsSync(join(destino, "node_modules"))).toBe(false); // node_modules ignorado
    // _gestao mínimo
    expect(existsSync(join(destino, "_gestao", "tarefas"))).toBe(true);
    expect(existsSync(join(destino, "_gestao", "pesquisas"))).toBe(true);
    expect(readFileSync(join(destino, "_gestao", "DECISOES.md"), "utf8")).toContain("app");
    expect(readFileSync(join(destino, "_gestao", "PROGRESSO.md"), "utf8")).toContain("importado");
    expect(readFileSync(join(destino, "CLAUDE.md"), "utf8")).toContain("app");
    // git inicializado com o commit do painel
    expect(existsSync(join(destino, ".git"))).toBe(true);
    const log = execFileSync("git", ["log", "--oneline"], { cwd: destino }).toString();
    expect(log).toContain("importado pelo painel-fabrica");
  });

  it("preserva o .git da origem quando existe (sem novo commit do painel)", async () => {
    const raiz = fabricaTemp();
    const origem = origemTemp({ git: true });
    const destino = join(raiz, "projetos", "comgit");

    await executarImportacao(origem, destino, raiz, "comgit", ctxFake);

    expect(existsSync(join(destino, ".git"))).toBe(true);
    const log = execFileSync("git", ["log", "--oneline"], { cwd: destino }).toString();
    expect(log).toContain("commit-de-origem"); // história preservada
    expect(log).not.toContain("importado pelo painel-fabrica");
  });

  it("não sobrescreve arquivos de _gestao que já vieram na origem", async () => {
    const raiz = fabricaTemp();
    const origem = origemTemp({ gestaoCustom: true });
    const destino = join(raiz, "projetos", "custom");

    await executarImportacao(origem, destino, raiz, "custom", ctxFake);

    expect(readFileSync(join(destino, "_gestao", "DECISOES.md"), "utf8")).toBe(
      "DECISOES EXISTENTES DO USUÁRIO\n",
    );
    // PROGRESSO.md não existia → foi criado do template
    expect(existsSync(join(destino, "_gestao", "PROGRESSO.md"))).toBe(true);
  });
});

describe("RunnerImportar enfileira a análise", () => {
  it("após copiar, cria um job de análise do projeto importado", async () => {
    const raiz = fabricaTemp();
    const origem = origemTemp();
    reiniciarGerenciador({ dirJobs: mkdtempSync(join(tmpdir(), "imp-jobs-")), tetoClaude: 2 });
    const runnerClaudeFake: Runner = { async executar() { return { ok: true }; } };
    obterGerenciador().registrarRunner("claude", runnerClaudeFake);

    const job: Job = {
      id: "imp1",
      tipo: "importar",
      titulo: "Importar app2",
      escopo: "projeto:app2",
      usaClaude: false,
      params: { origem, nome: "app2", fabricaRaiz: raiz, modeloAnalise: "haiku" },
      estado: "executando",
      criadoEm: new Date().toISOString(),
    };
    await new RunnerImportar().executar(job, ctxFake);

    const jobsAnalise = obterGerenciador()
      .listar()
      .filter((j) => j.tipo === "claude" && j.titulo.includes("app2"));
    expect(jobsAnalise.length).toBe(1);
    expect(jobsAnalise[0]?.escopo).toBe("projeto:app2");
  });
});
