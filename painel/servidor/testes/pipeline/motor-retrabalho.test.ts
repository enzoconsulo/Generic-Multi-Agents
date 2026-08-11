import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/**
 * Diretório REAL, e isso importa mais do que parece.
 *
 * Aqui havia `dirProjeto: "/nao-usado"` — um caminho que não existe. O teste da falha
 * mecânica declarava rodar "um comando real que falha", e o comando NUNCA chegou a rodar: o
 * spawn morria na hora com `ENOENT` porque o `cwd` não existia, e a passada mecânica contava
 * isso como "o critério reprovou". O teste ficava verde pelo motivo errado, exercitando o
 * caminho de spawn quebrado em vez do caminho de reprovação.
 *
 * Foi a T-054 que revelou isso, ao passar a distinguir as duas coisas: `cwd` inexistente é
 * `ferramenta` (inconclusivo, não reprova), e o teste caiu na hora. É o próprio defeito que
 * a T-054 corrige, escondido dentro do teste que deveria prová-la.
 */
const dirReal = mkdtempSync(join(tmpdir(), "motor-retrabalho-"));

const ctxBase: ContextoMotor = {
  dirProjeto: dirReal,
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
    /** Quantas vezes esse papel reprova antes de deixar passar (padrão 1). */
    reprovarVezes?: number;
    /** Custo de cada despacho. Configurável para exercitar os tetos de orçamento. */
    custoPorDespacho?: number;
    /** Notas de execução que o motor lê — é onde vive a linha `Impedimento:` (T-058). */
    notas?: string;
    conformidade?: string;
    revisao?: string;
    criterios?: string;
    /** Construtor termina sem gravar status (o bug da T-025). */
    construtorMudo?: boolean;
    trabalhoParcial?: boolean;
    /** O construtor mudo COMMITA (HEAD anda) — o caso comum, medido na rodada 3732d414. */
    construtorCommita?: boolean;
    /** Driver sem as deps opcionais de recuperação. */
    semRecuperacao?: boolean;
  } = {},
) {
  const tarefas = new Map(iniciais.map((t) => [t.id, { ...t }]));
  const despachos: PedidoDespacho[] = [];
  const logs: string[] = [];
  const commitsDeTarefa: { id: string; mensagem: string }[] = [];
  const notasAnexadas: { id: string; texto: string }[] = [];
  let reprovacoes = 0;
  let arvoreSuja = opcoes.trabalhoParcial ?? false;
  let head = "head0000";
  let nHead = 0;

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
    lerNotasDe: async () => opcoes.notas ?? "",
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
    hashHead: async () => head,
    despachar: async (pedido) => {
      const custoDespacho = opcoes.custoPorDespacho ?? 0.1;
      despachos.push(pedido);
      const atual = tarefas.get(pedido.tarefa.id);
      if (atual === undefined) return { custoUsd: custoDespacho, concluiu: true };

      if (pedido.papel === "construtor" && opcoes.construtorMudo === true) {
        // O agente commita (HEAD anda) mas NÃO grava o status — o caso comum.
        if (opcoes.construtorCommita === true) head = `head${++nHead}`;
        return { custoUsd: custoDespacho, concluiu: true };
      }
      if (pedido.papel === opcoes.reprovarEm && reprovacoes < (opcoes.reprovarVezes ?? 1)) {
        reprovacoes += 1;
        atual.status = "em-execucao";
        return { custoUsd: custoDespacho, concluiu: true };
      }
      // O CONSTRUTOR é quem incrementa `tentativas`, ao assumir — contrato do protocolo. O
      // fixture antes creditava o incremento ao reprovador, que é o que a T-063 passou a
      // tratar como violação: mais um caso de fixture que não fazia o que anunciava.
      if (pedido.papel === "construtor") atual.tentativas += 1;
      atual.status = proximoStatus[atual.status] ?? "concluida";
      return { custoUsd: custoDespacho, concluiu: true };
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
  /**
   * REGRESSÃO da rodada de validação `3732d414` (08/08), que reprovou a PRIMEIRA versão
   * desta recuperação. O `executor-reforcado` da T-026 commitou o trabalho E o hash da
   * revisão, e só não mexeu no `status:`. Como ele commitou, a árvore ficou LIMPA — e o
   * critério original ("há trabalho não commitado?") recusou exatamente o caso em que o
   * agente tinha feito tudo certo menos uma linha de frontmatter.
   *
   * Commitar está bem treinado no prompt dos construtores; mexer no frontmatter, nem tanto.
   * Este é o caso COMUM, e o da T-025 é o raro.
   */
  it("construtor que COMMITA mas não grava status: HEAD andou, logo houve trabalho", async () => {
    const { dep, logs, commitsDeTarefa, despachos } = mundo(
      [tarefa({ id: "T-110", status: "pronta" })],
      {
        construtorMudo: true,
        construtorCommita: true,
        trabalhoParcial: false, // árvore limpa JUSTAMENTE porque ele commitou
      },
    );
    const rel = await rodarPipeline(ctxBase, dep);

    expect(rel.encerrouPor).not.toBe("sem-progresso");
    // Nada a commitar: o agente já fez isso. O motor só corrige o status.
    expect(commitsDeTarefa).toHaveLength(0);
    expect(logs.some((l) => l.includes("commitou") && l.includes("não gravou o status"))).toBe(
      true,
    );
    /**
     * T-062 — A ECONOMIA, e é o que o teste passou a travar. Antes a recuperação só era
     * consultada na 2ª repetição, então este mesmo cenário custava DOIS despachos de
     * construtor: o segundo agente ia olhar um trabalho já commitado e não tinha o que fazer.
     * Medido no job `fc211543` (T-032): ~US$ 1,5 de `opus` para confirmar um commit que já
     * estava no repositório.
     */
    expect(construtores(despachos), "commit é declaração de entrega: um despacho basta").toHaveLength(
      1,
    );
  });

  /**
   * A contrapartida da T-062: árvore suja é sinal AMBÍGUO (entrega pronta sem registro, ou
   * agente cortado no meio de uma edição), então ela NÃO encurta o caminho — o construtor
   * ganha a segunda chance, que pode ser o que termina o trabalho.
   */
  it("árvore suja sem commit continua esperando a 2ª repetição", async () => {
    const { dep, despachos, commitsDeTarefa } = mundo([tarefa({ id: "T-111", status: "pronta" })], {
      construtorMudo: true,
      construtorCommita: false, // não commitou: HEAD parado
      trabalhoParcial: true, // mas deixou mudança nas areas
    });
    const rel = await rodarPipeline(ctxBase, dep);

    expect(construtores(despachos), "a segunda chance vale o despacho aqui").toHaveLength(2);
    expect(commitsDeTarefa).toHaveLength(1); // o motor fecha o ciclo em nome da tarefa
    expect(rel.encerrouPor).not.toBe("sem-progresso");
  });

  it("HEAD parado e árvore limpa: não houve trabalho, encerra como antes", async () => {
    const { dep } = mundo([tarefa({ id: "T-111", status: "pronta" })], {
      construtorMudo: true,
      construtorCommita: false,
      trabalhoParcial: false,
    });
    expect((await rodarPipeline(ctxBase, dep)).encerrouPor).toBe("sem-progresso");
  });

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

  /**
   * O caso caro: entregou outra coisa. Aqui economizar é o erro.
   *
   * `tentativas: 1` no estado inicial não é detalhe: tarefa em `em-revisao` JÁ foi construída
   * uma vez, e é esse incremento (feito pelo construtor ao assumir) que torna o próximo
   * despacho um retrabalho. O fixture antes começava em 0 e compensava fazendo o REPROVADOR
   * incrementar — o que a T-063 passou a tratar como violação de contrato, corretamente.
   */
  it("reprovado por CONFORMIDADE mantém calibre máximo e escopo completo", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-201", status: "em-revisao", tentativas: 1 })], {
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
    const { dep, despachos } = mundo([tarefa({ id: "T-202", status: "em-revisao", tentativas: 1 })], {
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
    const { dep, despachos } = mundo([tarefa({ id: "T-203", status: "em-revisao", tentativas: 1 })], {
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

describe("replanejamento precoce (T-058)", () => {
  /** Despachos de planejador — é onde o replanejamento aparece. */
  function planejadores(despachos: PedidoDespacho[]): PedidoDespacho[] {
    return despachos.filter((d) => d.papel === "planejador");
  }

  describe("gatilho A — impedimento declarado pelo construtor", () => {
    /**
     * A lacuna que isto fecha, medida na T-030: o executor diagnosticou a causa certa no ciclo
     * 2 e escreveu nas Notas. O motor não lia prosa, então a tarefa girou três ciclos e ~US$ 9
     * a mais para chegar à mesma conclusão.
     */
    it("roteia ao planejador em vez de gastar outro construtor", async () => {
      const { dep, despachos, logs } = mundo([tarefa({ id: "T-200", status: "pronta" })], {
        construtorMudo: true, // para e NÃO move o status, como o contrato manda
        notas: "Impedimento: o critério 2 exige um endpoint que o projeto não tem",
      });

      const rel = await rodarPipeline(ctxBase, dep);

      expect(planejadores(despachos)).toHaveLength(1);
      expect(rel.paraReplanejar).toContain("T-200");
      expect(rel.impedimentos).toHaveLength(1);
      expect(rel.impedimentos[0]?.motivo).toContain("endpoint");
      // Um construtor só: o segundo é justamente o que se economiza.
      expect(construtores(despachos)).toHaveLength(1);
      expect(logs.some((l) => l.includes("declarou IMPEDIMENTO"))).toBe(true);
    });

    /**
     * A ORDEM é o ponto mais fácil de errar: o construtor que faz a coisa certa (para, escreve
     * o motivo, não move o status) é indistinguível, para a guarda de progresso, de um agente
     * travado. Se a guarda rodasse primeiro, o comportamento honesto encerraria a rodada por
     * `sem-progresso` — puniríamos exatamente o que queremos.
     */
    it("é lido ANTES da guarda de progresso", async () => {
      const { dep } = mundo([tarefa({ id: "T-200", status: "pronta" })], {
        construtorMudo: true,
        notas: "Impedimento: dois critérios se contradizem",
      });

      const rel = await rodarPipeline(ctxBase, dep);

      expect(rel.encerrouPor).not.toBe("sem-progresso");
      expect(rel.impedimentos).toHaveLength(1);
    });

    /** Sem a linha, nada muda: a guarda de progresso segue sendo o caminho. */
    it("construtor mudo SEM a linha continua caindo na guarda de progresso", async () => {
      const { dep, despachos } = mundo([tarefa({ id: "T-200", status: "pronta" })], {
        construtorMudo: true,
        notas: "Trabalhei bastante mas não consegui terminar.",
      });

      const rel = await rodarPipeline(ctxBase, dep);

      expect(rel.impedimentos).toHaveLength(0);
      expect(planejadores(despachos)).toHaveLength(0);
    });

    /**
     * Uma vez por LINHAGEM, mesma trava da autocorreção que já existia: sem isso uma tarefa mal
     * dimensionada geraria replanejamento em cascata, cada um custando um despacho.
     */
    it("tarefa que já era replanejamento vira BLOQUEADA, não outro replanejamento", async () => {
      const { dep, despachos } = mundo(
        [tarefa({ id: "T-201", status: "pronta", replanejadaDe: "T-200" })],
        {
          construtorMudo: true,
          notas: "Impedimento: o escopo continua impossível",
        },
      );

      const rel = await rodarPipeline(ctxBase, dep);

      expect(planejadores(despachos)).toHaveLength(0);
      expect(rel.bloqueadas).toContain("T-201");
      // O motivo não se perde ao bloquear — é o que o usuário precisa ler.
      expect(rel.impedimentos[0]?.motivo).toContain("escopo");
    });
  });

  describe("gatilho B — conformidade reprovada duas vezes seguidas", () => {
    /**
     * "Entregou outra coisa" já roda SEMPRE no calibre máximo com escopo completo
     * (`politicaDe` → `completoCaro`). Uma segunda reprovação idêntica não diz que o agente é
     * fraco — ele já estava no melhor calibre, com o pedido inteiro. Diz que o TEXTO é ambíguo.
     *
     * O gatilho substitui o ÚLTIMO construtor, que ia ser gasto de qualquer jeito e que, ao
     * falhar, dispararia replanejamento no ciclo seguinte: o destino é o mesmo, o que se
     * economiza é um despacho de `opus` que o histórico da tarefa diz que vai falhar.
     */
    it("pula o último construtor e vai ao planejador", async () => {
      const { dep, despachos, logs } = mundo(
        [tarefa({ id: "T-210", status: "em-revisao", tentativas: 1 })],
        {
          reprovarEm: "revisor",
          reprovarVezes: 2,
          conformidade: "Conformidade: nao-cumpre",
          revisao: "",
        },
      );

      const rel = await rodarPipeline(ctxBase, dep);

      expect(planejadores(despachos)).toHaveLength(1);
      expect(rel.paraReplanejar).toContain("T-210");
      // Um construtor entre as duas reprovações; o segundo é o economizado.
      expect(construtores(despachos)).toHaveLength(1);
      expect(logs.some((l) => l.includes("CONFORMIDADE duas vezes"))).toBe(true);
    });

    /**
     * A trava contra replanejar cedo demais: reprovação por DEFEITO não é evidência sobre o
     * texto da tarefa — o agente entendeu o pedido e errou o código, que é o que o retrabalho
     * normal resolve.
     */
    it("duas reprovações por defeito NÃO disparam replanejamento", async () => {
      const { dep, despachos } = mundo(
        [tarefa({ id: "T-211", status: "em-revisao", tentativas: 1 })],
        {
          reprovarEm: "revisor",
          reprovarVezes: 2,
          conformidade: "Conformidade: cumpre",
          revisao: "[importante] src/a.js:10 — troca invertida",
        },
      );

      const rel = await rodarPipeline(ctxBase, dep);

      expect(planejadores(despachos)).toHaveLength(0);
      expect(rel.paraReplanejar).not.toContain("T-211");
      expect(construtores(despachos).length).toBeGreaterThanOrEqual(2);
    });

    /** UMA reprovação de conformidade é retrabalho normal, no calibre máximo. */
    it("uma reprovação de conformidade não basta", async () => {
      const { dep, despachos } = mundo(
        [tarefa({ id: "T-212", status: "em-revisao", tentativas: 1 })],
        {
          reprovarEm: "revisor",
          reprovarVezes: 1,
          conformidade: "Conformidade: nao-cumpre",
          revisao: "",
        },
      );

      const rel = await rodarPipeline(ctxBase, dep);

      expect(planejadores(despachos)).toHaveLength(0);
      expect(construtores(despachos)).toHaveLength(1);
    });
  });
});

describe("`tentativas` é campo do construtor (T-063)", () => {
  /**
   * Medido no job `7cd4a453`: o testador aprovou a T-032 e, na mesma gravação, escreveu
   * `tentativas: 2 → 4` — confundindo "este é o ciclo 4" com o contador que a máquina usa como
   * portão. O motor leu `4 > 3`, concluiu "esgotou os ciclos" e despachou o planejador, que se
   * recusou a replanejar porque não havia nada errado com a abordagem.
   */
  function mundoComVerificadorQueInflaTentativas() {
    const { dep, despachos, logs } = mundo([
      tarefa({ id: "T-300", status: "em-teste", tentativas: 2 }),
    ]);
    const original = dep.despachar;
    dep.despachar = async (pedido) => {
      const r = await original(pedido);
      // O verificador aprova E estraga o campo, exatamente como aconteceu na T-032. Precisa
      // mutar a cópia INTERNA do fixture (`mundo` clona as tarefas iniciais), senão o teste
      // mexe num objeto que o motor nunca lê — e passaria sem exercitar nada.
      if (pedido.papel === "verificador") {
        const atual = (await dep.lerTarefas()).find((x) => x.id === "T-300");
        if (atual !== undefined) (atual as { tentativas: number }).tentativas = 4;
      }
      return r;
    };
    return { dep, despachos, logs };
  }

  it("verificador que infla o campo não faz a tarefa 'esgotar os ciclos'", async () => {
    const { dep, despachos, logs } = mundoComVerificadorQueInflaTentativas();

    const rel = await rodarPipeline(ctxBase, dep);

    // Sem a guarda: `4 > 3` → replanejamento. Com ela, a rodada segue o fluxo normal.
    expect(despachos.filter((d) => d.papel === "planejador")).toHaveLength(0);
    expect(rel.paraReplanejar).not.toContain("T-300");
    expect(rel.tarefasConcluidas).toContain("T-300");
    expect(logs.some((l) => l.includes("campo do construtor"))).toBe(true);
  });

  it("denuncia a violação no relatório, com quem escreveu e o que foi mantido", async () => {
    const { dep } = mundoComVerificadorQueInflaTentativas();

    const rel = await rodarPipeline(ctxBase, dep);

    expect(rel.tentativasIgnoradas).toHaveLength(1);
    expect(rel.tentativasIgnoradas[0]).toMatchObject({
      tarefa: "T-300",
      papel: "verificador",
      escrito: 4,
      mantido: 2,
    });
  });

  /** O construtor PODE escrever: é o contrato dele, e sem isso o limite de ciclos não existe. */
  it("incremento do construtor continua valendo", async () => {
    const { dep, despachos } = mundo([tarefa({ id: "T-301", status: "pronta" })], {
      reprovarEm: "revisor",
      conformidade: "Conformidade: nao-cumpre",
    });

    await rodarPipeline(ctxBase, dep);

    // 1º construtor em `tentativas: 0` (primeira execução), 2º já em retrabalho reforçado —
    // e isso só acontece porque o incremento do construtor foi respeitado.
    const cs = construtores(despachos);
    expect(cs.length).toBeGreaterThanOrEqual(2);
    expect(cs[0]?.modelo).toBeNull();
    expect(cs[1]?.modelo).toBe("opus");
  });
});

describe("limite da assinatura para a rodada NA HORA (T-064)", () => {
  /**
   * Medido no job `c080b98c`: o executor da T-033 trabalhou 52 chamadas de ferramenta,
   * custou US$ 4,11 e foi cortado pela cota sem devolver nada. Antes, o motor só reconhecia
   * "falha sistêmica" depois de TRÊS falhas seguidas — e como cada falha dessas custa, ele
   * pagava até três despachos para descobrir o que a primeira mensagem já dizia.
   */
  function mundoComCota(tarefas: TarefaResumo[], quandoFalhar: (n: number) => boolean) {
    const { dep, despachos, logs } = mundo(tarefas);
    const original = dep.despachar;
    let n = 0;
    dep.despachar = async (pedido) => {
      n += 1;
      if (quandoFalhar(n)) {
        despachos.push(pedido);
        return { custoUsd: 1.5, concluiu: false, limiteDeUso: "6:50pm" };
      }
      return original(pedido);
    };
    return { dep, despachos, logs };
  }

  it("para no PRIMEIRO sinal de cota, sem gastar mais despacho", async () => {
    const { dep, despachos, logs } = mundoComCota(
      [
        tarefa({ id: "T-400", status: "pronta", areas: ["a.js"] }),
        tarefa({ id: "T-401", status: "pronta", areas: ["b.js"] }),
        tarefa({ id: "T-402", status: "pronta", areas: ["c.js"] }),
      ],
      (n) => n === 1,
    );

    const rel = await rodarPipeline(ctxBase, dep);

    expect(rel.encerrouPor).toBe("cota");
    expect(despachos, "um despacho só: o que bateu na parede").toHaveLength(1);
    expect(logs.some((l) => l.includes("Limite da assinatura batido"))).toBe(true);
    expect(logs.some((l) => l.includes("6:50pm"))).toBe(true);
  });

  /** Falha comum (sem cota) continua no comportamento antigo: a rodada segue nas outras. */
  it("falha sem cota NÃO encerra a rodada", async () => {
    const { dep } = mundoComCota(
      [
        tarefa({ id: "T-410", status: "pronta", areas: ["a.js"] }),
        tarefa({ id: "T-411", status: "pronta", areas: ["b.js"] }),
      ],
      () => false,
    );
    const original = dep.despachar;
    let n = 0;
    dep.despachar = async (pedido) => {
      n += 1;
      if (n === 1) return { custoUsd: 0.5, concluiu: false }; // sem `limiteDeUso`
      return original(pedido);
    };

    const rel = await rodarPipeline(ctxBase, dep);

    expect(rel.encerrouPor).not.toBe("cota");
    expect(rel.tarefasConcluidas.length).toBeGreaterThan(0);
  });
});

describe("orçamento de ferramentas declarado vira MEDIDA (T-065)", () => {
  it("registra a etapa que passou do teto do papel", async () => {
    const { dep } = mundo([tarefa({ id: "T-500", status: "pronta", areas: ["a.js", "b.js"] })]);
    const original = dep.despachar;
    dep.despachar = async (pedido) => {
      const r = await original(pedido);
      // Construtor com 2 areas: teto declarado 30. 39 foi o número real da T-032.
      return pedido.papel === "construtor"
        ? { ...r, chamadas: 39, orcadoFerramentas: 30 }
        : { ...r, chamadas: 5, orcadoFerramentas: 20 };
    };

    const rel = await rodarPipeline(ctxBase, dep);

    expect(rel.estouros).toHaveLength(1);
    expect(rel.estouros[0]).toMatchObject({ tarefa: "T-500", chamadas: 39, orcado: 30 });
  });

  it("etapa dentro do teto não vira ruído no relatório", async () => {
    const { dep } = mundo([tarefa({ id: "T-501", status: "pronta" })]);
    const original = dep.despachar;
    dep.despachar = async (pedido) => ({
      ...(await original(pedido)),
      chamadas: 10,
      orcadoFerramentas: 30,
    });

    const rel = await rodarPipeline(ctxBase, dep);

    expect(rel.estouros).toEqual([]);
  });
});

/**
 * TETO POR TAREFA (10/08). O teto de JOB protege a fatura; este protege a RODADA.
 *
 * Caso real que o motivou, job `341ba362`: teto de US$ 8, gasto de US$ 7,06 — todo ele na
 * T-034, que não concluiu. O teto de job funcionou (parada limpa) e mesmo assim a rodada
 * fechou com ZERO tarefa bancada. Ele não tinha como pegar: compara o restante contra a
 * média de tarefas CONCLUÍDAS, e numa rodada sem conclusão nenhuma essa média não se forma.
 */
describe("teto por tarefa — uma tarefa que gira não pode zerar a rodada", () => {
  it("estaciona quem gira na fronteira de ciclo, e as outras seguem até concluir", async () => {
    const { dep, logs } = mundo(
      [
        tarefa({ id: "T-301", status: "em-execucao", tentativas: 1, prioridade: "alta" }),
        tarefa({ id: "T-302", status: "pronta", prioridade: "media" }),
      ],
      { reprovarEm: "verificador", reprovarVezes: 2, custoPorDespacho: 1.5 },
    );
    // Teto 12 → cota individual de US$ 6. A T-301 chega lá em 4 despachos.
    const rel = await rodarPipeline({ ...ctxBase, orcamento: novoOrcamento(12) }, dep);

    expect(rel.impedimentos.map((i) => i.tarefa)).toContain("T-301");
    expect(logs.some((l) => l.includes("T-301 estacionada"))).toBe(true);
    // O que a trava existe para garantir: a rodada NÃO fecha zerada.
    expect(rel.tarefasConcluidas).toContain("T-302");
    // Estacionar não é bloquear nem cancelar — o trabalho da T-301 continua onde estava.
    expect(rel.bloqueadas).not.toContain("T-301");
  });

  /**
   * A trava vale só quando o próximo passo seria COMEÇAR outro retrabalho. Aplicá-la em
   * qualquer passo estacionaria tarefa no verificador ou no revisor — jogando fora um ciclo
   * já pago a um passo de fechar, o oposto do objetivo.
   */
  it("nunca estaciona no meio de um ciclo, nem em primeira execução", async () => {
    const { dep } = mundo([tarefa({ id: "T-303", status: "pronta", tentativas: 0 })], {
      custoPorDespacho: 3,
    });
    // Teto 12 → cota individual de US$ 6, que os 3 despachos (US$ 9) ultrapassam. Mesmo
    // assim a tarefa fecha: ela nunca inicia um retrabalho.
    const rel = await rodarPipeline({ ...ctxBase, orcamento: novoOrcamento(12) }, dep);

    expect(rel.impedimentos).toEqual([]);
    expect(rel.tarefasConcluidas).toContain("T-303");
  });
});
