import { describe, expect, it } from "vitest";
import { desfechoDoJob, entregaDoJob } from "../src/lib/desfecho";

describe("desfechoDoJob — job vivo não tem veredito", () => {
  it("estado da fila é o rótulo, sem qualificação", () => {
    for (const estado of ["na-fila", "executando", "aguardando-input"]) {
      const d = desfechoDoJob({ estado });
      expect(d.tom).toBe("vivo");
      expect(d.qualificado).toBe(false);
      expect(d.explicacao).toBeNull();
    }
  });
});

/**
 * O DEFEITO CENTRAL, na queixa do usuário: *"quando o job falha por limite, ele dá como
 * concluída"*. O pipeline RETORNA ao bater na cota (o laço parou limpo), então o job fica
 * `concluido` na fila; o runner Claude LANÇA, e o mesmo fato vira `falhou`. Dois estados
 * diferentes, um fato só — e a tela mostrava um selo verde num dos casos.
 */
describe("desfechoDoJob — cota", () => {
  it("job CONCLUÍDO cortado pela cota não aparece como concluído", () => {
    const d = desfechoDoJob({
      estado: "concluido",
      resultado: { motivo: "limite-uso", reabreEm: "2:40pm", encerrouPor: "cota" },
    });
    expect(d.rotulo).toBe("Parou no limite da assinatura");
    expect(d.tom).toBe("erro");
    expect(d.qualificado).toBe(true);
    expect(d.explicacao).toContain("2:40pm");
  });

  it("job FALHOU pela cota lê exatamente igual — a divergência é de implementação", () => {
    const d = desfechoDoJob({
      estado: "falhou",
      erro: "Limite de uso da assinatura batido",
      resultado: { motivo: "limite-uso", reabreEm: "2:40pm" },
    });
    expect(d.rotulo).toBe("Parou no limite da assinatura");
  });

  it("sem hora anunciada, diz que não há hora em vez de calar", () => {
    const d = desfechoDoJob({ estado: "concluido", resultado: { motivo: "limite-uso" } });
    expect(d.explicacao).toContain("não anunciou a hora");
  });

  it("a retomada afirma que nada se perde — é a pergunta seguinte do usuário", () => {
    const d = desfechoDoJob({ estado: "concluido", resultado: { motivo: "limite-uso" } });
    expect(d.retomada).toContain("NADA");
    expect(d.retomada).toContain("retoma a tarefa em voo");
  });

  /**
   * O texto longo vem de `limite-uso.ts`, composto aqui — não reescrito. A afirmação que
   * importa é a mesma: com tarefa fechada, a mensagem NÃO pode dizer "nada foi entregue",
   * senão manda refazer o que já está commitado (erro que a T-047 e a T-049 já pagaram).
   */
  it("diz o que JÁ está valendo, com os ids — impede refazer trabalho commitado", () => {
    const d = desfechoDoJob({
      estado: "concluido",
      resultado: { motivo: "limite-uso", tarefasConcluidas: ["T-004", "T-005"] },
    });
    const detalhe = d.detalhes.join(" ");
    expect(detalhe).toContain("2 tarefa(s) fecharam");
    expect(detalhe).toContain("T-004, T-005");
    expect(detalhe).toContain("NÃO precisa ser refeito");
    expect(detalhe).not.toContain("sem entregar");
  });
});

describe("desfechoDoJob — teto de custo NÃO é falha", () => {
  it("tom de atenção, nunca de erro", () => {
    const d = desfechoDoJob({ estado: "concluido", resultado: { motivo: "teto-custo" } });
    expect(d.rotulo).toBe("Parou no teto de custo");
    expect(d.tom).toBe("atencao");
    expect(d.explicacao).toContain("PLANEJADA");
    expect(d.retomada).toContain("teto maior");
  });
});

describe("desfechoDoJob — desfechos do pipeline em código", () => {
  it("varreu tudo que dava: concluído de verdade", () => {
    const d = desfechoDoJob({ estado: "concluido", resultado: { encerrouPor: "sem-trabalho" } });
    expect(d.rotulo).toBe("Concluído");
    expect(d.tom).toBe("ok");
    expect(d.qualificado).toBe(false);
  });

  it("agente sem resultado e estado não gravado pedem atenção, não pânico", () => {
    expect(desfechoDoJob({ estado: "concluido", resultado: { encerrouPor: "agente-cortado" } }).tom).toBe("atencao");
    expect(desfechoDoJob({ estado: "concluido", resultado: { encerrouPor: "sem-progresso" } }).tom).toBe("atencao");
  });

  it("teto de voltas é sintoma de bug — vermelho", () => {
    const d = desfechoDoJob({ estado: "concluido", resultado: { encerrouPor: "teto-de-voltas" } });
    expect(d.tom).toBe("erro");
    expect(d.retomada).toContain("Investigue");
  });

  it("`sem-progresso` avisa que a tarefa é REFEITA, não retomada", () => {
    const d = desfechoDoJob({ estado: "concluido", resultado: { encerrouPor: "sem-progresso" } });
    expect(d.retomada).toContain("refeita do início");
  });
});

describe("desfechoDoJob — dano consumado vence desfecho bom", () => {
  it("agente cortado no meio derruba o 'concluído'", () => {
    const d = desfechoDoJob({
      estado: "concluido",
      resultado: { despachosEmVoo: 2, encerrouPor: "sem-trabalho" },
    });
    expect(d.rotulo).toBe("Concluído com trabalho abandonado");
    expect(d.tom).toBe("erro");
    expect(d.retomada).toContain("NÃO leia este job como entrega");
  });
});

describe("desfechoDoJob — compatibilidade com jobs antigos", () => {
  it("resultado ausente ou estranho cai no estado cru, sem inventar", () => {
    for (const resultado of [undefined, null, "texto", 42, {}]) {
      const d = desfechoDoJob({ estado: "concluido", resultado });
      expect(d.rotulo).toBe("Concluído");
      expect(d.qualificado).toBe(false);
    }
  });

  it("falha comum mostra o erro do job", () => {
    const d = desfechoDoJob({ estado: "falhou", erro: "ENOENT: sem PLANO.md" });
    expect(d.rotulo).toBe("Falhou");
    expect(d.explicacao).toContain("ENOENT");
  });

  it("cancelado e interrompido são neutros e explicam a retomada", () => {
    expect(desfechoDoJob({ estado: "cancelado" }).tom).toBe("neutro");
    expect(desfechoDoJob({ estado: "interrompido" }).explicacao).toContain("painel caiu");
  });
});

describe("entregaDoJob", () => {
  it("prefere tarefas concluídas ao número de turnos", () => {
    expect(entregaDoJob({ tarefasConcluidas: ["T-001"], numTurnos: 90 })).toContain("1 tarefa(s)");
  });

  it("sem tarefa fechada, ainda diz que despacho houve", () => {
    expect(entregaDoJob({ tarefasConcluidas: [], despachos: 4 })).toContain("4 despacho(s)");
  });

  it("sem nada mensurável, devolve null em vez de frase vazia", () => {
    expect(entregaDoJob({})).toBeNull();
    expect(entregaDoJob(null)).toBeNull();
  });
});
