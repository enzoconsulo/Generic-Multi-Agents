import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ErroConfigCiInvalida,
  ErroSemPackageJson,
  deduzirDefaults,
  lerOuCriarConfig,
  salvarConfig,
  validarConfig,
} from "../../src/ci/config.js";

function projetoTemp(pkg?: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "ci-cfg-"));
  mkdirSync(join(dir, "_gestao"), { recursive: true });
  if (pkg !== undefined) writeFileSync(join(dir, "package.json"), JSON.stringify(pkg), "utf8");
  return dir;
}

describe("deduzirDefaults", () => {
  it("instalar sempre habilitado; demais só quando o script existe", () => {
    const cfg = deduzirDefaults({ scripts: { test: "vitest run", build: "vite build" } });
    expect(cfg.estagios.instalar).toEqual({ comando: "npm install", habilitado: true });
    expect(cfg.estagios.lint).toEqual({ comando: null, habilitado: false });
    expect(cfg.estagios.testes).toEqual({ comando: "npm test", habilitado: true });
    expect(cfg.estagios.build).toEqual({ comando: "npm run build", habilitado: true });
    expect(cfg.timeoutMs).toBeGreaterThan(0);
  });

  it("sem scripts nenhum: só instalar habilitado", () => {
    const cfg = deduzirDefaults({});
    expect(cfg.estagios.lint.habilitado).toBe(false);
    expect(cfg.estagios.testes.habilitado).toBe(false);
    expect(cfg.estagios.build.habilitado).toBe(false);
  });
});

describe("lerOuCriarConfig", () => {
  it("sem package.json → ErroSemPackageJson", async () => {
    const dir = projetoTemp();
    await expect(lerOuCriarConfig(dir, "semjson")).rejects.toThrow(ErroSemPackageJson);
  });

  it("com package.json e sem ci.json: deduz, GRAVA _gestao/ci.json e devolve", async () => {
    const dir = projetoTemp({ scripts: { test: "node t.js" } });
    const cfg = await lerOuCriarConfig(dir, "comjson");
    expect(cfg.estagios.testes.habilitado).toBe(true);
    expect(cfg.estagios.build.habilitado).toBe(false);
    expect(existsSync(join(dir, "_gestao", "ci.json"))).toBe(true);
    const noDisco = JSON.parse(readFileSync(join(dir, "_gestao", "ci.json"), "utf8"));
    expect(noDisco).toEqual(cfg);
  });

  it("com ci.json já existente: lê do disco (não deduz de novo)", async () => {
    const dir = projetoTemp({ scripts: { test: "node t.js" } });
    const manual = {
      estagios: {
        instalar: { comando: "npm install", habilitado: false },
        lint: { comando: null, habilitado: false },
        testes: { comando: "node t.js direto", habilitado: true },
        build: { comando: null, habilitado: false },
      },
      timeoutMs: 5000,
    };
    writeFileSync(join(dir, "_gestao", "ci.json"), JSON.stringify(manual), "utf8");
    const cfg = await lerOuCriarConfig(dir, "comci");
    expect(cfg).toEqual(manual);
  });
});

describe("validarConfig / salvarConfig", () => {
  const valida = {
    estagios: {
      instalar: { comando: "npm install", habilitado: true },
      lint: { comando: null, habilitado: false },
      testes: { comando: "npm test", habilitado: true },
      build: { comando: null, habilitado: false },
    },
    timeoutMs: 60000,
  };

  it("aceita uma config bem formada", () => {
    expect(validarConfig(valida)).toEqual(valida);
  });

  it("rejeita estágio habilitado sem comando", () => {
    const ruim = { ...valida, estagios: { ...valida.estagios, lint: { comando: null, habilitado: true } } };
    expect(() => validarConfig(ruim)).toThrow(ErroConfigCiInvalida);
  });

  it("rejeita timeoutMs inválido", () => {
    expect(() => validarConfig({ ...valida, timeoutMs: 0 })).toThrow(ErroConfigCiInvalida);
    expect(() => validarConfig({ ...valida, timeoutMs: "60000" })).toThrow(ErroConfigCiInvalida);
  });

  it("rejeita estágio ausente", () => {
    const { build, ...semBuild } = valida.estagios;
    expect(() => validarConfig({ ...valida, estagios: semBuild })).toThrow(ErroConfigCiInvalida);
  });

  it("salvarConfig grava no disco e devolve a config validada", async () => {
    const dir = projetoTemp({ scripts: {} });
    const salva = await salvarConfig(dir, valida);
    expect(salva).toEqual(valida);
    expect(JSON.parse(readFileSync(join(dir, "_gestao", "ci.json"), "utf8"))).toEqual(valida);
  });
});
