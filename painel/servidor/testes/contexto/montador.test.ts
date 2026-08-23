import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  aproxTokens,
  montarCompartilhado,
  montarContexto,
  montarEspecifico,
  papelDoAgente,
  resolverArea,
  semCabecalhoVolatil,
  TETO_ESPECIFICO_BYTES,
} from "../../src/contexto/montador.js";

/** Projeto de mentira em pasta temporária — mesma receita dos outros testes de fábrica. */
function projetoFake(): string {
  const dir = mkdtempSync(join(tmpdir(), "montador-"));
  mkdirSync(join(dir, "_gestao"), { recursive: true });
  mkdirSync(join(dir, "server"), { recursive: true });
  writeFileSync(join(dir, "CLAUDE.md"), "# projeto-teste\nStack: Node.\n", "utf8");
  writeFileSync(
    join(dir, "_gestao", "MAPA.md"),
    [
      "# MAPA — projeto-teste",
      "",
      "<!-- GERADO por _sistema/ferramentas/mapa.mjs. NÃO editar à mão. HEAD: abc1234 · 2026-08-01 -->",
      "",
      "## Símbolos públicos por arquivo",
      "- `somar(a, b)` → `number`",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(join(dir, "server", "a.js"), "export function somar(a, b) { return a + b; }\n", "utf8");
  writeFileSync(join(dir, "server", "b.js"), "export const NOME = 'b';\n", "utf8");
  return dir;
}

describe("papelDoAgente", () => {
  it("mapeia os nomes fixos das DUAS trilhas", () => {
    expect(papelDoAgente("executor")).toBe("construtor");
    expect(papelDoAgente("construtor")).toBe("construtor");
    expect(papelDoAgente("testador")).toBe("verificador");
    expect(papelDoAgente("conferente")).toBe("verificador");
    expect(papelDoAgente("revisor")).toBe("revisor");
    expect(papelDoAgente("revisor-generico")).toBe("revisor");
    expect(papelDoAgente("planejador")).toBe("planejador");
  });

  // As duas formas que o despacho real produz e que um mapa cru de nomes erraria.
  it("enxerga através do sufixo -reforcado e do prefixo <projeto>__", () => {
    expect(papelDoAgente("executor-reforcado")).toBe("construtor");
    expect(papelDoAgente("revisor-generico")).toBe("revisor");
    expect(papelDoAgente("banco-imobiliario__engine")).toBe("construtor");
    expect(papelDoAgente("banco-imobiliario__engine-reforcado")).toBe("construtor");
  });

  // Especialista tem nome cunhado pelo planejador: não há lista para consultar.
  it("nome desconhecido cai em construtor, que é o papel que recebe MAIS contexto", () => {
    expect(papelDoAgente("engine")).toBe("construtor");
    expect(papelDoAgente("diagramador-de-slides")).toBe("construtor");
    expect(papelDoAgente("")).toBe("construtor");
  });
});

describe("semCabecalhoVolatil", () => {
  // É o detalhe de que depende TODO o ganho de cache da I2: hash e data mudam a cada
  // commit, e o bloco compartilhado precisa ser byte-idêntico entre despachos.
  it("remove o comentário de geração, que carrega hash e data", () => {
    const mapa = "# MAPA\n\n<!-- GERADO por x. HEAD: abc1234 · 2026-08-01 -->\n\n## Conteúdo\n";
    const limpo = semCabecalhoVolatil(mapa);
    expect(limpo).not.toContain("abc1234");
    expect(limpo).not.toContain("2026-08-01");
    expect(limpo).toContain("## Conteúdo");
  });

  it("dois MAPAs que só diferem no cabeçalho ficam idênticos", () => {
    const a = "# M\n<!-- GERADO por x. HEAD: aaa · 2026-08-01 -->\n\ncorpo\n";
    const b = "# M\n<!-- GERADO por x. HEAD: bbb · 2026-09-02 -->\n\ncorpo\n";
    expect(semCabecalhoVolatil(a)).toBe(semCabecalhoVolatil(b));
  });

  it("mapa sem cabeçalho passa intacto", () => {
    expect(semCabecalhoVolatil("# M\n\ncorpo\n").trim()).toBe("# M\n\ncorpo");
  });
});

describe("resolverArea (entrada NÃO confiável — vem de um modelo)", () => {
  it("aceita caminho relativo dentro do projeto", () => {
    expect(resolverArea("/proj", "server/a.js")).toContain("a.js");
    expect(resolverArea("/proj", "server\\a.js")).toContain("a.js");
  });

  it("recusa travessia, caminho absoluto e vazio", () => {
    expect(resolverArea("/proj", "../fora.js")).toBeNull();
    expect(resolverArea("/proj", "../../etc/passwd")).toBeNull();
    expect(resolverArea("/proj", "/etc/passwd")).toBeNull();
    expect(resolverArea("/proj", "C:\\Windows\\win.ini")).toBeNull();
    expect(resolverArea("/proj", "")).toBeNull();
    expect(resolverArea("/proj", "   ")).toBeNull();
  });
});

describe("montarCompartilhado", () => {
  it("junta CLAUDE.md e MAPA, sem o cabeçalho volátil", async () => {
    const dir = projetoFake();
    const bloco = await montarCompartilhado(dir);
    expect(bloco).toContain("projeto-teste");
    expect(bloco).toContain("somar(a, b)");
    expect(bloco).not.toContain("abc1234");
  });

  // O bloco só serve para cache se for estável: duas montagens têm de dar o mesmo byte.
  it("é determinístico entre chamadas", async () => {
    const dir = projetoFake();
    expect(await montarCompartilhado(dir)).toBe(await montarCompartilhado(dir));
  });

  // Projeto importado à mão ou recém-criado pode não ter `_gestao/` — caso legítimo.
  it("projeto sem MAPA e sem CLAUDE.md devolve bloco vazio em vez de falhar", async () => {
    const dir = mkdtempSync(join(tmpdir(), "montador-vazio-"));
    expect(await montarCompartilhado(dir)).toBe("");
  });
});

describe("montarEspecifico — cada papel recebe o que usa", () => {
  it("construtor recebe o conteúdo das areas", async () => {
    const dir = projetoFake();
    const r = await montarEspecifico({
      dirProjeto: dir,
      papel: "construtor",
      areas: ["server/a.js", "server/b.js"],
    });
    expect(r.texto).toContain("export function somar");
    expect(r.texto).toContain("export const NOME");
    expect(r.medida.arquivosIncluidos).toEqual(["server/a.js", "server/b.js"]);
  });

  // É a economia da I4: o revisor julga o diff, não o projeto em volta dele.
  it("revisor NÃO recebe fonte, mesmo com areas preenchidas", async () => {
    const dir = projetoFake();
    const r = await montarEspecifico({
      dirProjeto: dir,
      papel: "revisor",
      areas: ["server/a.js"],
      hashCommit: null,
    });
    expect(r.texto).not.toContain("export function somar");
    expect(r.medida.arquivosIncluidos).toEqual([]);
  });

  it("planejador não recebe fonte nenhum", async () => {
    const dir = projetoFake();
    const r = await montarEspecifico({
      dirProjeto: dir,
      papel: "planejador",
      areas: ["server/a.js"],
    });
    expect(r.texto).not.toContain("export function somar");
  });

  // `areas` nomeia também o arquivo que a tarefa VAI criar — não é erro.
  it("arquivo inexistente vira menção, não falha", async () => {
    const dir = projetoFake();
    const r = await montarEspecifico({
      dirProjeto: dir,
      papel: "construtor",
      areas: ["server/a.js", "tests/novo.test.js"],
    });
    expect(r.medida.arquivosIncluidos).toEqual(["server/a.js"]);
    expect(r.medida.omitidos[0]?.caminho).toBe("tests/novo.test.js");
    expect(r.texto).toContain("<nao-embutido>");
  });

  /**
   * DIRETÓRIO NÃO É "ARQUIVO QUE SERÁ CRIADO" (23/08).
   *
   * A T-059 do banco-imobiliario declarou `areas: [public/css, public/js]`. As duas leituras
   * falharam, e o montador anunciou ao agente "ainda não existe (será criado por esta
   * tarefa)" — sobre pastas cheias de arquivos. O agente foi trabalhar com ZERO arquivo
   * embutido, acreditando que partia do nada; a tarefa levou dois ciclos e um `opus`, e foi
   * a única tarefa recente com `0 arquivo(s) embutido(s)` no log.
   *
   * Mentir sobre o estado do projeto é pior que omitir: omissão o agente investiga, mentira
   * ele acredita.
   */
  it("diretório em `areas` é denunciado como diretório, não como arquivo a criar", async () => {
    const dir = projetoFake();
    const r = await montarEspecifico({
      dirProjeto: dir,
      papel: "construtor",
      areas: ["server"],
    });
    expect(r.medida.arquivosIncluidos).toEqual([]);
    expect(r.medida.omitidos[0]?.motivo).toContain("DIRETÓRIO");
    expect(r.medida.omitidos[0]?.motivo).not.toContain("será criado");
    // Não expandimos a pasta: embutir diretório inteiro estoura o teto e desfaz o motivo de
    // o montador existir. O agente é mandado localizar com Glob/Grep.
    expect(r.texto).not.toContain("export function somar");
  });

  it("caminho fora do projeto é omitido com motivo", async () => {
    const dir = projetoFake();
    const r = await montarEspecifico({
      dirProjeto: dir,
      papel: "construtor",
      areas: ["../../fora.js"],
    });
    expect(r.medida.arquivosIncluidos).toEqual([]);
    expect(r.medida.omitidos[0]?.motivo).toContain("fora do projeto");
  });

  // A regra "denso ou nada": embutir o que o agente não vai usar é PIOR que não embutir,
  // porque é relido a cada volta de API.
  it("respeita o teto: o que estoura vira menção com instrução de ler", async () => {
    const dir = projetoFake();
    writeFileSync(join(dir, "server", "grande.js"), "x".repeat(5000), "utf8");
    const r = await montarEspecifico({
      dirProjeto: dir,
      papel: "construtor",
      areas: ["server/grande.js", "server/a.js"],
      tetoBytes: 1000,
    });
    expect(r.medida.arquivosIncluidos).toEqual(["server/a.js"]);
    expect(r.medida.omitidos[0]?.motivo).toContain("teto");
  });

  it("revisor sem hash registra a ausência em vez de ficar em silêncio", async () => {
    const dir = projetoFake();
    const r = await montarEspecifico({ dirProjeto: dir, papel: "revisor", hashCommit: "" });
    expect(r.medida.omitidos[0]?.motivo).toContain("sem hash");
  });

  it("revisor com hash inválido não roda git e diz o que fazer", async () => {
    const dir = projetoFake();
    const r = await montarEspecifico({
      dirProjeto: dir,
      papel: "revisor",
      hashCommit: "--upload-pack=x",
    });
    expect(r.medida.arquivosIncluidos).toEqual([]);
    expect(r.medida.omitidos[0]?.motivo).toContain("git show");
  });
});

describe("montarContexto", () => {
  it("devolve os dois blocos medidos", async () => {
    const dir = projetoFake();
    const c = await montarContexto({
      dirProjeto: dir,
      papel: "construtor",
      areas: ["server/a.js"],
    });
    expect(c.medida.compartilhadoTok).toBeGreaterThan(0);
    expect(c.medida.especificoTok).toBeGreaterThan(0);
    expect(c.compartilhado).toContain("<mapa-do-projeto>");
    expect(c.especifico).toContain("<contexto-da-tarefa>");
  });

  // A invariante da I2: o bloco compartilhado NÃO pode variar com o papel nem com a tarefa,
  // senão nenhum despacho reaproveita o cache do anterior.
  it("o bloco compartilhado é o MESMO para papéis diferentes", async () => {
    const dir = projetoFake();
    const a = await montarContexto({ dirProjeto: dir, papel: "construtor", areas: ["server/a.js"] });
    const b = await montarContexto({ dirProjeto: dir, papel: "revisor", hashCommit: null });
    expect(a.compartilhado).toBe(b.compartilhado);
    expect(a.especifico).not.toBe(b.especifico);
  });
});

describe("aproxTokens", () => {
  it("é bytes/4 e conta multibyte pelos BYTES", () => {
    expect(aproxTokens("abcd")).toBe(1);
    expect(aproxTokens("çç")).toBe(1); // 4 bytes em UTF-8
    expect(aproxTokens("")).toBe(0);
  });
});

describe("TETO_ESPECIFICO_BYTES", () => {
  it("é o valor de produção documentado (60 kB ≈ 15k tokens)", () => {
    expect(TETO_ESPECIFICO_BYTES).toBe(60 * 1024);
  });
});
