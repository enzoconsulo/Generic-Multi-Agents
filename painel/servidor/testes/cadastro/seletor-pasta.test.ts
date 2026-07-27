import { describe, expect, it } from "vitest";
import {
  ErroSeletorEmUso,
  ErroSeletorIndisponivel,
  escolherPasta,
} from "../../src/projetos/seletor-pasta.js";

/**
 * Guardas do seletor nativo de pasta. O DIÁLOGO em si não é testável aqui (abrir uma
 * janela e esperar um clique humano trava a suíte), então o abridor é injetado — o que
 * este arquivo cobre é a lógica ao redor: plataforma, cadeado de concorrência e a
 * tradução de "cancelou" para null.
 */
describe("escolherPasta", () => {
  it("fora do Windows: indisponível, com mensagem que aponta a alternativa", async () => {
    await expect(
      escolherPasta({ plataforma: "linux", abrir: async () => "/nunca/chamado" }),
    ).rejects.toThrow(ErroSeletorIndisponivel);

    await expect(
      escolherPasta({ plataforma: "darwin", abrir: async () => null }),
    ).rejects.toThrow(/Cole o caminho/i);
  });

  it("pasta escolhida volta como caminho absoluto", async () => {
    const caminho = await escolherPasta({
      plataforma: "win32",
      abrir: async () => "C:\\dev\\meu-projeto",
    });
    expect(caminho).toBe("C:\\dev\\meu-projeto");
  });

  it("cancelar devolve null (não é erro — o usuário só desistiu)", async () => {
    expect(await escolherPasta({ plataforma: "win32", abrir: async () => null })).toBeNull();
  });

  it("dois seletores ao mesmo tempo: o segundo é recusado", async () => {
    let liberar!: () => void;
    const travado = new Promise<void>((r) => {
      liberar = r;
    });

    const primeiro = escolherPasta({
      plataforma: "win32",
      abrir: async () => {
        await travado;
        return "C:\\primeiro";
      },
    });

    await expect(
      escolherPasta({ plataforma: "win32", abrir: async () => "C:\\segundo" }),
    ).rejects.toThrow(ErroSeletorEmUso);

    liberar();
    expect(await primeiro).toBe("C:\\primeiro");
  });

  it("o cadeado abre mesmo quando o diálogo FALHA (senão o botão travaria para sempre)", async () => {
    await expect(
      escolherPasta({
        plataforma: "win32",
        abrir: async () => {
          throw new Error("powershell sumiu");
        },
      }),
    ).rejects.toThrow(/powershell sumiu/);

    // Segunda chamada tem que funcionar normalmente.
    expect(await escolherPasta({ plataforma: "win32", abrir: async () => "C:\\ok" })).toBe(
      "C:\\ok",
    );
  });
});
