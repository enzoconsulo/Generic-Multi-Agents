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

describe("parse sem seções — caminho barato do painel (T-043)", () => {
  const TEXTO = `---
id: T-007
titulo: Tarefa de teste
status: pronta
prioridade: alta
dependencias: [T-001, T-002]
areas: [src/a.ts]
tentativas: 2
criada: 2026-07-01
atualizada: 2026-07-29
---

## Objetivo
Fazer a coisa.

## Verificação
Rodou.
`;

  it("devolve exatamente o mesmo frontmatter que a versão completa", () => {
    // A garantia que importa: `lerFabrica` passou a usar este caminho, e a única coisa
    // que pode mudar é NÃO ter seções. Qualquer divergência de campo seria um painel
    // mostrando dado diferente do que a página do projeto mostra.
    const { secoes: _s, ...completaSemSecoes } = parsearTarefa("T-007-x.md", TEXTO);
    expect(parsearTarefa("T-007-x.md", TEXTO, false)).toEqual(completaSemSecoes);
  });

  it("não carrega o corpo — é isso que economiza", () => {
    expect(parsearTarefa("T-007-x.md", TEXTO, false)).not.toHaveProperty("secoes");
    expect(parsearTarefa("T-007-x.md", TEXTO).secoes.objetivo).toBe("Fazer a coisa.");
  });

  it("erros de frontmatter continuam sendo reportados sem o corpo", () => {
    // Sem isto, o caminho barato viraria um caminho CEGO: tarefa quebrada apareceria
    // saudável no painel geral e só denunciaria ao abrir o projeto.
    const ruim = parsearTarefa("T-009-y.md", "---\nid: T-009\n---\n\n## Objetivo\nx\n", false);
    expect(ruim.erros.length).toBeGreaterThan(0);
    expect(ruim.erros.join(" ")).toMatch(/status/);
  });
});
