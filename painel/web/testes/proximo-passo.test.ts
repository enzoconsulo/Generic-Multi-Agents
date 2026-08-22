import { describe, expect, it } from "vitest";
import { proximoPasso } from "../src/paginas/projeto/proximo-passo";
import type { Job, ProjetoDetalhe, TarefaCompleta } from "../src/lib/tipos";

/**
 * `id` único por chamada: a fila passou a consultar as DEPENDÊNCIAS (`tarefasPromoviveis`),
 * que indexa por id — duas tarefas com o mesmo id faziam a contagem dobrar, e o teste
 * quebrava por defeito do dublê, não do código.
 */
let seq = 0;
function tarefa(status: string, p: Partial<TarefaCompleta> = {}): TarefaCompleta {
  seq += 1;
  const id = p.id ?? `T-${String(seq).padStart(3, "0")}`;
  return {
    arquivo: `${id}.md`,
    id,
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
      conformidade: "",
      revisao: "",
    },
    ...p,
  };
}

function projeto(tarefas: TarefaCompleta[], analise: string | null = null): ProjetoDetalhe {
  return {
    nome: "meu-projeto",
    tarefas,
    contagemPorStatus: {} as ProjetoDetalhe["contagemPorStatus"],
    faseAtual: null,
    plano: null,
    equipe: { dominio: "software", agentes: [], erros: [] },
    decisoes: null,
    progresso: null,
    analiseEstruturada: null,
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
    // Backlog SEM dependência é promovível — o motor o promove na abertura da rodada.
    const p = proximoPasso(projeto([tarefa("pronta"), tarefa("backlog")]), null);
    expect(p.acao).toBe("trabalhar");
    expect(p.titulo).toContain("2");
  });

  /**
   * O BUG QUE ESTE TESTE TRAVA (21/08). A fila contava `pronta || backlog`, backlog inteiro,
   * sem olhar dependência. No banco-imobiliario isso anunciava "2 tarefa(s) na fila, prontas
   * para executar" com as duas presas — clicar abriria e fecharia a rodada sem fazer nada.
   * Só ficou visível quando o cartão passou a mostrar a estimativa medida e a MESMA tela
   * passou a dizer as duas coisas.
   */
  it("backlog preso por dependência NÃO conta como fila", () => {
    const presa = tarefa("backlog", { id: "T-900", dependencias: ["T-901"] });
    const dependencia = tarefa("backlog", { id: "T-901", dependencias: ["T-902"] });
    const p = proximoPasso(projeto([presa, dependencia]), null);
    // As duas estão presas (a T-901 depende de uma tarefa que nem existe na lista), então
    // não há o que despachar e a tela não pode mandar clicar em Trabalhar.
    expect(p.acao).not.toBe("trabalhar");
  });

  /**
   * Frontmatter ilegível: o leitor devolve campos vazios + `erros`, o pipeline ignora a
   * tarefa em silêncio e nenhuma outra frase da tela diria isso. Sensor que existia e não
   * era lido — a família de defeito mais comum desta fábrica.
   */
  it("tarefa SEM STATUS por frontmatter quebrado é dita em voz alta, e não vira 'tudo concluído'", () => {
    const quebrada = tarefa("", { id: "T-051", erros: ["frontmatter inválido: ..."] });
    const p = proximoPasso(projeto([tarefa("concluida"), quebrada]), null);
    expect(p.tom).toBe("atencao");
    expect(p.titulo).toMatch(/ileg/i);
    expect(p.detalhe).toContain("T-051");
  });

  /**
   * Erro de CAMPO com status íntegro não é alarme: três tarefas do banco-imobiliario tinham
   * `atualizada: <data> (revisão)` e circulavam normalmente. Aviso que toca por detalhe
   * cosmético é aviso que ninguém lê depois — a armadilha do alarme em metade das rodadas.
   */
  it("erro de campo com status válido NÃO vira alarme de tela", () => {
    const morna = tarefa("concluida", { id: "T-025", erros: ["campo atualizada inválido"] });
    const p = proximoPasso(projeto([morna]), null);
    expect(p.titulo).not.toMatch(/ileg/i);
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
