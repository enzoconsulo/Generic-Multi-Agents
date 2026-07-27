import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { detectarEcossistema } from "./ecossistemas.js";

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
  /**
   * Ecossistema detectado na criação da config (`node`, `python`, `go`…), ou null quando
   * nada foi reconhecido. Informativo: a UI usa para explicar de onde vieram os defaults.
   */
  ecossistema?: string | null;
}

export const TIMEOUT_PADRAO_MS = 10 * 60 * 1000;

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

interface PackageJsonMinimo {
  scripts?: Record<string, string>;
}

async function lerScriptsNpm(dirProjeto: string): Promise<Record<string, string>> {
  const caminho = join(dirProjeto, "package.json");
  if (!existsSync(caminho)) return {};
  try {
    const bruto: unknown = JSON.parse(await readFile(caminho, "utf8"));
    if (typeof bruto !== "object" || bruto === null) return {};
    return (bruto as PackageJsonMinimo).scripts ?? {};
  } catch {
    // package.json ilegível: trata como "sem scripts" em vez de derrubar a dedução.
    return {};
  }
}

/**
 * Deduz a config default do projeto a partir do ECOSSISTEMA detectado (Node, Python, Go,
 * Rust, .NET, Java…) — ver `ecossistemas.ts`. Nenhum ecossistema reconhecido devolve uma
 * config com tudo desligado, e isso NÃO é erro: o projeto só não tem pipeline automático,
 * e o usuário preenche os comandos pelo editor da UI.
 *
 * Node ganha detecção fina: como `npm run <x>` falha se o script não existe, lint/testes/
 * build só nascem ligados quando o script correspondente está no package.json.
 */
export async function deduzirDefaults(dirProjeto: string): Promise<ConfigCi> {
  const eco = detectarEcossistema(dirProjeto);

  if (eco === null) {
    return {
      estagios: {
        instalar: { comando: null, habilitado: false },
        lint: { comando: null, habilitado: false },
        testes: { comando: null, habilitado: false },
        build: { comando: null, habilitado: false },
      },
      timeoutMs: TIMEOUT_PADRAO_MS,
      ecossistema: null,
    };
  }

  const scripts = eco.id === "node" ? await lerScriptsNpm(dirProjeto) : {};
  const estagios = {} as Record<EstagioCi, ConfigEstagioCi>;

  for (const nome of ESTAGIOS_CI) {
    const comando = eco.comandos[nome];
    let habilitado = comando !== null && eco.habilitados.includes(nome);
    if (eco.id === "node" && nome !== "instalar") {
      const script = nome === "testes" ? "test" : nome;
      habilitado = script in scripts;
    }
    estagios[nome] = { comando, habilitado };
  }

  return { estagios, timeoutMs: TIMEOUT_PADRAO_MS, ecossistema: eco.id };
}

/**
 * Lê `_gestao/ci.json`; se não existir, deduz os defaults do ecossistema do projeto,
 * GRAVA o arquivo (para a UI/próxima leitura editarem em cima de algo concreto) e
 * devolve. Nunca falha por "tipo de projeto não suportado" — projeto sem ecossistema
 * reconhecido recebe uma config vazia e editável.
 */
export async function lerOuCriarConfig(dirProjeto: string): Promise<ConfigCi> {
  const caminho = caminhoConfig(dirProjeto);
  if (existsSync(caminho)) {
    return validarConfig(JSON.parse(await readFile(caminho, "utf8")));
  }
  const config = await deduzirDefaults(dirProjeto);
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
  // `ecossistema` é opcional e informativo: configs gravadas antes deste campo existir
  // continuam válidas (não invalidar o disco por um metadado).
  const ecossistema = typeof v.ecossistema === "string" ? v.ecossistema : null;
  return { estagios, timeoutMs: v.timeoutMs, ecossistema };
}
