import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { AcaoFabrica } from "../../src/fabrica/catalogo-acoes.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(aqui, "..", "fixtures", "fabrica-falsa");

// Override da raiz da fábrica ANTES de o config.ts carregar (ele lê FABRICA_RAIZ na
// carga do módulo) — por isso o import do app é dinâmico. O vitest isola os módulos
// por arquivo de teste, então o override não vaza para os demais testes.
process.env.FABRICA_RAIZ = FIXTURE;
const { criarApp } = await import("../../src/app.js");
const app = await criarApp();

describe("GET /api/fabrica (fábrica-fixture da T-003 via override da raiz)", () => {
  it("responde 200 em JSON com as 6 ações na ordem canônica, todas indisponíveis", async () => {
    const resposta = await request(app).get("/api/fabrica");

    expect(resposta.status).toBe(200);
    expect(resposta.headers["content-type"]).toContain("application/json");

    const acoes = resposta.body.acoes as AcaoFabrica[];
    expect(acoes.map((a) => a.id)).toEqual([
      "novo-projeto",
      "ideia",
      "trabalhar",
      "status",
      "encerrar-dia",
      "manutencao",
    ]);
    for (const acao of acoes) {
      expect(acao.nome).toBe(`/${acao.id}`);
      expect(acao.disponivel).toBe(true);
      // A fixture não tem .claude/commands/ — descrições vêm do fallback em PT-BR.
      expect(acao.descricao.length).toBeGreaterThan(0);
    }
  });

  it("traz o resumo agregado: nº de projetos e tarefas por status somadas", async () => {
    const resposta = await request(app).get("/api/fabrica");

    expect(resposta.body.resumo.projetos).toBe(2); // alfa e beta (solto.txt não conta)
    // Soma de alfa (T-003 "fritando" e T-004 quebrada ficam fora) + beta (zerado).
    expect(resposta.body.resumo.tarefasPorStatus).toEqual({
      backlog: 1,
      pronta: 0,
      "em-execucao": 1,
      "em-teste": 0,
      "em-revisao": 0,
      concluida: 1,
      bloqueada: 0,
      cancelada: 0,
    });
    expect(resposta.body.erros).toEqual([]);
  });
});
