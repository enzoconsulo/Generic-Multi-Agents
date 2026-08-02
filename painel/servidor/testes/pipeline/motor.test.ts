import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rodarPipeline, type DependenciasMotor, type PedidoDespacho } from "../../src/pipeline/motor.js";
import { novoOrcamento } from "../../src/pipeline/orcamento.js";
import type { TarefaResumo } from "../../src/fabrica/tipos.js";

function tarefa(p: Partial<TarefaResumo> & { id: string }): TarefaResumo {
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
    criada: "2026-08-01",
    atualizada: "2026-08-01",
    erros: [],
    ...p,
  };
}

/**
 * Fábrica de mentira: as tarefas vivem em memória e o "despacho" apenas avança o status,
 * como um agente real faria ao gravar no arquivo. É isto que permite exercitar o laço
 * inteiro sem gastar a assinatura — e um laço de orquestração sem teste foi exatamente o
 * que produziu o abandono de agente em voo e o roteamento para especialista inexistente.
 */
function mundo(iniciais: TarefaResumo[], opcoes: { custoPorDespacho?: number; criterios?: string } = {}) {
  const tarefas = new Map(iniciais.map((t) => [t.id, { ...t }]));
  const despachos: PedidoDespacho[] = [];
  const logs: string[] = [];
  const proximoStatus: Record<string, string> = {
    pronta: "em-teste",
    "em-execucao": "em-teste",
    "em-teste": "em-revisao",
    "em-revisao": "concluida",
  };

  const dep: DependenciasMotor = {
    lerTarefas: async () => [...tarefas.values()],
    gravarStatus: async (t, status) => {
      const atual = tarefas.get(t.id);
      if (atual !== undefined) atual.status = status;
    },
    anexarVerificacao: async () => {},
    lerCriteriosDe: async () => opcoes.criterios ?? "",
    despachar: async (pedido) => {
      despachos.push(pedido);
      const atual = tarefas.get(pedido.tarefa.id);
      if (atual !== undefined) atual.status = proximoStatus[atual.status] ?? "concluida";
      return { custoUsd: opcoes.custoPorDespacho ?? 0.5, concluiu: true };
    },
    log: (_n, texto) => logs.push(texto),
  };

  return { dep, despachos, logs, tarefas };
}

const ctxBase = {
  dirProjeto: mkdtempSync(join(tmpdir(), "motor-")),
  projeto: "proj",
  trilha: "software" as const,
  equipe: null,
  disponiveis: new Set<string>(),
  reforco: "opus" as string | null,
  orcamento: novoOrcamento(null),
};

describe("rodarPipeline — o ciclo completo", () => {
  it("leva uma tarefa de pronta a concluída pelos três papéis, na ordem", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "pronta" })]);
    const rel = await rodarPipeline(ctxBase, dep);

    expect(despachos.map((d) => d.papel)).toEqual(["construtor", "verificador", "revisor"]);
    expect(despachos.map((d) => d.agente)).toEqual(["executor", "testador", "revisor"]);
    expect(rel.tarefasConcluidas).toContain("T-001");
    expect(rel.encerrouPor).toBe("sem-trabalho");
  });

  it("promove backlog quando a dependência conclui, e registra", async () => {
    const { dep } = mundo([
      tarefa({ id: "T-001", status: "pronta" }),
      tarefa({ id: "T-002", status: "backlog", dependencias: ["T-001"] }),
    ]);
    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.promovidas).toContain("T-002");
    expect(rel.tarefasConcluidas).toEqual(expect.arrayContaining(["T-001", "T-002"]));
  });

  it("sem trabalho, não despacha ninguém", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "concluida" })]);
    const rel = await rodarPipeline(ctxBase, dep);
    expect(despachos).toEqual([]);
    expect(rel.encerrouPor).toBe("sem-trabalho");
  });

  // Erro de frontmatter que NUNCA fecha sozinho: silenciar deixaria a tarefa presa em
  // backlog para sempre, e é assim que um plano trava sem ninguém entender por quê.
  it("denuncia dependência inexistente em vez de deixar a tarefa presa em silêncio", async () => {
    const { dep, logs } = mundo([tarefa({ id: "T-005", status: "backlog", dependencias: ["T-999"] })]);
    await rodarPipeline(ctxBase, dep);
    expect(logs.some((l) => l.includes("INEXISTENTE") && l.includes("T-999"))).toBe(true);
  });
});

describe("rodarPipeline — orçamento", () => {
  it("para ANTES de despachar quando não cabe outra tarefa, sem cortar ninguém", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001" })], { custoPorDespacho: 5 });
    const rel = await rodarPipeline({ ...ctxBase, orcamento: novoOrcamento(3) }, dep);

    expect(rel.encerrouPor).toBe("orcamento");
    // Zero despacho: com teto de US$ 3 e estimativa padrão de US$ 2,10 × 1,25 = 2,63,
    // ainda cabia UM — o corte acontece na volta seguinte, nunca no meio.
    expect(despachos.length).toBeLessThanOrEqual(1);
  });

  it("sem teto, roda até acabar o trabalho", async () => {
    const { dep } = mundo([tarefa({ id: "T-001" }), tarefa({ id: "T-002", areas: ["b.js"] })]);
    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.encerrouPor).toBe("sem-trabalho");
    expect(rel.despachos).toBeGreaterThanOrEqual(6);
  });

  // Agente sem resultado = cortado. Continuar seria empilhar trabalho sobre estado
  // desconhecido, que é como se produz reprovação falsa — o desperdício mais caro daqui.
  it("agente que não devolve resultado ENCERRA o laço", async () => {
    const { dep } = mundo([tarefa({ id: "T-001" })]);
    const original = dep.despachar;
    let n = 0;
    dep.despachar = async (p) => {
      n += 1;
      if (n === 2) return { custoUsd: 0.5, concluiu: false };
      return original(p);
    };
    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.encerrouPor).toBe("agente-cortado");
  });
});

describe("rodarPipeline — passada mecânica (I5)", () => {
  const criteriosQueFalham = [
    "- [ ] sempre falha",
    '      `verificar: node -e "process.exit(1)"`',
  ].join("\n");
  const criteriosQuePassam = [
    "- [ ] sempre passa",
    '      `verificar: node -e "process.exit(0)"`',
  ].join("\n");

  // A economia da I5: o verificador custa ~US$ 0,50 por despacho. Se um comando já provou
  // que falhou, pagar isso é comprar a confirmação do óbvio.
  it("critério objetivo que falha devolve ao construtor SEM despachar o verificador", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "em-teste" })], {
      criterios: criteriosQueFalham,
    });
    // Um despacho de construtor resolveria o estado e o laço giraria; corta na 1ª volta.
    dep.despachar = async (p) => {
      despachos.push(p);
      return { custoUsd: 0.5, concluiu: false };
    };
    const rel = await rodarPipeline(ctxBase, dep);

    expect(despachos.some((d) => d.papel === "verificador")).toBe(false);
    expect(rel.criteriosExecutados).toBeGreaterThan(0);
  });

  it("critério objetivo que passa segue para o verificador normalmente", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "em-teste" })], {
      criterios: criteriosQuePassam,
    });
    await rodarPipeline(ctxBase, dep);
    expect(despachos.some((d) => d.papel === "verificador")).toBe(true);
  });

  it("tarefa sem critério executável não muda nada — o verificador roda como sempre", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "em-teste" })], {
      criterios: "- [ ] a tela fica boa",
    });
    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.criteriosExecutados).toBe(0);
    expect(despachos.some((d) => d.papel === "verificador")).toBe(true);
  });
});

describe("rodarPipeline — esgotamento de ciclos", () => {
  // Bloquear e replanejar são desfechos DIFERENTES, e a diferença é uma regra escrita
  // (autocorreção vale uma vez por linhagem), não julgamento — por isso mora no motor.
  it("tarefa esgotada sem linhagem vai para REPLANEJAMENTO (decisão do modelo)", async () => {
    const { dep } = mundo([tarefa({ id: "T-001", status: "pronta", tentativas: 4 })]);
    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.paraReplanejar).toContain("T-001");
    expect(rel.bloqueadas).not.toContain("T-001");
  });

  it("tarefa que JÁ era replanejamento e esgotou de novo é bloqueada para o usuário", async () => {
    const { dep, tarefas } = mundo([
      tarefa({ id: "T-001a", status: "pronta", tentativas: 4, replanejadaDe: "T-001" }),
    ]);
    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.bloqueadas).toContain("T-001a");
    expect(tarefas.get("T-001a")?.status).toBe("bloqueada");
  });
});

describe("rodarPipeline — roteamento", () => {
  it("usa a trilha genérica quando o projeto não é software", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001" })]);
    await rodarPipeline({ ...ctxBase, trilha: "generica" }, dep);
    expect(despachos.map((d) => d.agente)).toEqual(["construtor", "conferente", "revisor-generico"]);
  });

  it("escala para o reforçado quando a tarefa já voltou reprovada", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "em-execucao", tentativas: 1 })]);
    await rodarPipeline(ctxBase, dep);
    expect(despachos[0]?.agente).toBe("executor-reforcado");
    expect(despachos[0]?.modelo).toBe("opus");
  });
});
