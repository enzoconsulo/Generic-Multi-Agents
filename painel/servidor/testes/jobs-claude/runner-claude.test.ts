import { describe, expect, it } from "vitest";
import { RunnerClaude, type Consulta } from "../../src/jobs/claude/runner-claude.js";
import type { ContextoExecucao, Job } from "../../src/jobs/tipos.js";

function jobFake(params: Record<string, unknown>): Job {
  return {
    id: "j1",
    tipo: "claude",
    titulo: "/status",
    escopo: "global",
    usaClaude: true,
    params,
    estado: "executando",
    criadoEm: new Date().toISOString(),
  };
}

function contexto(sinal: AbortSignal) {
  const eventos: { tipo: string; dados?: unknown }[] = [];
  const ctx: ContextoExecucao = {
    emitir: (tipo, dados) => eventos.push({ tipo, dados }),
    sinal,
  };
  return { ctx, eventos };
}

const PARAMS = { prompt: "/status", cwd: "C:/fabrica", modelo: "haiku" };

function consultaDe(mensagens: unknown[], capturar?: (o: Record<string, unknown>) => void): Consulta {
  return (args) => {
    capturar?.(args.options);
    return (async function* () {
      for (const m of mensagens) yield m;
    })();
  };
}

describe("RunnerClaude — tradução de mensagens do SDK em eventos e resultado", () => {
  it("emite logs por mensagem e retorna sessão, custo e texto final", async () => {
    const mensagens = [
      { type: "system", subtype: "init", session_id: "sess-1", model: "haiku" },
      { type: "assistant", message: { content: [{ type: "text", text: "olá" }] } },
      {
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Read" }] },
      },
      {
        type: "result",
        subtype: "success",
        is_error: false,
        total_cost_usd: 0.0123,
        num_turns: 2,
        result: "pronto",
      },
      { type: "rate_limit_event", foo: 1 }, // tipo desconhecido: ignorado sem quebrar
    ];
    const runner = new RunnerClaude(consultaDe(mensagens));
    const { ctx, eventos } = contexto(new AbortController().signal);

    const r = await runner.executar(jobFake(PARAMS), ctx);

    expect(r.sessionId).toBe("sess-1");
    expect(r.custoUsd).toBeCloseTo(0.0123);
    expect(r.numTurnos).toBe(2);
    expect(r.erro).toBe(false);
    expect(r.texto).toBe("pronto");

    const niveis = eventos.map((e) => (e.dados as { nivel: string }).nivel);
    expect(niveis).toContain("inicio");
    expect(niveis).toContain("assistente");
    expect(niveis).toContain("ferramenta");
    expect(niveis).toContain("resultado");
  });

  it("lança quando o result vem com is_error", async () => {
    const mensagens = [
      { type: "result", subtype: "error", is_error: true, result: "algo falhou" },
    ];
    const runner = new RunnerClaude(consultaDe(mensagens));
    const { ctx } = contexto(new AbortController().signal);
    await expect(runner.executar(jobFake(PARAMS), ctx)).rejects.toThrow(/erro/i);
  });

  it("liga o AbortSignal do job ao AbortController passado ao SDK", async () => {
    let opcoes: Record<string, unknown> | undefined;
    const runner = new RunnerClaude(consultaDe([{ type: "result", is_error: false }], (o) => (opcoes = o)));
    const ac = new AbortController();
    ac.abort(); // já abortado antes de executar
    const { ctx } = contexto(ac.signal);

    await runner.executar(jobFake(PARAMS), ctx);

    const controlador = opcoes?.["abortController"] as AbortController;
    expect(controlador.signal.aborted).toBe(true);
    expect(opcoes?.["model"]).toBe("haiku");
    expect(opcoes?.["cwd"]).toBe("C:/fabrica");
  });

  it("rejeita params sem prompt/cwd/modelo válidos", async () => {
    const runner = new RunnerClaude(consultaDe([]));
    const { ctx } = contexto(new AbortController().signal);
    await expect(runner.executar(jobFake({ cwd: "x", modelo: "haiku" }), ctx)).rejects.toThrow(
      /prompt/i,
    );
  });
});
