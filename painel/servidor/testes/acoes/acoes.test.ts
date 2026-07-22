import { describe, expect, it } from "vitest";
import { ErroAcaoDesconhecida, montarJobAcao } from "../../src/acoes/acoes.js";

const RAIZ = "C:/fabrica";

describe("montarJobAcao — comando, cwd e escopo de lock", () => {
  it("monta prompt com barra e usa a raiz da fábrica como cwd", () => {
    const job = montarJobAcao({ id: "status", modelo: "sonnet" }, RAIZ);
    expect(job.tipo).toBe("claude");
    expect(job.usaClaude).toBe(true);
    expect(job.params?.["prompt"]).toBe("/status");
    expect(job.params?.["cwd"]).toBe(RAIZ);
    expect(job.params?.["modelo"]).toBe("sonnet");
  });

  it("inclui os argumentos no prompt", () => {
    const job = montarJobAcao({ id: "trabalhar", argumentos: "painel-fabrica", modelo: "opus" }, RAIZ);
    expect(job.params?.["prompt"]).toBe("/trabalhar painel-fabrica");
  });

  it("trava a fábrica inteira (global) para ações de orquestração", () => {
    expect(montarJobAcao({ id: "encerrar-dia", modelo: "haiku" }, RAIZ).escopo).toBe("global");
    expect(montarJobAcao({ id: "manutencao", modelo: "haiku" }, RAIZ).escopo).toBe("global");
    expect(montarJobAcao({ id: "novo-projeto", modelo: "haiku" }, RAIZ).escopo).toBe("global");
  });

  it("trava só o projeto quando trabalhar/status recebem um projeto", () => {
    expect(montarJobAcao({ id: "trabalhar", argumentos: "app-x", modelo: "haiku" }, RAIZ).escopo).toBe(
      "projeto:app-x",
    );
    expect(montarJobAcao({ id: "status", argumentos: "app-y outra", modelo: "haiku" }, RAIZ).escopo).toBe(
      "projeto:app-y",
    );
  });

  it("trabalhar/status sem argumento são globais (varrem a fábrica)", () => {
    expect(montarJobAcao({ id: "trabalhar", modelo: "haiku" }, RAIZ).escopo).toBe("global");
    expect(montarJobAcao({ id: "status", argumentos: "  ", modelo: "haiku" }, RAIZ).escopo).toBe("global");
  });

  it("rejeita ação desconhecida", () => {
    expect(() => montarJobAcao({ id: "inexistente", modelo: "haiku" }, RAIZ)).toThrow(
      ErroAcaoDesconhecida,
    );
  });
});
