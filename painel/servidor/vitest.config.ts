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
  },
});
