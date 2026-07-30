import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GerenciadorJobs } from "../../src/jobs/fila.js";
import { GerenteResumos } from "../../src/jobs/resumo/gerente-resumos.js";
import type { Consulta } from "../../src/jobs/claude/runner-claude.js";
import { aguardarEstado, criarRunnerManual, dirTemporario, type RunnerManual } from "../jobs/ajudantes.js";

/** SDK falso: conta chamadas e devolve sempre um resumo válido. */
function sdkFalso() {
  let chamadas = 0;
  const consulta: Consulta = () => {
    chamadas += 1;
    return (async function* () {
      yield {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: '{"linhas":["Fez o trabalho."],"itens":[{"tipo":"feito","texto":"algo"}]}' },
          ],
        },
      };
      yield { type: "result", total_cost_usd: 0.0003 };
    })();
  };
  return { consulta, contar: () => chamadas };
}

describe("GerenteResumos (T-039)", () => {
  let dir: string;
  let ger: GerenciadorJobs;
  let manual: RunnerManual;
  let gerente: GerenteResumos;
  let sdk: ReturnType<typeof sdkFalso>;

  beforeEach(() => {
    dir = dirTemporario();
    ger = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 2 });
    manual = criarRunnerManual();
    ger.registrarRunner("manual", manual.runner);
    sdk = sdkFalso();
    gerente = new GerenteResumos(ger, sdk.consulta);
    gerente.iniciar();
  });

  afterEach(() => {
    gerente.parar();
    rmSync(dir, { recursive: true, force: true });
  });

  function jobClaude(usaClaude = true) {
    return ger.criarJob({ tipo: "manual", titulo: "x", escopo: "projeto:alfa", usaClaude });
  }

  function log(jobId: string, nivel: string, texto: string) {
    ger.emissor.emit("evento", { jobId, tipo: "log", dados: { nivel, texto }, em: new Date().toISOString() });
  }

  it("resume quando um despacho fecha o trecho anterior", async () => {
    const job = jobClaude();
    await aguardarEstado(ger, job.id, "executando");

    log(job.id, "assistente", "vou despachar o executor");
    log(job.id, "ferramenta", "Task → executor"); // fecha o trecho do orquestrador
    await gerente.aguardar();

    const resumos = ger.obter(job.id)?.resumos ?? [];
    expect(resumos).toHaveLength(1);
    expect(resumos[0]?.indice).toBe(0);
    expect(resumos[0]?.agente).toBeNull();
    expect(resumos[0]?.linhas[0]).toBe("Fez o trabalho.");
    expect(resumos[0]?.custoUsd).toBe(0.0003);
  });

  it("o fim do job fecha o ÚLTIMO trecho — senão a conclusão nunca seria resumida", async () => {
    const job = jobClaude();
    await aguardarEstado(ger, job.id, "executando");

    log(job.id, "ferramenta", "Task → revisor");
    log(job.id, "subagente", "nenhum bug encontrado");
    manual.concluir(job.id, { ok: true });
    await aguardarEstado(ger, job.id, "concluido");
    await gerente.aguardar();

    const resumos = ger.obter(job.id)?.resumos ?? [];
    expect(resumos.map((r) => r.agente)).toEqual(["revisor"]);
  });

  it("NÃO resume job que não usa Claude (CI não tem agente)", async () => {
    const job = jobClaude(false);
    await aguardarEstado(ger, job.id, "executando");

    log(job.id, "log", "npm install...");
    log(job.id, "ferramenta", "Task → executor");
    await gerente.aguardar();

    expect(ger.obter(job.id)?.resumos ?? []).toEqual([]);
    expect(sdk.contar()).toBe(0);
  });

  it("trecho sem texto não gasta chamada", async () => {
    const job = jobClaude();
    await aguardarEstado(ger, job.id, "executando");

    log(job.id, "ferramenta", "Read a.ts");
    log(job.id, "ferramenta", "Task → executor");
    await gerente.aguardar();

    expect(sdk.contar()).toBe(0);
  });

  it("emite evento `resumo` para a UI atualizar ao vivo", async () => {
    const job = jobClaude();
    await aguardarEstado(ger, job.id, "executando");

    const vistos: unknown[] = [];
    ger.emissor.on("evento", (e: { tipo: string; dados?: unknown }) => {
      if (e.tipo === "resumo") vistos.push(e.dados);
    });

    log(job.id, "assistente", "algo aconteceu");
    log(job.id, "ferramenta", "Task → executor");
    await gerente.aguardar();

    expect(vistos).toHaveLength(1);
  });

  it("resumidor que explode não derruba o job nem a fila", async () => {
    // Resumo é conveniência: sem ele o console mostra o texto cru e o fluxo segue igual.
    const explosivo: Consulta = () => {
      throw new Error("SDK fora");
    };
    const g2 = new GerenteResumos(ger, explosivo);
    gerente.parar();
    g2.iniciar();

    const job = jobClaude();
    await aguardarEstado(ger, job.id, "executando");
    log(job.id, "assistente", "texto");
    log(job.id, "ferramenta", "Task → executor");
    await g2.aguardar();

    // O resumo veio marcado como "não deu" — e o job seguiu executando normalmente.
    expect(ger.obter(job.id)?.resumos?.[0]?.naoDeu).toBe(true);
    expect(ger.obter(job.id)?.estado).toBe("executando");
    manual.concluir(job.id, { ok: true });
    await aguardarEstado(ger, job.id, "concluido");
    g2.parar();
  });

  it("resumo do mesmo trecho substitui em vez de duplicar", async () => {
    const job = jobClaude();
    await aguardarEstado(ger, job.id, "executando");
    ger.anexarResumo(job.id, { indice: 0, agente: null, linhas: ["a"], itens: [], custoUsd: null, naoDeu: false });
    ger.anexarResumo(job.id, { indice: 0, agente: null, linhas: ["b"], itens: [], custoUsd: null, naoDeu: false });

    const resumos = ger.obter(job.id)?.resumos ?? [];
    expect(resumos).toHaveLength(1);
    expect(resumos[0]?.linhas).toEqual(["b"]);
  });
});

describe("GerenteResumos × limite de uso (T-045)", () => {
  let dir: string;
  let ger: GerenciadorJobs;
  let manual: RunnerManual;
  let gerente: GerenteResumos;
  let sdk: ReturnType<typeof sdkFalso>;

  beforeEach(() => {
    dir = dirTemporario();
    ger = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 2 });
    manual = criarRunnerManual();
    ger.registrarRunner("manual", manual.runner);
    sdk = sdkFalso();
    gerente = new GerenteResumos(ger, sdk.consulta);
    gerente.iniciar();
  });

  afterEach(() => {
    gerente.parar();
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * O resumidor usa a MESMA assinatura do fluxo. Se o job morreu por cota esgotada,
   * resumir é chamada garantidamente perdida — foi o que produziu os dois cartões
   * `naoDeu` da rodada real de 2026-07-29.
   */
  function terminar(jobId: string, resultado: unknown) {
    ger.emissor.emit("evento", {
      jobId,
      tipo: "estado",
      dados: {
        de: "executando",
        para: "falhou",
        job: { id: jobId, usaClaude: true, resultado },
      },
      em: new Date().toISOString(),
    });
  }

  function logDe(jobId: string) {
    ger.emissor.emit("evento", {
      jobId,
      tipo: "log",
      dados: { nivel: "assistente", texto: "Comecei a trabalhar no plano." },
      em: new Date().toISOString(),
    });
  }

  it("não gasta chamada de resumo quando o job parou por cota esgotada", async () => {
    const job = ger.criarJob({ tipo: "manual", titulo: "x", escopo: "global", usaClaude: true });
    await aguardarEstado(ger, job.id, "executando");
    logDe(job.id);
    terminar(job.id, { motivo: "limite-uso", reabreEm: "2:40pm" });
    await gerente.aguardar();
    expect(sdk.contar()).toBe(0);
    manual.concluir(job.id);
  });

  it("segue resumindo quando a falha foi por outro motivo", async () => {
    const job = ger.criarJob({ tipo: "manual", titulo: "y", escopo: "global", usaClaude: true });
    await aguardarEstado(ger, job.id, "executando");
    logDe(job.id);
    terminar(job.id, { custoUsd: 0.02 });
    await gerente.aguardar();
    expect(sdk.contar()).toBe(1);
    manual.concluir(job.id);
  });
});
