import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { encerrarArvore } from "../ci/processo.js";

const exec = promisify(execFile);

/**
 * COLETA DE ÓRFÃOS — recolhe os processos que os agentes deixam de pé.
 *
 * O PROBLEMA, medido em rodada real: um agente sobe `npm start` para tirar a evidência
 * visual, a etapa termina, o processo `claude` sai — e o servidor continua vivo para sempre,
 * porque a partir daí ninguém mais o conhece. Um por rodada, 51 MB cada, numa máquina que
 * opera com ~400 MB livres. Os órfãos ainda seguram portas, o que faz o agente seguinte
 * topar com `EADDRINUSE` — e foi tentando "resolver" isso que um agente derrubou o painel.
 *
 * POR QUE ÓRFÃO É O CRITÉRIO CERTO, e não "descendente da etapa". Quando o `claude` morre,
 * o que ele deixou fica com o pai MORTO: a cadeia até o painel se rompe, então varrer a
 * árvore viva do painel depois do fim não acha nada. Já a marca de órfão sobrevive — e ela
 * é justamente a definição de lixo. Isso dá, de graça, a propriedade que torna a coleta
 * segura com jobs em PARALELO: descendente VIVO do painel nunca é tocado, então o agente de
 * outro job jamais entra na conta. Só se recolhe o que já não é de ninguém.
 *
 * As três cintas de segurança, porque isto mata processo de verdade:
 *  1. órfão (pai morto) — nunca alcança o painel por pais vivos;
 *  2. nascido DEPOIS do início do job — não toca em nada que já existia antes;
 *  3. da família de shell/runtime que os agentes usam — não é varredura geral da máquina.
 */

/** Um processo vivo, no mínimo que a decisão precisa. */
export interface ProcessoVivo {
  pid: number;
  ppid: number;
  /** Nome do executável, ex.: `node.exe`. */
  nome: string;
  /** Instante de criação, em ms desde a época. */
  criadoEm: number;
  comando: string;
}

/**
 * Executáveis que os agentes usam para rodar comando. Fora desta lista nada é recolhido —
 * a coleta não é uma faxina da máquina, é a limpeza do que a fábrica mesmo lançou.
 */
export const FAMILIA_AGENTE: ReadonlySet<string> = new Set([
  "node.exe", "node",
  "npm.exe", "npm",
  "cmd.exe",
  "bash.exe", "bash", "sh",
  "powershell.exe", "pwsh.exe", "pwsh",
  "python.exe", "python", "python3",
  "deno.exe", "deno", "bun.exe", "bun",
]);

export interface CriterioColeta {
  /** PID do painel: ele e tudo que ainda pende dele são intocáveis. */
  painelPid: number;
  /** Só recolhe processo nascido a partir daqui (início do job), em ms. */
  desdeMs: number;
  /**
   * PIDs que foram OBSERVADOS pendurados no painel enquanto o job rodava — a prova de que
   * saíram da fábrica, e não do usuário.
   *
   * Sem isto a coleta era insegura, e o dry-run provou na hora: com o critério "órfão +
   * nascido na janela", um comando que o PRÓPRIO usuário rodou no terminal aparecia como
   * alvo, porque o shell que o lançou já tinha saído e o pai constava morto. Órfão é sinal
   * de abandono, não de propriedade — as duas coisas juntas é que autorizam matar.
   */
  observados: ReadonlySet<number>;
}

/**
 * O pai está REALMENTE vivo? PID é reciclado pelo sistema, então "existe um processo com
 * esse pid" não basta: se o suposto pai nasceu DEPOIS do filho, ele é outro processo que
 * herdou o número, e o filho é órfão. Sem esta checagem um órfão pode se disfarçar de
 * processo bem-parentado — e, pior, uma árvore viva pode parecer órfã.
 */
function paiVivo(p: ProcessoVivo, porPid: Map<number, ProcessoVivo>): ProcessoVivo | null {
  const pai = porPid.get(p.ppid);
  if (pai === undefined) return null;
  return pai.criadoEm <= p.criadoEm ? pai : null;
}

/** O processo alcança o painel subindo por pais VIVOS? Então está em uso — não se toca. */
function alcancaPainel(
  p: ProcessoVivo,
  porPid: Map<number, ProcessoVivo>,
  painelPid: number,
): boolean {
  const vistos = new Set<number>();
  let atual: ProcessoVivo | null = p;
  while (atual !== null) {
    if (atual.pid === painelPid) return true;
    if (vistos.has(atual.pid)) return false; // ciclo: defensivo, não deveria existir
    vistos.add(atual.pid);
    atual = paiVivo(atual, porPid);
  }
  return false;
}

/**
 * Decide QUEM recolher. Função pura: é onde mora todo o julgamento, e por isso é ela que os
 * testes exercitam — sem matar processo nenhum.
 *
 * Devolve as RAÍZES das árvores órfãs. Quem mata usa kill de árvore, então os descendentes
 * vêm junto e não precisam ser listados (nem podem ser mortos antes do pai, sob risco de
 * virarem órfãos de segunda geração).
 */
export function escolherOrfaos(
  processos: readonly ProcessoVivo[],
  criterio: CriterioColeta,
): ProcessoVivo[] {
  const porPid = new Map<number, ProcessoVivo>(processos.map((p) => [p.pid, p]));
  const escolhidos: ProcessoVivo[] = [];

  for (const p of processos) {
    if (p.pid === criterio.painelPid) continue;
    // PROPRIEDADE: só o que a fábrica lançou. Sem esta linha, comando do usuário cujo shell
    // lançador já saiu vira alvo — aconteceu no dry-run contra a máquina real.
    if (!criterio.observados.has(p.pid)) continue;
    if (p.criadoEm < criterio.desdeMs) continue;
    if (!FAMILIA_AGENTE.has(p.nome.toLowerCase())) continue;
    /**
     * ABANDONO — e a prova é a CADEIA INTEIRA, não o pai imediato (T-066).
     *
     * Aqui havia, antes desta linha, um gate `if (paiVivo(p) !== null) continue`: pai vivo,
     * processo poupado. Isso olha UM nível, e abandono é propriedade da cadeia toda. O caso
     * que escapou (rodada `c080b98c`, ~106 MB vivos horas depois do job): um `npm start` de
     * agente cujo pai — um `cmd.exe` — continuava vivo, mas era ELE MESMO um órfão, porque o
     * `claude` da etapa que os lançou já tinha morrido. Pai vivo, avô morto: o gate barrava, e
     * a caminhada que teria pego o caso nunca era executada.
     *
     * Trocar o gate pela caminhada é mais SEGURO, não menos, e é o ponto todo: "alcança o
     * painel por pais vivos" é exatamente "há um job de pé usando isto". Trabalho vivo de job
     * paralelo continua pendurado no painel e segue intocável; o que se solta da árvore vira
     * recolhível mesmo que um nível intermediário tenha sobrevivido.
     */
    if (alcancaPainel(p, porPid, criterio.painelPid)) continue;
    escolhidos.push(p);
  }
  // Só as RAÍZES: quem mata usa kill de ÁRVORE, então descendente escolhido junto com o
  // ancestral seria morto duas vezes e contado duas vezes no relatório.
  //
  // A subida usa `paiVivo`, não o `ppid` cru — e o teste do pid reciclado pegou isto na hora:
  // um "pai" que nasceu DEPOIS do filho não é pai, o kill de árvore dele não leva o filho
  // junto, e filtrar por parentesco aparente descartaria um órfão de verdade. A noção de
  // parentesco tem de ser a MESMA em todo o módulo, ou as duas metades discordam.
  const escolhidosPorPid = new Set(escolhidos.map((p) => p.pid));
  return escolhidos.filter((p) => {
    const vistos = new Set<number>([p.pid]);
    let atual = paiVivo(p, porPid);
    while (atual !== null && !vistos.has(atual.pid)) {
      if (escolhidosPorPid.has(atual.pid)) return false;
      vistos.add(atual.pid);
      atual = paiVivo(atual, porPid);
    }
    return true;
  });
}

/** Lê a tabela de processos do sistema. Nunca lança: sem lista, não se recolhe nada. */
export async function listarProcessos(): Promise<ProcessoVivo[]> {
  try {
    if (process.platform === "win32") {
      // Campos separados por `|`, com o comando POR ÚLTIMO: só ele pode conter o separador.
      const { stdout } = await exec(
        "powershell",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Get-CimInstance Win32_Process | ForEach-Object { " +
            "'{0}|{1}|{2}|{3}|{4}' -f $_.ProcessId, $_.ParentProcessId, $_.Name, " +
            "([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds(), $_.CommandLine }",
        ],
        { maxBuffer: 16 * 1024 * 1024, windowsHide: true, timeout: 30_000 },
      );
      return analisarLinhas(stdout);
    }
    const { stdout } = await exec("ps", ["-eo", "pid=,ppid=,lstart=,comm=,args="], {
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30_000,
    });
    return analisarPosix(stdout);
  } catch {
    return [];
  }
}

/** Formato do Windows: `pid|ppid|nome|criadoEmMs|comando`. */
export function analisarLinhas(saida: string): ProcessoVivo[] {
  const fora: ProcessoVivo[] = [];
  for (const linha of (saida ?? "").split(/\r?\n/)) {
    if (linha.trim() === "") continue;
    const partes = linha.split("|");
    if (partes.length < 4) continue;
    const pid = Number(partes[0]);
    const ppid = Number(partes[1]);
    const criadoEm = Number(partes[3]);
    if (!Number.isFinite(pid) || !Number.isFinite(ppid) || !Number.isFinite(criadoEm)) continue;
    fora.push({
      pid,
      ppid,
      nome: (partes[2] ?? "").trim(),
      criadoEm,
      comando: partes.slice(4).join("|").trim(),
    });
  }
  return fora;
}

/** Formato POSIX do `ps` — a fábrica roda no Windows, mas o painel não deve travar por isso. */
function analisarPosix(saida: string): ProcessoVivo[] {
  const fora: ProcessoVivo[] = [];
  for (const linha of (saida ?? "").split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.{24})\s+(\S+)\s*(.*)$/.exec(linha);
    if (m === null) continue;
    const criadoEm = Date.parse(m[3] ?? "");
    fora.push({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      nome: (m[4] ?? "").split("/").pop() ?? "",
      criadoEm: Number.isFinite(criadoEm) ? criadoEm : 0,
      comando: m[5] ?? "",
    });
  }
  return fora;
}

/** Descendentes VIVOS do painel, agora. Pura — os testes exercitam sem tocar no sistema. */
export function descendentesDe(
  processos: readonly ProcessoVivo[],
  painelPid: number,
): Set<number> {
  const porPid = new Map<number, ProcessoVivo>(processos.map((p) => [p.pid, p]));
  const fora = new Set<number>();
  for (const p of processos) {
    if (p.pid === painelPid) continue;
    if (alcancaPainel(p, porPid, painelPid)) fora.add(p.pid);
  }
  return fora;
}

/**
 * Anota, enquanto o job roda, tudo que passou pendurado no painel — é a PROVA DE PROPRIEDADE
 * que a coleta exige.
 *
 * Precisa ser amostrado durante a execução porque a prova é perecível: quando o processo
 * `claude` da etapa termina, o que ele deixou fica com o pai morto e a cadeia até o painel
 * se rompe. Depois disso não há como saber se aquele `node server/index.js` saiu da fábrica
 * ou do usuário — e é justamente essa dúvida que torna matar perigoso.
 *
 * 30s é o mesmo compasso do pulso de vida: uma leitura da tabela de processos custa ~300ms,
 * então o custo some no perfil de um job que dura minutos, e nenhuma etapa real termina em
 * menos de 30s sem deixar rastro na amostra seguinte.
 */
export class RastreadorDescendentes {
  private readonly vistos = new Set<number>();
  private temporizador: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly painelPid: number,
    private readonly intervaloMs = 30_000,
  ) {}

  /** PIDs observados até agora como descendentes do painel. */
  get observados(): ReadonlySet<number> {
    return this.vistos;
  }

  async amostrar(): Promise<void> {
    for (const pid of descendentesDe(await listarProcessos(), this.painelPid)) {
      this.vistos.add(pid);
    }
  }

  iniciar(): void {
    if (this.temporizador !== undefined) return;
    void this.amostrar();
    // `unref` para a amostragem jamais segurar o processo do painel vivo sozinho.
    this.temporizador = setInterval(() => void this.amostrar(), this.intervaloMs);
    this.temporizador.unref?.();
  }

  parar(): void {
    if (this.temporizador !== undefined) clearInterval(this.temporizador);
    this.temporizador = undefined;
  }
}

export interface RelatorioColeta {
  /** Quantos processos-raiz foram encerrados. */
  recolhidos: number;
  /** Descrição curta de cada um, para o log da rodada. */
  detalhes: string[];
}

/**
 * Recolhe os órfãos. Chamado no FIM do job, quando não há mais etapa desta rodada em voo.
 * Nunca lança: coleta de lixo não pode derrubar o fechamento de uma rodada que deu certo.
 */
export async function coletarOrfaos(criterio: CriterioColeta): Promise<RelatorioColeta> {
  try {
    const orfaos = escolherOrfaos(await listarProcessos(), criterio);
    const detalhes: string[] = [];
    for (const o of orfaos) {
      // O comando entra no relatório cortado: é ele que identifica o culpado (`npm start`)
      // sem transformar o log numa parede de texto.
      detalhes.push(`${o.nome} (pid ${o.pid}): ${o.comando.slice(0, 80)}`);
      encerrarArvore(o.pid);
    }
    return { recolhidos: orfaos.length, detalhes };
  } catch {
    return { recolhidos: 0, detalhes: [] };
  }
}
