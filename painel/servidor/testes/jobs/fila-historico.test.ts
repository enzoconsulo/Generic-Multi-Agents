import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GerenciadorJobs } from "../../src/jobs/fila.js";
import type { ContextoExecucao, Job, Runner } from "../../src/jobs/tipos.js";
import { aguardarEstado, dirTemporario } from "./ajudantes.js";

/**
 * O log do job precisa sobreviver ao fim da execução (T-048).
 *
 * Antes, ele existia só no buffer do hub SSE — 500 eventos para a fábrica inteira — e o
 * job terminado abria sem uma linha. Foi o que faltou para explicar por que o
 * `/novo-projeto banco-imobiliario` parou no meio: a única evidência era o texto final
 * gravado no `resultado`, por sorte suficiente.
 */
describe("gerenciador — histórico de log do job", () => {
  let dir: string;
  let ger: GerenciadorJobs;

  /** Runner que emite algumas linhas e termina — o caminho normal de um fluxo. */
  const runnerFalante: Runner = {
    async executar(_job: Job, ctx: ContextoExecucao) {
      ctx.emitir("log", { nivel: "inicio", texto: "Sessão iniciada" });
      ctx.emitir("log", { nivel: "ferramenta", texto: "Write: PLANO.md" });
      ctx.emitir("log", { nivel: "resultado", texto: "Fluxo concluído" });
      return { ok: true };
    },
  };

  beforeEach(() => {
    dir = dirTemporario();
    ger = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 2 });
    ger.registrarRunner("falante", runnerFalante);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("depois de concluir, o log continua disponível pelo gerenciador", async () => {
    const job = ger.criarJob({
      tipo: "falante",
      titulo: "/novo-projeto teste",
      escopo: "global",
      usaClaude: true,
    });
    await aguardarEstado(ger, job.id, "concluido");

    const historico = ger.historicoDeLog(job.id);
    expect(historico.linhas.map((l) => l.texto)).toEqual([
      "Sessão iniciada",
      "Write: PLANO.md",
      "Fluxo concluído",
    ]);
    expect(historico.descartadas).toBe(0);
  });

  it("o log fica no disco: um gerenciador novo (reinício do painel) ainda o encontra", async () => {
    const job = ger.criarJob({
      tipo: "falante",
      titulo: "/status",
      escopo: "global",
      usaClaude: true,
    });
    await aguardarEstado(ger, job.id, "concluido");

    const depoisDoReinicio = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 2 });
    expect(depoisDoReinicio.historicoDeLog(job.id).linhas).toHaveLength(3);
  });

  it("job sem log nenhum devolve lista vazia, não erro", () => {
    expect(ger.historicoDeLog("nao-existe")).toEqual({ linhas: [], descartadas: 0 });
  });
});
