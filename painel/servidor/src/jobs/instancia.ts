import { join } from "node:path";
import { config } from "../config.js";
import { GerenciadorJobs, type OpcoesGerenciador } from "./fila.js";

/**
 * Instância compartilhada do gerenciador de jobs. As rotas SEMPRE a resolvem via
 * `obterGerenciador()` a cada requisição (nunca guardam referência), para que
 * `reiniciarGerenciador()` — usado nos testes para simular reinício do processo —
 * troque a instância sob os pés delas.
 */

let gerenciador: GerenciadorJobs | undefined;

export function obterGerenciador(): GerenciadorJobs {
  gerenciador ??= new GerenciadorJobs(opcoesPadrao());
  return gerenciador;
}

/**
 * Descarta a instância atual e cria outra (runners precisam ser registrados de novo).
 * Produção não usa; testes simulam "processo reiniciou" com isto.
 */
export function reiniciarGerenciador(opcoes?: OpcoesGerenciador): GerenciadorJobs {
  gerenciador = new GerenciadorJobs(opcoes ?? opcoesPadrao());
  return gerenciador;
}

function opcoesPadrao(): OpcoesGerenciador {
  return {
    dirJobs: join(config.dirDados, "jobs"),
    tetoClaude: config.tetoJobsClaude,
  };
}
