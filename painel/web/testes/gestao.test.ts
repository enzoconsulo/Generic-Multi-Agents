import { describe, expect, it } from "vitest";
import {
  jobsDoProjeto,
  mapaDependencias,
  tarefasBloqueadas,
  tarefasPromoviveis,
  ultimoCustoDaAcao,
  custosPorAcao,
} from "../src/lib/gestao";
import type { Job, TarefaCompleta } from "../src/lib/tipos";

function tarefa(parcial: Pick<TarefaCompleta, "id" | "status"> & Partial<TarefaCompleta>): TarefaCompleta {
  return {
    arquivo: `${parcial.id}.md`,
    titulo: `Tarefa ${parcial.id}`,
    prioridade: "media",
    dependencias: [],
    areas: [],
    tentativas: 0,
    replanejadaDe: null,
    agente: null,
    criada: null,
    atualizada: null,
    erros: [],
    secoes: {} as TarefaCompleta["secoes"],
    ...parcial,
  };
}

function job(parcial: Pick<Job, "id" | "escopo" | "estado"> & Partial<Job>): Job {
  return {
    tipo: "claude",
    titulo: `Job ${parcial.id}`,
    usaClaude: true,
    params: {},
    criadoEm: "2026-07-28T10:00:00.000Z",
    ...parcial,
  };
}

describe("mapaDependencias", () => {
  it("liga os dois sentidos: quem espera e quem é esperado", () => {
    const mapa = mapaDependencias([
      tarefa({ id: "T-001", status: "concluida" }),
      tarefa({ id: "T-002", status: "backlog", dependencias: ["T-001"] }),
      tarefa({ id: "T-003", status: "backlog", dependencias: ["T-001"] }),
    ]);
    expect(mapa.get("T-002")?.espera).toEqual(["T-001"]);
    // O que importa para decidir: não sair a T-001 trava DUAS tarefas.
    expect(mapa.get("T-001")?.esperadaPor).toEqual(["T-002", "T-003"]);
  });

  it("`faltando` é só o que ainda não concluiu", () => {
    const mapa = mapaDependencias([
      tarefa({ id: "T-001", status: "concluida" }),
      tarefa({ id: "T-002", status: "em-teste" }),
      tarefa({ id: "T-003", status: "backlog", dependencias: ["T-001", "T-002"] }),
    ]);
    expect(mapa.get("T-003")?.faltando).toEqual(["T-002"]);
  });

  it("separa dependência QUEBRADA de dependência apenas não concluída", () => {
    // Erro de escrita no frontmatter nunca fecha sozinho; misturar as duas o esconderia.
    const mapa = mapaDependencias([
      tarefa({ id: "T-002", status: "backlog", dependencias: ["T-999"] }),
    ]);
    expect(mapa.get("T-002")?.inexistentes).toEqual(["T-999"]);
    expect(mapa.get("T-002")?.faltando).toEqual([]);
  });

  it("dependência quebrada NÃO deixa a tarefa promovível", () => {
    const mapa = mapaDependencias([
      tarefa({ id: "T-002", status: "backlog", dependencias: ["T-999"] }),
    ]);
    expect(mapa.get("T-002")?.prontaParaPromover).toBe(false);
  });

  it("backlog com tudo concluído é promovível; com pendência, não", () => {
    const mapa = mapaDependencias([
      tarefa({ id: "T-001", status: "concluida" }),
      tarefa({ id: "T-002", status: "backlog", dependencias: ["T-001"] }),
      tarefa({ id: "T-003", status: "backlog", dependencias: ["T-002"] }),
      tarefa({ id: "T-004", status: "backlog" }),
    ]);
    expect(mapa.get("T-002")?.prontaParaPromover).toBe(true);
    expect(mapa.get("T-003")?.prontaParaPromover).toBe(false);
    // Sem dependência nenhuma também é promovível.
    expect(mapa.get("T-004")?.prontaParaPromover).toBe(true);
  });

  it("tarefa que já saiu do backlog não é 'promovível'", () => {
    const mapa = mapaDependencias([tarefa({ id: "T-001", status: "pronta" })]);
    expect(mapa.get("T-001")?.prontaParaPromover).toBe(false);
  });
});

describe("tarefasPromoviveis", () => {
  it("ordena por prioridade e depois por id (lista estável entre recargas)", () => {
    const tarefas = [
      tarefa({ id: "T-003", status: "backlog", prioridade: "baixa" }),
      tarefa({ id: "T-002", status: "backlog", prioridade: "alta" }),
      tarefa({ id: "T-001", status: "backlog", prioridade: "alta" }),
      tarefa({ id: "T-004", status: "backlog", prioridade: "media" }),
    ];
    const ids = tarefasPromoviveis(tarefas, mapaDependencias(tarefas)).map((t) => t.id);
    expect(ids).toEqual(["T-001", "T-002", "T-004", "T-003"]);
  });
});

describe("tarefasBloqueadas", () => {
  it("pega só as bloqueadas", () => {
    const tarefas = [
      tarefa({ id: "T-001", status: "bloqueada" }),
      tarefa({ id: "T-002", status: "backlog" }),
      tarefa({ id: "T-003", status: "cancelada" }),
    ];
    expect(tarefasBloqueadas(tarefas).map((t) => t.id)).toEqual(["T-001"]);
  });
});

describe("jobsDoProjeto", () => {
  it("filtra pelo escopo do projeto", () => {
    const jobs = [
      job({ id: "a", escopo: "projeto:meu", estado: "concluido" }),
      job({ id: "b", escopo: "projeto:outro", estado: "concluido" }),
      job({ id: "c", escopo: "global", estado: "concluido" }),
    ];
    expect(jobsDoProjeto(jobs, "meu").map((j) => j.id)).toEqual(["a"]);
  });

  it("mais recentes primeiro", () => {
    const jobs = [
      job({ id: "velho", escopo: "projeto:meu", estado: "concluido", iniciadoEm: "2026-07-28T09:00:00.000Z" }),
      job({ id: "novo", escopo: "projeto:meu", estado: "concluido", iniciadoEm: "2026-07-28T12:00:00.000Z" }),
    ];
    expect(jobsDoProjeto(jobs, "meu").map((j) => j.id)).toEqual(["novo", "velho"]);
  });

  it("job que nunca iniciou usa `criadoEm` e não afunda para o fim da lista", () => {
    // Job que falhou na fila é exatamente o que interessa ver, e ficaria escondido.
    const jobs = [
      job({ id: "iniciado", escopo: "projeto:meu", estado: "concluido", iniciadoEm: "2026-07-28T09:00:00.000Z" }),
      job({ id: "nunca-iniciou", escopo: "projeto:meu", estado: "falhou", criadoEm: "2026-07-28T11:00:00.000Z" }),
    ];
    expect(jobsDoProjeto(jobs, "meu")[0]?.id).toBe("nunca-iniciou");
  });
});

describe("ultimoCustoDaAcao (T-040)", () => {
  function jobDe(titulo: string, custoUsd: number | null, estado: Job["estado"] = "concluido") {
    return job({
      id: titulo + estado + String(custoUsd),
      escopo: "projeto:meu",
      estado,
      titulo,
      iniciadoEm: "2026-07-28T10:00:00.000Z",
      ...(custoUsd === null ? {} : { resultado: { custoUsd } }),
    });
  }

  it("acha o custo da última execução daquela ação naquele projeto", () => {
    const jobs = [
      jobDe("Documentar — meu", 0.42),
      jobDe("Testar — meu", 0.71),
    ];
    expect(ultimoCustoDaAcao(jobs, "meu", "Documentar")).toBe(0.42);
    expect(ultimoCustoDaAcao(jobs, "meu", "Testar")).toBe(0.71);
  });

  it("nunca executada aqui → null (a UI cai na estimativa)", () => {
    expect(ultimoCustoDaAcao([jobDe("Documentar — meu", 0.42)], "meu", "Pesquisar")).toBeNull();
  });

  it("não confunde a mesma ação em OUTRO projeto", () => {
    const jobs = [job({ id: "x", escopo: "projeto:outro", estado: "concluido", titulo: "Documentar — outro", resultado: { custoUsd: 9 } })];
    expect(ultimoCustoDaAcao(jobs, "meu", "Documentar")).toBeNull();
  });

  it("ignora execução que não terminou — custo parcial não é o preço da ação", () => {
    const jobs = [
      jobDe("Documentar — meu", 0.05, "cancelado"),
      jobDe("Documentar — meu", 0.42, "concluido"),
    ];
    expect(ultimoCustoDaAcao(jobs, "meu", "Documentar")).toBe(0.42);
  });

  it("prefixo não casa com rótulo mais longo que comece igual", () => {
    // "Testar" não pode capturar "Testar tudo — meu" — o separador " — " garante isso.
    const jobs = [jobDe("Testar tudo — meu", 3.0)];
    expect(ultimoCustoDaAcao(jobs, "meu", "Testar")).toBeNull();
  });
});

describe("custosPorAcao (T-042)", () => {
  function jobDe(titulo: string, custoUsd: number, estado: Job["estado"] = "concluido", em = "2026-07-28T10:00:00.000Z") {
    return job({
      id: titulo + em + String(custoUsd),
      escopo: "projeto:meu",
      estado,
      titulo,
      iniciadoEm: em,
      resultado: { custoUsd },
    });
  }

  it("monta o mapa de todas as ações numa passada", () => {
    const jobs = [jobDe("Documentar — meu", 0.42), jobDe("Testar — meu", 0.71)];
    const custos = custosPorAcao(jobs, "meu");
    expect(custos.get("Documentar")).toBe(0.42);
    expect(custos.get("Testar")).toBe(0.71);
    expect(custos.get("Pesquisar")).toBeUndefined();
  });

  it("guarda a execução MAIS RECENTE de cada ação", () => {
    const jobs = [
      jobDe("Documentar — meu", 0.1, "concluido", "2026-07-28T09:00:00.000Z"),
      jobDe("Documentar — meu", 0.9, "concluido", "2026-07-28T15:00:00.000Z"),
    ];
    expect(custosPorAcao(jobs, "meu").get("Documentar")).toBe(0.9);
  });

  it("dá o MESMO resultado que a consulta por ação — o refactor não pode mudar o número", () => {
    // A garantia que importa num refactor de desempenho: o valor exibido continua igual.
    const jobs = [
      jobDe("Documentar — meu", 0.42),
      jobDe("Testar — meu", 0.71),
      jobDe("Revisar código — meu", 1.14, "cancelado"),
    ];
    for (const rotulo of ["Documentar", "Testar", "Revisar código", "Inexistente"]) {
      expect(custosPorAcao(jobs, "meu").get(rotulo) ?? null).toBe(
        ultimoCustoDaAcao(jobs, "meu", rotulo),
      );
    }
  });

  it("título sem o separador não entra no mapa", () => {
    expect(custosPorAcao([jobDe("SemSeparador", 1)], "meu").size).toBe(0);
  });
});
