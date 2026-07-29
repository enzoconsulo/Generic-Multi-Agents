import { describe, expect, it } from "vitest";
import { RastreadorTrechos, type LinhaLog } from "../../src/jobs/resumo/segmentos.js";

function linha(nivel: string, texto: string, seg = 0): LinhaLog {
  return { nivel, texto, em: new Date(Date.UTC(2026, 6, 28, 12, 0, seg)).toISOString() };
}

describe("RastreadorTrechos (T-039)", () => {
  it("despacho de subagente FECHA o trecho anterior e abre o novo", () => {
    const r = new RastreadorTrechos();
    expect(r.adicionar(linha("assistente", "vou despachar o executor", 0))).toBeNull();

    const fechado = r.adicionar(linha("ferramenta", "Task → executor", 1));
    expect(fechado).not.toBeNull();
    expect(fechado?.agente).toBeNull(); // o primeiro trecho é do orquestrador
    expect(fechado?.texto).toBe("vou despachar o executor");

    r.adicionar(linha("subagente", "implementei a função", 2));
    const ultimo = r.encerrar();
    expect(ultimo?.agente).toBe("executor");
    expect(ultimo?.texto).toBe("implementei a função");
  });

  it("a linha do despacho é cabeçalho, não conteúdo do trecho novo", () => {
    const r = new RastreadorTrechos();
    r.adicionar(linha("ferramenta", "Task → revisor", 0));
    r.adicionar(linha("subagente", "nenhum bug", 1));
    expect(r.encerrar()?.texto).toBe("nenhum bug");
  });

  it("junta as falas do trecho e conta as ferramentas à parte", () => {
    const r = new RastreadorTrechos();
    r.adicionar(linha("assistente", "primeira", 0));
    r.adicionar(linha("ferramenta", "Read", 1));
    r.adicionar(linha("ferramenta", "Edit", 2));
    r.adicionar(linha("assistente", "segunda", 3));

    const t = r.encerrar();
    expect(t?.texto).toBe("primeira\n\nsegunda");
    expect(t?.ferramentas).toBe(2);
  });

  it("texto de ferramenta NÃO entra no resumo", () => {
    // Quem lê quer saber o que saiu, não que `Read` foi chamado 40 vezes.
    const r = new RastreadorTrechos();
    r.adicionar(linha("ferramenta", "Read arquivo.ts", 0));
    expect(r.encerrar()).toBeNull();
  });

  it("trecho sem texto nenhum não vira resumo", () => {
    // Gastar uma chamada para produzir "o agente não disse nada" é desperdício.
    const r = new RastreadorTrechos();
    r.adicionar(linha("ferramenta", "Task → testador", 0));
    r.adicionar(linha("ferramenta", "Bash", 1));
    expect(r.encerrar()).toBeNull();
  });

  it("índices são estáveis e crescentes — é a chave do resumo", () => {
    const r = new RastreadorTrechos();
    r.adicionar(linha("assistente", "a", 0));
    const t0 = r.adicionar(linha("ferramenta", "Task → executor", 1));
    r.adicionar(linha("subagente", "b", 2));
    const t1 = r.adicionar(linha("ferramenta", "Task → testador", 3));
    r.adicionar(linha("subagente", "c", 4));
    const t2 = r.encerrar();

    expect([t0?.indice, t1?.indice, t2?.indice]).toEqual([0, 1, 2]);
    expect([t0?.agente, t1?.agente, t2?.agente]).toEqual([null, "executor", "testador"]);
  });

  it("encerrar duas vezes não repete o último trecho", () => {
    const r = new RastreadorTrechos();
    r.adicionar(linha("assistente", "algo", 0));
    expect(r.encerrar()).not.toBeNull();
    expect(r.encerrar()).toBeNull();
  });

  it("reconhece o despacho vindo de dentro de um subagente", () => {
    const r = new RastreadorTrechos();
    r.adicionar(linha("assistente", "x", 0));
    const fechado = r.adicionar(linha("ferramenta", "(subagente) Task → documentador", 1));
    expect(fechado).not.toBeNull();
    r.adicionar(linha("subagente", "docs", 2));
    expect(r.encerrar()?.agente).toBe("documentador");
  });
});
