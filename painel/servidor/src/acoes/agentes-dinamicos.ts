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
}

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
      registro[a.id] = {
        description: a.descricao !== "" ? a.descricao : `Especialista ${a.nome}`,
        prompt: a.prompt,
        ...(a.ferramentas !== null && a.ferramentas.length > 0 ? { tools: a.ferramentas } : {}),
      };
    }
  }

  return Object.keys(registro).length === 0 ? undefined : registro;
}
