import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { catalogoAcoes, IDS_ACOES } from "../../src/fabrica/catalogo-acoes.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ_COMANDOS = resolve(aqui, "fixtures", "raiz-comandos");
// Este projeto vive em <fabrica>/projetos/painel-fabrica/servidor/testes/rotas.
// O painel é ferramenta de sistema em <fabrica>/painel: raiz da fábrica = 4 níveis acima
// de testes/rotas/ (painel/servidor/testes/rotas → painel → fábrica).
const RAIZ_FABRICA_REAL = resolve(aqui, "..", "..", "..", "..");

const ORDEM_CANONICA = [
  "novo-projeto",
  "ideia",
  "trabalhar",
  "status",
  "encerrar-dia",
  "manutencao",
];

/**
 * Leitura INDEPENDENTE do frontmatter para o teste de contrato: pares `chave: valor`
 * entre as cercas `---` (não reusa o parser do módulo). A comparação é SEMÂNTICA, não
 * literal: escalar YAML entre aspas (`argument-hint: "[x]"`) equivale ao valor sem as
 * aspas — é o que o parser de produção (YAML válido) e o Claude Code entregam.
 */
function camposDoArquivo(texto: string): Record<string, string> {
  const campos: Record<string, string> = {};
  const linhas = texto.split(/\r?\n/);
  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i] ?? "";
    if (linha.trim() === "---") break;
    const par = /^([\w-]+):\s*(.*)$/.exec(linha);
    if (par?.[1] !== undefined) campos[par[1]] = desembrulharEscalar((par[2] ?? "").trim());
  }
  return campos;
}

/**
 * Desfaz o embrulho de um escalar YAML de linha única: aspas duplas envolventes (com
 * `\"` e `\\` desescapados) ou aspas simples envolventes (`''` vira `'`). Qualquer
 * outro valor (escalar plano) volta intacto.
 */
function desembrulharEscalar(bruto: string): string {
  if (bruto.length >= 2 && bruto.startsWith('"') && bruto.endsWith('"')) {
    return bruto.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  if (bruto.length >= 2 && bruto.startsWith("'") && bruto.endsWith("'")) {
    return bruto.slice(1, -1).replace(/''/g, "'");
  }
  return bruto;
}

describe("catalogoAcoes (fixture raiz-comandos)", () => {
  it("retorna as 6 ações na ordem canônica, todas disponíveis e com nome /<id>", async () => {
    const acoes = await catalogoAcoes(RAIZ_COMANDOS);
    expect(acoes.map((a) => a.id)).toEqual(ORDEM_CANONICA);
    for (const acao of acoes) {
      expect(acao.nome).toBe(`/${acao.id}`);
      expect(acao.disponivel).toBe(true);
      expect(acao.descricao.length).toBeGreaterThan(0);
    }
  });

  it("arquivo com YAML válido é a fonte dos dois campos (com e sem argument-hint)", async () => {
    const acoes = await catalogoAcoes(RAIZ_COMANDOS);

    const novoProjeto = acoes.find((a) => a.id === "novo-projeto");
    expect(novoProjeto?.descricao).toBe("Cria um projeto de exemplo na fixture de comandos");
    expect(novoProjeto?.argumentos).toBe("<nome> — <descrição>");

    // Arquivo presente SEM argument-hint: ação sem argumentos (null), não fallback.
    const trabalhar = acoes.find((a) => a.id === "trabalhar");
    expect(trabalhar?.descricao).toBe("Descrição de teste do trabalhar, sem argument-hint");
    expect(trabalhar?.argumentos).toBeNull();
  });

  it("YAML inválido com linhas recuperáveis preserva o texto literal do arquivo", async () => {
    // Padrão dos comandos REAIS da fábrica: argument-hint começando com "[" quebra o
    // js-yaml, mas o arquivo continua sendo a fonte de verdade dos campos.
    const acoes = await catalogoAcoes(RAIZ_COMANDOS);
    const status = acoes.find((a) => a.id === "status");
    expect(status?.descricao).toBe("Painel de teste da fixture");
    expect(status?.argumentos).toBe("[nome-do-projeto] (vazio = tudo)");
  });

  it("frontmatter-lixo (sem linha description) usa o fallback inteiro, sem lançar", async () => {
    const acoes = await catalogoAcoes(RAIZ_COMANDOS);
    const manutencao = acoes.find((a) => a.id === "manutencao");
    expect(manutencao?.descricao).toContain("integridade da fábrica");
    expect(manutencao?.argumentos).toBeNull();
  });

  it("arquivo ausente usa o fallback em PT-BR", async () => {
    const acoes = await catalogoAcoes(RAIZ_COMANDOS);

    const ideia = acoes.find((a) => a.id === "ideia");
    expect(ideia?.descricao).toContain("caixa de entrada");
    expect(ideia?.argumentos).toContain("texto da ideia");

    // Ação sem argumentos também no fallback.
    expect(acoes.find((a) => a.id === "encerrar-dia")?.argumentos).toBeNull();
  });

  it("raiz inexistente não lança: 6 ações inteiras de fallback", async () => {
    const acoes = await catalogoAcoes(join(RAIZ_COMANDOS, "nao-existe"));
    expect(acoes.map((a) => a.id)).toEqual(ORDEM_CANONICA);
    for (const acao of acoes) {
      expect(acao.descricao.length).toBeGreaterThan(0);
      expect(acao.disponivel).toBe(true);
    }
  });
});

describe("catalogoAcoes contra a fábrica real (contrato vivo)", () => {
  it("descrições e argumentos batem com os arquivos .claude/commands/*.md", async () => {
    const acoes = await catalogoAcoes(RAIZ_FABRICA_REAL);
    expect(acoes).toHaveLength(6);

    for (const id of IDS_ACOES) {
      const texto = await readFile(
        join(RAIZ_FABRICA_REAL, ".claude", "commands", `${id}.md`),
        "utf8",
      );
      const campos = camposDoArquivo(texto);
      expect(campos.description, `${id}.md sem description`).toBeTruthy();

      const acao = acoes.find((a) => a.id === id);
      expect(acao?.descricao, `descricao de ${id}`).toBe(campos.description);
      expect(acao?.argumentos, `argumentos de ${id}`).toBe(campos["argument-hint"] ?? null);
    }
  });
});
