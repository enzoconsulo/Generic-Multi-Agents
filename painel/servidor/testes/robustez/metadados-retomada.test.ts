import { rmSync } from "node:fs";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { criarApp } from "../../src/app.js";
import type { GerenciadorJobs } from "../../src/jobs/fila.js";
import { reiniciarGerenciador } from "../../src/jobs/instancia.js";
import type { Runner } from "../../src/jobs/tipos.js";
import { aguardarEstado, dirTemporario } from "../jobs/ajudantes.js";

/**
 * Metadados de retomada manual (T-019): `sessionId`/`cwd` gravados durante a execução
 * têm que aparecer no `GET /api/jobs/:id` — inclusive de um job que NÃO concluiu, que é
 * exatamente o caso em que retomar à mão importa.
 */
describe("GET /api/jobs/:id expõe metadados de retomada", () => {
  let dir: string;
  let ger: GerenciadorJobs;
  let app: Express;

  beforeEach(async () => {
    dir = dirTemporario();
    ger = reiniciarGerenciador({ dirJobs: dir, tetoClaude: 2 });
    app = await criarApp();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Runner que anota como o RunnerClaude faz no `system/init` e depois trava. */
  function runnerQueAnotaEPendura(): Runner {
    return {
      executar(_job, ctx) {
        ctx.anotar({ sessionId: "sess-abc123", cwd: "C:\\fabrica" });
        return new Promise(() => {
          /* nunca resolve: simula fluxo em andamento */
        });
      },
    };
  }

  it("job AINDA em execução já expõe sessionId e cwd", async () => {
    ger.registrarRunner("anotador", runnerQueAnotaEPendura());
    const job = ger.criarJob({
      tipo: "anotador",
      titulo: "Fluxo em andamento",
      escopo: "projeto:alfa",
      usaClaude: true,
    });
    await aguardarEstado(ger, job.id, "executando");
    await expect.poll(() => ger.obter(job.id)?.sessionId).toBe("sess-abc123");

    const resposta = await request(app).get(`/api/jobs/${job.id}`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.sessionId).toBe("sess-abc123");
    expect(resposta.body.cwd).toBe("C:\\fabrica");
  });

  it("metadados sobrevivem ao reinício do processo (persistidos, não só em memória)", async () => {
    ger.registrarRunner("anotador", runnerQueAnotaEPendura());
    const job = ger.criarJob({
      tipo: "anotador",
      titulo: "Fluxo que será interrompido",
      escopo: "projeto:alfa",
      usaClaude: true,
    });
    await aguardarEstado(ger, job.id, "executando");
    await expect.poll(() => ger.obter(job.id)?.sessionId).toBe("sess-abc123");

    // "Reinício": instância nova lendo o mesmo diretório.
    reiniciarGerenciador({ dirJobs: dir, tetoClaude: 2 });

    const resposta = await request(app).get(`/api/jobs/${job.id}`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.estado).toBe("interrompido"); // saneado no boot
    // E o que permite retomar à mão continua lá:
    expect(resposta.body.sessionId).toBe("sess-abc123");
    expect(resposta.body.cwd).toBe("C:\\fabrica");
  });
});
