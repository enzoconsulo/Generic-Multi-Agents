import { describe, expect, it } from "vitest";
import {
  CUSTO_POR_TAREFA_PADRAO_USD,
  estimarRodada,
  textoEstimativa,
} from "../src/lib/estimativa-rodada";
import type { Job, TarefaCompleta } from "../src/lib/tipos";

/**
 * A ESTIMATIVA ANTES DO DISPARO (21/08).
 *
 * A regra que estes testes travam: o denominador é a tarefa ENTREGUE e o numerador é TODO o
 * gasto, inclusive o das tarefas que não fecharam. Medido na fábrica em 47 rodadas, uma
 * tarefa que fecha custa mediana US$ 2,08 — e a fatura por tarefa entregue foi US$ 6,90. Um
 * estimador que usasse o custo da tarefa que fechou seria sempre otimista, que é a pior
 * espécie de estimativa: some o retrabalho (46% do gasto) e o trabalho pago em tarefa que
 * não fechou.
 */
function job(custoPorTarefa: unknown[], id = "j1"): Job {
  return {
    id,
    tipo: "pipeline",
    titulo: "/trabalhar proj",
    escopo: "projeto:proj",
    usaClaude: true,
    params: {},
    estado: "concluido",
    criadoEm: "2026-08-09T00:00:00.000Z",
    resultado: { custoPorTarefa },
  } as Job;
}

function conta(tarefa: string, custoUsd: number, concluiu: boolean) {
  return {
    tarefa,
    custoUsd,
    despachos: 3,
    retrabalhoUsd: 0,
    retrabalhoDespachos: 0,
    naturezas: [],
    concluiu,
  };
}

function tarefa(p: Partial<TarefaCompleta> & { id: string }): TarefaCompleta {
  return {
    arquivo: `${p.id}.md`,
    titulo: p.id,
    status: "pronta",
    prioridade: "media",
    dependencias: [],
    areas: [],
    tentativas: 0,
    replanejadaDe: null,
    agente: null,
    criada: null,
    atualizada: null,
    erros: [],
    secoes: {},
    ...p,
  } as TarefaCompleta;
}

describe("estimarRodada", () => {
  it("divide TODO o gasto pelas tarefas entregues, não pelo custo da que fechou", () => {
    // US$ 10 gastos, 1 entregue: a tarefa que não fechou continua sendo dinheiro que a
    // próxima rodada vai pagar de novo.
    const jobs = [job([conta("T-001", 2, true), conta("T-002", 8, false)])];
    const e = estimarRodada(jobs, [tarefa({ id: "T-002" })], null);

    expect(e.porTarefaUsd).toBe(10);
    expect(e.base).toBe("projeto");
    expect(e.amostra).toBe(1);
  });

  it("sem histórico, cai no padrão medido da fábrica e ADMITE que é padrão", () => {
    const e = estimarRodada([], [tarefa({ id: "T-001" })], 8);
    expect(e.porTarefaUsd).toBe(CUSTO_POR_TAREFA_PADRAO_USD);
    expect(e.base).toBe("fabrica");
    expect(e.amostra).toBe(0);
    expect(textoEstimativa(e)).toContain("ainda não entregou tarefa");
  });

  it("conta como despachável o que está em circulação E o que já pode ser promovido", () => {
    const tarefas = [
      tarefa({ id: "T-001", status: "concluida" }),
      tarefa({ id: "T-002", status: "em-teste" }),
      tarefa({ id: "T-003", status: "pronta" }),
      // Backlog com dependência JÁ concluída: o motor promove na abertura da rodada.
      tarefa({ id: "T-004", status: "backlog", dependencias: ["T-001"] }),
      // Backlog preso: não entra na conta.
      tarefa({ id: "T-005", status: "backlog", dependencias: ["T-003"] }),
    ];
    expect(estimarRodada([], tarefas, null).despachaveis).toBe(3);
  });

  it("o teto limita quantas tarefas cabem, e a frase avisa que a rodada para antes", () => {
    const jobs = [job([conta("T-001", 4, true)])];
    const tarefas = [
      tarefa({ id: "T-002" }),
      tarefa({ id: "T-003" }),
      tarefa({ id: "T-004" }),
    ];
    const e = estimarRodada(jobs, tarefas, 8);

    expect(e.cabemNoTeto).toBe(2);
    expect(e.tarefasPrevistas).toBe(2);
    expect(e.totalUsd).toBe(8);
    expect(e.paraNoTeto).toBe(true);
    expect(textoEstimativa(e)).toContain("parada limpa");
  });

  it("sem teto, a previsão é o trabalho despachável inteiro", () => {
    const jobs = [job([conta("T-001", 3, true)])];
    const e = estimarRodada(jobs, [tarefa({ id: "T-002" }), tarefa({ id: "T-003" })], null);

    expect(e.cabemNoTeto).toBeNull();
    expect(e.tarefasPrevistas).toBe(2);
    expect(e.paraNoTeto).toBe(false);
  });

  /**
   * A armadilha da casa — *execução que não faz nada é sempre a mais barata*. Rodada sem
   * nada despachável não pode aparecer como "US$ 0,00", que leria como barganha; ela é uma
   * rodada que não vai fazer nada.
   */
  it("nada despachável: diz isso em vez de anunciar custo zero", () => {
    const e = estimarRodada([], [tarefa({ id: "T-001", status: "concluida" })], 8);
    expect(e.tarefasPrevistas).toBe(0);
    expect(textoEstimativa(e)).toContain("Nada despachável");
  });

  /** Valor rateado (jobs anteriores à contabilidade por tarefa) nunca se diz medido. */
  it("marca `exato: false` quando algum custo da amostra é rateado", () => {
    const rateado = {
      id: "j2",
      tipo: "pipeline",
      titulo: "/trabalhar proj",
      escopo: "projeto:proj",
      usaClaude: true,
      params: {},
      estado: "concluido",
      criadoEm: "2026-08-02T00:00:00.000Z",
      resultado: { custoEstimadoUsd: 5, tarefasConcluidas: ["T-009"], despachos: 3 },
    } as Job;
    expect(estimarRodada([rateado], [tarefa({ id: "T-010" })], 8).exato).toBe(false);
  });
});
