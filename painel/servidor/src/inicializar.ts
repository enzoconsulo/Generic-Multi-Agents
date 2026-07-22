import { hub } from "./eventos/hub.js";
import { RunnerClaude } from "./jobs/claude/runner-claude.js";
import { obterGerenciador } from "./jobs/instancia.js";

/**
 * Amarra as peças que só valem em produção (não nos testes de rota isolados):
 * registra o runner "claude" no gerenciador e liga o hub SSE ao emissor de jobs.
 * Chamado uma vez pelo `index.ts` antes do `listen`. Idempotente.
 */
export function inicializarPainel(): void {
  const gerenciador = obterGerenciador();
  gerenciador.registrarRunner("claude", new RunnerClaude());
  hub.conectar(gerenciador.emissor);
}
