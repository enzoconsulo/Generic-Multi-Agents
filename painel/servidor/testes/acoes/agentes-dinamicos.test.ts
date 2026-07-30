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

describe("agentesParaAcao — injeção da equipe do projeto no /trabalhar", () => {
  it("só injeta para a ação trabalhar", async () => {
    const raiz = fabricaComEquipe([{ id: "f", prompt: "p" }]);
    expect(await agentesParaAcao(raiz, "status", "app")).toBeUndefined();
    expect(await agentesParaAcao(raiz, "trabalhar", "app")).toBeDefined();
  });

  /**
   * CONTRATO INVERTIDO em T-045, com evidência de execução real.
   *
   * Antes: sem projeto no argumento → `undefined`. Mas esse é o disparo PADRÃO do painel
   * (o botão manda `{}` = todos os projetos), e num `/trabalhar` real de 2026-07-30 o fluxo
   * leu `equipe.json` do disco, viu os especialistas lá e despachou `streamlit-ui` e
   * `ia-integracao` — o SDK recusou os dois com "not found", porque nada tinha sido
   * injetado. O painel anunciava equipe que ele mesmo não injetou: queimou turnos em
   * despachos condenados e caiu no `executor` genérico, ignorando a equipe em silêncio.
   *
   * Agora sem projeto injeta a equipe de TODOS os projetos.
   */
  it("sem projeto no argumento injeta a equipe de todos os projetos", async () => {
    const raiz = fabricaComEquipe([{ id: "f", prompt: "p" }]);
    const ag = await agentesParaAcao(raiz, "trabalhar", "");
    expect(Object.keys(ag ?? {})).toEqual(["f"]);
  });

  it("une as equipes de projetos diferentes", async () => {
    const raiz = fabricaComEquipe([{ id: "front", prompt: "p1" }], "loja");
    // Segundo projeto na MESMA raiz.
    const gestao2 = join(raiz, "projetos", "blog", "_gestao");
    mkdirSync(gestao2, { recursive: true });
    writeFileSync(
      join(gestao2, "equipe.json"),
      JSON.stringify({ agentes: [{ id: "texto", prompt: "p2" }] }),
      "utf8",
    );

    const ag = await agentesParaAcao(raiz, "trabalhar", "");
    expect(Object.keys(ag ?? {}).sort()).toEqual(["front", "texto"]);
  });

  it("id repetido entre projetos: fica o primeiro alfabético, sem misturar prompts", async () => {
    // O fluxo despacha pelo id NU que leu no equipe.json — não há como distinguir dois
    // prompts sob o mesmo nome, então a escolha precisa ser determinística.
    const raiz = fabricaComEquipe([{ id: "ui", prompt: "prompt-do-blog" }], "blog");
    const gestao2 = join(raiz, "projetos", "loja", "_gestao");
    mkdirSync(gestao2, { recursive: true });
    writeFileSync(
      join(gestao2, "equipe.json"),
      JSON.stringify({ agentes: [{ id: "ui", prompt: "prompt-da-loja" }] }),
      "utf8",
    );

    const ag = await agentesParaAcao(raiz, "trabalhar", "");
    expect(Object.keys(ag ?? {})).toEqual(["ui"]);
    expect(ag?.["ui"]?.prompt).toBe("prompt-do-blog");
  });

  it("nenhum projeto com equipe válida → undefined (não injeta objeto vazio)", async () => {
    const raiz = fabricaComEquipe([{ id: "sem-prompt" }]);
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
