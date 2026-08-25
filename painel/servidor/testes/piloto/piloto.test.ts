import { rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as esperar } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GerenciadorJobs, type NovoJob } from "../../src/jobs/fila.js";
import { Piloto, desfechoDoJob, ler } from "../../src/jobs/piloto/piloto.js";
import type { EstadoPiloto } from "../../src/jobs/piloto/decisao.js";
import { aguardarEstado, criarRunnerManual, dirTemporario, type RunnerManual } from "../jobs/ajudantes.js";

/**
 * O laço de verdade, ligado ao gerenciador de jobs real (runner manual no lugar do
 * pipeline). É aqui que se verifica o que a decisão pura não alcança: que a rodada
 * seguinte NASCE, que o desligamento não corta o que está em voo, e que um reinício do
 * painel não é lido como falha da rodada anterior.
 */

const CONFIG = {
  projeto: "alfa",
  estrategia: "sonnet",
  tetoUsdPorRodada: null,
  limites: { tetoTotalUsd: 25, maxRodadas: 3 },
};

/** Deixa o setImmediate do encadeamento rodar. */
const respirar = (): Promise<void> => esperar(5);

describe("piloto automático — encadeamento", () => {
  let dir: string;
  let arquivo: string;
  let ger: GerenciadorJobs;
  let manual: RunnerManual;
  let piloto: Piloto;
  let montados: EstadoPiloto[];

  function montarRodada(estado: EstadoPiloto): NovoJob {
    montados.push({ ...estado });
    return {
      tipo: "manual",
      titulo: `/trabalhar ${estado.projeto}`,
      escopo: `projeto:${estado.projeto}`,
      usaClaude: true,
    };
  }

  beforeEach(() => {
    dir = dirTemporario();
    arquivo = join(dir, "piloto.json");
    ger = new GerenciadorJobs({ dirJobs: join(dir, "jobs"), tetoClaude: 2 });
    manual = criarRunnerManual();
    ger.registrarRunner("manual", manual.runner);
    montados = [];
    piloto = new Piloto(ger, { arquivo, montarRodada });
    piloto.iniciar();
  });

  /**
   * Id da rodada em voo, já executando. Vem do ESTADO do piloto, não de `iniciados`: o
   * runner só entra em cena num microtask, então ler a lista logo após `ligar()` lê vazio
   * — a mesma corrida que a armadilha do "flaky pré-existente" no CLAUDE.md.
   */
  async function emVoo(qual: Piloto = piloto): Promise<string> {
    const id = qual.estado()?.ultimoJobId;
    if (id === null || id === undefined) throw new Error("O piloto não criou rodada nenhuma.");
    await aguardarEstado(ger, id, "executando");
    return id;
  }

  afterEach(() => {
    piloto.parar();
    rmSync(dir, { recursive: true, force: true });
  });

  it("(a) ligar dispara a primeira rodada e o desfecho que continua faz nascer a segunda", async () => {
    piloto.ligar(CONFIG);
    const primeira = await emVoo();
    expect(piloto.estado()?.rodadas).toBe(1);

    manual.concluir(primeira, { encerrouPor: "orcamento", custoEstimadoUsd: 2, tarefasConcluidas: ["T-001"] });
    await aguardarEstado(ger, primeira, "concluido");
    await respirar();

    expect(montados).toHaveLength(2);
    const estado = piloto.estado()!;
    expect(estado.rodadas).toBe(2);
    expect(estado.gastoUsd).toBe(2);
    expect(estado.tarefasConcluidas).toBe(1);
    expect(estado.ultimoJobId).toBe(manual.iniciados[1]);
  });

  it("(b) sem tarefa pronta encerra o laço e grava o motivo", async () => {
    piloto.ligar(CONFIG);
    const primeira = await emVoo();
    manual.concluir(primeira, { encerrouPor: "sem-trabalho", custoEstimadoUsd: 0.1, tarefasConcluidas: [] });
    await aguardarEstado(ger, primeira, "concluido");
    await respirar();

    expect(montados).toHaveLength(1);
    const estado = piloto.estado()!;
    expect(estado.ligado).toBe(false);
    expect(estado.parouPor).toBe("sem-tarefa");
    expect(estado.detalheParada).toContain("alfa");
  });

  it("(c) o teto de rodadas é respeitado por quem CRIA a rodada, não só pela decisão", async () => {
    piloto.ligar({ ...CONFIG, limites: { tetoTotalUsd: 25, maxRodadas: 2 } });
    for (let i = 0; i < 2; i++) {
      const job = await emVoo();
      manual.concluir(job, { encerrouPor: "orcamento", custoEstimadoUsd: 1, tarefasConcluidas: [`T-00${i}`] });
      await aguardarEstado(ger, job, "concluido");
      await respirar();
    }
    expect(montados).toHaveLength(2);
    expect(piloto.estado()?.parouPor).toBe("teto-rodadas");
  });

  it("(d) desligar NÃO cancela a rodada em voo — só impede a próxima", async () => {
    piloto.ligar(CONFIG);
    const primeira = await emVoo();

    piloto.desligar();
    expect(ger.obter(primeira)?.estado).toBe("executando");

    manual.concluir(primeira, { encerrouPor: "orcamento", custoEstimadoUsd: 1, tarefasConcluidas: ["T-001"] });
    await aguardarEstado(ger, primeira, "concluido");
    await respirar();

    expect(montados).toHaveLength(1);
    expect(piloto.estado()?.parouPor).toBe("desligado");
  });

  it("(e) cota dorme e o rearme cria a rodada seguinte", async () => {
    let despertar: (() => void) | null = null;
    const dormindo = new Piloto(ger, {
      arquivo,
      montarRodada,
      agendar: (_ms, acao) => {
        despertar = acao;
        return () => {
          despertar = null;
        };
      },
    });
    dormindo.iniciar();
    dormindo.ligar(CONFIG);
    const primeira = await emVoo(dormindo);
    manual.concluir(primeira, { motivo: "limite-uso", reabreEm: "5am", tarefasConcluidas: [] });
    await aguardarEstado(ger, primeira, "concluido");
    await respirar();

    expect(montados).toHaveLength(1);
    expect(dormindo.estado()?.ligado).toBe(true);
    expect(dormindo.estado()?.rearmaEm).not.toBeNull();

    despertar!();
    await respirar();
    expect(montados).toHaveLength(2);
    dormindo.parar();
  });

  it("(f) reinício do painel retoma o laço sem ler o job pendurado como falha", async () => {
    piloto.ligar(CONFIG);
    await emVoo();
    piloto.parar();

    // Processo novo: o gerenciador sanea o job pendurado para `interrompido` e publica a
    // transição DEPOIS que tudo já está de pé — é o caso que derrubava o piloto no boot.
    const ger2 = new GerenciadorJobs({ dirJobs: join(dir, "jobs"), tetoClaude: 2 });
    const manual2 = criarRunnerManual();
    ger2.registrarRunner("manual", manual2.runner);
    const piloto2 = new Piloto(ger2, { arquivo, montarRodada });
    piloto2.iniciar();
    ger2.publicarSaneamentoDeBoot();
    await respirar();

    expect(montados).toHaveLength(2);
    expect(manual2.iniciados).toHaveLength(1);
    expect(piloto2.estado()?.ligado).toBe(true);
    expect(piloto2.estado()?.rodadas).toBe(2);
    piloto2.parar();
  });

  it("(g) o estado sobrevive em disco, para a próxima sessão saber por que parou", async () => {
    piloto.ligar(CONFIG);
    const primeira = await emVoo();
    manual.concluir(primeira, { encerrouPor: "sem-trabalho", tarefasConcluidas: [] });
    await aguardarEstado(ger, primeira, "concluido");
    await respirar();

    const doDisco = ler(arquivo);
    expect(doDisco?.parouPor).toBe("sem-tarefa");
    expect(doDisco?.projeto).toBe("alfa");
  });
});

describe("desfechoDoJob", () => {
  const base = {
    id: "x",
    tipo: "pipeline",
    titulo: "/trabalhar alfa",
    escopo: "projeto:alfa" as const,
    usaClaude: true,
    params: {},
    criadoEm: "2026-08-24T12:00:00.000Z",
  };

  it("lê o vocabulário do pipeline", () => {
    const d = desfechoDoJob({
      ...base,
      estado: "concluido",
      resultado: {
        encerrouPor: "cota",
        motivo: "limite-uso",
        reabreEm: "5am",
        custoEstimadoUsd: 3.5,
        tarefasConcluidas: ["T-001", "T-002"],
        paraReplanejar: ["T-009"],
        bloqueadas: [],
      },
    });
    expect(d).toMatchObject({
      encerrouPor: "cota",
      motivo: "limite-uso",
      reabreEm: "5am",
      custoUsd: 3.5,
      tarefasConcluidas: 2,
      paraReplanejar: 1,
    });
  });

  it("job cortado no meio, sem resultado, vira desfecho vazio — quem decide é o estado", () => {
    const d = desfechoDoJob({ ...base, estado: "interrompido", erro: "watchdog" });
    expect(d).toMatchObject({
      estado: "interrompido",
      encerrouPor: null,
      custoUsd: 0,
      tarefasConcluidas: 0,
      erro: "watchdog",
    });
  });
});
