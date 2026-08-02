import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ContextoExecucao, Job, NovaPendencia, Runner } from "../tipos.js";
import { ehEsforco, type Esforco } from "../robustez/guardrails.js";
import { estimarCusto } from "./precos.js";
import {
  comAgentesEmVoo,
  comGasto,
  decidir,
  novoOrcamento,
  type SituacaoOrcamento,
} from "../../pipeline/orcamento.js";

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
  /**
   * Teto de custo do job, em US$. Ausente/inválido = sem teto (comportamento antigo).
   *
   * É o freio que não existia: dos 55 jobs já rodados, **10 falharam e os 10 falharam por
   * cota**. `maxTurns` não serve para isso e o histórico prova — ele limita só o laço do
   * orquestrador, enquanto `num_turns` é somado entre os `result` inclusive dos subagentes;
   * jobs somaram 211 e 212 voltas com o teto em 120. Aqui a unidade é dinheiro, que é o
   * que acaba. Ver `pipeline/orcamento.ts` para a decisão e a parada limpa.
   */
  tetoUsd?: number;
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
  /**
   * Um fluxo pode usar mais de um modelo (fallback, subagentes com modelo próprio).
   *
   * `cacheEscrita` entra aqui na T-049: sem ele não dá para ESTIMAR o custo por modelo, e
   * escrita de cache é a linha mais cara por token (1,25× a entrada, contra 0,1× da
   * leitura). `custoUsd` é o que o SDK reportou — fica `0` no acumulador incremental,
   * porque ali o dado de preço não existe; quem preenche é `custoEstimadoUsd` do job.
   */
  porModelo: Record<
    string,
    { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number; custoUsd: number }
  >;
  /**
   * Uso atribuído a cada AGENTE do pipeline (T-050). `orquestrador` é o nível de topo.
   *
   * Existe porque "o job custou X" não é acionável: o pipeline despacha executor, testador
   * e revisor por tarefa, e sem separar não dá para saber qual deles justifica o preço. Na
   * rodada que motivou isto, um `revisor` fez 70 chamadas de ferramenta e um `executor`
   * fez 104 — mas contagem de ferramenta é proxy, não custo. Aqui vira custo.
   *
   * Só é preenchido no acumulador incremental: o `modelUsage` do `result` agrega por
   * modelo e não sabe qual subagente gastou o quê.
   */
  porAgente?: Record<string, UsoAgente>;
}

/** Consumo de um agente do pipeline dentro de um job. */
export interface UsoAgente {
  entrada: number;
  saida: number;
  cacheLeitura: number;
  cacheEscrita: number;
  /** Voltas de API distintas — o "quantas vezes ele foi ao modelo". */
  voltas: number;
  /** Chamadas de ferramenta feitas por este agente. */
  ferramentas: number;
  /** Quantas vezes este agente foi despachado no job. */
  despachos: number;
  /** Modelos que ele usou (um agente pode cair no fallback). */
  modelos: string[];
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
   * `true` quando `tokens` veio do acumulador incremental (mensagens `assistant`) e não do
   * `modelUsage` do `result` (T-049). Só acontece em job cortado antes do `result` — que é
   * justamente o caro. A UI precisa disso para não apresentar número parcial como fechado.
   */
  tokensParciais?: boolean;
  /**
   * Custo ESTIMADO pela tabela de `precos.ts`, calculado sempre que há tokens. Existe para
   * dar preço a job cortado (onde `custoUsd` é `null`) e, nos jobs completos, para servir
   * de conferência contínua da tabela contra o valor real — de graça, sem gastar cota.
   */
  custoEstimadoUsd?: number | null;
  /**
   * Modelos que apareceram no uso e não estão na tabela de preços. Não-vazio =
   * `custoEstimadoUsd` está SUBESTIMADO e a UI tem de dizer isso.
   */
  modelosSemPreco?: string[];
  /**
   * Desfecho RECONHECÍVEL do fluxo (T-045), para a UI distinguir reações opostas do usuário
   * — antes tudo aparecia como "falhou".
   *
   * - `limite-uso`: a assinatura acabou; volta às 14:40, não há o que decidir. É FALHA.
   * - `teto-custo`: o orçamento do job acabou e ele parou limpo, sem agente cortado. **Não
   *   é falha** — é o sistema funcionando, e o que foi entregue vale. A ação do usuário é
   *   decidir se aumenta o teto, não redisparar às cegas.
   */
  motivo?: "limite-uso" | "teto-custo";
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
  /**
   * Despachos de subagente que NÃO pediram execução bloqueante (T-048). Em headless não há
   * quem entregue a notificação de término: se o fluxo encerra o turno esperando por ela, a
   * sessão fecha e o agente em voo é cortado no meio. Foi assim que o `/novo-projeto
   * banco-imobiliario` terminou `concluido`, sem erro, com 9 das 22 tarefas nunca escritas.
   *
   * Conta despacho SEM `run_in_background: false` — não só o com `true`. Segundo plano é o
   * padrão da ferramenta, então omitir o campo já basta para abandonar o agente; ver
   * `ehDespachoEmFundo`. Contar é de graça (o dado já vem no `tool_use`) e é um sinal de
   * RISCO, não de dano: para o dano consumado, ver `despachosEmVoo`.
   */
  despachosFundo?: number;
  /**
   * Despachos de subagente que o fluxo terminou SEM receber o `tool_result` (01/08). É a
   * prova do dano, e não do risco: se não veio resultado, aquele agente estava trabalhando
   * quando a sessão fechou — foi cortado no meio, com tudo que ele não gravou perdido.
   *
   * Independe de `run_in_background`, do texto do modelo e da versão do SDK: casa o `id` do
   * `tool_use` de despacho com o `tool_use_id` dos blocos `tool_result`. Zero é o normal;
   * qualquer valor > 0 significa que o resultado do job NÃO pode ser lido como entrega.
   */
  despachosEmVoo?: number;
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
  /** `id` do `tool_use` — é ele que as mensagens do subagente citam em `parent_tool_use_id`. */
  id?: string;
  /** Input da ferramenta (usado p/ extrair `subagent_type` de despachos `Task`). */
  input?: Record<string, unknown>;
  /** `tool_result`: `id` do `tool_use` que ele responde. Ver `despachosEmVoo`. */
  tool_use_id?: string;
}
interface MensagemSDK {
  type?: string;
  subtype?: string;
  session_id?: string;
  model?: string;
  parent_tool_use_id?: string | null;
  /** Tipo do subagente que produziu a mensagem. Opcional no SDK — usado só como reserva. */
  subagent_type?: string;
  /**
   * `message` é o `BetaMessage` da API (sdk.d.ts: `SDKAssistantMessage.message`). Além do
   * conteúdo, ele carrega `id`, `model` e `usage` — a contabilidade POR VOLTA, que é o que
   * permite acumular custo sem esperar o `result`. Tudo opcional aqui de propósito: o
   * runner nunca pode quebrar por churn de versão do SDK.
   */
  message?: {
    content?: BlocoConteudo[];
    id?: string;
    model?: string;
    usage?: Record<string, unknown>;
  };
  is_error?: boolean;
  total_cost_usd?: number;
  num_turns?: number;
  result?: unknown;
  /** `modelUsage` do SDK: uso por modelo. Lido de forma defensiva (churn de versão). */
  modelUsage?: Record<string, unknown>;
}

/** Lê número defensivamente: campo ausente, nulo ou estranho vira 0. */
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Soma o `modelUsage` do SDK. Nunca lança: campo ausente/estranho vira null. */
function lerTokens(modelUsage: Record<string, unknown> | undefined): TokensJob | null {
  if (modelUsage === undefined || modelUsage === null || typeof modelUsage !== "object") return null;
  const total: TokensJob = { entrada: 0, saida: 0, cacheLeitura: 0, cacheEscrita: 0, porModelo: {} };

  for (const [modelo, bruto] of Object.entries(modelUsage)) {
    if (bruto === null || typeof bruto !== "object") continue;
    const u = bruto as Record<string, unknown>;
    const entrada = num(u["inputTokens"]);
    const saida = num(u["outputTokens"]);
    const cacheLeitura = num(u["cacheReadInputTokens"]);
    const cacheEscrita = num(u["cacheCreationInputTokens"]);
    total.entrada += entrada;
    total.saida += saida;
    total.cacheLeitura += cacheLeitura;
    total.cacheEscrita += cacheEscrita;
    total.porModelo[modelo] = {
      entrada,
      saida,
      cacheLeitura,
      cacheEscrita,
      custoUsd: num(u["costUSD"]),
    };
  }
  return Object.keys(total.porModelo).length === 0 ? null : total;
}

/**
 * Acumulador de uso lido das mensagens `assistant` (T-049) — a contabilidade que sobrevive
 * a um job cortado antes do `result`.
 *
 * **Deduplica por `message.id`, e isso não é zelo excessivo.** O próprio `sdk.d.ts` avisa,
 * no comentário de `SDKAssistantMessage.timestamp`: *"One API assistant turn may produce
 * several assistant messages sharing a message.id"*. O `usage` que vem em cada uma delas é
 * o da VOLTA inteira, não o do pedaço — somar mensagem a mensagem multiplicaria a conta
 * pelo número de blocos de conteúdo, e o erro seria para CIMA, que é o pior lado: um
 * acumulador que exagera vira "descobrimos um gasto oculto" e manda otimizar o que não
 * existe. Contar volta distinta é a única leitura correta.
 */
class AcumuladorDeUso {
  /**
   * Uso por VOLTA de API, indexado por `message.id`.
   *
   * A primeira versão guardava só os ids num `Set` e somava a usage da PRIMEIRA mensagem de
   * cada volta. Errado, e a rodada real `c6d8cede` mostrou como: 176 voltas somaram 1.642
   * tokens de saída — 9 por volta, impossível —, enquanto a leitura de cache saiu plausível
   * (34k–59k por volta).
   *
   * A explicação está na assimetria: quando o SDK reparte uma volta em várias mensagens com
   * o mesmo `message.id`, **entrada e cache já são finais na primeira** (são conhecidos no
   * instante da requisição), mas **a saída ainda está sendo gerada**. Pegar a primeira
   * captura o lado de entrada certo e zera o de saída.
   *
   * Guardar o MÁXIMO por campo resolve os dois casos possíveis sem depender de qual é o
   * verdadeiro: se a usage for a da volta inteira em toda mensagem, máximo = o valor; se for
   * cumulativa parcial, máximo = o total final. Somar seria o único jeito de errar para
   * cima, e é justamente o que a deduplicação existe para evitar.
   */
  private readonly voltasUso = new Map<string, VoltaUso>();
  /** Voltas sem `message.id`: não dá para deduplicar nem para reconciliar; entram somadas. */
  private readonly semIdUso: VoltaUso[] = [];
  private readonly porAgente: Record<string, UsoAgente> = {};
  /**
   * `tool_use.id` do despacho → nome do agente. É assim que se liga uma mensagem de
   * subagente ao agente que a produziu: o SDK marca cada mensagem do filho com
   * `parent_tool_use_id` igual ao `id` do `tool_use` que o despachou.
   *
   * Preferimos este mapa ao campo `subagent_type` da própria mensagem porque ele é
   * DETERMINÍSTICO: vem do input do `tool_use`, que sempre existe num despacho, enquanto
   * `subagent_type` é opcional no tipo do SDK e some conforme a versão.
   */
  private readonly agentePorDespacho = new Map<string, string>();
  /** Voltas sem `message.id` — contadas, mas sem poder deduplicar. Ver `confiavel`. */
  private semId = 0;

  /** Nome do agente dono desta mensagem; topo do fluxo é o orquestrador. */
  private donoDe(msg: MensagemSDK): string {
    const pai = msg.parent_tool_use_id;
    if (pai == null) return ORQUESTRADOR;
    return (
      this.agentePorDespacho.get(pai) ??
      // Fallback: o SDK também anuncia o tipo na própria mensagem em versões recentes.
      (typeof msg.subagent_type === "string" && msg.subagent_type !== ""
        ? msg.subagent_type
        : "subagente")
    );
  }

  private baldeAgente(nome: string): UsoAgente {
    return (this.porAgente[nome] ??= {
      entrada: 0,
      saida: 0,
      cacheLeitura: 0,
      cacheEscrita: 0,
      voltas: 0,
      ferramentas: 0,
      despachos: 0,
      modelos: [],
    });
  }

  /**
   * Registra um despacho de subagente: liga o `tool_use.id` ao nome do agente, para as
   * mensagens futuras do filho serem atribuídas a ele.
   */
  registrarDespacho(bloco: BlocoConteudo, agente: string): void {
    if (typeof bloco.id === "string" && bloco.id !== "") {
      this.agentePorDespacho.set(bloco.id, agente);
    }
    this.baldeAgente(agente).despachos += 1;
  }

  /** Contabiliza uma chamada de ferramenta no agente que a fez. */
  registrarFerramenta(msg: MensagemSDK): void {
    this.baldeAgente(this.donoDe(msg)).ferramentas += 1;
  }

  /**
   * Registra uma mensagem `assistant`. Idempotente por `message.id`: repetição do mesmo id
   * RECONCILIA (máximo por campo) em vez de somar ou de ser ignorada. Ver `voltasUso`.
   */
  registrar(msg: MensagemSDK): void {
    const m = msg.message;
    if (m === undefined || m.usage === undefined || typeof m.usage !== "object") return;

    const volta: VoltaUso = {
      modelo: typeof m.model === "string" && m.model !== "" ? m.model : "desconhecido",
      agente: this.donoDe(msg),
      entrada: num(m.usage["input_tokens"]),
      saida: num(m.usage["output_tokens"]),
      cacheLeitura: num(m.usage["cache_read_input_tokens"]),
      cacheEscrita: num(m.usage["cache_creation_input_tokens"]),
    };

    const id = typeof m.id === "string" && m.id !== "" ? m.id : null;
    if (id === null) {
      this.semIdUso.push(volta);
      return;
    }
    const antes = this.voltasUso.get(id);
    if (antes === undefined) {
      this.voltasUso.set(id, volta);
      return;
    }
    // Reconcilia: modelo/agente vêm da primeira (não mudam no meio de uma volta); os
    // números ficam com o maior visto, que é o valor final de cada campo.
    antes.entrada = Math.max(antes.entrada, volta.entrada);
    antes.saida = Math.max(antes.saida, volta.saida);
    antes.cacheLeitura = Math.max(antes.cacheLeitura, volta.cacheLeitura);
    antes.cacheEscrita = Math.max(antes.cacheEscrita, volta.cacheEscrita);
  }

  /** Todas as voltas contabilizadas, com e sem id. */
  private get todasAsVoltas(): VoltaUso[] {
    return [...this.voltasUso.values(), ...this.semIdUso];
  }

  /** Voltas de API distintas observadas — o substituto honesto de `num_turns`. */
  get voltasDistintas(): number {
    return this.voltasUso.size + this.semIdUso.length;
  }

  /** Quantos despachos de subagente foram vistos (independe de a atribuição ter funcionado). */
  get despachosVistos(): number {
    return this.agentePorDespacho.size;
  }

  /**
   * A atribuição por agente casou alguma mensagem com algum subagente?
   *
   * Existe porque este acumulador foi testado contra o SDK FALSO: se as formas reais
   * (`parent_tool_use_id`, `message.id`) divergirem, ele não quebra — ele atribui tudo ao
   * orquestrador e produz um rateio plausível e ERRADO. É a mesma família do `effort` com
   * nome errado e do `watchdogMs` que ninguém lia: falha silenciosa que parece sucesso.
   */
  get atribuiuSubagente(): boolean {
    // Lê as VOLTAS, não `porAgente`: `registrarDespacho` já cria o balde do agente ao ver o
    // despacho, então checar a chave daria "atribuiu" com zero consumo ligado a ele — o
    // verificador validaria a si mesmo. Ler as voltas também torna esta checagem
    // independente de `fechar()` já ter rodado.
    return this.todasAsVoltas.some((v) => v.agente !== ORQUESTRADOR);
  }

  /**
   * Sem `message.id` em alguma volta não há como garantir que não houve dupla contagem.
   * A UI usa isto para não vender precisão que o dado não tem.
   */
  get confiavel(): boolean {
    return this.semIdUso.length === 0;
  }

  /**
   * Fecha o acumulado; `null` quando nada foi registrado.
   *
   * A agregação por modelo e por agente acontece AQUI, e não durante o registro, porque
   * antes de a volta terminar os números dela ainda podem subir (ver `voltasUso`). Somar
   * incrementalmente congelaria o primeiro valor visto.
   */
  fechar(): TokensJob | null {
    const voltas = this.todasAsVoltas;
    if (voltas.length === 0) return null;

    const porModelo: TokensJob["porModelo"] = {};
    const total: TokensJob = {
      entrada: 0,
      saida: 0,
      cacheLeitura: 0,
      cacheEscrita: 0,
      porModelo,
      porAgente: this.porAgente,
    };

    for (const v of voltas) {
      const m = (porModelo[v.modelo] ??= {
        entrada: 0,
        saida: 0,
        cacheLeitura: 0,
        cacheEscrita: 0,
        custoUsd: 0,
      });
      m.entrada += v.entrada;
      m.saida += v.saida;
      m.cacheLeitura += v.cacheLeitura;
      m.cacheEscrita += v.cacheEscrita;

      const a = this.baldeAgente(v.agente);
      a.entrada += v.entrada;
      a.saida += v.saida;
      a.cacheLeitura += v.cacheLeitura;
      a.cacheEscrita += v.cacheEscrita;
      a.voltas += 1;
      if (!a.modelos.includes(v.modelo)) a.modelos.push(v.modelo);

      total.entrada += v.entrada;
      total.saida += v.saida;
      total.cacheLeitura += v.cacheLeitura;
      total.cacheEscrita += v.cacheEscrita;
    }
    return total;
  }

  /**
   * Uso por agente mesmo quando o `modelUsage` do `result` for a fonte dos totais. Sem
   * isto, job COMPLETO — o caso normal — ficaria sem a única visão que diz onde otimizar,
   * porque `modelUsage` agrega por modelo e não conhece subagente.
   */
  agentes(): Record<string, UsoAgente> | undefined {
    return Object.keys(this.porAgente).length > 0 ? this.porAgente : undefined;
  }
}

/** Nome do nível de topo do fluxo na atribuição por agente. */
const ORQUESTRADOR = "orquestrador";

/** Uso de UMA volta de API, antes de ser agregado por modelo e por agente. */
interface VoltaUso {
  modelo: string;
  agente: string;
  entrada: number;
  saida: number;
  cacheLeitura: number;
  cacheEscrita: number;
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
        // Preset do Claude Code SEM as seções que variam por sessão (diretório de
        // trabalho, git status, caminho de memória). O SDK reinjeta esse conteúdo como
        // primeira mensagem de usuário, então o modelo continua tendo acesso — o que muda
        // é que o systemPrompt vira ESTÁVEL e o prefixo passa a poder ser reaproveitado
        // pelo cache entre despachos.
        //
        // Sem isto não existe prefixo compartilhado: basta o git status mudar (e ele muda a
        // cada commit de tarefa) para o cache não casar mais, silenciosamente. O próprio
        // sdk.d.ts rotula a opção como "Cacheable prompt for multi-user fleets".
        //
        // Custo da troca, declarado no SDK: cwd/memória/git ficam marginalmente menos
        // autoritativos (aparecem em mensagem de usuário, não no sistema) e a primeira
        // mensagem fica um pouco maior. Ambos irrelevantes aqui — o confinamento da fábrica
        // vai explícito no texto do prompt, não depende dessa seção.
        systemPrompt: {
          type: "preset" as const,
          preset: "claude_code" as const,
          excludeDynamicSections: true,
        },
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
    /** Ver `despachosFundo`: subagente despachado em segundo plano dentro de um headless. */
    let despachosFundo = 0;
    /**
     * Despachos ainda sem `tool_result` — `tool_use.id` → agente. O que sobrar aqui quando o
     * laço terminar é agente que estava trabalhando na hora em que a sessão fechou. Ver
     * `despachosEmVoo`.
     */
    const despachosPendentes = new Map<string, string>();
    /**
     * Contabilidade que sobrevive ao corte (T-049): alimentada a cada mensagem `assistant`,
     * então já vale ANTES de qualquer `result`. Nos jobs completos serve de conferência.
     */
    const acumulador = new AcumuladorDeUso();
    /**
     * Chamadas de ferramenta observadas. É o sinal objetivo de que houve TRABALHO num job
     * cortado — `numTurnos` vem `null` nesse caso, e era ele que a mensagem de falha
     * consultava para decidir se dizia "nada foi entregue".
     */
    let ferramentas = 0;
    const partes: string[] = [];
    /**
     * Disjuntor de cota (T-045). Uma vez batido o limite da assinatura, TODA continuação é
     * desperdício garantido: numa rodada real o fluxo reabriu sessão duas vezes contra a
     * parede, pagando 173,8k de cache relido em cada, e terminou sem entregar nada.
     * Só o relógio abre essa porta — então paramos no primeiro sinal.
     */
    let limiteBatido: string | null = null;
    /**
     * Orçamento do job. `tetoUsd` ausente = `null` = comportamento antigo, sem freio —
     * explícito, para ninguém achar que há teto onde não há.
     */
    let orcamento = novoOrcamento(p.tetoUsd ?? null);
    /**
     * Última SITUAÇÃO de orçamento já registrada, para não repetir o mesmo aviso a cada
     * volta. É a situação e não a ação: "resta pouco" e "estourou, esperando agente" levam
     * ambas a `nao-iniciar`, e esconder a segunda tiraria do log justo o aviso que importa.
     * Também não é o texto — ele embute o gasto, que muda toda volta.
     */
    let avisoOrcamento: SituacaoOrcamento | "" = "";
    /** Preenchido quando o fluxo foi encerrado PELO teto — desfecho planejado, não falha. */
    let tetoAtingido: string | null = null;

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
          // ANTES de qualquer coisa: a contabilidade não pode depender de o resto do
          // tratamento dar certo. É o único ponto do fluxo em que o custo é observável
          // enquanto ele acontece.
          acumulador.registrar(msg);
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
              ferramentas += 1;
              acumulador.registrarFerramenta(msg);
              const alvo = alvoDeSubagente(bloco);
              // Liga `tool_use.id` → agente ANTES de o filho começar a emitir: é o que
              // permite atribuir o consumo dele a quem o despachou.
              if (alvo !== null) {
                acumulador.registrarDespacho(bloco, alvo);
                // Abre a pendência: só o `tool_result` correspondente a fecha. Ver
                // `despachosEmVoo`.
                if (typeof bloco.id === "string" && bloco.id !== "") {
                  despachosPendentes.set(bloco.id, alvo);
                }
              }
              if (ehDespachoEmFundo(bloco)) {
                despachosFundo += 1;
                // Avisar AQUI (e não só no fim) porque é acionável enquanto o fluxo roda:
                // dá para acompanhar se o agente chegou a terminar antes da sessão fechar.
                ctx.emitir("log", {
                  nivel: "erro",
                  texto:
                    `Despacho NÃO-BLOQUEANTE${alvo !== null ? ` (${alvo})` : ""} — sem` +
                    " `run_in_background: false`, que é o padrão da ferramenta. Em job" +
                    " headless não há notificação de término: se o fluxo encerrar o turno" +
                    " agora, este agente é cortado no meio. Confira os artefatos no fim.",
                });
              }
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

        // O resultado de uma ferramenta volta como mensagem `user` (é assim que a API
        // fecha o par `tool_use`/`tool_result`). O runner não lia essas mensagens; passa a
        // ler SÓ para fechar a pendência do despacho — nada de custo depende daqui.
        case "user":
          for (const bloco of msg.message?.content ?? []) {
            if (bloco.type === "tool_result" && typeof bloco.tool_use_id === "string") {
              despachosPendentes.delete(bloco.tool_use_id);
            }
          }
          break;

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
          // `modelUsage` é CUMULATIVO por job, como o custo — sobrescrever é o certo.
          // QUESTÃO FECHADA em 30/07 pela gravação SSE da rodada 358c14f1, sem gastar
          // assinatura (o platô que parecia não bater tem explicação simples):
          //   · os sete últimos `result` saíram no MESMO instante (15:45:49.760–762, 2 ms de
          //     janela) — não são sete sessões terminando ao longo de 24 min, são mensagens
          //     descarregadas juntas no fim. Todas leem o acumulador quando ele JÁ está final,
          //     por isso vieram idênticas enquanto `total_cost_usd`, um escalar copiado na
          //     criação de cada mensagem, preservou a escada 0,79 → 7,42.
          //   · a soma de `costUSD` do `modelUsage` bate com o `total_cost_usd` cumulativo até
          //     a 9ª casa (7,42026945) nos quatro jobs com telemetria. Fosse por sessão, a
          //     última daria ~0,67 (7,42 − 6,75). Não há subcontagem de tokens.
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

      // ---- Teto de custo, com PARADA LIMPA -------------------------------------------
      // Roda a cada mensagem porque é o único ponto em que o gasto é observável enquanto
      // acontece (`fechar()` agrega o que já foi registrado, então vale no meio do voo).
      //
      // A decisão NUNCA corta agente em voo: enquanto houver despacho sem `tool_result`, o
      // orçamento só avisa. Cortar ali destrói o trabalho que o agente não gravou — foi o
      // desperdício de 30/07 e de 01/08, e seria perverso reproduzi-lo em nome de economia.
      if (orcamento.tetoUsd !== null) {
        const parciais = acumulador.fechar();
        const gasto = parciais !== null ? (estimarCusto(parciais.porModelo)?.usd ?? 0) : 0;
        orcamento = comAgentesEmVoo(comGasto(orcamento, gasto), despachosPendentes.size);
        const decisao = decidir(orcamento);

        // Deduplica pela AÇÃO, não pelo texto: o motivo embute o gasto corrente, que sobe a
        // cada volta — comparar a frase faria o mesmo aviso reaparecer indefinidamente e
        // afogaria o log justo quando ele mais importa.
        if (decisao.acao !== "seguir" && decisao.situacao !== avisoOrcamento) {
          avisoOrcamento = decisao.situacao;
          ctx.emitir("log", { nivel: "erro", texto: `Orçamento: ${decisao.motivo}` });
        }
        if (decisao.acao === "encerrar") {
          tetoAtingido = decisao.motivo;
          controlador.abort();
          break;
        }
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

    // Guarda da invariante de tokens — conferida UMA vez, com os valores FINAIS. No meio do
    // fluxo a comparação não vale: `modelUsage` é acumulador vivo e os `result` descarregados
    // juntos já trazem o total do job, enquanto cada `total_cost_usd` guarda o instantâneo da
    // própria mensagem. No fim os dois são finais e batem. Se um SDK futuro mandar
    // `modelUsage` POR SESSÃO, o job gravaria só o uso da última — subcontagem SILENCIOSA,
    // como a dos turnos até o T-047. Aqui isso vira uma linha na tela; não corrige nada,
    // porque corrigir no palpite foi exatamente o que criou aquele bug.
    if (tokens !== null && custoUsd !== null && custoUsd > 0.01) {
      const somaModelos = Object.values(tokens.porModelo).reduce((s, m) => s + m.custoUsd, 0);
      if (Math.abs(somaModelos - custoUsd) > custoUsd * 0.01) {
        ctx.emitir("log", {
          nivel: "erro",
          texto:
            `Contabilidade de tokens suspeita: modelUsage soma $${somaModelos.toFixed(4)}` +
            ` contra $${custoUsd.toFixed(4)} de custo do fluxo — os tokens deste job podem` +
            ` estar subcontados. Remedir antes de usar o número.`,
        });
      }
    }

    // Contabilidade final (T-049). O `modelUsage` do `result` é a fonte AUTORITATIVA e vence
    // sempre; o acumulador incremental entra só quando ele não chegou — job cortado por cota,
    // cancelamento ou watchdog, que são exatamente os caros. Antes disto esse caso gravava
    // `custoUsd: null` + `tokens: null`, e o histórico do projeto marcava US$ 0,00 para uma
    // rodada de 40 min com 21 despachos de agente.
    const acumulado = acumulador.fechar();
    const tokensParciais = tokens === null && acumulado !== null;
    if (tokensParciais) tokens = acumulado;
    // A visão POR AGENTE vem sempre do acumulador, inclusive quando os totais vieram do
    // `result`: `modelUsage` agrega por modelo e não sabe qual subagente gastou o quê.
    if (tokens !== null && tokens.porAgente === undefined) {
      const porAgente = acumulador.agentes();
      if (porAgente !== undefined) tokens.porAgente = porAgente;
    }

    // Turnos: mesma lógica. `num_turns` só existe no `result`; sem ele, voltas de API
    // distintas é a medida honesta do que aconteceu.
    if (numTurnos === null && acumulador.voltasDistintas > 0) {
      numTurnos = acumulador.voltasDistintas;
    }

    const estimativa = tokens !== null ? estimarCusto(tokens.porModelo) : null;
    const custoEstimadoUsd = estimativa?.usd ?? null;
    const modelosSemPreco = estimativa?.modelosDesconhecidos ?? [];

    // Conferência da TABELA DE PREÇOS contra o custo real, de graça, em todo job completo.
    // Sem isto `precos.ts` só seria exercitada no caminho de falha — e uma tabela que
    // envelhece sem ninguém perceber é a mesma família do `watchdogMs` que ninguém lia.
    // Tolerância larga (20%) de propósito: TTL de cache e requisições de busca web entram
    // no preço real e não no modelo simplificado — o alvo é pegar tabela ERRADA (que erra
    // por dezenas de por cento), não perseguir a última casa decimal.
    if (custoUsd !== null && custoUsd > 0.01 && custoEstimadoUsd !== null && modelosSemPreco.length === 0) {
      const desvio = Math.abs(custoEstimadoUsd - custoUsd) / custoUsd;
      if (desvio > 0.2) {
        ctx.emitir("log", {
          nivel: "erro",
          texto:
            `Tabela de preços desatualizada: estimativa $${custoEstimadoUsd.toFixed(4)} contra` +
            ` $${custoUsd.toFixed(4)} de custo real (${(desvio * 100).toFixed(0)}% de desvio).` +
            " Os jobs CORTADOS usam essa tabela — revise `jobs/claude/precos.ts`.",
        });
      }
    }
    if (modelosSemPreco.length > 0) {
      ctx.emitir("log", {
        nivel: "erro",
        texto:
          `Modelo sem preço na tabela: ${modelosSemPreco.join(", ")}. A estimativa de custo` +
          " deste job está SUBESTIMADA — acrescente o modelo em `jobs/claude/precos.ts`.",
      });
    }

    // Houve despacho de subagente mas NADA foi atribuído a ele: a ligação
    // `parent_tool_use_id` → despacho não casou. O rateio por agente sai plausível e errado
    // (tudo no orquestrador), que é pior do que não existir. Ver `atribuiuSubagente`.
    if (acumulador.despachosVistos > 0 && !acumulador.atribuiuSubagente) {
      ctx.emitir("log", {
        nivel: "erro",
        texto:
          `Rateio por agente NÃO funcionou: ${acumulador.despachosVistos} despacho(s) de` +
          " subagente e nenhum consumo atribuído a eles. O custo por agente deste job está" +
          " todo no orquestrador e é ENGANOSO — provável mudança na forma das mensagens do" +
          " SDK (`parent_tool_use_id` / `message.id`). Não use esse rateio para decidir.",
      });
    }

    // O fluxo acabou e houve despacho em segundo plano: pode ter terminado com trabalho em
    // voo. Não dá para saber daqui se o agente concluiu — mas dá para dizer que o resultado
    // NÃO é confiável sozinho, que é a informação que faltava quando isto aconteceu de verdade.
    if (despachosFundo > 0) {
      ctx.emitir("log", {
        nivel: "erro",
        texto:
          `Fluxo terminou depois de ${despachosFundo} despacho(s) não-bloqueante(s).` +
          " Confira se os artefatos ficaram completos (tarefas do plano com arquivo," +
          " commits, status) antes de dar o fluxo por bom — trabalho pode ter sido cortado.",
      });
    }

    // ESTE é o dano consumado, não o risco: despacho sem `tool_result` quando o laço
    // termina só pode significar agente cortado no meio. Vem por último de propósito — é a
    // última linha do log, que é onde se olha primeiro.
    const despachosEmVoo = despachosPendentes.size;
    if (despachosEmVoo > 0) {
      const nomes = [...new Set(despachosPendentes.values())].join(", ");
      ctx.emitir("log", {
        nivel: "erro",
        texto:
          `TRABALHO ABANDONADO: ${despachosEmVoo} agente(s) sem resultado quando a sessão` +
          ` fechou (${nomes}). Estavam trabalhando neste instante e foram cortados — o que` +
          " não tinham gravado em disco se perdeu. NÃO leia este job como entrega: confira" +
          " arquivo de tarefa, commits e árvore suja antes de qualquer outra coisa.",
      });
    }

    const texto = textoResult !== "" ? textoResult : partes.join("\n");

    /** Campos de contabilidade comuns aos três desfechos — nunca divergem por esquecimento. */
    const contabilidade = {
      custoUsd,
      numTurnos,
      tokens,
      ...(tokensParciais ? { tokensParciais: true } : {}),
      custoEstimadoUsd,
      ...(modelosSemPreco.length > 0 ? { modelosSemPreco } : {}),
      sessoes,
      despachosFundo,
      despachosEmVoo,
    };

    if (limiteBatido !== null) {
      const reabre = horaDeReabertura(limiteBatido);
      // "Nada foi entregue" era MENTIRA duas vezes seguidas.
      //
      // T-047: em job multi-sessão o fluxo concluía 21 turnos — tarefa aprovada, ciclo
      // inteiro, 4 commits — e a mensagem mandava redisparar como se nada tivesse saído.
      // Aquela correção passou a exigir um `result` como prova de trabalho.
      //
      // T-049: essa prova é FRACA demais. Um job de 40 min com 21 despachos de agente, 472
      // chamadas de ferramenta e 5 tarefas concluídas rodou em UMA sessão só, foi cortado
      // antes do `result` e caiu de novo no "nada foi entregue" — o pior conselho possível,
      // porque manda refazer o que já está commitado. O sinal certo é o TRABALHO observado
      // enquanto o fluxo rodava (ferramentas chamadas), não o carimbo do fim.
      const entregouAlgo = ferramentas > 0 || (numTurnos !== null && numTurnos > 0);
      throw new ErroFluxoClaude(
        `Limite de uso da assinatura batido${reabre !== null ? ` — retoma após ${reabre}` : ""}. ` +
          (entregouAlgo
            ? `O fluxo concluiu ${numTurnos ?? "?"} turno(s) e ${ferramentas} chamada(s) de` +
              " ferramenta antes de parar — o que foi commitado está valendo. CONFIRA o estado" +
              " das tarefas antes de redisparar, para não refazer trabalho pronto."
            : "O fluxo parou antes de chamar qualquer ferramenta; nada foi alterado." +
              " Redispare quando a cota voltar."),
        {
          sessionId,
          erro: true,
          texto,
          motivo: "limite-uso",
          reabreEm: reabre,
          ...contabilidade,
        },
      );
    }

    // Parada pelo TETO não é falha — é o sistema funcionando. Por isso RETORNA em vez de
    // lançar: o job fica `concluido` com um motivo próprio, e o que foi entregue continua
    // valendo. Tratar como erro (o caminho do `limiteBatido`) mandaria o usuário
    // "redisparar quando voltar", que é o conselho errado: aqui não há nada a esperar,
    // há um orçamento a decidir.
    if (tetoAtingido !== null) {
      ctx.emitir("log", {
        nivel: "inicio",
        texto:
          `Encerrado pelo teto de custo — parada limpa, sem agente cortado. ${tetoAtingido}` +
          " Para continuar de onde parou, redispare com um teto maior.",
      });
      return {
        sessionId,
        erro: false,
        texto,
        motivo: "teto-custo",
        ...contabilidade,
      };
    }

    if (erro) {
      throw new ErroFluxoClaude(`Fluxo Claude terminou com erro. ${texto.slice(0, 800)}`.trim(), {
        sessionId,
        erro,
        texto,
        ...contabilidade,
      });
    }
    return { sessionId, erro, texto, ...contabilidade };
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
 * Despacho de subagente que NÃO é bloqueante — o modo de falha da T-048 (ver
 * `despachosFundo`). Lido do input do próprio `tool_use`, então é fato observado, não
 * heurística sobre o texto do modelo.
 *
 * A checagem é `!== false`, não `=== true`, e a diferença custou um job inteiro
 * (`f72534e8`, 01/08): **segundo plano é o PADRÃO da ferramenta `Agent`** — quem quer
 * despacho síncrono precisa passar `run_in_background: false`. A versão anterior só
 * enxergava o flag LIGADO, então o orquestrador que simplesmente OMITE o campo produzia o
 * desastre completo (subagente cortado 10 min depois do fim do job, T-017a sem nada
 * gravado, nada commitado) com o contador marcando `despachosFundo: 0`, aba Jobs sem
 * aviso e o job verde. Detector que só pega a forma explícita da falha não pega a forma
 * comum dela.
 */
function ehDespachoEmFundo(bloco: BlocoConteudo): boolean {
  if (bloco.name === undefined || !FERRAMENTAS_DESPACHO.has(bloco.name)) return false;
  return bloco.input?.["run_in_background"] !== false;
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
  const tetoUsd = params["tetoUsd"];
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
    // Mesma disciplina: teto torto (NaN, negativo, Infinity) tem de virar SEM teto
    // explícito, nunca um teto quebrado que compararia falso e desligaria o freio em
    // silêncio. `novoOrcamento` faz a validação; aqui só barramos o que não é número.
    ...(typeof tetoUsd === "number" && Number.isFinite(tetoUsd) && tetoUsd > 0
      ? { tetoUsd }
      : {}),
  };
}
