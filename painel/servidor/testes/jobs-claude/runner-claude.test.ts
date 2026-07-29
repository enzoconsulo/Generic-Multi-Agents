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
  const anotacoes: { sessionId?: string; cwd?: string }[] = [];
  const ctx: ContextoExecucao = {
    emitir: (tipo, dados) => eventos.push({ tipo, dados }),
    sinal,
    pedirInput: async () => ({}),
    anotar: (dados) => anotacoes.push(dados),
  };
  return { ctx, eventos, anotacoes };
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
    const { ctx, eventos, anotacoes } = contexto(new AbortController().signal);

    const r = await runner.executar(jobFake(PARAMS), ctx);

    // T-019: sessionId/cwd gravados no job JÁ no `system/init`, não só no fim — é o que
    // permite retomar à mão um fluxo interrompido no meio.
    expect(anotacoes).toContainEqual({ sessionId: "sess-1", cwd: PARAMS.cwd });

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

  it("mostra o subagente despachado no log (Agent/Task → <tipo>)", async () => {
    const mensagens = [
      // Claude Code despacha via ferramenta "Agent".
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Agent",
              input: { subagent_type: "domain", description: "T-002", prompt: "..." },
            },
          ],
        },
      },
      // Outros SDKs usam "Task" — também suportado.
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Task", input: { subagent_type: "testador" } }],
        },
      },
      // Subagente (parent_tool_use_id != null) usando uma ferramenta comum: sem alvo.
      {
        type: "assistant",
        parent_tool_use_id: "toolu_1",
        message: { content: [{ type: "tool_use", name: "Edit" }] },
      },
      { type: "result", is_error: false },
    ];
    const runner = new RunnerClaude(consultaDe(mensagens));
    const { ctx, eventos } = contexto(new AbortController().signal);

    await runner.executar(jobFake(PARAMS), ctx);

    const textos = eventos
      .filter((e) => (e.dados as { nivel: string }).nivel === "ferramenta")
      .map((e) => (e.dados as { texto: string }).texto);
    expect(textos).toContain("Agent → domain");
    expect(textos).toContain("Task → testador");
    expect(textos).toContain("(subagente) Edit");
  });

  it("despacho sem subagent_type válido cai no nome cru, sem quebrar", async () => {
    const mensagens = [
      { type: "assistant", message: { content: [{ type: "tool_use", name: "Agent", input: {} }] } },
      { type: "result", is_error: false },
    ];
    const runner = new RunnerClaude(consultaDe(mensagens));
    const { ctx, eventos } = contexto(new AbortController().signal);
    await runner.executar(jobFake(PARAMS), ctx);
    const textos = eventos
      .filter((e) => (e.dados as { nivel: string }).nivel === "ferramenta")
      .map((e) => (e.dados as { texto: string }).texto);
    expect(textos).toContain("Agent");
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

  it("passa fallbackModel ao SDK quando params tem fallback", async () => {
    let opcoes: Record<string, unknown> | undefined;
    const runner = new RunnerClaude(
      consultaDe([{ type: "result", is_error: false }], (o) => (opcoes = o)),
    );
    const { ctx } = contexto(new AbortController().signal);
    await runner.executar(jobFake({ ...PARAMS, fallback: "opus" }), ctx);
    expect(opcoes?.["fallbackModel"]).toBe("opus");
  });

  it("sem fallback, não passa fallbackModel", async () => {
    let opcoes: Record<string, unknown> | undefined;
    const runner = new RunnerClaude(
      consultaDe([{ type: "result", is_error: false }], (o) => (opcoes = o)),
    );
    const { ctx } = contexto(new AbortController().signal);
    await runner.executar(jobFake(PARAMS), ctx);
    expect(opcoes?.["fallbackModel"]).toBeUndefined();
  });

  /**
   * T-042 — o `effort` da tabela de guardrails só existe se CHEGAR ao SDK com o nome
   * certo. Estes testes olham para as options porque as duas falhas reais foram mudas:
   * o valor foi aninhado num `outputConfig` que não existe na API, e o `lerParams` nem
   * lia a chave. Nos dois casos tudo compilava, os testes passavam e todo fluxo seguia
   * no padrão — a economia configurada simplesmente não acontecia. Mesma família do
   * `watchdogMs` que a tabela anunciava e ninguém consumia.
   */
  it("passa effort ao SDK como opção de TOPO quando a ação define esforço", async () => {
    let opcoes: Record<string, unknown> | undefined;
    const runner = new RunnerClaude(
      consultaDe([{ type: "result", is_error: false }], (o) => (opcoes = o)),
    );
    const { ctx } = contexto(new AbortController().signal);
    await runner.executar(jobFake({ ...PARAMS, esforco: "medium" }), ctx);

    expect(opcoes?.["effort"]).toBe("medium");
    // Nome errado é o modo de falha real: aninhar aqui é ignorado em silêncio pelo SDK.
    expect(opcoes?.["outputConfig"]).toBeUndefined();
  });

  it("sem esforço na tabela, não manda effort — o padrão do modelo é o certo aí", async () => {
    let opcoes: Record<string, unknown> | undefined;
    const runner = new RunnerClaude(
      consultaDe([{ type: "result", is_error: false }], (o) => (opcoes = o)),
    );
    const { ctx } = contexto(new AbortController().signal);
    await runner.executar(jobFake(PARAMS), ctx);
    expect(opcoes).not.toHaveProperty("effort");
  });

  it("esforço inválido vindo do disco é ignorado, não repassado ao SDK", async () => {
    let opcoes: Record<string, unknown> | undefined;
    const runner = new RunnerClaude(
      consultaDe([{ type: "result", is_error: false }], (o) => (opcoes = o)),
    );
    const { ctx } = contexto(new AbortController().signal);
    await runner.executar(jobFake({ ...PARAMS, esforco: "turbo" }), ctx);
    // Cair no padrão é degradação previsível; mandar lixo ao SDK derruba o fluxo.
    expect(opcoes).not.toHaveProperty("effort");
  });

  it("rejeita params sem prompt/cwd/modelo válidos", async () => {
    const runner = new RunnerClaude(consultaDe([]));
    const { ctx } = contexto(new AbortController().signal);
    await expect(runner.executar(jobFake({ cwd: "x", modelo: "haiku" }), ctx)).rejects.toThrow(
      /prompt/i,
    );
  });
});

describe("tokens do fluxo (T-044) — preço esconde a causa", () => {
  const USAGE = {
    "claude-sonnet-5": {
      inputTokens: 120,
      outputTokens: 3400,
      cacheReadInputTokens: 250000,
      cacheCreationInputTokens: 18000,
      costUSD: 0.42,
    },
    "claude-haiku-4-5": {
      inputTokens: 10,
      outputTokens: 200,
      cacheReadInputTokens: 900,
      cacheCreationInputTokens: 0,
      costUSD: 0.002,
    },
  };

  it("soma o uso de TODOS os modelos e guarda a quebra por modelo", async () => {
    // Um fluxo usa mais de um modelo (fallback, resumidor em haiku, subagente com modelo
    // próprio). Somar sem guardar a quebra esconderia justamente quem está gastando.
    const runner = new RunnerClaude(
      consultaDe([{ type: "result", is_error: false, modelUsage: USAGE }]),
    );
    const { ctx } = contexto(new AbortController().signal);
    const r = await runner.executar(jobFake(PARAMS), ctx);

    expect(r.tokens).not.toBeNull();
    expect(r.tokens?.saida).toBe(3600);
    expect(r.tokens?.cacheLeitura).toBe(250900);
    expect(r.tokens?.cacheEscrita).toBe(18000);
    expect(r.tokens?.porModelo["claude-sonnet-5"]?.custoUsd).toBeCloseTo(0.42);
    expect(Object.keys(r.tokens?.porModelo ?? {})).toHaveLength(2);
  });

  it("o log de conclusão mostra saída e cache relido, não só o preço", async () => {
    const runner = new RunnerClaude(
      consultaDe([
        { type: "result", is_error: false, total_cost_usd: 0.42, modelUsage: USAGE },
      ]),
    );
    const { ctx, eventos } = contexto(new AbortController().signal);
    await runner.executar(jobFake(PARAMS), ctx);

    const final = eventos.map((e) => (e.dados as { texto: string }).texto).join(" ");
    expect(final).toMatch(/3,6k saída/);
    expect(final).toMatch(/250,9k de cache relido/);
  });

  it("SDK sem modelUsage não quebra o fluxo — tokens ficam null", async () => {
    // Churn de versão do SDK não pode derrubar job: a telemetria é acessório.
    const runner = new RunnerClaude(consultaDe([{ type: "result", is_error: false }]));
    const { ctx } = contexto(new AbortController().signal);
    expect((await runner.executar(jobFake(PARAMS), ctx)).tokens).toBeNull();
  });

  it("entrada estranha no modelUsage é ignorada em vez de virar NaN", async () => {
    const runner = new RunnerClaude(
      consultaDe([
        {
          type: "result",
          is_error: false,
          modelUsage: { bom: { outputTokens: 5 }, ruim: null, pior: "texto" },
        },
      ]),
    );
    const { ctx } = contexto(new AbortController().signal);
    const r = await runner.executar(jobFake(PARAMS), ctx);
    expect(r.tokens?.saida).toBe(5);
    expect(r.tokens?.entrada).toBe(0);
    expect(Object.keys(r.tokens?.porModelo ?? {})).toEqual(["bom"]);
  });
});
