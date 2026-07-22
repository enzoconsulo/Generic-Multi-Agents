import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lerFabrica } from "../../src/fabrica/index.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(aqui, "..", "fixtures", "fabrica-falsa");

describe("lerFabrica (mini-fábrica de fixtures)", () => {
  it("lista apenas diretórios de projetos/, em ordem, sem erros na raiz", async () => {
    const estado = await lerFabrica(FIXTURE);
    expect(estado.erros).toEqual([]);
    // solto.txt não é diretório e não pode virar projeto.
    expect(estado.projetos.map((p) => p.nome)).toEqual(["alfa", "beta"]);
  });

  it("resume o alfa: contagem por status, fase atual e tarefas com frontmatter completo", async () => {
    const estado = await lerFabrica(FIXTURE);
    const alfa = estado.projetos.find((p) => p.nome === "alfa");
    expect(alfa).toBeDefined();
    if (alfa === undefined) return;

    expect(alfa.tarefas).toHaveLength(5);

    // Só os status válidos entram na contagem (T-003 "fritando" e T-004 quebrada ficam de fora).
    expect(alfa.contagemPorStatus).toEqual({
      backlog: 1,
      pronta: 0,
      "em-execucao": 1,
      "em-teste": 0,
      "em-revisao": 0,
      concluida: 1,
      bloqueada: 0,
      cancelada: 0,
    });

    // Fase atual = primeira fase com Marco pendente (a 1 está aprovada).
    expect(alfa.faseAtual?.nome).toBe("Fase 2 — Núcleo");
    expect(alfa.faseAtual?.marco.estado).toBe("pendente");

    // Frontmatter completo de uma tarefa bem-formada.
    const t1 = alfa.tarefas.find((t) => t.id === "T-001");
    expect(t1).toMatchObject({
      arquivo: "T-001-fundacao.md",
      id: "T-001",
      titulo: "Montar a fundação do alfa",
      status: "concluida",
      prioridade: "alta",
      dependencias: [],
      areas: ["src/"],
      tentativas: 1,
      replanejadaDe: null,
      criada: "2026-07-01",
      atualizada: "2026-07-15",
      erros: [],
    });

    const t2 = alfa.tarefas.find((t) => t.id === "T-002");
    expect(t2?.dependencias).toEqual(["T-001"]);
    expect(t2?.areas).toEqual(["src/nucleo/", "src/api/"]);
    expect(t2?.tentativas).toBe(2);

    const t5 = alfa.tarefas.find((t) => t.id === "T-005");
    expect(t5?.replanejadaDe).toBe("T-099");

    // O resumo não carrega o corpo das tarefas.
    for (const tarefa of alfa.tarefas) {
      expect("secoes" in tarefa).toBe(false);
    }
  });

  it("tarefa com status desconhecido aparece com erros e mantém o valor bruto", async () => {
    const estado = await lerFabrica(FIXTURE);
    const alfa = estado.projetos.find((p) => p.nome === "alfa");
    const t3 = alfa?.tarefas.find((t) => t.id === "T-003");
    expect(t3?.status).toBe("fritando");
    expect(t3?.erros.some((e) => e.includes("status desconhecido"))).toBe(true);
  });

  it("tarefa com frontmatter inválido entra no resultado com erros e não derruba o scan", async () => {
    const estado = await lerFabrica(FIXTURE);
    const alfa = estado.projetos.find((p) => p.nome === "alfa");
    expect(alfa?.tarefas).toHaveLength(5); // as outras 4 continuam presentes

    const quebrada = alfa?.tarefas.find((t) => t.arquivo === "T-004-quebrada.md");
    expect(quebrada).toBeDefined();
    expect(quebrada?.id).toBe("T-004"); // recuperado do nome do arquivo
    expect(quebrada?.erros.some((e) => e.includes("frontmatter inválido"))).toBe(true);
  });

  it("projeto sem _gestao/ aparece com erros, zero tarefas e fase nula", async () => {
    const estado = await lerFabrica(FIXTURE);
    const beta = estado.projetos.find((p) => p.nome === "beta");
    expect(beta?.erros).toContain("projeto sem pasta _gestao/");
    expect(beta?.tarefas).toEqual([]);
    expect(beta?.faseAtual).toBeNull();
    expect(Object.values(beta?.contagemPorStatus ?? {}).every((n) => n === 0)).toBe(true);
  });

  it("plano com fase sem linha Marco: sobe como erro do projeto (sem exceção)", async () => {
    const estado = await lerFabrica(FIXTURE);
    const alfa = estado.projetos.find((p) => p.nome === "alfa");
    expect(
      alfa?.erros.some((e) => e.startsWith("PLANO.md:") && e.includes("sem linha Marco")),
    ).toBe(true);
  });

  it("lê as ideias (excluindo README.md) com status validado", async () => {
    const estado = await lerFabrica(FIXTURE);
    expect(estado.ideias.map((i) => i.arquivo)).toEqual([
      "2026-07-10-modo-relatorio.md",
      "2026-07-12-atalhos-teclado.md",
      "2026-07-13-ideia-estranha.md",
    ]);

    const [nova, roteada, estranha] = estado.ideias;
    expect(nova).toMatchObject({
      titulo: "Modo relatório semanal",
      status: "nova",
      data: "2026-07-10",
      erros: [],
    });
    expect(roteada?.status).toBe("roteada");
    // Status fora do vocabulário: erro registrado, título cai para o slug do arquivo.
    expect(estranha?.status).toBe("talvez");
    expect(estranha?.erros.some((e) => e.includes("status desconhecido"))).toBe(true);
    expect(estranha?.titulo).toBe("ideia-estranha");
  });

  it("retorna o log diário mais recente (ignorando arquivos sem nome de data)", async () => {
    const estado = await lerFabrica(FIXTURE);
    expect(estado.logMaisRecente?.arquivo).toBe("2026-07-20.md");
    expect(estado.logMaisRecente?.data).toBe("2026-07-20");
    expect(estado.logMaisRecente?.conteudo).toContain("Dia mais recente");
  });

  it("raiz inexistente não lança: devolve estado vazio com erro registrado", async () => {
    const estado = await lerFabrica(join(FIXTURE, "nao-existe"));
    expect(estado.projetos).toEqual([]);
    expect(estado.ideias).toEqual([]);
    expect(estado.logMaisRecente).toBeNull();
    expect(estado.erros.some((e) => e.includes("projetos/"))).toBe(true);
  });
});
