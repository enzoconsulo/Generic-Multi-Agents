import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApp } from "../../src/app.js";
import type { GerenciadorJobs } from "../../src/jobs/fila.js";
import { obterGerenciador, reiniciarGerenciador } from "../../src/jobs/instancia.js";
import type {
  ContextoExecucao,
  EstadoJob,
  NovaPendencia,
  RespostaInput,
  Runner,
} from "../../src/jobs/tipos.js";

let app: Express;
let gerenciador: GerenciadorJobs;

beforeEach(async () => {
  reiniciarGerenciador({ dirJobs: mkdtempSync(join(tmpdir(), "inputs-")), tetoClaude: 2 });
  gerenciador = obterGerenciador();
  app = await criarApp();
});

/** Runner que, ao executar, pede UM input e guarda a resposta que recebeu. */
function runnerPedinte(nova: NovaPendencia) {
  const capturado: { resposta?: RespostaInput; erro?: string } = {};
  const runner: Runner = {
    async executar(_job, ctx: ContextoExecucao) {
      try {
        capturado.resposta = await ctx.pedirInput(nova);
      } catch (e) {
        capturado.erro = e instanceof Error ? e.message : String(e);
        throw e;
      }
      return { ok: true };
    },
  };
  return { runner, capturado };
}

async function aguardarEstado(id: string, estado: EstadoJob, timeout = 2000): Promise<void> {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    if (gerenciador.obter(id)?.estado === estado) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`Timeout: job ${id} não chegou a "${estado}" (está "${gerenciador.obter(id)?.estado}")`);
}

describe("Inputs pendentes (T-010)", () => {
  it("pausa em aguardando-input, lista a pendência (PT-BR), emite SSE e destrava ao aprovar", async () => {
    const eventos: string[] = [];
    gerenciador.emissor.on("evento", (e: { tipo: string }) => eventos.push(e.tipo));

    const { runner, capturado } = runnerPedinte({
      tipo: "aprovacao-ferramenta",
      titulo: "Aprovar uso da ferramenta \"Bash\"?",
      descricao: "O fluxo quer usar Bash com: rm -rf algo",
    });
    gerenciador.registrarRunner("ti", runner);
    const job = gerenciador.criarJob({ tipo: "ti", titulo: "t", escopo: "global", usaClaude: false });

    await aguardarEstado(job.id, "aguardando-input");

    const lista = await request(app).get("/api/inputs");
    expect(lista.status).toBe(200);
    expect(lista.body.inputs).toHaveLength(1);
    const pend = lista.body.inputs[0];
    expect(pend.titulo).toContain("Aprovar");
    expect(pend.descricao).toContain("Bash");
    expect(pend.jobId).toBe(job.id);
    expect(eventos).toContain("input-pendente");

    const resp = await request(app).post(`/api/inputs/${pend.id}/resposta`).send({ aprovado: true });
    expect(resp.status).toBe(200);

    await aguardarEstado(job.id, "concluido");
    expect(capturado.resposta?.aprovado).toBe(true);
    // A pendência respondida fica no metadado do job (auditoria).
    expect(gerenciador.obter(job.id)?.inputs?.[0]?.resposta?.aprovado).toBe(true);
    // Some da lista de abertas.
    expect((await request(app).get("/api/inputs")).body.inputs).toHaveLength(0);
  });

  it("negação (deny) chega ao runner e o job NÃO trava nem falha por isso", async () => {
    const { runner, capturado } = runnerPedinte({
      tipo: "aprovacao-ferramenta",
      titulo: "Aprovar?",
      descricao: "algo",
    });
    gerenciador.registrarRunner("ti", runner);
    const job = gerenciador.criarJob({ tipo: "ti", titulo: "t", escopo: "global", usaClaude: false });

    await aguardarEstado(job.id, "aguardando-input");
    const pend = (await request(app).get("/api/inputs")).body.inputs[0];
    const resp = await request(app)
      .post(`/api/inputs/${pend.id}/resposta`)
      .send({ aprovado: false, mensagem: "não pode" });
    expect(resp.status).toBe(200);

    await aguardarEstado(job.id, "concluido");
    expect(capturado.resposta?.aprovado).toBe(false);
    expect(capturado.resposta?.mensagem).toBe("não pode");
  });

  it("pergunta com opções: a escolha do usuário chega ao runner", async () => {
    const { runner, capturado } = runnerPedinte({
      tipo: "pergunta",
      titulo: "Pergunta do fluxo",
      descricao: "Qual banco usar?",
      opcoes: ["Postgres", "SQLite"],
    });
    gerenciador.registrarRunner("ti", runner);
    const job = gerenciador.criarJob({ tipo: "ti", titulo: "t", escopo: "global", usaClaude: false });

    await aguardarEstado(job.id, "aguardando-input");
    const pend = (await request(app).get("/api/inputs")).body.inputs[0];
    expect(pend.opcoes).toEqual(["Postgres", "SQLite"]);
    await request(app).post(`/api/inputs/${pend.id}/resposta`).send({ escolha: "SQLite" });

    await aguardarEstado(job.id, "concluido");
    expect(capturado.resposta?.escolha).toBe("SQLite");
  });

  it("responder pendência inexistente → 404; já respondida → 409", async () => {
    const r404 = await request(app).post("/api/inputs/naoexiste/resposta").send({ aprovado: true });
    expect(r404.status).toBe(404);

    const { runner } = runnerPedinte({ tipo: "aprovacao-ferramenta", titulo: "A?", descricao: "x" });
    gerenciador.registrarRunner("ti", runner);
    const job = gerenciador.criarJob({ tipo: "ti", titulo: "t", escopo: "global", usaClaude: false });
    await aguardarEstado(job.id, "aguardando-input");
    const pend = (await request(app).get("/api/inputs")).body.inputs[0];

    expect((await request(app).post(`/api/inputs/${pend.id}/resposta`).send({ aprovado: true })).status).toBe(200);
    await aguardarEstado(job.id, "concluido");
    const r409 = await request(app).post(`/api/inputs/${pend.id}/resposta`).send({ aprovado: true });
    expect(r409.status).toBe(409);
  });

  it("cancelar um job aguardando input destrava o runner (rejeita a pendência)", async () => {
    const { runner, capturado } = runnerPedinte({ tipo: "aprovacao-ferramenta", titulo: "A?", descricao: "x" });
    gerenciador.registrarRunner("ti", runner);
    const job = gerenciador.criarJob({ tipo: "ti", titulo: "t", escopo: "global", usaClaude: false });
    await aguardarEstado(job.id, "aguardando-input");

    gerenciador.cancelar(job.id);
    await aguardarEstado(job.id, "cancelado");
    expect(capturado.erro).toBeDefined(); // a Promise de input rejeitou
    expect((await request(app).get("/api/inputs")).body.inputs).toHaveLength(0);
  });
});
