import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { criarApp } from "../src/app.js";

describe("rota /api/saude", () => {
  it("responde 200 com ok: true e fabricaRaiz absoluta e existente", async () => {
    const app = await criarApp();
    const resposta = await request(app).get("/api/saude");

    expect(resposta.status).toBe(200);
    expect(resposta.headers["content-type"]).toContain("application/json");
    expect(resposta.body.ok).toBe(true);
    expect(typeof resposta.body.fabricaRaiz).toBe("string");
    expect(isAbsolute(resposta.body.fabricaRaiz)).toBe(true);
    expect(existsSync(resposta.body.fabricaRaiz)).toBe(true);
  });

  it("responde 404 em JSON para rota /api desconhecida", async () => {
    const app = await criarApp();
    const resposta = await request(app).get("/api/rota-que-nao-existe");

    expect(resposta.status).toBe(404);
    expect(resposta.headers["content-type"]).toContain("application/json");
    expect(resposta.body.erro).toBeTruthy();
  });
});
