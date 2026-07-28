import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACOES_PROJETO,
  ErroAcaoProjetoDesconhecida,
  acaoProjetoPorId,
  lerPromptProjeto,
  montarDespacho,
  montarJobAcaoProjeto,
} from "../../src/acoes/acoes-projeto.js";
import { ErroProjetoInexistente } from "../../src/acoes/analise.js";
import { guardrailsParaAcao } from "../../src/jobs/robustez/guardrails.js";
import type { NovoJob } from "../../src/jobs/fila.js";

/** Fábrica falsa em pasta temporária com um projeto `fix`. */
function fabricaTemp(): string {
  const raiz = mkdtempSync(join(tmpdir(), "acoes-projeto-"));
  mkdirSync(join(raiz, "projetos", "fix"), { recursive: true });
  return raiz;
}

function params(job: NovoJob): NonNullable<NovoJob["params"]> {
  if (!job.params) throw new Error("job sem params");
  return job.params;
}

describe("catálogo de ações por projeto (T-033)", () => {
  it("expõe as ações de especialista (T-033) e as de escopo de projeto (T-034)", () => {
    const ids = ACOES_PROJETO.map((a) => a.id);
    expect(ids).toEqual([
      "documentar",
      "pesquisar",
      "revisar",
      "replanejar",
      "testar",
      "conferir",
      "marco",
      "progresso",
      "recriar-equipe",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("toda ação do catálogo tem um prompt versionado que existe", async () => {
    // Entrada no catálogo sem arquivo de prompt só quebraria no clique do usuário.
    for (const acao of ACOES_PROJETO) {
      const prompt = await lerPromptProjeto(acao.id);
      expect(prompt.length, `prompt vazio: ${acao.id}`).toBeGreaterThan(200);
      expect(prompt, `prompt sem o projeto: ${acao.id}`).toContain("$PROJETO");
      expect(prompt, `prompt sem confinamento: ${acao.id}`).toContain("$DIR_PROJETO");
      // O agente despachado precisa estar nomeado no texto, senão o fluxo faz sozinho.
      // Comparação sem caixa: os prompts gritam "ORQUESTRADOR" por ênfase.
      expect(prompt.toLowerCase(), `prompt não cita o agente: ${acao.id}`).toContain(
        acao.agente.toLowerCase(),
      );
    }
  });

  it("só as ações com campo de entrada usam o marcador $ENTRADA", async () => {
    for (const acao of ACOES_PROJETO) {
      const prompt = await lerPromptProjeto(acao.id);
      expect(prompt.includes("$ENTRADA"), `divergência em ${acao.id}`).toBe(acao.entrada !== null);
    }
  });

  it("acaoProjetoPorId devolve null para id fora do catálogo", () => {
    expect(acaoProjetoPorId("documentar")?.agente).toBe("documentador");
    expect(acaoProjetoPorId("apagar-tudo")).toBeNull();
  });

  it("nenhuma ação de `especialista` é do orquestrador, e nenhuma fica órfã de grupo", () => {
    // A UI monta as seções a partir deste campo. A invariante que importa é UMA direção:
    // ação de `orquestrador` sob o título "Chamar um especialista" faria o título mentir.
    // A inversa NÃO vale — `marco` (T-038) é zeladoria de fase executada pelo `testador`,
    // e "Cuidar deste projeto" não promete que quem executa é o orquestrador. A guarda
    // contra membro entrando no grupo errado sem querer é a lista explícita de ids.
    const especialistas = ACOES_PROJETO.filter((a) => a.grupo === "especialista");
    const cuidado = ACOES_PROJETO.filter((a) => a.grupo === "cuidado");
    const equipe = ACOES_PROJETO.filter((a) => a.grupo === "equipe");

    expect(especialistas.map((a) => a.id)).toEqual([
      "documentar",
      "pesquisar",
      "revisar",
      "replanejar",
      "testar",
    ]);
    expect(cuidado.map((a) => a.id)).toEqual(["conferir", "marco", "progresso"]);
    expect(equipe.map((a) => a.id)).toEqual(["recriar-equipe"]);

    for (const a of especialistas) {
      expect(a.agente, `${a.id} deveria despachar um especialista`).not.toBe("orquestrador");
    }
    // Toda ação pertence a um dos grupos — nenhuma fica órfã e some da tela.
    expect(especialistas.length + cuidado.length + equipe.length).toBe(ACOES_PROJETO.length);
  });

  it("só `pesquisar` exige a entrada; o recorte do `replanejar` é opcional", () => {
    // A obrigatoriedade mora no catálogo, não numa comparação por id na rota e na UI.
    expect(acaoProjetoPorId("pesquisar")?.entrada?.obrigatoria).toBe(true);
    expect(acaoProjetoPorId("replanejar")?.entrada?.obrigatoria).toBe(false);
    for (const acao of ACOES_PROJETO) {
      if (acao.entrada === null) continue;
      expect(typeof acao.entrada.obrigatoria, `sem obrigatoria: ${acao.id}`).toBe("boolean");
    }
  });

  it("as ações de escopo de projeto (T-034) não escrevem fora do projeto", async () => {
    // `progresso` é a que mais tenta escapar: o instinto é escrever no log da fábrica,
    // que é do /encerrar-dia global. O prompt precisa proibir isso explicitamente.
    const progresso = await lerPromptProjeto("progresso");
    expect(progresso).toContain("_sistema/logs/");
    expect(progresso.toLowerCase()).toContain("não escreva");

    const conferir = await lerPromptProjeto("conferir");
    expect(conferir).toContain("$DIR_PROJETO");
    expect(conferir.toLowerCase()).toContain("apenas reporte");
  });

  it("o prompt do marco carrega as duas regras que dão sentido a ele", async () => {
    // Aprendidas rodando o marco da Fase 1 de verdade: sem elas, o fluxo vira ou uma
    // repetição cara da verificação de tarefa, ou opinião sobre o que seria bom ter.
    const marco = await lerPromptProjeto("marco");
    expect(marco.toLowerCase()).toContain("não é re-rodar os critérios");
    expect(marco.toLowerCase()).toContain("não mova a trave");
    // A linha Marco: é o que diz às próximas sessões que já rodou — o fluxo tem que gravá-la.
    expect(marco).toContain("Marco:");
    expect(marco).toContain("PLANO.md");
  });
});

describe("montarJobAcaoProjeto", () => {
  it("usa a RAIZ DA FÁBRICA como cwd — é onde vivem os .claude/agents/", async () => {
    // Esta é a decisão central da T-033 e o oposto da análise (que roda dentro do
    // projeto): de dentro do projeto não dá para despachar os agentes da fábrica.
    const raiz = fabricaTemp();
    const job = await montarJobAcaoProjeto("documentar", "fix", raiz, { modelo: "haiku" });
    expect(params(job).cwd).toBe(raiz);
    expect(params(job).cwd).not.toBe(join(raiz, "projetos", "fix"));
  });

  it("trava só o projeto e nomeia o job", async () => {
    const raiz = fabricaTemp();
    const job = await montarJobAcaoProjeto("revisar", "fix", raiz, { modelo: "haiku" });
    expect(job.tipo).toBe("claude");
    expect(job.usaClaude).toBe(true);
    expect(job.escopo).toBe("projeto:fix");
    expect(job.titulo).toContain("fix");
  });

  it("injeta o caminho absoluto do projeto no prompt (confinamento explícito)", async () => {
    // Com cwd na raiz, o confinamento não vem de graça: tem que estar escrito.
    const raiz = fabricaTemp();
    const job = await montarJobAcaoProjeto("testar", "fix", raiz, { modelo: "haiku" });
    const prompt = params(job).prompt as string;
    expect(prompt).toContain(join(raiz, "projetos", "fix"));
    expect(prompt).toContain("fora do caminho do projeto");
  });

  it("não deixa marcador não substituído no prompt final", async () => {
    const raiz = fabricaTemp();
    for (const acao of ACOES_PROJETO) {
      const job = await montarJobAcaoProjeto(acao.id, "fix", raiz, {
        modelo: "haiku",
        entrada: "pergunta qualquer",
      });
      const prompt = params(job).prompt as string;
      expect(prompt, `marcador cru em ${acao.id}`).not.toContain("$PROJETO");
      expect(prompt, `marcador cru em ${acao.id}`).not.toContain("$DIR_PROJETO");
      expect(prompt, `marcador cru em ${acao.id}`).not.toContain("$ENTRADA");
    }
  });

  it("aplica o guardrail da ação quando maxTurns não vem no pedido", async () => {
    const raiz = fabricaTemp();
    const job = await montarJobAcaoProjeto("pesquisar", "fix", raiz, {
      modelo: "haiku",
      entrada: "qual lib de gráficos",
    });
    expect(params(job).maxTurns).toBe(guardrailsParaAcao("projeto:pesquisar").maxTurns);
  });

  it("maxTurns explícito vence o guardrail", async () => {
    const raiz = fabricaTemp();
    const job = await montarJobAcaoProjeto("documentar", "fix", raiz, {
      modelo: "haiku",
      maxTurns: 7,
    });
    expect(params(job).maxTurns).toBe(7);
  });

  it("projeto inexistente e travessia de caminho são recusados", async () => {
    const raiz = fabricaTemp();
    await expect(montarJobAcaoProjeto("documentar", "nao-existe", raiz, { modelo: "haiku" })).rejects.toThrow(
      ErroProjetoInexistente,
    );
    // `..` escapando de projetos/ é a tentativa que importa barrar.
    await expect(
      montarJobAcaoProjeto("documentar", "../../etc", raiz, { modelo: "haiku" }),
    ).rejects.toThrow(ErroProjetoInexistente);
    await expect(montarJobAcaoProjeto("documentar", ".", raiz, { modelo: "haiku" })).rejects.toThrow(
      ErroProjetoInexistente,
    );
  });

  it("ação desconhecida lança antes de qualquer I/O", async () => {
    const raiz = fabricaTemp();
    await expect(montarJobAcaoProjeto("formatar-hd", "fix", raiz, { modelo: "haiku" })).rejects.toThrow(
      ErroAcaoProjetoDesconhecida,
    );
  });
});

describe("montarDespacho", () => {
  it("substitui os três marcadores", () => {
    const saida = montarDespacho("p=$PROJETO d=$DIR_PROJETO e=$ENTRADA", {
      projeto: "app",
      dirProjeto: "/f/projetos/app",
      entrada: "  minha pergunta  ",
    });
    expect(saida).toBe("p=app d=/f/projetos/app e=minha pergunta");
  });

  it("entrada vazia não deixa a palavra $ENTRADA no prompt", () => {
    // Marcador cru viraria parte do pedido lido pelo agente.
    const saida = montarDespacho("pergunta: $ENTRADA", {
      projeto: "app",
      dirProjeto: "/f/projetos/app",
      entrada: "",
    });
    expect(saida).toBe("pergunta: ");
  });

  it("texto do usuário é inserido literalmente, sem virar padrão de substituição", () => {
    // `$&` e `$'` têm significado especial em String.replace — por isso o split/join.
    const saida = montarDespacho("[$ENTRADA]", {
      projeto: "app",
      dirProjeto: "/d",
      entrada: "$& e $' e $`",
    });
    expect(saida).toBe("[$& e $' e $`]");
  });

  it("nome de projeto não é interpretado como regex", () => {
    const saida = montarDespacho("$PROJETO", {
      projeto: "a.*b",
      dirProjeto: "/d",
      entrada: "",
    });
    expect(saida).toBe("a.*b");
  });
});
