import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { faseAtualDoPlano, parsearMarco, parsearPlano } from "../../src/fabrica/index.js";

const aqui = dirname(fileURLToPath(import.meta.url));
// Este projeto vive em <fabrica>/projetos/painel-fabrica/servidor/testes/fabrica.
const RAIZ_PAINEL = resolve(aqui, "..", "..", "..");
// O painel é ferramenta de sistema em <fabrica>/painel — a fábrica é um nível acima.
const RAIZ_FABRICA_REAL = resolve(RAIZ_PAINEL, "..");

describe("parsearPlano contra os arquivos reais (contrato vivo)", () => {
  it("entende o template oficial _sistema/templates/PLANO.md", async () => {
    const texto = await readFile(
      join(RAIZ_FABRICA_REAL, "_sistema", "templates", "PLANO.md"),
      "utf8",
    );
    const plano = parsearPlano(texto);

    expect(plano.erros).toEqual([]);
    expect(plano.fases.map((f) => f.nome)).toEqual([
      "Fase 1 — Fundação",
      "Fase 2 — Núcleo",
      "Fase 3 — Refinamento",
    ]);
    for (const fase of plano.fases) {
      expect(fase.marco?.estado).toBe("pendente");
      expect(fase.meta).not.toBe("");
    }
    expect(plano.fases[0]?.tarefas).toEqual(["T-001", "T-002"]);
    // O comentário HTML no fim do template (que menciona "Marco:") não vira fase nem erro.
    expect(faseAtualDoPlano(plano)?.nome).toBe("Fase 1 — Fundação");
  });

  it("entende o _gestao/PLANO.md real deste projeto", async () => {
    const texto = await readFile(join(RAIZ_PAINEL, "_gestao", "PLANO.md"), "utf8");
    const plano = parsearPlano(texto);

    expect(plano.erros).toEqual([]);
    expect(plano.titulo).toBe("Plano — painel-fabrica");
    expect(plano.visao).not.toBe("");
    expect(plano.fases).toHaveLength(3);
    for (const fase of plano.fases) {
      // Asserções estáveis à evolução do projeto: toda fase tem meta, marco válido e tarefas.
      expect(fase.meta.length).toBeGreaterThan(10);
      expect(fase.marco).not.toBeNull();
      expect(["pendente", "aprovado", "reprovado"]).toContain(fase.marco?.estado);
      expect(fase.tarefas.length).toBeGreaterThan(0);
    }
    // Esta tarefa (T-003) pertence à Fase 1 do plano real.
    expect(plano.fases[0]?.tarefas).toContain("T-003");
  });
});

describe("parsearMarco", () => {
  it("interpreta os três estados do contrato e o desconhecido", () => {
    expect(parsearMarco("pendente")).toEqual({ bruto: "pendente", estado: "pendente", data: null });
    expect(parsearMarco("aprovado 2026-07-18")).toMatchObject({
      estado: "aprovado",
      data: "2026-07-18",
    });
    expect(parsearMarco("reprovado 2026-07-19 (correções: T-010, T-011)")).toMatchObject({
      estado: "reprovado",
      data: "2026-07-19",
    });
    expect(parsearMarco("qualquer outra coisa").estado).toBe("desconhecido");
  });
});

describe("faseAtualDoPlano", () => {
  it("plano sem nenhuma linha Marco: não lança e não tem fase atual", () => {
    const plano = parsearPlano("# Plano — x\n\n## Fase 1 — Única\nMeta: algo\nTarefas: T-001\n");
    expect(plano.erros).toHaveLength(1);
    expect(faseAtualDoPlano(plano)).toBeNull();
  });

  it("sem fase pendente, a primeira reprovada é a atual; todas aprovadas → null", () => {
    const reprovado = parsearPlano(
      [
        "# Plano — x",
        "",
        "## Fase 1",
        "Meta: a",
        "Marco: aprovado 2026-07-01",
        "Tarefas: T-001",
        "",
        "## Fase 2",
        "Meta: b",
        "Marco: reprovado 2026-07-10 (correções: T-009)",
        "Tarefas: T-002",
      ].join("\n"),
    );
    expect(faseAtualDoPlano(reprovado)?.nome).toBe("Fase 2");

    const completo = parsearPlano(
      ["# Plano — x", "", "## Fase 1", "Meta: a", "Marco: aprovado 2026-07-01", "Tarefas: T-001"].join(
        "\n",
      ),
    );
    expect(faseAtualDoPlano(completo)).toBeNull();
  });
});
