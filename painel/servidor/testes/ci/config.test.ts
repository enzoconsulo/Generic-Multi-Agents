import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ErroConfigCiInvalida,
  deduzirDefaults,
  lerOuCriarConfig,
  salvarConfig,
  validarConfig,
} from "../../src/ci/config.js";
import { detectarEcossistema } from "../../src/ci/ecossistemas.js";

/** Projeto temporário com os arquivos-marcador que se quiser. */
function projetoTemp(
  arquivos: Record<string, string> = {},
  opcoes: { comGestao?: boolean } = {},
): string {
  const dir = mkdtempSync(join(tmpdir(), "ci-cfg-"));
  if (opcoes.comGestao !== false) mkdirSync(join(dir, "_gestao"), { recursive: true });
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    writeFileSync(join(dir, nome), conteudo, "utf8");
  }
  return dir;
}

describe("detectarEcossistema", () => {
  it("reconhece cada ecossistema pelo arquivo-marcador", () => {
    const casos: [string, string][] = [
      ["package.json", "node"],
      ["pyproject.toml", "python"],
      ["requirements.txt", "python"],
      ["go.mod", "go"],
      ["Cargo.toml", "rust"],
      ["pom.xml", "maven"],
      ["build.gradle", "gradle"],
    ];
    for (const [marcador, esperado] of casos) {
      const dir = projetoTemp({ [marcador]: "{}" });
      expect(detectarEcossistema(dir)?.id, `marcador ${marcador}`).toBe(esperado);
    }
  });

  it("reconhece .NET por EXTENSÃO (o nome do .csproj varia por projeto)", () => {
    expect(detectarEcossistema(projetoTemp({ "MinhaApi.csproj": "<Project/>" }))?.id).toBe("dotnet");
    expect(detectarEcossistema(projetoTemp({ "Solucao.sln": "" }))?.id).toBe("dotnet");
  });

  it("projeto sem marcador nenhum → null (não é erro)", () => {
    expect(detectarEcossistema(projetoTemp({ "LEIAME.md": "# oi" }))).toBeNull();
  });
});

describe("deduzirDefaults por ecossistema", () => {
  it("Python: testes ligados com pytest; lint preenchido porém DESLIGADO (ruff pode não existir)", async () => {
    const cfg = await deduzirDefaults(projetoTemp({ "pyproject.toml": "" }));
    expect(cfg.ecossistema).toBe("python");
    expect(cfg.estagios.testes).toEqual({ comando: "pytest", habilitado: true });
    expect(cfg.estagios.lint.comando).toBe("ruff check .");
    expect(cfg.estagios.lint.habilitado).toBe(false);
  });

  it("Go: usa a toolchain da linguagem e liga testes+build", async () => {
    const cfg = await deduzirDefaults(projetoTemp({ "go.mod": "module x" }));
    expect(cfg.ecossistema).toBe("go");
    expect(cfg.estagios.testes).toEqual({ comando: "go test ./...", habilitado: true });
    expect(cfg.estagios.build.habilitado).toBe(true);
  });

  it("Rust: cargo test/build ligados, clippy desligado", async () => {
    const cfg = await deduzirDefaults(projetoTemp({ "Cargo.toml": "" }));
    expect(cfg.ecossistema).toBe("rust");
    expect(cfg.estagios.testes.comando).toBe("cargo test");
    expect(cfg.estagios.lint.habilitado).toBe(false);
  });

  it("Node: detecção FINA por script (npm run <x> falha se o script não existe)", async () => {
    const dir = projetoTemp({
      "package.json": JSON.stringify({ scripts: { test: "vitest run", build: "vite build" } }),
    });
    const cfg = await deduzirDefaults(dir);
    expect(cfg.ecossistema).toBe("node");
    expect(cfg.estagios.instalar).toEqual({ comando: "npm install", habilitado: true });
    expect(cfg.estagios.testes.habilitado).toBe(true);
    expect(cfg.estagios.build.habilitado).toBe(true);
    expect(cfg.estagios.lint.habilitado).toBe(false); // sem script "lint"
  });

  it("Node sem scripts: só instalar fica ligado", async () => {
    const cfg = await deduzirDefaults(projetoTemp({ "package.json": "{}" }));
    expect(cfg.estagios.instalar.habilitado).toBe(true);
    expect(cfg.estagios.testes.habilitado).toBe(false);
  });

  it("ecossistema desconhecido: config vazia e editável, SEM erro", async () => {
    const cfg = await deduzirDefaults(projetoTemp({ "LEIAME.md": "" }));
    expect(cfg.ecossistema).toBeNull();
    for (const e of Object.values(cfg.estagios)) expect(e.habilitado).toBe(false);
    expect(cfg.timeoutMs).toBeGreaterThan(0);
  });
});

describe("lerOuCriarConfig", () => {
  it("sem ci.json: deduz, GRAVA _gestao/ci.json e devolve", async () => {
    const dir = projetoTemp({ "go.mod": "module x" });
    const cfg = await lerOuCriarConfig(dir);
    expect(cfg.ecossistema).toBe("go");
    expect(JSON.parse(readFileSync(join(dir, "_gestao", "ci.json"), "utf8"))).toEqual(cfg);
  });

  // Regressão: projeto sob projetos/ sem a pasta `_gestao/` (pasta clonada à mão, nunca
  // passou pelo /novo-projeto nem pela importação) estourava ENOENT → 500 na rota.
  it("projeto SEM a pasta _gestao/: cria a pasta em vez de estourar ENOENT", async () => {
    const dir = projetoTemp({ "package.json": '{"scripts":{"test":"x"}}' }, { comGestao: false });
    expect(existsSync(join(dir, "_gestao"))).toBe(false);

    const cfg = await lerOuCriarConfig(dir);

    expect(cfg.estagios.testes.habilitado).toBe(true);
    expect(existsSync(join(dir, "_gestao", "ci.json"))).toBe(true);
  });

  it("projeto sem ecossistema reconhecido NÃO falha (antes era erro fatal)", async () => {
    const cfg = await lerOuCriarConfig(projetoTemp({ "LEIAME.md": "" }));
    expect(cfg.ecossistema).toBeNull();
  });

  it("com ci.json existente: lê do disco (não deduz de novo)", async () => {
    const dir = projetoTemp({ "package.json": '{"scripts":{"test":"x"}}' });
    const manual = {
      estagios: {
        instalar: { comando: "npm ci", habilitado: false },
        lint: { comando: null, habilitado: false },
        testes: { comando: "node teste.js", habilitado: true },
        build: { comando: null, habilitado: false },
      },
      timeoutMs: 5000,
      ecossistema: "node",
    };
    writeFileSync(join(dir, "_gestao", "ci.json"), JSON.stringify(manual), "utf8");
    expect(await lerOuCriarConfig(dir)).toEqual(manual);
  });
});

describe("validarConfig / salvarConfig", () => {
  const valida = {
    estagios: {
      instalar: { comando: "pip install -r requirements.txt", habilitado: true },
      lint: { comando: null, habilitado: false },
      testes: { comando: "pytest", habilitado: true },
      build: { comando: null, habilitado: false },
    },
    timeoutMs: 60000,
    ecossistema: "python",
  };

  it("aceita uma config bem formada", () => {
    expect(validarConfig(valida)).toEqual(valida);
  });

  it("config antiga SEM o campo `ecossistema` continua válida (não invalidar o disco)", () => {
    const { ecossistema, ...semCampo } = valida;
    expect(validarConfig(semCampo).ecossistema).toBeNull();
  });

  it("rejeita estágio habilitado sem comando", () => {
    const ruim = {
      ...valida,
      estagios: { ...valida.estagios, lint: { comando: null, habilitado: true } },
    };
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
    const dir = projetoTemp();
    expect(await salvarConfig(dir, valida)).toEqual(valida);
    expect(JSON.parse(readFileSync(join(dir, "_gestao", "ci.json"), "utf8"))).toEqual(valida);
  });
});
