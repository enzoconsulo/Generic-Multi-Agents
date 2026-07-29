/**
 * Mede o LEITOR da fábrica contra o disco de verdade. **Não gasta assinatura** (ao
 * contrário dos outros scripts desta pasta) — está aqui só por precisar de tsx e da
 * fábrica real, o que o tiraria do `npm test` de qualquer jeito.
 *
 *   npx tsx integracao/bench-leitor.ts
 *
 * O disco é OneDrive (armadilha registrada no CLAUDE.md: I/O lento e intermitente), então
 * o custo aqui é dominado por LATÊNCIA POR ARQUIVO, não por CPU. É a medição que diz se
 * vale paralelizar leitura — e que impede "otimizar" no escuro.
 *
 * Aquece antes de medir: a primeira leitura mede o cache frio do Windows, não o código.
 */
import { lerFabrica, lerProjeto } from "../src/fabrica/fabrica.js";
import { config } from "../src/config.js";

const raiz = config.fabricaRaiz;

export async function medir(
  nome: string,
  fn: () => Promise<unknown>,
  n = 9,
): Promise<number> {
  await fn();
  const tempos: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = process.hrtime.bigint();
    await fn();
    tempos.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  tempos.sort((a, b) => a - b);
  const mediana = tempos[Math.floor(n / 2)]!;
  console.log(
    `${nome.padEnd(32)} mediana ${mediana.toFixed(1).padStart(7)} ms   ` +
      `min ${tempos[0]!.toFixed(1)}  max ${tempos[n - 1]!.toFixed(1)}`,
  );
  return mediana;
}

if (process.argv[1]?.includes("bench-leitor")) {
  console.log(`raiz: ${raiz}\n`);
  await medir("lerFabrica (/api/fabrica)", () => lerFabrica(raiz));
  const projetos = (await lerFabrica(raiz)).projetos.map((p) => p.nome);
  for (const nome of projetos) {
    await medir(`lerProjeto (${nome})`, () => lerProjeto(raiz, nome));
  }
  console.log(`\nprojetos: ${projetos.length}`);
}
