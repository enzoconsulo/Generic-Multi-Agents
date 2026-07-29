import { describe, expect, it } from "vitest";
import {
  extrairJson,
  normalizar,
  recortar,
  resumirTrecho,
  MODELO_RESUMO,
} from "../../src/jobs/resumo/resumidor.js";
import type { Consulta } from "../../src/jobs/claude/runner-claude.js";
import type { TrechoFechado } from "../../src/jobs/resumo/segmentos.js";

const TRECHO: TrechoFechado = {
  indice: 0,
  agente: "documentador",
  inicio: "2026-07-28T12:00:00.000Z",
  fim: "2026-07-28T12:02:00.000Z",
  texto: "Atualizei o README e o CLAUDE.md do projeto.",
  ferramentas: 4,
};

/** SDK falso: devolve o texto pedido e um custo. Nada de rede, nada de assinatura. */
function sdkFalso(texto: string, custoUsd = 0.0004): { consulta: Consulta; opcoes: () => unknown } {
  let capturado: unknown = null;
  const consulta: Consulta = (args) => {
    capturado = args.options;
    return (async function* () {
      yield { type: "assistant", message: { content: [{ type: "text", text: texto }] } };
      yield { type: "result", total_cost_usd: custoUsd };
    })();
  };
  return { consulta, opcoes: () => capturado };
}

describe("extrairJson", () => {
  it("aceita JSON limpo", () => {
    expect(extrairJson('{"linhas":["a"]}')).toEqual({ linhas: ["a"] });
  });

  it("aceita JSON embrulhado em cerca de código", () => {
    // Modelo barato faz isso o tempo todo; derrubar o resumo por isso seria trocar um
    // problema cosmético por uma funcionalidade quebrada.
    expect(extrairJson('```json\n{"linhas":["a"]}\n```')).toEqual({ linhas: ["a"] });
  });

  it("aceita conversa antes e depois do objeto", () => {
    expect(extrairJson('Claro! {"linhas":["a"]} espero ter ajudado')).toEqual({ linhas: ["a"] });
  });

  it("devolve null quando não há objeto", () => {
    expect(extrairJson("desculpe, não consegui")).toBeNull();
    expect(extrairJson("{quebrado")).toBeNull();
  });
});

describe("normalizar", () => {
  it("respeita o teto de 2 linhas e 5 itens", () => {
    const r = normalizar(
      {
        linhas: ["a", "b", "c", "d"],
        itens: Array.from({ length: 9 }, (_, i) => ({ tipo: "feito", texto: `i${i}` })),
      },
      0,
      "executor",
    );
    expect(r.linhas).toHaveLength(2);
    expect(r.itens).toHaveLength(5);
  });

  it("`naoDeu` do modelo é respeitado", () => {
    // É a saída honesta que o prompt pede quando o texto não permite resumo fiel.
    expect(normalizar({ naoDeu: true }, 0, null).naoDeu).toBe(true);
  });

  it("resumo sem nenhuma linha vira naoDeu (cartão vazio não diz nada)", () => {
    expect(normalizar({ linhas: [], itens: [{ tipo: "feito", texto: "x" }] }, 0, null).naoDeu).toBe(
      true,
    );
  });

  it("tipo desconhecido cai em `feito`, e item sem texto some", () => {
    const r = normalizar(
      { linhas: ["ok"], itens: [{ tipo: "explodiu", texto: "a" }, { tipo: "feito", texto: "  " }] },
      0,
      null,
    );
    expect(r.itens).toEqual([{ tipo: "feito", texto: "a" }]);
  });

  it("lixo não lança — vira naoDeu", () => {
    for (const lixo of [null, undefined, 42, "texto", []]) {
      expect(normalizar(lixo, 0, null).naoDeu).toBe(true);
    }
  });
});

describe("recortar", () => {
  it("texto curto passa inteiro", () => {
    expect(recortar("abc", 100)).toBe("abc");
  });

  it("texto longo mantém começo E fim (é onde mora o sentido)", () => {
    const texto = `INICIO${"x".repeat(5000)}FIM`;
    const cortado = recortar(texto, 200);
    expect(cortado.startsWith("INICIO")).toBe(true);
    expect(cortado.endsWith("FIM")).toBe(true);
    expect(cortado).toContain("meio omitido");
    expect(cortado.length).toBeLessThan(texto.length);
  });
});

describe("resumirTrecho", () => {
  it("usa haiku, 1 turno e NENHUMA ferramenta", async () => {
    // Resumir é uma pergunta, não uma tarefa agêntica: com ferramentas o modelo sairia
    // lendo arquivo e o custo deixaria de ser desprezível.
    const { consulta, opcoes } = sdkFalso('{"linhas":["Atualizou os documentos."],"itens":[]}');
    await resumirTrecho(TRECHO, consulta);
    const o = opcoes() as Record<string, unknown>;
    expect(o["model"]).toBe(MODELO_RESUMO);
    expect(o["maxTurns"]).toBe(1);
    expect(o["allowedTools"]).toEqual([]);
    // `tools: []` é o que remove as definições do contexto; `allowedTools` sozinho só
    // desliga a auto-aprovação e deixa o custo lá.
    expect(o["tools"]).toEqual([]);
    // Thinking ligado dobrava a saída para um JSON que não precisa de raciocínio.
    expect(o["thinking"]).toEqual({ type: "disabled" });
  });

  it("não carrega CLAUDE.md nem o system prompt do Claude Code", async () => {
    // Estas duas opções são a diferença entre ~US$0,05 e centavos por resumo, medida em
    // execução real. Removê-las não quebra nada visível — o resumo continua saindo, só
    // que caro. Por isso ficam travadas por teste.
    const { consulta, opcoes } = sdkFalso('{"linhas":["ok"],"itens":[]}');
    await resumirTrecho(TRECHO, consulta);
    const o = opcoes() as Record<string, unknown>;
    // `settingSources: []` = não lê settings do disco (é o que arrasta os CLAUDE.md).
    expect(o["settingSources"]).toEqual([]);
    // systemPrompt próprio e CURTO substitui o preset de agente de codificação do SDK.
    expect(typeof o["systemPrompt"]).toBe("string");
    expect((o["systemPrompt"] as string).length).toBeLessThan(300);
  });

  it("devolve o resumo e o custo real da chamada", async () => {
    const { consulta } = sdkFalso(
      '{"linhas":["Atualizou README e CLAUDE.md."],"itens":[{"tipo":"atencao","texto":"how_to_use ficou de fora"}]}',
      0.0007,
    );
    const r = await resumirTrecho(TRECHO, consulta);
    expect(r.naoDeu).toBe(false);
    expect(r.agente).toBe("documentador");
    expect(r.linhas[0]).toContain("README");
    expect(r.itens[0]?.tipo).toBe("atencao");
    expect(r.custoUsd).toBe(0.0007);
  });

  it("SDK que explode NÃO derruba o console — vira naoDeu", async () => {
    const consulta: Consulta = () => {
      throw new Error("SDK fora do ar");
    };
    const r = await resumirTrecho(TRECHO, consulta);
    expect(r.naoDeu).toBe(true);
    expect(r.indice).toBe(0);
  });

  it("resposta sem JSON vira naoDeu em vez de resumo inventado", async () => {
    const { consulta } = sdkFalso("Não consegui resumir esse texto.");
    expect((await resumirTrecho(TRECHO, consulta)).naoDeu).toBe(true);
  });
});
