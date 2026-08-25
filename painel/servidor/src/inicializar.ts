import { reconciliarResultadosOrfaos } from "./ci/resultados.js";
import { RunnerCi } from "./ci/runner-ci.js";
import { config } from "./config.js";
import { hub } from "./eventos/hub.js";
import { RunnerPipeline } from "./pipeline/runner-pipeline.js";
import { RunnerClaude } from "./jobs/claude/runner-claude.js";
import { obterGerenciador } from "./jobs/instancia.js";
import { GUARDRAILS_PADRAO } from "./jobs/robustez/guardrails.js";
import { Watchdog } from "./jobs/robustez/watchdog.js";
import { RunnerImportar } from "./projetos/runner-importar.js";
import { GerenteResumos } from "./jobs/resumo/gerente-resumos.js";
import { obterPiloto, reiniciarPiloto } from "./jobs/piloto/instancia.js";

/** Watchdog ativo (T-019) — exposto para o encerramento limpo do processo. */
let watchdog: Watchdog | undefined;
let gerenteResumos: GerenteResumos | undefined;

/**
 * Amarra as peças que só valem em produção (não nos testes de rota isolados):
 * registra os runners no gerenciador, liga o hub SSE ao emissor de jobs e sobe a
 * robustez da T-019 (watchdog + publicação do saneamento de boot).
 * Chamado uma vez pelo `index.ts` antes do `listen`. Idempotente.
 */
export function inicializarPainel(): void {
  const gerenciador = obterGerenciador();
  gerenciador.registrarRunner("claude", new RunnerClaude());
  // Pipeline em código (I3): `/trabalhar <projeto>` roda por aqui, sem orquestrador-modelo.
  gerenciador.registrarRunner("pipeline", new RunnerPipeline());
  gerenciador.registrarRunner("importar", new RunnerImportar());
  gerenciador.registrarRunner("ci", new RunnerCi());
  hub.conectar(gerenciador.emissor);

  // ORDEM IMPORTA: o hub precisa estar conectado antes de publicar o saneamento, senão
  // as transições dos jobs órfãos seriam emitidas sem ninguém escutando.
  const saneados = gerenciador.publicarSaneamentoDeBoot();
  if (saneados > 0) {
    console.warn(`[robustez] ${saneados} job(s) pendurados do processo anterior → interrompido`);
  }
  const ciCorrigidos = reconciliarResultadosOrfaos(config.dirDados);
  if (ciCorrigidos > 0) {
    console.warn(`[robustez] histórico de CI reconciliado em ${ciCorrigidos} projeto(s)`);
  }

  watchdog = new Watchdog(gerenciador, { limiteMs: GUARDRAILS_PADRAO.watchdogMs });
  watchdog.iniciar();

  // Resumo dos trechos de agente (T-039): escuta os logs e anexa ao job. Se falhar,
  // o console volta a mostrar o texto cru — nada do fluxo depende disso.
  gerenteResumos = new GerenteResumos(gerenciador);
  gerenteResumos.iniciar();

  // Piloto automático: encadeia rodadas de `/trabalhar` até um critério de parada. Vem
  // DEPOIS do saneamento de boot de propósito — ele precisa que o job da rodada anterior
  // já esteja marcado como interrompido para não o ler como desfecho de rodada.
  obterPiloto().iniciar();
}

/** Encerra o que a inicialização subiu (usado em testes e no shutdown). */
export function encerrarPainel(): void {
  watchdog?.parar();
  watchdog = undefined;
  gerenteResumos?.parar();
  gerenteResumos = undefined;
  reiniciarPiloto();
}
