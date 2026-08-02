/**
 * RODA O PIPELINE DE VERDADE — gasta a assinatura.
 *
 * Irmão de `simular-pipeline.ts`, com o SDK REAL no lugar do falso. Existe para exercitar o
 * caminho novo sem depender de ter o painel no ar, e para o log sair no terminal em vez de
 * ficar só no job.
 *
 * USO:  npx tsx integracao/rodar-pipeline.ts <projeto> --teto=6
 *
 * ESCREVE DE VERDADE no projeto (status, commits, PLANO.md). Confira `git status` antes:
 * o motor commita a gestão no fim, e árvore suja de antes vira parte desse commit.
 */
import { resolve } from "node:path";
import { RunnerPipeline } from "../src/pipeline/runner-pipeline.js";
import type { ContextoExecucao, Job } from "../src/jobs/tipos.js";

const argv = process.argv.slice(2);
const projeto = argv.find((a) => !a.startsWith("--")) ?? "";
const teto = Number(argv.find((a) => a.startsWith("--teto="))?.split("=")[1] ?? "6");
const modelo = argv.find((a) => a.startsWith("--modelo="))?.split("=")[1] ?? "sonnet";
const raiz = resolve(process.cwd(), "..", "..");

if (projeto === "") {
  console.error("uso: npx tsx integracao/rodar-pipeline.ts <projeto> [--teto=6] [--modelo=sonnet]");
  process.exit(1);
}

const controlador = new AbortController();
process.on("SIGINT", () => {
  console.log("\n[interrompido — abortando o fluxo]");
  controlador.abort();
});

const ctx: ContextoExecucao = {
  emitir: (tipo, dados) => {
    if (tipo !== "log") return;
    const d = dados as { nivel: string; texto: string };
    const hora = new Date().toISOString().slice(11, 19);
    if (d.nivel === "ferramenta") return; // ruído demais no terminal
    console.log(`${hora} [${d.nivel}] ${d.texto}`);
  },
  sinal: controlador.signal,
  pedirInput: async () => ({}),
  anotar: () => {},
};

const job: Job = {
  id: `real-${Date.now()}`,
  tipo: "pipeline",
  titulo: `/trabalhar ${projeto}`,
  escopo: `projeto:${projeto}`,
  usaClaude: true,
  params: { raiz, projeto, modelo, reforco: "opus", tetoUsd: teto },
  estado: "executando",
  criadoEm: new Date().toISOString(),
};

console.log(`\n=== RODADA REAL — ${projeto} · modelo ${modelo} · teto US$ ${teto.toFixed(2)} ===\n`);
const inicio = Date.now();
const r = await new RunnerPipeline().executar(job, ctx);
const min = ((Date.now() - inicio) / 60000).toFixed(1);

console.log(`\n=== FIM (${min} min) ===\n${r.texto}\n`);
