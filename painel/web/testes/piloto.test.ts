import { describe, expect, it } from "vitest";
import {
  ROTULO_MOTIVO,
  avisoDeCusto,
  fracaoDoTeto,
  horaCurta,
  projetoSugerido,
  resumoDaSessao,
  situacaoDoPiloto,
  tomDoMotivo,
  validarConfig,
} from "../src/lib/piloto";
import type { EstadoPiloto, Job } from "../src/lib/tipos";

function piloto(over: Partial<EstadoPiloto> = {}): EstadoPiloto {
  return {
    ligado: true,
    projeto: "banco-imobiliario",
    estrategia: "sonnet",
    tetoUsdPorRodada: null,
    limites: { tetoTotalUsd: 20, maxRodadas: 6 },
    rodadas: 2,
    gastoUsd: 5,
    tarefasConcluidas: 3,
    rodadasSemProgresso: 0,
    sonecas: 0,
    ligadoEm: "2026-08-24T10:00:00.000Z",
    ultimoJobId: "abc123",
    rearmaEm: null,
    parouPor: null,
    parouEm: null,
    detalheParada: null,
    ...over,
  };
}

describe("situacaoDoPiloto", () => {
  it("nunca ligado convida a ligar e explica o que vai acontecer", () => {
    const s = situacaoDoPiloto(null);
    expect(s.podeLigar).toBe(true);
    expect(s.titulo).toContain("desligado");
  });

  it("ligado mostra a rodada atual e a contabilidade da sessão", () => {
    const s = situacaoDoPiloto(piloto());
    expect(s.tom).toBe("ok");
    expect(s.titulo).toContain("rodada 2 de 6");
    expect(s.detalhe).toContain("3 tarefas concluídas");
    expect(s.detalhe).toContain("US$ 5.00");
    expect(s.podeLigar).toBe(false);
  });

  it("dormindo por cota diz até quando, e não oferece ligar de novo", () => {
    const agora = new Date("2026-08-24T23:00:00");
    const s = situacaoDoPiloto(
      piloto({ rearmaEm: new Date("2026-08-25T05:02:00").toISOString() }),
      agora,
    );
    expect(s.tom).toBe("atencao");
    expect(s.titulo).toContain("05:02");
    expect(s.podeLigar).toBe(false);
  });

  it("parado mostra o motivo e volta a permitir ligar", () => {
    const s = situacaoDoPiloto(
      piloto({ ligado: false, parouPor: "sem-tarefa", detalheParada: "Não há mais tarefa pronta." }),
    );
    expect(s.titulo).toContain(ROTULO_MOTIVO["sem-tarefa"]);
    expect(s.detalhe).toContain("Não há mais tarefa pronta.");
    expect(s.podeLigar).toBe(true);
  });
});

describe("tomDoMotivo", () => {
  /**
   * "Acabou o trabalho" é o desfecho FELIZ. Pintá-lo de vermelho ensinaria o usuário a
   * ignorar o vermelho — que é onde moram cota e falha.
   */
  it("trabalho concluído é verde; falha é vermelho; o resto é atenção", () => {
    expect(tomDoMotivo("sem-tarefa")).toBe("ok");
    expect(tomDoMotivo("falha")).toBe("erro");
    expect(tomDoMotivo("sem-credito")).toBe("atencao");
    expect(tomDoMotivo("sem-progresso")).toBe("atencao");
    expect(tomDoMotivo("teto-gasto")).toBe("atencao");
  });

  it("todo motivo tem rótulo em PT-BR", () => {
    for (const rotulo of Object.values(ROTULO_MOTIVO)) {
      expect(rotulo.length).toBeGreaterThan(0);
    }
  });
});

describe("resumoDaSessao e fracaoDoTeto", () => {
  it("singular e plural, e o gasto sempre ao lado do teto", () => {
    expect(resumoDaSessao(piloto({ rodadas: 1, tarefasConcluidas: 1 }))).toBe(
      "1 rodada · 1 tarefa concluída · ~US$ 5.00 de US$ 20.00",
    );
  });

  it("a barra fica entre 0 e 1 mesmo se o gasto passar do teto", () => {
    expect(fracaoDoTeto(piloto({ gastoUsd: 10 }))).toBe(0.5);
    expect(fracaoDoTeto(piloto({ gastoUsd: 999 }))).toBe(1);
    expect(fracaoDoTeto(piloto({ limites: { tetoTotalUsd: 0, maxRodadas: 1 } }))).toBe(0);
  });
});

describe("validarConfig", () => {
  it("aceita a configuração comum", () => {
    expect(validarConfig({ tetoTotalUsd: 15, maxRodadas: 6, tetoUsdPorRodada: null })).toBeNull();
  });

  it("recusa o que a rota também recusaria — o POST já executa", () => {
    expect(validarConfig({ tetoTotalUsd: 0, maxRodadas: 6, tetoUsdPorRodada: null })).not.toBeNull();
    expect(validarConfig({ tetoTotalUsd: 500, maxRodadas: 6, tetoUsdPorRodada: null })).not.toBeNull();
    expect(validarConfig({ tetoTotalUsd: 15, maxRodadas: 0, tetoUsdPorRodada: null })).not.toBeNull();
    expect(validarConfig({ tetoTotalUsd: 15, maxRodadas: 99, tetoUsdPorRodada: null })).not.toBeNull();
    expect(validarConfig({ tetoTotalUsd: 15, maxRodadas: 2.5, tetoUsdPorRodada: null })).not.toBeNull();
    expect(validarConfig({ tetoTotalUsd: 5, maxRodadas: 6, tetoUsdPorRodada: 8 })).not.toBeNull();
  });

  it("campo vazio vira NaN e é recusado, não enviado", () => {
    expect(validarConfig({ tetoTotalUsd: NaN, maxRodadas: 6, tetoUsdPorRodada: null })).not.toBeNull();
  });
});

describe("avisoDeCusto", () => {
  const cfg = { tetoTotalUsd: 20, maxRodadas: 4, tetoUsdPorRodada: null };

  it("sem medição, promete só o que os freios garantem", () => {
    expect(avisoDeCusto(cfg, null)).toContain("US$ 20.00");
    expect(avisoDeCusto(cfg, null)).toContain("4 rodada(s)");
  });

  it("com medição, projeta o total — limitado pelo teto, que é quem manda", () => {
    expect(avisoDeCusto(cfg, 3)).toContain("~US$ 12.00");
    expect(avisoDeCusto(cfg, 50)).toContain("~US$ 20.00");
  });
});

describe("horaCurta", () => {
  it("distingue hoje de amanhã", () => {
    const agora = new Date("2026-08-24T23:00:00");
    expect(horaCurta(new Date("2026-08-24T23:30:00").toISOString(), agora)).toContain("hoje");
    expect(horaCurta(new Date("2026-08-25T05:00:00").toISOString(), agora)).toContain("amanhã");
  });

  it("data ilegível não quebra a tela", () => {
    expect(horaCurta("nao-e-data")).toBe("em breve");
  });
});

describe("projetoSugerido", () => {
  const job = (id: string, escopo: string): Job =>
    ({ id, escopo, estado: "concluido", tipo: "pipeline", titulo: id, usaClaude: true, params: {}, criadoEm: "" }) as Job;

  it("propõe o projeto do job mais recente — é o que a tela toda já está mostrando", () => {
    const jobs = [job("a", "projeto:shopee-rodizio"), job("b", "projeto:banco-imobiliario")];
    expect(projetoSugerido(jobs, ["banco-imobiliario", "shopee-rodizio"])).toBe("shopee-rodizio");
  });

  it("pula job global e projeto que não existe mais", () => {
    const jobs = [job("a", "global"), job("b", "projeto:apagado"), job("c", "projeto:alfa")];
    expect(projetoSugerido(jobs, ["alfa", "beta"])).toBe("alfa");
  });

  it("sem histórico usa o primeiro projeto; sem projeto nenhum devolve vazio", () => {
    expect(projetoSugerido([], ["alfa", "beta"])).toBe("alfa");
    expect(projetoSugerido([], [])).toBe("");
  });
});
