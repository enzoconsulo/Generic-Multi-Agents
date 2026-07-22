import { defineConfig } from "vitest/config";

// Testes da web que não precisam de DOM (ex.: lib/api.ts) rodam em ambiente node —
// Headers/FormData/Response são globais no Node 22+. Se algum teste futuro precisar
// de DOM, adicionar jsdom e sobrescrever o environment por arquivo.
export default defineConfig({
  test: {
    environment: "node",
    include: ["testes/**/*.test.ts"],
  },
});
