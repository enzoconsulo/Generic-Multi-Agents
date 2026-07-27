import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ConfigCi } from "../../src/ci/config.js";
import { RunnerCi, montarJobCi } from "../../src/ci/runner-ci.js";
import { GerenciadorJobs } from "../../src/jobs/fila.js";
import { aguardarEstado, criarRunnerManual, dirTemporario } from "../jobs/ajudantes.js";

/**
 * Lock compartilhado entre o job Claude (fake, controlado pelo teste) e o job de CI real
 * (T-017, critério "Com job Claude fake ativo no mesmo projeto, o CI espera"): mesmo
 * escopo `projeto:<nome>` para os dois tipos de job — a fila (T-007) já garante
 * exclusividade por escopo; este teste prova que o job "ci" respeita essa regra na
 * prática (não é um caso especial).
 */
describe("CI espera job Claude do mesmo projeto (lock compartilhado)", () => {
  it("job de CI fica na-fila enquanto o job Claude do mesmo projeto executa", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "ci-lock-fab-"));
    const dirProjeto = join(raiz, "projetos", "demo");
    mkdirSync(join(dirProjeto, "_gestao"), { recursive: true });
    writeFileSync(join(dirProjeto, "rapido.js"), "process.exit(0);", "utf8");
    const config: ConfigCi = {
      estagios: {
        instalar: { comando: null, habilitado: false },
        lint: { comando: null, habilitado: false },
        testes: { comando: "node rapido.js", habilitado: true },
        build: { comando: null, habilitado: false },
      },
      timeoutMs: 10000,
    };
    writeFileSync(join(dirProjeto, "_gestao", "ci.json"), JSON.stringify(config), "utf8");

    const ger = new GerenciadorJobs({ dirJobs: dirTemporario(), tetoClaude: 2 });
    const manual = criarRunnerManual();
    ger.registrarRunner("claude", manual.runner);
    ger.registrarRunner("ci", new RunnerCi());

    const claudeJob = ger.criarJob({
      tipo: "claude",
      titulo: "Fluxo Claude em demo",
      escopo: "projeto:demo",
      usaClaude: true,
    });
    await aguardarEstado(ger, claudeJob.id, "executando");

    const novoCi = await montarJobCi("demo", raiz, join(raiz, "dados"));
    const ciJob = ger.criarJob(novoCi);
    expect(ciJob.escopo).toBe("projeto:demo");
    // Claude ainda executando: o CI não pode iniciar (mesmo escopo de lock).
    expect(ger.obter(ciJob.id)?.estado).toBe("na-fila");

    manual.concluir(claudeJob.id);
    await aguardarEstado(ger, claudeJob.id, "concluido");

    // Lock liberado: o CI agora inicia e termina sozinho (comando real, rápido).
    await aguardarEstado(ger, ciJob.id, "executando");
    await aguardarEstado(ger, ciJob.id, "concluido", 10000);
  });
});
