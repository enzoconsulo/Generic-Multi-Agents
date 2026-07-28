import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * Conferência de segurança antes de publicar (T-031) — o "push-safe".
 *
 * Publicar é irreversível na prática: segredo que vai para um repositório remoto tem que
 * ser considerado vazado mesmo depois de apagado (fica no histórico, em forks, em caches
 * e em índices). Por isso a checagem acontece ANTES do push, e não como conselho.
 *
 * Duas frentes, porque o painel commita com `git add -A`:
 * 1. o que JÁ está versionado (grave: está no histórico);
 * 2. o que AINDA não está mas seria varrido no próximo commit.
 */

/** Assinaturas de chave de provedor. Alta confiança: quase não dão falso positivo. */
const ASSINATURAS: readonly { nome: string; re: RegExp }[] = [
  { nome: "chave da Anthropic", re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { nome: "chave da OpenAI", re: /sk-(proj-)?[A-Za-z0-9]{32,}/ },
  { nome: "token do GitHub", re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { nome: "token do GitHub (fine-grained)", re: /github_pat_[A-Za-z0-9_]{20,}/ },
  { nome: "chave da AWS", re: /AKIA[0-9A-Z]{16}/ },
  { nome: "chave do Google", re: /AIza[0-9A-Za-z_-]{30,}/ },
  { nome: "token do Slack", re: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  { nome: "chave privada", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

/**
 * Atribuição genérica (`SENHA = "..."`). Sozinha daria muito falso positivo, então o
 * valor precisa não ser um placeholder — é o que separa `CHAVES.env.example` de um
 * segredo real.
 */
const ATRIBUICAO = /(senha|password|passwd|secret|token|api[_-]?key|access[_-]?key)\s*[:=]\s*["']([^"']{12,})["']/i;
const PLACEHOLDER =
  /^(sua?_|seu_|your_|my_|<|\{|\$|xxx|\.\.\.|placeholder|example|exemplo|changeme|troque|preencha|coloque|insira|abc123|test|dummy|fake)/i;

/** Nomes que são segredo por definição. `.env.example` NÃO entra (é template). */
function arquivoSensivel(caminho: string): string | null {
  const nome = basename(caminho).toLowerCase();
  if (/\.(example|sample|template|dist)$/.test(nome)) return null;
  if (nome === ".env" || /^\.env\./.test(nome) || /\.env$/.test(nome)) {
    return "arquivo de variáveis de ambiente (.env)";
  }
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(nome)) return "chave SSH privada";
  if (/\.(pem|pfx|p12|keystore|jks)$/.test(nome)) return "certificado ou chave privada";
  if (nome === "credentials.json" || nome === "service-account.json") {
    return "credenciais de serviço";
  }
  if (nome === ".npmrc" || nome === ".pypirc") return "config de publicação (pode ter token)";
  if (nome === ".credentials.json") return "credenciais";
  return null;
}

/** Extensões que não vale a pena abrir procurando texto. */
const BINARIOS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".svg",
  ".pdf", ".zip", ".gz", ".tar", ".7z", ".rar", ".jar", ".war",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".class", ".pyc",
  ".mp3", ".mp4", ".mov", ".avi", ".woff", ".woff2", ".ttf", ".eot",
  ".xlsx", ".xls", ".docx", ".parquet", ".db", ".sqlite",
]);

const TETO_ARQUIVOS = 3000;
const TETO_BYTES = 512 * 1024;

export interface Achado {
  /** `alto` bloqueia a publicação; `medio` avisa. */
  nivel: "alto" | "medio";
  tipo: "segredo" | "arquivo-sensivel" | "sem-gitignore";
  caminho: string;
  /** O que foi encontrado, em PT-BR. Nunca contém o segredo em si. */
  detalhe: string;
  /** Já versionado (está no histórico) ou ainda não (entraria no próximo commit)? */
  versionado: boolean;
  /** Linha onde bateu, quando aplicável. */
  linha: number | null;
}

export interface RelatorioSeguranca {
  achados: Achado[];
  arquivosVarridos: number;
  /** Chegou ao teto e parou? O relatório é parcial. */
  truncado: boolean;
  temGitignore: boolean;
  /** Há achado de nível alto — publicar exige decisão explícita. */
  bloqueia: boolean;
}

const VAZIO: RelatorioSeguranca = {
  achados: [],
  arquivosVarridos: 0,
  truncado: false,
  temGitignore: false,
  bloqueia: false,
};

/** Saída `-z` do git: lista terminada em NUL, sem aspas nem escapes. */
function partirNUL(saida: string): string[] {
  return saida.split("\0").filter((s) => s !== "");
}

/** Arquivos versionados + os que `git add -A` varreria no próximo commit. */
async function candidatos(
  dirRepo: string,
): Promise<{ versionados: string[]; novos: string[] }> {
  const versionados = await exec("git", ["ls-files", "-z"], {
    cwd: dirRepo,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  })
    .then(({ stdout }) => partirNUL(stdout))
    .catch(() => [] as string[]);

  // `-uall` lista arquivo por arquivo dentro de pasta nova, em vez de só o nome da pasta.
  const novos = await exec("git", ["status", "--porcelain", "-z", "-uall"], {
    cwd: dirRepo,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  })
    .then(({ stdout }) =>
      partirNUL(stdout)
        .filter((l) => l.startsWith("?? "))
        .map((l) => l.slice(3)),
    )
    .catch(() => [] as string[]);

  return { versionados, novos };
}

/** Procura assinatura de chave no conteúdo. Devolve o achado ou `null`. */
function acharSegredo(texto: string): { detalhe: string; linha: number } | null {
  const linhas = texto.split("\n");
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i] ?? "";
    if (linha.length > 4000) continue; // minificado/base64: ruído

    for (const { nome, re } of ASSINATURAS) {
      if (re.test(linha)) return { detalhe: `possível ${nome}`, linha: i + 1 };
    }

    const m = ATRIBUICAO.exec(linha);
    if (m !== null) {
      const valor = m[2] ?? "";
      if (!PLACEHOLDER.test(valor)) {
        return { detalhe: `possível segredo em "${m[1]}"`, linha: i + 1 };
      }
    }
  }
  return null;
}

/**
 * Varre um repositório procurando o que não deveria ser publicado.
 *
 * NUNCA lança e NUNCA devolve o segredo encontrado — só onde ele está. Repetir o valor
 * num relatório de UI (que vira captura de tela, log, print no chat) espalharia o
 * problema em vez de contê-lo.
 */
export async function varrerRepo(dirRepo: string): Promise<RelatorioSeguranca> {
  if (!existsSync(join(dirRepo, ".git"))) return VAZIO;

  const temGitignore = existsSync(join(dirRepo, ".gitignore"));
  const achados: Achado[] = [];
  const { versionados, novos } = await candidatos(dirRepo);

  const lista = [
    ...versionados.map((c) => ({ caminho: c, versionado: true })),
    ...novos.map((c) => ({ caminho: c, versionado: false })),
  ];
  const truncado = lista.length > TETO_ARQUIVOS;
  const varrer = lista.slice(0, TETO_ARQUIVOS);

  for (const { caminho, versionado } of varrer) {
    const motivo = arquivoSensivel(caminho);
    if (motivo !== null) {
      achados.push({
        nivel: "alto",
        tipo: "arquivo-sensivel",
        caminho,
        detalhe: motivo,
        versionado,
        linha: null,
      });
      continue; // o nome já condena; não precisa abrir
    }

    if (BINARIOS.has(extname(caminho).toLowerCase())) continue;

    try {
      const completo = join(dirRepo, caminho);
      if ((await stat(completo)).size > TETO_BYTES) continue;
      const texto = await readFile(completo, "utf8");
      if (texto.includes("\0")) continue; // binário sem extensão conhecida

      const segredo = acharSegredo(texto);
      if (segredo !== null) {
        achados.push({
          nivel: "alto",
          tipo: "segredo",
          caminho,
          detalhe: segredo.detalhe,
          versionado,
          linha: segredo.linha,
        });
      }
    } catch {
      // Arquivo sumiu no meio da varredura ou não é legível: não é motivo de falhar.
    }
  }

  // Sem .gitignore, `git add -A` varre tudo que aparecer na pasta — inclusive o que
  // ainda não existe hoje. É aviso, não bloqueio: repositório só de texto passa bem.
  if (!temGitignore) {
    achados.push({
      nivel: "medio",
      tipo: "sem-gitignore",
      caminho: ".gitignore",
      detalhe:
        "o projeto não tem .gitignore — qualquer arquivo novo na pasta entra no próximo commit",
      versionado: false,
      linha: null,
    });
  }

  // Versionado primeiro: já está no histórico, é o mais grave.
  achados.sort((a, b) => {
    if (a.nivel !== b.nivel) return a.nivel === "alto" ? -1 : 1;
    return Number(b.versionado) - Number(a.versionado);
  });

  return {
    achados,
    arquivosVarridos: varrer.length,
    truncado,
    temGitignore,
    bloqueia: achados.some((a) => a.nivel === "alto"),
  };
}
