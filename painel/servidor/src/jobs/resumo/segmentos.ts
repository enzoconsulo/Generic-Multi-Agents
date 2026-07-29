/**
 * Rastreador de TRECHOS de agente no servidor (T-039).
 *
 * A segmentação já existia no cliente (`web/src/lib/atividade.ts`), mas o resumo precisa
 * ser gerado UMA vez e persistido: fazer no cliente significaria regerar — e recobrar — a
 * cada F5, que é justamente o oposto do pedido.
 *
 * Regra de corte, idêntica à do cliente: uma linha de `ferramenta` no formato
 * `... → <agente>` (o despacho de um subagente) FECHA o trecho anterior e abre o do agente
 * despachado. A linha do despacho é cabeçalho, não conteúdo.
 */

/** Linha de log como o runner emite. */
export interface LinhaLog {
  nivel: string;
  texto: string;
  em: string;
}

export interface TrechoFechado {
  /** Índice estável do trecho dentro do job — é a chave do resumo. */
  indice: number;
  /** Agente do trecho; `null` = orquestrador (ninguém foi despachado ainda). */
  agente: string | null;
  inicio: string;
  fim: string;
  /** Só o texto que vale resumir (fala do agente, resultado, erro) — não ferramentas. */
  texto: string;
  /** Quantas chamadas de ferramenta aconteceram no trecho. */
  ferramentas: number;
}

/** Despacho de subagente: `Task → executor`, `(subagente) Task → revisor`. */
const DESPACHO = /→\s*([a-z0-9-]+)\s*$/i;

/** Níveis cujo texto entra no resumo. Ferramenta é ruído para quem quer saber O QUE saiu. */
const NIVEIS_TEXTO = new Set(["assistente", "subagente", "resultado", "erro", "log"]);

/**
 * Acumula linhas e devolve trechos JÁ FECHADOS. Um trecho só fecha quando outro abre ou
 * quando o job termina (`encerrar`) — resumir trecho aberto daria um resumo de metade do
 * trabalho, que é pior que nenhum.
 */
export class RastreadorTrechos {
  private indice = 0;
  private atual: {
    indice: number;
    agente: string | null;
    inicio: string;
    fim: string;
    partes: string[];
    ferramentas: number;
  } | null = null;

  /** Alimenta uma linha; devolve o trecho que ela fechou, ou null. */
  adicionar(linha: LinhaLog): TrechoFechado | null {
    const despachado =
      linha.nivel === "ferramenta" ? (DESPACHO.exec(linha.texto)?.[1] ?? null) : null;

    if (despachado !== null) {
      const fechado = this.fechar();
      this.abrir(despachado, linha.em);
      return fechado;
    }

    if (this.atual === null) this.abrir(null, linha.em);
    const atual = this.atual!;
    atual.fim = linha.em;
    if (linha.nivel === "ferramenta") {
      atual.ferramentas += 1;
    } else if (NIVEIS_TEXTO.has(linha.nivel) && linha.texto.trim() !== "") {
      atual.partes.push(linha.texto.trim());
    }
    return null;
  }

  /** Fecha o trecho em aberto (fim do job). Null quando não há nada aberto. */
  encerrar(): TrechoFechado | null {
    return this.fechar();
  }

  private abrir(agente: string | null, em: string): void {
    this.atual = { indice: this.indice++, agente, inicio: em, fim: em, partes: [], ferramentas: 0 };
  }

  private fechar(): TrechoFechado | null {
    const a = this.atual;
    this.atual = null;
    if (a === null) return null;
    const texto = a.partes.join("\n\n").trim();
    // Trecho sem texto nenhum não vira resumo: não há o que resumir, e gastar uma chamada
    // para produzir "o agente não disse nada" é desperdício com cara de funcionalidade.
    if (texto === "") return null;
    return {
      indice: a.indice,
      agente: a.agente,
      inicio: a.inicio,
      fim: a.fim,
      texto,
      ferramentas: a.ferramentas,
    };
  }
}
