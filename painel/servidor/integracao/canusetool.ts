/**
 * TESTE DE INTEGRAÇÃO PAGO — validação real do `canUseTool` (T-010) com o SDK.
 *
 * NÃO roda no `npm test` (fica fora de `testes/`, que é o include do vitest): gasta a
 * assinatura de verdade e exige Claude Code logado. Rode com `npm run teste:integracao`.
 *
 * O que prova, ponta a ponta e sem falsificar nada:
 *   1. com `permissionMode: "default"`, o SDK REALMENTE chama o callback `canUseTool`
 *      quando o fluxo quer uma ferramenta fora do allowlist;
 *   2. o runner traduz isso numa pendência, o job pausa em `aguardando-input` e a
 *      pendência aparece em `listarInputs()` (o que a UI mostra em "⏸ Aguardando você");
 *   3. responder a pendência DESTRAVA o fluxo, que segue e conclui.
 *
 * Guardas de custo: modelo Haiku, `maxTurns` baixo, prompt mínimo, cwd temporário (sem
 * CLAUDE.md para carregar) e timeout que cancela o job.
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GerenciadorJobs } from "../src/jobs/fila.js";
import { RunnerClaude } from "../src/jobs/claude/runner-claude.js";
import type { EventoJob, Job, Pendencia } from "../src/jobs/tipos.js";

const MODELO = process.env.MODELO_INTEGRACAO ?? "haiku";
const TIMEOUT_MS = 3 * 60_000;
const MARCA = "CANUSETOOL_OK";

function log(...partes: unknown[]): void {
  console.log("[integracao]", ...partes);
}

async function main(): Promise<void> {
  const cwd = mkdtempSync(join(tmpdir(), "canusetool-cwd-"));
  const dirJobs = mkdtempSync(join(tmpdir(), "canusetool-jobs-"));
  // Pasta FORA do cwd da sessão: escrever aqui é o gatilho de permissão que o próprio
  // SDK documenta (`blockedPath` = "caminho fora dos diretórios permitidos"). A 1ª
  // tentativa usava `echo`, que o classificador trata como comando seguro e auto-aprova
  // — o callback nunca era consultado e o teste saía inconclusivo.
  const fora = mkdtempSync(join(tmpdir(), "canusetool-fora-"));
  const alvo = join(fora, "prova.txt");

  const ger = new GerenciadorJobs({ dirJobs, tetoClaude: 1 });
  ger.registrarRunner("claude", new RunnerClaude());

  // O que aconteceu de fato — o relatório final se baseia SÓ nisto.
  const pendenciasVistas: Pendencia[] = [];
  let respondida = false;

  ger.emissor.on("evento", (evento: EventoJob) => {
    if (evento.tipo === "log") {
      const d = evento.dados as { nivel?: string; texto?: string };
      log(`  ${d.nivel ?? "log"}: ${(d.texto ?? "").slice(0, 160)}`);
      return;
    }
    if (evento.tipo === "estado") {
      const d = evento.dados as { para: string };
      log(`estado → ${d.para}`);
      return;
    }
    if (evento.tipo === "input-pendente") {
      const p = evento.dados as Pendencia;
      pendenciasVistas.push(p);
      log("⏸ PENDÊNCIA RECEBIDA:", p.tipo, "|", p.titulo);
      log("   descrição:", p.descricao.slice(0, 200));
      // É aqui que, na UI, o usuário clicaria em "Aprovar".
      setTimeout(() => {
        try {
          ger.responderInput(p.id, { aprovado: true });
          respondida = true;
          log("✓ respondida com APROVADO (simulando o clique no painel)");
        } catch (erro) {
          log("✗ falha ao responder:", erro instanceof Error ? erro.message : erro);
        }
      }, 50);
    }
  });

  const job = ger.criarJob({
    tipo: "claude",
    titulo: "Integração: canUseTool",
    escopo: "global",
    usaClaude: true,
    params: {
      prompt:
        `Use a ferramenta Write para criar o arquivo ${alvo} com exatamente ` +
        `este conteúdo: ${MARCA}\n` +
        `Esse caminho fica FORA do diretório de trabalho, de propósito. ` +
        `Ao terminar, responda apenas: ${MARCA}`,
      cwd,
      modelo: MODELO,
      // O ponto do teste: sem isto o SDK usa bypassPermissions e NUNCA chama canUseTool.
      permissionMode: "default",
      maxTurns: 8,
    },
  });
  log(`job ${job.id} criado (modelo ${MODELO}, cwd temporário)`);

  const final = await aguardarTerminal(ger, job.id, TIMEOUT_MS);

  // ---------------------------------------------------------------- relatório
  const resultado = final.resultado as
    | { custoUsd?: number | null; numTurnos?: number | null; texto?: string }
    | undefined;

  console.log("\n================ RESULTADO ================");
  console.log("estado final ......:", final.estado);
  console.log("pendências criadas :", pendenciasVistas.length);
  console.log("respondida ........:", respondida);
  console.log("sessionId .........:", final.sessionId ?? "(nenhum)");
  console.log("turnos ............:", resultado?.numTurnos ?? "?");
  console.log("CUSTO REAL (USD) ..:", resultado?.custoUsd ?? "(não informado)");
  console.log("texto final .......:", (resultado?.texto ?? final.erro ?? "").slice(0, 300));

  const executouComando = existsSync(alvo);
  const provado = pendenciasVistas.length > 0 && respondida && final.estado === "concluido";

  console.log("\n================ VEREDITO ================");
  if (provado) {
    console.log("✅ PROVADO: o SDK chamou canUseTool, o job pausou em aguardando-input,");
    console.log("   a resposta destravou o fluxo e ele concluiu.");
    console.log(executouComando ? "   (a ferramenta aprovada rodou de fato)" : "");
  } else if (pendenciasVistas.length === 0) {
    console.log("⚠️  INCONCLUSIVO: nenhuma pendência foi criada — o SDK não chamou o");
    console.log("   callback. Causa provável: a ferramenta caiu em algum allowlist, ou");
    console.log("   o permissionMode não teve o efeito esperado nesta versão do SDK.");
    console.log("   NÃO conte isto como validação do canUseTool.");
  } else {
    console.log("❌ FALHOU: houve pendência, mas o fluxo não concluiu como esperado.");
  }

  rmSync(cwd, { recursive: true, force: true });
  rmSync(fora, { recursive: true, force: true });
  rmSync(dirJobs, { recursive: true, force: true });
  process.exit(provado ? 0 : 1);
}

/** Espera o job chegar a um estado terminal; cancela e devolve o que houver no timeout. */
function aguardarTerminal(ger: GerenciadorJobs, jobId: string, timeoutMs: number): Promise<Job> {
  const TERMINAIS = new Set(["concluido", "falhou", "cancelado", "interrompido"]);
  return new Promise((resolver) => {
    const atual = ger.obter(jobId);
    if (atual && TERMINAIS.has(atual.estado)) return resolver(atual);

    const timer = setTimeout(() => {
      log(`timeout de ${timeoutMs}ms — cancelando o job para conter custo`);
      try {
        ger.cancelar(jobId);
      } catch {
        /* já terminou */
      }
    }, timeoutMs);

    ger.emissor.on("evento", (evento: EventoJob) => {
      if (evento.jobId !== jobId || evento.tipo !== "estado") return;
      const d = evento.dados as { para: string; job: Job };
      if (!TERMINAIS.has(d.para)) return;
      clearTimeout(timer);
      resolver(d.job);
    });
  });
}

main().catch((erro: unknown) => {
  console.error("[integracao] erro fatal:", erro);
  process.exit(1);
});
