// Spike T-001 — valida o @anthropic-ai/claude-agent-sdk na maquina do usuario:
//   1. Autenticacao por assinatura (sem ANTHROPIC_API_KEY no ambiente)
//   2. Streaming de mensagens tipadas (system/init antes do result)
//   3. Cancelamento via AbortController (flag --abortar)
//
// Uso:  npm start                  → run completa (prompt trivial, 1 turno)
//       npm start -- --abortar     → aborta apos o primeiro evento recebido
//
// Modelo: alias "fable" por padrao; sobrescreva com SPIKE_MODELO=opus se preciso.

import { query } from "@anthropic-ai/claude-agent-sdk";
import { fileURLToPath } from "node:url";
import path from "node:path";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const abortar = process.argv.includes("--abortar");
const modelo = process.env.SPIKE_MODELO ?? "fable";
const inicio = Date.now();

const t = () => `${((Date.now() - inicio) / 1000).toFixed(1)}s`;

if (process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "[aviso] ANTHROPIC_API_KEY esta presente no ambiente. Este spike valida o " +
      "login por assinatura; remova a variavel para o teste valer de verdade.",
  );
}

console.log(`[${t()}] iniciando spike  modelo=${modelo}  abortar=${abortar}  cwd=${aqui}`);

const abortController = new AbortController();

const q = query({
  prompt: "Responda apenas com a palavra OK",
  options: {
    cwd: aqui, // a propria pasta do spike — NAO a raiz da fabrica
    model: modelo, // headless nao herda o modelo da sessao interativa
    maxTurns: 1,
    permissionMode: "default",
    // Seguranca extra: o spike nao deve editar arquivo nenhum.
    disallowedTools: ["Write", "Edit", "NotebookEdit", "Bash", "PowerShell"],
    abortController,
    // PLANO B (se a auth do binario empacotado do SDK falhar): apontar para o
    // CLI ja logado da maquina. Nesta maquina a instalacao e via npm (nao ha
    // %USERPROFILE%\.local\bin\claude.exe) e o executavel real do pacote global
    // e o binario nativo bin\claude.exe (campo "bin" do package.json do pacote;
    // verificado no disco — NAO existe cli.js):
    // pathToClaudeCodeExecutable:
    //   `${process.env.APPDATA}\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`,
  },
});

let viuInit = false;
let viuResult = false;
let initAntesDoResult = false; // ordem real: init ja tinha chegado quando o result chegou
let jaAbortou = false;
let cancelamentoConfirmado = false;

try {
  for await (const msg of q) {
    if (msg.type === "system" && msg.subtype === "init") {
      viuInit = true;
      console.log(
        `[${t()}] system/init  session_id=${msg.session_id}  modelo=${msg.model}`,
      );
    } else if (msg.type === "assistant") {
      const texto = (msg.message?.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (texto) console.log(`[${t()}] assistant: ${texto}`);
    } else if (msg.type === "result") {
      if (!viuResult) initAntesDoResult = viuInit; // avalia a ORDEM no 1º result
      viuResult = true;
      console.log(
        `[${t()}] result  subtype=${msg.subtype}  is_error=${msg.is_error}  ` +
          `session_id=${msg.session_id}  total_cost_usd=${msg.total_cost_usd}  ` +
          `num_turns=${msg.num_turns}`,
      );
      if (typeof msg.result === "string") {
        console.log(`[${t()}] texto final: ${msg.result}`);
      }
    } else {
      console.log(`[${t()}] evento ${msg.type}${msg.subtype ? "/" + msg.subtype : ""}`);
    }

    if (abortar && !jaAbortou) {
      jaAbortou = true;
      console.log(`[${t()}] --abortar: disparando AbortController agora...`);
      abortController.abort();
    }
  }
} catch (err) {
  if (abortar && (abortController.signal.aborted || err?.name === "AbortError")) {
    cancelamentoConfirmado = true;
    console.log(`[${t()}] cancelamento confirmado (${err?.name ?? "iteracao encerrada"}).`);
  } else {
    console.error(`[${t()}] ERRO inesperado:`, err);
    process.exitCode = 1;
  }
}

if (abortar) {
  if (jaAbortou && !cancelamentoConfirmado) {
    // A iteracao terminou SEM o erro de abort: a run completou antes de o
    // interrupt fazer efeito. O caminho de cancelamento NAO foi exercitado
    // nesta execucao — falhar em vez de parecer ok silenciosamente.
    console.error(
      `[${t()}] FALHA: --abortar disparou, mas a iteracao encerrou sem erro de ` +
        "abort (run completou antes do interrupt). Cancelamento NAO demonstrado.",
    );
    process.exitCode = 1;
  }
  console.log(
    `[${t()}] fim do script (abortado apos primeiro evento=${jaAbortou}, ` +
      `cancelamento confirmado=${cancelamentoConfirmado}). ` +
      "O processo deve encerrar sozinho agora; se demorar >60s, ha handle pendurado.",
  );
} else {
  const ok = viuResult && initAntesDoResult;
  console.log(
    `[${t()}] fim do script  init_antes_do_result=${initAntesDoResult}  result=${viuResult}  ok=${ok}`,
  );
  if (!ok) process.exitCode = 1;
}
