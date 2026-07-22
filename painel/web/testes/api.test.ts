import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/lib/api";

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Substitui o fetch global por um espião que devolve `resposta` (default: 200 {ok:true}). */
function espionarFetch(resposta?: Response) {
  const espiao = vi.fn(async (_caminho: string, _init?: RequestInit) => {
    return resposta ?? respostaJson({ ok: true });
  });
  vi.stubGlobal("fetch", espiao);
  return espiao;
}

/** Headers efetivamente passados ao fetch na 1ª chamada, normalizados para leitura. */
function headersEnviados(espiao: ReturnType<typeof espionarFetch>): Headers {
  const chamada = espiao.mock.calls[0];
  expect(chamada).toBeDefined();
  return new Headers(chamada?.[1]?.headers);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api() — montagem de headers (achado 2 da revisão)", () => {
  it("preserva headers passados como instância Headers", async () => {
    const espiao = espionarFetch();
    await api("/api/teste", {
      method: "POST",
      body: "{}",
      headers: new Headers({ "X-Personalizado": "valor" }),
    });

    const headers = headersEnviados(espiao);
    expect(headers.get("X-Personalizado")).toBe("valor");
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("preserva headers passados como array de pares (sem virar header numérico)", async () => {
    const espiao = espionarFetch();
    await api("/api/teste", { headers: [["X-Par", "abc"]] });

    const headers = headersEnviados(espiao);
    expect(headers.get("X-Par")).toBe("abc");
    expect(headers.has("0")).toBe(false);
  });

  it("headers do chamador vencem os defaults (objeto simples)", async () => {
    const espiao = espionarFetch();
    await api("/api/teste", {
      method: "POST",
      body: "texto",
      headers: { "Content-Type": "text/plain", Accept: "text/plain" },
    });

    const headers = headersEnviados(espiao);
    expect(headers.get("Content-Type")).toBe("text/plain");
    expect(headers.get("Accept")).toBe("text/plain");
  });

  it("aplica os defaults quando nenhum header é passado", async () => {
    const espiao = espionarFetch();
    await api("/api/teste", { method: "POST", body: JSON.stringify({ a: 1 }) });

    const headers = headersEnviados(espiao);
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("não força Content-Type sem body nem para body FormData (boundary do multipart)", async () => {
    const espiao = espionarFetch();
    await api("/api/teste");
    const semBody = headersEnviados(espiao);
    expect(semBody.has("Content-Type")).toBe(false);

    espiao.mockClear();
    const formulario = new FormData();
    formulario.append("campo", "valor");
    await api("/api/teste", { method: "POST", body: formulario });
    const comFormData = headersEnviados(espiao);
    expect(comFormData.has("Content-Type")).toBe(false);
  });
});

describe("api() — tratamento de erro", () => {
  it("lança ErroApi com a mensagem do campo `erro` do backend", async () => {
    espionarFetch(respostaJson({ erro: "Projeto não encontrado" }, 404));

    await expect(api("/api/teste")).rejects.toMatchObject({
      name: "ErroApi",
      status: 404,
      message: "Projeto não encontrado",
    });
  });

  it("usa mensagem padrão PT-BR quando o corpo do erro não é JSON", async () => {
    espionarFetch(new Response("panne", { status: 502 }));

    await expect(api("/api/teste")).rejects.toMatchObject({
      name: "ErroApi",
      status: 502,
      message: "Erro 502 ao chamar /api/teste",
    });
  });
});
