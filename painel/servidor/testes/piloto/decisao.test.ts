import { describe, expect, it } from "vitest";
import {
  MAX_SEM_PROGRESSO,
  MAX_SONECAS,
  avancar,
  podeIniciarRodada,
  type DesfechoRodada,
  type EstadoPiloto,
} from "../../src/jobs/piloto/decisao.js";

/**
 * A tabela de decisão do piloto. É o teste que autoriza um laço a gastar a assinatura
 * sozinho: toda parada precisa ser reproduzível aqui, sem relógio e sem I/O.
 */

const AGORA = "2026-08-24T12:00:00.000Z";

function estado(over: Partial<EstadoPiloto> = {}): EstadoPiloto {
  return {
    ligado: true,
    projeto: "banco-imobiliario",
    estrategia: "sonnet",
    tetoUsdPorRodada: null,
    limites: { tetoTotalUsd: 25, maxRodadas: 10 },
    rodadas: 1,
    gastoUsd: 0,
    tarefasConcluidas: 0,
    rodadasSemProgresso: 0,
    sonecas: 0,
    ligadoEm: AGORA,
    ultimoJobId: "abc123",
    rearmaEm: null,
    parouPor: null,
    parouEm: null,
    detalheParada: null,
    ...over,
  };
}

function desfecho(over: Partial<DesfechoRodada> = {}): DesfechoRodada {
  return {
    estado: "concluido",
    encerrouPor: "orcamento",
    motivo: null,
    reabreEm: null,
    custoUsd: 1,
    tarefasConcluidas: 1,
    paraReplanejar: 0,
    bloqueadas: 0,
    erro: null,
    ...over,
  };
}

describe("piloto — o que continua", () => {
  it("teto de custo POR RODADA não para o piloto: é parada limpa e a próxima rodada solta o estacionado", () => {
    const { decisao, estado: depois } = avancar(
      estado(),
      desfecho({ encerrouPor: "orcamento", motivo: "teto-custo", custoUsd: 2.5 }),
      AGORA,
    );
    expect(decisao.acao).toBe("continuar");
    expect(depois.ligado).toBe(true);
    expect(depois.gastoUsd).toBe(2.5);
  });

  it("acumula gasto e tarefas ao longo das rodadas", () => {
    const um = avancar(estado(), desfecho({ custoUsd: 1.5, tarefasConcluidas: 2 }), AGORA).estado;
    const dois = avancar(um, desfecho({ custoUsd: 0.75, tarefasConcluidas: 1 }), AGORA).estado;
    expect(dois.gastoUsd).toBe(2.25);
    expect(dois.tarefasConcluidas).toBe(3);
  });

  it("uma rodada sem progresso não para — só a repetição para", () => {
    const um = avancar(estado(), desfecho({ tarefasConcluidas: 0 }), AGORA);
    expect(um.decisao.acao).toBe("continuar");
    expect(um.estado.rodadasSemProgresso).toBe(1);

    const dois = avancar(um.estado, desfecho({ tarefasConcluidas: 0 }), AGORA);
    expect(dois.decisao).toMatchObject({ acao: "parar", motivo: "sem-progresso" });
    expect(dois.estado.rodadasSemProgresso).toBe(MAX_SEM_PROGRESSO);
  });

  it("rodada produtiva zera a série de sem-progresso", () => {
    const um = avancar(estado(), desfecho({ tarefasConcluidas: 0 }), AGORA).estado;
    const dois = avancar(um, desfecho({ tarefasConcluidas: 1 }), AGORA).estado;
    expect(dois.rodadasSemProgresso).toBe(0);
  });
});

describe("piloto — o que para", () => {
  it("sem tarefa pronta é o desfecho feliz", () => {
    const { decisao, estado: depois } = avancar(
      estado(),
      desfecho({ encerrouPor: "sem-trabalho", tarefasConcluidas: 0 }),
      AGORA,
    );
    expect(decisao).toMatchObject({ acao: "parar", motivo: "sem-tarefa" });
    expect(depois.ligado).toBe(false);
    expect(depois.parouEm).toBe(AGORA);
  });

  it("tarefa que esgotou os ciclos para com motivo próprio: replanejar é julgamento", () => {
    const { decisao } = avancar(
      estado(),
      desfecho({ encerrouPor: "sem-trabalho", paraReplanejar: 2, tarefasConcluidas: 0 }),
      AGORA,
    );
    expect(decisao).toMatchObject({ acao: "parar", motivo: "precisa-replanejar" });
  });

  it("job que falhou para na hora — infra não melhora repetindo", () => {
    const { decisao } = avancar(
      estado(),
      desfecho({ estado: "falhou", erro: "runner morreu" }),
      AGORA,
    );
    expect(decisao).toMatchObject({ acao: "parar", motivo: "falha" });
    expect((decisao as { detalhe: string }).detalhe).toContain("runner morreu");
  });

  it("rodada cancelada à mão desliga o piloto: ele não encadeia por cima da decisão do usuário", () => {
    const { decisao } = avancar(estado(), desfecho({ estado: "cancelado" }), AGORA);
    expect(decisao).toMatchObject({ acao: "parar", motivo: "desligado" });
  });

  it("teto de gasto ACUMULADO para, mesmo com a rodada tendo produzido", () => {
    const { decisao } = avancar(
      estado({ gastoUsd: 24, limites: { tetoTotalUsd: 25, maxRodadas: 10 } }),
      desfecho({ custoUsd: 1.2, tarefasConcluidas: 3 }),
      AGORA,
    );
    expect(decisao).toMatchObject({ acao: "parar", motivo: "teto-gasto" });
  });

  it("teto de rodadas para", () => {
    const { decisao } = avancar(
      estado({ rodadas: 10, limites: { tetoTotalUsd: 25, maxRodadas: 10 } }),
      desfecho(),
      AGORA,
    );
    expect(decisao).toMatchObject({ acao: "parar", motivo: "teto-rodadas" });
  });

  it("teto de voltas do motor é sintoma de estado que não avança, não de trabalho terminado", () => {
    const { decisao } = avancar(estado(), desfecho({ encerrouPor: "teto-de-voltas" }), AGORA);
    expect(decisao).toMatchObject({ acao: "parar", motivo: "falha" });
  });
});

describe("piloto — cota", () => {
  it("dorme em vez de parar, nos dois vocabulários", () => {
    for (const d of [
      desfecho({ motivo: "limite-uso", reabreEm: "5am", tarefasConcluidas: 0 }),
      desfecho({ encerrouPor: "cota", tarefasConcluidas: 0 }),
    ]) {
      const { decisao, estado: depois } = avancar(estado(), d, AGORA);
      expect(decisao.acao).toBe("dormir");
      expect(depois.ligado).toBe(true);
      expect(depois.sonecas).toBe(1);
    }
  });

  it("a hora anunciada aparece no texto que a tela mostra", () => {
    const { decisao } = avancar(
      estado(),
      desfecho({ motivo: "limite-uso", reabreEm: "5am", tarefasConcluidas: 0 }),
      AGORA,
    );
    expect((decisao as { detalhe: string }).detalhe).toContain("5am");
  });

  it("desiste depois do teto de sonecas — a parede pode não ser só de horário", () => {
    const { decisao } = avancar(
      estado({ sonecas: MAX_SONECAS }),
      desfecho({ motivo: "limite-uso", tarefasConcluidas: 0 }),
      AGORA,
    );
    expect(decisao).toMatchObject({ acao: "parar", motivo: "sem-credito" });
  });

  it("cota vem ANTES dos tetos: dormir não é gastar", () => {
    const { decisao } = avancar(
      estado({ rodadas: 99, gastoUsd: 999 }),
      desfecho({ motivo: "limite-uso", custoUsd: 0, tarefasConcluidas: 0 }),
      AGORA,
    );
    expect(decisao.acao).toBe("dormir");
  });
});

describe("piloto — permissão para INICIAR rodada", () => {
  it("os mesmos tetos valem em todo caminho que inicia rodada (ligar, retomada de boot, rearme)", () => {
    expect(podeIniciarRodada(estado({ rodadas: 10 })).acao).toBe("parar");
    expect(podeIniciarRodada(estado({ gastoUsd: 25 })).acao).toBe("parar");
    expect(podeIniciarRodada(estado()).acao).toBe("continuar");
  });
});
