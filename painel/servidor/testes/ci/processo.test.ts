import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executarComando } from "../../src/ci/processo.js";

const DIR = mkdtempSync(join(tmpdir(), "ci-proc-"));

/** Escreve um script Node temporário e devolve o comando `node "<arquivo>"`. */
function script(nome: string, codigo: string): string {
  const caminho = join(DIR, nome);
  writeFileSync(caminho, codigo, "utf8");
  return `node "${caminho}"`;
}

function coletor() {
  const linhas: { texto: string; fluxo: "stdout" | "stderr" }[] = [];
  return { linhas, aoLog: (texto: string, fluxo: "stdout" | "stderr") => linhas.push({ texto, fluxo }) };
}

describe("executarComando", () => {
  it("sucesso: código 0 e stdout linha a linha", async () => {
    const cmd = script("ok.js", "console.log('linha1'); console.log('linha2');");
    const { linhas, aoLog } = coletor();
    const r = await executarComando({
      comando: cmd,
      cwd: DIR,
      timeoutMs: 10000,
      sinal: new AbortController().signal,
      aoLog,
    });
    expect(r).toEqual({ codigoSaida: 0, encerradoPor: "saida" });
    expect(linhas).toEqual([
      { texto: "linha1", fluxo: "stdout" },
      { texto: "linha2", fluxo: "stdout" },
    ]);
  });

  it("falha: código de saída != 0 não rejeita a promessa", async () => {
    const cmd = script("falha.js", "console.error('deu ruim'); process.exit(7);");
    const { linhas, aoLog } = coletor();
    const r = await executarComando({
      comando: cmd,
      cwd: DIR,
      timeoutMs: 10000,
      sinal: new AbortController().signal,
      aoLog,
    });
    expect(r).toEqual({ codigoSaida: 7, encerradoPor: "saida" });
    expect(linhas).toContainEqual({ texto: "deu ruim", fluxo: "stderr" });
  });

  it("timeout: processo que nunca termina é encerrado", async () => {
    const cmd = script("trava.js", "setInterval(() => {}, 1000);");
    const r = await executarComando({
      comando: cmd,
      cwd: DIR,
      timeoutMs: 150,
      sinal: new AbortController().signal,
      aoLog: () => {},
    });
    expect(r.encerradoPor).toBe("timeout");
    expect(r.codigoSaida).not.toBe(0);
  }, 10000);

  it("cancelamento: abort do sinal encerra o processo", async () => {
    const cmd = script("trava2.js", "setInterval(() => {}, 1000);");
    const controlador = new AbortController();
    const promessa = executarComando({
      comando: cmd,
      cwd: DIR,
      timeoutMs: 10000,
      sinal: controlador.signal,
      aoLog: () => {},
    });
    setTimeout(() => controlador.abort(), 100);
    const r = await promessa;
    expect(r.encerradoPor).toBe("cancelado");
  }, 10000);

  it("sinal já abortado antes de iniciar: nem chega a rodar", async () => {
    const controlador = new AbortController();
    controlador.abort();
    const r = await executarComando({
      comando: script("nao-roda.js", "console.log('não deveria aparecer');"),
      cwd: DIR,
      timeoutMs: 10000,
      sinal: controlador.signal,
      aoLog: () => {
        throw new Error("não deveria logar nada");
      },
    });
    expect(r).toEqual({ codigoSaida: null, encerradoPor: "cancelado" });
  });
});
