import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * Ajustes e contas (T-032): o que o painel consegue DIZER e o que consegue MUDAR sobre
 * as duas conexões de que a fábrica depende — a conta do Claude (que executa os fluxos)
 * e a conta do GitHub (que recebe o que é publicado).
 *
 * Limite honesto e deliberado: não existe "conectar conta" aqui. O login do Claude é
 * feito pelo CLI (`claude`, navegador) e o do GitHub pelo Git Credential Manager, por
 * chave SSH ou pelo `gh` — todos fluxos interativos, fora de uma página local. Fingir um
 * botão de conectar que só abre instruções seria pior que dizer a verdade. O que este
 * módulo faz é DIAGNOSTICAR com precisão e apontar o comando exato que resolve.
 *
 * NUNCA lê conteúdo de credencial ou de chave privada — só a existência dos arquivos.
 */

/**
 * Cache curto do diagnóstico (T-045). A rota gastava ~200 ms MEDIDOS a cada abertura da
 * aba Ajustes, e o custo é quase todo spawn de processo no Windows: `git config` ×3,
 * `gh --version`, `gh auth status`, `claude --version`. O que eles respondem quase nunca
 * muda — versão do CLI, identidade do git, existência de credencial.
 *
 * TTL curto em vez de cache permanente porque login feito FORA do painel (num terminal)
 * precisa aparecer sem reiniciar o servidor. E o que o próprio painel escreve não espera
 * o TTL: `definirIdentidade` invalida na hora, senão a tela mostraria o valor antigo
 * logo depois de gravar — o único caso em que errar é garantido.
 */
const TTL_DIAGNOSTICO_MS = 30_000;

interface Entrada<T> {
  valor: T;
  em: number;
}

/** Exportado para teste: o comportamento interessante é o TTL, a dedupe e a invalidação. */
export function comCache<T>(
  ttlMs: number,
  ler: () => Promise<T>,
): (() => Promise<T>) & { invalidar: () => void } {
  let entrada: Entrada<T> | null = null;
  /** Chamada em voo: duas abas abrindo juntas não devem disparar os spawns em dobro. */
  let emVoo: Promise<T> | null = null;

  const fn = async (): Promise<T> => {
    if (entrada !== null && Date.now() - entrada.em < ttlMs) return entrada.valor;
    if (emVoo !== null) return emVoo;
    emVoo = ler()
      .then((valor) => {
        entrada = { valor, em: Date.now() };
        return valor;
      })
      .finally(() => {
        emVoo = null;
      });
    return emVoo;
  };
  fn.invalidar = (): void => {
    entrada = null;
  };
  return fn;
}

/** Roda um comando curto; `null` quando o programa não existe ou falha. */
async function tentar(programa: string, args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await exec(programa, args, {
      timeout: 8000,
      windowsHide: true,
    });
    return `${stdout}${stderr}`.trim();
  } catch {
    return null;
  }
}

async function configGit(chave: string): Promise<string | null> {
  const valor = await tentar("git", ["config", "--global", chave]);
  return valor === null || valor === "" ? null : valor;
}

/* ---------------------------------- GitHub ---------------------------------- */

export interface ContaGitHub {
  /** `https` (credential manager), `ssh` (chave), `nenhum`. */
  meio: "https" | "ssh" | "nenhum";
  conectado: boolean;
  identidadeNome: string | null;
  identidadeEmail: string | null;
  /** Ex.: "manager" — quem guarda a senha do HTTPS. */
  credentialHelper: string | null;
  /** Nomes dos arquivos .pub encontrados (nunca o conteúdo). */
  chavesSsh: string[];
  ghInstalado: boolean;
  /** Conta logada no `gh`, quando ele existe e está autenticado. */
  ghConta: string | null;
  /** O que fazer para ficar conectado, quando não está. */
  comoResolver: string | null;
}

async function lerContaGitHubDireto(): Promise<ContaGitHub> {
  const [nome, email, helper, gh] = await Promise.all([
    configGit("user.name"),
    configGit("user.email"),
    // `--show-origin` não: o helper costuma vir do gitconfig do SISTEMA (instalação do
    // Git para Windows), e `--global` sozinho devolveria vazio mesmo com ele ativo.
    tentar("git", ["config", "--get", "credential.helper"]),
    tentar("gh", ["--version"]),
  ]);

  const dirSsh = join(homedir(), ".ssh");
  let chavesSsh: string[] = [];
  try {
    chavesSsh = existsSync(dirSsh)
      ? readdirSync(dirSsh).filter((f) => f.endsWith(".pub"))
      : [];
  } catch {
    chavesSsh = [];
  }

  const ghInstalado = gh !== null;
  const ghStatus = ghInstalado ? await tentar("gh", ["auth", "status"]) : null;
  const ghConta =
    ghStatus === null ? null : (/account (\S+)/.exec(ghStatus)?.[1] ?? null);

  const temHelper = helper !== null && helper !== "";
  const meio: ContaGitHub["meio"] = temHelper
    ? "https"
    : chavesSsh.length > 0
      ? "ssh"
      : "nenhum";
  const conectado = temHelper || chavesSsh.length > 0;

  let comoResolver: string | null = null;
  if (!conectado) {
    comoResolver =
      "Publique uma vez pelo terminal (`git push`) para o Windows guardar a credencial, " +
      "ou crie uma chave SSH (`ssh-keygen -t ed25519`) e adicione a pública no GitHub.";
  } else if (nome === null || email === null) {
    comoResolver =
      'Falta a identidade dos commits: git config --global user.name "Seu Nome" e ' +
      'git config --global user.email "voce@exemplo.com" — dá para preencher aqui mesmo.';
  }

  return {
    meio,
    conectado,
    identidadeNome: nome,
    identidadeEmail: email,
    credentialHelper: temHelper ? helper : null,
    chavesSsh,
    ghInstalado,
    ghConta,
    comoResolver,
  };
}

/**
 * Diagnóstico do GitHub, com cache de {@link TTL_DIAGNOSTICO_MS}. Chame `.invalidar()`
 * depois de qualquer escrita que mude o que ele lê.
 */
export const lerContaGitHub = comCache(TTL_DIAGNOSTICO_MS, lerContaGitHubDireto);

/** Grava a identidade dos commits (global). É a única coisa daqui que o painel escreve. */
export async function definirIdentidade(nome: string, email: string): Promise<void> {
  const n = nome.trim();
  const e = email.trim();
  if (n === "") throw new ErroAjustes(400, "O nome não pode ficar vazio.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new ErroAjustes(400, "E-mail inválido.");
  // Valor começando com `-` seria lido como flag pelo git.
  if (n.startsWith("-") || e.startsWith("-")) {
    throw new ErroAjustes(400, "Valor inválido: não pode começar com “-”.");
  }

  try {
    await exec("git", ["config", "--global", "user.name", n], { windowsHide: true });
    await exec("git", ["config", "--global", "user.email", e], { windowsHide: true });
  } catch (erro) {
    const texto = erro instanceof Error ? erro.message : String(erro);
    throw new ErroAjustes(500, `Não foi possível gravar a identidade: ${texto}`);
  } finally {
    // No `finally` de propósito: se a primeira chave gravou e a segunda falhou, o cache
    // ficou desatualizado do mesmo jeito. Invalidar só no caminho feliz mostraria valor
    // velho justamente no estado inconsistente — que é quando olhar a tela importa mais.
    lerContaGitHub.invalidar();
  }
}

export class ErroAjustes extends Error {
  constructor(
    public readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroAjustes";
  }
}

/* ---------------------------------- Claude ---------------------------------- */

export interface ContaClaude {
  conectado: boolean;
  /** O CLI existe na máquina — no PATH ou nos caminhos padrão de instalação. */
  cliInstalado: boolean;
  versao: string | null;
  /** Existe `~/.claude/.credentials.json` (só a existência — nunca o conteúdo). */
  temCredenciais: boolean;
  comoResolver: string | null;
}

/**
 * Onde o Claude Code costuma se instalar. Consultar isto importa porque o instalador põe
 * o binário em `~/.local/bin`, que NÃO está no PATH de todo processo — e o painel
 * dizendo "não encontrado" para algo instalado é pior que não dizer nada.
 */
const CAMINHOS_CLI: readonly string[] = [
  join(homedir(), ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude"),
  join(homedir(), ".claude", "local", "claude"),
];

async function lerContaClaudeDireto(): Promise<ContaClaude> {
  const versaoBruta = await tentar("claude", ["--version"]);
  const temCredenciais = existsSync(join(homedir(), ".claude", ".credentials.json"));
  // Fora do PATH ainda é instalado: procurar no disco antes de declarar ausência.
  const noDisco = versaoBruta === null ? CAMINHOS_CLI.find((c) => existsSync(c)) : undefined;
  const cliInstalado = versaoBruta !== null || noDisco !== undefined;

  // O painel executa os fluxos pelo Agent SDK, que usa o MESMO login do CLI. Por isso a
  // presença das credenciais é o sinal que importa; o CLI é só o que produz esse login.
  const conectado = temCredenciais;

  return {
    conectado,
    cliInstalado,
    versao:
      versaoBruta !== null
        ? (versaoBruta.split("\n")[0] ?? null)
        : noDisco !== undefined
          ? `instalado em ${noDisco} (fora do PATH deste processo)`
          : null,
    temCredenciais,
    comoResolver: conectado
      ? null
      : cliInstalado
        ? "Rode `claude` no terminal e faça login — o painel usa o mesmo login do CLI."
        : "Instale o Claude Code e faça login (`claude`); o painel executa os fluxos pelo mesmo login.",
  };
}

/**
 * Diagnóstico do Claude, com cache de {@link TTL_DIAGNOSTICO_MS}. `claude --version` é o
 * spawn mais caro dos seis e o que menos muda — versão do CLI não troca durante a sessão.
 */
export const lerContaClaude = comCache(TTL_DIAGNOSTICO_MS, lerContaClaudeDireto);

/* ---------------------------------- Painel ---------------------------------- */

export interface AjustesPainel {
  porta: number;
  fabricaRaiz: string;
  dirDados: string;
  tetoJobsClaude: number;
  /** Ids das estratégias de modelo oferecidas ao disparar um fluxo. */
  estrategias: string[];
}

export interface Ajustes {
  github: ContaGitHub;
  claude: ContaClaude;
  painel: AjustesPainel;
}
