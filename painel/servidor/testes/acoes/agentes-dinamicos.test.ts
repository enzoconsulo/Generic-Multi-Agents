import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agentesParaAcao } from "../../src/acoes/agentes-dinamicos.js";

function fabricaComEquipe(agentes: unknown[], projeto = "app"): string {
  const raiz = mkdtempSync(join(tmpdir(), "agdin-"));
  const gestao = join(raiz, "projetos", projeto, "_gestao");
  mkdirSync(gestao, { recursive: true });
  writeFileSync(join(gestao, "equipe.json"), JSON.stringify({ agentes }), "utf8");
  return raiz;
}

describe("agentesParaAcao — injeção da equipe do projeto no /trabalhar", () => {
  it("só injeta para a ação trabalhar", async () => {
    const raiz = fabricaComEquipe([{ id: "f", prompt: "p" }]);
    expect(await agentesParaAcao(raiz, "status", "app")).toBeUndefined();
    expect(await agentesParaAcao(raiz, "trabalhar", "app")).toBeDefined();
  });

  /**
   * CONTRATO INVERTIDO em T-045, com evidência de execução real.
   *
   * Antes: sem projeto no argumento → `undefined`. Mas esse é o disparo PADRÃO do painel
   * (o botão manda `{}` = todos os projetos), e num `/trabalhar` real de 2026-07-30 o fluxo
   * leu `equipe.json` do disco, viu os especialistas lá e despachou `streamlit-ui` e
   * `ia-integracao` — o SDK recusou os dois com "not found", porque nada tinha sido
   * injetado. O painel anunciava equipe que ele mesmo não injetou: queimou turnos em
   * despachos condenados e caiu no `executor` genérico, ignorando a equipe em silêncio.
   *
   * Agora sem projeto injeta a equipe de TODOS os projetos.
   */
  it("sem projeto no argumento injeta a equipe de todos os projetos", async () => {
    const raiz = fabricaComEquipe([{ id: "f", prompt: "p" }]);
    const ag = await agentesParaAcao(raiz, "trabalhar", "");
    expect(Object.keys(ag ?? {})).toEqual(["f"]);
  });

  it("une as equipes de projetos diferentes", async () => {
    const raiz = fabricaComEquipe([{ id: "front", prompt: "p1" }], "loja");
    // Segundo projeto na MESMA raiz.
    const gestao2 = join(raiz, "projetos", "blog", "_gestao");
    mkdirSync(gestao2, { recursive: true });
    writeFileSync(
      join(gestao2, "equipe.json"),
      JSON.stringify({ agentes: [{ id: "texto", prompt: "p2" }] }),
      "utf8",
    );

    const ag = await agentesParaAcao(raiz, "trabalhar", "");
    expect(Object.keys(ag ?? {}).sort()).toEqual(["front", "texto"]);
  });

  /**
   * Antes: ficava o primeiro alfabético e o outro sumia com um `console.warn`. Isso quer
   * dizer que, no disparo padrão do painel (sem projeto = todos), o `ui` do blog executava
   * tarefas da loja com o prompt errado — silenciosamente, que é o pior desfecho possível
   * para um despacho de construtor.
   *
   * Agora o id repetido é QUALIFICADO nos dois lados. O despacho pelo id nu passa a falhar
   * de forma visível ("not found"), e o orquestrador tem a resolução em 3 passos
   * (CLAUDE.md, "Equipe do projeto") para chegar ao nome qualificado.
   */
  it("id repetido entre projetos vira `<projeto>__<id>` nos dois, sem misturar prompts", async () => {
    const raiz = fabricaComEquipe([{ id: "ui", prompt: "prompt-do-blog" }], "blog");
    const gestao2 = join(raiz, "projetos", "loja", "_gestao");
    mkdirSync(gestao2, { recursive: true });
    writeFileSync(
      join(gestao2, "equipe.json"),
      JSON.stringify({ agentes: [{ id: "ui", prompt: "prompt-da-loja" }] }),
      "utf8",
    );

    const ag = await agentesParaAcao(raiz, "trabalhar", "");
    expect(Object.keys(ag ?? {}).sort()).toEqual(["blog__ui", "loja__ui"]);
    expect(ag?.["blog__ui"]?.prompt).toBe("prompt-do-blog");
    expect(ag?.["loja__ui"]?.prompt).toBe("prompt-da-loja");
    // O id nu NÃO existe: despachá-lo falha visivelmente em vez de rodar o prompt errado.
    expect(ag?.["ui"]).toBeUndefined();
    // A descrição diz de qual projeto é, senão o orquestrador escolhe no escuro.
    expect(ag?.["loja__ui"]?.description).toContain("loja");
  });

  it("id único continua NU mesmo com vários projetos injetados", async () => {
    // Qualificar sempre dobraria o contexto injetado sem resolver nada: o caso normal é id
    // único, e é ele que precisa continuar barato e igual ao que sempre foi.
    const raiz = fabricaComEquipe([{ id: "front", prompt: "p1" }], "loja");
    const gestao2 = join(raiz, "projetos", "blog", "_gestao");
    mkdirSync(gestao2, { recursive: true });
    writeFileSync(
      join(gestao2, "equipe.json"),
      JSON.stringify({ dominio: "documento", agentes: [{ id: "redator", prompt: "p2" }] }),
      "utf8",
    );

    const ag = await agentesParaAcao(raiz, "trabalhar", "");
    expect(Object.keys(ag ?? {}).sort()).toEqual(["front", "redator"]);
  });

  it("colisão + reforço: os gêmeos também nascem qualificados", async () => {
    const raiz = fabricaComEquipe([{ id: "ui", prompt: "p-blog" }], "blog");
    const gestao2 = join(raiz, "projetos", "loja", "_gestao");
    mkdirSync(gestao2, { recursive: true });
    writeFileSync(
      join(gestao2, "equipe.json"),
      JSON.stringify({ agentes: [{ id: "ui", prompt: "p-loja" }] }),
      "utf8",
    );

    const ag = await agentesParaAcao(raiz, "trabalhar", "", "opus");
    expect(Object.keys(ag ?? {}).sort()).toEqual([
      "blog__ui",
      "blog__ui-reforcado",
      "loja__ui",
      "loja__ui-reforcado",
    ]);
    expect(ag?.["loja__ui-reforcado"]?.model).toBe("opus");
    expect(ag?.["loja__ui-reforcado"]?.prompt).toBe("p-loja");
  });

  it("nenhum projeto com equipe válida → undefined (não injeta objeto vazio)", async () => {
    const raiz = fabricaComEquipe([{ id: "sem-prompt" }]);
    expect(await agentesParaAcao(raiz, "trabalhar", "")).toBeUndefined();
  });

  it("converte só os agentes válidos no formato options.agents do SDK", async () => {
    const raiz = fabricaComEquipe([
      { id: "frontend", descricao: "UI", prompt: "faça UI", ferramentas: ["Read"] },
      { id: "invalido" }, // sem prompt → descartado
    ]);
    const ag = await agentesParaAcao(raiz, "trabalhar", "app extra-ignorado");
    expect(ag).toBeDefined();
    expect(Object.keys(ag ?? {})).toEqual(["frontend"]);
    expect(ag?.["frontend"]?.description).toBe("UI");
    expect(ag?.["frontend"]?.prompt).toBe("faça UI");
    // `tools` OMITIDO de propósito, mesmo com `ferramentas` declarado no equipe.json: o
    // SDK faz o agente HERDAR as do pai, e é isso que torna o bloco de definições de
    // ferramenta (~12k tokens) idêntico entre despachos. Como ele vem ANTES do systemPrompt
    // na chave de cache, lista divergente impediria qualquer compartilhamento depois dela.
    expect(ag?.["frontend"]?.tools).toBeUndefined();
  });

  it("projeto sem nenhum agente válido → undefined", async () => {
    const raiz = fabricaComEquipe([{ id: "x" }]); // sem prompt
    expect(await agentesParaAcao(raiz, "trabalhar", "app")).toBeUndefined();
  });
});

/**
 * Escalonamento de modelo (protocolo, regra 12): a tarefa que já voltou reprovada vai para
 * um gêmeo do especialista rodando num modelo mais forte. O gatilho é a falha medida, não
 * palpite de dificuldade — insistir com o modelo que já falhou paga executor + testador +
 * revisor de novo e ainda queima uma das 3 tentativas.
 */
describe("agentesParaAcao — gêmeos reforçados", () => {
  const equipe = [{ id: "frontend", descricao: "UI", prompt: "faça UI", ferramentas: ["Read"] }];

  it("injeta `<id>-reforcado` com o modelo do reforço, mantendo o prompt", async () => {
    const raiz = fabricaComEquipe(equipe);
    const ag = await agentesParaAcao(raiz, "trabalhar", "app", "opus");

    expect(Object.keys(ag ?? {}).sort()).toEqual(["frontend", "frontend-reforcado"]);
    const reforcado = ag?.["frontend-reforcado"];
    // O nome do campo é o do SDK (`AgentDefinition.model`): errado, seria ignorado EM
    // SILÊNCIO e o gêmeo rodaria no mesmo modelo do fluxo, sem ninguém notar.
    expect(reforcado?.model).toBe("opus");
    expect(reforcado?.prompt).toBe("faça UI");
    // Herda as ferramentas do pai, como o normal — ver o teste de conversão acima.
    expect(reforcado?.tools).toBeUndefined();
    expect(reforcado?.description).toContain("RETRABALHO");
    // O normal segue sem `model`: herda o do fluxo, que é o comportamento de sempre.
    expect(ag?.["frontend"]?.model).toBeUndefined();
  });

  it("estratégia no topo (sem reforço) não injeta gêmeo nenhum", async () => {
    const raiz = fabricaComEquipe(equipe);
    expect(Object.keys((await agentesParaAcao(raiz, "trabalhar", "app", null)) ?? {})).toEqual([
      "frontend",
    ]);
    expect(Object.keys((await agentesParaAcao(raiz, "trabalhar", "app")) ?? {})).toEqual([
      "frontend",
    ]);
  });
});
