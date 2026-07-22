import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ErroProjetoInexistente,
  dirProjeto,
  lerPromptAnalise,
  montarJobAnalise,
} from "../../src/acoes/analise.js";
import type { NovoJob } from "../../src/jobs/fila.js";

/** Fábrica falsa em pasta temporária com um projeto `fix`. */
function fabricaTemp(): string {
  const raiz = mkdtempSync(join(tmpdir(), "analise-"));
  mkdirSync(join(raiz, "projetos", "fix"), { recursive: true });
  return raiz;
}

/** `NovoJob.params` é opcional no tipo; a análise sempre preenche. Estreita para os testes. */
function params(job: NovoJob): NonNullable<NovoJob["params"]> {
  if (!job.params) throw new Error("job sem params");
  return job.params;
}

describe("montarJobAnalise (T-012)", () => {
  it("monta um job claude com cwd no projeto e lock por projeto", async () => {
    const raiz = fabricaTemp();
    const job = await montarJobAnalise("fix", raiz, { modelo: "haiku" });
    expect(job.tipo).toBe("claude");
    expect(job.usaClaude).toBe(true);
    expect(job.escopo).toBe("projeto:fix");
    expect(job.titulo).toContain("fix");
    const p = params(job);
    expect(p.cwd).toBe(join(raiz, "projetos", "fix"));
    expect(p.modelo).toBe("haiku");
    expect(typeof p.prompt).toBe("string");
    expect((p.prompt as string).length).toBeGreaterThan(100);
  });

  it("passa fallback e maxTurns quando fornecidos", async () => {
    const raiz = fabricaTemp();
    const job = await montarJobAnalise("fix", raiz, {
      modelo: "fable",
      fallback: "opus",
      maxTurns: 50,
    });
    const p = params(job);
    expect(p.fallback).toBe("opus");
    expect(p.maxTurns).toBe(50);
  });

  it("sem fallback, não inclui o campo", async () => {
    const raiz = fabricaTemp();
    const job = await montarJobAnalise("fix", raiz, { modelo: "haiku", fallback: null });
    expect("fallback" in params(job)).toBe(false);
  });

  it("projeto inexistente lança ErroProjetoInexistente", async () => {
    const raiz = fabricaTemp();
    await expect(montarJobAnalise("naoexiste", raiz, { modelo: "haiku" })).rejects.toBeInstanceOf(
      ErroProjetoInexistente,
    );
  });

  it("dirProjeto rejeita travessia de caminho (nunca sai de projetos/)", () => {
    const raiz = fabricaTemp();
    expect(dirProjeto(raiz, "../..")).toBeNull();
    expect(dirProjeto(raiz, "../segredo")).toBeNull();
    expect(dirProjeto(raiz, "fix")).not.toBeNull();
  });
});

describe("prompt de análise versionado (prompts/analise.md)", () => {
  it("contém as 5 seções obrigatórias, a regra do rodapé e a atualização incremental", async () => {
    const prompt = await lerPromptAnalise();
    for (const secao of [
      "## Visão geral",
      "## Arquitetura",
      "## Fluxo de execução",
      "## Stack e dependências",
      "## Pontos de atenção",
    ]) {
      expect(prompt).toContain(secao);
    }
    // Rodapé: data + hash curto do commit.
    expect(prompt).toContain("git rev-parse --short HEAD");
    expect(prompt).toMatch(/Análise gerada em/);
    // Regra de atualização incremental.
    expect(prompt.toLowerCase()).toContain("incremental");
  });
});
