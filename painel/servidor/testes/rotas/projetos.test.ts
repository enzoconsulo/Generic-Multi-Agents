import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { ProjetoDetalhe, TarefaCompleta } from "../../src/fabrica/tipos.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(aqui, "..", "fixtures", "fabrica-falsa");

// Override da raiz da fábrica ANTES de o config.ts carregar (ele lê FABRICA_RAIZ na
// carga do módulo) — por isso o import do app é dinâmico. O vitest isola os módulos
// por arquivo de teste, então o override não vaza para os demais testes.
process.env.FABRICA_RAIZ = FIXTURE;
const { criarApp } = await import("../../src/app.js");
const app = await criarApp();

interface ItemLista {
  nome: string;
  contagemPorStatus: Record<string, number>;
  faseAtual: { nome: string; marco: { estado: string } } | null;
  erros: string[];
}

describe("GET /api/projetos (fábrica-fixture da T-003 via override da raiz)", () => {
  it("lista os projetos com contagens, fase atual e estado do marco", async () => {
    const resposta = await request(app).get("/api/projetos");

    expect(resposta.status).toBe(200);
    expect(resposta.headers["content-type"]).toContain("application/json");

    const projetos = resposta.body.projetos as ItemLista[];
    expect(projetos.map((p) => p.nome)).toEqual(["alfa", "beta"]);

    const alfa = projetos.find((p) => p.nome === "alfa");
    expect(alfa?.contagemPorStatus).toEqual({
      backlog: 1,
      pronta: 0,
      "em-execucao": 1,
      "em-teste": 0,
      "em-revisao": 0,
      concluida: 1,
      bloqueada: 0,
      cancelada: 0,
    });
    expect(alfa?.faseAtual?.nome).toBe("Fase 2 — Núcleo");
    expect(alfa?.faseAtual?.marco.estado).toBe("pendente");

    const beta = projetos.find((p) => p.nome === "beta");
    expect(beta?.erros).toContain("projeto sem pasta _gestao/");
    expect(beta?.faseAtual).toBeNull();

    // Lista leve: o corpo das tarefas só existe no detalhe.
    for (const projeto of projetos) {
      expect("tarefas" in projeto).toBe(false);
    }
  });
});

describe("GET /api/projetos/:nome", () => {
  it("devolve o detalhe do alfa: tarefas com frontmatter + corpo, plano e textos", async () => {
    const resposta = await request(app).get("/api/projetos/alfa");

    expect(resposta.status).toBe(200);
    const detalhe = resposta.body as ProjetoDetalhe;
    expect(detalhe.nome).toBe("alfa");
    expect(detalhe.tarefas).toHaveLength(5);

    const t1 = detalhe.tarefas.find((t) => t.id === "T-001") as TarefaCompleta;
    expect(t1).toMatchObject({
      titulo: "Montar a fundação do alfa",
      status: "concluida",
      prioridade: "alta",
      tentativas: 1,
    });
    expect(t1.secoes.objetivo).toContain("Fundação do projeto alfa");
    expect(t1.secoes.notasExecucao).toContain("abc1111");

    expect(detalhe.plano?.fases.map((f) => f.nome)).toEqual([
      "Fase 1 — Fundação",
      "Fase 2 — Núcleo",
      "Fase 3 — Refinamento",
    ]);
    expect(detalhe.plano?.fases[0]?.marco?.estado).toBe("aprovado");
    expect(detalhe.plano?.fases[1]?.marco?.estado).toBe("pendente");

    expect(detalhe.decisoes).toContain("Stack mínima");
    expect(typeof detalhe.progresso).toBe("string");
    // O alfa TEM _gestao/ANALISE.md — o conteúdo vem inteiro.
    expect(detalhe.analise).toContain("Análise de exemplo");
  });

  it("analise (e demais textos) são null quando os arquivos não existem — beta", async () => {
    const resposta = await request(app).get("/api/projetos/beta");

    expect(resposta.status).toBe(200);
    const detalhe = resposta.body as ProjetoDetalhe;
    expect(detalhe.analise).toBeNull();
    expect(detalhe.decisoes).toBeNull();
    expect(detalhe.plano).toBeNull();
    expect(detalhe.tarefas).toEqual([]);
    expect(detalhe.erros).toContain("projeto sem pasta _gestao/");
  });

  it("projeto inexistente responde 404 em JSON com mensagem em PT-BR", async () => {
    const resposta = await request(app).get("/api/projetos/nao-existe");

    expect(resposta.status).toBe(404);
    expect(resposta.headers["content-type"]).toContain("application/json");
    expect(resposta.body.erro).toContain("não encontrado");
  });

  it("nome com travessia de caminho responde 404 (nunca sai de projetos/)", async () => {
    const encodada = await request(app).get("/api/projetos/..%2Falfa");
    expect(encodada.status).toBe(404);

    const pontos = await request(app).get("/api/projetos/%2e%2e");
    expect(pontos.status).toBe(404);
  });
});
