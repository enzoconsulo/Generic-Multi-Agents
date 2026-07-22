import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GerenciadorJobs } from "../../src/jobs/fila.js";
import type { EventoJob } from "../../src/jobs/tipos.js";
import { aguardarEstado, criarRunnerManual, dirTemporario, type RunnerManual } from "./ajudantes.js";

/**
 * Robustez da fila contra I/O falível e listeners hostis — regressões dos achados
 * da Revisão (ciclo 1) da T-007: persistência que falha não pode criar job fantasma
 * nem derrubar/estagnar a fila; listener que lança não pode derrubar o processo.
 */
describe("robustez da fila — I/O falível e listeners hostis", () => {
  let dir: string;
  let ger: GerenciadorJobs;
  let manual: RunnerManual;

  beforeEach(() => {
    dir = dirTemporario();
    ger = new GerenciadorJobs({ dirJobs: dir, tetoClaude: 2 });
    manual = criarRunnerManual();
    ger.registrarRunner("manual", manual.runner);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  function jobDeProjeto(projeto: string) {
    return ger.criarJob({
      tipo: "manual",
      titulo: `Job do projeto ${projeto}`,
      escopo: `projeto:${projeto}`,
      usaClaude: true,
    });
  }

  it("criação cuja persistência falha lança para o chamador e não deixa job fantasma", async () => {
    // BigInt não é serializável por JSON.stringify — o salvarJob da criação lança.
    expect(() =>
      ger.criarJob({
        tipo: "manual",
        titulo: "Job com params não serializáveis",
        escopo: "projeto:alfa",
        usaClaude: true,
        params: { limite: 10n },
      }),
    ).toThrow(/BigInt/i);

    // Nada ficou para trás: nem na listagem, nem no disco.
    expect(ger.listar()).toEqual([]);
    expect(readdirSync(dir)).toEqual([]);

    // O projeto segue livre e SÓ o job válido executa (o fantasma, se tivesse ficado
    // agendável, iniciaria neste mesmo agendamento).
    const valido = jobDeProjeto("alfa");
    await aguardarEstado(ger, valido.id, "executando");
    manual.concluir(valido.id);
    await aguardarEstado(ger, valido.id, "concluido");
    expect(manual.iniciados).toEqual([valido.id]);
  });

  it("listener do emissor que lança não derruba o processo nem trava a fila", async () => {
    const erros = vi.spyOn(console, "error").mockImplementation(() => {});
    ger.emissor.on("evento", () => {
      throw new Error("Listener sabotado (simula consumidor SSE quebrado da T-009)");
    });

    // A criação emite eventos com o listener hostil já plugado — não pode lançar.
    const primeiro = jobDeProjeto("alfa");
    const segundo = jobDeProjeto("alfa"); // preso no lock do projeto
    expect(ger.obter(primeiro.id)?.estado).toBe("executando");
    expect(ger.obter(segundo.id)?.estado).toBe("na-fila");

    // O listener que lança interrompe a cadeia de listeners daquele emit, então a
    // espera aqui é por POLLING do estado em memória, não pelo emissor. (O runner
    // começa numa microtask após "executando" — esperar `iniciados` antes de concluir.)
    await expect.poll(() => manual.iniciados.includes(primeiro.id)).toBe(true);
    manual.concluir(primeiro.id);
    await expect.poll(() => ger.obter(primeiro.id)?.estado).toBe("concluido");

    // A fila continuou andando: o segundo job inicia e conclui normalmente.
    await expect.poll(() => manual.iniciados.includes(segundo.id)).toBe(true);
    manual.concluir(segundo.id);
    await expect.poll(() => ger.obter(segundo.id)?.estado).toBe("concluido");
    expect(ger.executandoAgora).toBe(0);
    expect(erros).toHaveBeenCalledWith(expect.stringContaining("Listener"));
  });

  it("falha de disco ao assentar o job não estagna a fila: memória assenta e o próximo inicia", async () => {
    const avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
    const primeiro = jobDeProjeto("alfa");
    const segundo = jobDeProjeto("alfa"); // preso no lock do projeto
    await aguardarEstado(ger, primeiro.id, "executando");

    // Sabota o destino da persistência: um DIRETÓRIO no lugar de <id>.json faz o
    // rename da escrita atômica lançar (mesmo efeito de disco cheio/EBUSY/EPERM).
    const destino = join(dir, `${primeiro.id}.json`);
    rmSync(destino);
    mkdirSync(destino);

    // O assentamento não pode virar unhandled rejection nem pular o reagendamento.
    manual.concluir(primeiro.id);
    const final = await aguardarEstado(ger, primeiro.id, "concluido");
    expect(final.estado).toBe("concluido"); // estado em memória é a fonte imediata
    expect(avisos).toHaveBeenCalledWith(expect.stringContaining(primeiro.id));

    // agendar() rodou mesmo com a persistência falhando: o lock liberou e o segundo entrou.
    await aguardarEstado(ger, segundo.id, "executando");
    manual.concluir(segundo.id);
    await aguardarEstado(ger, segundo.id, "concluido");
    expect(ger.executandoAgora).toBe(0);
  });

  it("job cancelado por um listener durante o passe de agendamento nunca inicia", async () => {
    // Global executando acumula dois jobs livres na fila para o mesmo passe.
    const global = ger.criarJob({
      tipo: "manual",
      titulo: "Global bloqueador",
      escopo: "global",
      usaClaude: true,
    });
    await aguardarEstado(ger, global.id, "executando");
    const alfa = jobDeProjeto("alfa");
    const beta = jobDeProjeto("beta");
    expect(ger.obter(alfa.id)?.estado).toBe("na-fila");
    expect(ger.obter(beta.id)?.estado).toBe("na-fila");

    // Listener reentrante: assim que "alfa" iniciar, cancela "beta" (ainda na-fila)
    // dentro do MESMO passe de agendamento, que iteraria sobre "beta" em seguida.
    let cancelou = false;
    ger.emissor.on("evento", (evento: EventoJob) => {
      if (cancelou || evento.jobId !== alfa.id || evento.tipo !== "estado") return;
      if ((evento.dados as { para: string }).para !== "executando") return;
      cancelou = true;
      ger.cancelar(beta.id);
    });

    manual.concluir(global.id);
    await aguardarEstado(ger, alfa.id, "executando");
    // O runner de "alfa" começa numa microtask após o evento "executando".
    await expect.poll(() => manual.iniciados.includes(alfa.id)).toBe(true);

    // Sem a guarda do agendar, "beta" (já cancelado) iniciaria neste passe.
    expect(ger.obter(beta.id)?.estado).toBe("cancelado");
    expect(manual.iniciados).toEqual([global.id, alfa.id]);

    manual.concluir(alfa.id);
    await aguardarEstado(ger, alfa.id, "concluido");
    expect(ger.obter(beta.id)?.estado).toBe("cancelado");
    expect(manual.iniciados).toEqual([global.id, alfa.id]);
    expect(ger.executandoAgora).toBe(0);
  });
});
