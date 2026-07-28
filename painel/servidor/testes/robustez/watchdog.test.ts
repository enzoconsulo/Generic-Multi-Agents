import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GerenciadorJobs } from "../../src/jobs/fila.js";
import { Watchdog } from "../../src/jobs/robustez/watchdog.js";
import { aguardarEstado, criarRunnerManual, dirTemporario, type RunnerManual } from "../jobs/ajudantes.js";

/**
 * Watchdog de inatividade (T-019). Relógio INJETADO e `varrer()` chamado à mão: o teste
 * controla o tempo em vez de esperar de verdade — determinístico e instantâneo.
 */
describe("watchdog de inatividade", () => {
  let dir: string;
  let ger: GerenciadorJobs;
  let manual: RunnerManual;
  let relogio: number;
  let watchdog: Watchdog;

  const LIMITE = 60_000;

  beforeEach(() => {
    dir = dirTemporario();
    ger = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 2 });
    manual = criarRunnerManual();
    ger.registrarRunner("manual", manual.runner);
    relogio = 1_000_000;
    watchdog = new Watchdog(ger, { limiteMs: LIMITE, agora: () => relogio });
    watchdog.iniciar();
  });

  afterEach(() => {
    watchdog.parar();
    rmSync(dir, { recursive: true, force: true });
  });

  function jobClaude(projeto = "alfa") {
    return ger.criarJob({
      tipo: "manual",
      titulo: `Job de ${projeto}`,
      escopo: `projeto:${projeto}`,
      usaClaude: true,
    });
  }

  it("job que emite um evento e silencia é interrompido com motivo de inatividade", async () => {
    const job = jobClaude();
    await aguardarEstado(ger, job.id, "executando");
    expect(watchdog.vigiados).toContain(job.id);

    // Um sinal de vida, e depois silêncio total.
    relogio += 10_000;
    ger.emissor.emit("evento", { jobId: job.id, tipo: "log", em: "x" });

    // Ainda dentro da janela a partir do ÚLTIMO evento: não interrompe.
    relogio += LIMITE - 1_000;
    watchdog.varrer();
    expect(ger.obter(job.id)?.estado).toBe("executando");

    // Passou do limite: interrompe e o abort chega ao runner.
    relogio += 2_000;
    watchdog.varrer();

    const final = await aguardarEstado(ger, job.id, "interrompido");
    expect(final.erro).toMatch(/watchdog/i);
    expect(final.erro).toMatch(/atividade/i);
    expect(final.terminadoEm).toBeTruthy();
    expect(ger.executandoAgora).toBe(0);
  });

  it("job que segue emitindo eventos nunca é interrompido", async () => {
    const job = jobClaude();
    await aguardarEstado(ger, job.id, "executando");

    // Sinais de vida logo antes de cada estouro de janela, várias vezes.
    for (let i = 0; i < 5; i++) {
      relogio += LIMITE - 1_000;
      ger.emissor.emit("evento", { jobId: job.id, tipo: "log", em: "x" });
      watchdog.varrer();
      expect(ger.obter(job.id)?.estado).toBe("executando");
    }

    manual.concluir(job.id);
    await aguardarEstado(ger, job.id, "concluido");
  });

  it("job aguardando input NÃO é interrompido (esperar humano não é inatividade)", async () => {
    const job = jobClaude();
    await aguardarEstado(ger, job.id, "executando");

    // Simula a transição que a T-010 produz ao pendurar uma pergunta.
    ger.emissor.emit("evento", {
      jobId: job.id,
      tipo: "estado",
      em: "x",
      dados: { de: "executando", para: "aguardando-input", job: { ...ger.obter(job.id)! } },
    });
    expect(watchdog.vigiados).not.toContain(job.id);

    // Humano demora MUITO — e isso não pode matar o fluxo.
    relogio += LIMITE * 100;
    watchdog.varrer();
    expect(ger.obter(job.id)?.estado).toBe("executando"); // estado real segue o da fila

    manual.concluir(job.id);
    await aguardarEstado(ger, job.id, "concluido");
  });

  it("job não-Claude (CI/importação) fica fora da vigilância", async () => {
    const job = ger.criarJob({
      tipo: "manual",
      titulo: "CI do projeto",
      escopo: "projeto:beta",
      usaClaude: false,
    });
    await aguardarEstado(ger, job.id, "executando");
    expect(watchdog.vigiados).not.toContain(job.id);

    relogio += LIMITE * 10;
    watchdog.varrer();
    expect(ger.obter(job.id)?.estado).toBe("executando");

    manual.concluir(job.id);
    await aguardarEstado(ger, job.id, "concluido");
  });

  it("job que termina sozinho sai da vigilância (não interrompe job já terminal)", async () => {
    const job = jobClaude();
    await aguardarEstado(ger, job.id, "executando");
    manual.concluir(job.id);
    await aguardarEstado(ger, job.id, "concluido");

    expect(watchdog.vigiados).not.toContain(job.id);
    relogio += LIMITE * 10;
    watchdog.varrer(); // não pode lançar nem mexer no estado final
    expect(ger.obter(job.id)?.estado).toBe("concluido");
  });

  it("cancelamento do usuário prevalece sobre a interrupção do watchdog", async () => {
    const job = jobClaude();
    await aguardarEstado(ger, job.id, "executando");

    // Watchdog pede interrupção e o usuário cancela antes de o runner assentar.
    ger.interromper(job.id, "watchdog");
    ger.cancelar(job.id);

    const final = await aguardarEstado(ger, job.id, "cancelado");
    expect(final.estado).toBe("cancelado");
  });
});

/**
 * Limite POR AÇÃO (T-037). Achado numa execução real: a ação `pesquisar` foi cortada com
 * "mais de 15 min" apesar de estar configurada com 20 — o watchdog era construído uma vez
 * com o padrão e nunca consultava a tabela, deixando a coluna `watchdogMs` morta.
 *
 * A transição é ASSÍNCRONA (o abort viaja até o runner), então estes testes esperam o
 * estado como os de cima — checar logo após `varrer()` lê o estado velho.
 */
describe("watchdog respeita o limite que o job carrega", () => {
  let dir: string;
  let ger: GerenciadorJobs;
  let manual: RunnerManual;
  let relogio: number;
  let watchdog: Watchdog;

  const PADRAO = 60_000;

  beforeEach(() => {
    dir = dirTemporario();
    ger = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 4 });
    manual = criarRunnerManual();
    ger.registrarRunner("manual", manual.runner);
    relogio = 1_000_000;
    watchdog = new Watchdog(ger, { limiteMs: PADRAO, agora: () => relogio });
    watchdog.iniciar();
  });

  afterEach(() => {
    watchdog.parar();
    rmSync(dir, { recursive: true, force: true });
  });

  function jobCom(params: Record<string, unknown>, projeto: string) {
    return ger.criarJob({
      tipo: "manual",
      titulo: `Job de ${projeto}`,
      escopo: `projeto:${projeto}`,
      usaClaude: true,
      params,
    });
  }

  it("job paciente sobrevive à varredura que mata o job de limite padrão", async () => {
    // O teste que falharia com o comportamento antigo: com um limite global, os DOIS
    // morreriam na mesma varredura.
    const padrao = jobCom({}, "alfa");
    const paciente = jobCom({ watchdogMs: PADRAO * 5 }, "beta");
    await aguardarEstado(ger, padrao.id, "executando");
    await aguardarEstado(ger, paciente.id, "executando");

    relogio += PADRAO + 1_000;
    watchdog.varrer();

    await aguardarEstado(ger, padrao.id, "interrompido");
    expect(ger.obter(paciente.id)?.estado).toBe("executando");
    expect(watchdog.vigiados).toContain(paciente.id);
  });

  it("o job paciente também é cortado quando passa do SEU limite", async () => {
    const paciente = jobCom({ watchdogMs: PADRAO * 5 }, "beta");
    await aguardarEstado(ger, paciente.id, "executando");

    relogio += PADRAO * 5 + 1_000;
    watchdog.varrer();
    await aguardarEstado(ger, paciente.id, "interrompido");
  });

  it("a mensagem informa o limite que valeu para AQUELE job", async () => {
    // Dizer "1 min" onde valeram 5 é a mesma família da tela que mente.
    const paciente = jobCom({ watchdogMs: 5 * 60_000 }, "beta");
    await aguardarEstado(ger, paciente.id, "executando");

    relogio += 5 * 60_000 + 1_000;
    watchdog.varrer();
    const final = await aguardarEstado(ger, paciente.id, "interrompido");
    expect(final.erro).toContain("5 min");
  });

  it("watchdogMs inválido cai no padrão em vez de desligar a vigilância", async () => {
    // Zero/negativo/texto não podem virar "nunca interrompe" — seria pior que o bug.
    const ruins: unknown[] = [0, -5, "vinte", null];
    const jobs = ruins.map((ruim, i) => jobCom({ watchdogMs: ruim }, `p${i}`));
    for (const j of jobs) await aguardarEstado(ger, j.id, "executando");

    relogio += PADRAO + 1_000;
    watchdog.varrer();

    for (const [i, j] of jobs.entries()) {
      const final = await aguardarEstado(ger, j.id, "interrompido");
      expect(final.erro, `watchdogMs=${String(ruins[i])}`).toMatch(/watchdog/i);
    }
  });
});
