import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Express, Router } from "express";

interface ModuloRota {
  prefixo?: unknown;
  router?: unknown;
}

/**
 * Agregador dinâmico de rotas: carrega todos os arquivos de `src/rotas/`,
 * cada um exportando `{ prefixo, router }`, e monta cada router no app.
 *
 * Convenção do projeto: tarefa nova adiciona ARQUIVO novo em rotas/ — nunca
 * edita código compartilhado (preserva o paralelismo de `areas`).
 */
export async function carregarRotas(app: Express): Promise<string[]> {
  const dirRotas = join(dirname(fileURLToPath(import.meta.url)), "rotas");
  const arquivos = (await readdir(dirRotas))
    .filter((nome) => /\.(ts|js)$/.test(nome))
    .filter((nome) => !nome.endsWith(".d.ts") && !nome.includes(".test."))
    .sort();

  const montadas: string[] = [];
  for (const nome of arquivos) {
    const modulo = (await import(pathToFileURL(join(dirRotas, nome)).href)) as ModuloRota;
    if (typeof modulo.prefixo !== "string" || modulo.router === undefined) {
      console.warn(`[rotas] ${nome} ignorado: não exporta { prefixo, router }`);
      continue;
    }
    app.use(modulo.prefixo, modulo.router as Router);
    montadas.push(`${modulo.prefixo} (${nome})`);
  }
  return montadas;
}
