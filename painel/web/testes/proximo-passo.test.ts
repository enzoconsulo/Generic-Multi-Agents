import { describe, expect, it } from "vitest";
import { proximoPasso } from "../src/paginas/projeto/proximo-passo";
import type { Job, ProjetoDetalhe, TarefaCompleta } from "../src/lib/tipos";

function tarefa(status: string): TarefaCompleta {
  return {
    arquivo: `T-${status}.md`,
    id: "T-001",
    titulo: "Tarefa",
    status,
    prioridade: "media",
    dependencias: [],
    areas: [],
    tentativas: 0,
    replanejadaDe: null,
    agente: null,
    criada: null,
    atualizada: null,
    erros: [],
    secoes: {
      objetivo: "",
      contexto: "",
      criteriosAceite: "",
      notasExecucao: "",
      verificacao: "",
      revisao: "",
    },
  };
}

function projeto(tarefas: TarefaCompleta[], analise: string | null = null): ProjetoDetalhe {
  return {
    nome: "meu-projeto",
    tarefas,
    contagemPorStatus: {} as ProjetoDetalhe["contagemPorStatus"],
    faseAtual: null,
    plano: null,
    equipe: { agentes: [], erros: [] },
    decisoes: null,
    progresso: null,
    analise,
    erros: [],
  };
}

const jobRodando: Job = {
  id: "j1",
  tipo: "claude",
  titulo: "/trabalhar meu-projeto",
  escopo: "projeto:meu-projeto",
  usaClaude: true,
  params: {},
  estado: "executando",
  criadoEm: new Date().toISOString(),
};

describe("proximoPasso", () => {
  it("job rodando domina tudo: manda acompanhar ao vivo", () => {
    const p = proximoPasso(projeto([tarefa("bloqueada")]), jobRodando);
    expect(p.acao).toBe("jobs");
    expect(p.tom).toBe("ok");
    expect(p.detalhe).toContain("/trabalhar meu-projeto");
  });

  // O caso que travou o usuário de verdade: importou, analisou, e não havia o que fazer.
  it("projeto SEM tarefas (recém-importado): manda pedir funcionalidade", () => {
    const p = proximoPasso(projeto([]), null);
    expect(p.acao).toBe("pedir");
    expect(p.titulo).toMatch(/nada planejado/i);
  });

  it("sem tarefas mas COM análise: reconhece que o código já foi lido", () => {
    const p = proximoPasso(projeto([], "# Análise\nconteúdo"), null);
    expect(p.acao).toBe("pedir");
    expect(p.detalhe).toMatch(/já foi analisado/i);
  });

  it("bloqueada vence fila: precisa de decisão humana e NÃO sugere botão", () => {
    const p = proximoPasso(projeto([tarefa("bloqueada"), tarefa("pronta")]), null);
    expect(p.tom).toBe("atencao");
    expect(p.acao).toBeNull();
    expect(p.titulo).toMatch(/bloqueada/i);
  });

  it("tarefa em andamento sem job rodando = sobra de execução interrompida", () => {
    const p = proximoPasso(projeto([tarefa("em-execucao")]), null);
    expect(p.tom).toBe("atencao");
    expect(p.acao).toBe("trabalhar");
    expect(p.detalhe).toMatch(/interrompid/i);
  });

  it("fila com trabalho: manda trabalhar (caminho feliz)", () => {
    const p = proximoPasso(projeto([tarefa("pronta"), tarefa("backlog")]), null);
    expect(p.acao).toBe("trabalhar");
    expect(p.titulo).toContain("2");
  });

  it("tudo concluído: parabeniza e pede o próximo passo", () => {
    const p = proximoPasso(projeto([tarefa("concluida"), tarefa("concluida")]), null);
    expect(p.tom).toBe("ok");
    expect(p.acao).toBe("pedir");
  });

  it("só canceladas: não trava, sugere planejar de novo", () => {
    const p = proximoPasso(projeto([tarefa("cancelada")]), null);
    expect(p.acao).toBe("pedir");
  });

  it("prioridade correta: bloqueada > em-andamento > fila", () => {
    const todas = [tarefa("bloqueada"), tarefa("em-execucao"), tarefa("pronta")];
    expect(proximoPasso(projeto(todas), null).titulo).toMatch(/bloqueada/i);

    const semBloqueio = [tarefa("em-execucao"), tarefa("pronta")];
    expect(proximoPasso(projeto(semBloqueio), null).titulo).toMatch(/presa/i);
  });
});
