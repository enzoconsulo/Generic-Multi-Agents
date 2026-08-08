/**
 * GUARDA DE PROCESSOS — o agente não pode matar o painel que o está executando.
 *
 * POR QUE EXISTE. O painel é um `node.exe`, e é ele quem roda os agentes. Um agente que
 * topa com `EADDRINUSE` e "resolve" com `taskkill /IM node.exe`, `Stop-Process -Name node`
 * ou "mata quem está na porta" derruba o próprio painel: o job em voo morre, o trabalho já
 * pago se perde e não sobra rastro — kill de processo não é exceção de JS nem falha do
 * Windows, então nenhum dos dois registros do painel captura. Foi a hipótese que explicava
 * todas as evidências das quedas de 08/08 (sem `quedas.log`, sem evento de falha, com um
 * servidor do projeto órfão de pé na porta 3000).
 *
 * POR QUE COMO HOOK, e não como pedido no prompt. O despacho do pipeline roda em
 * `permissionMode: "bypassPermissions"` — não há `canUseTool` nesse caminho, então TODO
 * comando passava sem conferência. O `sdk.d.ts` é explícito: *"PreToolUse hook denies
 * bypass canUseTool"*, ou seja, o hook decide mesmo sob bypass. Doutrina no CLAUDE.md do
 * projeto ajuda; hook é o que TRAVA. Mesma lição da família `run_in_background`: proteção
 * que depende de o modelo lembrar não é proteção.
 *
 * ESCOPO DELIBERADAMENTE ESTREITO. Só recusa o que mata processo por NOME/imagem ou por
 * porta — a forma que atinge terceiros. Matar por PID continua liberado: é como o agente
 * encerra algo que ele mesmo subiu, e é o que a doutrina manda fazer.
 */

/** Decisão da guarda sobre um comando de shell. */
export interface VeredictoGuarda {
  /** `true` quando o comando pode rodar. */
  permitido: boolean;
  /** Motivo devolvido ao agente quando recusado — precisa ensinar a saída correta. */
  motivo?: string;
}

/**
 * Padrões que matam processo por NOME/imagem, ou que descobrem um PID por porta para
 * matá-lo em seguida. Cobrem as três shells que a fábrica encontra no Windows (cmd,
 * PowerShell, Git Bash).
 */
const PADROES_PROIBIDOS: readonly { re: RegExp; o_que: string }[] = [
  // taskkill /IM <imagem> — mata TODA instância daquele executável.
  { re: /\btaskkill\b[^\n]*(\/|-{1,2})im\b/i, o_que: "taskkill por nome de imagem (/IM)" },
  // Stop-Process -Name / Get-Process node | Stop-Process
  { re: /\bstop-process\b[^\n]*(-name|\bnode\b)/i, o_que: "Stop-Process por nome" },
  { re: /\bget-process\b[^\n]*\|[^\n]*\bstop-process\b/i, o_que: "Get-Process | Stop-Process" },
  // pkill / killall — POSIX, chegam via Git Bash.
  { re: /\bpkill\b/i, o_que: "pkill" },
  { re: /\bkillall\b/i, o_que: "killall" },
  // `kill $(...)`/`kill \`...\`` — PID vindo de uma busca, tipicamente por porta ou nome.
  { re: /\bkill\b[^\n]*(\$\(|`)/i, o_que: "kill com PID vindo de substituição de comando" },
  // Descobrir o dono de uma porta para matar (netstat|findstr + taskkill, lsof -t, fuser).
  { re: /\b(netstat|lsof|fuser|Get-NetTCPConnection)\b[^\n]*\b(kill|taskkill|Stop-Process)\b/i,
    o_que: "descobrir o dono de uma porta para matá-lo" },
  // wmic process where name=... delete
  { re: /\bwmic\b[^\n]*\bprocess\b[^\n]*\bdelete\b/i, o_que: "wmic process ... delete" },
];

/** Como o agente DEVE resolver a situação que o levaria a matar processo. */
const SAIDA_CORRETA =
  "Porta ocupada NÃO se resolve matando processo: suba noutra porta (ex.: `PORT=3001 npm start`)." +
  " Para conferir que o servidor sobe, use a suíte (`npm test`), que já usa porta efêmera." +
  " Se precisar encerrar algo que VOCÊ subiu, mate pelo PID daquele processo e só dele.";

/**
 * Avalia um comando de shell antes de ele rodar.
 *
 * Conservador por construção: na dúvida PERMITE. A guarda existe para barrar uma falha
 * catastrófica e conhecida, não para virar um segundo classificador de segurança — recusar
 * demais quebraria tarefas legítimas, e isso custaria ciclos de retrabalho.
 */
export function avaliarComandoDeProcesso(comando: string): VeredictoGuarda {
  const bruto = (comando ?? "").trim();
  if (bruto === "") return { permitido: true };

  for (const { re, o_que } of PADROES_PROIBIDOS) {
    if (re.test(bruto)) {
      return {
        permitido: false,
        motivo:
          `Comando recusado pela guarda de processos da fábrica: ${o_que}. ` +
          "O PAINEL que está executando você é um processo `node` desta máquina — matar node " +
          "por nome (ou matar o dono de uma porta) derruba o painel no meio do job e destrói o " +
          `trabalho de todos os agentes em voo. ${SAIDA_CORRETA}`,
      };
    }
  }
  return { permitido: true };
}

/** Extrai o texto do comando de um `tool_input` de Bash/PowerShell, seja qual for a shell. */
export function comandoDoToolInput(entrada: unknown): string {
  if (entrada === null || typeof entrada !== "object") return "";
  const c = (entrada as { command?: unknown }).command;
  return typeof c === "string" ? c : "";
}
