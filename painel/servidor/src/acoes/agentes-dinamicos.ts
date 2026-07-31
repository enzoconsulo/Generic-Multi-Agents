import { agentesValidos, lerEquipe, listarProjetos } from "../fabrica/index.js";

/**
 * Injeção de agentes dinâmicos (P2 do design 2026-07-21-agentes-dinamicos): converte a
 * equipe de um projeto (`_gestao/equipe.json`) no formato `options.agents` do SDK, que o
 * runner repassa ao `query()`. Assim os especialistas ficam disponíveis como subagentes na
 * sessão headless, ao lado do testador/revisor fixos.
 *
 * Só faz sentido para `/trabalhar <projeto>` (o fluxo que despacha construtores). Outras
 * ações não recebem equipe.
 */

/** Formato aceito por `options.agents` do SDK (subconjunto de AgentDefinition). */
export interface AgenteSDK {
  description: string;
  prompt: string;
  tools?: string[];
  /**
   * Alias do modelo deste agente. Ausente = herda o do fluxo, que é o normal. Existe para
   * as variantes `-reforcado` (ver `SUFIXO_REFORCO`); o nome do campo é o do SDK
   * (`AgentDefinition.model`, conferido em sdk.d.ts da versão pinada — opção com nome
   * errado é descartada em SILÊNCIO, e já custou caro aqui antes).
   */
  model?: string;
}

/**
 * Sufixo das variantes reforçadas. O orquestrador despacha `<id>-reforcado` quando a
 * tarefa já voltou reprovada (`tentativas >= 1`, protocolo regra 12) — o gatilho é a
 * falha medida, não um palpite sobre dificuldade.
 */
export const SUFIXO_REFORCO = "-reforcado";

/**
 * Retorna os agentes a injetar para uma ação, ou undefined quando não se aplica
 * (ação != trabalhar, ou nenhum projeto com equipe válida).
 *
 * **Sem projeto no argumento injeta a equipe de TODOS** (T-045). Antes retornava
 * `undefined`, e esse é justamente o disparo padrão do painel (o botão manda `{}` = todos
 * os projetos): o fluxo lia `equipe.json` do disco, via `streamlit-ui` lá e despachava —
 * mas o SDK só conhece o que foi injetado, então respondia "not found". O painel anunciava
 * especialistas que ele mesmo não tinha injetado. Custava turnos em despachos condenados e
 * derrubava o trabalho no `executor` genérico, ignorando a equipe do projeto em silêncio.
 */
export async function agentesParaAcao(
  raiz: string,
  idAcao: string,
  argumentos: string,
  /**
   * Modelo do RETRABALHO (`estrategia.reforco`). Quando informado, cada especialista ganha
   * um gêmeo `<id>-reforcado` com esse modelo, para o orquestrador escalar a tarefa que já
   * voltou reprovada. `null`/ausente = estratégia já no topo, nada a injetar.
   */
  reforco?: string | null,
): Promise<Record<string, AgenteSDK> | undefined> {
  if (idAcao !== "trabalhar") return undefined;

  const pedido = (argumentos ?? "").trim().split(/\s+/)[0]?.trim() ?? "";
  // Ordem alfabética torna a resolução de colisão determinística (ver abaixo).
  const projetos = pedido !== "" ? [pedido] : await listarProjetos(raiz);

  const registro: Record<string, AgenteSDK> = {};
  const donoDoId = new Map<string, string>();

  for (const projeto of projetos) {
    for (const a of agentesValidos(await lerEquipe(raiz, projeto))) {
      const jaTem = donoDoId.get(a.id);
      if (jaTem !== undefined) {
        // Colisão entre projetos: o fluxo despacha pelo id nu que leu no `equipe.json`, e
        // não há como distinguir dois prompts sob o mesmo nome. Fica o primeiro (alfabético)
        // e o aviso nomeia os dois — silenciar faria um projeto receber o especialista do
        // outro sem ninguém notar.
        if (jaTem !== projeto) {
          console.warn(
            `[agentes] id "${a.id}" existe em "${jaTem}" e em "${projeto}"; ` +
              `mantido o de "${jaTem}". Renomeie um dos dois em _gestao/equipe.json.`,
          );
        }
        continue;
      }
      donoDoId.set(a.id, projeto);
      const base: AgenteSDK = {
        description: a.descricao !== "" ? a.descricao : `Especialista ${a.nome}`,
        prompt: a.prompt,
        ...(a.ferramentas !== null && a.ferramentas.length > 0 ? { tools: a.ferramentas } : {}),
      };
      registro[a.id] = base;

      // Gêmeo reforçado: mesmo prompt e mesmas ferramentas, modelo mais forte. Custa um
      // pouco de contexto (o prompt entra duas vezes) e evita o gasto muito maior de
      // repetir um ciclo inteiro — executor + testador + revisor — com o modelo que já
      // falhou uma vez.
      if (typeof reforco === "string" && reforco !== "") {
        registro[`${a.id}${SUFIXO_REFORCO}`] = {
          ...base,
          description:
            `RETRABALHO (modelo ${reforco}) — ${base.description} ` +
            "Usar quando a tarefa já voltou reprovada (tentativas >= 1).",
          model: reforco,
        };
      }
    }
  }

  return Object.keys(registro).length === 0 ? undefined : registro;
}
