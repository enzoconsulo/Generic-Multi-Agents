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

  /**
   * REGRESSÃO das quedas de 08/08.
   *
   * O log só ia ao disco no ASSENTAMENTO, então processo morto no meio — que é exatamente o
   * caso que se precisa diagnosticar — não deixava UMA linha. Três jobs seguidos caíram
   * assim e o diagnóstico teve de sair de fora do painel. O teste simula a morte súbita da
   * única forma honesta: lê o arquivo com o job AINDA executando.
   */
  it("o log chega ao disco ENQUANTO o job executa (sobrevive a morte súbita)", async () => {
    const dir2 = dirTemporario();
    // Despejo imediato: o teste não pode depender de esperar 10s reais.
    const ger2 = new GerenciadorJobs({ dirJobs: dir2, tetoClaude: 2, intervaloDespejoMs: 0 });

    let liberar: () => void = () => {};
    const travado = new Promise<void>((r) => {
      liberar = r;
    });
    ger2.registrarRunner("travado", {
      async executar(_job: Job, ctx: ContextoExecucao) {
        ctx.emitir("log", { nivel: "inicio", texto: "comecei" });
        ctx.emitir("log", { nivel: "ferramenta", texto: "Bash: npm test" });
        await travado; // nunca assenta enquanto o teste não mandar
        return { ok: true };
      },
    });

    const job = ger2.criarJob({
      tipo: "travado",
      titulo: "/trabalhar",
      escopo: "global",
      usaClaude: true,
    });
    await aguardarEstado(ger2, job.id, "executando");
    await new Promise((r) => setTimeout(r, 50));

    // A prova: um gerenciador NOVO (= painel reaberto após a queda) acha o log no disco,
    // com o job da sessão anterior ainda sem ter assentado.
    const outroProcesso = new GerenciadorJobs({ dirJobs: dir2, tetoClaude: 2 });
    expect(outroProcesso.historicoDeLog(job.id).linhas.map((l) => l.texto)).toEqual([
      "comecei",
      "Bash: npm test",
    ]);

    liberar();
    await aguardarEstado(ger2, job.id, "concluido");
    rmSync(dir2, { recursive: true, force: true });
  });
});
