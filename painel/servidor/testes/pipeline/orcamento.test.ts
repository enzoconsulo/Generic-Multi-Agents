import { describe, expect, it } from "vitest";
import {
  comAgentesEmVoo,
  comGasto,
  CUSTO_TAREFA_PADRAO,
  decidir,
  estimativaProximaTarefa,
  FATOR_SEGURANCA,
  novoOrcamento,
  registrarTarefaConcluida,
  semTeto,
} from "../../src/pipeline/orcamento.js";

describe("novoOrcamento", () => {
  it("aceita teto positivo", () => {
    expect(novoOrcamento(5).tetoUsd).toBe(5);
  });

  // O teto vem do disparo (UI ou API), então é entrada externa: valor torto não pode virar
  // um teto de NaN, que compararia sempre falso e desligaria o freio em silêncio.
  it("valor inválido vira SEM TETO explícito, nunca teto quebrado", () => {
    expect(novoOrcamento(0).tetoUsd).toBeNull();
    expect(novoOrcamento(-1).tetoUsd).toBeNull();
    expect(novoOrcamento(Number.NaN).tetoUsd).toBeNull();
    expect(novoOrcamento(Number.POSITIVE_INFINITY).tetoUsd).toBeNull();
    expect(novoOrcamento(null).tetoUsd).toBeNull();
  });
});

describe("estimativaProximaTarefa (autocalibragem)", () => {
  it("sem medição usa o padrão calibrado nos jobs reais", () => {
    expect(estimativaProximaTarefa(novoOrcamento(10))).toBe(CUSTO_TAREFA_PADRAO);
  });

  it("com medição usa a média observada NESTE job", () => {
    let e = novoOrcamento(10);
    e = registrarTarefaConcluida(e, 1);
    e = registrarTarefaConcluida(e, 3);
    expect(estimativaProximaTarefa(e)).toBe(2);
  });

  it("custo inválido não entra na média", () => {
    let e = registrarTarefaConcluida(novoOrcamento(10), 2);
    e = registrarTarefaConcluida(e, Number.NaN);
    e = registrarTarefaConcluida(e, 0);
    e = registrarTarefaConcluida(e, -5);
    expect(estimativaProximaTarefa(e)).toBe(2);
  });
});

describe("decidir", () => {
  it("sem teto sempre segue — é o comportamento antigo, agora explícito", () => {
    let e = comGasto(semTeto(), 999);
    expect(decidir(e).acao).toBe("seguir");
    e = comAgentesEmVoo(e, 3);
    expect(decidir(e).acao).toBe("seguir");
  });

  it("dentro do orçamento, com folga para outra tarefa, segue", () => {
    const e = comGasto(novoOrcamento(10), 2);
    expect(decidir(e).acao).toBe("seguir");
  });

  // O caso que faltava e que responde por metade do desperdício: ainda há dinheiro, mas
  // não o bastante para um ciclo inteiro. Começar aqui garante tarefa pela metade.
  it("resta orçamento mas não um ciclo inteiro → não inicia outra tarefa", () => {
    const e = comGasto(novoOrcamento(10), 10 - CUSTO_TAREFA_PADRAO * FATOR_SEGURANCA + 0.01);
    const d = decidir(e);
    expect(d.acao).toBe("nao-iniciar");
    expect(d.motivo).toContain("Não começo outra");
  });

  it("a fronteira respeita o fator de segurança", () => {
    const precisa = CUSTO_TAREFA_PADRAO * FATOR_SEGURANCA;
    expect(decidir(comGasto(novoOrcamento(10), 10 - precisa - 0.01)).acao).toBe("seguir");
    expect(decidir(comGasto(novoOrcamento(10), 10 - precisa + 0.01)).acao).toBe("nao-iniciar");
  });

  it("usa a média medida, não o padrão, quando já há observação", () => {
    // Tarefas baratas neste job (US$ 0,40): com US$ 1 restante ainda cabe outra, embora o
    // padrão de US$ 2,10 dissesse que não.
    let e = novoOrcamento(10);
    e = registrarTarefaConcluida(e, 0.4);
    e = registrarTarefaConcluida(e, 0.4);
    e = comGasto(e, 9);
    expect(decidir(e).acao).toBe("seguir");
  });

  // Parada limpa: cortar agente em voo destrói o trabalho dele — foi o que aconteceu em
  // 30/07 e de novo em 01/08.
  it("teto estourado COM agente em voo espera, não corta", () => {
    let e = comGasto(novoOrcamento(5), 6);
    e = comAgentesEmVoo(e, 1);
    const d = decidir(e);
    expect(d.acao).toBe("nao-iniciar");
    expect(d.motivo).toContain("ainda trabalhando");
  });

  it("teto estourado SEM agente em voo encerra", () => {
    const e = comGasto(novoOrcamento(5), 6);
    const d = decidir(e);
    expect(d.acao).toBe("encerrar");
    expect(d.motivo).toContain("preservado");
  });

  it("expõe os números que a UI e o log mostram", () => {
    const d = decidir(comGasto(novoOrcamento(10), 4));
    expect(d.gastoUsd).toBe(4);
    expect(d.restanteUsd).toBe(6);
    expect(d.estimativaProximaUsd).toBe(CUSTO_TAREFA_PADRAO);
  });
});

describe("comGasto / comAgentesEmVoo", () => {
  it("ignoram valores inválidos em vez de corromper o estado", () => {
    const e = comGasto(novoOrcamento(5), 2);
    expect(comGasto(e, Number.NaN).gastoUsd).toBe(2);
    expect(comGasto(e, -1).gastoUsd).toBe(2);
    expect(comAgentesEmVoo(e, -3).agentesEmVoo).toBe(0);
    expect(comAgentesEmVoo(e, 2.7).agentesEmVoo).toBe(2);
  });

  it("são imutáveis — o estado anterior não muda", () => {
    const antes = novoOrcamento(5);
    comGasto(antes, 3);
    expect(antes.gastoUsd).toBe(0);
  });
});

describe("situacao — o estado nomeado, mais fino que a ação", () => {
  // Existe porque DUAS situações levam a `nao-iniciar`, e deduplicar aviso pela ação
  // esconderia a segunda, que é a mais importante. Descoberto por um teste que falhou:
  // o log parava de avisar justo quando o teto estourava com agente em voo.
  it("distingue 'resta pouco' de 'estourou e há agente em voo'", () => {
    const restaPouco = decidir(comGasto(novoOrcamento(10), 9));
    const estourado = decidir(comAgentesEmVoo(comGasto(novoOrcamento(5), 6), 1));

    expect(restaPouco.acao).toBe("nao-iniciar");
    expect(estourado.acao).toBe("nao-iniciar");
    expect(restaPouco.situacao).toBe("resta-pouco");
    expect(estourado.situacao).toBe("estourado-esperando");
    expect(restaPouco.situacao).not.toBe(estourado.situacao);
  });

  it("cobre os quatro estados", () => {
    expect(decidir(comGasto(novoOrcamento(10), 1)).situacao).toBe("dentro");
    expect(decidir(semTeto()).situacao).toBe("dentro");
    expect(decidir(comGasto(novoOrcamento(10), 9)).situacao).toBe("resta-pouco");
    expect(decidir(comAgentesEmVoo(comGasto(novoOrcamento(5), 6), 2)).situacao).toBe(
      "estourado-esperando",
    );
    expect(decidir(comGasto(novoOrcamento(5), 6)).situacao).toBe("estourado-encerrar");
  });
});
