import { afterEach, describe, expect, it, vi } from "vitest";
import { buscarDeduplicado } from "../src/lib/useDados";

/**
 * Deduplicação de requisição EM VOO (T-042).
 *
 * As duas propriedades aqui puxam para lados opostos, e é por isso que ambas precisam de
 * teste: deduplicar demais vira cache, e cache serve dado velho depois de uma gravação.
 * O desenho é deliberadamente o mínimo que resolve o caso real — vários componentes
 * montando juntos pedem o mesmo dado.
 */

/**
 * fetch falso que só responde quando o teste mandar — é o que permite ter duas buscas em
 * voo ao mesmo tempo, a situação real que a deduplicação existe para resolver.
 *
 * O portão é criado ANTES de qualquer chamada, de propósito: `api()` só chega ao `fetch`
 * depois de um await, então um `resolve` capturado dentro do fetch falso ainda não existe
 * quando o teste manda liberar, e o teste trava.
 */
function fetchControlado() {
  const chamadas: string[] = [];
  let abrir: (corpo: unknown) => void = () => {};
  const portao = new Promise<unknown>((ok) => (abrir = ok));
  const espiao = vi.fn(async (caminho: string) => {
    chamadas.push(caminho);
    const corpo = await portao;
    return new Response(JSON.stringify(corpo), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", espiao);
  return { chamadas, liberar: (corpo: unknown) => abrir(corpo) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buscarDeduplicado (T-042)", () => {
  it("chamadas simultâneas ao mesmo caminho viram UMA requisição", async () => {
    const f = fetchControlado();

    const a = buscarDeduplicado<{ n: number }>("/api/fabrica");
    const b = buscarDeduplicado<{ n: number }>("/api/fabrica");
    const c = buscarDeduplicado<{ n: number }>("/api/fabrica");
    f.liberar({ n: 1 });

    expect(await a).toEqual({ n: 1 });
    // Todos recebem o MESMO resultado — deduplicar não pode deixar ninguém sem resposta.
    expect(await b).toEqual({ n: 1 });
    expect(await c).toEqual({ n: 1 });
    expect(f.chamadas).toEqual(["/api/fabrica"]);
  });

  it("caminhos diferentes não se misturam", async () => {
    const f = fetchControlado();
    const a = buscarDeduplicado("/api/fabrica");
    const b = buscarDeduplicado("/api/acoes-projeto");
    f.liberar({ ok: true });
    await Promise.all([a, b]);
    expect(f.chamadas).toEqual(["/api/fabrica", "/api/acoes-projeto"]);
  });

  it("NÃO é cache: depois de resolver, a próxima busca vai à rede de novo", async () => {
    // A propriedade que protege contra tela mentirosa. Se isto virar cache, uma gravação
    // (equipe editada, ci.json salvo) passa a ser seguida de dado velho.
    const f1 = fetchControlado();
    const primeira = buscarDeduplicado<{ n: number }>("/api/fabrica");
    f1.liberar({ n: 1 });
    expect(await primeira).toEqual({ n: 1 });

    const f2 = fetchControlado();
    const segunda = buscarDeduplicado<{ n: number }>("/api/fabrica");
    f2.liberar({ n: 2 });
    expect(await segunda).toEqual({ n: 2 });
    expect(f2.chamadas).toEqual(["/api/fabrica"]);
  });

  it("falha não deixa a entrada presa — a busca seguinte tenta de novo", async () => {
    // Sem o `finally` que limpa o mapa, um erro envenenaria o caminho para sempre: todo
    // componente que pedisse aquele dado receberia a mesma rejeição antiga.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("rede fora");
      }),
    );
    await expect(buscarDeduplicado("/api/fabrica")).rejects.toThrow();

    const f = fetchControlado();
    const segunda = buscarDeduplicado<{ n: number }>("/api/fabrica");
    f.liberar({ n: 9 });
    expect(await segunda).toEqual({ n: 9 });
  });
});
