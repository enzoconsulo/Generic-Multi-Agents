import { agentesValidos, lerEquipe, listarProjetos } from "../fabrica/index.js";
import type { AgenteEspecialista } from "../fabrica/tipos.js";

/**
 * Injeção de agentes dinâmicos (P2 do design 2026-07-21-agentes-dinamicos): converte a
 * equipe de um projeto (`_gestao/equipe.json`) no formato `options.agents` do SDK, que o
 * runner repassa ao `query()`. Assim os especialistas ficam disponíveis como subagentes na
 * sessão headless, ao lado dos portões fixos da trilha.
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
 * Separador do nome QUALIFICADO (`<projeto>__<id>`), usado só quando o mesmo `id` existe
 * em mais de um projeto injetado. Ver `agentesParaAcao`.
 */
export const SEPARADOR_PROJETO = "__";

/** Nome do subagente para um especialista: nu quando o id é único, qualificado quando não. */
export function nomeDoAgente(projeto: string, id: string, qualificar: boolean): string {
  return qualificar ? `${projeto}${SEPARADOR_PROJETO}${id}` : id;
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
 * derrubava o trabalho no construtor genérico, ignorando a equipe do projeto em silêncio.
 *
 * **Colisão de id entre projetos vira QUALIFICAÇÃO, não descarte.** Antes ficava o primeiro
 * em ordem alfabética e o outro sumia com um `console.warn` — o que significa que, num
 * `/trabalhar` sem argumento, o `frontend` do projeto A executava tarefas do projeto B com
 * o prompt errado, ou simplesmente não existia. Agora o id repetido é registrado como
 * `<projeto>__<id>` nos DOIS lados: ninguém recebe prompt alheio, e o despacho pelo id nu
 * falha de forma visível (o orquestrador tem a resolução em 3 passos no CLAUDE.md, seção
 * "Equipe do projeto") em vez de rodar o especialista errado em silêncio. Id único — o
 * caso normal — continua nu, então nada muda para quem tem um projeto só e o contexto
 * injetado não cresce.
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
  // Ordem alfabética torna a qualificação determinística entre rodadas.
  const projetos = pedido !== "" ? [pedido] : await listarProjetos(raiz);

  // Passada 1: lê as equipes e conta quantos projetos usam cada id. A contagem tem de
  // existir ANTES de nomear qualquer agente — é ela que decide nu × qualificado, e não dá
  // para decidir isso enquanto se percorre (o segundo dono do id ainda não apareceu).
  const equipes: { projeto: string; agentes: AgenteEspecialista[] }[] = [];
  const projetosPorId = new Map<string, number>();

  for (const projeto of projetos) {
    const agentes = agentesValidos(await lerEquipe(raiz, projeto));
    if (agentes.length === 0) continue;
    equipes.push({ projeto, agentes });
    for (const a of agentes) projetosPorId.set(a.id, (projetosPorId.get(a.id) ?? 0) + 1);
  }

  // Passada 2: registra cada especialista com o nome resolvido.
  const registro: Record<string, AgenteSDK> = {};

  for (const { projeto, agentes } of equipes) {
    for (const a of agentes) {
      const qualificar = (projetosPorId.get(a.id) ?? 0) > 1;
      const nome = nomeDoAgente(projeto, a.id, qualificar);

      const base: AgenteSDK = {
        description: a.descricao !== "" ? a.descricao : `Especialista ${a.nome}`,
        prompt: a.prompt,
        ...(a.ferramentas !== null && a.ferramentas.length > 0 ? { tools: a.ferramentas } : {}),
      };
      registro[nome] = qualificar
        ? { ...base, description: `[projeto ${projeto}] ${base.description}` }
        : base;

      // Gêmeo reforçado: mesmo prompt e mesmas ferramentas, modelo mais forte. Custa um
      // pouco de contexto (o prompt entra duas vezes) e evita o gasto muito maior de
      // repetir um ciclo inteiro — construtor + verificador + revisor — com o modelo que
      // já falhou uma vez.
      if (typeof reforco === "string" && reforco !== "") {
        registro[`${nome}${SUFIXO_REFORCO}`] = {
          ...registro[nome],
          description:
            `RETRABALHO (modelo ${reforco}) — ${registro[nome]?.description ?? ""} ` +
            "Usar quando a tarefa já voltou reprovada (tentativas >= 1).",
          model: reforco,
        };
      }
    }
  }

  return Object.keys(registro).length === 0 ? undefined : registro;
}
