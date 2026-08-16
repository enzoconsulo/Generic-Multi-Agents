import { IDS_ACOES, type IdAcao } from "../fabrica/catalogo-acoes.js";
import type { NovoJob } from "../jobs/fila.js";
import { guardrailsParaAcao } from "../jobs/robustez/guardrails.js";
import type { EscopoLock } from "../jobs/tipos.js";
import { SUFIXO_REFORCO } from "./agentes-dinamicos.js";
import { blocoReforco, comPreambuloHeadless } from "./preambulo.js";

/**
 * Traduz uma ação da fábrica (um dos 6 comandos) num job "claude" (T-011). O prompt é o
 * próprio comando (`/status painel-fabrica`) — o Claude Code expande commands/skills no
 * headless (ver pesquisa §1). O cwd é SEMPRE a raiz da fábrica: é o que carrega o
 * CLAUDE.md do orquestrador, os agentes e o allowlist, como a sessão interativa do Enzo.
 */

/** Ação inexistente (a rota traduz para 404). */
export class ErroAcaoDesconhecida extends Error {
  constructor(id: string) {
    super(`Ação desconhecida: "${id}"`);
    this.name = "ErroAcaoDesconhecida";
  }
}

/** Ações que sempre travam a fábrica inteira (orquestração ou escrita global). */
const ACOES_SEMPRE_GLOBAIS: ReadonlySet<IdAcao> = new Set([
  "novo-projeto",
  "ideia",
  "encerrar-dia",
  "manutencao",
]);

export interface PedidoAcao {
  id: string;
  /** Texto dos argumentos do comando (ex.: nome do projeto). */
  argumentos?: string;
  /** Modelo primário (alias) já resolvido da estratégia. */
  modelo: string;
  /** Fallback (alias) já resolvido da estratégia; ausente = sem fallback. */
  fallback?: string | null;
  /** Agentes dinâmicos (options.agents do SDK) — só para /trabalhar com equipe. */
  agentes?: Record<string, unknown>;
  /**
   * Modelo do retrabalho (`estrategia.reforco`). Só vira instrução no prompt quando há
   * especialistas injetados — anunciar agente que não foi injetado gasta turno em despacho
   * condenado, erro que a T-045 já pagou uma vez.
   */
  reforco?: string | null;
  /** Guarda de custo opcional. */
  maxTurns?: number;
  /**
   * Qual motor roda o `/trabalhar`. Ausente = automático (ver `montarJobAcao`).
   *
   * - `"codigo"` — pipeline determinístico (`RunnerPipeline`): o laço é código, cada etapa
   *   é uma `query()` controlada, não existe orquestrador-modelo. Exige UM projeto.
   * - `"modelo"` — o caminho antigo, com o orquestrador em modelo. Escape hatch: existe
   *   para o dia em que o pipeline não der conta de um caso, sem precisar de deploy.
   */
  motor?: "codigo" | "modelo";
}

/**
 * Escopo de lock (decisão em DECISOES.md 2026-07-21): ações globais travam tudo;
 * `trabalhar`/`status` COM um projeto no 1º argumento travam só aquele projeto; sem
 * argumento, são globais (varrem a fábrica inteira).
 */
function escopoDaAcao(id: IdAcao, argumentos: string): EscopoLock {
  if (ACOES_SEMPRE_GLOBAIS.has(id)) return "global";
  if (id === "trabalhar" || id === "status") {
    const projeto = argumentos.split(/\s+/)[0]?.trim();
    if (projeto !== undefined && projeto !== "") return `projeto:${projeto}`;
  }
  return "global";
}

/**
 * Um `/trabalhar <projeto>` deve rodar pelo pipeline em CÓDIGO?
 *
 * Sim quando há exatamente um projeto no argumento — que é o caso comum e o caro. É o
 * "meio termo" da virada: o laço mecânico (promover, ordenar, despachar, mover status) sai
 * do modelo, enquanto **julgamento continua no modelo** e chega pelos outros caminhos
 * (replanejar, marco, ideia, novo-projeto), que não mudaram.
 *
 * Não, sem projeto no argumento: aí o `/trabalhar` varre a fábrica inteira, decide entre
 * projetos e escreve o log do dia — isso é orquestração de verdade, não uma máquina de
 * estados, e continua com o modelo.
 *
 * `pedido.motor` sobrescreve nos dois sentidos. É escape hatch de propósito: trocar o
 * caminho quente de uma fábrica que já falhou em silêncio duas vezes sem deixar como voltar
 * seria imprudente.
 */
export function usaPipelineEmCodigo(id: string, argumentos: string, motor?: string): boolean {
  if (motor === "codigo") return true;
  if (motor === "modelo") return false;
  if (id !== "trabalhar") return false;
  const partes = argumentos.trim().split(/\s+/).filter((x) => x !== "");
  return partes.length === 1 && /^[a-zA-Z0-9._-]+$/.test(partes[0] ?? "");
}

export function montarJobAcao(pedido: PedidoAcao, fabricaRaiz: string): NovoJob {
  if (!(IDS_ACOES as readonly string[]).includes(pedido.id)) {
    throw new ErroAcaoDesconhecida(pedido.id);
  }
  const id = pedido.id as IdAcao;
  const args = (pedido.argumentos ?? "").trim();

  // Pipeline em código: job de tipo próprio, com params próprios. Não passa por prompt
  // nenhum — não há orquestrador para instruir.
  if (usaPipelineEmCodigo(id, args, pedido.motor)) {
    const g = guardrailsParaAcao(id);
    return {
      tipo: "pipeline",
      titulo: `/trabalhar ${args}`,
      escopo: `projeto:${args}`,
      usaClaude: true,
      params: {
        // Ver a nota em `montarJobAcao` abaixo: é o que permite a retomada reconsultar a
        // tabela de guardrails em vez de herdar um teto congelado.
        acao: id,
        raiz: fabricaRaiz,
        projeto: args,
        modelo: pedido.modelo,
        ...(pedido.fallback ? { fallback: pedido.fallback } : {}),
        ...(pedido.reforco ? { reforco: pedido.reforco } : {}),
        ...(g.maxBudgetUsd !== null ? { tetoUsd: g.maxBudgetUsd } : {}),
        watchdogMs: g.watchdogMs,
      },
    };
  }
  const prompt = args === "" ? `/${id}` : `/${id} ${args}`;

  // Guardrails por tipo de ação (T-019): teto de turnos quando o disparo não pediu um
  // explicitamente — nenhum fluxo sobe mais sem teto nenhum — e o limite de silêncio que
  // o watchdog vai respeitar para ESTE job (T-037).
  const guardrails = guardrailsParaAcao(id);
  const maxTurns = pedido.maxTurns ?? guardrails.maxTurns;

  // Escalonamento só é anunciado quando existe de verdade: estratégia com `reforco` E
  // especialistas injetados (é deles que saem os gêmeos `-reforcado`).
  const idsEspecialistas = Object.keys(pedido.agentes ?? {}).filter(
    (nome) => !nome.endsWith(SUFIXO_REFORCO),
  );
  const extra =
    typeof pedido.reforco === "string" && pedido.reforco !== "" && idsEspecialistas.length > 0
      ? blocoReforco(pedido.modelo, pedido.reforco, idsEspecialistas)
      : "";

  return {
    tipo: "claude",
    // Título fica o comando puro: o preâmbulo é infraestrutura, não o pedido do usuário.
    titulo: prompt,
    escopo: escopoDaAcao(id, args),
    usaClaude: true,
    params: {
      // Qual ação da tabela gerou este job. Existe para a RETOMADA (`jobs/retomada.ts`)
      // reconsultar `guardrailsParaAcao` em vez de herdar o teto congelado aqui — sem
      // isto, um job criado antes de uma recalibragem seria retomado com o teto ANTIGO,
      // e a calibragem nova só valeria para quem nunca precisou retomar. Foi o que a
      // captura de tela mostrou no primeiro corte do botão Retomar: teto de US$ 3 num
      // `/ideia` cuja tabela já dizia US$ 6.
      acao: id,
      prompt: comPreambuloHeadless(prompt, extra),
      cwd: fabricaRaiz,
      modelo: pedido.modelo,
      ...(pedido.fallback ? { fallback: pedido.fallback } : {}),
      ...(pedido.agentes && Object.keys(pedido.agentes).length > 0
        ? { agentes: pedido.agentes }
        : {}),
      maxTurns,
      watchdogMs: guardrails.watchdogMs,
      // Teto de custo do job (proxy da cota). `null` na tabela = sem teto, e por isso o
      // campo só entra quando existe: mandar `tetoUsd: null` seria indistinguível de um
      // valor válido para quem lê `params` cru.
      ...(guardrails.maxBudgetUsd !== null ? { tetoUsd: guardrails.maxBudgetUsd } : {}),
      ...(guardrails.esforco !== undefined ? { esforco: guardrails.esforco } : {}),
    },
  };
}
