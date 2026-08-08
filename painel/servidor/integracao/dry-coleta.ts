/**
 * DRY RUN da coleta de órfãos: lê a tabela de processos REAL e imprime o que SERIA
 * recolhido. Não mata nada. Serve para conferir o adaptador (o comando do PowerShell),
 * que os testes unitários não cobrem — eles exercitam só a decisão pura.
 *
 * uso: npx tsx integracao/dry-coleta.ts [minutosDeJanela]
 */
import {
  listarProcessos,
  escolherOrfaos,
  descendentesDe,
} from "../src/pipeline/coleta-processos.js";

const minutos = Number(process.argv[2] ?? "60");
const ps = await listarProcessos();

console.log(`processos lidos: ${ps.length}`);
console.log(
  "amostra:",
  ps.slice(0, 3).map((p) => `${p.pid}<-${p.ppid} ${p.nome} ${new Date(p.criadoEm).toISOString().slice(11, 19)}`),
);

const painel = ps.find((p) => p.comando.includes("servidor/dist/index.js"));
console.log("painel encontrado:", painel !== undefined ? `pid ${painel.pid}` : "NÃO (nenhum rodando)");

// Pior caso deliberado: finge que TUDO que existe hoje foi observado como descendente do
// painel. Se mesmo assim a lista sair vazia, é porque as outras cintas (órfão, janela,
// família) seguram sozinhas. Serve para medir o quanto a prova de propriedade está contendo.
const comoSeTudoFosseNosso = new Set(ps.map((x) => x.pid));
const alvoPiorCaso = escolherOrfaos(ps, {
  painelPid: painel?.pid ?? -1,
  desdeMs: Date.now() - minutos * 60_000,
  observados: comoSeTudoFosseNosso,
});

// Caso REAL: só o que de fato pende do painel agora.
const alvo = escolherOrfaos(ps, {
  painelPid: painel?.pid ?? -1,
  desdeMs: Date.now() - minutos * 60_000,
  observados: descendentesDe(ps, painel?.pid ?? -1),
});

console.log(
  `\n[pior caso, ignorando a prova de propriedade] seria recolhido: ${alvoPiorCaso.length}`,
);
for (const a of alvoPiorCaso) {
  console.log(`  ! ${a.nome} pid=${a.pid} :: ${a.comando.slice(0, 70)}`);
}

console.log(`\nSERIA RECOLHIDO em janela de ${minutos}min (${alvo.length}):`);
for (const a of alvo) {
  console.log(`  ${a.nome} pid=${a.pid} ppid=${a.ppid} :: ${a.comando.slice(0, 70)}`);
}
if (alvo.length === 0) console.log("  (nada — máquina limpa)");
