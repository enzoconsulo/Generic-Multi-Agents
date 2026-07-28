import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ErroPublicacao,
  definirRemoto,
  dirDoRepo,
  lerEstadoPublicacao,
  lerRemoto,
  listarRepos,
  publicar,
  validarUrlRemoto,
} from "../../src/fabrica/publicacao.js";

/**
 * Link do repositório na nuvem e push (T-030).
 *
 * O push é testado DE VERDADE — contra um repositório `--bare` em pasta temporária, que
 * é um remoto git legítimo e não usa rede. Dublê aqui não provaria nada: o que pode dar
 * errado no push mora no git, não no nosso código.
 */

function repoTemp(): string {
  const dir = mkdtempSync(join(tmpdir(), "pub-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Teste"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "teste@exemplo.com"], { cwd: dir });
  return dir;
}

function commitar(dir: string, nome: string): void {
  writeFileSync(join(dir, nome), "conteudo\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", `add ${nome}`], { cwd: dir });
}

/** Remoto de verdade, sem rede. */
function bareTemp(): string {
  const dir = mkdtempSync(join(tmpdir(), "bare-"));
  execFileSync("git", ["init", "-q", "--bare", "-b", "main"], { cwd: dir });
  return dir;
}

describe("validarUrlRemoto", () => {
  it("aceita os formatos que o GitHub oferece para copiar", () => {
    expect(validarUrlRemoto("https://github.com/enzoconsulo/Generic-Multi-Agents.git")).toBeNull();
    expect(validarUrlRemoto("git@github.com:enzoconsulo/Local_AI.git")).toBeNull();
    expect(validarUrlRemoto("ssh://git@github.com/usuario/repo.git")).toBeNull();
    // Hífen no nome do repositório é comuníssimo — não pode ser recusado.
    expect(validarUrlRemoto("https://gitlab.com/grupo/meu-projeto-legal.git")).toBeNull();
  });

  it("RECUSA ext::, que faz o git executar um comando", () => {
    // Esta é a que importa: `ext::` é execução de comando disfarçada de endereço.
    const problema = validarUrlRemoto("ext::sh -c 'curl algo | sh'");
    expect(problema).not.toBeNull();
    expect(problema).toMatch(/executar um comando/i);
  });

  it("recusa endereço local, vazio, com espaço e começando com flag", () => {
    expect(validarUrlRemoto("file:///c/Users/alguem/repo")).not.toBeNull();
    expect(validarUrlRemoto("")).not.toBeNull();
    expect(validarUrlRemoto("   ")).not.toBeNull();
    expect(validarUrlRemoto("https://github.com/a b/c")).not.toBeNull();
    expect(validarUrlRemoto("--upload-pack=rm")).not.toBeNull();
    expect(validarUrlRemoto("http://github.com/u/r.git")).not.toBeNull(); // sem TLS
  });

  it("recusa caractere de controle que NÃO é espaço em branco", () => {
    // A metade do range que `\s` NÃO cobre. Um controle no meio da URL some no
    // terminal e esconde o que vem depois — o mesmo risco do espaço.
    // Escritos como ESCAPE de propósito: controle CRU no fonte faz o git tratar o
    // arquivo como binário, e aí o diff desta própria validação deixa de ser revisável.
    expect(validarUrlRemoto("https://github.com/u/r.git\u0001")).not.toBeNull();
    expect(validarUrlRemoto("https://github.com/u\u001B[2K/r.git")).not.toBeNull();
    expect(validarUrlRemoto("https://github.com/u/r.git\u0000algo")).not.toBeNull();
  });
});

describe("dirDoRepo", () => {
  it("resolve a fábrica e barra travessia de caminho", () => {
    const raiz = mkdtempSync(join(tmpdir(), "raiz-"));
    try {
      mkdirSync(join(raiz, "projetos", "demo"), { recursive: true });
      expect(dirDoRepo(raiz, "_fabrica")).toBe(raiz);
      expect(dirDoRepo(raiz, "demo")).toBe(join(raiz, "projetos", "demo"));
      expect(dirDoRepo(raiz, "..")).toBeNull();
      expect(dirDoRepo(raiz, "../..")).toBeNull();
      expect(dirDoRepo(raiz, "nao-existe")).toBeNull();
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});

describe("definirRemoto / lerRemoto", () => {
  it("grava, troca e lê o endereço", async () => {
    const dir = repoTemp();
    try {
      expect(await lerRemoto(dir)).toBeNull();

      await definirRemoto(dir, "https://github.com/usuario/repo.git");
      expect(await lerRemoto(dir)).toBe("https://github.com/usuario/repo.git");

      // Trocar precisa usar set-url (add falharia com "remote origin already exists").
      await definirRemoto(dir, "git@github.com:usuario/outro.git");
      expect(await lerRemoto(dir)).toBe("git@github.com:usuario/outro.git");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("recusa URL inválida sem tocar no repositório", async () => {
    const dir = repoTemp();
    try {
      await expect(definirRemoto(dir, "ext::sh -c evil")).rejects.toBeInstanceOf(ErroPublicacao);
      expect(await lerRemoto(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("lerEstadoPublicacao", () => {
  it("sem upstream: conta o total local e avisa que nunca foi publicado", async () => {
    const dir = repoTemp();
    try {
      commitar(dir, "a.txt");
      commitar(dir, "b.txt");

      const estado = await lerEstadoPublicacao(dir);
      expect(estado.temUpstream).toBe(false);
      expect(estado.aFrente).toBeNull();
      expect(estado.totalLocal).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("publicar", () => {
  it("publica de verdade num remoto bare e cria o upstream na primeira vez", async () => {
    const dir = repoTemp();
    const bare = bareTemp();
    try {
      commitar(dir, "a.txt");
      // Remoto local: legítimo para o git, mas recusado por `validarUrlRemoto` — por
      // isso entra direto, sem passar por `definirRemoto`.
      execFileSync("git", ["remote", "add", "origin", bare], { cwd: dir });

      const r = await publicar(dir);
      expect(r.criouUpstream).toBe(true);
      expect(r.branch).toBe("main");
      expect(r.publicados).toBe(1);

      // O commit chegou mesmo do outro lado.
      const noRemoto = execFileSync("git", ["log", "--oneline"], {
        cwd: bare,
        encoding: "utf8",
      });
      expect(noRemoto).toContain("add a.txt");

      // Agora tem upstream e nada pendente.
      const estado = await lerEstadoPublicacao(dir);
      expect(estado.temUpstream).toBe(true);
      expect(estado.aFrente).toBe(0);

      // Segundo push: só o commit novo.
      commitar(dir, "b.txt");
      const r2 = await publicar(dir);
      expect(r2.criouUpstream).toBe(false);
      expect(r2.publicados).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(bare, { recursive: true, force: true });
    }
  }, 30_000);

  it("recusa sem remoto, sem nada a publicar e fora de repositório", async () => {
    const semRemoto = repoTemp();
    const naoRepo = mkdtempSync(join(tmpdir(), "nao-"));
    const dir = repoTemp();
    const bare = bareTemp();
    try {
      commitar(semRemoto, "a.txt");
      await expect(publicar(semRemoto)).rejects.toThrow(/endereço.*configurado/i);

      await expect(publicar(naoRepo)).rejects.toThrow(/repositório git/i);

      commitar(dir, "a.txt");
      execFileSync("git", ["remote", "add", "origin", bare], { cwd: dir });
      await publicar(dir);
      await expect(publicar(dir)).rejects.toThrow(/em dia/i);
    } finally {
      for (const d of [semRemoto, naoRepo, dir, bare]) {
        rmSync(d, { recursive: true, force: true });
      }
    }
  }, 30_000);
});

describe("listarRepos", () => {
  it("lista a fábrica primeiro e depois os projetos, marcando o que não é repo", async () => {
    const raiz = repoTemp();
    try {
      commitar(raiz, "sistema.txt");
      const projeto = join(raiz, "projetos", "alfa");
      mkdirSync(projeto, { recursive: true });
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: projeto });
      execFileSync("git", ["config", "user.name", "Teste"], { cwd: projeto });
      execFileSync("git", ["config", "user.email", "teste@exemplo.com"], { cwd: projeto });
      commitar(projeto, "codigo.txt");
      await definirRemoto(projeto, "https://github.com/usuario/alfa.git");

      // Pasta que é projeto mas ainda não é repositório: tem que aparecer assim mesmo.
      mkdirSync(join(raiz, "projetos", "beta"), { recursive: true });

      const repos = await listarRepos(raiz);
      expect(repos.map((r) => r.id)).toEqual(["_fabrica", "alfa", "beta"]);
      expect(repos[0]?.ehFabrica).toBe(true);

      const alfa = repos.find((r) => r.id === "alfa");
      expect(alfa?.ehRepo).toBe(true);
      expect(alfa?.remoto).toBe("https://github.com/usuario/alfa.git");
      expect(alfa?.branch).toBe("main");
      expect(alfa?.temUpstream).toBe(false);

      const beta = repos.find((r) => r.id === "beta");
      expect(beta?.ehRepo).toBe(false);
      expect(beta?.remoto).toBeNull();
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  }, 30_000);
});
