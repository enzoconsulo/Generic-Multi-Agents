import { describe, expect, it } from "vitest";
import {
  ErroNaoRetomavel,
  acaoDoJob,
  ehRetomavel,
  motivoDaParada,
  planejarRetomada,
  promptDeRetomada,
  tetoDaRetomada,
} from "../../src/jobs/retomada.js";
import type { Job } from "../../src/jobs/tipos.js";

/**
 * O que estes testes travam, e por quê.
 *
 * O caso real é `dados/jobs/2f388226.json`: um `/ideia` que registrou a ideia, anunciou o
 * despacho do planejador e bateu na cota. Sem retomada, o conserto era pagar de novo 24
 * turnos e 44 chamadas de ferramenta. A invariante que importa é UMA: o job retomado tem de
 * carregar o `sessionId` para o `resume` do SDK — se ele cair, a retomada vira "rodar tudo
 * de novo" sem que nada acuse, que é a família de falha desta casa (opção com nome errado,
 * campo que ninguém consome).
 */

function jobBase(over: Partial<Job> = {}): Job {
  return {
    id: "abc123",
    tipo: "claude",
    titulo: "/ideia no banco-imobiliario, tabuleiro no celular",
    escopo: "global",
    usaClaude: true,
    params: { prompt: "/ideia ...", cwd: "C:\\fabrica", modelo: "sonnet", tetoUsd: 6 },
    estado: "falhou",
    criadoEm: "2026-08-16T21:39:03.758Z",
    sessionId: "748eeb59-5f32-45a8-b815-126a76e0e3e0",
    resultado: { motivo: "limite-uso" },
    ...over,
  } as Job;
}

describe("planejarRetomada", () => {
  it("job claude com sessionId retoma a SESSÃO, e o id vai para os params", () => {
    const plano = planejarRetomada(jobBase());
    expect(plano.modo).toBe("sessao");
    expect(plano.novo.params?.["retomarSessao"]).toBe("748eeb59-5f32-45a8-b815-126a76e0e3e0");
  });

  it("o prompt do job retomado é a instrução de continuação, NÃO o pedido original", () => {
    // O pedido inteiro volta com o histórico da sessão. Repeti-lo pagaria duas vezes pelo
    // mesmo contexto — e, pior, o modelo leria como um pedido NOVO e recomeçaria.
    const plano = planejarRetomada(jobBase());
    const prompt = String(plano.novo.params?.["prompt"]);
    expect(prompt).not.toContain("/ideia");
    expect(prompt).toContain("<retomada>");
    expect(prompt).toContain("INTERROMPIDA");
  });

  it("o motivo da parada entra no prompt, para o fluxo saber o que aconteceu", () => {
    const plano = planejarRetomada(jobBase());
    expect(String(plano.novo.params?.["prompt"])).toContain("limite-uso");
  });

  it("preserva escopo e tipo — é o lock que impede dois fluxos no mesmo projeto", () => {
    const plano = planejarRetomada(jobBase({ escopo: "projeto:banco-imobiliario" }));
    expect(plano.novo.escopo).toBe("projeto:banco-imobiliario");
    expect(plano.novo.tipo).toBe("claude");
    expect(plano.novo.usaClaude).toBe(true);
  });

  it("aceita teto maior — é o 'redisparar com um teto maior' que a tela prometia", () => {
    expect(planejarRetomada(jobBase(), 12).novo.params?.["tetoUsd"]).toBe(12);
    expect(planejarRetomada(jobBase(), 12).tetoUsd).toBe(12);
  });

  it("job de pipeline retoma pelo DISCO: sem sessão, com os mesmos params", () => {
    const plano = planejarRetomada(
      jobBase({
        tipo: "pipeline",
        sessionId: undefined,
        params: { raiz: "C:\\fabrica", projeto: "banco-imobiliario", tetoUsd: 8 },
        resultado: { encerrouPor: "cota" },
      }),
    );
    expect(plano.modo).toBe("disco");
    expect(plano.novo.params?.["projeto"]).toBe("banco-imobiliario");
    expect(plano.novo.params?.["retomarSessao"]).toBeUndefined();
  });

  it("job claude ANTIGO (sem sessionId) roda de novo, e a explicação não finge o contrário", () => {
    const plano = planejarRetomada(jobBase({ sessionId: undefined }));
    expect(plano.modo).toBe("disco");
    expect(plano.novo.params?.["prompt"]).toBe("/ideia ...");
    expect(plano.explicacao).toContain("refeita");
  });

  it("não muta o job original nem os params dele", () => {
    const job = jobBase();
    planejarRetomada(job, 12);
    expect(job.params["tetoUsd"]).toBe(6);
    expect(job.params["retomarSessao"]).toBeUndefined();
  });

  for (const estado of ["na-fila", "executando", "aguardando-input"] as const) {
    it(`recusa job ${estado}: retomar job vivo criaria dois fluxos nos mesmos arquivos`, () => {
      expect(() => planejarRetomada(jobBase({ estado }))).toThrow(ErroNaoRetomavel);
    });
  }

  it("recusa tipo que não é fluxo de agente (CI não tem o que continuar)", () => {
    expect(() => planejarRetomada(jobBase({ tipo: "ci", sessionId: undefined }))).toThrow(
      ErroNaoRetomavel,
    );
  });
});

describe("motivoDaParada", () => {
  it("lê `motivo` (runner Claude) e `encerrouPor` (pipeline) — são dois vocabulários", () => {
    expect(motivoDaParada(jobBase({ resultado: { motivo: "teto-custo" } }))).toBe("teto-custo");
    expect(motivoDaParada(jobBase({ resultado: { encerrouPor: "orcamento" } }))).toBe("orcamento");
  });

  it("resultado ausente ou estranho não quebra", () => {
    expect(motivoDaParada(jobBase({ resultado: undefined }))).toBeNull();
    expect(motivoDaParada(jobBase({ resultado: "texto solto" }))).toBeNull();
  });
});

describe("promptDeRetomada", () => {
  it("repete a regra de despacho síncrono: é o fim de turno que ela governa", () => {
    expect(promptDeRetomada(null)).toContain("run_in_background: false");
  });

  it("manda conferir o disco antes de agir — parte do trabalho chegou lá, parte não", () => {
    expect(promptDeRetomada(null)).toContain("DISCO");
  });
});

describe("ehRetomavel", () => {
  it("oferece para fluxo terminado e recusa para fluxo vivo", () => {
    expect(ehRetomavel({ tipo: "claude", estado: "concluido" })).toBe(true);
    expect(ehRetomavel({ tipo: "pipeline", estado: "cancelado" })).toBe(true);
    expect(ehRetomavel({ tipo: "claude", estado: "executando" })).toBe(false);
    expect(ehRetomavel({ tipo: "ci", estado: "concluido" })).toBe(false);
  });
});

/**
 * O TETO DA RETOMADA (16/08). O primeiro corte do botão herdava `params.tetoUsd` e a
 * captura de tela pegou o efeito na hora: um `/ideia` de ontem sendo oferecido com teto de
 * US$ 3, num dia em que a tabela já dizia US$ 6 — a recalibragem valeria para quem dispara
 * do zero e não para quem precisa retomar, que é justamente quem já provou que o trabalho
 * não coube.
 */
describe("tetoDaRetomada", () => {
  it("o pedido explícito vence tudo", () => {
    expect(tetoDaRetomada(jobBase({ params: { tetoUsd: 3, acao: "ideia" } }), 20)).toBe(20);
  });

  it("usa a tabela ATUAL quando ela é maior que o teto congelado no job", () => {
    // `ideia` está em US$ 6 na tabela; o job velho carrega 3.
    expect(tetoDaRetomada(jobBase({ params: { tetoUsd: 3, acao: "ideia" } }))).toBe(6);
  });

  it("nunca REBAIXA: teto original maior que a tabela é preservado", () => {
    // Rebaixar produziria uma retomada que para antes de onde o original já chegou —
    // a única coisa que o botão não pode fazer.
    expect(tetoDaRetomada(jobBase({ params: { tetoUsd: 20, acao: "ideia" } }))).toBe(20);
  });

  it("job antigo sem `params.acao` cai no título — é onde estão os jobs já gravados", () => {
    const job = jobBase({ params: { tetoUsd: 3 }, titulo: "/ideia no banco-imobiliario, x" });
    expect(acaoDoJob(job)).toBe("ideia");
    expect(tetoDaRetomada(job)).toBe(6);
  });

  it("ação não classificável mantém o teto do job, e NÃO vira ilimitado", () => {
    const job = jobBase({ params: { tetoUsd: 5 }, titulo: "Analisar ia-hibrida-limpa" });
    expect(acaoDoJob(job)).toBeNull();
    expect(tetoDaRetomada(job)).toBe(5);
  });

  it("job sem teto continua sem teto — não se inventa freio onde não havia", () => {
    expect(tetoDaRetomada(jobBase({ params: { acao: "ideia" } }))).toBeNull();
    expect(tetoDaRetomada(jobBase({ params: {}, titulo: "Analisar x" }))).toBeNull();
  });

  it("o plano aplica o teto resolvido nos params do job novo", () => {
    const plano = planejarRetomada(jobBase({ params: { tetoUsd: 3, acao: "ideia" } }));
    expect(plano.tetoUsd).toBe(6);
    expect(plano.novo.params?.["tetoUsd"]).toBe(6);
  });

  it("sem teto, o campo é REMOVIDO dos params — deixá-lo seria um freio fantasma", () => {
    const plano = planejarRetomada(jobBase({ params: { tetoUsd: 3, acao: "encerrar-dia" } }));
    // `encerrar-dia` tem teto na tabela (US$ 2), então este caso confere o oposto:
    expect(plano.novo.params?.["tetoUsd"]).toBe(3);

    const semTeto = planejarRetomada(jobBase({ params: { acao: "ideia" }, sessionId: "s" }));
    expect(semTeto.novo.params).not.toHaveProperty("tetoUsd");
  });
});
