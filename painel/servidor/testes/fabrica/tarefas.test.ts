import { describe, expect, it } from "vitest";
import { parsearSecoes, parsearTarefa } from "../../src/fabrica/index.js";

describe("parsearTarefa (unidade)", () => {
  it("aceita arquivo com quebras de linha CRLF (checkout Windows)", () => {
    const texto = [
      "---",
      "id: T-010",
      "titulo: Tarefa em CRLF",
      "status: pronta",
      "prioridade: media",
      "dependencias: []",
      "areas: []",
      "tentativas: 0",
      "criada: 2026-07-01",
      "atualizada: 2026-07-02",
      "---",
      "",
      "## Objetivo",
      "Funcionar com CRLF.",
      "",
      "## Critérios de aceite",
      "- [ ] ok",
      "",
    ].join("\r\n");

    const tarefa = parsearTarefa("T-010-crlf.md", texto);
    expect(tarefa.erros).toEqual([]);
    expect(tarefa.status).toBe("pronta");
    expect(tarefa.criada).toBe("2026-07-01");
    expect(tarefa.secoes.objetivo).toBe("Funcionar com CRLF.");
    expect(tarefa.secoes.criteriosAceite).toBe("- [ ] ok");
  });

  it("arquivo sem frontmatter nenhum: campos com fallback e erros preenchidos", () => {
    const tarefa = parsearTarefa("T-011-pelada.md", "## Objetivo\nSem frontmatter.\n");
    expect(tarefa.id).toBe("T-011"); // derivado do nome do arquivo
    expect(tarefa.titulo).toBe("");
    expect(tarefa.dependencias).toEqual([]);
    expect(tarefa.tentativas).toBe(0);
    expect(tarefa.erros.length).toBeGreaterThan(0);
    expect(tarefa.secoes.objetivo).toBe("Sem frontmatter.");
  });

  it("prioridade fora do vocabulário gera erro mantendo o valor bruto", () => {
    const tarefa = parsearTarefa(
      "T-012-x.md",
      "---\nid: T-012\ntitulo: X\nstatus: backlog\nprioridade: urgente\ndependencias: []\nareas: []\ntentativas: 0\ncriada: 2026-07-01\natualizada: 2026-07-01\n---\n",
    );
    expect(tarefa.prioridade).toBe("urgente");
    expect(tarefa.erros.some((e) => e.includes("prioridade desconhecida"))).toBe(true);
  });
});

describe("parsearSecoes (unidade)", () => {
  it("seções do protocolo com acentos são mapeadas; seção estranha é ignorada", () => {
    const secoes = parsearSecoes(
      [
        "## Objetivo",
        "O objetivo.",
        "",
        "## Notas de execução",
        "As notas.",
        "",
        "## Seção inventada",
        "Conteúdo fora do protocolo (descartado).",
        "",
        "## Revisão",
        "A revisão.",
      ].join("\n"),
    );
    expect(secoes.objetivo).toBe("O objetivo.");
    expect(secoes.notasExecucao).toBe("As notas.");
    expect(secoes.revisao).toBe("A revisão.");
    expect(secoes.contexto).toBe("");
  });
});
