import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agentesValidos, lerEquipe } from "../../src/fabrica/equipe.js";

function fabricaComEquipe(conteudo: string | null, projeto = "p1"): string {
  const raiz = mkdtempSync(join(tmpdir(), "equipe-"));
  const gestao = join(raiz, "projetos", projeto, "_gestao");
  mkdirSync(gestao, { recursive: true });
  if (conteudo !== null) writeFileSync(join(gestao, "equipe.json"), conteudo, "utf8");
  return raiz;
}

describe("lerEquipe — leitor da equipe do projeto", () => {
  it("sem equipe.json → equipe vazia, sem erro (é normal)", async () => {
    const eq = await lerEquipe(fabricaComEquipe(null), "p1");
    expect(eq.agentes).toEqual([]);
    expect(eq.erros).toEqual([]);
  });

  it("lê agentes válidos e preserva ferramentas", async () => {
    const raiz = fabricaComEquipe(
      JSON.stringify({
        agentes: [
          { id: "frontend", nome: "Front", descricao: "UI", prompt: "faça UI", ferramentas: ["Read", "Edit"] },
          { id: "api", prompt: "faça API" },
        ],
      }),
    );
    const eq = await lerEquipe(raiz, "p1");
    expect(eq.agentes.map((a) => a.id)).toEqual(["frontend", "api"]);
    expect(eq.agentes[0]?.ferramentas).toEqual(["Read", "Edit"]);
    expect(eq.agentes[1]?.nome).toBe("api"); // nome ausente cai no id
    expect(eq.agentes[1]?.ferramentas).toBeNull();
    expect(agentesValidos(eq)).toHaveLength(2);
  });

  it("JSON malformado → erro no arquivo, não lança", async () => {
    const eq = await lerEquipe(fabricaComEquipe("{ isso não é json"), "p1");
    expect(eq.agentes).toEqual([]);
    expect(eq.erros.length).toBeGreaterThan(0);
  });

  it("agente sem prompt ou id inválido fica fora dos válidos, com erro", async () => {
    const raiz = fabricaComEquipe(
      JSON.stringify({
        agentes: [{ id: "sem-prompt" }, { id: "ID_MAIUSCULO", prompt: "x" }, { id: "ok", prompt: "vai" }],
      }),
    );
    const eq = await lerEquipe(raiz, "p1");
    expect(agentesValidos(eq).map((a) => a.id)).toEqual(["ok"]);
    expect(eq.agentes.find((a) => a.id === "sem-prompt")?.erros.length).toBeGreaterThan(0);
  });

  it("id duplicado é sinalizado (segundo fica inválido)", async () => {
    const raiz = fabricaComEquipe(
      JSON.stringify({ agentes: [{ id: "dup", prompt: "a" }, { id: "dup", prompt: "b" }] }),
    );
    expect(agentesValidos(await lerEquipe(raiz, "p1"))).toHaveLength(1);
  });
});
