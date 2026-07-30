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

describe("disjuntor de cota (T-045) — parar de gastar contra parede rígida", () => {
  /**
   * Reproduz a rodada real de 2026-07-29: o fluxo bateu o limite, e o SDK seguiu abrindo
   * DUAS sessões novas contra a parede, pagando cache relido em cada. O disjuntor tem de
   * cortar na primeira mensagem de limite — o que não for consumido prova a economia.
   */
  const LIMITE = "You've hit your session limit · resets 2:40pm (America/Sao_Paulo)";

  function consultaContada(mensagens: unknown[]) {
    const estado = { consumidas: 0 };
    const consulta: Consulta = () =>
      (async function* () {
        for (const m of mensagens) {
          estado.consumidas++;
          yield m;
        }
      })();
    return { consulta, estado };
  }

  it("aborta no primeiro sinal de limite e não consome as sessões seguintes", async () => {
    const { consulta, estado } = consultaContada([
      { type: "system", subtype: "init", session_id: "s1", model: "sonnet" },
      { type: "assistant", message: { content: [{ type: "text", text: LIMITE }] } },
      // Tudo daqui para baixo é o desperdício que o disjuntor existe para evitar.
      { type: "system", subtype: "init", session_id: "s2", model: "sonnet" },
      { type: "assistant", message: { content: [{ type: "text", text: LIMITE }] } },
      { type: "system", subtype: "init", session_id: "s3", model: "sonnet" },
      { type: "result", is_error: true, total_cost_usd: 0.61 },
    ]);
    const { ctx } = contexto(new AbortController().signal);

    await expect(new RunnerClaude(consulta).executar(jobFake(PARAMS), ctx)).rejects.toThrow(
      /Limite de uso da assinatura/,
    );
    expect(estado.consumidas).toBe(2);
  });

  it("preserva custo e tokens na falha, com motivo e hora de reabertura", async () => {
    const consulta = consultaDe([
      { type: "system", subtype: "init", session_id: "s1", model: "sonnet" },
      {
        type: "result",
        is_error: false,
        total_cost_usd: 0.5569,
        num_turns: 15,
        modelUsage: {
          "claude-sonnet-5": {
            inputTokens: 300,
            outputTokens: 6600,
            cacheReadInputTokens: 147900,
            cacheCreationInputTokens: 0,
            costUSD: 0.5569,
          },
        },
      },
      { type: "assistant", message: { content: [{ type: "text", text: LIMITE }] } },
    ]);
    const { ctx } = contexto(new AbortController().signal);

    const falha = await new RunnerClaude(consulta)
      .executar(jobFake(PARAMS), ctx)
      .then(() => null)
      .catch((e: unknown) => e as Error & { resultado?: Record<string, unknown> });

    expect(falha?.resultado?.["motivo"]).toBe("limite-uso");
    expect(falha?.resultado?.["reabreEm"]).toBe("2:40pm (America/Sao_Paulo)");
    expect(falha?.resultado?.["custoUsd"]).toBeCloseTo(0.5569);
    expect(falha?.resultado?.["numTurnos"]).toBe(15);
    const tokens = falha?.resultado?.["tokens"] as { cacheLeitura: number };
    expect(tokens.cacheLeitura).toBe(147900);
  });

  it("erro comum também preserva a contabilidade, sem virar motivo de cota", async () => {
    const consulta = consultaDe([
      { type: "system", subtype: "init", session_id: "s1", model: "sonnet" },
      { type: "result", is_error: true, total_cost_usd: 0.02, num_turns: 3, result: "estourou" },
    ]);
    const { ctx } = contexto(new AbortController().signal);

    const falha = await new RunnerClaude(consulta)
      .executar(jobFake(PARAMS), ctx)
      .then(() => null)
      .catch((e: unknown) => e as Error & { resultado?: Record<string, unknown> });

    expect(falha?.message).toMatch(/terminou com erro/);
    expect(falha?.resultado?.["motivo"]).toBeUndefined();
    expect(falha?.resultado?.["custoUsd"]).toBeCloseTo(0.02);
  });

  it("não confunde texto que só MENCIONA limite com a parede do provedor", async () => {
    const consulta = consultaDe([
      { type: "system", subtype: "init", session_id: "s1", model: "sonnet" },
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "Vou checar o limite de turnos da ação." }] },
      },
      { type: "result", is_error: false, total_cost_usd: 0.01, num_turns: 1, result: "ok" },
    ]);
    const { ctx } = contexto(new AbortController().signal);

    const r = await new RunnerClaude(consulta).executar(jobFake(PARAMS), ctx);
    expect(r.motivo).toBeUndefined();
    expect(r.texto).toBe("ok");
  });
});

describe("alvo da ferramenta no log (T-047) — console era 74-92% de nome pelado", () => {
  function logsDe(mensagens: unknown[]) {
    const { ctx, eventos } = contexto(new AbortController().signal);
    return { ctx, eventos, textos: () => eventos
      .filter((e) => e.tipo === "log")
      .map((e) => (e.dados as { nivel: string; texto: string }))
      .filter((d) => d.nivel === "ferramenta")
      .map((d) => d.texto), mensagens };
  }

  async function rodar(input: Record<string, unknown>, nome = "Read") {
    const h = logsDe([]);
    const consulta = consultaDe([
      { type: "system", subtype: "init", session_id: "s1", model: "sonnet" },
      { type: "assistant", message: { content: [{ type: "tool_use", name: nome, input }] } },
      { type: "result", is_error: false, total_cost_usd: 0.01, num_turns: 1, result: "ok" },
    ]);
    await new RunnerClaude(consulta).executar(jobFake(PARAMS), h.ctx);
    return h.textos()[0] ?? "";
  }

  it("caminho vira só o nome do arquivo — o diretório come a linha e não informa", async () => {
    expect(await rodar({ file_path: "C:/fabrica/projetos/app/src/app.py" })).toBe("Read: app.py");
  });

  it("comando de shell aparece, normalizado", async () => {
    expect(await rodar({ command: "git   status\n--short" }, "Bash")).toBe("Bash: git status --short");
  });

  it("alvo longo é truncado para não estourar a linha", async () => {
    const texto = await rodar({ command: "x".repeat(200) }, "Bash");
    expect(texto.length).toBeLessThanOrEqual(60 + "Bash: ".length + 1);
    expect(texto.endsWith("…")).toBe(true);
  });

  it("ferramenta sem alvo reconhecível continua só com o nome", async () => {
    expect(await rodar({ algo: "irrelevante" }, "TodoWrite")).toBe("TodoWrite");
  });

  /**
   * Invariante crítica: o segmentador da T-039 casa `→ agente` NO FIM da linha para fechar
   * trecho. Se o alvo fosse anexado depois da seta, todo resumo de agente pararia de sair.
   */
  it("despacho mantém a seta no fim — é o que a T-039 casa para fechar trecho", async () => {
    const texto = await rodar({ subagent_type: "executor", prompt: "faça X" }, "Task");
    expect(texto).toBe("Task → executor");
    expect(/→\s*([a-z0-9-]+)\s*$/i.test(texto)).toBe(true);
  });
});

describe("job multi-sessão (T-047) — um job NÃO é uma sessão", () => {
  const LIMITE = "You've hit your session limit · resets 12:10pm (America/Sao_Paulo)";

  /**
   * Observado numa rodada real: o `/trabalhar` abriu SEIS sessões num job só (despacho em
   * background reabre sessão). Só a primeira reportou `result`. Contar importa para custo:
   * cada sessão é um prefixo novo para ESCREVER no cache, a linha mais cara da conta.
   */
  it("conta as sessões abertas, não só a que reportou resultado", async () => {
    const consulta = consultaDe([
      { type: "system", subtype: "init", session_id: "s1", model: "sonnet" },
      { type: "result", is_error: false, total_cost_usd: 1.16, num_turns: 21, result: "feito" },
      { type: "system", subtype: "init", session_id: "s2", model: "sonnet" },
      { type: "system", subtype: "init", session_id: "s3", model: "sonnet" },
    ]);
    const { ctx } = contexto(new AbortController().signal);

    const r = await new RunnerClaude(consulta).executar(jobFake(PARAMS), ctx);
    expect(r.sessoes).toBe(3);
    expect(r.numTurnos).toBe(21);
  });

  /**
   * O pior defeito da T-045: a mensagem afirmava "Nada foi entregue" mesmo quando o fluxo
   * tinha concluído turnos e commitado. Isso mandava o usuário refazer trabalho pronto.
   */
  it("com turnos concluídos, a mensagem de cota NÃO diz que nada foi entregue", async () => {
    const consulta = consultaDe([
      { type: "system", subtype: "init", session_id: "s1", model: "sonnet" },
      { type: "result", is_error: false, total_cost_usd: 1.16, num_turns: 21, result: "feito" },
      { type: "assistant", message: { content: [{ type: "text", text: LIMITE }] } },
    ]);
    const { ctx } = contexto(new AbortController().signal);

    const falha = await new RunnerClaude(consulta)
      .executar(jobFake(PARAMS), ctx)
      .then(() => null)
      .catch((e: unknown) => e as Error);

    expect(falha?.message).toContain("21 turno(s)");
    expect(falha?.message).toContain("está valendo");
    expect(falha?.message).not.toContain("Nada foi entregue");
  });

  it("sem nenhum turno, mantém o aviso de que nada saiu", async () => {
    const consulta = consultaDe([
      { type: "system", subtype: "init", session_id: "s1", model: "sonnet" },
      { type: "assistant", message: { content: [{ type: "text", text: LIMITE }] } },
    ]);
    const { ctx } = contexto(new AbortController().signal);

    const falha = await new RunnerClaude(consulta)
      .executar(jobFake(PARAMS), ctx)
      .then(() => null)
      .catch((e: unknown) => e as Error);

    expect(falha?.message).toContain("Nada foi entregue");
  });
});

describe("contabilidade multi-sessão (T-047) — custo e turnos se comportam diferente", () => {
  /**
   * Números REAIS da rodada 358c14f1 (8 sessões). Custo subiu monotonicamente ao longo dos
   * `result`s (cumulativo); turnos vieram por sessão. Tratar os dois igual subcontava turnos
   * em 6× — o job gravava 10 quando o trabalho real foram 61.
   */
  const RESULTS: ReadonlyArray<[number, number]> = [
    [0.7898, 17], [1.4396, 7], [2.0148, 4], [4.2591, 6],
    [5.2465, 4], [6.0067, 6], [6.7515, 7], [7.4203, 10],
  ];

  it("soma os turnos e NÃO soma o custo (que já vem cumulativo do SDK)", async () => {
    const mensagens: unknown[] = [];
    for (const [custo, turnos] of RESULTS) {
      mensagens.push({ type: "system", subtype: "init", session_id: `s${turnos}`, model: "sonnet" });
      mensagens.push({ type: "result", is_error: false, total_cost_usd: custo, num_turns: turnos });
    }
    const { ctx } = contexto(new AbortController().signal);

    const r = await new RunnerClaude(consultaDe(mensagens)).executar(jobFake(PARAMS), ctx);

    // 17+7+4+6+4+6+7+10 = 61, não 10.
    expect(r.numTurnos).toBe(61);
    // O último custo é o total; somar daria mais de 30 dólares falsos.
    expect(r.custoUsd).toBeCloseTo(7.4203);
    expect(r.sessoes).toBe(8);
  });

  it("uma sessão só continua reportando os próprios turnos", async () => {
    const consulta = consultaDe([
      { type: "system", subtype: "init", session_id: "s1", model: "sonnet" },
      { type: "result", is_error: false, total_cost_usd: 1.16, num_turns: 21 },
    ]);
    const { ctx } = contexto(new AbortController().signal);

    const r = await new RunnerClaude(consulta).executar(jobFake(PARAMS), ctx);
    expect(r.numTurnos).toBe(21);
    expect(r.sessoes).toBe(1);
  });
});
