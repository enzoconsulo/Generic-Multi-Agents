import { agentesValidos, lerEquipe } from "../fabrica/index.js";

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
 * (ação != trabalhar, sem projeto no argumento, ou projeto sem equipe válida).
 */
export async function agentesParaAcao(
  raiz: string,
  idAcao: string,
  argumentos: string,
): Promise<Record<string, AgenteSDK> | undefined> {
  if (idAcao !== "trabalhar") return undefined;

  const projeto = (argumentos ?? "").trim().split(/\s+/)[0]?.trim();
  if (projeto === undefined || projeto === "") return undefined;

  const validos = agentesValidos(await lerEquipe(raiz, projeto));
  if (validos.length === 0) return undefined;

  const registro: Record<string, AgenteSDK> = {};
  for (const a of validos) {
    registro[a.id] = {
      description: a.descricao !== "" ? a.descricao : `Especialista ${a.nome}`,
      prompt: a.prompt,
      ...(a.ferramentas !== null && a.ferramentas.length > 0 ? { tools: a.ferramentas } : {}),
    };
  }
  return registro;
}
