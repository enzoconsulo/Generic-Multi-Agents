import { describe, expect, it } from "vitest";
import { montarTopicos } from "../src/lib/topicos";
import type { LinhaLog } from "../src/lib/tipos";

function l(nivel: string, texto: string, em: string, extra: Partial<LinhaLog> = {}): LinhaLog {
  return { nivel, texto, em, ...extra };
}

describe("montarTopicos — o mais recente NO TOPO", () => {
  it("inverte a ordem do log", () => {
    const t = montarTopicos([
      l("assistente", "primeiro", "2026-08-16T10:00:00Z"),
      l("assistente", "segundo", "2026-08-16T10:00:10Z"),
      l("assistente", "terceiro", "2026-08-16T10:00:20Z"),
    ]);
    expect(t.map((x) => x.titulo)).toEqual(["terceiro", "segundo", "primeiro"]);
  });

  it("log vazio não quebra", () => {
    expect(montarTopicos([])).toEqual([]);
  });
});

describe("montarTopicos — rajada de ferramenta vira UM tópico", () => {
  /**
   * Medido na T-047: 74% a 92% das linhas de uma execução real são só o nome de uma
   * ferramenta, em sequências de até 15. Sem condensar, uma lista com o mais novo no topo
   * empurraria todo o resto para fora da tela — o oposto do que ela existe para resolver.
   */
  it("agrupa chamadas seguidas do mesmo agente e conta", () => {
    const linhas = [
      l("ferramenta", "executor: Read", "2026-08-16T10:00:00Z", { agente: "executor" }),
      l("ferramenta", "executor: Edit", "2026-08-16T10:00:01Z", { agente: "executor" }),
      l("ferramenta", "executor: Bash", "2026-08-16T10:00:02Z", { agente: "executor" }),
    ];
    const t = montarTopicos(linhas);
    expect(t).toHaveLength(1);
    expect(t[0]?.tipo).toBe("acoes");
    expect(t[0]?.vezes).toBe(3);
    expect(t[0]?.titulo).toBe("3 ações de ferramenta");
    // O prefixo `agente: ` sai — ele já está na coluna do agente e repetiria em toda linha.
    expect(t[0]?.detalhe).toBe("Read · Edit · Bash");
  });

  it("uma chamada só continua no singular", () => {
    const t = montarTopicos([l("ferramenta", "Read", "2026-08-16T10:00:00Z")]);
    expect(t[0]?.titulo).toBe("1 ação de ferramenta");
  });

  it("troca de agente quebra a rajada", () => {
    const t = montarTopicos([
      l("ferramenta", "executor: Read", "2026-08-16T10:00:00Z", { agente: "executor" }),
      l("ferramenta", "testador: Bash", "2026-08-16T10:00:05Z", { agente: "testador" }),
    ]);
    expect(t).toHaveLength(2);
    expect(t.every((x) => x.vezes === 1)).toBe(true);
  });

  it("texto no meio quebra a rajada — a ordem dos fatos tem de sobreviver", () => {
    const t = montarTopicos([
      l("ferramenta", "Read", "2026-08-16T10:00:00Z"),
      l("assistente", "achei o bug", "2026-08-16T10:00:05Z"),
      l("ferramenta", "Edit", "2026-08-16T10:00:10Z"),
    ]);
    // Do mais novo para o mais antigo: ação, fala, ação.
    expect(t.map((x) => x.tipo)).toEqual(["acoes", "fala", "acoes"]);
  });

  it("mostra os ÚLTIMOS alvos da rajada, não os primeiros", () => {
    const t = montarTopicos(
      ["a", "b", "c", "d", "e", "f"].map((x, i) =>
        l("ferramenta", x, `2026-08-16T10:00:0${i}Z`),
      ),
    );
    expect(t[0]?.vezes).toBe(6);
    expect(t[0]?.detalhe).toBe("c · d · e · f");
  });
});

describe("montarTopicos — tipos que o olho separa antes de ler", () => {
  it("início de etapa vira tópico próprio, com agente/papel/tarefa", () => {
    const t = montarTopicos([
      l("assistente", "T-004 · construtor · executor · sonnet · ~11k tok", "2026-08-16T10:00:00Z", {
        agente: "executor",
        papel: "construtor",
        tarefa: "T-004",
      }),
    ]);
    expect(t[0]?.tipo).toBe("etapa");
    expect(t[0]?.titulo).toBe("executor · construtor · T-004");
    expect(t[0]?.detalhe).toContain("sonnet");
  });

  it("segunda linha do MESMO agente não repete o cabeçalho de etapa", () => {
    const t = montarTopicos([
      l("assistente", "abrindo", "2026-08-16T10:00:00Z", { agente: "executor", papel: "construtor" }),
      l("assistente", "escrevendo o módulo", "2026-08-16T10:00:05Z", { agente: "executor", papel: "construtor" }),
    ]);
    expect(t.map((x) => x.tipo)).toEqual(["fala", "etapa"]);
  });

  it("transição de status vira tópico de estado", () => {
    const t = montarTopicos([l("assistente", "T-004: pronta → em-execucao", "2026-08-16T10:00:00Z")]);
    expect(t[0]?.tipo).toBe("estado");
    expect(t[0]?.tarefa).toBe("T-004");
    expect(t[0]?.titulo).toBe("T-004: pronta → em-execucao");
  });

  it("erro e resultado mantêm o próprio tipo", () => {
    const t = montarTopicos([
      l("erro", "GUARDA: comando recusado", "2026-08-16T10:00:00Z"),
      l("resultado", "Pipeline de alfa: 3 despachos", "2026-08-16T10:00:10Z"),
    ]);
    expect(t.map((x) => x.tipo)).toEqual(["resultado", "erro"]);
  });

  it("linha em branco não vira tópico", () => {
    expect(montarTopicos([l("assistente", "   ", "2026-08-16T10:00:00Z")])).toEqual([]);
  });

  /**
   * O detalhe é a CONTINUAÇÃO, nunca uma repetição do título. A primeira versão mandava o
   * texto inteiro para o detalhe, e a captura de tela mostrou o resultado: duas linhas
   * dizendo a mesma frase. Nada se perde — título + detalhe reconstroem o texto.
   */
  it("texto longo é cortado no título e CONTINUA no detalhe, sem repetir", () => {
    const longo = `${"a".repeat(200)}FIM`;
    const t = montarTopicos([l("assistente", longo, "2026-08-16T10:00:00Z")]);
    expect(t[0]?.titulo.length).toBeLessThanOrEqual(150);
    expect(t[0]?.titulo.endsWith("…")).toBe(true);
    expect(t[0]?.detalhe?.endsWith("FIM")).toBe(true);
    expect(`${t[0]?.titulo.slice(0, -1)}${t[0]?.detalhe}`).toBe(longo);
  });

  it("texto de várias linhas: a 1ª vira título, o resto vira detalhe", () => {
    const t = montarTopicos([
      l("assistente", "Fluxo concluído\ncusto ~$4,59\n21 turnos", "2026-08-16T10:00:00Z"),
    ]);
    expect(t[0]?.titulo).toBe("Fluxo concluído");
    expect(t[0]?.detalhe).toBe("custo ~$4,59 21 turnos");
  });
});

/**
 * Jobs gravados ANTES de `MetaEtapa` não têm os campos. Sem este leitor, a correção das
 * bolinhas valeria só para execuções futuras — e quem abrisse a rodada de ontem veria a
 * trilha apagada e concluiria, com razão, que nada foi consertado.
 */
describe("montarTopicos × log de pipeline ANTIGO (sem os campos)", () => {
  it("reconhece o cabeçalho do despachante", () => {
    const t = montarTopicos([
      l("assistente", "T-048 · revisor · revisor · sonnet · ~16307 tok de contexto", "2026-08-16T10:00:00Z"),
    ]);
    expect(t[0]?.tipo).toBe("etapa");
    expect(t[0]?.agente).toBe("revisor");
    expect(t[0]?.papel).toBe("revisor");
    expect(t[0]?.tarefa).toBe("T-048");
  });

  it("reconhece o cabeçalho do motor (`T-048 → testador`)", () => {
    const t = montarTopicos([
      l("assistente", "T-048 → testador (papel verificador: agente fixo da trilha)", "2026-08-16T10:00:00Z"),
    ]);
    expect(t[0]?.tipo).toBe("etapa");
    expect(t[0]?.agente).toBe("testador");
    expect(t[0]?.tarefa).toBe("T-048");
  });

  /**
   * O motor e o despachante anunciam a MESMA etapa em duas linhas seguidas. Sem fusão, a
   * linha do tempo abria duas etapas idênticas por despacho — visível na captura de tela.
   */
  it("funde as duas linhas do mesmo despacho num tópico só", () => {
    const t = montarTopicos([
      l("assistente", "T-048 → revisor (papel revisor: agente fixo da trilha)", "2026-08-16T10:00:00Z"),
      l("assistente", "T-048 · revisor · revisor · sonnet · ~16307 tok", "2026-08-16T10:00:01Z"),
    ]);
    expect(t).toHaveLength(1);
    // Fica com o título mais rico dos dois (o que traz o papel).
    expect(t[0]?.titulo).toBe("revisor · revisor · T-048");
    expect(t[0]?.detalhe).toContain("16307 tok");
  });

  it("etapas de tarefas ou agentes diferentes NÃO se fundem", () => {
    const t = montarTopicos([
      l("assistente", "T-048 → revisor", "2026-08-16T10:00:00Z"),
      l("assistente", "T-049 → revisor", "2026-08-16T10:00:01Z"),
      l("assistente", "T-049 → testador", "2026-08-16T10:00:02Z"),
    ]);
    expect(t).toHaveLength(3);
  });

  it("linha de ERRO que cita uma tarefa não vira etapa", () => {
    // `T-048: executor usou 53 chamadas…` é alarme, não despacho. Confundir os dois abriria
    // uma etapa falsa a cada aviso do motor.
    const t = montarTopicos([
      l("erro", "T-048: executor usou 53 chamadas de ferramenta", "2026-08-16T10:00:00Z"),
    ]);
    expect(t[0]?.tipo).toBe("erro");
  });

  it("transição de status continua sendo estado, não etapa", () => {
    const t = montarTopicos([l("assistente", "T-048: pronta → em-execucao", "2026-08-16T10:00:00Z")]);
    expect(t[0]?.tipo).toBe("estado");
  });
});

describe("montarTopicos — teto", () => {
  it("mantém os MAIS RECENTES ao cortar", () => {
    const linhas = Array.from({ length: 30 }, (_, i) =>
      l("assistente", `linha ${i}`, `2026-08-16T10:00:${String(i).padStart(2, "0")}Z`),
    );
    const t = montarTopicos(linhas, { limite: 5 });
    expect(t).toHaveLength(5);
    expect(t[0]?.titulo).toBe("linha 29");
    expect(t[4]?.titulo).toBe("linha 25");
  });
});
