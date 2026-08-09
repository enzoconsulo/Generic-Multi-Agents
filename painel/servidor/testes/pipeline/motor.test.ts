import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rodarPipeline, type DependenciasMotor, type PedidoDespacho } from "../../src/pipeline/motor.js";
import { novoOrcamento } from "../../src/pipeline/orcamento.js";
import type { Plano, TarefaResumo } from "../../src/fabrica/tipos.js";

function tarefa(p: Partial<TarefaResumo> & { id: string }): TarefaResumo {
  return {
    arquivo: `${p.id}.md`,
    titulo: p.id,
    status: "pronta",
    prioridade: "media",
    dependencias: [],
    areas: [],
    tentativas: 0,
    replanejadaDe: null,
    agente: null,
    criada: "2026-08-01",
    atualizada: "2026-08-01",
    erros: [],
    ...p,
  };
}

/**
 * Fábrica de mentira: as tarefas vivem em memória e o "despacho" apenas avança o status,
 * como um agente real faria ao gravar no arquivo. É isto que permite exercitar o laço
 * inteiro sem gastar a assinatura — e um laço de orquestração sem teste foi exatamente o
 * que produziu o abandono de agente em voo e o roteamento para especialista inexistente.
 */
function mundo(
  iniciais: TarefaResumo[],
  opcoes: {
    custoPorDespacho?: number;
    criterios?: string;
    notas?: string;
    congelado?: boolean;
    plano?: Plano | null;
    /** Há mudança não commitada nas areas? Base do saneamento. */
    trabalhoParcial?: boolean;
    /** Texto que o agente de marco devolve — de onde sai o veredito. */
    textoMarco?: string;
  } = {},
) {
  const tarefas = new Map(iniciais.map((t) => [t.id, { ...t }]));
  const despachos: PedidoDespacho[] = [];
  const logs: string[] = [];
  const marcosGravados: { fase: string; veredicto: string }[] = [];
  const commits: string[] = [];
  const proximoStatus: Record<string, string> = {
    pronta: "em-teste",
    "em-execucao": "em-teste",
    "em-teste": "em-revisao",
    "em-revisao": "concluida",
  };

  const dep: DependenciasMotor = {
    lerTarefas: async () => [...tarefas.values()],
    gravarStatus: async (t, status) => {
      const atual = tarefas.get(t.id);
      if (atual !== undefined) atual.status = status;
    },
    anexarVerificacao: async () => {},
    lerCriteriosDe: async () => opcoes.criterios ?? "",
    lerNotasDe: async () => opcoes.notas ?? "",
    temTrabalhoParcial: async () => opcoes.trabalhoParcial ?? false,
    lerPlano: async () => opcoes.plano ?? null,
    gravarMarco: async (fase, veredicto) => {
      marcosGravados.push({ fase, veredicto });
    },
    commitarGestao: async (mensagem) => {
      commits.push(mensagem);
    },
    despachar: async (pedido) => {
      despachos.push(pedido);
      const atual = tarefas.get(pedido.tarefa.id);
      // `congelado` simula o agente que TERMINA sem gravar o próprio status — o bug que
      // faria o motor repetir o mesmo despacho até o orçamento acabar.
      if (atual !== undefined && opcoes.congelado !== true) {
        atual.status = proximoStatus[atual.status] ?? "concluida";
      }
      return {
        custoUsd: opcoes.custoPorDespacho ?? 0.5,
        concluiu: true,
        texto: pedido.papel === "marco" ? (opcoes.textoMarco ?? "MARCO: aprovado") : "",
      };
    },
    log: (_n, texto) => logs.push(texto),
  };

  return { dep, despachos, logs, tarefas, marcosGravados, commits };
}

/** PLANO.md de mentira com uma fase e as tarefas dela. */
function plano(fases: { nome: string; tarefas: string[]; marco?: string }[]): Plano {
  return {
    titulo: "Plano",
    visao: "",
    fases: fases.map((f) => ({
      nome: f.nome,
      meta: `Meta da ${f.nome}`,
      marco: { bruto: f.marco ?? "pendente", estado: (f.marco ?? "pendente") as never, data: null },
      tarefas: f.tarefas,
    })),
    erros: [],
  } as Plano;
}

const ctxBase = {
  dirProjeto: mkdtempSync(join(tmpdir(), "motor-")),
  projeto: "proj",
  trilha: "software" as const,
  equipe: null,
  disponiveis: new Set<string>(),
  reforco: "opus" as string | null,
  orcamento: novoOrcamento(null),
};

describe("rodarPipeline — o ciclo completo", () => {
  it("leva uma tarefa de pronta a concluída pelos três papéis, na ordem", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "pronta" })]);
    const rel = await rodarPipeline(ctxBase, dep);

    expect(despachos.map((d) => d.papel)).toEqual(["construtor", "verificador", "revisor"]);
    expect(despachos.map((d) => d.agente)).toEqual(["executor", "testador", "revisor"]);
    expect(rel.tarefasConcluidas).toContain("T-001");
    expect(rel.encerrouPor).toBe("sem-trabalho");
  });

  it("promove backlog quando a dependência conclui, e registra", async () => {
    const { dep } = mundo([
      tarefa({ id: "T-001", status: "pronta" }),
      tarefa({ id: "T-002", status: "backlog", dependencias: ["T-001"] }),
    ]);
    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.promovidas).toContain("T-002");
    expect(rel.tarefasConcluidas).toEqual(expect.arrayContaining(["T-001", "T-002"]));
  });

  it("sem trabalho, não despacha ninguém", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "concluida" })]);
    const rel = await rodarPipeline(ctxBase, dep);
    expect(despachos).toEqual([]);
    expect(rel.encerrouPor).toBe("sem-trabalho");
  });

  // Erro de frontmatter que NUNCA fecha sozinho: silenciar deixaria a tarefa presa em
  // backlog para sempre, e é assim que um plano trava sem ninguém entender por quê.
  it("denuncia dependência inexistente em vez de deixar a tarefa presa em silêncio", async () => {
    const { dep, logs } = mundo([tarefa({ id: "T-005", status: "backlog", dependencias: ["T-999"] })]);
    await rodarPipeline(ctxBase, dep);
    expect(logs.some((l) => l.includes("INEXISTENTE") && l.includes("T-999"))).toBe(true);
  });
});

describe("rodarPipeline — orçamento", () => {
  it("para ANTES de despachar quando não cabe outra tarefa, sem cortar ninguém", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001" })], { custoPorDespacho: 5 });
    const rel = await rodarPipeline({ ...ctxBase, orcamento: novoOrcamento(3) }, dep);

    expect(rel.encerrouPor).toBe("orcamento");
    // Zero despacho: com teto de US$ 3 e estimativa padrão de US$ 2,10 × 1,25 = 2,63,
    // ainda cabia UM — o corte acontece na volta seguinte, nunca no meio.
    expect(despachos.length).toBeLessThanOrEqual(1);
  });

  it("sem teto, roda até acabar o trabalho", async () => {
    const { dep } = mundo([tarefa({ id: "T-001" }), tarefa({ id: "T-002", areas: ["b.js"] })]);
    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.encerrouPor).toBe("sem-trabalho");
    expect(rel.despachos).toBeGreaterThanOrEqual(6);
  });

  // Agente sem resultado tira a TAREFA de circulação (continuar nela seria empilhar
  // trabalho sobre estado desconhecido), mas a rodada segue nas outras — ver o bloco
  // "falha de etapa isolada".
  it("agente que não devolve resultado tira a tarefa da rodada", async () => {
    const { dep } = mundo([tarefa({ id: "T-001" })]);
    const original = dep.despachar;
    let n = 0;
    dep.despachar = async (p) => {
      n += 1;
      if (n === 2) return { custoUsd: 0.5, concluiu: false };
      return original(p);
    };
    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.etapasFalhas.map((e) => e.tarefa)).toContain("T-001");
    // Era a única tarefa: sem mais trabalho, a rodada fecha normalmente.
    expect(rel.encerrouPor).toBe("sem-trabalho");
  });
});

describe("rodarPipeline — passada mecânica (I5)", () => {
  const criteriosQueFalham = [
    "- [ ] sempre falha",
    '      `verificar: node -e "process.exit(1)"`',
  ].join("\n");
  const criteriosQuePassam = [
    "- [ ] sempre passa",
    '      `verificar: node -e "process.exit(0)"`',
  ].join("\n");

  // A economia da I5: o verificador custa ~US$ 0,50 por despacho. Se um comando já provou
  // que falhou, pagar isso é comprar a confirmação do óbvio.
  it("critério objetivo que falha devolve ao construtor SEM despachar o verificador", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "em-teste" })], {
      criterios: criteriosQueFalham,
    });
    // Um despacho de construtor resolveria o estado e o laço giraria; corta na 1ª volta.
    dep.despachar = async (p) => {
      despachos.push(p);
      return { custoUsd: 0.5, concluiu: false };
    };
    const rel = await rodarPipeline(ctxBase, dep);

    expect(despachos.some((d) => d.papel === "verificador")).toBe(false);
    expect(rel.criteriosExecutados).toBeGreaterThan(0);
  });

  it("critério objetivo que passa segue para o verificador normalmente", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "em-teste" })], {
      criterios: criteriosQuePassam,
    });
    await rodarPipeline(ctxBase, dep);
    expect(despachos.some((d) => d.papel === "verificador")).toBe(true);
  });

  it("tarefa sem critério executável não muda nada — o verificador roda como sempre", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "em-teste" })], {
      criterios: "- [ ] a tela fica boa",
    });
    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.criteriosExecutados).toBe(0);
    expect(despachos.some((d) => d.papel === "verificador")).toBe(true);
  });
});

describe("rodarPipeline — esgotamento de ciclos", () => {
  // Bloquear e replanejar são desfechos DIFERENTES, e a diferença é uma regra escrita
  // (autocorreção vale uma vez por linhagem), não julgamento — por isso mora no motor.
  it("tarefa esgotada sem linhagem vai para REPLANEJAMENTO (decisão do modelo)", async () => {
    const { dep } = mundo([tarefa({ id: "T-001", status: "pronta", tentativas: 4 })]);
    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.paraReplanejar).toContain("T-001");
    expect(rel.bloqueadas).not.toContain("T-001");
  });

  it("tarefa que JÁ era replanejamento e esgotou de novo é bloqueada para o usuário", async () => {
    const { dep, tarefas } = mundo([
      tarefa({ id: "T-001a", status: "pronta", tentativas: 4, replanejadaDe: "T-001" }),
    ]);
    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.bloqueadas).toContain("T-001a");
    expect(tarefas.get("T-001a")?.status).toBe("bloqueada");
  });
});

describe("rodarPipeline — roteamento", () => {
  it("usa a trilha genérica quando o projeto não é software", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001" })]);
    await rodarPipeline({ ...ctxBase, trilha: "generica" }, dep);
    expect(despachos.map((d) => d.agente)).toEqual(["construtor", "conferente", "revisor-generico"]);
  });

  it("escala para o reforçado quando a tarefa já voltou reprovada", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "em-execucao", tentativas: 1 })]);
    await rodarPipeline(ctxBase, dep);
    expect(despachos[0]?.agente).toBe("executor-reforcado");
    expect(despachos[0]?.modelo).toBe("opus");
  });
});

describe("rodarPipeline — guarda de progresso", () => {
  /**
   * Quem move o status de uma tarefa é o próprio agente, gravando no arquivo (é o contrato
   * dele). Se ele terminar SEM gravar, o motor releria o mesmo passo para sempre e pagaria
   * um despacho por volta: um bug do agente viraria uma fatura. Esta guarda é o que
   * transforma isso numa parada com relatório.
   */
  it("agente que termina sem gravar o status não faz o motor girar", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "pronta" })], {
      congelado: true,
    });
    const rel = await rodarPipeline(ctxBase, dep);

    expect(rel.encerrouPor).toBe("sem-progresso");
    // Dois despachos: o primeiro é legítimo, o segundo é o que revela a falta de progresso.
    expect(despachos).toHaveLength(2);
  });

  it("o relatório nomeia a tarefa e o status travado", async () => {
    const { dep, logs } = mundo([tarefa({ id: "T-007", status: "pronta" })], { congelado: true });
    await rodarPipeline(ctxBase, dep);
    expect(logs.some((l) => l.includes("T-007") && l.includes("não está gravando"))).toBe(true);
    expect(logs.some((l) => l.includes('"pronta"'))).toBe(true);
  });
});

/**
 * As três responsabilidades que o orquestrador-modelo tinha e que ficaram órfãs quando o
 * laço virou código. Todas são detectáveis por regra — por isso voltaram como código, e não
 * como "lembre de clicar no botão".
 */
describe("rodarPipeline — saneamento de abertura", () => {
  // Sobra de sessão anterior: no INÍCIO da rodada não há agente nenhum rodando, então
  // `em-execucao` só pode ser resto. Notas vazias = nada foi registrado = recomeça.
  it("em-execucao SEM Notas volta para pronta", async () => {
    const { dep, tarefas } = mundo([tarefa({ id: "T-001", status: "em-execucao" })], { notas: "" });
    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.saneadas).toContain("T-001");
    expect(tarefas.get("T-001")?.status).not.toBe("em-execucao");
  });

  it("não mexe em tarefa que não está em-execucao", async () => {
    const { dep } = mundo([
      tarefa({ id: "T-001", status: "pronta" }),
      tarefa({ id: "T-002", status: "em-teste" }),
    ]);
    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.saneadas).toEqual([]);
  });
});

describe("rodarPipeline — marco de fase", () => {
  it("fase com todas as tarefas concluídas dispara o marco e grava o veredito", async () => {
    const { dep, despachos, marcosGravados } = mundo(
      [tarefa({ id: "T-001", status: "pronta" })],
      { plano: plano([{ nome: "Fase 1", tarefas: ["T-001"] }]) },
    );
    const rel = await rodarPipeline(ctxBase, dep);

    expect(despachos.some((d) => d.papel === "marco")).toBe(true);
    expect(rel.marcos).toEqual([{ fase: "Fase 1", veredicto: "aprovado" }]);
    expect(marcosGravados).toEqual([{ fase: "Fase 1", veredicto: "aprovado" }]);
  });

  it("o marco usa o verificador da trilha, em modo próprio", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "pronta" })], {
      plano: plano([{ nome: "Fase 1", tarefas: ["T-001"] }]),
    });
    await rodarPipeline({ ...ctxBase, trilha: "generica" }, dep);
    const marco = despachos.find((d) => d.papel === "marco");
    expect(marco?.agente).toBe("conferente");
    expect(marco?.fase).toBe("Fase 1");
  });

  it("fase com tarefa pendente NÃO dispara marco", async () => {
    const { dep, despachos } = mundo(
      [tarefa({ id: "T-001", status: "concluida" }), tarefa({ id: "T-002", status: "backlog", dependencias: ["T-999"] })],
      { plano: plano([{ nome: "Fase 1", tarefas: ["T-001", "T-002"] }]) },
    );
    await rodarPipeline(ctxBase, dep);
    expect(despachos.some((d) => d.papel === "marco")).toBe(false);
  });

  it("marco já aprovado não repete", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "concluida" })], {
      plano: plano([{ nome: "Fase 1", tarefas: ["T-001"], marco: "aprovado" }]),
    });
    await rodarPipeline(ctxBase, dep);
    expect(despachos.some((d) => d.papel === "marco")).toBe(false);
  });

  /**
   * Veredito ilegível NÃO para para perguntar: repete uma vez e, se continuar ilegível,
   * registra REPROVADO. A direção não é arbitrária — `reprovado` gera correção, que é
   * recuperável; `aprovado` esconderia a fase para sempre, porque o registro é o que diz às
   * próximas sessões que o marco já rodou.
   */
  it("veredito ilegível: repete uma vez, depois REPROVADO e abre correção", async () => {
    const { dep, marcosGravados, despachos, logs } = mundo(
      [tarefa({ id: "T-001", status: "pronta" })],
      {
        plano: plano([{ nome: "Fase 1", tarefas: ["T-001"] }]),
        textoMarco: "Rodei tudo e achei umas coisas interessantes.",
      },
    );
    const rel = await rodarPipeline(ctxBase, dep);

    expect(despachos.filter((d) => d.papel === "marco")).toHaveLength(2); // 1 + 1 retentativa
    expect(rel.marcos).toEqual([{ fase: "Fase 1", veredicto: "reprovado" }]);
    expect(marcosGravados).toEqual([{ fase: "Fase 1", veredicto: "reprovado" }]);
    // Reprovado abre correção sozinho, sem esperar ninguém.
    expect(despachos.some((d) => d.papel === "planejador")).toBe(true);
    expect(logs.some((l) => l.includes("lado recuperável"))).toBe(true);
  });

  it("marco reprovado explicitamente também abre correção sozinho", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "pronta" })], {
      plano: plano([{ nome: "Fase 1", tarefas: ["T-001"] }]),
      textoMarco: "MARCO: reprovado",
    });
    await rodarPipeline(ctxBase, dep);
    expect(despachos.filter((d) => d.papel === "planejador")).toHaveLength(1);
  });

  it("sem PLANO.md, nenhum marco — projeto importado à mão é caso legítimo", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "pronta" })], { plano: null });
    await rodarPipeline(ctxBase, dep);
    expect(despachos.some((d) => d.papel === "marco")).toBe(false);
  });
});

describe("rodarPipeline — documentador e commit da gestão", () => {
  it("3+ tarefas concluídas dispara o documentador UMA vez, no fecho", async () => {
    const { dep, despachos } = mundo([
      tarefa({ id: "T-001", areas: ["a.js"] }),
      tarefa({ id: "T-002", areas: ["b.js"] }),
      tarefa({ id: "T-003", areas: ["c.js"] }),
    ]);
    const rel = await rodarPipeline(ctxBase, dep);

    expect(rel.documentou).toBe(true);
    expect(despachos.filter((d) => d.papel === "documentador")).toHaveLength(1);
    // No FECHO: documentar a cada tarefa pagaria um despacho para reescrever o que a
    // próxima muda de novo.
    expect(despachos[despachos.length - 1]?.papel).toBe("documentador");
  });

  it("menos de 3 concluídas não gasta documentador", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001" })]);
    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.documentou).toBe(false);
    expect(despachos.some((d) => d.papel === "documentador")).toBe(false);
  });

  it("documentação é adiada quando o orçamento não comporta", async () => {
    const { dep, despachos } = mundo(
      [
        tarefa({ id: "T-001", areas: ["a.js"] }),
        tarefa({ id: "T-002", areas: ["b.js"] }),
        tarefa({ id: "T-003", areas: ["c.js"] }),
      ],
      { custoPorDespacho: 1 },
    );
    await rodarPipeline({ ...ctxBase, orcamento: novoOrcamento(6) }, dep);
    expect(despachos.some((d) => d.papel === "documentador")).toBe(false);
  });

  it("sempre commita a gestão no fim, mesmo sem tarefa concluída", async () => {
    const { dep, commits } = mundo([tarefa({ id: "T-001", status: "concluida" })]);
    await rodarPipeline(ctxBase, dep);
    expect(commits).toHaveLength(1);
    expect(commits[0]).toContain("gestão");
  });

  // Falhar o commit não pode apagar o relatório da rodada.
  it("falha no commit não derruba a rodada", async () => {
    const { dep } = mundo([tarefa({ id: "T-001", status: "concluida" })]);
    dep.commitarGestao = async () => {
      throw new Error("index.lock");
    };
    await expect(rodarPipeline(ctxBase, dep)).resolves.toBeDefined();
  });
});

describe("guarda de progresso — não pode cortar retrabalho legítimo", () => {
  /**
   * O bug que este teste trava: a primeira versão da guarda contava repetições do par
   * (tarefa, papel) na rodada inteira. Parecia equivalente e não é — um retrabalho legítimo
   * despacha o construtor 3 vezes na MESMA tarefa (tentativas 1, 2 e 3), e a contagem
   * cortaria a rodada na segunda, transformando a política de 3 ciclos em 1.
   *
   * O que caracteriza travamento é o STATUS não mudar depois de o agente dizer que terminou.
   */
  it("tarefa que volta reprovada 2 vezes NÃO é confundida com travamento", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "pronta" })]);
    const tarefas = new Map([["T-001", { status: "pronta", ciclos: 0 }]]);

    // Ciclo realista: construtor → verificador REPROVA (volta a em-execucao) → construtor…
    dep.lerTarefas = async () => [
      tarefa({ id: "T-001", status: tarefas.get("T-001")!.status, tentativas: tarefas.get("T-001")!.ciclos }),
    ];
    dep.despachar = async (p) => {
      despachos.push(p);
      const est = tarefas.get("T-001")!;
      if (p.papel === "construtor") est.status = "em-teste";
      else if (p.papel === "verificador") {
        est.ciclos += 1;
        est.status = est.ciclos < 3 ? "em-execucao" : "em-revisao";
      } else est.status = "concluida";
      return { custoUsd: 0.3, concluiu: true };
    };

    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.encerrouPor).not.toBe("sem-progresso");
    // 3 construções + 3 verificações + 1 revisão.
    expect(despachos.filter((d) => d.papel === "construtor")).toHaveLength(3);
  });
});

describe("teto de despachos por tarefa — o circuito que a guarda de progresso não pega", () => {
  /**
   * Encontrado pelo simulador contra a fábrica REAL: 41 despachos na mesma tarefa, US$ 22,55
   * numa rodada. O status oscilava `em-teste` ↔ `em-execucao` (a passada mecânica reprovava
   * e devolvia ao construtor), então a guarda de progresso — que mede "o status mudou?" —
   * via movimento e não acusava nada.
   *
   * O limite de 3 ciclos do protocolo não salvava porque depende do AGENTE incrementar
   * `tentativas`. Confiar nisso é a família de suposição que já custou caro aqui.
   */
  it("tarefa em vaivém é BLOQUEADA e a rodada continua nas outras", async () => {
    const estados = new Map([
      ["T-001", "em-teste"],
      ["T-002", "pronta"],
    ]);
    const despachos: PedidoDespacho[] = [];
    const logs: string[] = [];
    const dep: DependenciasMotor = {
      lerTarefas: async () =>
        [...estados].map(([id, status]) => tarefa({ id, status, areas: [`${id}.js`] })),
      gravarStatus: async (t, status) => estados.set(t.id, status) as unknown as void,
      anexarVerificacao: async () => {},
      lerCriteriosDe: async () => "",
      lerNotasDe: async () => "",
      temTrabalhoParcial: async () => false,
      lerPlano: async () => null,
      gravarMarco: async () => {},
      commitarGestao: async () => {},
      despachar: async (p) => {
        despachos.push(p);
        // T-001 oscila para sempre; T-002 anda normalmente.
        if (p.tarefa.id === "T-001") {
          estados.set("T-001", estados.get("T-001") === "em-teste" ? "em-execucao" : "em-teste");
        } else {
          const proximo: Record<string, string> = {
            pronta: "em-teste",
            "em-execucao": "em-teste",
            "em-teste": "em-revisao",
            "em-revisao": "concluida",
          };
          estados.set("T-002", proximo[estados.get("T-002") ?? ""] ?? "concluida");
        }
        return { custoUsd: 0.1, concluiu: true };
      },
      log: (_n, texto) => logs.push(texto),
    };

    const rel = await rodarPipeline(ctxBase, dep);

    expect(rel.bloqueadas).toContain("T-001");
    expect(estados.get("T-001")).toBe("bloqueada");
    // O teto é por tarefa, não da rodada: T-002 chegou ao fim.
    expect(estados.get("T-002")).toBe("concluida");
    expect(despachos.filter((d) => d.tarefa.id === "T-001").length).toBeLessThanOrEqual(13);
    expect(logs.some((l) => l.includes("em circuito"))).toBe(true);
  });
});

describe("autonomia — o que antes parava para perguntar", () => {
  /**
   * O objetivo do projeto é colocar para rodar e o sistema se organizar. Cada um destes já
   * tinha REGRA escrita na constituição — parar para perguntar era eu não ter automatizado,
   * não uma decisão de desenho.
   */
  it("tarefa esgotada dispara o PLANEJADOR sozinha (autocorreção)", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "pronta", tentativas: 4 })]);
    const rel = await rodarPipeline(ctxBase, dep);

    expect(rel.paraReplanejar).toContain("T-001");
    expect(despachos.some((d) => d.papel === "planejador")).toBe(true);
    // E não fica girando: sai de circulação depois do replanejamento.
    expect(despachos.filter((d) => d.papel === "planejador")).toHaveLength(1);
  });

  // Autocorreção vale UMA vez por linhagem: a substituta que esgota é problema para o
  // usuário, senão um erro de dimensionamento gera replanejamentos em cascata.
  it("substituta que esgota de novo é bloqueada, sem replanejar em cascata", async () => {
    const { dep, despachos } = mundo([
      tarefa({ id: "T-001a", status: "pronta", tentativas: 4, replanejadaDe: "T-001" }),
    ]);
    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.bloqueadas).toContain("T-001a");
    expect(despachos.some((d) => d.papel === "planejador")).toBe(false);
  });

  it("tarefa só de documentação pula o verificador", async () => {
    const { dep, despachos } = mundo([
      tarefa({ id: "T-022", status: "em-teste", areas: ["README.md", "CLAUDE.md"] }),
    ]);
    await rodarPipeline(ctxBase, dep);
    expect(despachos.some((d) => d.papel === "verificador")).toBe(false);
    expect(despachos.some((d) => d.papel === "revisor")).toBe(true);
  });

  it("tarefa com código NÃO pula, mesmo com um .md junto", async () => {
    const { dep, despachos } = mundo([
      tarefa({ id: "T-010", status: "em-teste", areas: ["src/a.js", "README.md"] }),
    ]);
    await rodarPipeline(ctxBase, dep);
    expect(despachos.some((d) => d.papel === "verificador")).toBe(true);
  });
});

describe("falha de etapa isolada — a rodada não pode morrer junto", () => {
  /**
   * Numa rodada REAL o `testador` morreu com "Claude Code process exited with code 1" e o
   * laço encerrou, levando junto tarefas que não tinham nada a ver. Falha de etapa é quase
   * sempre transitória; falha SISTÊMICA (cota, SDK, ambiente) é que justifica parar, e o
   * sinal dela é a sequência.
   */
  it("uma etapa que falha tira SÓ aquela tarefa da rodada", async () => {
    const estados = new Map([
      ["T-001", "em-teste"],
      ["T-002", "pronta"],
    ]);
    const dep: DependenciasMotor = {
      lerTarefas: async () =>
        [...estados].map(([id, status]) => tarefa({ id, status, areas: [`${id}.js`] })),
      gravarStatus: async (t, s) => estados.set(t.id, s) as unknown as void,
      anexarVerificacao: async () => {},
      lerCriteriosDe: async () => "",
      lerNotasDe: async () => "",
      temTrabalhoParcial: async () => false,
      lerPlano: async () => null,
      gravarMarco: async () => {},
      commitarGestao: async () => {},
      despachar: async (p) => {
        if (p.tarefa.id === "T-001") return { custoUsd: 0.1, concluiu: false };
        const proximo: Record<string, string> = {
          pronta: "em-teste",
          "em-teste": "em-revisao",
          "em-revisao": "concluida",
        };
        estados.set("T-002", proximo[estados.get("T-002") ?? ""] ?? "concluida");
        return { custoUsd: 0.1, concluiu: true };
      },
      log: () => {},
    };

    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.etapasFalhas.map((e) => e.tarefa)).toContain("T-001");
    // A outra tarefa chegou ao fim: a falha não contaminou a rodada.
    expect(estados.get("T-002")).toBe("concluida");
    expect(rel.encerrouPor).toBe("sem-trabalho");
  });

  it("3 falhas SEGUIDAS encerram — aí é sistêmico", async () => {
    const { dep } = mundo([
      tarefa({ id: "T-001", areas: ["a.js"] }),
      tarefa({ id: "T-002", areas: ["b.js"] }),
      tarefa({ id: "T-003", areas: ["c.js"] }),
      tarefa({ id: "T-004", areas: ["d.js"] }),
    ]);
    dep.despachar = async () => ({ custoUsd: 0.1, concluiu: false });
    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.encerrouPor).toBe("agente-cortado");
    expect(rel.etapasFalhas).toHaveLength(3);
  });

  it("sucesso no meio ZERA a sequência — falhas espalhadas não param a rodada", async () => {
    const estados = new Map([
      ["T-001", "pronta"],
      ["T-002", "pronta"],
      ["T-003", "pronta"],
    ]);
    let n = 0;
    const dep: DependenciasMotor = {
      lerTarefas: async () =>
        [...estados].map(([id, status]) => tarefa({ id, status, areas: [`${id}.js`] })),
      gravarStatus: async (t, s) => estados.set(t.id, s) as unknown as void,
      anexarVerificacao: async () => {},
      lerCriteriosDe: async () => "",
      lerNotasDe: async () => "",
      temTrabalhoParcial: async () => false,
      lerPlano: async () => null,
      gravarMarco: async () => {},
      commitarGestao: async () => {},
      despachar: async (p) => {
        n += 1;
        // Falha alternada: nunca 3 seguidas.
        if (n % 2 === 1) return { custoUsd: 0.1, concluiu: false };
        const proximo: Record<string, string> = {
          pronta: "em-teste",
          "em-teste": "em-revisao",
          "em-revisao": "concluida",
        };
        estados.set(p.tarefa.id, proximo[estados.get(p.tarefa.id) ?? ""] ?? "concluida");
        return { custoUsd: 0.1, concluiu: true };
      },
      log: () => {},
    };

    const rel = await rodarPipeline(ctxBase, dep);
    expect(rel.encerrouPor).not.toBe("agente-cortado");
  });
});

describe("linha-base do critério, antes do primeiro despacho (T-057)", () => {
  /**
   * Projeto real em disco, porque a decisão da linha-base depende do DISCO: alvo que existe e
   * não carrega é critério quebrado; alvo que não existe é critério saudável, e a tarefa é
   * justamente quem vai criá-lo. Fixture com caminho falso responderia sempre a mesma coisa.
   */
  function projeto(comSuite?: string) {
    const dir = mkdtempSync(join(tmpdir(), "t057-"));
    mkdirSync(join(dir, "tests"));
    writeFileSync(join(dir, "tests", "existente.test.js"), "", "utf8");
    const contador = join(dir, "execucoes.txt");
    writeFileSync(
      join(dir, "conta.js"),
      `const { existsSync, readFileSync, writeFileSync } = require("node:fs");
       const c = ${JSON.stringify(contador)};
       writeFileSync(c, String((existsSync(c) ? Number(readFileSync(c, "utf8")) : 0) + 1));
       process.exit(0);`,
      "utf8",
    );
    return {
      ctx: {
        ...ctxBase,
        dirProjeto: dir,
        ...(comSuite !== undefined ? { comandoTestes: comSuite } : {}),
      },
      execucoes: () => (existsSync(contador) ? Number(readFileSync(contador, "utf8")) : 0),
    };
  }

  /**
   * O caso T-030: `node --test tests` num projeto onde `tests/` EXISTE. O runner não sabe
   * consumir diretório nu, então o comando nunca vai provar nada — e o construtor, por
   * contrato, não pode consertar critério. Antes desta guarda, isso custava o despacho do
   * construtor + a passada mecânica antes de alguém notar.
   */
  it("critério que não executa nem na árvore intocada NÃO é despachado", async () => {
    const { ctx } = projeto();
    const { dep, despachos, logs } = mundo([tarefa({ id: "T-001", status: "pronta" })], {
      criterios: "- [ ] a suíte roda\n      `verificar: node --test tests`",
    });

    const rel = await rodarPipeline(ctx, dep);

    expect(despachos, "não devia gastar despacho nenhum").toHaveLength(0);
    expect(rel.criteriosQuebrados).toHaveLength(1);
    expect(rel.criteriosQuebrados[0]?.tarefa).toBe("T-001");
    expect(rel.criteriosQuebrados[0]?.antesDeGastar).toBe(true);
    expect(rel.tarefasConcluidas).not.toContain("T-001");
    expect(logs.join("\n")).toContain("Nada foi gasto nesta tarefa");
  }, 60_000);

  /**
   * O outro lado, e é o que impede a guarda de virar um portão que trava tudo: na linha-base
   * quase todo critério legítimo FALHA, porque a tarefa ainda não foi feita. Falhar não é o
   * sinal — a classe é.
   */
  it("critério que falha porque a tarefa ainda não foi feita segue normalmente", async () => {
    const { ctx } = projeto();
    const { dep, despachos } = mundo([tarefa({ id: "T-001", status: "pronta" })], {
      // O arquivo NÃO existe: é exatamente o que a tarefa vai criar (formato de T-017a).
      criterios: "- [ ] o teste passa\n      `verificar: node --test tests/novo.test.js`",
    });

    // O construtor falso CUMPRE a tarefa. Sem isto o critério seguiria falhando para sempre e
    // o teste mediria o teto de despachos em vez da linha-base — foi o que ele fez na primeira
    // versão. O ciclo completo só é observável se o agente de mentira entregar de mentira.
    const depEntregando: DependenciasMotor = {
      ...dep,
      despachar: async (pedido) => {
        if (pedido.papel === "construtor") {
          writeFileSync(
            join(ctx.dirProjeto, "tests", "novo.test.js"),
            'require("node:test").test("ok", () => {});',
            "utf8",
          );
        }
        return dep.despachar(pedido);
      },
    };

    const rel = await rodarPipeline(ctx, depEntregando);

    expect(despachos.map((d) => d.papel)).toEqual(["construtor", "verificador", "revisor"]);
    expect(rel.criteriosQuebrados).toHaveLength(0);
    expect(rel.tarefasConcluidas).toContain("T-001");
  }, 60_000);

  /**
   * A linha-base não pode custar a bateria do projeto por tarefa — seria reintroduzir o
   * desperdício que T-056 e T-059 cortaram. O critério idêntico ao canônico é pulado aqui e
   * roda uma única vez depois, na passada mecânica.
   */
  it("não roda a suíte do projeto na linha-base", async () => {
    const { ctx, execucoes } = projeto("node conta.js");
    const { dep } = mundo([tarefa({ id: "T-001", status: "pronta" })], {
      criterios: "- [ ] a suíte inteira passa\n      `verificar: node conta.js`",
    });

    await rodarPipeline(ctx, dep);

    // 1 = só a passada mecânica (critério implícito da suíte; o `verificar:` duplicado
    // reaproveita o veredito por T-059). 2 significaria linha-base rodando a bateria.
    expect(execucoes(), "a suíte devia rodar UMA vez na rodada").toBe(1);
  }, 60_000);

  /** Em retrabalho a árvore já tem a entrega — "intocada" deixaria de ser verdade. */
  it("não faz linha-base em retrabalho (tentativas >= 1)", async () => {
    const { ctx } = projeto();
    const { dep, despachos } = mundo(
      [tarefa({ id: "T-001", status: "em-execucao", tentativas: 1 })],
      { criterios: "- [ ] a suíte roda\n      `verificar: node --test tests`" },
    );

    const rel = await rodarPipeline(ctx, dep);

    expect(despachos.length, "retrabalho deve seguir sendo despachado").toBeGreaterThan(0);
    expect(rel.criteriosQuebrados.some((c) => c.antesDeGastar === true)).toBe(false);
  }, 60_000);

  /**
   * Linha-base é PRÉ-VOO, não verificação. Gravar o resultado dela na seção Verificação poria
   * um veredito de "antes do trabalho" no lugar onde o próximo agente lê o veredito da
   * entrega.
   */
  it("não escreve na seção Verificação da tarefa", async () => {
    const { ctx } = projeto();
    const { dep } = mundo([tarefa({ id: "T-001", status: "pronta" })], {
      criterios: "- [ ] a suíte roda\n      `verificar: node --test tests`",
    });
    const anexos: string[] = [];
    const depEspiao: DependenciasMotor = {
      ...dep,
      anexarVerificacao: async (_t, texto) => {
        anexos.push(texto);
      },
    };

    await rodarPipeline(ctx, depEspiao);

    expect(anexos, "a tarefa nem foi despachada; nada a anexar").toHaveLength(0);
  }, 60_000);
});
