import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  criarDespachante,
  limiarDeDebate,
  orcamentoDeFerramentas,
} from "../../src/pipeline/despachante.js";
import { limparCacheAgentes, FERRAMENTAS_PROIBIDAS } from "../../src/pipeline/prompts-agente.js";
import type { Consulta } from "../../src/jobs/claude/runner-claude.js";
import type { PedidoDespacho } from "../../src/pipeline/motor.js";
import type { TarefaResumo } from "../../src/fabrica/tipos.js";

/**
 * Fábrica falsa mínima: um agente e um projeto. Precisa ser em disco porque o despachante lê
 * o prompt de `.claude/agents/` e o inventário de `_sistema/FERRAMENTAS.md` — que é
 * justamente o que está sendo testado.
 */
async function fabricaFalsa(): Promise<{ raiz: string; dirProjeto: string }> {
  const raiz = await mkdtemp(join(tmpdir(), "desp-"));
  await mkdir(join(raiz, ".claude", "agents"), { recursive: true });
  await writeFile(join(raiz, ".claude", "agents", "executor.md"), "Você implementa a tarefa.");
  await mkdir(join(raiz, "_sistema"), { recursive: true });
  await writeFile(
    join(raiz, "_sistema", "FERRAMENTAS.md"),
    "# Ferramental\nUse `_sistema/ferramentas/captura.mjs` — não instale driver de navegador.",
  );
  const dirProjeto = join(raiz, "projetos", "app");
  await mkdir(join(dirProjeto, "_gestao"), { recursive: true });
  await writeFile(join(dirProjeto, "CLAUDE.md"), "# app");
  limparCacheAgentes();
  return { raiz, dirProjeto };
}

function tarefa(): TarefaResumo {
  return {
    arquivo: "T-001-x.md",
    id: "T-001",
    titulo: "x",
    status: "pronta",
    prioridade: "alta",
    dependencias: [],
    areas: [],
    tentativas: 0,
    replanejadaDe: null,
    ultimaReprovacao: null,
    agente: null,
    criada: null,
    atualizada: null,
    erros: [],
  };
}

/** Captura o `options` que chegaria ao SDK e encerra a etapa sem custo. */
function espiao(): { consulta: Consulta; vistas: Record<string, unknown>[]; prompts: string[] } {
  const vistas: Record<string, unknown>[] = [];
  const prompts: string[] = [];
  const consulta: Consulta = (args) => {
    vistas.push(args.options as Record<string, unknown>);
    prompts.push(String(args.prompt));
    return (async function* () {
      yield { type: "result", is_error: false, total_cost_usd: 0 };
    })();
  };
  return { consulta, vistas, prompts };
}

async function despachar(
  promptColado: string | null = null,
): Promise<{ opcoes: Record<string, unknown>; prompt: string }> {
  const { raiz, dirProjeto } = await fabricaFalsa();
  const { consulta, vistas, prompts } = espiao();
  const despachante = criarDespachante({
    raizFabrica: raiz,
    dirProjeto,
    projeto: "app",
    modeloFluxo: "sonnet",
    equipe: null,
    consulta,
    abortController: new AbortController(),
    emitir: () => {},
  });
  const pedido: PedidoDespacho = {
    tarefa: tarefa(),
    papel: "construtor",
    agente: "executor",
    modelo: null,
    promptColado,
    motivo: "teste",
    notas: "",
  };
  await despachante(pedido);
  return { opcoes: vistas[0] ?? {}, prompt: prompts[0] ?? "" };
}

/**
 * O DEFEITO QUE ESTE TESTE TRAVA (14/08). `allowedTools` só AUTO-APROVA; quem restringe é
 * `tools`. O `sdk.d.ts` é literal em `allowedTools`: *"To restrict which tools are available,
 * use the `tools` option instead."* O despachante passava só `allowedTools` e o comentário
 * afirmava que isso impedia o agente de despachar subagente — não impedia nada.
 *
 * A prova empírica está no job `1a3bc22e`: o `executor` da T-036 chamou **`ScheduleWakeup`
 * seis vezes**, ferramenta que nunca esteve em `FERRAMENTAS_PIPELINE`. Ele tentava agendar
 * continuação futura para esperar uma captura, num job headless onde ninguém acorda ninguém;
 * a etapa morreu com `exit 1` e a tarefa ficou sem entrega.
 *
 * Por isso o teste é sobre o objeto `options` QUE CHEGA AO SDK, e não sobre a constante: é a
 * armadilha registrada no CLAUDE.md do painel — opção com nome errado é ignorada em silêncio,
 * compila, passa nos testes, e a proteção configurada simplesmente não acontece.
 */
describe("despachante — a restrição de ferramentas chega ao SDK na opção que restringe", () => {
  it("passa `tools` (restrição), não só `allowedTools` (auto-aprovação)", async () => {
    const { opcoes } = await despachar();
    expect(Array.isArray(opcoes["tools"]), "`tools` é o que restringe — precisa ser passado").toBe(
      true,
    );
    expect(opcoes["tools"]).toContain("Read");
    expect(opcoes["tools"]).toContain("Bash");
  });

  it("nenhuma ferramenta de despacho ou agendamento sobrevive em `tools`", async () => {
    const { opcoes } = await despachar();
    const tools = opcoes["tools"] as string[];
    for (const proibida of FERRAMENTAS_PROIBIDAS) expect(tools).not.toContain(proibida);
  });

  it("remove a família perigosa do contexto por `disallowedTools`", async () => {
    const { opcoes } = await despachar();
    const negadas = opcoes["disallowedTools"] as string[];
    expect(negadas).toContain("Agent");
    expect(negadas).toContain("ScheduleWakeup");
  });

  /**
   * O inventário abre o bloco compartilhado — a parte byte-idêntica entre despachos, e a
   * única idêntica entre PROJETOS. Fora dela ele seria pago por inteiro a cada etapa.
   */
  it("injeta o ferramental da fábrica no início do prompt", async () => {
    const { prompt } = await despachar();
    expect(prompt).toContain("<ferramental-da-fabrica>");
    expect(prompt).toContain("captura.mjs");
    expect(prompt.indexOf("<ferramental-da-fabrica>")).toBeLessThan(
      prompt.indexOf("<contexto-projeto>"),
    );
  });
});

describe("orcamentoDeFerramentas — o teto declarado nos prompts, em número (T-065)", () => {
  /**
   * Os números saem das tabelas de `.claude/agents/*.md` (executor/construtor escalam com as
   * `areas`; testador/conferente 25; revisor 20). Se um prompt mudar o teto e isto não
   * acompanhar, a medição passa a mentir — e ela existe justamente para medir custo.
   *
   * Medido nas quatro rodadas de 09/08, antes desta conta existir: três despachos passaram do
   * teto declarado (construtor com 39 contra 30 e 52 contra 45; testador com 32 contra 25) e
   * nada registrou. O freio da máquina é o `maxTurns` (40-60), que conta VOLTAS DO MODELO e
   * não chamadas de ferramenta — unidade diferente, e por isso ele não substitui isto.
   */
  it("construtor escala com as `areas`, como a tabela do executor", () => {
    expect(orcamentoDeFerramentas("construtor", 1)).toBe(30);
    expect(orcamentoDeFerramentas("construtor", 2)).toBe(30);
    expect(orcamentoDeFerramentas("construtor", 3)).toBe(45);
    expect(orcamentoDeFerramentas("construtor", 4)).toBe(60);
  });

  it("verificador e revisor têm teto fixo", () => {
    expect(orcamentoDeFerramentas("verificador", 3)).toBe(25);
    expect(orcamentoDeFerramentas("revisor", 3)).toBe(20);
  });

  /**
   * Papel sem teto declarado (planejador) cai num limite alto, nunca em zero: teto zero faria
   * TODA etapa daquele papel aparecer como estouro, e o aviso viraria ruído no primeiro dia.
   */
  it("papel desconhecido não vira teto zero", () => {
    expect(orcamentoDeFerramentas("planejador", 0)).toBeGreaterThanOrEqual(60);
    expect(orcamentoDeFerramentas("papel-que-nao-existe", 2)).toBeGreaterThanOrEqual(60);
  });
});

describe("limiarDeDebate — o ALARME, calibrado no p90 medido (16/08)", () => {
  /**
   * A invariante que separa alvo de alarme, e que é a razão de existirem dois números.
   *
   * O alvo (`orcamentoDeFerramentas`) é o que o prompt pede ao agente: apertado de propósito,
   * e excedido em 36-52% dos despachos reais. Enquanto ELE era o gatilho do relatório, a
   * lista de estouros acusava metade da rodada — e nada pode ser ligado a um sinal que
   * dispara sempre sem virar, na prática, "sempre o caro".
   *
   * O limiar é o p90 de 135 etapas de `dados/jobs/*.log.jsonl`. Se algum dia ele descer até o
   * alvo, o alarme volta a ser ruído e o atuador de `politicaDe` perde o sentido.
   */
  it("é estritamente maior que o alvo declarado, em todo papel", () => {
    expect(limiarDeDebate("construtor")).toBeGreaterThan(orcamentoDeFerramentas("construtor", 4));
    expect(limiarDeDebate("verificador")).toBeGreaterThan(orcamentoDeFerramentas("verificador", 2));
    expect(limiarDeDebate("revisor")).toBeGreaterThan(orcamentoDeFerramentas("revisor", 2));
  });

  /**
   * A medição derrubou a premissa da escada 30/45/60: mediana de 21 chamadas com ≤2 areas
   * contra 12 com 3 areas, e p90 de 57 e 58. O número de `areas` NÃO prevê o de chamadas, e
   * um limiar que escala nele erra nos dois sentidos ao mesmo tempo.
   */
  it("não escala com `areas` — a medição mostrou que elas não preveem chamadas", () => {
    expect(limiarDeDebate("construtor")).toBe(65);
    expect(limiarDeDebate("verificador")).toBe(37);
    expect(limiarDeDebate("revisor")).toBe(28);
  });

  it("papel desconhecido não vira limiar zero", () => {
    expect(limiarDeDebate("planejador")).toBeGreaterThanOrEqual(60);
    expect(limiarDeDebate("papel-que-nao-existe")).toBeGreaterThanOrEqual(60);
  });
});


/**
 * A OUTRA METADE DA CADEIA DA EQUIPE ESPECIALIZADA (16/08).
 *
 * `maquina.test.ts` e `especialista-colado.test.ts` provam que a resolução DEVOLVE o prompt do
 * especialista quando não há subagente injetado — que é o caso de 100% dos despachos do
 * pipeline em código. Falta provar que ele CHEGA à mensagem, e essa metade é a que esta
 * fábrica já perdeu em silêncio antes: o `outputConfig` do SDK compilava, passava nos testes e
 * era ignorado.
 *
 * Por isso o teste é sobre o `prompt` que o espião captura, não sobre o campo do pedido.
 */
describe("despachante — o prompt do especialista chega à mensagem", () => {
  it("insere o bloco <especialista> com o conteúdo colado", async () => {
    const { prompt } = await despachar("Você é o especialista em motor de regras deste projeto.");
    expect(prompt).toContain("<especialista>");
    expect(prompt).toContain("Você é o especialista em motor de regras deste projeto.");
    expect(prompt).toContain("</especialista>");
  });

  it("sem especialista, nenhum bloco vazio sobra na mensagem", async () => {
    const { prompt } = await despachar(null);
    expect(prompt).not.toContain("<especialista>");
  });

  /**
   * O prompt do papel continua sendo o do papel: o especialista ACRESCENTA domínio, não
   * substitui a disciplina. Trocar um pelo outro faria o executor perder o contrato de estado.
   */
  it("o bloco do papel continua presente ao lado do especialista", async () => {
    const { prompt } = await despachar("domínio X");
    expect(prompt).toContain("<seu-papel>");
    expect(prompt.indexOf("<seu-papel>")).toBeLessThan(prompt.indexOf("<especialista>"));
  });
});

/**
 * A LINHA DE LOG É A ÚNICA JANELA DO USUÁRIO PARA O ROTEAMENTO (23/08).
 *
 * Ela escrevia `executor` seco, que é o nome do ARQUIVO de agente — e no pipeline em código
 * esse é sempre o nome, porque o especialista nunca vira subagente. Resultado: 64 despachos
 * especializados do banco-imobiliario apareceram na tela como genéricos, e a conclusão
 * natural de quem lê foi que o `equipe.json` não fazia nada.
 *
 * É a armadilha já registrada no CLAUDE.md do painel — "linha de log descreve o que
 * ACONTECEU" — do lado da execução, não do lado do motivo.
 */
describe("linha de execução mostra o agente EFETIVO", () => {
  async function linhas(pedidoExtra: Partial<PedidoDespacho>): Promise<string[]> {
    const { raiz, dirProjeto } = await fabricaFalsa();
    const { consulta } = espiao();
    const emitidas: string[] = [];
    const despachante = criarDespachante({
      raizFabrica: raiz,
      dirProjeto,
      projeto: "app",
      modeloFluxo: "sonnet",
      equipe: null,
      consulta,
      abortController: new AbortController(),
      emitir: (_n, texto) => emitidas.push(texto),
    });
    await despachante({
      tarefa: tarefa(),
      papel: "construtor",
      agente: "executor",
      modelo: null,
      promptColado: null,
      motivo: "teste",
      notas: "",
      ...pedidoExtra,
    } as PedidoDespacho);
    return emitidas;
  }

  it("prefixa o id do especialista quando há um conduzindo a etapa", async () => {
    const l = await linhas({ especialista: "frontend", promptColado: "sou o frontend" });
    expect(l.some((t) => t.includes("frontend@executor"))).toBe(true);
  });

  it("sem especialista, a linha continua nomeando só o agente", async () => {
    const l = await linhas({});
    expect(l.some((t) => t.includes("· executor ·"))).toBe(true);
    expect(l.some((t) => t.includes("@"))).toBe(false);
  });
});

/**
 * `areas` com DIRETÓRIO não embute nada, e antes isso sumia entre os "omitidos" — bloco que
 * ninguém lê. Vira erro visível porque é defeito de PLANEJAMENTO: só se conserta se aparecer.
 */
describe("alarme de `areas` com diretório", () => {
  it("emite erro nomeando o caminho e dizendo de quem é o defeito", async () => {
    const { raiz, dirProjeto } = await fabricaFalsa();
    await mkdir(join(dirProjeto, "public"), { recursive: true });
    const { consulta } = espiao();
    const erros: string[] = [];
    const despachante = criarDespachante({
      raizFabrica: raiz,
      dirProjeto,
      projeto: "app",
      modeloFluxo: "sonnet",
      equipe: null,
      consulta,
      abortController: new AbortController(),
      emitir: (nivel, texto) => {
        if (nivel === "erro") erros.push(texto);
      },
    });
    await despachante({
      tarefa: { ...tarefa(), areas: ["public"] },
      papel: "construtor",
      agente: "executor",
      modelo: null,
      promptColado: null,
      motivo: "teste",
      notas: "",
    });
    expect(erros.some((t) => t.includes("public") && t.includes("DIRETÓRIO"))).toBe(true);
  });
});
