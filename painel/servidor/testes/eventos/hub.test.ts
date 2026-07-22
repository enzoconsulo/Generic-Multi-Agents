import { describe, expect, it } from "vitest";
import { HubEventos } from "../../src/eventos/hub.js";
import type { EventoJob } from "../../src/jobs/tipos.js";

function evt(jobId: string): EventoJob {
  return { jobId, tipo: "log", dados: { texto: "x" }, em: new Date().toISOString() };
}

describe("HubEventos — canal SSE único multiplexado", () => {
  it("numera eventos em ordem e entrega a clientes conectados", () => {
    const hub = new HubEventos();
    const recebidos: { id: number; jobId: string }[] = [];
    hub.adicionarCliente((id, e) => recebidos.push({ id, jobId: e.jobId }));

    hub.publicar(evt("a"));
    hub.publicar(evt("b"));

    expect(recebidos).toEqual([
      { id: 1, jobId: "a" },
      { id: 2, jobId: "b" },
    ]);
  });

  it("reenvia o que passou do ultimoId (replay via Last-Event-ID)", () => {
    const hub = new HubEventos();
    hub.publicar(evt("a")); // id 1
    hub.publicar(evt("b")); // id 2
    hub.publicar(evt("c")); // id 3

    const recebidos: number[] = [];
    hub.adicionarCliente((id) => recebidos.push(id), 1);

    expect(recebidos).toEqual([2, 3]);
  });

  it("remover um cliente para as entregas seguintes", () => {
    const hub = new HubEventos();
    const recebidos: number[] = [];
    const remover = hub.adicionarCliente((id) => recebidos.push(id));

    hub.publicar(evt("a"));
    remover();
    hub.publicar(evt("b"));

    expect(recebidos).toEqual([1]);
    expect(hub.totalClientes).toBe(0);
  });

  it("cliente que lança não derruba a publicação para os demais", () => {
    const hub = new HubEventos();
    hub.adicionarCliente(() => {
      throw new Error("socket morto");
    });
    const ok: number[] = [];
    hub.adicionarCliente((id) => ok.push(id));

    expect(() => hub.publicar(evt("a"))).not.toThrow();
    expect(ok).toEqual([1]);
  });

  it("respeita o teto do buffer (replay só do que ainda cabe)", () => {
    const hub = new HubEventos(2); // buffer minúsculo
    hub.publicar(evt("a")); // id 1 (será descartado)
    hub.publicar(evt("b")); // id 2
    hub.publicar(evt("c")); // id 3

    const recebidos: number[] = [];
    hub.adicionarCliente((id) => recebidos.push(id), 0); // quer tudo que houver
    expect(recebidos).toEqual([2, 3]);
  });
});
