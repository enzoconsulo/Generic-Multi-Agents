import { lerCabecalhoAntigo, temMetaEstruturada } from "./atividade";
import type { LinhaLog } from "./tipos";

/**
 * ATIVIDADE EM MINI-TÓPICOS, do mais recente para o mais antigo (16/08).
 *
 * O pedido do usuário foi específico e é uma exigência de ERGONOMIA, não de estética: poder
 * deixar a tela parada e acompanhar a execução sem rolar. Isso só funciona com duas coisas
 * juntas — o novo entra POR CIMA, e cada evento ocupa uma linha.
 *
 * O log cru não serve para isso, e a medição da T-047 diz por quê: **74% a 92% das linhas de
 * uma execução real são só o nome de uma ferramenta**, em rajadas de até 15 seguidas. Uma
 * lista com o mais novo no topo feita sobre esse log empurraria tudo que interessa para fora
 * da tela em segundos — exatamente o problema que ela deveria resolver. Por isso rajada de
 * ferramenta vira UM tópico com contagem, e não N linhas.
 *
 * Tudo aqui é função PURA: os testes da web são de lógica sem DOM, então decisão dentro de
 * componente é decisão não verificada.
 */

export type TipoTopico =
  /** Uma etapa do pipeline começou (agente + papel + tarefa). */
  | "etapa"
  /** Rajada de chamadas de ferramenta, condensada. */
  | "acoes"
  /** Mudança de status de tarefa (`T-004: pronta → em-execucao`). */
  | "estado"
  /** Texto produzido por um agente ou pelo motor. */
  | "fala"
  | "erro"
  | "resultado"
  | "inicio";

export interface Topico {
  /** Chave estável para o React — índice da primeira linha que o tópico condensa. */
  chave: string;
  tipo: TipoTopico;
  /** Marca de uma coluna: o olho separa o tipo antes de ler a frase. */
  icone: string;
  titulo: string;
  /** Segunda linha, opcional — detalhe que não cabe no título. */
  detalhe: string | null;
  agente: string | null;
  papel: string | null;
  tarefa: string | null;
  em: string;
  /** Quantas linhas de log este tópico condensa (1, exceto em `acoes`). */
  vezes: number;
}

/** Teto de caracteres de um título: a lista tem de caber numa linha por tópico. */
const MAX_TITULO = 150;
/** Tópicos exibidos por padrão. O suficiente para a tela parada; o resto é o log técnico. */
export const LIMITE_TOPICOS = 80;

const ICONE: Readonly<Record<TipoTopico, string>> = {
  etapa: "▶",
  acoes: "⚙",
  estado: "↻",
  fala: "◆",
  erro: "✖",
  resultado: "■",
  inicio: "•",
};

/** Transição de status escrita pelo motor: `T-004: pronta → em-execucao`. */
const TRANSICAO = /^(T-\d+[a-z]?)\s*:\s*([a-z-]+)\s*→\s*([a-z-]+)\s*$/i;

/**
 * Parte um texto em título (uma linha) e detalhe (o RESTO), sem repetir nada.
 *
 * A primeira versão mandava o texto inteiro como detalhe quando ele passava do teto, e a
 * captura de tela mostrou o resultado: o detalhe começava repetindo, palavra por palavra, o
 * título logo acima. Duas linhas para dizer uma. Aqui o detalhe é sempre a CONTINUAÇÃO —
 * as linhas seguintes, ou o que sobrou depois do corte.
 */
function partir(texto: string, max = MAX_TITULO): { titulo: string; detalhe: string | null } {
  const linhas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const primeira = linhas[0] ?? texto.trim();
  const resto = linhas.slice(1).join(" ");
  if (primeira.length <= max) {
    return { titulo: primeira, detalhe: resto !== "" ? resto : null };
  }
  const corte = primeira.slice(0, max - 1);
  const sobra = `${primeira.slice(max - 1)}${resto !== "" ? ` ${resto}` : ""}`.trim();
  return { titulo: `${corte}…`, detalhe: sobra !== "" ? sobra : null };
}


/**
 * O que a chamada de ferramenta tocou. Os dois motores escrevem diferente:
 * o pipeline em código manda `executor: Read`; o runner do Agent SDK manda `Read: app.py`
 * (ou `Agent → testador`). Aqui só interessa a parte útil para a contagem.
 */
function alvoDaFerramenta(linha: LinhaLog): string {
  const texto = linha.texto.trim();
  const prefixo = linha.agente !== undefined ? `${linha.agente}: ` : null;
  return prefixo !== null && texto.startsWith(prefixo) ? texto.slice(prefixo.length) : texto;
}

/**
 * Condensa o log em tópicos, **do mais recente para o mais antigo**.
 *
 * Rajadas de ferramenta do MESMO agente viram um tópico só ("14 ações · Read · Edit · Bash").
 * Qualquer outra linha quebra a rajada — é isso que mantém a ordem dos fatos legível.
 */
export function montarTopicos(
  linhas: readonly LinhaLog[],
  opcoes: { limite?: number } = {},
): Topico[] {
  const topicos: Topico[] = [];
  const estruturado = temMetaEstruturada(linhas);

  /**
   * UM DESPACHO, UM TÓPICO. O motor e o despachante anunciam a mesma etapa em duas linhas
   * seguidas (`T-048 → revisor (motivo)` e `T-048 · revisor · revisor · sonnet · ~16k tok`),
   * e sem isto a linha do tempo abria duas etapas idênticas para o mesmo despacho — visível
   * na captura de tela, e ruído puro. Funde na de título mais rico e guarda o outro texto
   * como detalhe.
   */
  const fundirComAnterior = (novo: Topico): boolean => {
    const ultimo = topicos[topicos.length - 1];
    if (
      ultimo === undefined ||
      ultimo.tipo !== "etapa" ||
      novo.tipo !== "etapa" ||
      ultimo.agente !== novo.agente ||
      ultimo.tarefa !== novo.tarefa
    ) {
      return false;
    }
    // O papel só aparece num dos dois formatos — quem o tiver manda no título.
    if (ultimo.papel === null && novo.papel !== null) {
      ultimo.papel = novo.papel;
      ultimo.titulo = novo.titulo;
    }
    if (novo.detalhe !== null) ultimo.detalhe = novo.detalhe;
    ultimo.em = novo.em;
    return true;
  };
  /** Rajada de ferramenta aberta, à espera de mais uma chamada do mesmo agente. */
  let rajada: { topico: Topico; agente: string | null; alvos: string[] } | null = null;

  const fecharRajada = (): void => {
    if (rajada === null) return;
    const t = rajada.topico;
    t.titulo = t.vezes === 1 ? `1 ação de ferramenta` : `${t.vezes} ações de ferramenta`;
    // Os ÚLTIMOS alvos, não os primeiros: numa rajada longa o fim é o que ainda está
    // acontecendo, e é a pergunta de quem olha a tela agora.
    t.detalhe = rajada.alvos.slice(-4).join(" · ") || null;
    rajada = null;
  };

  linhas.forEach((linha, i) => {
    const base = {
      chave: String(i),
      agente: linha.agente ?? null,
      papel: linha.papel ?? null,
      tarefa: linha.tarefa ?? null,
      em: linha.em,
      vezes: 1,
    };

    if (linha.nivel === "ferramenta") {
      if (rajada !== null && rajada.agente === (linha.agente ?? null)) {
        rajada.topico.vezes += 1;
        rajada.topico.em = linha.em;
        rajada.alvos.push(alvoDaFerramenta(linha));
        return;
      }
      fecharRajada();
      const topico: Topico = { ...base, tipo: "acoes", icone: ICONE.acoes, titulo: "", detalhe: null };
      topicos.push(topico);
      rajada = { topico, agente: linha.agente ?? null, alvos: [alvoDaFerramenta(linha)] };
      return;
    }
    fecharRajada();

    if (linha.texto.trim() === "") return;

    // ETAPA: primeira linha de um agente que acabou de assumir. É o cabeçalho do trecho, e
    // por isso ganha destaque próprio em vez de virar mais uma fala.
    const anterior = linhas[i - 1];
    if (
      linha.agente !== undefined &&
      (anterior === undefined || anterior.agente !== linha.agente)
    ) {
      topicos.push({
        ...base,
        tipo: "etapa",
        icone: ICONE.etapa,
        titulo:
          `${linha.agente}${linha.papel !== undefined ? ` · ${linha.papel}` : ""}` +
          `${linha.tarefa !== undefined ? ` · ${linha.tarefa}` : ""}`,
        detalhe: partir(linha.texto).titulo,
      });
      return;
    }

    // Log ANTIGO (sem os campos): o cabeçalho de etapa ainda é reconhecível no texto. Não
    // roda quando o job tem meta — ali a etapa já foi aberta pelo campo, e reconhecer o
    // texto de novo só produziria uma segunda etapa para o mesmo despacho.
    if (!estruturado && linha.nivel !== "erro") {
      const antigo = lerCabecalhoAntigo(linha.texto);
      if (antigo !== null) {
        const etapa: Topico = {
          ...base,
          tipo: "etapa",
          icone: ICONE.etapa,
          agente: antigo.agente,
          papel: antigo.papel,
          tarefa: antigo.tarefa,
          titulo:
            `${antigo.agente}${antigo.papel !== null ? ` · ${antigo.papel}` : ""} · ${antigo.tarefa}`,
          detalhe: partir(linha.texto).titulo,
        };
        if (!fundirComAnterior(etapa)) topicos.push(etapa);
        return;
      }
    }

    const transicao = TRANSICAO.exec(linha.texto.trim());
    if (transicao !== null) {
      topicos.push({
        ...base,
        tipo: "estado",
        icone: ICONE.estado,
        tarefa: base.tarefa ?? transicao[1] ?? null,
        titulo: `${transicao[1]}: ${transicao[2]} → ${transicao[3]}`,
        detalhe: null,
      });
      return;
    }

    const tipo: TipoTopico =
      linha.nivel === "erro"
        ? "erro"
        : linha.nivel === "resultado"
          ? "resultado"
          : linha.nivel === "inicio"
            ? "inicio"
            : "fala";
    topicos.push({ ...base, tipo, icone: ICONE[tipo], ...partir(linha.texto) });
  });
  fecharRajada();

  const limite = opcoes.limite ?? LIMITE_TOPICOS;
  // Inverte DEPOIS de condensar: condensar sobre a lista invertida agruparia a rajada ao
  // contrário e a contagem sairia certa com os alvos errados.
  return topicos.slice(-limite).reverse();
}
