import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lerProjeto } from "../../src/fabrica/index.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(aqui, "..", "fixtures", "fabrica-falsa");

describe("lerProjeto (mini-fábrica de fixtures)", () => {
  it("devolve o corpo das tarefas: objetivo, critérios e seções de registro", async () => {
    const alfa = await lerProjeto(FIXTURE, "alfa");
    expect(alfa).not.toBeNull();

    const t1 = alfa?.tarefas.find((t) => t.id === "T-001");
    expect(t1?.secoes.objetivo).toContain("Fundação do projeto alfa");
    expect(t1?.secoes.contexto).toContain("Primeiro passo do plano");
    expect(t1?.secoes.criteriosAceite).toContain("`npm start` sobe sem erro");
    expect(t1?.secoes.notasExecucao).toContain("abc1111");
    expect(t1?.secoes.verificacao).toContain("PASSARAM");
    expect(t1?.secoes.revisao).toContain("Aprovado sem ressalvas");

    // Seções não preenchidas vêm como string vazia (nunca undefined).
    const t2 = alfa?.tarefas.find((t) => t.id === "T-002");
    expect(t2?.secoes.notasExecucao).toBe("");
    expect(t2?.secoes.verificacao).toBe("");
  });

  it("devolve o plano completo: fases com meta, marco e tarefas", async () => {
    const alfa = await lerProjeto(FIXTURE, "alfa");
    const plano = alfa?.plano;
    expect(plano?.titulo).toBe("Plano — alfa");
    expect(plano?.visao).toContain("mini-fábrica de testes");
    expect(plano?.fases).toHaveLength(3);

    const [fase1, fase2, fase3] = plano?.fases ?? [];
    expect(fase1?.marco).toMatchObject({ estado: "aprovado", data: "2026-07-15" });
    expect(fase1?.tarefas).toEqual(["T-001", "T-002"]);

    // Meta em duas linhas no arquivo vira um texto único.
    expect(fase2?.meta).toBe(
      "funcionalidade principal completa, com a meta descrita em duas linhas para exercitar a continuação de linha do parser.",
    );
    expect(fase2?.marco?.estado).toBe("pendente");
    expect(fase2?.tarefas).toEqual(["T-003", "T-004", "T-005"]);

    // Fase sem linha Marco: marco null + erro registrado no plano.
    expect(fase3?.marco).toBeNull();
    expect(plano?.erros.some((e) => e.includes('fase "Fase 3 — Refinamento" sem linha Marco'))).toBe(
      true,
    );
  });

  it("devolve os textos de gestão: decisões, progresso e análise", async () => {
    const alfa = await lerProjeto(FIXTURE, "alfa");
    expect(alfa?.decisoes).toContain("Stack mínima");
    expect(alfa?.progresso).toContain("Fase 1 aprovada no marco");
    expect(alfa?.analise).toContain("commit abc1234");
  });

  it("projeto sem _gestao/ devolve textos null e erro registrado (sem exceção)", async () => {
    const beta = await lerProjeto(FIXTURE, "beta");
    expect(beta).not.toBeNull();
    expect(beta?.erros).toContain("projeto sem pasta _gestao/");
    expect(beta?.plano).toBeNull();
    expect(beta?.decisoes).toBeNull();
    expect(beta?.progresso).toBeNull();
    expect(beta?.analise).toBeNull();
  });

  it("projeto inexistente devolve null (erro tipado, não exceção)", async () => {
    expect(await lerProjeto(FIXTURE, "nao-existe")).toBeNull();
  });

  it("nome com separador de caminho devolve null (sem travessia)", async () => {
    expect(await lerProjeto(FIXTURE, "../alfa")).toBeNull();
    expect(await lerProjeto(FIXTURE, "..\\alfa")).toBeNull();
    expect(await lerProjeto(FIXTURE, "..")).toBeNull();
    expect(await lerProjeto(FIXTURE, "")).toBeNull();
  });
});
