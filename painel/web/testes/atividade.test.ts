import { describe, expect, it } from "vitest";
import {
  agenteAtivo,
  atividadePorAgente,
  etapaDoAgente,
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
