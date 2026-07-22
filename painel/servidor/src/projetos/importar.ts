import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import type { NovoJob } from "../jobs/fila.js";
import type { ContextoExecucao } from "../jobs/tipos.js";

/**
 * Importação de uma pasta existente para dentro de `projetos/` (T-013).
 *
 * Decisão (DECISOES.md 2026-07-21): importar = COPIAR para `projetos/<nome>/` (nunca
 * symlink/caminho externo), preservando `.git` se houver (senão `git init` + commit),
 * ignorando `node_modules`, criando o `_gestao/` mínimo que faltar e enfileirando a
 * análise. A cópia roda como job NÃO-Claude para aparecer no console com progresso.
 *
 * Este módulo tem a lógica pura (validação + cópia + scaffolding); o runner
 * (`runner-importar.ts`) orquestra e enfileira a análise; a rota (`rotas/cadastro.ts`)
 * valida e cria o job.
 */

/** Erro de importação com status HTTP para a rota mapear (400 validação, 409 conflito). */
export class ErroImportacao extends Error {
  constructor(
    public readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroImportacao";
  }
}

/** Normaliza um nome livre (pasta ou informado) para kebab-case seguro de diretório. */
export function normalizarNome(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (marcas diacríticas)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // não-alfanumérico vira hífen
    .replace(/-{2,}/g, "-") // colapsa hifens repetidos
    .replace(/^-+|-+$/g, ""); // apara hifens das pontas
}

export interface ImportacaoValidada {
  origem: string;
  nome: string;
  destino: string;
}

/**
 * Valida (síncrono, rápido) a origem e o nome de uma importação. Lança `ErroImportacao`
 * com o status HTTP certo; retorna caminhos resolvidos quando tudo confere.
 */
export function validarImportacao(
  caminho: unknown,
  nomeBruto: unknown,
  fabricaRaiz: string,
): ImportacaoValidada {
  if (typeof caminho !== "string" || caminho.trim() === "") {
    throw new ErroImportacao(400, "Campo `caminho` é obrigatório (caminho absoluto da pasta).");
  }
  if (!isAbsolute(caminho)) {
    throw new ErroImportacao(
      400,
      "O `caminho` deve ser ABSOLUTO (ex.: C:\\Users\\voce\\meu-projeto).",
    );
  }
  const origem = resolve(caminho);
  if (!existsSync(origem) || !statSync(origem).isDirectory()) {
    throw new ErroImportacao(
      400,
      `Pasta de origem não encontrada ou não é um diretório: ${origem}`,
    );
  }

  const projetosDir = resolve(fabricaRaiz, "projetos");
  if (origem === projetosDir || origem.startsWith(projetosDir + sep)) {
    throw new ErroImportacao(
      400,
      "Essa pasta já está dentro de projetos/ — já é (ou seria) um projeto da fábrica.",
    );
  }

  const raiz = resolve(fabricaRaiz);
  if (origem === raiz || raiz.startsWith(origem + sep)) {
    throw new ErroImportacao(
      400,
      "Não dá para importar a raiz da fábrica nem uma pasta que a contém.",
    );
  }

  const bruto =
    typeof nomeBruto === "string" && nomeBruto.trim() !== "" ? nomeBruto : basename(origem);
  const nome = normalizarNome(bruto);
  if (nome === "") {
    throw new ErroImportacao(
      400,
      "Não foi possível derivar um nome válido a partir da pasta; informe `nome`.",
    );
  }

  const destino = join(projetosDir, nome);
  if (existsSync(destino)) {
    throw new ErroImportacao(
      409,
      `Já existe um projeto chamado "${nome}". Escolha outro nome (o painel nunca sobrescreve).`,
    );
  }

  return { origem, nome, destino };
}

export interface OpcoesImportar {
  /** Modelo (alias) da análise que roda logo após a cópia. */
  modeloAnalise: string;
  /** Fallback da análise; ausente/null = sem fallback. */
  fallbackAnalise?: string | null;
}

/** Monta o job NÃO-Claude de importação (a análise é enfileirada pelo runner ao fim). */
export function montarJobImportar(
  v: ImportacaoValidada,
  fabricaRaiz: string,
  opcoes: OpcoesImportar,
): NovoJob {
  return {
    tipo: "importar",
    titulo: `Importar ${v.nome}`,
    escopo: `projeto:${v.nome}`,
    usaClaude: false,
    params: {
      origem: v.origem,
      nome: v.nome,
      fabricaRaiz,
      modeloAnalise: opcoes.modeloAnalise,
      ...(opcoes.fallbackAnalise ? { fallbackAnalise: opcoes.fallbackAnalise } : {}),
    },
  };
}

/**
 * Executa a cópia + git + `_gestao/` mínimo. Emite progresso via `ctx`. Não enfileira a
 * análise (isso é papel do runner, que tem acesso ao gerenciador).
 */
export async function executarImportacao(
  origem: string,
  destino: string,
  fabricaRaiz: string,
  nome: string,
  ctx: Pick<ContextoExecucao, "emitir">,
): Promise<void> {
  ctx.emitir("log", { nivel: "inicio", texto: `Importando "${nome}" de ${origem}` });

  ctx.emitir("log", { nivel: "assistente", texto: "Copiando arquivos (ignorando node_modules)…" });
  await cp(origem, destino, {
    recursive: true,
    // basename === node_modules pula a subárvore inteira (contrato do filter do fs.cp).
    filter: (src) => basename(src) !== "node_modules",
  });

  ctx.emitir("log", { nivel: "assistente", texto: "Garantindo _gestao/ mínimo…" });
  await garantirGestao(destino, fabricaRaiz, nome);

  if (existsSync(join(destino, ".git"))) {
    ctx.emitir("log", { nivel: "assistente", texto: "Repositório git preservado da origem." });
  } else {
    ctx.emitir("log", {
      nivel: "assistente",
      texto: "Sem git na origem — inicializando repositório e commit inicial…",
    });
    execFileSync("git", ["init", "-q"], { cwd: destino });
    execFileSync("git", ["add", "-A"], { cwd: destino });
    execFileSync("git", ["commit", "-q", "-m", "chore: importado pelo painel-fabrica"], {
      cwd: destino,
    });
  }

  ctx.emitir("log", { nivel: "resultado", texto: `Cópia concluída em projetos/${nome}.` });
}

/** Cria as pastas e arquivos de `_gestao/` que faltarem, sem sobrescrever nada existente. */
async function garantirGestao(destino: string, fabricaRaiz: string, nome: string): Promise<void> {
  const gestao = join(destino, "_gestao");
  await mkdir(join(gestao, "tarefas"), { recursive: true });
  await mkdir(join(gestao, "pesquisas"), { recursive: true });

  const hoje = new Date().toISOString().slice(0, 10);

  await criarSeFaltar(join(destino, "CLAUDE.md"), async () => {
    const tpl = await lerTemplate(fabricaRaiz, "CLAUDE-projeto.md", `# ${nome}\n`);
    return tpl.replace(/<nome do projeto>/g, nome);
  });

  await criarSeFaltar(join(gestao, "DECISOES.md"), async () => {
    const tpl = await lerTemplate(fabricaRaiz, "DECISOES.md", `# Decisões — ${nome}\n`);
    return tpl.replace(/<nome do projeto>/g, nome);
  });

  await criarSeFaltar(join(gestao, "PROGRESSO.md"), async () => {
    const tpl = await lerTemplate(fabricaRaiz, "PROGRESSO.md", `# Progresso — ${nome}\n`);
    const base = tpl.replace(/<nome do projeto>/g, nome).trimEnd();
    return (
      `${base}\n\n## ${hoje}\n` +
      "Projeto importado pelo painel-fabrica a partir de uma pasta existente. Análise de " +
      "código enfileirada automaticamente para mapear a arquitetura.\n"
    );
  });
}

async function criarSeFaltar(caminho: string, gerar: () => Promise<string>): Promise<void> {
  if (existsSync(caminho)) return;
  await writeFile(caminho, await gerar(), "utf8");
}

async function lerTemplate(fabricaRaiz: string, arquivo: string, fallback: string): Promise<string> {
  try {
    return await readFile(join(fabricaRaiz, "_sistema", "templates", arquivo), "utf8");
  } catch {
    return fallback;
  }
}
