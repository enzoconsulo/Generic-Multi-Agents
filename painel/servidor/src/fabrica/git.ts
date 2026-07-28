import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * Leitura do histórico git de um repositório (T-028) — base do grafo de commits estilo
 * Git Graph. Somente leitura: nunca escreve, nunca muda estado do repositório.
 *
 * O painel já mostra o PLANO (o que se pretende fazer) e as tarefas (o que está em
 * andamento). Faltava o que de fato ACONTECEU no código — e é o histórico que conta isso,
 * já que a fábrica commita uma vez por tarefa.
 */

/** Separadores improváveis de aparecer em mensagem de commit. */
const CAMPO = "";
const LINHA = "";

export interface CommitGit {
  hash: string;
  /** Hash curto para exibição. */
  curto: string;
  /** Hashes dos pais: 0 = commit raiz, 2+ = merge. */
  pais: string[];
  autor: string;
  /** ISO 8601. */
  data: string;
  assunto: string;
  /** Nomes de branch/tag apontando para este commit (`HEAD`, `main`, `tag: v1`…). */
  refs: string[];
}

export interface HistoricoGit {
  /** Repositório encontrado? `false` = a pasta existe mas não é um repo git. */
  ehRepo: boolean;
  /** Branch atual (vazio em detached HEAD). */
  branch: string;
  commits: CommitGit[];
  /** Há mais commits além do limite pedido. */
  truncado: boolean;
  /** Aviso legível quando algo impediu a leitura completa. */
  aviso: string | null;
}

const VAZIO: HistoricoGit = {
  ehRepo: false,
  branch: "",
  commits: [],
  truncado: false,
  aviso: null,
};

/**
 * Lê o histórico de um repositório. Nunca lança: repositório ausente, sem commits ou
 * com git indisponível devolve um resultado vazio com `aviso` — o painel precisa
 * continuar de pé.
 */
export async function lerHistorico(dirRepo: string, limite = 80): Promise<HistoricoGit> {
  if (!existsSync(join(dirRepo, ".git"))) return { ...VAZIO };

  const formato = ["%H", "%P", "%an", "%aI", "%s", "%D"].join(CAMPO) + LINHA;
  try {
    // `--all` para enxergar outras branches; `--date-order` mantém a cronologia
    // topológica, que é o que faz o desenho do grafo bater com a realidade.
    const { stdout } = await exec(
      "git",
      ["log", "--all", "--date-order", `--max-count=${limite + 1}`, `--pretty=format:${formato}`],
      { cwd: dirRepo, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
    );

    const brutos = stdout.split(LINHA).filter((l) => l.trim() !== "");
    const truncado = brutos.length > limite;
    const commits = brutos.slice(0, limite).map(paraCommit);

    return { ehRepo: true, branch: await lerBranch(dirRepo), commits, truncado, aviso: null };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    // Repositório recém-criado (`git init` sem commit) faz o `git log` falhar — é um
    // estado normal, não um defeito.
    if (/does not have any commits|ambiguous argument/i.test(mensagem)) {
      return { ...VAZIO, ehRepo: true, aviso: "Repositório ainda sem commits." };
    }
    return { ...VAZIO, ehRepo: true, aviso: `Não foi possível ler o histórico: ${mensagem}` };
  }
}

function paraCommit(bruto: string): CommitGit {
  const [hash = "", pais = "", autor = "", data = "", assunto = "", refs = ""] =
    bruto.replace(/^\n/, "").split(CAMPO);
  return {
    hash,
    curto: hash.slice(0, 7),
    pais: pais.trim() === "" ? [] : pais.trim().split(/\s+/),
    autor,
    data,
    assunto,
    refs: refs
      .split(",")
      .map((r) => r.trim())
      .filter((r) => r !== "")
      // "HEAD -> main" vira só "main": o painel marca o HEAD por conta própria.
      .map((r) => r.replace(/^HEAD -> /, "")),
  };
}

async function lerBranch(dirRepo: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["branch", "--show-current"], {
      cwd: dirRepo,
      windowsHide: true,
    });
    return stdout.trim();
  } catch {
    return "";
  }
}
