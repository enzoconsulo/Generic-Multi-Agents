import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ContextoExecucao, Job, NovaPendencia, Runner } from "../tipos.js";

/**
 * Runner que executa um fluxo da fábrica via Claude Agent SDK (T-008). O padrão de uso
 * do SDK foi validado no spike T-001 (`experimentos/spike-sdk/`) e na pesquisa
 * `_gestao/pesquisas/2026-07-21-claude-code-headless.md`.
 *
 * O SDK é injetável (`consulta`) para os testes exercitarem toda a tradução de mensagens
 * → eventos SEM gastar a assinatura; produção usa `consultaReal`.
 */

/** Parâmetros que o job "claude" carrega em `job.params`. */
export interface ParamsClaude {
  /** Prompt / comando a rodar, ex.: "/status painel-fabrica". */
  prompt: string;
  /** Diretório de trabalho — carrega CLAUDE.md/agents/commands dali (raiz da fábrica). */
  cwd: string;
  /** Alias do modelo primário (headless não herda; sempre explícito). */
  modelo: string;
  /** Modelo de fallback (SDK cai nele se o primário estiver sem limite/sobrecarregado). */
  fallback?: string;
  /** Agentes dinâmicos (options.agents do SDK); ausente = só os agentes de arquivo. */
  agentes?: Record<string, unknown>;
  /** Modo de permissão do SDK; default seguro para ferramenta local pessoal. */
  permissionMode?: string;
  /** Limite de turnos agênticos (guarda de custo); ausente = sem limite. */
  maxTurns?: number;
}

export interface ResultadoClaude {
  sessionId: string | null;
  /** Estimativa informativa (assinatura não cobra à parte) — exibir como referência. */
  custoUsd: number | null;
  numTurnos: number | null;
  erro: boolean;
  /** Texto final do fluxo. */
  texto: string;
}

/** Assinatura estreita do SDK usada pelo runner (fácil de falsear nos testes). */
export type Consulta = (args: {
  prompt: string;
  options: Record<string, unknown>;
}) => AsyncIterable<unknown>;

/** Adapta o `query` real do SDK à assinatura estreita. */
export const consultaReal: Consulta = (args) =>
  query(args as Parameters<typeof query>[0]);

/** Forma mínima e defensiva das mensagens do SDK (resistente a churn de versão). */
interface BlocoConteudo {
  type?: string;
  text?: string;
  name?: string;
  /** Input da ferramenta (usado p/ extrair `subagent_type` de despachos `Task`). */
  input?: Record<string, unknown>;
}
interface MensagemSDK {
  type?: string;
  subtype?: string;
  session_id?: string;
  model?: string;
  parent_tool_use_id?: string | null;
  message?: { content?: BlocoConteudo[] };
  is_error?: boolean;
  total_cost_usd?: number;
  num_turns?: number;
  result?: unknown;
}

export class RunnerClaude implements Runner {
  constructor(private readonly consulta: Consulta = consultaReal) {}

  async executar(job: Job, ctx: ContextoExecucao): Promise<ResultadoClaude> {
    const p = lerParams(job.params);

    // Liga o AbortSignal do gerenciador ao AbortController do SDK (cancelamento in-band,
    // confiável no Windows — nunca kill de processo; ver pesquisa §3).
    const controlador = new AbortController();
    if (ctx.sinal.aborted) controlador.abort();
    else ctx.sinal.addEventListener("abort", () => controlador.abort(), { once: true });

    // Inputs pela UI (T-010): quando o SDK consulta permissão (permissionMode != bypass),
    // roteamos a aprovação/pergunta para o painel via `ctx.pedirInput`. Sob o default
    // `bypassPermissions` o SDK NÃO chama este callback (autonomia preservada); um disparo
    // que queira aprovações na tela manda `permissionMode: "default"`.
    const canUseTool = async (
      toolName: string,
      input: Record<string, unknown>,
    ): Promise<
      | { behavior: "allow"; updatedInput: Record<string, unknown> }
      | { behavior: "deny"; message: string }
    > => {
      if (toolName === "AskUserQuestion") {
        const resp = await ctx.pedirInput(pendenciaPergunta(input));
        return {
          behavior: "allow",
          updatedInput: { ...input, respostaUsuario: resp.escolha ?? "" },
        };
      }
      const resp = await ctx.pedirInput(pendenciaAprovacao(toolName, input));
      if (resp.aprovado === true) return { behavior: "allow", updatedInput: input };
      return {
        behavior: "deny",
        message: resp.mensagem ?? "Ação negada pelo usuário no painel.",
      };
    };

    const consulta = this.consulta({
      prompt: p.prompt,
      options: {
        cwd: p.cwd,
        model: p.modelo,
        // fallbackModel do SDK é string (lista separada por vírgula); re-tenta o primário
        // a cada turno, então uma indisponibilidade temporária não rebaixa a sessão.
        ...(p.fallback !== undefined ? { fallbackModel: p.fallback } : {}),
        // Especialistas do projeto injetados como subagentes (options.agents do SDK).
        ...(p.agentes !== undefined ? { agents: p.agentes } : {}),
        permissionMode: p.permissionMode ?? "bypassPermissions",
        canUseTool,
        abortController: controlador,
        ...(p.maxTurns !== undefined ? { maxTurns: p.maxTurns } : {}),
      },
    });

    let sessionId: string | null = null;
    let custoUsd: number | null = null;
    let numTurnos: number | null = null;
    let erro = false;
    let textoResult = "";
    const partes: string[] = [];

    for await (const bruto of consulta) {
      const msg = bruto as MensagemSDK;
      switch (msg.type) {
        case "system":
          if (msg.subtype === "init") {
            sessionId = msg.session_id ?? null;
            // Grava JÁ no job (T-019): se o fluxo for interrompido no meio, é isto que
            // permite a retomada manual. Esperar o `result` para registrar significaria
            // ter o dado só quando ele não é mais necessário.
            ctx.anotar({ cwd: p.cwd, ...(sessionId !== null ? { sessionId } : {}) });
            ctx.emitir("log", {
              nivel: "inicio",
              texto: `Sessão iniciada — modelo ${msg.model ?? p.modelo}`,
            });
          }
          break;

        case "assistant": {
          const subagente = msg.parent_tool_use_id != null;
          for (const bloco of msg.message?.content ?? []) {
            if (bloco.type === "text" && bloco.text) {
              partes.push(bloco.text);
              ctx.emitir("log", {
                nivel: subagente ? "subagente" : "assistente",
                texto: bloco.text,
              });
            } else if (bloco.type === "tool_use" && bloco.name) {
              const alvo = alvoDeSubagente(bloco);
              ctx.emitir("log", {
                nivel: "ferramenta",
                texto:
                  `${subagente ? "(subagente) " : ""}${bloco.name}` +
                  `${alvo !== null ? ` → ${alvo}` : ""}`,
              });
            }
          }
          break;
        }

        case "result": {
          erro = msg.is_error === true;
          custoUsd = typeof msg.total_cost_usd === "number" ? msg.total_cost_usd : null;
          numTurnos = typeof msg.num_turns === "number" ? msg.num_turns : null;
          if (typeof msg.result === "string" && msg.result !== "") textoResult = msg.result;
          ctx.emitir("log", {
            nivel: erro ? "erro" : "resultado",
            texto:
              `${erro ? "Fluxo terminou com erro" : "Fluxo concluído"}` +
              ` · custo ~$${custoUsd ?? "?"} · ${numTurnos ?? "?"} turno(s)`,
          });
          break;
        }

        default:
          // Tipos não mapeados (stream_event, rate_limit_event, user/tool_result…) são
          // ignorados de propósito — o consumidor nunca deve quebrar com tipo novo.
          break;
      }
    }

    const texto = textoResult !== "" ? textoResult : partes.join("\n");
    if (erro) {
      throw new Error(`Fluxo Claude terminou com erro. ${texto.slice(0, 800)}`.trim());
    }
    return { sessionId, custoUsd, numTurnos, erro, texto };
  }
}

/** Ferramentas que despacham um subagente (varia conforme o binário/SDK). */
const FERRAMENTAS_DESPACHO: ReadonlySet<string> = new Set(["Agent", "Task"]);

/** Resumo curto e seguro do input de uma ferramenta, para exibir no pedido de aprovação. */
function resumoInput(input: Record<string, unknown>): string {
  let texto: string;
  try {
    texto = JSON.stringify(input);
  } catch {
    return "(input não serializável)";
  }
  return texto.length > 300 ? `${texto.slice(0, 300)}…` : texto;
}

/** Monta a pendência de aprovação de uma ferramenta fora do allowlist. */
function pendenciaAprovacao(toolName: string, input: Record<string, unknown>): NovaPendencia {
  return {
    tipo: "aprovacao-ferramenta",
    titulo: `Aprovar uso da ferramenta "${toolName}"?`,
    descricao: `O fluxo quer usar ${toolName} com: ${resumoInput(input)}`,
  };
}

/** Monta a pendência de uma pergunta (AskUserQuestion), de forma defensiva ao formato. */
function pendenciaPergunta(input: Record<string, unknown>): NovaPendencia {
  const perguntas = Array.isArray(input["questions"]) ? (input["questions"] as unknown[]) : [];
  const primeira = (perguntas[0] ?? {}) as { question?: unknown; options?: unknown };
  const texto =
    typeof primeira.question === "string" ? primeira.question : "O fluxo fez uma pergunta.";
  const opcoes = Array.isArray(primeira.options)
    ? (primeira.options as unknown[]).map((o) =>
        typeof o === "string" ? o : String((o as { label?: unknown })?.label ?? o),
      )
    : undefined;
  return {
    tipo: "pergunta",
    titulo: "Pergunta do fluxo",
    descricao: texto,
    ...(opcoes && opcoes.length > 0 ? { opcoes } : {}),
  };
}

/**
 * Para despachos de subagente (ferramenta `Agent` no Claude Code, `Task` em outros
 * SDKs), extrai o tipo de subagente (`subagent_type`) do input — assim o log mostra
 * QUAL especialista/agente foi despachado (ex.: "Agent → domain", "Agent → testador"),
 * não só o nome cru, dando a "visão profunda" de qual membro da equipe está trabalhando.
 * Robusto a churn de versão: qualquer forma inesperada retorna null e o log cai no
 * nome cru da ferramenta.
 */
function alvoDeSubagente(bloco: BlocoConteudo): string | null {
  if (bloco.name === undefined || !FERRAMENTAS_DESPACHO.has(bloco.name)) return null;
  const tipo = bloco.input?.["subagent_type"];
  return typeof tipo === "string" && tipo !== "" ? tipo : null;
}

function lerParams(params: Record<string, unknown>): ParamsClaude {
  const prompt = params["prompt"];
  const cwd = params["cwd"];
  const modelo = params["modelo"];
  if (typeof prompt !== "string" || prompt.trim() === "") {
    throw new Error("Job claude sem `prompt` válido em params.");
  }
  if (typeof cwd !== "string" || cwd.trim() === "") {
    throw new Error("Job claude sem `cwd` válido em params.");
  }
  if (typeof modelo !== "string" || modelo.trim() === "") {
    throw new Error("Job claude sem `modelo` válido em params.");
  }
  const fallback = params["fallback"];
  const agentes = params["agentes"];
  const permissionMode = params["permissionMode"];
  const maxTurns = params["maxTurns"];
  return {
    prompt,
    cwd,
    modelo,
    ...(typeof fallback === "string" && fallback !== "" ? { fallback } : {}),
    ...(agentes !== null && typeof agentes === "object"
      ? { agentes: agentes as Record<string, unknown> }
      : {}),
    ...(typeof permissionMode === "string" ? { permissionMode } : {}),
    ...(typeof maxTurns === "number" ? { maxTurns } : {}),
  };
}
