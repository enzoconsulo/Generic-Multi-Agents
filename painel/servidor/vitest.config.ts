import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["testes/**/*.test.ts"],
    // Repo vive sob OneDrive: I/O real (git, cópia de arquivos, npm) sob a suíte inteira
    // em paralelo pode espicaçar bem além do default de 5s (achado do T-007, recorrente
    // nos testes de importação/CI que chamam processos de verdade — DECISOES.md
    // 2026-07-21 e 2026-07-27). Timeout individual por teste só quando 15s não bastar.
    testTimeout: 15000,
    /**
     * SEM paralelismo entre arquivos, de propósito.
     *
     * Esta suíte sobe MUITOS processos filhos de verdade (CI roda comandos, importação
     * chama `git`, o executor de processo testa timeout e kill de árvore). Com o pool
     * paralelo, o IPC do vitest saturava e a corrida morria com
     * `ERR_IPC_CHANNEL_CLOSED` / "Channel closed" — três vezes nesta máquina, inclusive
     * com nada mais rodando. O erro parece bug do código e não é: em série, 209/209
     * passam.
     *
     * Custo: ~54s em vez de ~30s. Suíte que falha sozinha vale menos que 20 segundos.
     */
    fileParallelism: false,
  },
});
