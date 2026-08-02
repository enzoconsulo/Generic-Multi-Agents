import { describe, expect, it } from "vitest";
import { montarJobAcao } from "../../src/acoes/acoes.js";
import { GUARDRAILS_PADRAO, guardrailsParaAcao } from "../../src/jobs/robustez/guardrails.js";

/**
 * O teto da tabela CHEGA ao job?
 *
 * Este arquivo existe por causa da armadilha mais cara desta base, que já se repetiu três
 * vezes: **configuração que ninguém lê é pior que configuração ausente**. `watchdogMs`
 * ficou na tabela de guardrails desde a T-019 sem nunca ser consultado — `/trabalhar` pedia
 * 20 min e recebia 15, e a tabela *parecia* estar no ar. `effort` foi passado como
 * `outputConfig.effort`, nome que não existe na API: compilou, passou nos testes, e a
 * economia nunca aconteceu. `canUseTool` era montado e não enviado no modo padrão.
 *
 * Nos três casos o teste que faltava era este: olhar o que efetivamente sai do montador,
 * não o que a tabela declara.
 */
describe("teto de custo: da tabela até params do job", () => {
  it("/trabalhar leva o teto da tabela para params.tetoUsd", () => {
    const job = montarJobAcao(
      { id: "trabalhar", argumentos: "banco-imobiliario", modelo: "sonnet" },
      "C:/fabrica",
    );
    expect((job.params ?? {})["tetoUsd"]).toBe(guardrailsParaAcao("trabalhar").maxBudgetUsd);
    expect((job.params ?? {})["tetoUsd"]).toBe(8);
  });

  it("ação sem entrada própria herda o teto PADRÃO — nasce protegida, não ilimitada", () => {
    const job = montarJobAcao({ id: "manutencao", argumentos: "", modelo: "sonnet" }, "C:/fabrica");
    expect((job.params ?? {})["tetoUsd"]).toBe(guardrailsParaAcao("manutencao").maxBudgetUsd);
    expect(GUARDRAILS_PADRAO.maxBudgetUsd).not.toBeNull();
  });

  // A régua que o valor precisa respeitar para o freio não ser teatro: o teto do único
  // fluxo que roda o pipeline inteiro tem de caber pelo menos um ciclo de tarefa
  // (~US$ 2,14 medidos), senão ele para antes de entregar qualquer coisa.
  it("o teto do /trabalhar comporta mais de um ciclo completo de tarefa", () => {
    const teto = guardrailsParaAcao("trabalhar").maxBudgetUsd ?? 0;
    expect(teto).toBeGreaterThan(2.14 * 2);
  });

  it("todo fluxo Claude sai com algum teto — nenhum sobe ilimitado por omissão", () => {
    for (const id of ["trabalhar", "novo-projeto", "status", "ideia", "encerrar-dia"]) {
      const job = montarJobAcao({ id, argumentos: "", modelo: "sonnet" }, "C:/fabrica");
      expect((job.params ?? {})["tetoUsd"], `ação ${id} sem teto`).toBeTypeOf("number");
      expect(((job.params ?? {})["tetoUsd"]) as number).toBeGreaterThan(0);
    }
  });
});
