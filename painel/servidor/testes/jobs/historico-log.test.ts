import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_LINHAS_FIM,
  MAX_LINHAS_INICIO,
  apagarHistorico,
  empurrarLinha,
  historicoVazio,
  lerHistorico,
  salvarHistorico,
} from "../../src/jobs/historico-log.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hist-log-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const linha = (texto: string, nivel = "assistente") => ({ em: "2026-07-31T10:00:00.000Z", nivel, texto });

describe("histórico de log de job", () => {
  it("grava e relê as linhas na ordem", () => {
    const h = historicoVazio();
    empurrarLinha(h, linha("primeira"));
    empurrarLinha(h, linha("Bash: git status", "ferramenta"));
    salvarHistorico(dir, "abc123", h);

    expect(lerHistorico(dir, "abc123").map((l) => l.texto)).toEqual([
      "primeira",
      "Bash: git status",
    ]);
  });

  it("job sem log nenhum não cria arquivo", () => {
    salvarHistorico(dir, "vazio1", historicoVazio());
    expect(lerHistorico(dir, "vazio1")).toEqual([]);
  });

  it("histórico de job inexistente é lista vazia, não erro", () => {
    expect(lerHistorico(dir, "nunca-existiu")).toEqual([]);
  });

  // O corte precisa preservar o FIM: é onde o fluxo quebra, e é o que se procura ao abrir
  // um job que deu errado. Cortar o fim seria o default preguiçoso e inútil.
  it("acima do teto corta o MEIO, preservando começo e fim", () => {
    const h = historicoVazio();
    const total = MAX_LINHAS_INICIO + MAX_LINHAS_FIM + 250;
    for (let i = 0; i < total; i++) empurrarLinha(h, linha(`linha ${i}`));

    expect(h.descartadas).toBe(250);
    expect(h.linhas).toHaveLength(MAX_LINHAS_INICIO + MAX_LINHAS_FIM);
    expect(h.linhas[0]?.texto).toBe("linha 0");
    expect(h.linhas.at(-1)?.texto).toBe(`linha ${total - 1}`);
  });

  it("o arquivo marca onde o corte aconteceu", () => {
    const h = historicoVazio();
    for (let i = 0; i < MAX_LINHAS_INICIO + MAX_LINHAS_FIM + 10; i++) {
      empurrarLinha(h, linha(`linha ${i}`));
    }
    salvarHistorico(dir, "grande", h);

    const lidas = lerHistorico(dir, "grande");
    const marca = lidas[MAX_LINHAS_INICIO];
    expect(marca?.texto).toContain("10 linha(s) omitidas");
    // A marca fica NO MEIO, não no fim: o buraco aparece onde ele existe.
    expect(lidas.at(-1)?.texto).toContain("linha ");
  });

  it("apagar remove o arquivo (poda de job não deixa log órfão)", () => {
    const h = historicoVazio();
    empurrarLinha(h, linha("algo"));
    salvarHistorico(dir, "podado", h);
    expect(existsSync(join(dir, "podado.log.jsonl"))).toBe(true);

    apagarHistorico(dir, "podado");
    expect(existsSync(join(dir, "podado.log.jsonl"))).toBe(false);
    // Apagar de novo não pode explodir: a poda roda no boot, sem saber o que já saiu.
    expect(() => apagarHistorico(dir, "podado")).not.toThrow();
  });
});
