import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolverAgente, trilhaDe } from "../../src/pipeline/maquina.js";
import type { EquipeProjeto } from "../../src/fabrica/tipos.js";
import type { TarefaResumo } from "../../src/fabrica/tipos.js";

/**
 * A EQUIPE ESPECIALIZADA CHEGA MESMO AO MODELO? (16/08)
 *
 * A auditoria dos 41 jobs mostrou que em 51 de 51 despachos com `agente:` a resolução caiu no
 * PASSO 3 — o especialista colado no despacho. Os passos 1 e 2 (subagente do SDK) nunca
 * executam no pipeline em código, e isso é deliberado: quem despacha é código, não um
 * orquestrador-modelo que "chama" subagentes.
 *
 * A pergunta que importa, então, é outra: **a especialização se perde?** Não — o passo 3
 * devolve `promptColado`, e o despachante o insere num bloco `<especialista>`. Este teste
 * trava as duas metades dessa cadeia usando o `equipe.json` REAL do banco-imobiliario, porque
 * a diferença entre "o campo existe" e "o conteúdo chega" é exatamente o tipo de coisa que
 * esta fábrica já perdeu em silêncio uma vez (o `outputConfig` do SDK, que compilava e era
 * ignorado).
 */

const EQUIPE_REAL = "C:/Users/enzoc/OneDrive/Documentos/Gerador_de_projetos/projetos/banco-imobiliario/_gestao/equipe.json";

function tarefaCom(agente: string | null, tentativas = 0): TarefaResumo {
  return {
    arquivo: "T-900-x.md", id: "T-900", titulo: "x", status: "pronta", prioridade: "alta",
    dependencias: [], areas: ["server/engine/dados.js"], tentativas, replanejadaDe: null, ultimaReprovacao: null,
    agente, criada: null, atualizada: null, erros: [],
  };
}

describe("equipe especializada no pipeline em código", () => {
  const equipe = JSON.parse(readFileSync(EQUIPE_REAL, "utf8")) as EquipeProjeto;

  it("o equipe.json real tem os especialistas com prompt não vazio", () => {
    expect(equipe.agentes.length).toBeGreaterThanOrEqual(3);
    for (const a of equipe.agentes) {
      expect(a.prompt.length, a.id).toBeGreaterThan(200);
    }
  });

  /**
   * O CORAÇÃO: sem subagente injetado (`disponiveis` vazio, que é o que
   * `runner-pipeline.ts` sempre passa), a resolução PRECISA devolver o prompt do
   * especialista. Se devolvesse `null`, o `agente:` do frontmatter viraria decoração e todo
   * projeto rodaria genérico sem ninguém perceber.
   */
  it("sem injeção, o prompt do especialista vem COLADO — não se perde", () => {
    const r = resolverAgente(
      { tarefa: tarefaCom("engine"), papel: "construtor" },
      trilhaDe(equipe),
      equipe,
      { disponiveis: new Set<string>(), projeto: "banco-imobiliario", reforco: "opus" },
    );
    expect(r.nome).toBe("executor");
    // Conteúdo REAL do especialista, e não um campo qualquer preenchido: o texto tem de ser
    // IDÊNTICO ao do `equipe.json`. Antes isto era `toContain("motor de regras")` — casar
    // prosa do arquivo de outro projeto quebra sempre que alguém melhora a redação do
    // especialista, sem que nada de fato tenha regredido. Comparar com a fonte prova mais e
    // não envelhece.
    const doArquivo = equipe.agentes.find((a) => a.id === "engine")?.prompt;
    expect(doArquivo).toBeDefined();
    expect(r.promptColado).toBe(doArquivo);
    expect(r.motivo).toContain("colado no despacho");
  });

  it("cada especialista traz o SEU prompt, não o do vizinho", () => {
    const doTabuleiro = resolverAgente(
      { tarefa: tarefaCom("tabuleiro"), papel: "construtor" },
      trilhaDe(equipe), equipe,
      { disponiveis: new Set<string>(), projeto: "banco-imobiliario", reforco: "opus" },
    );
    expect(doTabuleiro.promptColado).toBe(equipe.agentes.find((a) => a.id === "tabuleiro")?.prompt);
    // E não é o do vizinho: os prompts precisam ser de fato distintos entre si.
    expect(doTabuleiro.promptColado).not.toBe(equipe.agentes.find((a) => a.id === "engine")?.prompt);
  });

  /** `agente:` que não consta é defeito de PLANEJAMENTO e tem mensagem própria. */
  it("aponta especialista inexistente com motivo distinguível", () => {
    const r = resolverAgente(
      { tarefa: tarefaCom("nao-existe"), papel: "construtor" },
      trilhaDe(equipe), equipe,
      { disponiveis: new Set<string>(), projeto: "banco-imobiliario", reforco: "opus" },
    );
    expect(r.promptColado).toBeNull();
    expect(r.motivo).toContain("não consta");
  });

  /**
   * A troca de especialista após 2 reprovações é o ÚNICO caso em que a especialização é
   * abandonada de propósito — e aí o prompt colado tem de sumir junto, senão a "troca" seria
   * só de nome.
   */
  it("após 2 reprovações troca para o reforçado genérico e ABANDONA o prompt do especialista", () => {
    const r = resolverAgente(
      { tarefa: tarefaCom("engine", 2), papel: "construtor" },
      trilhaDe(equipe), equipe,
      { disponiveis: new Set<string>(), projeto: "banco-imobiliario", reforco: "opus" },
    );
    expect(r.nome).toBe("executor-reforcado");
    expect(r.promptColado).toBeNull();
    expect(r.motivo).toContain("enviesando");
  });

  /**
   * REGRESSÃO DE REDAÇÃO, e ela vale um teste porque o estrago foi real.
   *
   * O motivo do passo 3 era `` `engine` não injetado — genérico com prompt colado ``. Está
   * correto e é enganoso: abre pelo mecanismo AUSENTE (injeção de subagente, que o painel
   * nunca usa e nem deveria) em vez do efeito real (o especialista foi aplicado). Em 16/08
   * isso fez 51 despachos saudáveis serem lidos como 51 degradados numa auditoria, e a
   * conclusão errada — "a equipe especializada nunca é usada" — chegou a ser relatada ao
   * usuário antes de ser desmentida por teste.
   *
   * A linha de log é lida meses depois, fora de contexto, por quem julga a saúde do
   * roteamento por ela. Descreva o que ACONTECEU.
   */
  it("o motivo descreve o que aconteceu, não o mecanismo que faltou", () => {
    const r = resolverAgente(
      { tarefa: tarefaCom("engine"), papel: "construtor" },
      trilhaDe(equipe), equipe,
      { disponiveis: new Set<string>(), projeto: "banco-imobiliario", reforco: "opus" },
    );
    expect(r.motivo).not.toMatch(/não injetad|nao injetad/i);
    expect(r.motivo).toContain("engine");
  });

  /**
   * Passo 1/2 e passo 3 aplicam o MESMO especialista por meios diferentes. Se as duas linhas
   * fossem idênticas no log, não daria para auditar por qual caminho o roteamento passou —
   * que é a única razão de o campo `motivo` existir.
   */
  it("distingue no log o especialista aplicado como subagente do aplicado por colagem", () => {
    const comum = { projeto: "banco-imobiliario", reforco: "opus" };
    const colado = resolverAgente(
      { tarefa: tarefaCom("engine"), papel: "construtor" },
      trilhaDe(equipe), equipe, { ...comum, disponiveis: new Set<string>() },
    );
    const subagente = resolverAgente(
      { tarefa: tarefaCom("engine"), papel: "construtor" },
      trilhaDe(equipe), equipe, { ...comum, disponiveis: new Set(["engine"]) },
    );
    expect(subagente.nome).toBe("engine");
    expect(subagente.promptColado).toBeNull();
    expect(colado.motivo).not.toBe(subagente.motivo);
  });
});

/**
 * A ESPECIALIZAÇÃO PRECISA SER VISÍVEL, não só eficaz (23/08).
 *
 * Ela sempre chegou ao modelo — mas a linha de execução do log escrevia apenas `executor`,
 * porque é o nome do ARQUIVO de agente. Quem acompanha o painel via a fábrica inteira
 * rodando no genérico e concluía, corretamente a partir do que estava na tela, que os
 * especialistas do `equipe.json` eram decoração. `especialista` existe para essa linha.
 *
 * O caso negativo é tão importante quanto o positivo: quando a especialização é DESCARTADA
 * de propósito (regra de `tentativas >= 2`), o campo tem de vir `null` — anunciar um
 * especialista que não está no prompt é a mesma mentira ao contrário.
 */
describe("id do especialista, para o log", () => {
  const equipe = JSON.parse(readFileSync(EQUIPE_REAL, "utf8")) as EquipeProjeto;
  const opcoes = {
    disponiveis: new Set<string>(),
    projeto: "banco-imobiliario",
    reforco: "opus",
  };

  it("acompanha o prompt colado", () => {
    const r = resolverAgente(
      { tarefa: tarefaCom("tabuleiro"), papel: "construtor" },
      trilhaDe(equipe),
      equipe,
      opcoes,
    );
    expect(r.especialista).toBe("tabuleiro");
    expect(r.promptColado).not.toBeNull();
  });

  it("é null quando a tarefa não nomeia especialista", () => {
    const r = resolverAgente(
      { tarefa: tarefaCom(null), papel: "construtor" },
      trilhaDe(equipe),
      equipe,
      opcoes,
    );
    expect(r.especialista).toBe(null);
  });

  it("é null nos papéis fixos da trilha (verificador e revisor)", () => {
    for (const papel of ["verificador", "revisor"] as const) {
      const r = resolverAgente(
        { tarefa: tarefaCom("tabuleiro"), papel },
        trilhaDe(equipe),
        equipe,
        opcoes,
      );
      expect(r.especialista, papel).toBe(null);
    }
  });

  it("é null quando `tentativas >= 2` descarta a especialização — e o prompt também", () => {
    const r = resolverAgente(
      { tarefa: tarefaCom("tabuleiro", 2), papel: "construtor" },
      trilhaDe(equipe),
      equipe,
      opcoes,
    );
    expect(r.nome).toBe("executor-reforcado");
    expect(r.promptColado).toBe(null);
    expect(r.especialista).toBe(null);
  });
});
