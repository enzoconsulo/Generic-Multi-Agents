/**
 * Prova o pré-voo pelo CAMINHO REAL: lê o `_gestao/ci.json` do projeto de verdade e roda os
 * comandos declarados. Não gasta modelo.
 *
 * Existe por causa da lição do `captura.mjs --exigir`, escrita no CLAUDE.md da fábrica: um
 * mecanismo com teste, documentação e uso bem-sucedido em outro contexto ainda assim era
 * rejeitado pelo único caminho para o qual foi feito. Terminou o mecanismo? Use-o de verdade.
 *
 *   npx tsx integracao/probe-pre-voo.ts <projeto>
 */
import { conferirServicos, executorReal, lerServicos, servicosNoChao } from "../src/pipeline/pre-voo.js";

const raiz = "C:/Users/enzoconsulo/Documents/Generic-Multi-Agents";
const projeto = process.argv[2] ?? "fabrica-v2";

const servicos = await lerServicos(`${raiz}/projetos/${projeto}`);
console.log(`declarados em ${projeto}:`, servicos.length);
for (const s of servicos) console.log(`  - ${s.nome}: ${s.checar}${s.subir !== undefined ? ` | subir: ${s.subir}` : ""}`);

if (servicos.length === 0) {
  console.log("nenhum serviço declarado — pipeline segue sem pagar nada.");
  process.exit(0);
}

const t0 = Date.now();
const r = await conferirServicos(servicos, executorReal(raiz));
console.log(`\nconferido em ${Date.now() - t0}ms:`);
for (const s of r) {
  console.log(`  ${s.nome}: noAr=${s.noAr} religado=${s.religado}${s.detalhe !== undefined ? `\n    ${s.detalhe.split("\n")[0]}` : ""}`);
}
const chao = servicosNoChao(r);
console.log(`\nveredito: ${chao.length === 0 ? "RODADA PODE COMEÇAR" : `RODADA NÃO COMEÇA (${chao.map((s) => s.nome).join(", ")})`}`);
