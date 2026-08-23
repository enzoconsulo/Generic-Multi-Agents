import { describe, expect, it } from "vitest";
import {
  deveBloquear,
  deveReplanejar,
  MAX_TENTATIVAS,
  promoverProntas,
  proximosPassos,
  resolverAgente,
  trilhaDe,
} from "../../src/pipeline/maquina.js";
import type { EquipeProjeto, TarefaResumo } from "../../src/fabrica/tipos.js";

function tarefa(p: Partial<TarefaResumo> & { id: string }): TarefaResumo {
  return {
    arquivo: `${p.id}-x.md`,
    titulo: p.id,
    status: "backlog",
    prioridade: "media",
    dependencias: [],
    areas: [],
    tentativas: 0,
    replanejadaDe: null,
    ultimaReprovacao: null,
    agente: null,
    criada: "2026-08-01",
    atualizada: "2026-08-01",
    erros: [],
    ...p,
  };
}

function equipe(ids: string[], dominio?: string): EquipeProjeto {
  return {
    dominio: dominio ?? "software",
    agentes: ids.map((id) => ({
      id,
      nome: id,
      descricao: `Especialista ${id}`,
      prompt: `Você é o ${id}.`,
      ferramentas: null,
      erros: [],
    })),
    erros: [],
  } as EquipeProjeto;
}

describe("trilhaDe", () => {
  // A invariante que mantém todo projeto existente inerte à trilha genérica.
  it("ausência de equipe, de domínio ou domínio vazio é SOFTWARE", () => {
    expect(trilhaDe(null)).toBe("software");
    expect(trilhaDe(undefined)).toBe("software");
    expect(trilhaDe(equipe([], ""))).toBe("software");
    expect(trilhaDe(equipe([], "   "))).toBe("software");
    expect(trilhaDe(equipe([], "software"))).toBe("software");
  });

  it("qualquer outro valor é a trilha genérica", () => {
    expect(trilhaDe(equipe([], "apresentacao"))).toBe("generica");
    expect(trilhaDe(equipe([], "nome-cunhado-pro-pedido"))).toBe("generica");
  });
});

describe("promoverProntas", () => {
  it("promove quando todas as dependências estão concluídas", () => {
    const r = promoverProntas([
      tarefa({ id: "T-001", status: "concluida" }),
      tarefa({ id: "T-002", status: "concluida" }),
      tarefa({ id: "T-003", dependencias: ["T-001", "T-002"] }),
    ]);
    expect(r.promover).toEqual(["T-003"]);
    expect(r.travadas).toEqual([]);
  });

  it("não promove com dependência pendente, e diz qual", () => {
    const r = promoverProntas([
      tarefa({ id: "T-001", status: "concluida" }),
      tarefa({ id: "T-002", status: "em-teste" }),
      tarefa({ id: "T-003", dependencias: ["T-001", "T-002"] }),
    ]);
    expect(r.promover).toEqual([]);
    expect(r.travadas[0]).toEqual({ id: "T-003", faltando: ["T-002"], inexistentes: [] });
  });

  // Foi exatamente isto que travou a T-018: dependia da T-017, que foi CANCELADA.
  // `cancelada` != `concluida`, então a promoção nunca aconteceria — em silêncio.
  it("dependência cancelada trava, e aparece como faltando", () => {
    const r = promoverProntas([
      tarefa({ id: "T-017", status: "cancelada" }),
      tarefa({ id: "T-018", dependencias: ["T-017"] }),
    ]);
    expect(r.promover).toEqual([]);
    expect(r.travadas[0]?.faltando).toEqual(["T-017"]);
  });

  // Erro de frontmatter que NUNCA fecha sozinho — tem de ser separado do caso normal.
  it("dependência inexistente é separada de dependência pendente", () => {
    const r = promoverProntas([tarefa({ id: "T-005", dependencias: ["T-999"] })]);
    expect(r.travadas[0]).toEqual({ id: "T-005", faltando: [], inexistentes: ["T-999"] });
  });

  it("tarefa sem dependências é promovida", () => {
    expect(promoverProntas([tarefa({ id: "T-001" })]).promover).toEqual(["T-001"]);
  });

  it("só olha o que está em backlog", () => {
    const r = promoverProntas([tarefa({ id: "T-001", status: "pronta" })]);
    expect(r.promover).toEqual([]);
    expect(r.travadas).toEqual([]);
  });
});

describe("proximosPassos — regras de paralelismo", () => {
  it("mapeia status para papel nas duas trilhas", () => {
    const t = [
      tarefa({ id: "T-001", status: "pronta" }),
      tarefa({ id: "T-002", status: "em-revisao" }),
    ];
    const passos = proximosPassos(t, "software");
    expect(passos.map((p) => p.papel).sort()).toEqual(["construtor", "revisor"]);
  });

  // Regra 1 do CLAUDE.md, e a mais cara de violar: bateria completa sobre árvore com
  // edições alheias gera REPROVAÇÃO FALSA, que queima um ciclo inteiro.
  it("verificador roda SOZINHO: nenhum construtor sai junto", () => {
    const t = [
      tarefa({ id: "T-001", status: "pronta", areas: ["a.js"] }),
      tarefa({ id: "T-002", status: "em-teste" }),
      tarefa({ id: "T-003", status: "pronta", areas: ["b.js"] }),
    ];
    const passos = proximosPassos(t, "software");
    expect(passos).toHaveLength(1);
    expect(passos[0]?.papel).toBe("verificador");
  });

  it("um verificador por vez, mesmo com dois em em-teste", () => {
    const t = [
      tarefa({ id: "T-001", status: "em-teste" }),
      tarefa({ id: "T-002", status: "em-teste" }),
    ];
    expect(proximosPassos(t, "software").filter((p) => p.papel === "verificador")).toHaveLength(1);
  });

  // Regra 3: o revisor lê o diff COMMITADO, então não disputa a árvore com ninguém.
  it("revisor sai junto com o verificador", () => {
    const t = [
      tarefa({ id: "T-001", status: "em-teste" }),
      tarefa({ id: "T-002", status: "em-revisao" }),
    ];
    const passos = proximosPassos(t, "software");
    expect(passos.map((p) => p.papel)).toEqual(["revisor", "verificador"]);
  });

  it("até 3 construtores em paralelo, com areas disjuntas", () => {
    const t = [
      tarefa({ id: "T-001", status: "pronta", areas: ["a.js"] }),
      tarefa({ id: "T-002", status: "pronta", areas: ["b.js"] }),
      tarefa({ id: "T-003", status: "pronta", areas: ["c.js"] }),
      tarefa({ id: "T-004", status: "pronta", areas: ["d.js"] }),
    ];
    expect(proximosPassos(t, "software")).toHaveLength(3);
  });

  it("areas em comum: o segundo fica de fora", () => {
    const t = [
      tarefa({ id: "T-001", status: "pronta", areas: ["a.js", "shared.js"] }),
      tarefa({ id: "T-002", status: "pronta", areas: ["shared.js"] }),
      tarefa({ id: "T-003", status: "pronta", areas: ["c.js"] }),
    ];
    const ids = proximosPassos(t, "software").map((p) => p.tarefa.id);
    expect(ids).toEqual(["T-001", "T-003"]);
  });

  // Conservador de propósito: o custo do engano é reprovação falsa, o desperdício mais caro.
  it("tarefa SEM areas declaradas roda sozinha entre construtores", () => {
    const t = [
      tarefa({ id: "T-001", status: "pronta", areas: [] }),
      tarefa({ id: "T-002", status: "pronta", areas: ["b.js"] }),
    ];
    const passos = proximosPassos(t, "software");
    expect(passos).toHaveLength(1);
    expect(passos[0]?.tarefa.id).toBe("T-001");
  });

  it("ordena por prioridade e depois por id (determinístico)", () => {
    const t = [
      tarefa({ id: "T-003", status: "pronta", prioridade: "baixa", areas: ["c.js"] }),
      tarefa({ id: "T-002", status: "pronta", prioridade: "alta", areas: ["b.js"] }),
      tarefa({ id: "T-001", status: "pronta", prioridade: "alta", areas: ["a.js"] }),
    ];
    expect(proximosPassos(t, "software").map((p) => p.tarefa.id)).toEqual([
      "T-001",
      "T-002",
      "T-003",
    ]);
  });

  it("status terminais não geram passo", () => {
    const t = [
      tarefa({ id: "T-001", status: "concluida" }),
      tarefa({ id: "T-002", status: "bloqueada" }),
      tarefa({ id: "T-003", status: "cancelada" }),
      tarefa({ id: "T-004", status: "backlog" }),
    ];
    expect(proximosPassos(t, "software")).toEqual([]);
  });
});

describe("resolverAgente — os 3 passos do CLAUDE.md", () => {
  const base = { disponiveis: new Set<string>(), projeto: "proj", reforco: "opus" };

  it("sem `agente:` usa o genérico da trilha", () => {
    const r = resolverAgente(
      { tarefa: tarefa({ id: "T-001", status: "pronta" }), papel: "construtor" },
      "software",
      null,
      base,
    );
    expect(r.nome).toBe("executor");
    expect(r.modelo).toBeNull();
  });

  it("trilha genérica usa os agentes dela", () => {
    const r = resolverAgente(
      { tarefa: tarefa({ id: "T-001", status: "em-teste" }), papel: "verificador" },
      "generica",
      null,
      base,
    );
    expect(r.nome).toBe("conferente");
  });

  it("passo 1: especialista injetado pelo id nu", () => {
    const r = resolverAgente(
      { tarefa: tarefa({ id: "T-001", agente: "engine" }), papel: "construtor" },
      "software",
      equipe(["engine"]),
      { ...base, disponiveis: new Set(["engine"]) },
    );
    expect(r.nome).toBe("engine");
  });

  it("passo 2: nome qualificado quando o id nu não foi injetado", () => {
    const r = resolverAgente(
      { tarefa: tarefa({ id: "T-001", agente: "engine" }), papel: "construtor" },
      "software",
      equipe(["engine"]),
      { ...base, disponiveis: new Set(["proj__engine"]) },
    );
    expect(r.nome).toBe("proj__engine");
  });

  // É este passo que faz `equipe.json` valer também no chat interativo, onde o SDK não
  // injeta equipe nenhuma. Sem ele, todo /trabalhar do terminal perdia a especialização.
  it("passo 3: nada injetado → genérico com o prompt do especialista COLADO", () => {
    const r = resolverAgente(
      { tarefa: tarefa({ id: "T-001", agente: "engine" }), papel: "construtor" },
      "software",
      equipe(["engine"]),
      base,
    );
    expect(r.nome).toBe("executor");
    expect(r.promptColado).toBe("Você é o engine.");
  });

  // Defeito de PLANEJAMENTO que só aparece se alguém escrever — daí o motivo explícito.
  it("`agente:` que não consta no equipe.json cai no genérico E denuncia", () => {
    const r = resolverAgente(
      { tarefa: tarefa({ id: "T-001", agente: "fantasma" }), papel: "construtor" },
      "software",
      equipe(["engine"]),
      base,
    );
    expect(r.nome).toBe("executor");
    expect(r.promptColado).toBeNull();
    expect(r.motivo).toContain("não consta");
  });
});

describe("resolverAgente — escalonamento de modelo", () => {
  const base = { disponiveis: new Set(["engine", "engine-reforcado"]), projeto: "proj", reforco: "opus" };

  it("primeira execução usa o modelo do disparo", () => {
    const r = resolverAgente(
      { tarefa: tarefa({ id: "T-001", agente: "engine", tentativas: 0 }), papel: "construtor" },
      "software",
      equipe(["engine"]),
      base,
    );
    expect(r.nome).toBe("engine");
    expect(r.modelo).toBeNull();
  });

  it("tentativas >= 1 sobe para o reforçado", () => {
    const r = resolverAgente(
      { tarefa: tarefa({ id: "T-001", agente: "engine", tentativas: 1 }), papel: "construtor" },
      "software",
      equipe(["engine"]),
      base,
    );
    expect(r.nome).toBe("engine-reforcado");
    expect(r.modelo).toBe("opus");
  });

  // Duas reprovações sob o mesmo prompt de domínio são evidência de viés — e o `agente:`
  // foi decidido no planejamento, quando ninguém sabia onde a tarefa iria falhar.
  it("tentativas >= 2 troca para o reforçado GENÉRICO antes da última chance", () => {
    const r = resolverAgente(
      { tarefa: tarefa({ id: "T-001", agente: "engine", tentativas: 2 }), papel: "construtor" },
      "software",
      equipe(["engine"]),
      base,
    );
    expect(r.nome).toBe("executor-reforcado");
    expect(r.motivo).toContain("enviesando");
  });

  it("estratégia já no topo (reforco null) não escala nem com tentativas", () => {
    const r = resolverAgente(
      { tarefa: tarefa({ id: "T-001", agente: "engine", tentativas: 2 }), papel: "construtor" },
      "software",
      equipe(["engine"]),
      { ...base, reforco: null },
    );
    expect(r.nome).toBe("engine");
    expect(r.modelo).toBeNull();
  });

  // O gatilho do reforço é "a CONSTRUÇÃO falhou". Subir o verificador junto pagaria modelo
  // caro para reexecutar a mesma bateria de testes.
  it("verificador e revisor NUNCA escalam de modelo", () => {
    for (const papel of ["verificador", "revisor"] as const) {
      const r = resolverAgente(
        { tarefa: tarefa({ id: "T-001", tentativas: 2 }), papel },
        "software",
        null,
        base,
      );
      expect(r.modelo).toBeNull();
      expect(r.nome).not.toContain("-reforcado");
    }
  });
});

describe("deveBloquear / deveReplanejar", () => {
  it("bloqueia no 4º ciclo, não antes", () => {
    expect(deveBloquear(tarefa({ id: "T-1", tentativas: MAX_TENTATIVAS }))).toBe(false);
    expect(deveBloquear(tarefa({ id: "T-1", tentativas: MAX_TENTATIVAS + 1 }))).toBe(true);
  });

  it("replaneja uma vez por linhagem; a substituta esgotada vai para o usuário", () => {
    expect(deveReplanejar(tarefa({ id: "T-1", tentativas: 4 }))).toBe(true);
    expect(deveReplanejar(tarefa({ id: "T-1a", tentativas: 4, replanejadaDe: "T-1" }))).toBe(false);
  });

  it("não replaneja tarefa que ainda tem tentativa", () => {
    expect(deveReplanejar(tarefa({ id: "T-1", tentativas: 2 }))).toBe(false);
  });
});

describe("proximosPassos — desempate por quem destrava mais", () => {
  /**
   * A ordem que o `/trabalhar` sempre prometeu e o código não fazia: no empate de prioridade
   * caía direto no id, que é a ordem de CRIAÇÃO. Numa fase madura isso inverte a fila, porque
   * a tarefa que abre caminho para outras costuma nascer depois delas.
   */
  it("entre iguais, a que destrava mais tarefas vem primeiro — não a de id menor", () => {
    const t = [
      tarefa({ id: "T-001", status: "pronta", prioridade: "alta" }),
      tarefa({ id: "T-009", status: "pronta", prioridade: "alta" }),
      // Três esperam pela T-009; nenhuma espera pela T-001.
      tarefa({ id: "T-010", status: "backlog", dependencias: ["T-009"] }),
      tarefa({ id: "T-011", status: "backlog", dependencias: ["T-009"] }),
      tarefa({ id: "T-012", status: "backlog", dependencias: ["T-009"] }),
    ];
    const ordem = proximosPassos(t, "software").map((p) => p.tarefa.id);
    expect(ordem[0]).toBe("T-009");
  });

  it("prioridade ainda manda: `alta` sem dependentes vence `media` com muitos", () => {
    const t = [
      tarefa({ id: "T-001", status: "pronta", prioridade: "alta" }),
      tarefa({ id: "T-002", status: "pronta", prioridade: "media" }),
      tarefa({ id: "T-003", status: "backlog", dependencias: ["T-002"] }),
      tarefa({ id: "T-004", status: "backlog", dependencias: ["T-002"] }),
    ];
    expect(proximosPassos(t, "software").map((p) => p.tarefa.id)[0]).toBe("T-001");
  });

  /**
   * Dependente CONCLUÍDA não espera por ninguém. Contá-la faria uma tarefa antiga parecer
   * urgente para sempre — a contagem tem de medir espera viva, não histórico.
   */
  it("dependente já concluída não conta como quem espera", () => {
    const t = [
      tarefa({ id: "T-001", status: "pronta", prioridade: "alta" }),
      tarefa({ id: "T-009", status: "pronta", prioridade: "alta" }),
      tarefa({ id: "T-010", status: "concluida", dependencias: ["T-009"] }),
      tarefa({ id: "T-011", status: "concluida", dependencias: ["T-009"] }),
    ];
    // Empate real em 0 dependentes vivos → volta a valer o id, que é o determinismo.
    expect(proximosPassos(t, "software").map((p) => p.tarefa.id)[0]).toBe("T-001");
  });
});
