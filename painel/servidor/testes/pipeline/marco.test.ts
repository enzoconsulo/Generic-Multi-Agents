import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fasesProntasParaMarco,
  gravarMarco,
  lerVeredicto,
  textoDoMarco,
} from "../../src/pipeline/marco.js";
import { parsearPlano } from "../../src/fabrica/index.js";
import type { TarefaResumo } from "../../src/fabrica/tipos.js";

function tarefa(id: string, status: string): TarefaResumo {
  return {
    arquivo: `${id}.md`,
    id,
    titulo: id,
    status,
    prioridade: "media",
    dependencias: [],
    areas: [],
    tentativas: 0,
    replanejadaDe: null,
    ultimaReprovacao: null,
    agente: null,
    criada: null,
    atualizada: null,
    erros: [],
  };
}

const PLANO = [
  "# Plano — app",
  "",
  "Visão geral.",
  "",
  "## Fase 1 — Fundação",
  "Meta: o servidor sobe e responde.",
  "Marco: pendente",
  "Tarefas: T-001, T-002",
  "",
  "## Fase 2 — Interface",
  "Meta: dá para jogar.",
  "Marco: pendente",
  "Tarefas: T-003",
  "",
].join("\n");

function arquivoPlano(texto = PLANO, nl = "\n"): string {
  const dir = mkdtempSync(join(tmpdir(), "marco-"));
  const caminho = join(dir, "PLANO.md");
  writeFileSync(caminho, texto.split("\n").join(nl), "utf8");
  return caminho;
}

describe("fasesProntasParaMarco", () => {
  it("fase com TODAS as tarefas concluídas e marco pendente entra", () => {
    const p = parsearPlano(PLANO);
    const r = fasesProntasParaMarco(p, [
      tarefa("T-001", "concluida"),
      tarefa("T-002", "concluida"),
      tarefa("T-003", "pronta"),
    ]);
    expect(r.map((f) => f.fase.nome)).toEqual(["Fase 1 — Fundação"]);
  });

  it("uma tarefa pendente segura a fase inteira", () => {
    const p = parsearPlano(PLANO);
    const r = fasesProntasParaMarco(p, [tarefa("T-001", "concluida"), tarefa("T-002", "em-teste")]);
    expect(r).toEqual([]);
  });

  // O registro é o que diz às próximas sessões que já rodou — repetir seria gastar de novo.
  it("marco já aprovado não volta", () => {
    const p = parsearPlano(PLANO.replace("Marco: pendente", "Marco: aprovado 2026-08-01"));
    const r = fasesProntasParaMarco(p, [tarefa("T-001", "concluida"), tarefa("T-002", "concluida")]);
    expect(r.map((f) => f.fase.nome)).not.toContain("Fase 1 — Fundação");
  });

  // Fase reprovada continua em andamento: o que destrava é a correção, não reverificar o
  // mesmo estado.
  it("marco reprovado também não volta sozinho", () => {
    const p = parsearPlano(PLANO.replace("Marco: pendente", "Marco: reprovado 2026-08-01"));
    const r = fasesProntasParaMarco(p, [tarefa("T-001", "concluida"), tarefa("T-002", "concluida")]);
    expect(r.map((f) => f.fase.nome)).not.toContain("Fase 1 — Fundação");
  });

  // Tarefa citada no plano sem arquivo é erro de planejamento: impedir o marco é o
  // comportamento seguro (melhor não verificar do que verificar meia fase).
  it("tarefa do plano que não existe impede o marco", () => {
    const p = parsearPlano(PLANO);
    const r = fasesProntasParaMarco(p, [tarefa("T-001", "concluida")]);
    expect(r).toEqual([]);
  });

  it("plano ausente não gera marco nenhum", () => {
    expect(fasesProntasParaMarco(null, [tarefa("T-001", "concluida")])).toEqual([]);
  });
});

describe("lerVeredicto", () => {
  it("lê a linha de contrato", () => {
    expect(lerVeredicto("relatório...\nMARCO: aprovado")).toBe("aprovado");
    expect(lerVeredicto("relatório...\nMARCO: reprovado\n")).toBe("reprovado");
    expect(lerVeredicto("MARCO:   Aprovado  ")).toBe("aprovado");
  });

  // O relatório costuma citar as duas palavras ("não foi REPROVADO por isso, está APROVADO").
  it("a linha de contrato VENCE o texto solto", () => {
    expect(lerVeredicto("Quase REPROVADO por lentidão.\nMARCO: aprovado")).toBe("aprovado");
  });

  it("sem a linha, cai na última ocorrência solta", () => {
    expect(lerVeredicto("comecei achando APROVADO mas está REPROVADO")).toBe("reprovado");
  });

  /**
   * A falha mais grave possível: registrar "aprovado" por não ter entendido a resposta
   * esconde a fase para sempre, porque o registro é o que diz que o marco já rodou.
   */
  it("texto sem veredito é INDEFINIDO, nunca aprovado por omissão", () => {
    expect(lerVeredicto("Rodei tudo e achei coisas interessantes.")).toBe("indefinido");
    expect(lerVeredicto("")).toBe("indefinido");
  });
});

describe("textoDoMarco", () => {
  it("segue o contrato do template", () => {
    expect(textoDoMarco("aprovado", "2026-08-02")).toBe("aprovado 2026-08-02");
    expect(textoDoMarco("reprovado", "2026-08-02")).toBe("reprovado 2026-08-02");
    expect(textoDoMarco("reprovado", "2026-08-02", ["T-010", "T-011"])).toBe(
      "reprovado 2026-08-02 (correções: T-010, T-011)",
    );
  });
});

describe("gravarMarco", () => {
  it("troca a linha Marco: da fase certa", async () => {
    const a = arquivoPlano();
    const r = await gravarMarco(a, "Fase 1 — Fundação", "aprovado 2026-08-02");

    expect(r).toEqual({ ok: true, de: "pendente", para: "aprovado 2026-08-02" });
    const texto = readFileSync(a, "utf8");
    expect(texto).toContain("Marco: aprovado 2026-08-02");
    // A Fase 2 fica intacta — duas fases com estrutura igual não podem se confundir.
    expect(texto.split("## Fase 2")[1]).toContain("Marco: pendente");
  });

  // Mesma disciplina de escrita-tarefas.ts: o PLANO.md é lido por humano e o diff dele
  // precisa mostrar a mudança, não o arquivo inteiro reformatado.
  it("não altera nenhuma outra linha", async () => {
    const a = arquivoPlano();
    await gravarMarco(a, "Fase 1 — Fundação", "aprovado 2026-08-02");
    const depois = readFileSync(a, "utf8").split("\n");
    const antes = PLANO.split("\n");
    expect(depois.filter((l, i) => l !== antes[i])).toEqual(["Marco: aprovado 2026-08-02"]);
  });

  it("preserva CRLF", async () => {
    const a = arquivoPlano(PLANO, "\r\n");
    await gravarMarco(a, "Fase 1 — Fundação", "aprovado 2026-08-02");
    expect(readFileSync(a, "utf8")).not.toMatch(/[^\r]\n/);
  });

  it("aceita as variações de formatação da linha", async () => {
    for (const linha of ["Marco: pendente", "- Marco: pendente", "**Marco:** pendente"]) {
      const a = arquivoPlano(`## Fase X\nMeta: x.\n${linha}\nTarefas: T-001\n`);
      const r = await gravarMarco(a, "Fase X", "aprovado 2026-08-02");
      expect(r.ok, linha).toBe(true);
      expect(readFileSync(a, "utf8")).toContain("aprovado 2026-08-02");
    }
  });

  // Nunca lança: um PLANO.md torto não pode derrubar a rodada no fim.
  it("fase inexistente ou sem linha Marco devolve motivo", async () => {
    expect(await gravarMarco(arquivoPlano(), "Fase 9", "aprovado 2026-08-02")).toMatchObject({
      ok: false,
    });
    const semMarco = arquivoPlano("## Fase X\nMeta: x.\nTarefas: T-001\n");
    expect(await gravarMarco(semMarco, "Fase X", "aprovado 2026-08-02")).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("Marco"),
    });
  });

  it("arquivo inexistente devolve motivo", async () => {
    const r = await gravarMarco(join(tmpdir(), "nao-existe-plano.md"), "Fase 1", "aprovado x");
    expect(r.ok).toBe(false);
  });
});
