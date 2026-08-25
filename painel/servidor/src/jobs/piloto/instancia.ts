import { join } from "node:path";
import { config, resolverEstrategia } from "../../config.js";
import { montarJobAcao } from "../../acoes/acoes.js";
import type { NovoJob } from "../fila.js";
import { obterGerenciador } from "../instancia.js";
import type { EstadoPiloto } from "./decisao.js";
import { Piloto } from "./piloto.js";

/**
 * Instância compartilhada do piloto e a montagem da rodada REAL.
 *
 * Fica separada de `piloto.ts` para que a classe não importe `config.ts` — que lê env na
 * carga do módulo — e os testes possam exercitar o laço inteiro sem raiz de fábrica nem
 * estratégia configurada. Mesma divisão de `jobs/instancia.ts`.
 */

let piloto: Piloto | undefined;

export function obterPiloto(): Piloto {
  piloto ??= new Piloto(obterGerenciador(), {
    arquivo: join(config.dirDados, "piloto.json"),
    montarRodada: montarRodada,
  });
  return piloto;
}

/** Descarta a instância (testes que simulam reinício do processo). */
export function reiniciarPiloto(): void {
  piloto?.parar();
  piloto = undefined;
}

/**
 * A rodada do piloto é EXATAMENTE o que o botão "Trabalhar neste projeto" dispara —
 * `montarJobAcao` com um projeto no argumento, o que força o pipeline em código
 * (`usaPipelineEmCodigo`). Nada de caminho paralelo: um segundo jeito de montar a mesma
 * rodada seria uma segunda fonte de verdade sobre teto, watchdog e escopo de lock.
 */
export function montarRodada(estado: EstadoPiloto): NovoJob {
  const estrategia = resolverEstrategia(estado.estrategia);
  if (estrategia === undefined) {
    throw new Error(`Estratégia de modelo inválida no piloto: "${estado.estrategia}".`);
  }
  return montarJobAcao(
    {
      id: "trabalhar",
      argumentos: estado.projeto,
      modelo: estrategia.modelo,
      fallback: estrategia.fallback,
      reforco: estrategia.reforco,
      motor: "codigo",
      ...(estado.tetoUsdPorRodada !== null ? { tetoUsd: estado.tetoUsdPorRodada } : {}),
    },
    config.fabricaRaiz,
  );
}
