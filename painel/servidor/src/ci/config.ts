import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Configuração de CI por projeto (T-017): `_gestao/ci.json` do PROJETO (não do painel —
 * decisão em _gestao/DECISOES.md 2026-07-21). Estágios fixos, na ordem de execução.
 */
export const ESTAGIOS_CI = ["instalar", "lint", "testes", "build"] as const;
export type EstagioCi = (typeof ESTAGIOS_CI)[number];

export interface ConfigEstagioCi {
  /** Comando de shell (ex.: "npm run lint"); null = sem comando aplicável. */
  comando: string | null;
  habilitado: boolean;
}

export interface ConfigCi {
  estagios: Record<EstagioCi, ConfigEstagioCi>;
  /** Timeout por estágio, em ms (default 10 min). */
  timeoutMs: number;
}

export const TIMEOUT_PADRAO_MS = 10 * 60 * 1000;

/** Projeto sem package.json — nenhum pipeline de CI aplicável (mensagem clara, não crash). */
export class ErroSemPackageJson extends Error {
  constructor(projeto: string) {
    super(`Projeto "${projeto}" não tem package.json — nenhum pipeline de CI aplicável.`);
    this.name = "ErroSemPackageJson";
  }
}

/** `_gestao/ci.json` existe mas o conteúdo não tem o formato esperado. */
export class ErroConfigCiInvalida extends Error {
  constructor(motivo: string) {
    super(`Config de CI inválida: ${motivo}`);
    this.name = "ErroConfigCiInvalida";
  }
}

function caminhoConfig(dirProjeto: string): string {
  return join(dirProjeto, "_gestao", "ci.json");
}

function caminhoPackageJson(dirProjeto: string): string {
  return join(dirProjeto, "package.json");
}

interface PackageJsonMinimo {
  scripts?: Record<string, string>;
}

async function lerPackageJson(dirProjeto: string): Promise<PackageJsonMinimo | null> {
  const caminho = caminhoPackageJson(dirProjeto);
  if (!existsSync(caminho)) return null;
  try {
    const bruto: unknown = JSON.parse(await readFile(caminho, "utf8"));
    if (typeof bruto !== "object" || bruto === null) return {};
    return bruto as PackageJsonMinimo;
  } catch {
    // package.json ilegível: trata como "sem scripts" em vez de derrubar a dedução.
    return {};
  }
}

/**
 * Deduz a config default a partir do package.json: `instalar` sempre habilitado
 * (`npm install` funciona mesmo sem scripts); os demais só habilitam quando o script
 * correspondente existe — senão o estágio nasce desabilitado (roda como `pulado`).
 */
export function deduzirDefaults(pkg: PackageJsonMinimo): ConfigCi {
  const scripts = pkg.scripts ?? {};
  const comScript = (nome: string, comando: string): ConfigEstagioCi =>
    nome in scripts ? { comando, habilitado: true } : { comando: null, habilitado: false };
  return {
    estagios: {
      instalar: { comando: "npm install", habilitado: true },
      lint: comScript("lint", "npm run lint"),
      testes: comScript("test", "npm test"),
      build: comScript("build", "npm run build"),
    },
    timeoutMs: TIMEOUT_PADRAO_MS,
  };
}

/**
 * Lê `_gestao/ci.json`; se não existir, deduz defaults do package.json do projeto,
 * GRAVA o arquivo (para a UI/próxima leitura editar em cima de algo concreto) e devolve.
 * Lança `ErroSemPackageJson` se o projeto não tem package.json.
 */
export async function lerOuCriarConfig(dirProjeto: string, projeto: string): Promise<ConfigCi> {
  const caminho = caminhoConfig(dirProjeto);
  if (existsSync(caminho)) {
    return validarConfig(JSON.parse(await readFile(caminho, "utf8")));
  }
  const pkg = await lerPackageJson(dirProjeto);
  if (pkg === null) throw new ErroSemPackageJson(projeto);
  const config = deduzirDefaults(pkg);
  await escrever(dirProjeto, config);
  return config;
}

/** Valida e grava a config (usado pelo PUT de edição). Lança `ErroConfigCiInvalida`. */
export async function salvarConfig(dirProjeto: string, bruto: unknown): Promise<ConfigCi> {
  const config = validarConfig(bruto);
  await escrever(dirProjeto, config);
  return config;
}

async function escrever(dirProjeto: string, config: ConfigCi): Promise<void> {
  const caminho = caminhoConfig(dirProjeto);
  // `_gestao/` pode não existir: nem todo diretório sob `projetos/` passou pelo
  // /novo-projeto ou pela importação (T-013) — uma pasta clonada à mão é um projeto
  // válido para o leitor (`dirProjeto` só exige que o diretório exista). Sem este
  // mkdir, ler a config de um projeto assim estourava ENOENT → 500.
  await mkdir(dirname(caminho), { recursive: true });
  await writeFile(caminho, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

/** Validação estrutural estrita — usada tanto na leitura do disco quanto no PUT da UI. */
export function validarConfig(bruto: unknown): ConfigCi {
  if (typeof bruto !== "object" || bruto === null) {
    throw new ErroConfigCiInvalida("esperado um objeto.");
  }
  const v = bruto as Record<string, unknown>;

  if (typeof v.timeoutMs !== "number" || !Number.isInteger(v.timeoutMs) || v.timeoutMs < 1000) {
    throw new ErroConfigCiInvalida("`timeoutMs` deve ser um inteiro >= 1000.");
  }
  if (typeof v.estagios !== "object" || v.estagios === null) {
    throw new ErroConfigCiInvalida("`estagios` deve ser um objeto.");
  }
  const estagiosBrutos = v.estagios as Record<string, unknown>;
  const estagios = {} as Record<EstagioCi, ConfigEstagioCi>;
  for (const nome of ESTAGIOS_CI) {
    const e = estagiosBrutos[nome];
    if (typeof e !== "object" || e === null) {
      throw new ErroConfigCiInvalida(`estágio "${nome}" ausente ou inválido.`);
    }
    const eo = e as Record<string, unknown>;
    if (eo.comando !== null && typeof eo.comando !== "string") {
      throw new ErroConfigCiInvalida(`estágio "${nome}": \`comando\` deve ser string ou null.`);
    }
    if (typeof eo.habilitado !== "boolean") {
      throw new ErroConfigCiInvalida(`estágio "${nome}": \`habilitado\` deve ser boolean.`);
    }
    if (eo.habilitado && (eo.comando === null || eo.comando.trim() === "")) {
      throw new ErroConfigCiInvalida(`estágio "${nome}": habilitado sem \`comando\`.`);
    }
    estagios[nome] = { comando: eo.comando as string | null, habilitado: eo.habilitado };
  }
  return { estagios, timeoutMs: v.timeoutMs };
}
