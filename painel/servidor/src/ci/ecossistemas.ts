import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { EstagioCi } from "./config.js";

/**
 * Detecção de ecossistema para deduzir o pipeline de CI (T-017, generalizado).
 *
 * A fábrica constrói QUALQUER tipo de projeto, então o CI não pode presumir Node: antes
 * disto, um projeto Python/Go/Rust/.NET simplesmente não tinha pipeline ("sem
 * package.json" era erro). Aqui cada ecossistema é reconhecido por arquivos-marcador e
 * traz os comandos default da sua própria toolchain.
 *
 * Regra de HABILITAR: só nasce ligado o que a toolchain da linguagem garante (`go test`,
 * `cargo test`, `dotnet test`…). Ferramenta de terceiro que pode não estar instalada
 * (ruff, clippy, golangci-lint) vem com o comando PREENCHIDO mas DESLIGADO — o usuário
 * liga num clique no editor da UI, em vez de tomar uma falha de CI logo na primeira
 * execução por um binário ausente.
 */

export interface Ecossistema {
  id: string;
  rotulo: string;
  /** Um destes arquivos/pastas na raiz do projeto denuncia o ecossistema. */
  marcadores: readonly string[];
  /** Comando por estágio; null = estágio sem comando aplicável. */
  comandos: Readonly<Record<EstagioCi, string | null>>;
  /** Estágios que nascem LIGADOS (os demais ficam prontos, porém desligados). */
  habilitados: readonly EstagioCi[];
}

/**
 * Ordem = prioridade de detecção. Um repositório pode ter mais de um marcador (ex.: uma
 * API Python com um frontend Node); vence o primeiro da lista, e o usuário ajusta na UI.
 * Node vem primeiro por ser o caso mais comum de raiz de monorepo.
 */
export const ECOSSISTEMAS: readonly Ecossistema[] = [
  {
    id: "node",
    rotulo: "Node.js / npm",
    marcadores: ["package.json"],
    // Node é o único com detecção fina por script (ver `deduzirComScripts`).
    comandos: {
      instalar: "npm install",
      lint: "npm run lint",
      testes: "npm test",
      build: "npm run build",
    },
    habilitados: ["instalar"],
  },
  {
    id: "python",
    rotulo: "Python",
    marcadores: ["pyproject.toml", "requirements.txt", "setup.py"],
    comandos: {
      instalar: "python -m pip install -r requirements.txt",
      lint: "ruff check .",
      testes: "pytest",
      build: null,
    },
    habilitados: ["instalar", "testes"],
  },
  {
    id: "go",
    rotulo: "Go",
    marcadores: ["go.mod"],
    comandos: {
      instalar: "go mod download",
      lint: "golangci-lint run",
      testes: "go test ./...",
      build: "go build ./...",
    },
    habilitados: ["instalar", "testes", "build"],
  },
  {
    id: "rust",
    rotulo: "Rust / Cargo",
    marcadores: ["Cargo.toml"],
    comandos: {
      instalar: "cargo fetch",
      lint: "cargo clippy -- -D warnings",
      testes: "cargo test",
      build: "cargo build --release",
    },
    habilitados: ["instalar", "testes", "build"],
  },
  {
    id: "dotnet",
    rotulo: ".NET",
    marcadores: [".sln", ".csproj", ".fsproj"],
    comandos: {
      instalar: "dotnet restore",
      lint: null,
      testes: "dotnet test",
      build: "dotnet build --no-restore",
    },
    habilitados: ["instalar", "testes", "build"],
  },
  {
    id: "maven",
    rotulo: "Java / Maven",
    marcadores: ["pom.xml"],
    comandos: {
      instalar: "mvn -B -q dependency:go-offline",
      lint: null,
      testes: "mvn -B test",
      build: "mvn -B -DskipTests package",
    },
    habilitados: ["instalar", "testes", "build"],
  },
  {
    id: "gradle",
    rotulo: "Java / Gradle",
    marcadores: ["build.gradle", "build.gradle.kts"],
    comandos: {
      instalar: null,
      lint: null,
      testes: "gradle test",
      build: "gradle build -x test",
    },
    habilitados: ["testes", "build"],
  },
];

/**
 * Detecta o ecossistema de um projeto pelos arquivos da raiz. Marcadores que começam com
 * "." são tratados como EXTENSÃO (ex.: `.csproj` casa com `Api.csproj`); os demais, como
 * nome exato. Devolve null quando nada é reconhecido — que NÃO é erro: o projeto
 * simplesmente não tem pipeline automático e o usuário configura à mão pela UI.
 */
export function detectarEcossistema(dirProjeto: string): Ecossistema | null {
  let arquivos: string[];
  try {
    arquivos = readdirSync(dirProjeto);
  } catch {
    return null;
  }

  for (const eco of ECOSSISTEMAS) {
    for (const marcador of eco.marcadores) {
      const achou = marcador.startsWith(".")
        ? arquivos.some((a) => a.endsWith(marcador))
        : existsSync(join(dirProjeto, marcador));
      if (achou) return eco;
    }
  }
  return null;
}
