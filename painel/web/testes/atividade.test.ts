import { describe, expect, it } from "vitest";
import {
  agenteAtivo,
  atividadePorAgente,
  etapaDoAgente,
  montarGrafoExecucao,
  montarMapaPlano,
  segmentarPorAgente,
  tarefaEmFoco,
} from "../src/lib/atividade";
import type { LinhaLog, Plano, TarefaCompleta } from "../src/lib/tipos";

function log(nivel: string, texto: string, em = "2026-07-27T10:00:00Z"): LinhaLog {
  return { nivel, texto, em };
}

function tarefa(id: string, status: string, agente: string | null = null): TarefaCompleta {
  return {
    arquivo: `${id}.md`,
    id,
    titulo: `Tarefa ${id}`,
    status,
    prioridade: "media",
    dependencias: [],
    areas: [],
    tentativas: 0,
    replanejadaDe: null,
    agente,
    criada: null,
    atualizada: null,
    erros: [],
    secoes: {
      objetivo: "",
      contexto: "",
      criteriosAceite: "",
      notasExecucao: "",
      verificacao: "",
      revisao: "",
    },
  };
}

describe("agenteAtivo / atividadePorAgente", () => {
  // O formato vem do runner-claude: `Agent → domain`, `(subagente) Task → testador`.
  it("reconhece o formato real do log de despacho", () => {
    const linhas = [
      log("ferramenta", "Agent → domain", "2026-07-27T10:00:00Z"),
      log("ferramenta", "(subagente) Task → testador", "2026-07-27T10:01:00Z"),
    ];
    expect(atividadePorAgente(linhas).map((a) => a.id)).toEqual(["testador", "domain"]);
  });

  it("agenteAtivo devolve o despacho MAIS RECENTE", () => {
    const linhas = [
      log("ferramenta", "Agent → domain", "2026-07-27T10:00:00Z"),
      log("assistente", "escrevendo código…", "2026-07-27T10:00:30Z"),
      log("ferramenta", "Agent → revisor", "2026-07-27T10:02:00Z"),
    ];
    expect(agenteAtivo(linhas)).toBe("revisor");
  });

  it("ignora ferramentas que NÃO são despacho de subagente", () => {
    const linhas = [
      log("ferramenta", "Read"),
      log("ferramenta", "Bash"),
      log("assistente", "Agent → falso (isto é texto, não despacho)"),
    ];
    expect(agenteAtivo(linhas)).toBeNull();
    expect(atividadePorAgente(linhas)).toEqual([]);
  });

  it("conta as vezes e guarda o último momento de cada agente", () => {
    const linhas = [
      log("ferramenta", "Agent → domain", "2026-07-27T10:00:00Z"),
      log("ferramenta", "Agent → testador", "2026-07-27T10:01:00Z"),
      log("ferramenta", "Agent → domain", "2026-07-27T10:03:00Z"),
    ];
    const porAgente = atividadePorAgente(linhas);
    const domain = porAgente.find((a) => a.id === "domain");
    expect(domain?.vezes).toBe(2);
    expect(domain?.ultimoEm).toBe("2026-07-27T10:03:00Z");
    expect(porAgente[0]?.id).toBe("domain"); // mais recente primeiro
  });

  it("log vazio não quebra", () => {
    expect(agenteAtivo([])).toBeNull();
    expect(atividadePorAgente([])).toEqual([]);
  });
});

describe("segmentarPorAgente", () => {
  it("agrupa o log em trechos, um por despacho", () => {
    const linhas = [
      log("inicio", "Sessão iniciada", "2026-07-27T10:00:00Z"),
      log("ferramenta", "Agent → domain", "2026-07-27T10:00:10Z"),
      log("subagente", "implementando…", "2026-07-27T10:00:20Z"),
      log("ferramenta", "Agent → testador", "2026-07-27T10:01:00Z"),
      log("subagente", "rodando testes", "2026-07-27T10:01:30Z"),
    ];
    const s = segmentarPorAgente(linhas);
    expect(s.map((x) => x.agente)).toEqual([null, "domain", "testador"]);
    expect(s[0]?.linhas).toHaveLength(1); // o que veio antes do 1º despacho
    expect(s[1]?.etapa).toBe("construtor");
    expect(s[2]?.etapa).toBe("testador");
  });

  it("a linha do despacho é cabeçalho do trecho, não conteúdo dele", () => {
    const linhas = [
      log("ferramenta", "Agent → domain", "2026-07-27T10:00:00Z"),
      log("assistente", "oi", "2026-07-27T10:00:05Z"),
    ];
    const s = segmentarPorAgente(linhas);
    expect(s).toHaveLength(1);
    expect(s[0]?.linhas.map((l) => l.texto)).toEqual(["oi"]);
  });

  it("calcula a duração do trecho pelo primeiro e último evento", () => {
    const linhas = [
      log("ferramenta", "Agent → domain", "2026-07-27T10:00:00Z"),
      log("assistente", "a", "2026-07-27T10:00:05Z"),
      log("assistente", "b", "2026-07-27T10:00:35Z"),
    ];
    expect(segmentarPorAgente(linhas)[0]?.duracaoMs).toBe(35000);
  });

  it("log sem despacho nenhum vira um único trecho do orquestrador", () => {
    const s = segmentarPorAgente([log("assistente", "pensando")]);
    expect(s).toHaveLength(1);
    expect(s[0]?.agente).toBeNull();
    expect(s[0]?.etapa).toBeNull();
  });

  it("log vazio não gera trecho", () => {
    expect(segmentarPorAgente([])).toEqual([]);
  });
});

describe("etapaDoAgente / tarefaEmFoco", () => {
  it("testador e revisor são etapas próprias; o resto é construtor", () => {
    expect(etapaDoAgente("testador")).toBe("testador");
    expect(etapaDoAgente("revisor")).toBe("revisor");
    expect(etapaDoAgente("domain")).toBe("construtor");
    expect(etapaDoAgente("executor")).toBe("construtor");
    expect(etapaDoAgente(null)).toBeNull();
  });

  it("pega a ÚLTIMA tarefa citada no log", () => {
    const linhas = [
      log("assistente", "começando a T-001"),
      log("assistente", "agora a T-014 depende dela"),
    ];
    expect(tarefaEmFoco(linhas)).toBe("T-014");
  });

  it("sem tarefa citada devolve null", () => {
    expect(tarefaEmFoco([log("assistente", "sem id aqui")])).toBeNull();
  });
});

describe("montarGrafoExecucao", () => {
  /** tarefa com dependências e áreas, para exercitar o grafo. */
  function tg(id: string, deps: string[], areas: string[], status = "backlog"): TarefaCompleta {
    return { ...tarefa(id, status), dependencias: deps, areas };
  }

  // Espelha o caso REAL do ia-hibrida-limpa, que motivou esta visualização.
  it("nivela um plano com bifurcação e acha o paralelismo real", () => {
    const g = montarGrafoExecucao([
      tg("T-001", [], ["gerador.py"]),
      tg("T-002", ["T-001"], ["gerador.py"]),
      tg("T-003", ["T-002"], ["app.py"]),
      tg("T-004", ["T-003"], ["app.py"]),
      tg("T-005", ["T-002"], ["tests/"]),
      tg("T-006", ["T-004", "T-005"], ["docs.md"]),
    ]);

    expect(g.niveis.map((n) => n.tarefas.map((t) => t.id))).toEqual([
      ["T-001"],
      ["T-002"],
      ["T-003", "T-005"], // o ramo que pode ir em paralelo
      ["T-004"],
      ["T-006"],
    ]);
    // T-003 e T-005 tocam arquivos diferentes → rodam juntas.
    expect(g.niveis[2]?.loteParalelo).toEqual(["T-003", "T-005"]);
    expect(g.paralelismoMaximo).toBe(2);
    expect(g.ciclos).toEqual([]);
  });

  it("mesmo nível mas MESMA área: não paraleliza (agentes dividem a árvore de arquivos)", () => {
    const g = montarGrafoExecucao([
      tg("T-001", [], ["app.py"]),
      tg("T-002", [], ["app.py"]),
      tg("T-003", [], ["outro.py"]),
    ]);
    expect(g.niveis[0]?.tarefas).toHaveLength(3);
    expect(g.niveis[0]?.loteParalelo).toEqual(["T-001", "T-003"]); // T-002 colide com T-001
  });

  it("respeita o teto de 3 construtores em paralelo", () => {
    const g = montarGrafoExecucao(
      ["a", "b", "c", "d", "e"].map((x, i) => tg(`T-00${i + 1}`, [], [`${x}.py`])),
    );
    expect(g.niveis[0]?.loteParalelo).toHaveLength(3);
  });

  it("tarefa concluída/cancelada não ocupa vaga no lote", () => {
    const g = montarGrafoExecucao([
      tg("T-001", [], ["a.py"], "concluida"),
      tg("T-002", [], ["b.py"], "cancelada"),
      tg("T-003", [], ["c.py"], "pronta"),
    ]);
    expect(g.niveis[0]?.loteParalelo).toEqual(["T-003"]);
  });

  it("CICLO é detectado em vez de travar em laço infinito", () => {
    const g = montarGrafoExecucao([
      tg("T-001", ["T-002"], ["a"]),
      tg("T-002", ["T-001"], ["b"]),
      tg("T-003", [], ["c"]),
    ]);
    expect(g.ciclos.sort()).toEqual(["T-001", "T-002"]);
    expect(g.niveis[0]?.tarefas.map((t) => t.id)).toEqual(["T-003"]); // o resto segue
  });

  it("dependência para tarefa inexistente é reportada e ignorada no cálculo", () => {
    const g = montarGrafoExecucao([tg("T-001", ["T-999"], ["a"])]);
    expect(g.quebradas).toEqual([{ tarefa: "T-001", falta: "T-999" }]);
    expect(g.niveis[0]?.tarefas.map((t) => t.id)).toEqual(["T-001"]); // não trava
  });

  it("sem tarefas: grafo vazio, sem paralelismo", () => {
    const g = montarGrafoExecucao([]);
    expect(g.niveis).toEqual([]);
    expect(g.paralelismoMaximo).toBe(0);
  });
});

describe("montarMapaPlano", () => {
  const plano: Plano = {
    titulo: "Plano",
    visao: "visão",
    erros: [],
    fases: [
      { nome: "Fase 1", meta: "fundação", marco: null, tarefas: ["T-001", "T-002"] },
      { nome: "Fase 2", meta: "núcleo", marco: null, tarefas: ["T-003"] },
    ],
  };

  it("calcula progresso por fase", () => {
    const tarefas = [tarefa("T-001", "concluida"), tarefa("T-002", "pronta"), tarefa("T-003", "backlog")];
    const mapa = montarMapaPlano(plano, tarefas);

    expect(mapa.fases[0]?.concluidas).toBe(1);
    expect(mapa.fases[0]?.total).toBe(2);
    expect(mapa.fases[0]?.percentual).toBe(50);
    expect(mapa.fases[1]?.percentual).toBe(0);
  });

  // Honestidade: plano desatualizado tem que APARECER, não inflar o percentual.
  it("id citado no plano sem arquivo vira idsAusentes e NÃO conta no total", () => {
    const mapa = montarMapaPlano(plano, [tarefa("T-001", "concluida")]);
    expect(mapa.fases[0]?.idsAusentes).toEqual(["T-002"]);
    expect(mapa.fases[0]?.total).toBe(1);
    expect(mapa.fases[0]?.percentual).toBe(100); // 1 de 1 que existe de fato
  });

  it("tarefa que nenhuma fase cita vai para semFase (nunca some da visão)", () => {
    const tarefas = [tarefa("T-001", "concluida"), tarefa("T-099", "pronta")];
    const mapa = montarMapaPlano(plano, tarefas);
    expect(mapa.semFase.map((t) => t.id)).toEqual(["T-099"]);
  });

  it("fase sem tarefa nenhuma conta 0%, não 100%", () => {
    const vazio: Plano = { ...plano, fases: [{ nome: "F", meta: "", marco: null, tarefas: [] }] };
    expect(montarMapaPlano(vazio, []).fases[0]?.percentual).toBe(0);
  });

  it("sem plano: todas as tarefas caem em semFase", () => {
    const tarefas = [tarefa("T-001", "pronta")];
    const mapa = montarMapaPlano(null, tarefas);
    expect(mapa.fases).toEqual([]);
    expect(mapa.semFase).toHaveLength(1);
  });
});
