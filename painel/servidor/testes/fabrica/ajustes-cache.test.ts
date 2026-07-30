import { describe, expect, it, vi } from "vitest";
import { comCache } from "../../src/fabrica/ajustes.js";

/**
 * T-045: `/api/ajustes` gastava ~200 ms MEDIDOS por abertura da aba, quase tudo spawn de
 * processo no Windows (`git config` ×3, `gh` ×2, `claude --version`). O que eles respondem
 * quase nunca muda, então o ganho vem de não perguntar de novo — sem deixar de perceber
 * um login feito fora do painel.
 */
describe("comCache — diagnóstico caro que quase nunca muda", () => {
  it("serve do cache dentro do TTL e volta a ler depois dele", async () => {
    vi.useFakeTimers();
    try {
      let chamadas = 0;
      const ler = comCache(30_000, () => Promise.resolve(++chamadas));

      expect(await ler()).toBe(1);
      expect(await ler()).toBe(1);
      vi.advanceTimersByTime(29_000);
      expect(await ler()).toBe(1);
      expect(chamadas).toBe(1);

      vi.advanceTimersByTime(2_000);
      expect(await ler()).toBe(2);
      expect(chamadas).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("duas chamadas simultâneas disparam UM leitura só (duas abas abrindo juntas)", async () => {
    let chamadas = 0;
    let liberar: (v: number) => void = () => {};
    const ler = comCache(30_000, () => {
      chamadas++;
      return new Promise<number>((r) => {
        liberar = r;
      });
    });

    const a = ler();
    const b = ler();
    liberar(7);

    expect(await a).toBe(7);
    expect(await b).toBe(7);
    expect(chamadas).toBe(1);
  });

  it("invalidar força a próxima leitura — é o que a escrita do painel usa", async () => {
    let chamadas = 0;
    const ler = comCache(30_000, () => Promise.resolve(++chamadas));

    expect(await ler()).toBe(1);
    ler.invalidar();
    expect(await ler()).toBe(2);
  });

  it("leitura que falha não é cacheada como sucesso", async () => {
    let chamadas = 0;
    const ler = comCache(30_000, () => {
      chamadas++;
      return chamadas === 1 ? Promise.reject(new Error("git fora")) : Promise.resolve("ok");
    });

    await expect(ler()).rejects.toThrow("git fora");
    // Sem isto, uma falha transitória congelaria o diagnóstico errado por 30 s.
    expect(await ler()).toBe("ok");
  });
});
