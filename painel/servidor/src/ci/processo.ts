import { execFileSync, spawn } from "node:child_process";

/**
 * Execução de um comando de estágio de CI (T-017): spawn via shell (necessário no Windows
 * — `npm` é `npm.cmd`), streaming de stdout/stderr linha a linha, timeout por estágio e
 * encerramento de árvore de processos no cancelamento/timeout.
 *
 * Windows: matar só o processo do shell deixa o `node.exe` filho (lançado pelo npm.cmd)
 * órfão — por isso `taskkill /T` (mata a árvore) em vez de `child.kill()`. POSIX: grupo de
 * processos via `detached` + `kill(-pid)` (ver pesquisa referenciada na tarefa).
 */

export type MotivoEncerramento = "saida" | "timeout" | "cancelado";

export interface ResultadoProcesso {
  codigoSaida: number | null;
  encerradoPor: MotivoEncerramento;
}

export interface OpcoesExecutarComando {
  comando: string;
  cwd: string;
  timeoutMs: number;
  sinal: AbortSignal;
  aoLog: (linha: string, fluxo: "stdout" | "stderr") => void;
}

function encerrarArvore(pid: number): void {
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // Processo já pode ter terminado sozinho entre o timeout/abort e o taskkill.
    }
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Já terminou.
    }
  }
}

/** Quebra um buffer em linhas completas; devolve o restante (linha ainda incompleta). */
function repassarLinhas(
  buffer: string,
  novo: string,
  fluxo: "stdout" | "stderr",
  aoLog: OpcoesExecutarComando["aoLog"],
): string {
  const partes = (buffer + novo).split("\n");
  const resto = partes.pop() ?? "";
  for (const linha of partes) aoLog(linha.replace(/\r$/, ""), fluxo);
  return resto;
}

/**
 * Executa um comando de estágio. Nunca rejeita por código de saída != 0 — devolve o
 * código para o chamador decidir sucesso/falha. Rejeita apenas se o spawn falhar antes
 * de iniciar (ex.: shell ausente).
 */
export function executarComando(opcoes: OpcoesExecutarComando): Promise<ResultadoProcesso> {
  const { comando, cwd, timeoutMs, sinal, aoLog } = opcoes;
  return new Promise((resolvePromise, rejeitar) => {
    if (sinal.aborted) {
      resolvePromise({ codigoSaida: null, encerradoPor: "cancelado" });
      return;
    }

    const filho = spawn(comando, {
      cwd,
      shell: true,
      windowsHide: true,
      detached: process.platform !== "win32",
    });

    let encerradoPor: MotivoEncerramento | null = null;
    let bufferSaida = "";
    let bufferErro = "";
    let assentado = false;

    const cronometro = setTimeout(() => {
      encerradoPor = "timeout";
      if (filho.pid !== undefined) encerrarArvore(filho.pid);
    }, timeoutMs);

    const aoAbortar = () => {
      encerradoPor = "cancelado";
      if (filho.pid !== undefined) encerrarArvore(filho.pid);
    };
    sinal.addEventListener("abort", aoAbortar);

    function limpar(): void {
      clearTimeout(cronometro);
      sinal.removeEventListener("abort", aoAbortar);
    }

    filho.stdout?.setEncoding("utf8").on("data", (pedaco: string) => {
      bufferSaida = repassarLinhas(bufferSaida, pedaco, "stdout", aoLog);
    });
    filho.stderr?.setEncoding("utf8").on("data", (pedaco: string) => {
      bufferErro = repassarLinhas(bufferErro, pedaco, "stderr", aoLog);
    });

    filho.on("error", (erro) => {
      if (assentado) return;
      assentado = true;
      limpar();
      rejeitar(erro);
    });

    filho.on("close", (codigo) => {
      if (assentado) return;
      assentado = true;
      limpar();
      if (bufferSaida !== "") aoLog(bufferSaida, "stdout");
      if (bufferErro !== "") aoLog(bufferErro, "stderr");
      resolvePromise({ codigoSaida: codigo, encerradoPor: encerradoPor ?? "saida" });
    });
  });
}
