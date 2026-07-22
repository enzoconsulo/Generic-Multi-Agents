/**
 * Leitor do estado da fábrica — módulo SOMENTE-LEITURA que transforma os arquivos da
 * fábrica (projetos, tarefas, planos, ideias, logs) em dados tipados.
 *
 * Uso típico: `lerFabrica(config.fabricaRaiz)` para a visão geral e
 * `lerProjeto(config.fabricaRaiz, nome)` para a página de um projeto.
 */
export { lerFabrica, lerProjeto } from "./fabrica.js";
export { faseAtualDoPlano, parsearMarco, parsearPlano } from "./plano.js";
export { lerIdeias, lerLogMaisRecente, parsearIdeia } from "./sistema.js";
export { contarPorStatus, lerTarefas, parsearSecoes, parsearTarefa } from "./tarefas.js";
export * from "./tipos.js";
