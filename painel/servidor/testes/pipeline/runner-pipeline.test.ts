import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { RunnerPipeline } from "../../src/pipeline/runner-pipeline.js";
import { limparCacheAgentes } from "../../src/pipeline/prompts-agente.js";
import type { Consulta } from "../../src/jobs/claude/runner-claude.js";
import type { ContextoExecucao, Job } from "../../src/jobs/tipos.js";

/**
 * Teste de INTEGRAÇÃO do pipeline em código: fábrica falsa em pasta temporária, SDK falso.
 *
 * É o teste que faltava no desenho antigo. O orquestrador-modelo não podia ser exercitado
 * sem gastar a assinatura, então o laço inteiro rodava sem cobertura — e foi exatamente
 * ali que a fábrica perdeu trabalho duas vezes (30/07 e 01/08), nos dois casos com o job
 * marcado como sucesso. Aqui o laço é código, e código se testa.
 */

/** SDK falso: cada `query()` age como o agente agiria — grava o status e devolve `result`. */
function sdkFalso(
  aoDespachar: (prompt: string) => void,
  opcoes: { falharNa?: number; custoPorEtapa?: number } = {},
): { consulta: Consulta; opcoesVistas: Record<string, unknown>[] } {
  let n = 0;
  const opcoesVistas: Record<string, unknown>[] = [];
  const consulta: Consulta = (args) => {
    n += 1;
    opcoesVistas.push(args.options as Record<string, unknown>);
    aoDespachar(String(args.prompt));
    const falhar = opcoes.falharNa === n;
    return (async function* () {
      yield {
        type: "assistant",
        message: {
          id: `m${n}`,
          model: "claude-sonnet-5",
          content: [{ type: "tool_use", name: "Read" }],
          usage: { input_tokens: 5, output_tokens: 500, cache_read_input_tokens: 20_000, cache_creation_input_tokens: 4_000 },
        },
      };
      if (!falhar) {
        yield {
          type: "result",
          is_error: false,
          total_cost_usd: opcoes.custoPorEtapa ?? 0.2,
          num_turns: 3,
        };
      }
    })();
  };
  return { consulta, opcoesVistas };
}

function contexto() {
  const eventos: { tipo: string; dados?: unknown }[] = [];
  const ctx: ContextoExecucao = {
    emitir: (tipo, dados) => eventos.push({ tipo, dados }),
    sinal: new AbortController().signal,
    pedirInput: async () => ({}),
    anotar: () => {},
  };
  const logs = () =>
    eventos.filter((e) => e.tipo === "log").map((e) => (e.dados as { texto: string }).texto);
  return { ctx, eventos, logs };
}

const AGENTES = ["executor", "executor-reforcado", "testador", "revisor", "planejador", "documentador"];

function fabricaFalsa(tarefas: { nome: string; conteudo: string }[], equipe?: object): string {
  const raiz = mkdtempSync(join(tmpdir(), "pipe-"));
  mkdirSync(join(raiz, ".claude", "agents"), { recursive: true });
  for (const nome of AGENTES) {
    writeFileSync(
      join(raiz, ".claude", "agents", `${nome}.md`),
      [
        "---",
        `name: ${nome}`,
        "description: agente de teste",
        "tools: Read, Edit, Bash",
        `model: ${nome === "testador" ? "haiku" : "inherit"}`,
        "---",
        "",
        `Você é o ${nome.toUpperCase()} de teste.`,
        "",
      ].join("\n"),
      "utf8",
    );
  }

  const proj = join(raiz, "projetos", "app");
  mkdirSync(join(proj, "_gestao", "tarefas"), { recursive: true });
  writeFileSync(join(proj, "CLAUDE.md"), "# app\nStack: Node.\n", "utf8");
  writeFileSync(join(proj, "_gestao", "MAPA.md"), "# MAPA — app\n\n<!-- GERADO por x. HEAD: a1 · 2026-08-02 -->\n\n## Árvore\n", "utf8");
  if (equipe !== undefined) {
    writeFileSync(join(proj, "_gestao", "equipe.json"), JSON.stringify(equipe), "utf8");
  }
  for (const t of tarefas) {
    writeFileSync(join(proj, "_gestao", "tarefas", t.nome), t.conteudo, "utf8");
  }
  return raiz;
}

function tarefaMd(p: { id: string; status: string; deps?: string[]; tentativas?: number; criterios?: string }): string {
  return [
    "---",
    `id: ${p.id}`,
    `titulo: Tarefa ${p.id}`,
    `status: ${p.status}`,
    "prioridade: alta",
    `dependencias: [${(p.deps ?? []).join(", ")}]`,
    "areas: [src/a.js]",
    `tentativas: ${p.tentativas ?? 0}`,
    "criada: 2026-08-01",
    "atualizada: 2026-08-01",
    "---",
    "",
    "## Objetivo",
    "Fazer.",
    "",
    "## Critérios de aceite",
    p.criterios ?? "- [ ] funciona",
    "",
    "## Notas de execução",
    "",
    "## Verificação",
    "",
    "## Revisão",
    "",
  ].join("\n");
}

/** Avança o status no disco como o agente real faria ao cumprir seu contrato. */
function agenteGravaStatus(raiz: string, arquivo: string): void {
  const caminho = join(raiz, "projetos", "app", "_gestao", "tarefas", arquivo);
  const texto = readFileSync(caminho, "utf8");
  const proximo: Record<string, string> = {
    pronta: "em-teste",
    "em-execucao": "em-teste",
    "em-teste": "em-revisao",
    "em-revisao": "concluida",
  };
  const atual = /status:\s*(\S+)/.exec(texto)?.[1] ?? "";
  writeFileSync(caminho, texto.replace(/status:\s*\S+/, `status: ${proximo[atual] ?? "concluida"}`), "utf8");
}

function job(params: Record<string, unknown>): Job {
  return {
    id: "j1",
    tipo: "pipeline",
    titulo: "/trabalhar app",
    escopo: "projeto:app",
    usaClaude: true,
    params,
    estado: "executando",
    criadoEm: new Date().toISOString(),
  };
}


/**
 * Vigilância de processos FALSA — o mesmo motivo do SDK falso.
 *
 * A real sobe um PowerShell para ler `Win32_Process`: ~5s medidos nesta máquina, duas vezes
 * por `executar()`, contra um `testTimeout` de 15s. Era o que fazia este arquivo inteiro
 * estourar quando a máquina ficava ocupada — sintoma que parecia flakiness e não era.
 * A decisão de matar processo continua coberta por `coleta-processos.test.ts`.
 */
function vigiaFalso() {
  return {
    criar: () => ({
      iniciar: () => {},
      parar: () => {},
      amostrar: async () => {},
      observados: new Set<number>() as ReadonlySet<number>,
    }),
    coletar: async () => ({ recolhidos: 0, detalhes: [] }),
  };
}

beforeEach(() => limparCacheAgentes());

describe("RunnerPipeline — ciclo completo sem orquestrador-modelo", () => {
  it("leva uma tarefa de pronta a concluída, com os três agentes na ordem", async () => {
    const raiz = fabricaFalsa([{ nome: "T-001-x.md", conteudo: tarefaMd({ id: "T-001", status: "pronta" }) }]);
    const { consulta } = sdkFalso(() => agenteGravaStatus(raiz, "T-001-x.md"));
    const { ctx } = contexto();

    const r = await new RunnerPipeline(consulta, vigiaFalso()).executar(
      job({ raiz, projeto: "app", modelo: "sonnet" }),
      ctx,
    );

    expect(r.despachos).toBe(3);
    expect(r.tarefasConcluidas).toEqual(["T-001"]);
    expect(r.encerrouPor).toBe("sem-trabalho");
    expect(readFileSync(join(raiz, "projetos/app/_gestao/tarefas/T-001-x.md"), "utf8")).toContain(
      "status: concluida",
    );
  });

  it("promove backlog quando a dependência fecha — e é o PAINEL que grava", async () => {
    const raiz = fabricaFalsa([
      { nome: "T-001-x.md", conteudo: tarefaMd({ id: "T-001", status: "pronta" }) },
      { nome: "T-002-y.md", conteudo: tarefaMd({ id: "T-002", status: "backlog", deps: ["T-001"] }) },
    ]);
    let alvo = "T-001-x.md";
    const { consulta } = sdkFalso((prompt) => {
      alvo = prompt.includes("T-002") ? "T-002-y.md" : "T-001-x.md";
      agenteGravaStatus(raiz, alvo);
    });
    const { ctx } = contexto();

    const r = await new RunnerPipeline(consulta, vigiaFalso()).executar(
      job({ raiz, projeto: "app", modelo: "sonnet" }),
      ctx,
    );
    expect(r.promovidas).toContain("T-002");
    expect(r.tarefasConcluidas).toEqual(expect.arrayContaining(["T-001", "T-002"]));
  });

  /**
   * A propriedade que este desenho ganha DE GRAÇA e que motivou a troca: sem a ferramenta
   * `Agent`, a regra "subagentes não criam subagentes" deixa de depender do prompt. O bug
   * de 30/07 e 01/08 (agente abandonado em voo) fica impossível por construção.
   */
  it("nenhuma etapa recebe a ferramenta de despachar subagente", async () => {
    const raiz = fabricaFalsa([{ nome: "T-001-x.md", conteudo: tarefaMd({ id: "T-001", status: "pronta" }) }]);
    const { consulta, opcoesVistas } = sdkFalso(() => agenteGravaStatus(raiz, "T-001-x.md"));
    await new RunnerPipeline(consulta, vigiaFalso()).executar(job({ raiz, projeto: "app", modelo: "sonnet" }), contexto().ctx);

    expect(opcoesVistas.length).toBeGreaterThan(0);
    for (const o of opcoesVistas) {
      const tools = o["allowedTools"] as string[];
      expect(tools).not.toContain("Agent");
      expect(tools).not.toContain("Task");
    }
  });

  it("usa o modelo do arquivo do agente (testador em haiku) e o do fluxo nos demais", async () => {
    const raiz = fabricaFalsa([{ nome: "T-001-x.md", conteudo: tarefaMd({ id: "T-001", status: "pronta" }) }]);
    const { consulta, opcoesVistas } = sdkFalso(() => agenteGravaStatus(raiz, "T-001-x.md"));
    await new RunnerPipeline(consulta, vigiaFalso()).executar(job({ raiz, projeto: "app", modelo: "sonnet" }), contexto().ctx);

    expect(opcoesVistas.map((o) => o["model"])).toEqual(["sonnet", "haiku", "sonnet"]);
  });

  // I2: o prefixo só é reaproveitável se for idêntico entre etapas.
  it("todas as etapas usam o MESMO systemPrompt e as MESMAS ferramentas", async () => {
    const raiz = fabricaFalsa([{ nome: "T-001-x.md", conteudo: tarefaMd({ id: "T-001", status: "pronta" }) }]);
    const { consulta, opcoesVistas } = sdkFalso(() => agenteGravaStatus(raiz, "T-001-x.md"));
    await new RunnerPipeline(consulta, vigiaFalso()).executar(job({ raiz, projeto: "app", modelo: "sonnet" }), contexto().ctx);

    const sistemas = new Set(opcoesVistas.map((o) => JSON.stringify(o["systemPrompt"])));
    const ferramentas = new Set(opcoesVistas.map((o) => JSON.stringify(o["allowedTools"])));
    expect(sistemas.size).toBe(1);
    expect(ferramentas.size).toBe(1);
    expect(JSON.parse([...sistemas][0] as string)).toEqual({
      type: "preset",
      preset: "claude_code",
      excludeDynamicSections: true,
    });
  });

  // I4: o revisor julga o diff; carregar o projeto em volta dele era gasto puro.
  it("a mensagem do construtor embute o fonte das areas; a do revisor NÃO", async () => {
    const raiz = fabricaFalsa([{ nome: "T-001-x.md", conteudo: tarefaMd({ id: "T-001", status: "pronta" }) }]);
    mkdirSync(join(raiz, "projetos", "app", "src"), { recursive: true });
    writeFileSync(join(raiz, "projetos", "app", "src", "a.js"), "export const MARCA_DO_FONTE = 1;\n", "utf8");

    const prompts: string[] = [];
    const { consulta } = sdkFalso((p) => {
      prompts.push(p);
      agenteGravaStatus(raiz, "T-001-x.md");
    });
    await new RunnerPipeline(consulta, vigiaFalso()).executar(job({ raiz, projeto: "app", modelo: "sonnet" }), contexto().ctx);

    expect(prompts[0]).toContain("MARCA_DO_FONTE"); // construtor
    expect(prompts[2]).not.toContain("MARCA_DO_FONTE"); // revisor
  });

  it("o bloco compartilhado (MAPA + CLAUDE.md) abre TODAS as mensagens, sem o cabeçalho volátil", async () => {
    const raiz = fabricaFalsa([{ nome: "T-001-x.md", conteudo: tarefaMd({ id: "T-001", status: "pronta" }) }]);
    const prompts: string[] = [];
    const { consulta } = sdkFalso((p) => {
      prompts.push(p);
      agenteGravaStatus(raiz, "T-001-x.md");
    });
    await new RunnerPipeline(consulta, vigiaFalso()).executar(job({ raiz, projeto: "app", modelo: "sonnet" }), contexto().ctx);

    for (const p of prompts) {
      expect(p.startsWith("<contexto-projeto>")).toBe(true);
      // O hash/data do MAPA mudam a cada commit: se vazassem, o cache nunca casaria.
      expect(p).not.toContain("HEAD: a1");
    }
  });
});

describe("RunnerPipeline — desfechos", () => {
  // Falha de etapa tira a TAREFA da rodada, não a rodada. Numa rodada real o testador
  // morreu com erro de processo e o laço encerrava, levando junto tarefas sem relação.
  it("etapa que não devolve result tira a tarefa da rodada, sem derrubar as outras", async () => {
    const raiz = fabricaFalsa([{ nome: "T-001-x.md", conteudo: tarefaMd({ id: "T-001", status: "pronta" }) }]);
    const { consulta } = sdkFalso(() => agenteGravaStatus(raiz, "T-001-x.md"), { falharNa: 2 });
    const r = await new RunnerPipeline(consulta, vigiaFalso()).executar(
      job({ raiz, projeto: "app", modelo: "sonnet" }),
      contexto().ctx,
    );
    expect(r.etapasFalhas.map((e) => e.tarefa)).toContain("T-001");
    expect(r.encerrouPor).toBe("sem-trabalho");
  });

  /**
   * A METADE FALTANTE da medida de critérios. O relatório sabia dizer "N critérios resolvidos
   * por comando" e não sabia dizer "nesta tarefa a máquina não decidiu nada" — e foi assim que
   * a Fase 6 do banco-imobiliario rodou com 27 critérios e zero `verificar:`, com o número
   * simpático em cima e o portão do meio vazio embaixo.
   */
  it("tarefa sem nenhum `verificar:` é denunciada no relatório e no log", async () => {
    const raiz = fabricaFalsa([
      {
        nome: "T-001-x.md",
        conteudo: tarefaMd({
          id: "T-001",
          status: "pronta",
          criterios: ["- [ ] a tela fica bonita", "- [ ] o botão parece clicável"].join("\n"),
        }),
      },
    ]);
    const { consulta } = sdkFalso(() => agenteGravaStatus(raiz, "T-001-x.md"));
    const ctxLog = contexto();
    const r = await new RunnerPipeline(consulta, vigiaFalso()).executar(
      job({ raiz, projeto: "app", modelo: "sonnet" }),
      ctxLog.ctx,
    );

    expect(r.texto).toContain("SEM nenhum `verificar:`");
    expect(r.texto).toContain("T-001 (2)");
    // Precisa dizer DE QUEM é o conserto: construtor nenhum resolve critério mal escrito.
    expect(r.texto).toMatch(/replanejamento/i);
    expect(ctxLog.logs().some((l) => l.includes("julgamento puro"))).toBe(true);
  });

  it("teto de custo encerra de forma planejada, com o que foi feito preservado", async () => {
    const raiz = fabricaFalsa([
      { nome: "T-001-x.md", conteudo: tarefaMd({ id: "T-001", status: "pronta" }) },
      { nome: "T-002-y.md", conteudo: tarefaMd({ id: "T-002", status: "pronta" }) },
    ]);
    const { consulta } = sdkFalso(
      (p) => agenteGravaStatus(raiz, p.includes("T-002") ? "T-002-y.md" : "T-001-x.md"),
      { custoPorEtapa: 3 },
    );
    const r = await new RunnerPipeline(consulta, vigiaFalso()).executar(
      job({ raiz, projeto: "app", modelo: "sonnet", tetoUsd: 4 }),
      contexto().ctx,
    );
    expect(r.encerrouPor).toBe("orcamento");
    expect(r.texto).toContain("TETO DE CUSTO");
  });

  /**
   * Replanejar é AUTOMÁTICO — a constituição já define a autocorreção "uma vez por
   * linhagem". A versão anterior deste teste travava o oposto (parar e pedir julgamento), e
   * isso contrariava o objetivo do projeto: colocar para rodar e o sistema se organizar.
   * Quem decide se replaneja é a regra; o que o modelo faz é o replanejamento em si.
   */
  it("tarefa esgotada é replanejada SOZINHA, sem parar para perguntar", async () => {
    const raiz = fabricaFalsa([
      { nome: "T-001-x.md", conteudo: tarefaMd({ id: "T-001", status: "pronta", tentativas: 4 }) },
    ]);
    const despachados: string[] = [];
    const { consulta } = sdkFalso((p) => {
      if (p.includes("PLANEJADOR")) despachados.push("planejador");
    });
    const r = await new RunnerPipeline(consulta, vigiaFalso()).executar(
      job({ raiz, projeto: "app", modelo: "sonnet" }),
      contexto().ctx,
    );
    expect(r.paraReplanejar).toContain("T-001");
    expect(despachados).toContain("planejador");
    expect(r.texto).toContain("Replanejadas automaticamente");
    expect(r.texto).not.toContain("PRECISA DE JULGAMENTO");
  });

  it("projeto sem tarefa despachável não gasta nada", async () => {
    const raiz = fabricaFalsa([
      { nome: "T-001-x.md", conteudo: tarefaMd({ id: "T-001", status: "concluida" }) },
    ]);
    let chamou = 0;
    const { consulta } = sdkFalso(() => {
      chamou += 1;
    });
    const r = await new RunnerPipeline(consulta, vigiaFalso()).executar(
      job({ raiz, projeto: "app", modelo: "sonnet" }),
      contexto().ctx,
    );
    expect(chamou).toBe(0);
    expect(r.despachos).toBe(0);
  });
});

describe("RunnerPipeline — trilha e especialistas", () => {
  it("especialista do equipe.json chega como prompt COLADO no agente genérico", async () => {
    const raiz = fabricaFalsa(
      [{ nome: "T-001-x.md", conteudo: tarefaMd({ id: "T-001", status: "pronta" }).replace("tentativas: 0", "tentativas: 0\nagente: engine") }],
      {
        dominio: "software",
        agentes: [{ id: "engine", nome: "Engine", descricao: "motor", prompt: "SOU O ESPECIALISTA EM MOTOR." }],
      },
    );
    const prompts: string[] = [];
    const { consulta } = sdkFalso((p) => {
      prompts.push(p);
      agenteGravaStatus(raiz, "T-001-x.md");
    });
    await new RunnerPipeline(consulta, vigiaFalso()).executar(job({ raiz, projeto: "app", modelo: "sonnet" }), contexto().ctx);

    expect(prompts[0]).toContain("EXECUTOR de teste");
    expect(prompts[0]).toContain("SOU O ESPECIALISTA EM MOTOR.");
  });

  it("params inválidos falham cedo, com mensagem clara", async () => {
    const r = new RunnerPipeline(sdkFalso(() => {}).consulta, vigiaFalso());
    await expect(r.executar(job({ raiz: "", projeto: "app", modelo: "x" }), contexto().ctx)).rejects.toThrow(/raiz/);
    await expect(r.executar(job({ raiz: "C:/f", projeto: "../fora", modelo: "x" }), contexto().ctx)).rejects.toThrow(/projeto/);
    await expect(r.executar(job({ raiz: "C:/f", projeto: "app", modelo: "" }), contexto().ctx)).rejects.toThrow(/modelo/);
  });
});
