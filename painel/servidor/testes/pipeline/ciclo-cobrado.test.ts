import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  rodarPipeline,
  type ContextoMotor,
  type DependenciasMotor,
} from "../../src/pipeline/motor.js";
import { novoOrcamento } from "../../src/pipeline/orcamento.js";
import type { TarefaResumo } from "../../src/fabrica/tipos.js";

/**
 * CONSTRUTOR CORTADO GASTOU UM CICLO (21/09).
 *
 * `tentativas` é escrito pelo AGENTE, e decide as três coisas caras: o limite de 3 ciclos, o
 * escalonamento de modelo e a autocorreção. Um agente cortado — `maxTurns` estourado, morte
 * no meio — não escreve nada, então o ciclo era pago e não contado, e a tarefa voltava a
 * `pronta` para ser redespachada indefinidamente.
 *
 * O caso real: T-056 do fabrica-v2 com `tentativas: 2` no frontmatter e SEIS ciclos escritos
 * nas Notas. O teto de 3 nunca disparou — nunca houve bloqueio nem autocorreção. Três rodadas
 * de 21/09: 6 despachos, 0 tarefas concluídas, US$ 12,10.
 */

const dirReal = mkdtempSync(join(tmpdir(), "ciclo-cobrado-"));

function tarefa(p: Partial<TarefaResumo> & { id: string }): TarefaResumo {
  return {
    arquivo: `${p.id}.md`,
    titulo: p.id,
    status: "pronta",
    prioridade: "media",
    dependencias: [],
    areas: ["src/a.js"],
    tentativas: 0,
    replanejadaDe: null,
    ultimaReprovacao: null,
    agente: null,
    criada: "2026-09-01",
    atualizada: "2026-09-01",
    erros: [],
    ...p,
  };
}

const ctxBase: ContextoMotor = {
  dirProjeto: dirReal,
  projeto: "teste",
  trilha: "software",
  equipe: null,
  disponiveis: new Set<string>(),
  reforco: "opus",
  orcamento: novoOrcamento(50),
};

interface Opcoes {
  /** Papel cujo despacho é cortado (não devolve resultado). */
  cortarEm?: "construtor" | "verificador" | "revisor";
  /**
   * O construtor TERMINA normalmente e não move o status — o caso da T-056 em 21/09. É um
   * caminho diferente do corte: `concluiu: true`, e mesmo assim zero resultado.
   */
  construtorMudo?: boolean;
  /** O agente cortado alcançou escrever `tentativas` antes de morrer. */
  escreveuAntesDeMorrer?: boolean;
  /** Corte por COTA — parede da assinatura, não falha da tarefa. */
  porCota?: boolean;
  /** Corte por INFRAESTRUTURA (rede/TLS/DNS) — o agente nem chegou a trabalhar. */
  erroDoCorte?: string;
  /** Custo do despacho cortado. Zero = o agente nunca começou (gate principal). */
  custoDoCorte?: number;
  /** Driver sem a dependência opcional de escrita. */
  semGravarTentativas?: boolean;
}

function mundo(iniciais: TarefaResumo[], opcoes: Opcoes) {
  const tarefas = new Map(iniciais.map((t) => [t.id, { ...t }]));
  const gravacoes: { id: string; valor: number }[] = [];
  const logs: string[] = [];

  const dep: DependenciasMotor = {
    lerTarefas: async () => [...tarefas.values()],
    gravarStatus: async (t, status) => {
      const atual = tarefas.get(t.id);
      if (atual !== undefined) atual.status = status;
    },
    anexarVerificacao: async () => {},
    lerCriteriosDe: async () => "",
    lerNotasDe: async () => "",
    temTrabalhoParcial: async () => false,
    lerPlano: async () => null,
    gravarMarco: async () => {},
    commitarGestao: async () => {},
    hashHead: async () => "head0000",
    gravarTentativas: async (t, valor) => {
      gravacoes.push({ id: t.id, valor });
      const atual = tarefas.get(t.id);
      if (atual !== undefined) atual.tentativas = valor;
    },
    despachar: async (pedido) => {
      const atual = tarefas.get(pedido.tarefa.id);
      if (atual === undefined) return { custoUsd: 0.5, concluiu: true };

      if (pedido.papel === "construtor" && opcoes.construtorMudo === true) {
        // Escreve nas Notas (como o agente real faz) mas NÃO toca no status.
        if (opcoes.escreveuAntesDeMorrer === true) atual.tentativas += 1;
        return { custoUsd: 0.5, concluiu: true };
      }
      if (pedido.papel === opcoes.cortarEm) {
        // O agente morreu. Pode ou não ter alcançado escrever o campo antes disso.
        if (opcoes.escreveuAntesDeMorrer === true) atual.tentativas += 1;
        return {
          custoUsd: opcoes.custoDoCorte ?? 0.5,
          concluiu: false,
          erro: opcoes.erroDoCorte ?? "Reached maximum number of turns (25)",
          ...(opcoes.porCota === true ? { limiteDeUso: "3:50am" } : {}),
        };
      }
      if (pedido.papel === "construtor") atual.tentativas += 1;
      atual.status = atual.status === "pronta" ? "em-teste" : "concluida";
      return { custoUsd: 0.5, concluiu: true };
    },
    log: (_n, texto) => logs.push(texto),
  };

  if (opcoes.semGravarTentativas === true) {
    delete (dep as Partial<DependenciasMotor>).gravarTentativas;
  }
  return { dep, tarefas, gravacoes, logs };
}

describe("ciclo cobrado do construtor cortado", () => {
  it("cobra o ciclo quando o construtor morre sem gravar `tentativas`", async () => {
    const m = mundo([tarefa({ id: "T-001", tentativas: 0 })], { cortarEm: "construtor" });
    const rel = await rodarPipeline(ctxBase, m.dep);

    expect(m.gravacoes).toEqual([{ id: "T-001", valor: 1 }]);
    expect(m.tarefas.get("T-001")?.tentativas).toBe(1);
    expect(rel.ciclosCobrados).toEqual([
      { tarefa: "T-001", de: 0, para: 1, motivo: "cortado" },
    ]);
  });

  /**
   * A trava contra a dupla cobrança. O contrato manda o construtor incrementar AO COMEÇAR;
   * se ele alcançou fazer isso antes de morrer, o ciclo já está contado e somar de novo
   * cobraria duas fichas por um despacho — encurtando a vida da tarefa pela metade.
   */
  it("NÃO cobra quando o agente já havia gravado antes de morrer", async () => {
    const m = mundo([tarefa({ id: "T-001", tentativas: 0 })], {
      cortarEm: "construtor",
      escreveuAntesDeMorrer: true,
    });
    const rel = await rodarPipeline(ctxBase, m.dep);

    expect(m.gravacoes).toEqual([]);
    expect(m.tarefas.get("T-001")?.tentativas).toBe(1);
    expect(rel.ciclosCobrados).toEqual([]);
  });

  /**
   * `tentativas` conta ciclos de CONSTRUÇÃO. Verificador e revisor cortados não gastam ficha
   * da tarefa — é o mesmo princípio que `tentativasConfiaveis` guarda quando um papel alheio
   * escreve o campo.
   */
  it("verificador cortado não gasta ficha da tarefa", async () => {
    const m = mundo([tarefa({ id: "T-001", status: "em-teste", tentativas: 1 })], {
      cortarEm: "verificador",
    });
    const rel = await rodarPipeline(ctxBase, m.dep);

    expect(m.gravacoes).toEqual([]);
    expect(rel.ciclosCobrados).toEqual([]);
  });

  it("revisor cortado também não", async () => {
    const m = mundo([tarefa({ id: "T-001", status: "em-revisao", tentativas: 1 })], {
      cortarEm: "revisor",
    });
    const rel = await rodarPipeline(ctxBase, m.dep);

    expect(m.gravacoes).toEqual([]);
    expect(rel.ciclosCobrados).toEqual([]);
  });

  /**
   * Corte por COTA é a parede da assinatura, não falha da tarefa. A doutrina dessa parada é
   * "nada do que foi feito se perde, redispare" — cobrar ficha ali puniria a tarefa pelo
   * relógio do provedor.
   */
  it("corte por cota NÃO cobra ciclo", async () => {
    const m = mundo([tarefa({ id: "T-001", tentativas: 0 })], {
      cortarEm: "construtor",
      porCota: true,
    });
    const rel = await rodarPipeline(ctxBase, m.dep);

    expect(m.gravacoes).toEqual([]);
    expect(rel.ciclosCobrados).toEqual([]);
    expect(rel.encerrouPor).toBe("cota");
  });

  it("sem a dependência opcional, volta ao comportamento antigo sem quebrar", async () => {
    const m = mundo([tarefa({ id: "T-001", tentativas: 0 })], {
      cortarEm: "construtor",
      semGravarTentativas: true,
    });
    const rel = await rodarPipeline(ctxBase, m.dep);

    expect(rel.ciclosCobrados).toEqual([]);
    expect(m.tarefas.get("T-001")?.tentativas).toBe(0);
  });

  /** O ponto inteiro do conserto: a cobrança é o que faz o teto de 3 ciclos chegar. */
  it("na 3ª tentativa a cobrança leva a tarefa ao teto em vez de repetir para sempre", async () => {
    const m = mundo([tarefa({ id: "T-001", tentativas: 2 })], { cortarEm: "construtor" });
    await rodarPipeline(ctxBase, m.dep);

    expect(m.tarefas.get("T-001")?.tentativas).toBe(3);
  });

  /**
   * A SEGUNDA METADE DO CONSERTO (21/09). A guarda de progresso já parava a RODADA, mas
   * `tentativas` ficava parado — então o teto de 3 ciclos nunca chegava, a tarefa voltava a
   * `pronta` e o job seguinte a redespachava igual. A T-056 repetiu isso às 06:56, 07:29 e
   * 12:45 UTC, ~US$ 3 por rodada, sem fim à vista.
   */
  it("construtor que TERMINA sem mover o status também gasta ciclo", async () => {
    const m = mundo([tarefa({ id: "T-001", tentativas: 0 })], { construtorMudo: true });
    const rel = await rodarPipeline(ctxBase, m.dep);

    expect(rel.ciclosCobrados.length).toBeGreaterThan(0);
    expect(m.tarefas.get("T-001")?.tentativas).toBeGreaterThan(0);
    expect(rel.encerrouPor).toBe("sem-progresso");
  });

  it("construtor mudo que JÁ gravou tentativas não é cobrado de novo", async () => {
    const m = mundo([tarefa({ id: "T-001", tentativas: 0 })], {
      construtorMudo: true,
      escreveuAntesDeMorrer: true,
    });
    await rodarPipeline(ctxBase, m.dep);

    expect(m.gravacoes).toEqual([]);
  });

  /**
   * O defeito que uma rodada real de 21/09 revelou no PRÓPRIO conserto: três despachos caíram
   * em `SSL certificate is not yet valid` (relógio fora de sincronia) e T-059/T-060 foram de
   * 0 a 2 tentativas em duas rodadas, sem nenhum agente ter trabalhado. Na terceira seriam
   * bloqueadas sem terem tido chance. Mesma doutrina da cota: parede externa não gasta ficha.
   */
  it("corte por INFRAESTRUTURA não gasta ficha da tarefa", async () => {
    for (const erro of [
      "API Error: Unable to connect to API: SSL certificate is not yet valid",
      "getaddrinfo ENOTFOUND api.anthropic.com",
      "socket hang up",
    ]) {
      const m = mundo([tarefa({ id: "T-001", tentativas: 0 })], {
        cortarEm: "construtor",
        erroDoCorte: erro,
      });
      const rel = await rodarPipeline(ctxBase, m.dep);
      expect(m.gravacoes, erro).toEqual([]);
      expect(rel.ciclosCobrados, erro).toEqual([]);
    }
  });

  /** A trava do lado oposto: estouro de voltas É falha do agente e continua cobrando. */
  it("estouro de voltas continua gastando ficha — o agente recebeu o orçamento e o gastou", async () => {
    const m = mundo([tarefa({ id: "T-001", tentativas: 0 })], {
      cortarEm: "construtor",
      erroDoCorte: "Reached maximum number of turns (25)",
    });
    const rel = await rodarPipeline(ctxBase, m.dep);

    expect(rel.ciclosCobrados).toEqual([
      { tarefa: "T-001", de: 0, para: 1, motivo: "cortado" },
    ]);
  });

  /**
   * O GATE PRINCIPAL (24/09), e a razão de ele existir em vez de mais um padrão na lista.
   *
   * Cota foi isentada primeiro, TLS depois, e aí veio `OAuth session expired` — que nenhuma
   * das duas pegava. Três despachos morreram sem trabalhar e T-062, T-069 e T-070 foram de
   * 0 para 1 numa rodada de US$ 0,00. Terceira variante da mesma classe, terceiro remendo.
   * Custo zero cobre a classe inteira, inclusive o que ainda não aconteceu.
   */
  it("corte que não custou NADA não gasta ficha, qualquer que seja a causa", async () => {
    for (const erro of [
      "Failed to authenticate: OAuth session expired and could not be refreshed",
      "algo que nenhuma lista de padrões previu",
      "",
    ]) {
      const m = mundo([tarefa({ id: "T-001", tentativas: 0 })], {
        cortarEm: "construtor",
        erroDoCorte: erro,
        custoDoCorte: 0,
      });
      const rel = await rodarPipeline(ctxBase, m.dep);
      expect(m.gravacoes, erro).toEqual([]);
      expect(rel.ciclosCobrados, erro).toEqual([]);
    }
  });

  /** A trava do outro lado: corte que CUSTOU é trabalho queimado, e cobra. */
  it("corte que custou gasta ficha — o agente recebeu o orçamento e o queimou", async () => {
    const m = mundo([tarefa({ id: "T-001", tentativas: 0 })], {
      cortarEm: "construtor",
      erroDoCorte: "Reached maximum number of turns (25)",
      custoDoCorte: 1.8,
    });
    const rel = await rodarPipeline(ctxBase, m.dep);

    expect(rel.ciclosCobrados).toEqual([
      { tarefa: "T-001", de: 0, para: 1, motivo: "cortado" },
    ]);
  });

  it("diz em voz alta que escreveu num campo que é contrato do agente", async () => {
    const m = mundo([tarefa({ id: "T-001", tentativas: 0 })], { cortarEm: "construtor" });
    await rodarPipeline(ctxBase, m.dep);

    expect(
      m.logs.some((l) => l.includes("foi cortado") && l.includes("0 → 1")),
    ).toBe(true);
  });
});
