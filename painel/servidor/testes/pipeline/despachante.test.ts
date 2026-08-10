import { describe, expect, it } from "vitest";
import { orcamentoDeFerramentas } from "../../src/pipeline/despachante.js";

describe("orcamentoDeFerramentas — o teto declarado nos prompts, em número (T-065)", () => {
  /**
   * Os números saem das tabelas de `.claude/agents/*.md` (executor/construtor escalam com as
   * `areas`; testador/conferente 25; revisor 20). Se um prompt mudar o teto e isto não
   * acompanhar, a medição passa a mentir — e ela existe justamente para medir custo.
   *
   * Medido nas quatro rodadas de 09/08, antes desta conta existir: três despachos passaram do
   * teto declarado (construtor com 39 contra 30 e 52 contra 45; testador com 32 contra 25) e
   * nada registrou. O freio da máquina é o `maxTurns` (40-60), que conta VOLTAS DO MODELO e
   * não chamadas de ferramenta — unidade diferente, e por isso ele não substitui isto.
   */
  it("construtor escala com as `areas`, como a tabela do executor", () => {
    expect(orcamentoDeFerramentas("construtor", 1)).toBe(30);
    expect(orcamentoDeFerramentas("construtor", 2)).toBe(30);
    expect(orcamentoDeFerramentas("construtor", 3)).toBe(45);
    expect(orcamentoDeFerramentas("construtor", 4)).toBe(60);
  });

  it("verificador e revisor têm teto fixo", () => {
    expect(orcamentoDeFerramentas("verificador", 3)).toBe(25);
    expect(orcamentoDeFerramentas("revisor", 3)).toBe(20);
  });

  /**
   * Papel sem teto declarado (planejador) cai num limite alto, nunca em zero: teto zero faria
   * TODA etapa daquele papel aparecer como estouro, e o aviso viraria ruído no primeiro dia.
   */
  it("papel desconhecido não vira teto zero", () => {
    expect(orcamentoDeFerramentas("planejador", 0)).toBeGreaterThanOrEqual(60);
    expect(orcamentoDeFerramentas("papel-que-nao-existe", 2)).toBeGreaterThanOrEqual(60);
  });
});
