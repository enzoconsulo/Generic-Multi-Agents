import { describe, expect, it } from "vitest";
import { custoPorTarefa, retratoDeCusto } from "../src/lib/custo-tarefas";
import type { Job } from "../src/lib/tipos";

/** Job de pipeline mínimo, com a contabilidade que o motor grava a partir da T-060. */
function job(resultado: unknown, id = "j1"): Job {
  return {
    id,
    tipo: "pipeline",
    titulo: "/trabalhar proj",
    escopo: "projeto:proj",
    usaClaude: true,
    params: {},
    estado: "concluido",
    criadoEm: "2026-08-09T00:00:00.000Z",
    resultado,
  } as Job;
}

function contabilidade(p: {
  tarefa: string;
  custoUsd: number;
  despachos?: number;
  retrabalhoUsd?: number;
  retrabalhoDespachos?: number;
  naturezas?: string[];
  concluiu?: boolean;
}) {
  return {
    tarefa: p.tarefa,
    custoUsd: p.custoUsd,
    despachos: p.despachos ?? 3,
    retrabalhoUsd: p.retrabalhoUsd ?? 0,
    retrabalhoDespachos: p.retrabalhoDespachos ?? 0,
    naturezas: p.naturezas ?? [],
    concluiu: p.concluiu ?? true,
  };
}

describe("custoPorTarefa — somar a mesma tarefa ao longo dos jobs", () => {
  /**
   * O caso que motivou a fase: a T-030 atravessou CINCO jobs, e é por isso que ninguém
   * conseguia dizer quanto ela tinha custado sem abrir os JSONs à mão.
   */
  it("soma a mesma tarefa em jobs diferentes", () => {
    const jobs = [
      job({ custoPorTarefa: [contabilidade({ tarefa: "T-030", custoUsd: 3.38, concluiu: false })] }, "j1"),
      job({ custoPorTarefa: [contabilidade({ tarefa: "T-030", custoUsd: 3.22, concluiu: false })] }, "j2"),
      job({ custoPorTarefa: [contabilidade({ tarefa: "T-030", custoUsd: 1.88, concluiu: true })] }, "j3"),
    ];

    const r = custoPorTarefa(jobs);
    expect(r).toHaveLength(1);
    expect(r[0]?.usd).toBeCloseTo(8.48, 5);
    // Concluiu em ALGUMA rodada: o `false` das anteriores não pode apagar a entrega.
    expect(r[0]?.concluiu).toBe(true);
    expect(r[0]?.exato).toBe(true);
  });

  it("ordena pela maior fatura, que é onde se olha primeiro", () => {
    const r = custoPorTarefa([
      job({
        custoPorTarefa: [
          contabilidade({ tarefa: "T-001", custoUsd: 1 }),
          contabilidade({ tarefa: "T-002", custoUsd: 9 }),
        ],
      }),
    ]);
    expect(r.map((t) => t.tarefa)).toEqual(["T-002", "T-001"]);
  });

  it("acumula retrabalho e encadeia as naturezas sem repetir vizinhas", () => {
    const r = custoPorTarefa([
      job({
        custoPorTarefa: [
          contabilidade({
            tarefa: "T-010",
            custoUsd: 4,
            retrabalhoUsd: 3,
            retrabalhoDespachos: 2,
            naturezas: ["mecanica", "mecanica", "conformidade"],
          }),
        ],
      }),
    ]);
    expect(r[0]?.retrabalhoUsd).toBe(3);
    expect(r[0]?.retrabalhoDespachos).toBe(2);
    expect(r[0]?.naturezas).toEqual(["mecanica", "conformidade"]);
  });

  it("job sem resultado ou sem contabilidade nomeando tarefa não inventa linha", () => {
    expect(custoPorTarefa([job(null), job({}), job({ custoPorTarefa: [] })])).toEqual([]);
    // Sem `tarefa` a entrada é lixo e não pode virar uma linha anônima na tela.
    expect(custoPorTarefa([job({ custoPorTarefa: [{ custoUsd: 5 }] })])).toEqual([]);
  });
});

describe("rateio dos jobs anteriores ao registro (T-060)", () => {
  /**
   * A alternativa ao rateio seria não mostrar nada do que já aconteceu — apagando justamente a
   * evidência que motivou a fase. Ele existe, mas nunca se apresenta como medido.
   */
  it("divide o total do job entre as tarefas nomeadas e marca como rateado", () => {
    const r = custoPorTarefa([
      job({
        custoEstimadoUsd: 6,
        tarefasConcluidas: ["T-027", "T-028"],
        etapasFalhas: [],
      }),
    ]);
    expect(r).toHaveLength(2);
    expect(r[0]?.usd).toBe(3);
    expect(r[0]?.exato, "rateado nunca se veste de medido").toBe(false);
    expect(r[0]?.concluiu).toBe(true);
  });

  it("conta também a tarefa que só apareceu como etapa que falhou", () => {
    const r = custoPorTarefa([
      job({
        custoEstimadoUsd: 4,
        tarefasConcluidas: ["T-024"],
        etapasFalhas: [{ tarefa: "T-025", agente: "executor" }],
      }),
    ]);
    expect(r.map((t) => t.tarefa).sort()).toEqual(["T-024", "T-025"]);
    // A que só falhou gastou e não entregou — é exatamente o caso que a fase quer ver.
    expect(r.find((t) => t.tarefa === "T-025")?.concluiu).toBe(false);
  });

  /**
   * Sem rótulo por despacho não há como saber que fatia foi retrabalho. Preencher zero mentiria
   * para BAIXO na única coluna que a fase existe para vigiar.
   */
  it("não inventa fatia de retrabalho no rateio", () => {
    const r = custoPorTarefa([
      job({ custoEstimadoUsd: 10, tarefasConcluidas: ["T-001"], etapasFalhas: [] }),
    ]);
    expect(r[0]?.retrabalhoUsd).toBe(0);
    expect(r[0]?.retrabalhoDespachos).toBe(0);
  });

  it("job que não nomeia tarefa nenhuma não é atribuído a ninguém", () => {
    expect(
      custoPorTarefa([job({ custoEstimadoUsd: 5, tarefasConcluidas: [], etapasFalhas: [] })]),
    ).toEqual([]);
  });

  /**
   * REGRESSÃO da primeira versão, pega olhando a tela: ela só lia `tarefasConcluidas` e
   * `etapasFalhas`, e o job do replanejamento da T-030 registra a tarefa em `paraReplanejar` — a
   * tarefa aparecia por ~$5,09 contra os US$ 12,90 medidos à mão. Subestimar esconde desperdício
   * na única tela feita para expô-lo.
   */
  it("conta a tarefa que só aparece como replanejada ou bloqueada", () => {
    const r = custoPorTarefa([
      job({ custoEstimadoUsd: 3.83, tarefasConcluidas: [], paraReplanejar: ["T-030"] }, "j1"),
      job({ custoEstimadoUsd: 2, tarefasConcluidas: [], bloqueadas: ["T-031"] }, "j2"),
    ]);
    expect(r.map((t) => t.tarefa).sort()).toEqual(["T-030", "T-031"]);
    expect(r.find((t) => t.tarefa === "T-030")?.usd).toBeCloseTo(3.83, 5);
  });

  /** Sanear é escrever status, não despachar agente: atribuir custo aí inventaria gasto. */
  it("não atribui custo a tarefa que só foi saneada", () => {
    expect(
      custoPorTarefa([job({ custoEstimadoUsd: 5, tarefasConcluidas: [], saneadas: ["T-040"] })]),
    ).toEqual([]);
  });
});

describe("retratoDeCusto — custo só se lê ao lado da entrega", () => {
  /**
   * A armadilha registrada em `painel/CLAUDE.md`: execução que não faz nada é sempre a mais
   * barata. Média por tarefa CONCLUÍDA é o que impede a métrica de premiar a rodada estéril.
   */
  it("a média usa as concluídas como denominador", () => {
    const r = retratoDeCusto([
      job({
        custoPorTarefa: [
          contabilidade({ tarefa: "T-001", custoUsd: 2, concluiu: true }),
          contabilidade({ tarefa: "T-002", custoUsd: 4, concluiu: false }),
        ],
      }),
    ]);
    expect(r.totalUsd).toBe(6);
    expect(r.concluidas).toBe(1);
    expect(r.medioPorConcluidaUsd).toBe(6);
  });

  it("nada concluído devolve média nula, não Infinity", () => {
    const r = retratoDeCusto([
      job({ custoPorTarefa: [contabilidade({ tarefa: "T-001", custoUsd: 5, concluiu: false })] }),
    ]);
    expect(r.concluidas).toBe(0);
    expect(r.medioPorConcluidaUsd).toBeNull();
  });

  it("calcula a fatia de retrabalho do projeto", () => {
    const r = retratoDeCusto([
      job({
        custoPorTarefa: [
          contabilidade({ tarefa: "T-001", custoUsd: 10, retrabalhoUsd: 7 }),
          contabilidade({ tarefa: "T-002", custoUsd: 10, retrabalhoUsd: 3 }),
        ],
      }),
    ]);
    expect(r.fatiaRetrabalho).toBeCloseTo(0.5, 5);
  });

  it("sem gasto nenhum, a fatia é nula em vez de zero enganoso", () => {
    expect(retratoDeCusto([]).fatiaRetrabalho).toBeNull();
    expect(retratoDeCusto([]).totalUsd).toBe(0);
  });
});
