/**
 * Julgamento de um A/B de esforço: as duas pernas entregaram a MESMA coisa? (T-051)
 *
 * Separado de `medir-esforco.ts` porque aquele arquivo roda `git` na carga do módulo e
 * gasta a assinatura ao executar — não é importável por teste. E esta é exatamente a
 * lógica que precisa de teste: foi ela que errou.
 *
 * O erro anterior era ter UM caso de alerta ("a perna barata não fez nada") e chamar todo
 * o resto de "economia real". Isso declarou vitória em duas situações sem sinal:
 *
 *  1. **as duas pernas entregaram nada** — aconteceu com `projeto:conferir` num projeto de
 *     escopo fechado. Não havia defeito a achar, então nenhuma achou. Ausência de sinal não
 *     é evidência a favor: não separa "medium é eficiente" de "medium não procura".
 *  2. **as duas entregaram, mas coisas diferentes** — 26 linhas contra 16 é −38% de
 *     conteúdo travestido de −44% de custo.
 *
 * A regra de ouro que isto codifica está no CLAUDE.md do painel: *execução que não faz nada
 * é sempre a mais barata*. Um instrumento de custo precisa saber dizer "não sei".
 */

/** O que uma perna do experimento entregou. */
export interface Entrega {
  /** Conteúdo entregue, normalizado em linhas (adições do commit, ou o relatório). */
  artefato: string[];
  /**
   * Ação de escrita entrega `commit`; ação de leitura (`/status`) entrega `relatorio` — e
   * relatório é entrega tanto quanto commit. Sem esta distinção toda ação read-only cai em
   * "0 arquivos" e some da avaliação.
   */
  tipoArtefato: "commit" | "relatorio" | "nada";
}

export type TipoVeredito = "inconclusivo" | "nao-economia" | "entrega-menor" | "economia";

export interface Veredito {
  tipo: TipoVeredito;
  texto: string;
}

/**
 * Nome canônico de uma ação para o filtro `--acoes=`: só o trecho final, sem caminho e sem
 * caixa.
 *
 * Existe por uma armadilha do Git Bash no Windows: um argumento que começa com `/` é
 * convertido em caminho, então `--acoes=/status` chega ao script como
 * `C:/Program Files/Git/status`. Exigir grafia exata transformava isso em "nenhuma ação
 * casa" — o operador perde a rodada tentando entender por quê, e o erro não é dele.
 */
export function nomeCanonicoDeAcao(rotulo: string): string {
  return rotulo.trim().replace(/^.*[/\\]/, "").toLowerCase();
}

/** Linhas significativas de um texto: sem vazias, sem espaço de borda. */
export function linhasSignificativas(texto: string): string[] {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

/**
 * Similaridade de Jaccard entre dois conjuntos de linhas. Simples de propósito: o que se
 * precisa distinguir é "mesma entrega" de "metade da entrega", não medir prosa com
 * precisão. Vazio contra vazio devolve 1 — a leitura disso fica com `julgar`, que trata
 * ausência de entrega como INCONCLUSIVO antes de olhar similaridade.
 */
export function similaridade(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let intersecao = 0;
  for (const x of A) if (B.has(x)) intersecao += 1;
  return intersecao / (A.size + B.size - intersecao);
}

/**
 * Compara a perna cara (`a`, esforço padrão) com a barata (`b`, esforço reduzido).
 *
 * Os cortes são grosseiros de propósito: servem para levantar suspeita e mandar olhar o
 * conteúdo, não para automatizar a decisão. Julgar entrega é trabalho humano — o
 * instrumento só precisa parar de afirmar vitória onde não há dado.
 */
export function julgar(a: Entrega, b: Entrega): Veredito {
  if (a.tipoArtefato === "nada" && b.tipoArtefato === "nada") {
    return {
      tipo: "inconclusivo",
      texto:
        "INCONCLUSIVO: nenhuma das duas pernas entregou nada. Não havia trabalho a fazer " +
        "nesta entrada, então a medição não separa eficiência de omissão. Repita com um " +
        "alvo que tenha trabalho pendente CONHECIDO (ex.: defeito plantado).",
    };
  }
  if (a.tipoArtefato !== "nada" && b.tipoArtefato === "nada") {
    return {
      tipo: "nao-economia",
      texto: "NÃO é economia: a perna barata não fez o trabalho que a outra fez.",
    };
  }
  if (a.tipoArtefato === "nada" && b.tipoArtefato !== "nada") {
    return {
      tipo: "inconclusivo",
      texto:
        "INCONCLUSIVO ao contrário: a perna CARA não entregou e a barata entregou. " +
        "Provável ruído ou entradas diferentes — refaça antes de concluir qualquer coisa.",
    };
  }

  const sim = similaridade(a.artefato, b.artefato);
  const razao = a.artefato.length === 0 ? 1 : b.artefato.length / a.artefato.length;
  const medida =
    `${a.artefato.length} → ${b.artefato.length} linhas entregues ` +
    `(${(razao * 100).toFixed(0)}% do volume), similaridade ${(sim * 100).toFixed(0)}%`;

  if (razao < 0.8 || sim < 0.5) {
    return {
      tipo: "entrega-menor",
      texto:
        `ENTREGA DIFERENTE — a economia pode ser aparente. ${medida}. ` +
        "Leia os dois artefatos antes de concluir: menos linhas pode ser menos enchimento " +
        "(bom) ou menos conteúdo (ruim), e o instrumento não sabe a diferença.",
    };
  }
  if (sim >= 0.8) {
    return { tipo: "economia", texto: `Entrega equivalente — economia real. ${medida}.` };
  }
  return { tipo: "economia", texto: `Entrega parecida — economia provável. ${medida}.` };
}
