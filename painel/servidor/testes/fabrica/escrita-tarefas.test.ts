import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { anexarNaSecao, gravarStatusTarefa } from "../../src/fabrica/escrita-tarefas.js";

function arquivoTarefa(conteudo: string, nl = "\n"): string {
  const dir = mkdtempSync(join(tmpdir(), "escrita-"));
  const caminho = join(dir, "T-001-x.md");
  writeFileSync(caminho, conteudo.split("\n").join(nl), "utf8");
  return caminho;
}

const TAREFA = [
  "---",
  "id: T-001",
  "titulo: Uma tarefa",
  "status: backlog",
  "prioridade: alta",
  "dependencias: [T-000]",
  "areas: [server/a.js]",
  "tentativas: 0",
  "agente: engine",
  "criada: 2026-07-30",
  "atualizada: 2026-07-30",
  "---",
  "",
  "## Objetivo",
  "Fazer algo.",
  "",
  "## Critérios de aceite",
  "- [ ] funciona",
  "",
  "## Verificação",
  "",
  "## Revisão",
  "",
].join("\n");

describe("gravarStatusTarefa", () => {
  it("troca o status e atualiza a data", async () => {
    const a = arquivoTarefa(TAREFA);
    const r = await gravarStatusTarefa(a, "pronta", "2026-08-02");

    expect(r).toEqual({ ok: true, de: "backlog", para: "pronta" });
    const texto = readFileSync(a, "utf8");
    expect(texto).toContain("status: pronta");
    expect(texto).toContain("atualizada: 2026-08-02");
  });

  /**
   * A invariante que justifica não usar `gray-matter` para ESCREVER: reserializar
   * reescreveria aspas, ordem de chaves e formatação do arquivo inteiro, e o diff da tarefa
   * viraria ruído — matando a revisão humana, que é o principal uso do arquivo.
   */
  it("não toca em NADA além das duas linhas que mudaram", async () => {
    const a = arquivoTarefa(TAREFA);
    await gravarStatusTarefa(a, "pronta", "2026-08-02");
    const depois = readFileSync(a, "utf8").split("\n");
    const antes = TAREFA.split("\n");

    expect(depois).toHaveLength(antes.length);
    const diferentes = depois.filter((l, i) => l !== antes[i]);
    expect(diferentes).toEqual(["status: pronta", "atualizada: 2026-08-02"]);
  });

  // O repositório vive em Windows e faz checkout CRLF: reescrever com \n sujaria o arquivo
  // inteiro no git, e todo commit de tarefa viraria "arquivo todo alterado".
  it("preserva CRLF", async () => {
    const a = arquivoTarefa(TAREFA, "\r\n");
    await gravarStatusTarefa(a, "pronta", "2026-08-02");
    const texto = readFileSync(a, "utf8");
    expect(texto).toContain("\r\n");
    expect(texto).not.toMatch(/[^\r]\n/);
  });

  it("status igual não reescreve o arquivo nem mente sobre a data", async () => {
    const a = arquivoTarefa(TAREFA);
    const r = await gravarStatusTarefa(a, "backlog", "2026-08-02");
    expect(r.ok).toBe(true);
    expect(readFileSync(a, "utf8")).toContain("atualizada: 2026-07-30");
  });

  // Nunca lança: arquivo torto não pode derrubar o pipeline no meio de uma rodada.
  it("arquivo sem frontmatter devolve erro em vez de explodir", async () => {
    const a = arquivoTarefa("# Só um markdown\n\nsem frontmatter\n");
    const r = await gravarStatusTarefa(a, "pronta");
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("frontmatter") });
  });

  it("frontmatter sem campo status devolve erro", async () => {
    const a = arquivoTarefa("---\nid: T-001\n---\n\n## Objetivo\n");
    const r = await gravarStatusTarefa(a, "pronta");
    expect(r.ok).toBe(false);
  });

  it("arquivo inexistente devolve erro", async () => {
    const r = await gravarStatusTarefa(join(tmpdir(), "nao-existe-xyz.md"), "pronta");
    expect(r.ok).toBe(false);
  });

  // `status:` também aparece no corpo de algumas tarefas (em citações do protocolo): só a
  // PRIMEIRA ocorrência, e só dentro do frontmatter, pode ser tocada.
  it("não confunde `status:` do corpo com o do frontmatter", async () => {
    const a = arquivoTarefa(
      ["---", "id: T-1", "status: backlog", "---", "", "## Objetivo", "status: isso é texto", ""].join(
        "\n",
      ),
    );
    await gravarStatusTarefa(a, "pronta", "2026-08-02");
    const texto = readFileSync(a, "utf8");
    expect(texto).toContain("status: pronta");
    expect(texto).toContain("status: isso é texto");
  });
});

describe("anexarNaSecao", () => {
  it("anexa dentro da seção existente, não no fim do arquivo", async () => {
    const a = arquivoTarefa(TAREFA);
    await anexarNaSecao(a, "Verificação", "### Passada mecânica\n- [executado] ok");

    const texto = readFileSync(a, "utf8");
    const posVerificacao = texto.indexOf("## Verificação");
    const posRevisao = texto.indexOf("## Revisão");
    const posTexto = texto.indexOf("Passada mecânica");
    expect(posTexto).toBeGreaterThan(posVerificacao);
    expect(posTexto).toBeLessThan(posRevisao);
  });

  it("preserva o conteúdo que já existia na seção", async () => {
    const a = arquivoTarefa(TAREFA.replace("## Verificação\n", "## Verificação\nJá tinha isto.\n"));
    await anexarNaSecao(a, "Verificação", "linha nova");
    const texto = readFileSync(a, "utf8");
    expect(texto).toContain("Já tinha isto.");
    expect(texto).toContain("linha nova");
  });

  // Perder o relatório em silêncio seria pior que um título fora de ordem.
  it("seção inexistente é criada no fim em vez de o texto se perder", async () => {
    const a = arquivoTarefa("---\nid: T-1\nstatus: pronta\n---\n\n## Objetivo\nx\n");
    await anexarNaSecao(a, "Verificação", "relatório");
    const texto = readFileSync(a, "utf8");
    expect(texto).toContain("## Verificação");
    expect(texto).toContain("relatório");
  });

  it("texto vazio não mexe no arquivo", async () => {
    const a = arquivoTarefa(TAREFA);
    const antes = readFileSync(a, "utf8");
    const r = await anexarNaSecao(a, "Verificação", "   ");
    expect(r.ok).toBe(true);
    expect(readFileSync(a, "utf8")).toBe(antes);
  });

  it("preserva CRLF", async () => {
    const a = arquivoTarefa(TAREFA, "\r\n");
    await anexarNaSecao(a, "Verificação", "linha");
    expect(readFileSync(a, "utf8")).not.toMatch(/[^\r]\n/);
  });
});
