import request from "supertest";
import { describe, expect, it } from "vitest";
import { criarApp } from "../src/app.js";

describe("error handler da API (status do erro respeitado)", () => {
  it("responde 400 (não 500) para JSON malformado no corpo — achado 1 da revisão", async () => {
    const app = await criarApp();
    const resposta = await request(app)
      .post("/api/saude")
      .set("Content-Type", "application/json")
      .send("{invalido");

    expect(resposta.status).toBe(400);
    expect(resposta.headers["content-type"]).toContain("application/json");
    expect(resposta.body.erro).toBe("Requisição inválida (corpo malformado)");
  });

  it("responde 413 para corpo acima do limite do express.json", async () => {
    const app = await criarApp();
    const resposta = await request(app)
      .post("/api/saude")
      .set("Content-Type", "application/json")
      .send(`{"x":"${"a".repeat(150 * 1024)}"}`); // > 100kb (limite default)

    expect(resposta.status).toBe(413);
    expect(resposta.headers["content-type"]).toContain("application/json");
    expect(resposta.body.erro).toBeTruthy();
  });

  it("continua respondendo normalmente após um erro de cliente", async () => {
    const app = await criarApp();
    await request(app)
      .post("/api/saude")
      .set("Content-Type", "application/json")
      .send("{invalido");

    const saude = await request(app).get("/api/saude");
    expect(saude.status).toBe(200);
    expect(saude.body.ok).toBe(true);
  });
});
