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

  /**
   * O texto mudou na T-049 ("Nada foi entregue" → "nada foi alterado"), de propósito: o
   * runner NÃO observa entregas, observa chamadas de ferramenta. Afirmar que nada foi
   * entregue é uma conclusão mais forte do que o dado sustenta — e foi exatamente esse tipo
   * de excesso que fez a mensagem mentir no caso oposto. A INVARIANTE testada é a mesma:
   * sem trabalho observado, o aviso tem de continuar existindo.
   */
  it("sem nenhum turno nem ferramenta, mantém o aviso de que nada saiu", async () => {
    const consulta = consultaDe([
      { type: "system", subtype: "init", session_id: "s1", model: "sonnet" },
      { type: "assistant", message: { content: [{ type: "text", text: LIMITE }] } },
    ]);
    const { ctx } = contexto(new AbortController().signal);

    const falha = await new RunnerClaude(consulta)
      .executar(jobFake(PARAMS), ctx)
      .then(() => null)
      .catch((e: unknown) => e as Error);

    expect(falha?.message).toContain("nada foi alterado");
    expect(falha?.message).toContain("Redispare");
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

  /**
   * `modelUsage` é cumulativo por job — fechado em 30/07 pela gravação SSE da 358c14f1: os
   * sete últimos `result` saíram numa janela de 2 ms (mensagens descarregadas juntas no fim),
   * lendo o acumulador já final, e a soma de `costUSD` bate com o `total_cost_usd` cumulativo.
   * O guarda abaixo existe para que um SDK que volte a mandar POR SESSÃO apareça na tela em
   * vez de subcontar tokens em silêncio, como aconteceu com os turnos até o T-047.
   */
  const usagePorModelo = (custo: number) => ({
    "claude-sonnet-5": {
      inputTokens: 100,
      outputTokens: 5000,
      cacheReadInputTokens: 400000,
      cacheCreationInputTokens: 20000,
      costUSD: custo,
    },
  });

  it("acumulador adiantado no meio do fluxo NÃO é tratado como divergência", async () => {
    // Comportamento REAL do SDK: os `result` descarregados juntos no fim leem o acumulador
    // já final (7,4203) enquanto carregam o custo do próprio instante (0,79, 1,44, …). Comparar
    // a cada `result` acusaria subcontagem em toda rodada multi-sessão saudável — falso
    // positivo que este teste existe para impedir. A conferência só vale no fim.
    const mensagens: unknown[] = [];
    for (const [custo, turnos] of RESULTS) {
      mensagens.push({ type: "system", subtype: "init", session_id: `s${turnos}`, model: "sonnet" });
      mensagens.push({
        type: "result",
        is_error: false,
        total_cost_usd: custo,
        num_turns: turnos,
        modelUsage: usagePorModelo(7.4203),
      });
    }
    const { ctx, eventos } = contexto(new AbortController().signal);

    await new RunnerClaude(consultaDe(mensagens)).executar(jobFake(PARAMS), ctx);

    const textos = eventos.map((e) => (e.dados as { texto: string }).texto).join(" ");
    expect(textos).not.toMatch(/subcontados/);
  });

  it("modelUsage POR SESSÃO vira aviso na tela — uma vez só, sem derrubar o fluxo", async () => {
    // Cenário do SDK que mudasse de semântica: cada `result` traz só o uso da própria sessão,
    // enquanto o custo segue cumulativo. Sem o guarda, o job gravaria o uso da ÚLTIMA sessão
    // como se fosse o do job inteiro — e ninguém veria.
    const mensagens: unknown[] = [];
    for (const [custo, turnos] of RESULTS) {
      mensagens.push({ type: "system", subtype: "init", session_id: `s${turnos}`, model: "sonnet" });
      mensagens.push({
        type: "result",
        is_error: false,
        total_cost_usd: custo,
        num_turns: turnos,
        modelUsage: usagePorModelo(0.6688),
      });
    }
    const { ctx, eventos } = contexto(new AbortController().signal);

    const r = await new RunnerClaude(consultaDe(mensagens)).executar(jobFake(PARAMS), ctx);

    const avisos = eventos
      .map((e) => (e.dados as { texto: string }).texto)
      .filter((t) => /subcontados/.test(t));
    expect(avisos).toHaveLength(1);
    // Diz os dois números: o que o modelUsage soma e o que o fluxo custou de verdade.
    expect(avisos[0]).toContain("$0.6688");
    expect(avisos[0]).toContain("$7.4203");
    // Aviso é diagnóstico: o fluxo termina normalmente e a contabilidade segue gravada.
    expect(r.erro).toBe(false);
    expect(r.tokens?.saida).toBe(5000);
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

/**
 * Despacho em segundo plano dentro de um job headless: o modo de falha real da T-048.
 * O `/novo-projeto banco-imobiliario` despachou o `planejador` assim, encerrou o turno para
 * "aguardar a notificação" (que em headless nunca chega), a sessão fechou e o agente foi
 * cortado no meio — 9 das 22 tarefas nunca escritas, job gravado como `concluido`.
 *
 * REESCRITO em 01/08, porque este bloco CERTIFICAVA o bug. O caso "síncrono" era montado
 * OMITINDO `run_in_background` — mas omitir é justamente o que dispara o segundo plano, que
 * é o padrão da ferramenta. O teste passava verde afirmando que o caminho perigoso era o
 * seguro, e a falha se repetiu em `f72534e8` (T-017a, US$ 0,89 por zero tarefa) com
 * `despachosFundo: 0` na tela. Hoje "síncrono" exige o `false` explícito.
 */
describe("RunnerClaude — despacho em segundo plano", () => {
  /** `bg: undefined` = campo OMITIDO, que é o caminho padrão (e perigoso) da ferramenta. */
  const despacho = (bg: boolean | undefined, id = "tu_1") => ({
    type: "assistant",
    message: {
      content: [
        {
          type: "tool_use",
          id,
          name: "Agent",
          input: {
            subagent_type: "planejador",
            ...(bg === undefined ? {} : { run_in_background: bg }),
          },
        },
      ],
    },
  });
  /** `tool_result` que fecha o par — é o que prova que o agente devolveu antes do fim. */
  const resultadoDe = (id = "tu_1") => ({
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: id }] },
  });
  const fim = { type: "result", is_error: false, total_cost_usd: 0.57, num_turns: 18 };
  const logsDe = (eventos: readonly { tipo: string; dados?: unknown }[]) =>
    eventos.filter((e) => e.tipo === "log").map((e) => (e.dados as { texto: string }).texto);

  it("conta o despacho com `true`, avisa na hora e avisa de novo no fim", async () => {
    const { ctx, eventos } = contexto(new AbortController().signal);
    const r = await new RunnerClaude(consultaDe([despacho(true), fim])).executar(
      jobFake(PARAMS),
      ctx,
    );

    expect(r.despachosFundo).toBe(1);
    const textos = logsDe(eventos);
    expect(textos.some((t) => t.includes("NÃO-BLOQUEANTE") && t.includes("planejador"))).toBe(true);
    expect(textos.some((t) => t.includes("Confira se os artefatos ficaram completos"))).toBe(true);
    // O fluxo NÃO vira erro: ele de fato terminou. O aviso é o que diz para conferir.
    expect(r.erro).toBe(false);
  });

  // O teste que faltava — e cuja ausência custou o job `f72534e8`.
  it("OMITIR o campo conta igual a `true`: segundo plano é o padrão", async () => {
    const { ctx, eventos } = contexto(new AbortController().signal);
    const r = await new RunnerClaude(consultaDe([despacho(undefined), fim])).executar(
      jobFake(PARAMS),
      ctx,
    );

    expect(r.despachosFundo).toBe(1);
    expect(logsDe(eventos).some((t) => t.includes("run_in_background: false"))).toBe(true);
  });

  it("só `run_in_background: false` conta como síncrono", async () => {
    const { ctx, eventos } = contexto(new AbortController().signal);
    const r = await new RunnerClaude(
      consultaDe([despacho(false), resultadoDe(), fim]),
    ).executar(jobFake(PARAMS), ctx);

    expect(r.despachosFundo).toBe(0);
    expect(r.despachosEmVoo).toBe(0);
    const textos = logsDe(eventos);
    expect(textos.some((t) => t.includes("NÃO-BLOQUEANTE"))).toBe(false);
    // O log do despacho em si continua saindo, com a seta que o segmentador de resumos usa.
    expect(textos.some((t) => t.includes("Agent → planejador"))).toBe(true);
  });
});

/**
 * Agente em voo no fechamento da sessão — o DANO, contra o risco medido por `despachosFundo`.
 *
 * Existe porque os dois incidentes reais (30/07 e 01/08) só foram diagnosticados horas
 * depois, lendo `dados/jobs/*.log.jsonl` à mão e reparando que havia chamadas de ferramenta
 * do subagente DEPOIS da linha de `result`. Esse fato está no fluxo de mensagens o tempo
 * todo: despacho sem `tool_result` = agente que estava trabalhando na hora do corte. Não
 * depende de flag, de texto do modelo nem da versão do SDK.
 */
describe("RunnerClaude — agente cortado no meio (despachosEmVoo)", () => {
  const despachoCom = (id: string, agente: string) => ({
    type: "assistant",
    message: {
      content: [
        { type: "tool_use", id, name: "Agent", input: { subagent_type: agente } },
      ],
    },
  });
  const resultadoDe = (id: string) => ({
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: id }] },
  });
  const fim = { type: "result", is_error: false, total_cost_usd: 0.89, num_turns: 12 };

  it("despacho sem tool_result é contado e nomeado", async () => {
    const { ctx, eventos } = contexto(new AbortController().signal);
    const r = await new RunnerClaude(
      consultaDe([despachoCom("tu_1", "servidor"), fim]),
    ).executar(jobFake(PARAMS), ctx);

    expect(r.despachosEmVoo).toBe(1);
    const textos = eventos
      .filter((e) => e.tipo === "log")
      .map((e) => (e.dados as { texto: string }).texto);
    expect(textos.some((t) => t.includes("TRABALHO ABANDONADO") && t.includes("servidor"))).toBe(
      true,
    );
  });

  it("conta só os que ficaram pendentes, num job com vários despachos", async () => {
    const { ctx } = contexto(new AbortController().signal);
    const r = await new RunnerClaude(
      consultaDe([
        despachoCom("tu_1", "executor"),
        resultadoDe("tu_1"),
        despachoCom("tu_2", "testador"),
        resultadoDe("tu_2"),
        despachoCom("tu_3", "revisor"),
        fim,
      ]),
    ).executar(jobFake(PARAMS), ctx);

    expect(r.despachosEmVoo).toBe(1);
  });

  it("job que fechou todos os pares não avisa nada", async () => {
    const { ctx, eventos } = contexto(new AbortController().signal);
    const r = await new RunnerClaude(
      consultaDe([despachoCom("tu_1", "executor"), resultadoDe("tu_1"), fim]),
    ).executar(jobFake(PARAMS), ctx);

    expect(r.despachosEmVoo).toBe(0);
    const textos = eventos
      .filter((e) => e.tipo === "log")
      .map((e) => (e.dados as { texto: string }).texto);
    expect(textos.some((t) => t.includes("TRABALHO ABANDONADO"))).toBe(false);
  });
});

/**
 * Contabilidade que sobrevive ao corte (T-049).
 *
 * O bug que originou tudo: `custoUsd`/`tokens` só eram gravados a partir da mensagem
 * `result`. Um job cortado antes dela — cota batida é o caso comum — gravava `null`, e o
 * histórico do projeto marcava US$ 0,00 para a rodada MAIS CARA. Como jobs que estouram
 * cota são exatamente os caros, o painel subcontava de forma sistemática e enviesada.
 */
describe("RunnerClaude — contabilidade parcial de job cortado", () => {
  /** Uma volta de API do SDK, com o `usage` que ela reporta. */
  const volta = (id: string, modelo: string, u: Record<string, number>, texto = "ok") => ({
    type: "assistant",
    message: {
      id,
      model: modelo,
      usage: u,
      content: [{ type: "text", text: texto }],
    },
  });
  const USO = {
    input_tokens: 100,
    output_tokens: 1000,
    cache_read_input_tokens: 500_000,
    cache_creation_input_tokens: 20_000,
  };

  it("estima custo e tokens quando o fluxo é cortado antes do `result`", async () => {
    const runner = new RunnerClaude(
      consultaDe([
        { type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-5" },
        volta("msg_1", "claude-sonnet-5", USO),
        // A cota chega como TEXTO do assistente — é assim que o provedor anuncia.
        {
          type: "assistant",
          message: { content: [{ type: "text", text: "You've hit your session limit · resets 11:30am" }] },
        },
      ]),
    );
    const { ctx } = contexto(new AbortController().signal);

    await expect(runner.executar(jobFake(PARAMS), ctx)).rejects.toMatchObject({
      name: "ErroFluxoClaude",
    });

    const erro = await runner.executar(jobFake(PARAMS), ctx).catch((e) => e);
    const r = erro.resultado;
    // Sem `result` não há custo do SDK — e é exatamente aqui que antes ficava tudo nulo.
    expect(r.custoUsd).toBeNull();
    expect(r.tokens).not.toBeNull();
    expect(r.tokensParciais).toBe(true);
    expect(r.tokens.cacheLeitura).toBe(500_000);
    expect(r.tokens.saida).toBe(1000);
    // Sonnet 5: 500k de leitura de cache a 0,30/M já passa de US$ 0,15.
    expect(r.custoEstimadoUsd).toBeGreaterThan(0.1);
  });

  /**
   * A invariante que mais importa. `sdk.d.ts` avisa, no comentário de
   * `SDKAssistantMessage.timestamp`: "One API assistant turn may produce several assistant
   * messages sharing a message.id". O `usage` de cada uma é o da VOLTA inteira — somar
   * mensagem a mensagem multiplicaria a conta pelo número de blocos, e o erro seria para
   * CIMA, que é o pior lado: inventa um gasto que não existe e manda otimizar fantasma.
   */
  it("NÃO conta em dobro quando o SDK reparte uma volta em várias mensagens", async () => {
    const runner = new RunnerClaude(
      consultaDe([
        { type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-5" },
        volta("msg_1", "claude-sonnet-5", USO, "primeiro bloco"),
        volta("msg_1", "claude-sonnet-5", USO, "segundo bloco da MESMA volta"),
        volta("msg_1", "claude-sonnet-5", USO, "terceiro bloco da MESMA volta"),
        {
          type: "assistant",
          message: { content: [{ type: "text", text: "You've hit your usage limit" }] },
        },
      ]),
    );
    const { ctx } = contexto(new AbortController().signal);
    const erro = await runner.executar(jobFake(PARAMS), ctx).catch((e) => e);

    // Uma volta só, por mais que tenham chegado três mensagens.
    expect(erro.resultado.tokens.cacheLeitura).toBe(500_000);
    expect(erro.resultado.numTurnos).toBe(1);
  });

  it("soma voltas distintas e separa por modelo (subagente tem modelo próprio)", async () => {
    const runner = new RunnerClaude(
      consultaDe([
        { type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-5" },
        volta("msg_1", "claude-sonnet-5", USO),
        volta("msg_2", "claude-sonnet-5", USO),
        volta("msg_3", "claude-haiku-4-5-20251001", USO),
        { type: "assistant", message: { content: [{ type: "text", text: "usage limit reached" }] } },
      ]),
    );
    const { ctx } = contexto(new AbortController().signal);
    const erro = await runner.executar(jobFake(PARAMS), ctx).catch((e) => e);
    const t = erro.resultado.tokens;

    expect(erro.resultado.numTurnos).toBe(3);
    expect(t.cacheLeitura).toBe(1_500_000);
    expect(Object.keys(t.porModelo).sort()).toEqual([
      "claude-haiku-4-5-20251001",
      "claude-sonnet-5",
    ]);
    // Haiku é ~1/3 do preço do Sonnet: separar por modelo é o que impede a estimativa de
    // cobrar tudo na tarifa mais cara.
    expect(t.porModelo["claude-sonnet-5"].cacheLeitura).toBe(1_000_000);
  });

  it("o `result` continua VENCENDO a estimativa quando chega", async () => {
    const runner = new RunnerClaude(
      consultaDe([
        { type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-5" },
        volta("msg_1", "claude-sonnet-5", USO),
        {
          type: "result",
          subtype: "success",
          is_error: false,
          total_cost_usd: 0.42,
          num_turns: 1,
          result: "pronto",
          modelUsage: {
            "claude-sonnet-5": {
              inputTokens: 100,
              outputTokens: 1000,
              cacheReadInputTokens: 500_000,
              cacheCreationInputTokens: 20_000,
              costUSD: 0.42,
            },
          },
        },
      ]),
    );
    const { ctx } = contexto(new AbortController().signal);
    const r = await runner.executar(jobFake(PARAMS), ctx);

    expect(r.custoUsd).toBe(0.42);
    expect(r.tokensParciais).toBeUndefined();
    // A estimativa segue calculada — é ela que confere a tabela de preços de graça.
    expect(r.custoEstimadoUsd).toBeGreaterThan(0);
  });

  it("mensagem de cota deixa de dizer 'nada foi entregue' quando houve trabalho", async () => {
    const runner = new RunnerClaude(
      consultaDe([
        { type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-5" },
        {
          type: "assistant",
          message: {
            id: "msg_1",
            model: "claude-sonnet-5",
            usage: USO,
            content: [{ type: "tool_use", name: "Edit" }],
          },
        },
        { type: "assistant", message: { content: [{ type: "text", text: "You've hit your session limit" }] } },
      ]),
    );
    const { ctx } = contexto(new AbortController().signal);
    const erro = await runner.executar(jobFake(PARAMS), ctx).catch((e) => e);

    expect(erro.message).not.toContain("Nada foi entregue");
    expect(erro.message).toContain("chamada(s) de ferramenta");
    expect(erro.message).toContain("CONFIRA");
  });

});

/**
 * A atribuição por agente foi construída contra o SDK FALSO. Se as formas reais divergirem
 * ela não quebra — atribui tudo ao orquestrador e produz um rateio plausível e ERRADO.
 * Mesma família do `effort` com nome errado: falha silenciosa que parece sucesso.
 */
describe("RunnerClaude — rateio por agente e sua auto-verificação", () => {
  const USO = {
    input_tokens: 100,
    output_tokens: 500,
    cache_read_input_tokens: 200_000,
    cache_creation_input_tokens: 10_000,
  };
  const despacho = (id: string, agente: string) => ({
    type: "assistant",
    message: {
      id: `msg_${id}`,
      model: "claude-sonnet-5",
      usage: USO,
      content: [{ type: "tool_use", id, name: "Agent", input: { subagent_type: agente } }],
    },
  });
  const doSubagente = (msgId: string, pai: string, modelo = "claude-sonnet-5") => ({
    type: "assistant",
    parent_tool_use_id: pai,
    message: {
      id: msgId,
      model: modelo,
      usage: USO,
      content: [{ type: "tool_use", id: `t_${msgId}`, name: "Read" }],
    },
  });

  it("atribui o consumo ao subagente que o gastou, não ao orquestrador", async () => {
    const runner = new RunnerClaude(
      consultaDe([
        { type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-5" },
        despacho("tu_1", "revisor"),
        doSubagente("m1", "tu_1"),
        doSubagente("m2", "tu_1"),
        { type: "result", is_error: false, total_cost_usd: 1, num_turns: 3, result: "ok" },
      ]),
    );
    const { ctx } = contexto(new AbortController().signal);
    const r = await runner.executar(jobFake(PARAMS), ctx);

    const porAgente = r.tokens?.porAgente ?? {};
    expect(Object.keys(porAgente).sort()).toEqual(["orquestrador", "revisor"]);
    // Duas voltas do subagente, uma do orquestrador (a que despachou).
    expect(porAgente["revisor"]?.voltas).toBe(2);
    expect(porAgente["revisor"]?.ferramentas).toBe(2);
    expect(porAgente["revisor"]?.despachos).toBe(1);
    expect(porAgente["orquestrador"]?.voltas).toBe(1);
  });

  /**
   * O BUG DE 16/08, corrigido em 22/08: a agregação por agente somava num objeto
   * PERSISTENTE, e o runner chama `fechar()` a cada mensagem para conferir o teto de custo.
   * Cada passada resomava todas as voltas já vistas — o consumo de um agente saía
   * multiplicado pelo número de mensagens que chegaram depois da primeira dele, e a
   * PROPORÇÃO entre agentes (que é para o que a faixa serve) ia junto. Na tela, o job
   * `9ba81214` mostrava o orquestrador com 122M de cache lido num job cujo real foi 4,4M.
   *
   * O teste roda o MESMO fluxo com e sem teto: com teto, `fechar()` é chamado a cada
   * mensagem; sem teto, uma vez só. As duas leituras têm de bater.
   */
  it("com teto de custo (fechar() a cada mensagem) o rateio por agente NÃO infla", async () => {
    const mensagens = [
      { type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-5" },
      despacho("tu_1", "revisor"),
      doSubagente("m1", "tu_1"),
      doSubagente("m2", "tu_1"),
      doSubagente("m3", "tu_1"),
      { type: "result", is_error: false, num_turns: 4, result: "ok" },
    ];
    const { ctx } = contexto(new AbortController().signal);
    const comTeto = await new RunnerClaude(consultaDe(mensagens)).executar(
      jobFake({ ...PARAMS, tetoUsd: 999 }),
      ctx,
    );
    const semTeto = await new RunnerClaude(consultaDe(mensagens)).executar(
      jobFake(PARAMS),
      contexto(new AbortController().signal).ctx,
    );

    expect(comTeto.tokens?.porAgente).toEqual(semTeto.tokens?.porAgente);
    // E o valor absoluto é o das voltas de verdade: 3 do subagente, 1 do orquestrador.
    expect(comTeto.tokens?.porAgente?.["revisor"]?.voltas).toBe(3);
    expect(comTeto.tokens?.porAgente?.["revisor"]?.cacheLeitura).toBe(600_000);
    expect(comTeto.tokens?.porAgente?.["orquestrador"]?.voltas).toBe(1);
    // Contador de EVENTO não é reagregado: uma ferramenta por mensagem do filho.
    expect(comTeto.tokens?.porAgente?.["revisor"]?.ferramentas).toBe(3);
    expect(comTeto.tokens?.porAgente?.["revisor"]?.despachos).toBe(1);
  });

  /** A soma por agente tem de fechar com o TOTAL do job — a invariante que a tela promete. */
  it("a soma dos agentes bate com o total do job", async () => {
    const runner = new RunnerClaude(
      consultaDe([
        { type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-5" },
        despacho("tu_1", "revisor"),
        doSubagente("m1", "tu_1"),
        doSubagente("m2", "tu_1"),
        { type: "result", is_error: false, num_turns: 3, result: "ok" },
      ]),
    );
    const { ctx } = contexto(new AbortController().signal);
    const r = await runner.executar(jobFake({ ...PARAMS, tetoUsd: 999 }), ctx);
    const agentes = Object.values(r.tokens?.porAgente ?? {});
    const soma = (campo: "entrada" | "saida" | "cacheLeitura" | "cacheEscrita") =>
      agentes.reduce((t, a) => t + a[campo], 0);

    expect(soma("entrada")).toBe(r.tokens?.entrada);
    expect(soma("saida")).toBe(r.tokens?.saida);
    expect(soma("cacheLeitura")).toBe(r.tokens?.cacheLeitura);
    expect(soma("cacheEscrita")).toBe(r.tokens?.cacheEscrita);
  });

  it("DENUNCIA quando houve despacho e nada foi atribuído a subagente", async () => {
    const runner = new RunnerClaude(
      consultaDe([
        { type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-5" },
        despacho("tu_1", "revisor"),
        // Mensagem do filho SEM `parent_tool_use_id` — simula churn de versão do SDK.
        {
          type: "assistant",
          message: { id: "m1", model: "claude-sonnet-5", usage: USO, content: [{ type: "text", text: "oi" }] },
        },
        { type: "result", is_error: false, total_cost_usd: 1, num_turns: 2, result: "ok" },
      ]),
    );
    const { ctx, eventos } = contexto(new AbortController().signal);
    await runner.executar(jobFake(PARAMS), ctx);

    const textos = eventos
      .filter((e) => e.tipo === "log")
      .map((e) => (e.dados as { texto: string }).texto);
    expect(textos.some((t) => t.includes("Rateio por agente NÃO funcionou"))).toBe(true);
  });

  it("não denuncia quando o job simplesmente não despachou ninguém", async () => {
    const runner = new RunnerClaude(
      consultaDe([
        { type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-5" },
        {
          type: "assistant",
          message: { id: "m1", model: "claude-sonnet-5", usage: USO, content: [{ type: "text", text: "oi" }] },
        },
        { type: "result", is_error: false, total_cost_usd: 1, num_turns: 1, result: "ok" },
      ]),
    );
    const { ctx, eventos } = contexto(new AbortController().signal);
    await runner.executar(jobFake(PARAMS), ctx);
    const textos = eventos
      .filter((e) => e.tipo === "log")
      .map((e) => (e.dados as { texto: string }).texto);
    expect(textos.some((t) => t.includes("Rateio por agente NÃO funcionou"))).toBe(false);
  });
});

/**
 * Regressão da rodada real `c6d8cede` (31/07): 176 voltas somaram 1.642 tokens de SAÍDA — 9
 * por volta, impossível — enquanto a leitura de cache saiu plausível (34k–59k por volta).
 *
 * Causa: a deduplicação por `message.id` guardava a PRIMEIRA mensagem da volta. Entrada e
 * cache já são finais ali (são conhecidos no instante da requisição), mas a saída ainda está
 * sendo gerada. O lado de entrada saía certo e o de saída, zerado — o tipo de erro que passa
 * despercebido porque o número grande continua parecendo razoável.
 */
describe("RunnerClaude — reconciliação de voltas repartidas pelo SDK", () => {
  const parcial = (id: string, saida: number) => ({
    type: "assistant",
    message: {
      id,
      model: "claude-sonnet-5",
      // Entrada/cache constantes na volta; saída cresce a cada pedaço.
      usage: {
        input_tokens: 50,
        output_tokens: saida,
        cache_read_input_tokens: 40_000,
        cache_creation_input_tokens: 1_000,
      },
      content: [{ type: "text", text: "…" }],
    },
  });

  it("fica com a saída FINAL da volta, não com a do primeiro pedaço", async () => {
    const runner = new RunnerClaude(
      consultaDe([
        { type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-5" },
        parcial("msg_1", 12), // primeiro pedaço: quase nada escrito ainda
        parcial("msg_1", 340),
        parcial("msg_1", 900), // volta terminou aqui
        { type: "assistant", message: { content: [{ type: "text", text: "usage limit reached" }] } },
      ]),
    );
    const { ctx } = contexto(new AbortController().signal);
    const erro = await runner.executar(jobFake(PARAMS), ctx).catch((e) => e);
    const t = erro.resultado.tokens;

    expect(t.saida).toBe(900);
    // E o lado de entrada continua contado UMA vez, não três.
    expect(t.cacheLeitura).toBe(40_000);
    expect(t.entrada).toBe(50);
    expect(erro.resultado.numTurnos).toBe(1);
  });

  it("soma voltas distintas e reconcilia dentro de cada uma", async () => {
    const runner = new RunnerClaude(
      consultaDe([
        { type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-5" },
        parcial("msg_1", 10),
        parcial("msg_1", 500),
        parcial("msg_2", 8),
        parcial("msg_2", 700),
        { type: "assistant", message: { content: [{ type: "text", text: "usage limit reached" }] } },
      ]),
    );
    const { ctx } = contexto(new AbortController().signal);
    const erro = await runner.executar(jobFake(PARAMS), ctx).catch((e) => e);

    expect(erro.resultado.tokens.saida).toBe(1200);
    expect(erro.resultado.tokens.cacheLeitura).toBe(80_000);
    expect(erro.resultado.numTurnos).toBe(2);
  });

  it("a saída por volta fica em ordem de grandeza plausível (guarda do sintoma)", async () => {
    const msgs: unknown[] = [
      { type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet-5" },
    ];
    for (let i = 0; i < 20; i++) {
      msgs.push(parcial(`m${i}`, 5), parcial(`m${i}`, 260));
    }
    msgs.push({ type: "assistant", message: { content: [{ type: "text", text: "usage limit reached" }] } });
    const runner = new RunnerClaude(consultaDe(msgs));
    const { ctx } = contexto(new AbortController().signal);
    const erro = await runner.executar(jobFake(PARAMS), ctx).catch((e) => e);
    const t = erro.resultado.tokens;

    // O sintoma que denunciou o bug era saída/volta na casa de UM dígito.
    expect(t.saida / erro.resultado.numTurnos).toBeGreaterThan(100);
  });
});

/**
 * Teto de custo com PARADA LIMPA (I3 de `_sistema/CUSTO_DE_CONTEXTO.md`).
 *
 * Existe porque, dos 55 jobs já rodados pela fábrica, **10 falharam e os 10 falharam por
 * cota** — nenhum por bug. Não havia freio: todo `/trabalhar` corria até a parede da
 * assinatura. E o que parecia ser o freio não era: `maxTurns` limita só o laço do
 * orquestrador, enquanto `num_turns` soma entre os `result` inclusive dos subagentes (jobs
 * somaram 211 e 212 voltas com o teto em 120).
 *
 * A invariante que estes testes travam: **o teto nunca corta agente em voo.** Cortar
 * destrói o que ele não gravou, que é exatamente o desperdício de 30/07 e 01/08 — economia
 * que produz prejuízo não é economia.
 */
describe("RunnerClaude — teto de custo", () => {
  /** Volta cara o bastante para estourar qualquer teto pequeno destes testes. */
  const voltaCara = (id: string) => ({
    type: "assistant",
    message: {
      id,
      model: "claude-sonnet-5",
      content: [{ type: "text", text: "trabalhando" }],
      usage: {
        input_tokens: 10,
        output_tokens: 20_000,
        cache_read_input_tokens: 2_000_000,
        cache_creation_input_tokens: 400_000,
      },
    },
  });
  const despacho = (id: string) => ({
    type: "assistant",
    message: {
      id: `m-${id}`,
      content: [{ type: "tool_use", id, name: "Agent", input: { subagent_type: "executor" } }],
    },
  });
  const resultadoDe = (id: string) => ({
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: id }] },
  });
  const fim = { type: "result", is_error: false, total_cost_usd: 0.5, num_turns: 3 };
  const logsDe = (eventos: readonly { tipo: string; dados?: unknown }[]) =>
    eventos.filter((e) => e.tipo === "log").map((e) => (e.dados as { texto: string }).texto);

  it("sem tetoUsd o fluxo corre até o fim — comportamento antigo preservado", async () => {
    const { ctx } = contexto(new AbortController().signal);
    const r = await new RunnerClaude(
      consultaDe([voltaCara("v1"), voltaCara("v2"), fim]),
    ).executar(jobFake(PARAMS), ctx);
    expect(r.motivo).toBeUndefined();
    expect(r.erro).toBe(false);
  });

  it("estourou o teto com a árvore quieta: encerra, e NÃO é falha", async () => {
    const { ctx, eventos } = contexto(new AbortController().signal);
    const r = await new RunnerClaude(
      consultaDe([voltaCara("v1"), voltaCara("v2"), voltaCara("v3"), fim]),
    ).executar(jobFake({ ...PARAMS, tetoUsd: 0.5 }), ctx);

    // Desfecho PLANEJADO: retorna, não lança. Job fica `concluido` com motivo próprio.
    expect(r.motivo).toBe("teto-custo");
    expect(r.erro).toBe(false);
    expect(logsDe(eventos).some((t) => t.includes("parada limpa"))).toBe(true);
  });

  // O coração da coisa: com agente trabalhando, o teto AVISA e espera.
  it("teto estourado com agente em voo NÃO corta — espera o tool_result", async () => {
    const { ctx, eventos } = contexto(new AbortController().signal);
    const r = await new RunnerClaude(
      consultaDe([
        despacho("tu_1"),
        voltaCara("v1"),
        voltaCara("v2"),
        voltaCara("v3"),
        resultadoDe("tu_1"),
        fim,
      ]),
    ).executar(jobFake({ ...PARAMS, tetoUsd: 0.5 }), ctx);

    // O agente terminou (tool_result veio) antes de o fluxo encerrar: nada foi abandonado.
    expect(r.despachosEmVoo).toBe(0);
    const textos = logsDe(eventos);
    expect(textos.some((t) => t.includes("ainda trabalhando"))).toBe(true);
    expect(textos.some((t) => t.includes("TRABALHO ABANDONADO"))).toBe(false);
  });

  it("avisa uma vez por motivo, não a cada volta", async () => {
    const { ctx, eventos } = contexto(new AbortController().signal);
    await new RunnerClaude(
      consultaDe([despacho("tu_1"), voltaCara("v1"), voltaCara("v2"), voltaCara("v3"), fim]),
    ).executar(jobFake({ ...PARAMS, tetoUsd: 0.5 }), ctx);
    const avisos = logsDe(eventos).filter((t) => t.startsWith("Orçamento:"));
    expect(avisos.length).toBeLessThanOrEqual(2);
  });

  // Teto torto é entrada externa (passa pelo disco em `dados/`): não pode virar NaN, que
  // compararia sempre falso e desligaria o freio em silêncio.
  it("teto inválido é ignorado em vez de virar freio quebrado", async () => {
    for (const teto of [0, -1, Number.NaN, "muito", null]) {
      const { ctx } = contexto(new AbortController().signal);
      const r = await new RunnerClaude(consultaDe([voltaCara("v1"), fim])).executar(
        jobFake({ ...PARAMS, tetoUsd: teto }),
        ctx,
      );
      expect(r.motivo).toBeUndefined();
    }
  });
});

/**
 * Prefixo cacheável entre despachos (I2 de `_sistema/CUSTO_DE_CONTEXTO.md`).
 *
 * O preset do Claude Code carrega seções que mudam por sessão — diretório de trabalho,
 * git status, caminho de memória. Como o git status muda a CADA commit de tarefa, o
 * prefixo do systemPrompt nunca se repetia entre despachos e o cache não tinha o que
 * reaproveitar: cada agente pagava ESCRITA (17,5× o preço da leitura) pelo mesmo conteúdo.
 *
 * O teste olha para as `options` porque as falhas desta família são todas MUDAS nesta base:
 * `outputConfig.effort` com nome inexistente, `watchdogMs` que ninguém lia, `canUseTool`
 * desligado no modo padrão. Nos três, tudo compilava e a economia simplesmente não
 * acontecia.
 */
describe("RunnerClaude — prefixo cacheável", () => {
  it("pede o preset SEM as seções dinâmicas, com os nomes exatos do SDK", async () => {
    let opcoes: Record<string, unknown> | undefined;
    await new RunnerClaude(
      consultaDe([{ type: "result", is_error: false }], (o) => (opcoes = o)),
    ).executar(jobFake(PARAMS), contexto(new AbortController().signal).ctx);

    expect(opcoes?.["systemPrompt"]).toEqual({
      type: "preset",
      preset: "claude_code",
      excludeDynamicSections: true,
    });
  });
});

/**
 * RETOMADA (16/08) — o `resume` do SDK.
 *
 * Estes testes olham para o objeto `options` que CHEGA ao SDK, e não para os params, pela
 * mesma razão dos testes de `effort` acima: opção com nome errado é ignorada em silêncio, e
 * aqui o sintoma seria pior que caro — seria o fluxo recomeçar do zero com cara de retomada,
 * ou seja, exatamente o desperdício que o botão existe para evitar.
 */
describe("retomada de sessão — options.resume", () => {
  it("passa `resume` ao SDK quando o job traz `retomarSessao`", async () => {
    let opcoes: Record<string, unknown> | undefined;
    const runner = new RunnerClaude(
      consultaDe([{ type: "result", is_error: false }], (o) => (opcoes = o)),
    );
    const { ctx } = contexto(new AbortController().signal);
    await runner.executar(jobFake({ ...PARAMS, retomarSessao: "sess-abc" }), ctx);
    expect(opcoes?.["resume"]).toBe("sess-abc");
  });

  it("job normal NÃO manda resume — retomar sem pedir seria continuar conversa alheia", async () => {
    let opcoes: Record<string, unknown> | undefined;
    const runner = new RunnerClaude(
      consultaDe([{ type: "result", is_error: false }], (o) => (opcoes = o)),
    );
    const { ctx } = contexto(new AbortController().signal);
    await runner.executar(jobFake(PARAMS), ctx);
    expect(opcoes).not.toHaveProperty("resume");
  });

  it("sessão vazia ou de tipo errado vira SEM retomada, nunca um resume com lixo", async () => {
    for (const torto of ["", "   ", 42, null]) {
      let opcoes: Record<string, unknown> | undefined;
      const runner = new RunnerClaude(
        consultaDe([{ type: "result", is_error: false }], (o) => (opcoes = o)),
      );
      const { ctx } = contexto(new AbortController().signal);
      await runner.executar(jobFake({ ...PARAMS, retomarSessao: torto }), ctx);
      expect(opcoes).not.toHaveProperty("resume");
    }
  });
});

/**
 * TETO DE CUSTO no runner de fluxo único (16/08). A decisão mudou de
 * `pipeline/orcamento.ts` para `claude/orcamento-fluxo.ts`; o que estes testes travam é o
 * CONSUMO — a régua nova precisa estar realmente ligada, senão é mais um campo que ninguém
 * lê. Ver a tabela de medição no cabeçalho de `orcamento-fluxo.ts`.
 */
describe("teto de custo do fluxo — silêncio no começo, aviso perto do fim", () => {
  /** Uma volta com uso alto o bastante para estourar qualquer teto pequeno. */
  const VOLTA_CARA = {
    type: "assistant",
    message: {
      id: "m1",
      model: "claude-sonnet-5",
      usage: { input_tokens: 10, output_tokens: 200_000, cache_read_input_tokens: 0 },
      content: [{ type: "text", text: "trabalhando" }],
    },
  };

  it("gasto pequeno sob o teto do /ideia não produz linha de orçamento nenhuma", async () => {
    const barata = {
      type: "assistant",
      message: {
        id: "m1",
        model: "claude-sonnet-5",
        usage: { input_tokens: 10, output_tokens: 50, cache_read_input_tokens: 100 },
        content: [{ type: "text", text: "oi" }],
      },
    };
    const runner = new RunnerClaude(consultaDe([barata, { type: "result", is_error: false }]));
    const { ctx, eventos } = contexto(new AbortController().signal);
    await runner.executar(jobFake({ ...PARAMS, tetoUsd: 6 }), ctx);

    const orcamento = eventos.filter((e) =>
      String((e.dados as { texto?: string } | undefined)?.texto ?? "").startsWith("Orçamento:"),
    );
    expect(orcamento).toEqual([]);
  });

  it("estourar o teto encerra limpo e o resultado diz `teto-custo`", async () => {
    const runner = new RunnerClaude(consultaDe([VOLTA_CARA, { type: "result", is_error: false }]));
    const { ctx } = contexto(new AbortController().signal);
    const r = await runner.executar(jobFake({ ...PARAMS, tetoUsd: 0.5 }), ctx);
    expect((r as { motivo?: string }).motivo).toBe("teto-custo");
  });
});
