import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agentesParaAcao } from "../../src/acoes/agentes-dinamicos.js";

function fabricaComEquipe(agentes: unknown[], projeto = "app"): string {
  const raiz = mkdtempSync(join(tmpdir(), "agdin-"));
  const gestao = join(raiz, "projetos", projeto, "_gestao");
  mkdirSync(gestao, { recursive: true });
  writeFileSync(join(gestao, "equipe.json"), JSON.stringify({ agentes }), "utf8");
  return raiz;
}

describe("agentesParaAcao — injeção de especialistas só no /trabalhar <projeto>", () => {
  it("só injeta para a ação trabalhar", async () => {
    const raiz = fabricaComEquipe([{ id: "f", prompt: "p" }]);
    expect(await agentesParaAcao(raiz, "status", "app")).toBeUndefined();
    expect(await agentesParaAcao(raiz, "trabalhar", "app")).toBeDefined();
  });

  it("sem projeto no argumento → undefined", async () => {
    const raiz = fabricaComEquipe([{ id: "f", prompt: "p" }]);
    expect(await agentesParaAcao(raiz, "trabalhar", "")).toBeUndefined();
  });

  it("converte só os agentes válidos no formato options.agents do SDK", async () => {
    const raiz = fabricaComEquipe([
      { id: "frontend", descricao: "UI", prompt: "faça UI", ferramentas: ["Read"] },
      { id: "invalido" }, // sem prompt → descartado
    ]);
    const ag = await agentesParaAcao(raiz, "trabalhar", "app extra-ignorado");
    expect(ag).toBeDefined();
    expect(Object.keys(ag ?? {})).toEqual(["frontend"]);
    expect(ag?.["frontend"]?.description).toBe("UI");
    expect(ag?.["frontend"]?.prompt).toBe("faça UI");
    expect(ag?.["frontend"]?.tools).toEqual(["Read"]);
  });

  it("projeto sem nenhum agente válido → undefined", async () => {
    const raiz = fabricaComEquipe([{ id: "x" }]); // sem prompt
    expect(await agentesParaAcao(raiz, "trabalhar", "app")).toBeUndefined();
  });
});
