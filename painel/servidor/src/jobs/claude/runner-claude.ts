import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ContextoExecucao, Job, NovaPendencia, Runner } from "../tipos.js";
import { ehEsforco, type Esforco } from "../robustez/guardrails.js";

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
  /** Profundidade de raciocínio (`effort` do SDK); ausente = padrão do modelo. */
  esforco?: Esforco;
}

/**
 * Consumo de tokens do fluxo (T-044). Guardado porque **preço esconde a causa**: os dois
 * cortes de custo que valeram alguma coisa nesta base (o resumidor da T-039 e o `effort`
 * da T-042) só foram encontrados olhando TOKENS. Sem isto, toda auditoria de custo futura
 * recomeça do zero e precisa gastar assinatura para descobrir o óbvio.
 *
 * `cacheLeitura` é o número que mais importa num fluxo agêntico: é o contexto reenviado a
 * cada turno. Se ele domina, o caro é o TAMANHO DO CONTEXTO, não o que o modelo escreveu —
 * e aí adiantar mexer em prompt/ferramentas, não em `effort`.
 */
export interface TokensJob {
  entrada: number;
  saida: number;
  cacheLeitura: number;
  cacheEscrita: number;
  /** Um fluxo pode usar mais de um modelo (fallback, subagentes com modelo próprio). */
  porModelo: Record<string, { entrada: number; saida: number; cacheLeitura: number; custoUsd: number }>;
}

export interface ResultadoClaude {
  sessionId: string | null;
  /** Estimativa informativa (assinatura não cobra à parte) — exibir como referência. */
  custoUsd: number | null;
  numTurnos: number | null;
  erro: boolean;
  /** Texto final do fluxo. */
  texto: string;
  /** null quando o SDK não reportou uso (erro precoce, versão sem o campo). */
  tokens: TokensJob | null;
  /**
   * Causa da falha quando ela é RECONHECÍVEL (T-045). `limite-uso` é a única hoje e existe
   * para a UI distinguir "a fábrica tem um bug" de "a assinatura acabou, volta às 14:40" —
   * são reações opostas do usuário, e antes as duas apareciam como "falhou".
   */
  motivo?: "limite-uso";
  /** Hora de reabertura anunciada pelo provedor, quando `motivo === "limite-uso"`. */
  reabreEm?: string | null;
  /**
   * Quantas sessões o SDK abriu neste job (T-047). Um job NÃO é uma sessão: numa rodada real
   * o `/trabalhar` abriu SEIS — despacho em background reabre sessão. Importa para custo
   * porque **cada sessão é um prefixo novo para ESCREVER no cache**, e escrita de cache é a
   * maior linha da conta (1,25× contra 0,1× da leitura). Contar é de graça e é o único jeito
   * de enxergar esse driver, já que só a última sessão reporta `result`.
   */
  sessoes?: number;
}

/**
 * Falha de um fluxo Claude que CARREGA a contabilidade (T-045). Existe porque o `throw`
 * cru descartava `custoUsd`/`tokens`: os jobs que falham são justamente os mais caros
 * (queimaram contexto e não entregaram nada) e eram os únicos sem dado nenhum — uma
 * rodada real gastou US$ 0,61 e gravou `resultado: null`.
 */
export class ErroFluxoClaude extends Error {
  constructor(
    mensagem: string,
    /** Resultado parcial: o que o SDK reportou até falhar. Vai para `job.resultado`. */
    readonly resultado: ResultadoClaude,
  ) {
    super(mensagem);
    this.name = "ErroFluxoClaude";
  }
}

/**
 * Limite de uso da assinatura — parede RÍGIDA: só o relógio abre. Reconhecer isto é o que
 * permite parar na hora em vez de reabrir sessão contra ela (ver `motivo` abaixo).
 * Casado em minúsculas; cobre as formas de sessão e de janela semanal.
 */
const PADROES_LIMITE: readonly RegExp[] = [
  /hit your (?:session|usage) limit/i,
  /limite de (?:sess[ãa]o|uso)/i,
  /usage limit reached/i,
  /rate.?limit(?:ed)? · resets/i,
];

/** O texto indica limite de assinatura batido? */
export function ehLimiteDeUso(texto: string): boolean {
  return PADROES_LIMITE.some((re) => re.test(texto));
}

/**
 * Hora de reabertura anunciada na mensagem ("resets 2:40pm"), para a UI dizer QUANDO
 * voltar em vez de só "falhou". Devolve o trecho como veio — normalizar fuso a partir de
 * um texto do provedor daria falsa precisão.
 */
export function horaDeReabertura(texto: string): string | null {
  return /resets? ([^\n·]{1,40})/i.exec(texto)?.[1]?.trim() ?? null;
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
  /** `modelUsage` do SDK: uso por modelo. Lido de forma defensiva (churn de versão). */
  modelUsage?: Record<string, unknown>;
}

/** Soma o `modelUsage` do SDK. Nunca lança: campo ausente/estranho vira null. */
function lerTokens(modelUsage: Record<string, unknown> | undefined): TokensJob | null {
  if (modelUsage === undefined || modelUsage === null || typeof modelUsage !== "object") return null;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const total: TokensJob = { entrada: 0, saida: 0, cacheLeitura: 0, cacheEscrita: 0, porModelo: {} };

  for (const [modelo, bruto] of Object.entries(modelUsage)) {
    if (bruto === null || typeof bruto !== "object") continue;
    const u = bruto as Record<string, unknown>;
    const entrada = num(u["inputTokens"]);
    const saida = num(u["outputTokens"]);
    const cacheLeitura = num(u["cacheReadInputTokens"]);
    total.entrada += entrada;
    total.saida += saida;
    total.cacheLeitura += cacheLeitura;
    total.cacheEscrita += num(u["cacheCreationInputTokens"]);
    total.porModelo[modelo] = { entrada, saida, cacheLeitura, custoUsd: num(u["costUSD"]) };
  }
  return Object.keys(total.porModelo).length === 0 ? null : total;
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

    // Sob `bypassPermissions` o SDK auto-aprova tudo ANTES de consultar o callback — e
    // avisa isso no console a cada job (CLAUDE_SDK_CAN_USE_TOOL_SHADOWED). Passar o
    // callback nesse modo é mentira de intenção e vira ruído: só mandamos quando o modo
    // realmente pede aprovação.
    const permissionMode = p.permissionMode ?? "bypassPermissions";
    const aprovaPelaUI = permissionMode !== "bypassPermissions";

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
        permissionMode,
        ...(aprovaPelaUI ? { canUseTool } : {}),
        abortController: controlador,
        ...(p.maxTurns !== undefined ? { maxTurns: p.maxTurns } : {}),
        // `effort` é opção de TOPO das Options do SDK (sdk.d.ts: `effort?: EffortLevel`).
        // Não existe `outputConfig` na API do SDK — aninhar aqui compila (spread
        // condicional escapa da checagem de excesso) e é descartado em silêncio, o
        // fluxo continua no padrão e a economia nunca acontece. É o mesmo modo de falha
        // do `watchdogMs` que ninguém consumia; por isso há teste sobre o nome da opção.
        // Só vai quando a tabela de guardrails define: omitir mantém o padrão do modelo,
        // que é o certo para os fluxos de julgamento.
        ...(p.esforco !== undefined ? { effort: p.esforco } : {}),
      },
    });

    let sessionId: string | null = null;
    let custoUsd: number | null = null;
    let numTurnos: number | null = null;
    let erro = false;
    let tokens: TokensJob | null = null;
    let textoResult = "";
    /** Um job pode abrir várias sessões (despacho em background reabre). Ver `sessoes`. */
    let sessoes = 0;
    const partes: string[] = [];
    /**
     * Disjuntor de cota (T-045). Uma vez batido o limite da assinatura, TODA continuação é
     * desperdício garantido: numa rodada real o fluxo reabriu sessão duas vezes contra a
     * parede, pagando 173,8k de cache relido em cada, e terminou sem entregar nada.
     * Só o relógio abre essa porta — então paramos no primeiro sinal.
     */
    let limiteBatido: string | null = null;

    for await (const bruto of consulta) {
      const msg = bruto as MensagemSDK;
      switch (msg.type) {
        case "system":
          if (msg.subtype === "init") {
            sessoes += 1;
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
              // O provedor anuncia a cota como TEXTO do assistente (é o que aparece na
              // tela do CLI), não como erro de transporte — daí a checagem ser aqui.
              if (limiteBatido === null && ehLimiteDeUso(bloco.text)) limiteBatido = bloco.text;
            } else if (bloco.type === "tool_use" && bloco.name) {
              const alvo = alvoDeSubagente(bloco);
              // Despacho mantém a seta (o segmentador da T-039 casa `→ agente` para fechar
              // trecho — mudar essa grafia quebraria os resumos). Demais ferramentas ganham
              // o alvo depois de dois-pontos, que não colide com esse padrão.
              const sobre = alvo === null ? alvoDeFerramenta(bloco) : null;
              ctx.emitir("log", {
                nivel: "ferramenta",
                texto:
                  `${subagente ? "(subagente) " : ""}${bloco.name}` +
                  `${alvo !== null ? ` → ${alvo}` : ""}` +
                  `${sobre !== null ? `: ${sobre}` : ""}`,
              });
            }
          }
          break;
        }

        case "result": {
          erro = msg.is_error === true;
          // MEDIDO numa rodada de 8 sessões (T-047): custo e turnos se comportam DIFERENTE
          // entre `result`s, e tratar os dois igual subcontava turnos em 6×.
          //
          // `total_cost_usd` é CUMULATIVO — subiu monotonicamente 0,79 → 1,44 → … → 7,42 ao
          // longo das sessões. Sobrescrever é o certo; somar daria mais de 30 dólares falsos.
          custoUsd = typeof msg.total_cost_usd === "number" ? msg.total_cost_usd : null;
          // `num_turns` é POR SESSÃO — veio 17, 7, 4, 6, 4, 6, 7, 10. O job gravava só o
          // último (10) quando o trabalho real foram 61. Este é o único campo que soma.
          if (typeof msg.num_turns === "number") numTurnos = (numTurnos ?? 0) + msg.num_turns;
          // `modelUsage` veio IDÊNTICO nos sete últimos `result`s, o que só faz sentido se já
          // for um total acumulado — então sobrescreve, como o custo. Ficou anotado no log do
          // dia que o platô não bate com o custo subindo; se isso virar problema, medir de novo.
          tokens = lerTokens(msg.modelUsage);
          if (typeof msg.result === "string" && msg.result !== "") textoResult = msg.result;
          ctx.emitir("log", {
            nivel: erro ? "erro" : "resultado",
            texto:
              `${erro ? "Fluxo terminou com erro" : "Fluxo concluído"}` +
              ` · custo ~$${custoUsd ?? "?"} · ${numTurnos ?? "?"} turno(s)` +
              (tokens !== null
                ? ` · ${fmt(tokens.saida)} saída, ${fmt(tokens.cacheLeitura)} de cache relido`
                : ""),
          });
          break;
        }

        default:
          // Tipos não mapeados (stream_event, rate_limit_event, user/tool_result…) são
          // ignorados de propósito — o consumidor nunca deve quebrar com tipo novo.
          break;
      }

      // Disjuntor: aborta o SDK e sai do laço ANTES de outra sessão nascer. `abort()` aqui
      // é o mesmo mecanismo do cancelamento pelo usuário (in-band, confiável no Windows).
      if (limiteBatido !== null) {
        const reabre = horaDeReabertura(limiteBatido);
        ctx.emitir("log", {
          nivel: "erro",
          texto:
            "Limite de uso da assinatura batido — fluxo interrompido para não gastar à toa" +
            `${reabre !== null ? `; retoma após ${reabre}` : ""}.`,
        });
        controlador.abort();
        break;
      }
    }

    const texto = textoResult !== "" ? textoResult : partes.join("\n");

    if (limiteBatido !== null) {
      const reabre = horaDeReabertura(limiteBatido);
      // "Nada foi entregue" era MENTIRA em job multi-sessão (T-047). Numa rodada real o
      // fluxo concluiu 21 turnos — T-003 aprovada, T-004 num ciclo inteiro, 4 commits — e
      // só então bateu na cota; a mensagem mandava redisparar como se nada tivesse saído,
      // o que faria o usuário refazer trabalho já commitado. Um `result` recebido é a prova
      // de que uma sessão fechou: só sem ele é honesto dizer que não saiu nada.
      const entregouAlgo = numTurnos !== null && numTurnos > 0;
      throw new ErroFluxoClaude(
        `Limite de uso da assinatura batido${reabre !== null ? ` — retoma após ${reabre}` : ""}. ` +
          (entregouAlgo
            ? `O fluxo concluiu ${numTurnos} turno(s) antes de parar — o que foi commitado está valendo. ` +
              "Confira o estado das tarefas antes de redisparar, para não refazer trabalho pronto."
            : "Nada foi entregue; redispare quando a cota voltar."),
        {
          sessionId,
          custoUsd,
          numTurnos,
          erro: true,
          texto,
          tokens,
          motivo: "limite-uso",
          reabreEm: reabre,
          sessoes,
        },
      );
    }

    if (erro) {
      throw new ErroFluxoClaude(
        `Fluxo Claude terminou com erro. ${texto.slice(0, 800)}`.trim(),
        { sessionId, custoUsd, numTurnos, erro, texto, tokens, sessoes },
      );
    }
    return { sessionId, custoUsd, numTurnos, erro, texto, tokens, sessoes };
  }
}

/** Milhares abreviados: 15893 -> "15,9k". Log de fluxo é para ler de relance. */
function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(".", ",")}k` : String(n);
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

/**
 * SOBRE O QUE a ferramenta agiu, em uma linha (T-047).
 *
 * Medido numa execução real: **74% a 92% das linhas do console eram só o nome da ferramenta**,
 * com trechos de até 15 chamadas seguidas sem uma palavra de contexto — "Bash / Read / Bash /
 * Glob" rolando sem dizer nada. O resumidor da T-039 não cobre isso: ele só fecha trecho num
 * despacho de agente, e as piores sequências acontecem DENTRO do trabalho de um agente só.
 *
 * O dado sempre esteve no evento e era descartado. Extrair é de graça — nenhuma chamada de
 * modelo, nenhum token — e é o que transforma a lista em narrativa legível.
 */
function alvoDeFerramenta(bloco: BlocoConteudo): string | null {
  const input = bloco.input;
  if (input === undefined || input === null) return null;

  // Ordem importa: a primeira chave presente ganha. Caminho antes de conteúdo, porque
  // "Write app.py" informa e o corpo do arquivo inundaria a linha.
  for (const chave of ["file_path", "path", "notebook_path", "pattern", "command", "url", "query"]) {
    const bruto = input[chave];
    if (typeof bruto !== "string" || bruto.trim() === "") continue;

    let texto = bruto.trim().replace(/\s+/g, " ");
    // Caminho vira só o nome do arquivo: o diretório é sempre o mesmo e come a linha inteira.
    if (chave.endsWith("path")) texto = texto.split(/[\\/]/).pop() ?? texto;
    return texto.length > 60 ? `${texto.slice(0, 60)}…` : texto;
  }
  return null;
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
  const esforco = params["esforco"];
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
    // Validado, não repassado cru: o job passa pelo disco (`dados/`) entre a montagem e a
    // execução, então o que chega aqui é dado externo. Valor estranho é ignorado — cair no
    // padrão do modelo é degradação certa; mandar lixo ao SDK derruba o fluxo inteiro.
    ...(ehEsforco(esforco) ? { esforco } : {}),
  };
}
