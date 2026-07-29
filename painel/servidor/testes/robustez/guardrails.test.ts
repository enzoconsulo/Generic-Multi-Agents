import { describe, expect, it } from "vitest";
import { montarJobAcao } from "../../src/acoes/acoes.js";
import { GUARDRAILS_PADRAO, guardrailsParaAcao } from "../../src/jobs/robustez/guardrails.js";

describe("guardrailsParaAcao", () => {
  it("/trabalhar tem teto de turnos alto (roda o pipeline inteiro)", () => {
    const g = guardrailsParaAcao("trabalhar");
    expect(g.maxTurns).toBe(200);
    expect(g.watchdogMs).toBeGreaterThan(GUARDRAILS_PADRAO.watchdogMs);
  });

  it("/status é leve: teto baixo e paciência menor que o padrão", () => {
    const g = guardrailsParaAcao("status");
    expect(g.maxTurns).toBeLessThan(GUARDRAILS_PADRAO.maxTurns);
    expect(g.watchdogMs).toBeLessThan(GUARDRAILS_PADRAO.watchdogMs);
  });

  it("ação sem entrada própria cai no padrão (nasce protegida, não ilimitada)", () => {
    expect(guardrailsParaAcao("acao-que-nao-existe")).toEqual(GUARDRAILS_PADRAO);
  });

  it("maxBudgetUsd é null por default (informacional; assinatura não cobra por chamada)", () => {
    expect(guardrailsParaAcao("trabalhar").maxBudgetUsd).toBeNull();
  });
});

describe("montarJobAcao aplica os guardrails", () => {
  const base = { modelo: "haiku" };

  it("sem maxTurns explícito, usa o teto da ação", () => {
    const job = montarJobAcao({ ...base, id: "trabalhar", argumentos: "alfa" }, "/raiz");
    expect(job.params?.maxTurns).toBe(200);
  });

  it("maxTurns explícito do disparo vence o default", () => {
    const job = montarJobAcao({ ...base, id: "trabalhar", maxTurns: 7 }, "/raiz");
    expect(job.params?.maxTurns).toBe(7);
  });

  it("toda ação sai com algum teto (nenhum fluxo sobe sem guardrail)", () => {
    for (const id of ["novo-projeto", "ideia", "trabalhar", "status", "encerrar-dia", "manutencao"]) {
      const job = montarJobAcao({ ...base, id }, "/raiz");
      expect(typeof job.params?.maxTurns).toBe("number");
      expect(job.params?.maxTurns).toBeGreaterThan(0);
    }
  });

  it("esforço da tabela chega aos params do job (T-042)", () => {
    // A tabela definir não basta: entre ela e o modelo há a montagem do job, o disco e o
    // `lerParams` do runner. Este teste cobre o primeiro trecho; o do runner cobre o
    // resto. Sem os dois, `esforco` seria mais uma coluna que ninguém consome.
    expect(montarJobAcao({ ...base, id: "status" }, "/raiz").params?.esforco).toBe("medium");
  });

  it("ação de julgamento não recebe esforço — fica no padrão do modelo", () => {
    // Rebaixar aqui economiza centavos e paga em retrabalho, que é o gasto caro medido.
    expect(montarJobAcao({ ...base, id: "trabalhar" }, "/raiz").params?.esforco).toBeUndefined();
  });
});

describe("esforço: quem desce foi decidido MEDINDO (T-042)", () => {
  it("as rebaixadas são exatamente as duas que provaram entregar o mesmo", () => {
    // Lista explícita e fechada de propósito: acrescentar uma ação aqui é uma decisão de
    // custo × qualidade e deve exigir mexer no teste junto — de preferência depois de
    // rodar `integracao/medir-esforco.ts`, que compara TRABALHO ENTREGUE, não a fatura.
    for (const id of ["status", "projeto:progresso"]) {
      expect(guardrailsParaAcao(id).esforco).toBe("medium");
    }
    const padrao = [
      "trabalhar",
      "novo-projeto",
      "ideia",
      "manutencao",
      "encerrar-dia",
      "analisar",
      "projeto:documentar",
      "projeto:pesquisar",
      "projeto:revisar",
      "projeto:testar",
      "projeto:replanejar",
      "projeto:marco",
      "projeto:recriar-equipe",
    ];
    for (const id of padrao) {
      expect(guardrailsParaAcao(id).esforco).toBeUndefined();
    }
  });

  it("projeto:conferir NÃO desce — medido: em medium não achou o desvio", () => {
    // Regressão de uma decisão que já foi tomada errado uma vez. Em `medium` a ação
    // devolveu 74% de "economia" sem entregar nada, contra um commit de +11 linhas no
    // padrão a partir da MESMA entrada. Procurar desvio é o oposto de tarefa mecânica.
    expect(guardrailsParaAcao("projeto:conferir").esforco).toBeUndefined();
  });
});
