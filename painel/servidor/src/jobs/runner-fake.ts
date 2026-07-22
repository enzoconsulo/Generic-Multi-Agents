import { setTimeout as esperar } from "node:timers/promises";
import type { Runner } from "./tipos.js";

export interface OpcoesRunnerFake {
  /** Quantos passos sintéticos emitir (default 3). */
  passos?: number;
  /** Espera entre passos, em ms (default 10). */
  delayMs?: number;
  /** Se definido, o runner lança este erro ao final (simula job que falha). */
  falharCom?: string;
}

/**
 * Runner FAKE para testes (o runner Claude real chega na T-008): emite eventos
 * sintéticos `log` com delays e respeita o AbortSignal — cancelamento no meio de um
 * delay rejeita com AbortError (via node:timers/promises) e o job termina `cancelado`.
 */
export function criarRunnerFake(opcoes: OpcoesRunnerFake = {}): Runner {
  const passos = opcoes.passos ?? 3;
  const delayMs = opcoes.delayMs ?? 10;
  return {
    async executar(job, contexto) {
      for (let passo = 1; passo <= passos; passo++) {
        await esperar(delayMs, undefined, { signal: contexto.sinal });
        contexto.emitir("log", {
          texto: `Passo ${passo}/${passos} do job fake "${job.titulo}"`,
        });
      }
      if (opcoes.falharCom !== undefined) throw new Error(opcoes.falharCom);
      return { passos };
    },
  };
}
