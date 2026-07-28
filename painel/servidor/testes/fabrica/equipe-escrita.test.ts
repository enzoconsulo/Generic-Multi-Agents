import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ErroEquipe, gravarEquipe, validarEquipe } from "../../src/fabrica/equipe-escrita.js";
import { lerEquipe } from "../../src/fabrica/equipe.js";

/** Fábrica falsa com um projeto `fix` — SEM `_gestao/` de propósito. */
function fabricaTemp(): string {
  const raiz = mkdtempSync(join(tmpdir(), "equipe-escrita-"));
  mkdirSync(join(raiz, "projetos", "fix"), { recursive: true });
  return raiz;
}

const AGENTE_OK = { id: "audio", nome: "Áudio", descricao: "Cuida de som", prompt: "Você cuida de áudio." };

describe("validarEquipe", () => {
  it("aceita um agente completo e normaliza o que falta", () => {
    const { agentes, problemas } = validarEquipe([{ id: "audio", prompt: "faça áudio" }]);
    expect(problemas).toEqual([]);
    expect(agentes[0]).toMatchObject({ id: "audio", nome: "audio", descricao: "" });
  });

  it("recusa id fora do formato, duplicado ou ausente", () => {
    const { problemas } = validarEquipe([
      { id: "Audio Mestre", prompt: "x" },
      { id: "audio", prompt: "x" },
      { id: "audio", prompt: "x" },
      { prompt: "x" },
    ]);
    expect(problemas.join(" ")).toContain("inválido");
    expect(problemas.join(" ")).toContain("duplicado");
    expect(problemas.join(" ")).toContain("falta o `id`");
  });

  it("prompt vazio é BLOQUEIO, não aviso", () => {
    // Agente sem prompt é carregado e silenciosamente ignorado na injeção — falha muda,
    // que é pior que erro na cara.
    const { problemas } = validarEquipe([{ id: "audio", prompt: "   " }]);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain("prompt");
  });

  it("relata TODOS os problemas de uma vez, não só o primeiro", () => {
    // Quem edita cinco agentes precisa ver os cinco erros, não descobrir um por save.
    const { problemas } = validarEquipe([{ id: "", prompt: "" }, { id: "OK!", prompt: "" }]);
    expect(problemas.length).toBeGreaterThanOrEqual(3);
  });

  it("recusa `agentes` que não é lista", () => {
    expect(validarEquipe({ id: "x" }).problemas).toHaveLength(1);
    expect(validarEquipe(null).problemas).toHaveLength(1);
  });

  it("ferramentas precisa ser lista de textos", () => {
    expect(validarEquipe([{ id: "a", prompt: "p", ferramentas: "Read" }]).problemas).toHaveLength(1);
    expect(validarEquipe([{ id: "a", prompt: "p", ferramentas: [1] }]).problemas).toHaveLength(1);
    expect(validarEquipe([{ id: "a", prompt: "p", ferramentas: ["Read"] }]).problemas).toEqual([]);
  });
});

describe("gravarEquipe", () => {
  it("cria `_gestao/` quando o projeto não tem (pasta clonada à mão)", async () => {
    // Armadilha registrada: `_gestao/` pode não existir, e isso já derrubou o CI com 500.
    const raiz = fabricaTemp();
    expect(existsSync(join(raiz, "projetos", "fix", "_gestao"))).toBe(false);

    await gravarEquipe(raiz, "fix", [AGENTE_OK]);

    const caminho = join(raiz, "projetos", "fix", "_gestao", "equipe.json");
    expect(existsSync(caminho)).toBe(true);
    expect(JSON.parse(readFileSync(caminho, "utf8")).agentes[0].id).toBe("audio");
  });

  it("o que foi gravado é relido sem erros pelo leitor da fábrica", async () => {
    // A prova que importa: gravação e leitura usam as MESMAS regras. Se divergirem, o
    // arquivo passa no save e é rejeitado na carga seguinte.
    const raiz = fabricaTemp();
    await gravarEquipe(raiz, "fix", [AGENTE_OK, { id: "ui", prompt: "cuide da tela" }]);

    const equipe = await lerEquipe(raiz, "fix");
    expect(equipe.erros).toEqual([]);
    expect(equipe.agentes).toHaveLength(2);
    for (const a of equipe.agentes) expect(a.erros, `agente ${a.id} com erro`).toEqual([]);
  });

  it("lista vazia é gravação legítima (volta ao executor genérico)", async () => {
    const raiz = fabricaTemp();
    await gravarEquipe(raiz, "fix", []);
    const equipe = await lerEquipe(raiz, "fix");
    expect(equipe.agentes).toEqual([]);
    expect(equipe.erros).toEqual([]);
  });

  it("não grava nada quando a validação falha", async () => {
    const raiz = fabricaTemp();
    await expect(gravarEquipe(raiz, "fix", [{ id: "sem-prompt" }])).rejects.toThrow(ErroEquipe);
    expect(existsSync(join(raiz, "projetos", "fix", "_gestao", "equipe.json"))).toBe(false);
  });

  it("projeto inexistente e travessia de caminho → 404", async () => {
    const raiz = fabricaTemp();
    await expect(gravarEquipe(raiz, "nao-existe", [AGENTE_OK])).rejects.toMatchObject({ status: 404 });
    await expect(gravarEquipe(raiz, "../fora", [AGENTE_OK])).rejects.toMatchObject({ status: 404 });
  });

  it("erro de validação vem com status 400 e a lista de problemas", async () => {
    const raiz = fabricaTemp();
    await expect(gravarEquipe(raiz, "fix", [{ id: "A B", prompt: "" }])).rejects.toMatchObject({
      status: 400,
    });
    try {
      await gravarEquipe(raiz, "fix", [{ id: "A B", prompt: "" }]);
    } catch (e) {
      expect((e as ErroEquipe).problemas.length).toBeGreaterThanOrEqual(2);
    }
  });
});
