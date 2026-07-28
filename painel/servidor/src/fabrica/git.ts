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

/* ------------------------- Detalhe de um commit ------------------------- */

export interface ArquivoAlterado {
  caminho: string;
  adicoes: number;
  remocoes: number;
  /** Arquivo binário: o git não conta linhas nele. */
  binario: boolean;
}

export interface DetalheCommit {
  hash: string;
  arquivos: ArquivoAlterado[];
  adicoes: number;
  remocoes: number;
  /** Corpo da mensagem (o que vem depois do assunto), se houver. */
  corpo: string;
}

/**
 * Hash tem que ser hexadecimal: `execFile` já blinda contra shell, mas um valor como
 * `--upload-pack=...` seria interpretado como FLAG pelo git. Validar o formato fecha isso.
 */
const HASH_VALIDO = /^[0-9a-f]{7,40}$/i;

/**
 * Resumo do que um commit mudou — arquivos tocados e quantas linhas. Vem do próprio git
 * (`--numstat`), então é instantâneo e não custa nada: o "resumão" do commit é a forma e
 * o tamanho da mudança, já que a mensagem dele é a descrição.
 */
export async function lerDetalheCommit(
  dirRepo: string,
  hash: string,
): Promise<DetalheCommit | null> {
  if (!HASH_VALIDO.test(hash)) return null;

  try {
    const { stdout } = await exec(
      "git",
      ["show", "--numstat", "--format=%b" + LINHA, hash],
      { cwd: dirRepo, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
    );

    const [corpoBruto = "", tabela = ""] = stdout.split(LINHA);
    const arquivos: ArquivoAlterado[] = [];
    for (const linha of tabela.split("\n")) {
      // Formato: "<adições>\t<remoções>\t<caminho>"; binário vem como "-\t-\t<caminho>".
      const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(linha.trim());
      if (m === null) continue;
      const binario = m[1] === "-";
      arquivos.push({
        caminho: m[3] ?? "",
        adicoes: binario ? 0 : Number(m[1]),
        remocoes: binario ? 0 : Number(m[2]),
        binario,
      });
    }

    return {
      hash,
      arquivos,
      adicoes: arquivos.reduce((s, a) => s + a.adicoes, 0),
      remocoes: arquivos.reduce((s, a) => s + a.remocoes, 0),
      corpo: corpoBruto.trim(),
    };
  } catch {
    return null;
  }
}

/* ------------------------- Alterações e commit ------------------------- */

export interface AlteracaoPendente {
  caminho: string;
  /** Código de duas letras do `git status --porcelain` (ex.: " M", "??", "A "). */
  codigo: string;
  /** Descrição em PT-BR do que aconteceu com o arquivo. */
  situacao: string;
}

/**
 * Traduz o código do porcelain para algo que se lê sem manual. UMA PALAVRA: a UI põe
 * isso numa coluna de largura fixa, e rótulo longo quebrava a linha em duas (o código
 * cru vai junto, no `title`, para quem quiser o detalhe).
 */
function situacaoDe(codigo: string): string {
  const c = codigo.trim();
  if (c === "??") return "novo";
  if (c.includes("D")) return "apagado";
  if (c.includes("R")) return "renomeado";
  if (c.includes("A")) return "adicionado";
  if (c.includes("M")) return "modificado";
  return c;
}

/** O que está pendente de commit no repositório. Nunca lança. */
export async function lerAlteracoes(dirRepo: string): Promise<AlteracaoPendente[]> {
  if (!existsSync(join(dirRepo, ".git"))) return [];
  try {
    const { stdout } = await exec("git", ["status", "--porcelain"], {
      cwd: dirRepo,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => {
        const codigo = l.slice(0, 2);
        return { caminho: l.slice(3).trim(), codigo, situacao: situacaoDe(codigo) };
      });
  } catch {
    return [];
  }
}

export class ErroCommit extends Error {
  constructor(
    public readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroCommit";
  }
}

/**
 * Faz `git add -A` + `git commit` no repositório. NÃO faz push: publicar é decisão do
 * dono do repositório, não do painel.
 */
export async function commitar(dirRepo: string, mensagem: string): Promise<string> {
  const texto = mensagem.trim();
  if (texto === "") throw new ErroCommit(400, "A mensagem do commit não pode ficar vazia.");
  if (!existsSync(join(dirRepo, ".git"))) {
    throw new ErroCommit(409, "Esta pasta não é um repositório git.");
  }
  if ((await lerAlteracoes(dirRepo)).length === 0) {
    throw new ErroCommit(409, "Não há alterações para commitar.");
  }

  try {
    await exec("git", ["add", "-A"], { cwd: dirRepo, windowsHide: true });
    // `-m` via execFile (array de argumentos): mensagem com aspas, quebra de linha ou
    // `;` entra literal, sem passar por shell nenhum.
    await exec("git", ["commit", "-m", texto], { cwd: dirRepo, windowsHide: true });
    const { stdout } = await exec("git", ["rev-parse", "HEAD"], {
      cwd: dirRepo,
      windowsHide: true,
    });
    return stdout.trim();
  } catch (erro) {
    const bruto = erro instanceof Error ? erro.message : String(erro);
    // Erro clássico em máquina nova: sem identidade configurada.
    if (/Please tell me who you are|user\.email/i.test(bruto)) {
      throw new ErroCommit(
        409,
        'Git sem identidade configurada. Rode: git config --global user.name "Seu Nome" ' +
          'e git config --global user.email "voce@exemplo.com".',
      );
    }
    throw new ErroCommit(500, `git commit falhou: ${bruto}`);
  }
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
