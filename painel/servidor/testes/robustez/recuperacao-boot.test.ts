import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reconciliarResultadosOrfaos, salvarResultado, lerResultados } from "../../src/ci/resultados.js";
import type { ResultadoCi } from "../../src/ci/resultados.js";
import { GerenciadorJobs } from "../../src/jobs/fila.js";
import type { EventoJob, Job } from "../../src/jobs/tipos.js";
import { dirTemporario } from "../jobs/ajudantes.js";

/**
 * Recuperação pós-reinício (T-019): o processo caiu com jobs em execução, pendências de
 * input abertas e um pipeline de CI no meio. Nada disso pode continuar "vivo" no disco.
 */
describe("recuperação no boot", () => {
  let dir: string;

  beforeEach(() => {
    dir = dirTemporario();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Grava à mão o metadado que um processo derrubado teria deixado para trás. */
  function gravarJobPendurado(job: Partial<Job> & Pick<Job, "id" | "estado">): void {
    const completo: Job = {
      tipo: "claude",
      titulo: "Fluxo pendurado",
      escopo: "projeto:alfa",
      usaClaude: true,
      params: {},
      criadoEm: new Date().toISOString(),
      ...job,
    };
    writeFileSync(join(dir, `${completo.id}.json`), JSON.stringify(completo, null, 2), "utf8");
  }

  it("job executando vira interrompido, com nota, também no disco", () => {
    gravarJobPendurado({ id: "job1", estado: "executando" });

    const ger = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 2 });

    const job = ger.obter("job1");
    expect(job?.estado).toBe("interrompido");
    expect(job?.erro).toMatch(/reiniciou/i);
    expect(job?.terminadoEm).toBeTruthy();
    const noDisco = JSON.parse(readFileSync(join(dir, "job1.json"), "utf8")) as Job;
    expect(noDisco.estado).toBe("interrompido");
  });

  it("pendência de input aberta é FECHADA (não fica 'aguardando resposta' para sempre)", () => {
    gravarJobPendurado({
      id: "job2",
      estado: "aguardando-input",
      inputs: [
        {
          id: "p1",
          jobId: "job2",
          tipo: "aprovacao-ferramenta",
          titulo: "Aprovar Bash?",
          descricao: "rm -rf algo",
          criadaEm: new Date().toISOString(),
        },
      ],
    });

    const ger = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 2 });

    // Não aparece mais como pendência aberta na API...
    expect(ger.listarInputs()).toEqual([]);
    // ...e o histórico do job diz que foi encerrada pelo reinício, em vez de mentir.
    const pendencia = ger.obter("job2")?.inputs?.[0];
    expect(pendencia?.respondidaEm).toBeTruthy();
    expect(pendencia?.resposta?.mensagem).toMatch(/reiniciou/i);
  });

  it("publicarSaneamentoDeBoot emite a transição no canal (e só uma vez)", () => {
    gravarJobPendurado({ id: "job3", estado: "executando" });
    const ger = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 2 });

    // Só DEPOIS de plugar o listener (é o que o inicializar.ts faz com o hub SSE).
    const recebidos: EventoJob[] = [];
    ger.emissor.on("evento", (e: EventoJob) => recebidos.push(e));

    expect(ger.publicarSaneamentoDeBoot()).toBe(1);
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]?.jobId).toBe("job3");
    expect((recebidos[0]?.dados as { para: string }).para).toBe("interrompido");

    // Idempotente: uma segunda chamada não republica.
    expect(ger.publicarSaneamentoDeBoot()).toBe(0);
    expect(recebidos).toHaveLength(1);
  });

  it("job já terminal não é tocado nem republicado", () => {
    gravarJobPendurado({ id: "job4", estado: "concluido", terminadoEm: "2026-01-01T00:00:00Z" });
    const ger = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 2 });

    expect(ger.obter("job4")?.estado).toBe("concluido");
    expect(ger.publicarSaneamentoDeBoot()).toBe(0);
  });
});

describe("reconciliação do histórico de CI no boot", () => {
  let dados: string;

  beforeEach(() => {
    dados = mkdtempSync(join(tmpdir(), "rec-ci-"));
  });

  afterEach(() => {
    rmSync(dados, { recursive: true, force: true });
  });

  function resultado(parcial: Partial<ResultadoCi>): ResultadoCi {
    return {
      jobId: "j1",
      projeto: "alfa",
      estado: "executando",
      iniciadoEm: new Date().toISOString(),
      terminadoEm: null,
      estagios: [],
      ...parcial,
    };
  }

  it("resultado deixado como 'executando' vira 'interrompido'", () => {
    salvarResultado(dados, resultado({}));

    expect(reconciliarResultadosOrfaos(dados)).toBe(1);

    const lido = lerResultados(dados, "alfa");
    expect(lido?.ultimo.estado).toBe("interrompido");
    expect(lido?.ultimo.terminadoEm).toBeTruthy();
  });

  it("estágios que não chegaram a terminar viram 'cancelado'; os concluídos ficam", () => {
    salvarResultado(
      dados,
      resultado({
        estagios: [
          {
            estagio: "instalar",
            estado: "sucesso",
            comando: "npm install",
            iniciadoEm: null,
            terminadoEm: null,
            duracaoMs: 10,
            codigoSaida: 0,
            aviso: null,
          },
        ],
      }),
    );

    reconciliarResultadosOrfaos(dados);

    const lido = lerResultados(dados, "alfa");
    expect(lido?.ultimo.estagios[0]?.estado).toBe("sucesso"); // preservado
  });

  it("resultado já terminal não é alterado (e não conta como corrigido)", () => {
    salvarResultado(dados, resultado({ estado: "sucesso", terminadoEm: "2026-01-01T00:00:00Z" }));

    expect(reconciliarResultadosOrfaos(dados)).toBe(0);
    expect(lerResultados(dados, "alfa")?.ultimo.estado).toBe("sucesso");
  });

  it("sem pasta de CI nenhuma: não faz nada e não lança", () => {
    expect(reconciliarResultadosOrfaos(mkdtempSync(join(tmpdir(), "vazio-")))).toBe(0);
  });
});
