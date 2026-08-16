import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolverAgente, trilhaDe } from "../../src/pipeline/maquina.js";
import type { EquipeProjeto } from "../../src/fabrica/tipos.js";
import type { TarefaResumo } from "../../src/fabrica/tipos.js";

/**
 * A EQUIPE ESPECIALIZADA CHEGA MESMO AO MODELO? (16/08)
 *
 * A auditoria dos 41 jobs mostrou que em 51 de 51 despachos com `agente:` a resolução caiu no
 * PASSO 3 — "genérico com prompt colado". Steps 1 e 2 (subagente injetado pelo SDK) nunca
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
    dependencias: [], areas: ["server/engine/dados.js"], tentativas, replanejadaDe: null,
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
    expect(r.promptColado).not.toBeNull();
    // Conteúdo REAL do especialista, não um campo qualquer preenchido.
    expect(r.promptColado).toContain("motor de regras");
    expect(r.promptColado).toContain("server/engine/");
    expect(r.motivo).toContain("prompt colado");
  });

  it("cada especialista traz o SEU prompt, não o do vizinho", () => {
    const doFrontend = resolverAgente(
      { tarefa: tarefaCom("frontend"), papel: "construtor" },
      trilhaDe(equipe), equipe,
      { disponiveis: new Set<string>(), projeto: "banco-imobiliario", reforco: "opus" },
    );
    expect(doFrontend.promptColado).toContain("public/");
    expect(doFrontend.promptColado).not.toContain("server/engine/ e tests/");
  });

  /** `agente:` que não consta é defeito de PLANEJAMENTO e tem mensagem própria. */
  it("aponta especialista inexistente com motivo distinguível", () => {
    const r = resolverAgente(
      { tarefa: tarefaCom("nao-existe"), papel: "construtor" },
      trilhaDe(equipe), equipe,
      { disponiveis: new Set<string>(), projeto: "banco-imobiliario", reforco: "opus" },
    );
    expect(r.promptColado).toBeNull();
    expect(r.motivo).toContain("NÃO consta");
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
});
