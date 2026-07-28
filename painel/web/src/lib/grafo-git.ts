import type { CommitGit } from "./tipos";

/**
 * Layout do grafo de commits (T-028) — o algoritmo por trás do desenho estilo Git Graph.
 *
 * A ideia: cada linha vertical é uma FAIXA (lane). Percorrendo os commits do mais novo
 * para o mais antigo, mantemos as faixas "abertas" — cada uma esperando um hash
 * específico. Quando o commit da vez é o esperado por uma faixa, ele ocupa aquela faixa;
 * o primeiro pai continua nela e os demais pais (merge) abrem faixas novas.
 *
 * Função PURA e testada: o desenho só faz sentido se a topologia estiver certa, e conferir
 * isso a olho num SVG é inviável.
 */

export interface Aresta {
  /** Faixa de onde a linha sai (a do commit). */
  de: number;
  /** Faixa para onde vai (a do pai). */
  para: number;
  /** Índice da linha (commit) onde a aresta começa. */
  linha: number;
  /** Índice da linha onde termina; null = o pai está fora do trecho carregado. */
  ate: number | null;
  cor: number;
}

export interface NoGrafo {
  commit: CommitGit;
  linha: number;
  faixa: number;
  cor: number;
}

export interface Grafo {
  nos: NoGrafo[];
  arestas: Aresta[];
  /** Quantas faixas o desenho usa — define a largura da coluna do grafo. */
  faixas: number;
}

/** Paleta ciclada por faixa; o índice é resolvido em cor no componente. */
const CORES = 8;

export function montarGrafo(commits: readonly CommitGit[]): Grafo {
  const linhaDe = new Map<string, number>();
  commits.forEach((c, i) => linhaDe.set(c.hash, i));

  /** Faixas abertas: em cada posição, o hash que aquela faixa está esperando. */
  const abertas: (string | null)[] = [];
  /** Cor fixada por faixa no momento em que ela foi aberta. */
  const corDaFaixa: number[] = [];

  const nos: NoGrafo[] = [];
  const arestas: Aresta[] = [];
  let maxFaixas = 0;
  let proximaCor = 0;

  const alocar = (hash: string, corPreferida?: number): number => {
    const livre = abertas.findIndex((h) => h === null);
    const faixa = livre === -1 ? abertas.length : livre;
    abertas[faixa] = hash;
    corDaFaixa[faixa] = corPreferida ?? proximaCor++ % CORES;
    return faixa;
  };

  commits.forEach((commit, i) => {
    // A faixa deste commit é aquela que o esperava; se ninguém esperava (é ponta de
    // branch), abre uma nova.
    let faixa = abertas.findIndex((h) => h === commit.hash);
    if (faixa === -1) faixa = alocar(commit.hash);

    const cor = corDaFaixa[faixa] ?? 0;
    nos.push({ commit, linha: i, faixa, cor });

    // Outras faixas que esperavam ESTE mesmo commit convergem aqui e se fecham
    // (acontece quando dois ramos apontam para o mesmo pai).
    abertas.forEach((h, f) => {
      if (f !== faixa && h === commit.hash) {
        arestas.push({ de: f, para: faixa, linha: i, ate: i, cor: corDaFaixa[f] ?? 0 });
        abertas[f] = null;
      }
    });

    if (commit.pais.length === 0) {
      abertas[faixa] = null; // commit raiz: a faixa termina aqui
    } else {
      // O primeiro pai herda a faixa (mantém a linha principal reta e contínua).
      commit.pais.forEach((pai, indice) => {
        let faixaPai: number;
        if (indice === 0) {
          abertas[faixa] = pai;
          faixaPai = faixa;
        } else {
          // Merge: o pai já pode estar sendo esperado por outra faixa — reusa, senão abre.
          const existente = abertas.findIndex((h) => h === pai);
          faixaPai = existente !== -1 ? existente : alocar(pai);
        }
        arestas.push({
          de: faixa,
          para: faixaPai,
          linha: i,
          ate: linhaDe.get(pai) ?? null,
          cor: corDaFaixa[faixaPai] ?? cor,
        });
      });
    }

    maxFaixas = Math.max(maxFaixas, abertas.filter((h) => h !== null).length, faixa + 1);
  });

  return { nos, arestas, faixas: Math.max(1, maxFaixas) };
}
