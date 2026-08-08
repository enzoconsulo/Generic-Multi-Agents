import { describe, expect, it } from "vitest";
import {
  rodarPipeline,
  type ContextoMotor,
  type DependenciasMotor,
  type PedidoDespacho,
} from "../../src/pipeline/motor.js";
import { novoOrcamento } from "../../src/pipeline/orcamento.js";
import { VOLTAS_PONTUAL } from "../../src/pipeline/diagnostico.js";
import type { TarefaResumo } from "../../src/fabrica/tipos.js";

/**
 * RETRABALHO DIAGNOSTICADO e RECUPERAÇÃO DE TRABALHO NÃO REGISTRADO.
 *
 * Os dois nasceram da mesma rodada real (T-025, 08/08): dois ciclos de `opus` para corrigir
 * poucas linhas, e no fim a rodada encerrou por `sem-progresso` com o trabalho pronto no
 * disco e zero tarefa concluída.
 */

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
    agente: null,
    criada: "2026-08-01",
    atualizada: "2026-08-01",
    erros: [],
    ...p,
  };
}

const ctxBase: ContextoMotor = {
  dirProjeto: "/nao-usado",
  projeto: "teste",
  trilha: "software",
  equipe: null,
  disponiveis: new Set<string>(),
  reforco: "opus",
  orcamento: novoOrcamento(50),
};

/**
 * Mundo roteirável: `reprovarEm` diz qual papel devolve a tarefa ao construtor (uma vez), e
 * o agente falso incrementa `tentativas` como o real faria. É o mínimo para exercitar o
 * diagnóstico sem gastar a assinatura.
 */
function mundo(
  iniciais: TarefaResumo[],
  opcoes: {
    reprovarEm?: "verificador" | "revisor";
    conformidade?: string;
    revisao?: string;
    criterios?: string;
    /** Construtor termina sem gravar status (o bug da T-025). */
    construtorMudo?: boolean;
    trabalhoParcial?: boolean;
    /** Driver sem as deps opcionais de recuperação. */
    semRecuperacao?: boolean;
  } = {},
) {
  const tarefas = new Map(iniciais.map((t) => [t.id, { ...t }]));
  const despachos: PedidoDespacho[] = [];
  const logs: string[] = [];
  const commitsDeTarefa: { id: string; mensagem: string }[] = [];
  const notasAnexadas: { id: string; texto: string }[] = [];
  let jaReprovou = false;
  let arvoreSuja = opcoes.trabalhoParcial ?? false;

  const proximoStatus: Record<string, string> = {
    pronta: "em-teste",
    "em-execucao": "em-teste",
    "em-teste": "em-revisao",
    "em-revisao": "concluida",
  };

  const base: DependenciasMotor = {
    lerTarefas: async () => [...tarefas.values()],
    gravarStatus: async (t, status) => {
      const atual = tarefas.get(t.id);
      if (atual !== undefined) atual.status = status;
    },
    anexarVerificacao: async () => {},
    lerCriteriosDe: async () => opcoes.criterios ?? "",
    lerNotasDe: async () => "",
    temTrabalhoParcial: async () => arvoreSuja,
    lerPlano: async () => null,
    gravarMarco: async () => {},
    commitarGestao: async () => {},
    lerRevisaoDe: async () => ({
      conformidade: opcoes.conformidade ?? "",
      revisao: opcoes.revisao ?? "",
    }),
    commitarTarefa: async (t, mensagem) => {
      commitsDeTarefa.push({ id: t.id, mensagem });
      // Commitar limpa a árvore — é o que torna a recuperação auto-limitada.
      arvoreSuja = false;
      return "abc1234def";
    },
    anexarNotas: async (t, texto) => {
      notasAnexadas.push({ id: t.id, texto });
    },
    despachar: async (pedido) => {
      despachos.push(pedido);
      const atual = tarefas.get(pedido.tarefa.id);
      if (atual === undefined) return { custoUsd: 0.1, concluiu: true };

      if (pedido.papel === "construtor" && opcoes.construtorMudo === true) {
        return { custoUsd: 0.1, concluiu: true }; // termina e NÃO grava status
      }
      if (pedido.papel === opcoes.reprovarEm && !jaReprovou) {
        jaReprovou = true;
        atual.status = "em-execucao";
        atual.tentativas += 1; // o agente real incrementa ao reprovar
        return { custoUsd: 0.1, concluiu: true };
      }
      atual.status = proximoStatus[atual.status] ?? "concluida";
      return { custoUsd: 0.1, concluiu: true };
    },
    log: (_n, texto) => logs.push(texto),
  };

  if (opcoes.semRecuperacao === true) {
    delete (base as Partial<DependenciasMotor>).commitarTarefa;
    delete (base as Partial<DependenciasMotor>).anexarNotas;
  }
  return { dep: base, despachos, logs, commitsDeTarefa, notasAnexadas };
}

/** Despachos de construtor, na ordem — é onde o diagnóstico aparece. */
function construtores(despachos: PedidoDespacho[]): PedidoDespacho[] {
  return despachos.filter((d) => d.papel === "construtor");
}

describe("recuperação de trabalho não registrado (o caso T-025)", () => {
  it("construtor mudo COM trabalho na árvore: commita, promove e a rodada segue", async () => {
    const { dep, logs, commitsDeTarefa, notasAnexadas } = mundo(
      [tarefa({ id: "T-100", status: "pronta" })],
      { construtorMudo: true, trabalhoParcial: true },
    );
    const rel = await rodarPipeline(ctxBase, dep);

    // NÃO parou por sem-progresso: o trabalho existia e foi aproveitado.
    expect(rel.encerrouPor).not.toBe("sem-progresso");
    expect(commitsDeTarefa).toHaveLength(1);
    expect(commitsDeTarefa[0]?.mensagem).toContain("T-100");
    // O hash tem de ir para as Notas: é o que dá um DIFF ao revisor.
    expect(notasAnexadas[0]?.texto).toContain("**Commit:**");
    expect(logs.some((l) => l.includes("HÁ trabalho nas areas"))).toBe(true);
  });

  /**
   * A propriedade que impede laço infinito: o commit limpa a árvore, então a segunda
   * ocorrência não acha trabalho parcial e cai no encerramento de sempre.
   */
  it("é auto-limitada: sem trabalho a recuperar, encerra por sem-progresso", async () => {
    const { dep, commitsDeTarefa } = mundo([tarefa({ id: "T-101", status: "pronta" })], {
      construtorMudo: true,
      trabalhoParcial: false,
    });
    const rel = await rodarPipeline(ctxBase, dep);

    expect(rel.encerrouPor).toBe("sem-progresso");
    expect(commitsDeTarefa).toHaveLength(0);
  });

  /** Driver que não implementa as deps opcionais continua funcionando como antes. */
  it("sem as dependências de recuperação, degrada para o comportamento antigo", async () => {
    const { dep } = mundo([tarefa({ id: "T-102", status: "pronta" })], {
      construtorMudo: true,
      trabalhoParcial: true,
      semRecuperacao: true,
    });
    expect((await rodarPipeline(ctxBase, dep)).encerrouPor).toBe("sem-progresso");
  });
});

describe("retrabalho diagnosticado — calibre proporcional à falha", () => {
  /**
   * A economia principal. Critério objetivo falhou: o comando já disse o que quebrou, então
   * subir para `opus` não acrescenta nada.
   */
  it("falha MECÂNICA não escala o modelo, roda estreita e manda foco", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-200", status: "em-teste", tentativas: 1 })], {
      // Comando real que falha — é assim que a passada mecânica reprova em produção.
      criterios: '- [ ] sempre falha\n      `verificar: node -e "process.exit(1)"`',
    });
    await rodarPipeline(ctxBase, dep);

    const c = construtores(despachos)[0];
    expect(c, "deveria ter despachado o construtor após a falha mecânica").toBeDefined();
    expect(c?.modelo, "não deve subir para opus numa falha objetiva").toBeNull();
    expect(c?.agente).not.toContain("-reforcado");
    expect(c?.maxTurns).toBe(VOLTAS_PONTUAL);
    // Mesmo sem achado nomeado, o construtor tem de ser instruído a NÃO reabrir a tarefa.
    expect(c?.foco).toContain("não recomece do zero");
  });

  /** O caso caro: entregou outra coisa. Aqui economizar é o erro. */
  it("reprovado por CONFORMIDADE mantém calibre máximo e escopo completo", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-201", status: "em-revisao" })], {
      reprovarEm: "revisor",
      conformidade: "Conformidade: nao-cumpre",
      revisao: "",
    });
    await rodarPipeline(ctxBase, dep);

    const c = construtores(despachos)[0];
    expect(c?.modelo).toBe("opus");
    expect(c?.agente).toContain("-reforcado");
    expect(c?.maxTurns).toBeUndefined(); // padrão do papel, sem teto reduzido
    expect(c?.foco ?? "").toBe("");
  });

  it("defeitos `menor` do revisor: ajuste pontual, sem escalar modelo, com foco nomeado", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-202", status: "em-revisao" })], {
      reprovarEm: "revisor",
      conformidade: "Conformidade: cumpre",
      revisao: "[menor] a.js:3 — mensagem obsoleta",
    });
    await rodarPipeline(ctxBase, dep);

    const c = construtores(despachos)[0];
    expect(c?.modelo).toBeNull();
    expect(c?.maxTurns).toBe(VOLTAS_PONTUAL);
    expect(c?.foco).toContain("a.js:3");
    expect(c?.foco).toContain("não recomece do zero");
  });

  it("defeito GRAVE reforça o modelo, mas ainda ataca só o que foi apontado", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-203", status: "em-revisao" })], {
      reprovarEm: "revisor",
      conformidade: "Conformidade: cumpre",
      revisao: "[critica] a.js:9 — quebra em uso normal",
    });
    await rodarPipeline(ctxBase, dep);

    const c = construtores(despachos)[0];
    expect(c?.modelo).toBe("opus");
    expect(c?.foco).toContain("a.js:9");
  });

  /**
   * NA DÚVIDA, O CARO: tarefa que já chega `em-execucao` de uma sessão anterior não tem
   * portão observado, e não pode ser barateada por omissão.
   */
  it("tarefa herdada de outra rodada cai no comportamento caro de sempre", async () => {
    const { dep, despachos } = mundo(
      [tarefa({ id: "T-204", status: "em-execucao", tentativas: 1 })],
      { trabalhoParcial: true },
    );
    await rodarPipeline(ctxBase, dep);

    const c = construtores(despachos)[0];
    expect(c?.modelo).toBe("opus");
    expect(c?.maxTurns).toBeUndefined();
    expect(c?.foco ?? "").toBe("");
  });
});
