/**
 * RETOMAR UM JOB DE ONDE ELE PAROU (16/08).
 *
 * O pedido do usuário foi literal: *"gostaria de ter um botão de retomar quando voltar o
 * limite, de onde exatamente estava, sem precisar fazer tudo de novo gastando mais
 * crédito"*. Antes disto a única saída era voltar à página do projeto e **redigitar o
 * pedido inteiro** — e o texto do pedido é justamente o que mais decide a qualidade do
 * plano, então redigitar não é só chato: é redigitar diferente.
 *
 * O caso que motivou está em disco (`dados/jobs/2f388226.json`, 16/08 21:39): um `/ideia`
 * registrou a ideia em `_sistema/ideias/`, disse "agora despacho o planejador" e bateu na
 * cota da assinatura. Zero tarefa criada. Sem retomada, o conserto era pagar de novo os 24
 * turnos e as 44 chamadas de ferramenta que já tinham rodado.
 *
 * ## Dois modos, porque são dois motores
 *
 * | job | modo | como continua |
 * |---|---|---|
 * | `claude` com `sessionId` | `sessao` | `options.resume` do SDK — a conversa inteira volta |
 * | `pipeline`, ou `claude` sem `sessionId` | `disco` | redispara igual; o estado vive nos arquivos |
 *
 * O modo `sessao` é o que responde "de onde EXATAMENTE estava": o SDK recarrega o
 * transcript de `~/.claude/projects/<cwd>/<sessionId>.jsonl`, que continua no disco mesmo
 * quando a sessão morreu no meio (`persistSession` é `true` por padrão e o painel não o
 * desliga). O modelo volta sabendo o que já fez.
 *
 * O modo `disco` NÃO é um consolo: para o pipeline em código ele é a retomada CERTA e já
 * está provada — a T-046 foi cortada às 21:09 e fechou às 00:24 sem ninguém mexer em nada,
 * porque o estado de uma tarefa vive no frontmatter dela, não na sessão. Um `/trabalhar`
 * abre 8 sessões; não existe "a" sessão para retomar, e nem faria sentido.
 *
 * ## O que este módulo NÃO faz, de propósito
 *
 * - **Não decide se vale a pena.** Se a cota ainda está batida, quem avisa é
 *   `web/lib/cota.ts` — e ele avisa sem bloquear, pela razão escrita lá.
 * - **Não soma orçamento.** O job retomado nasce com o teto cheio de novo. É honesto:
 *   é um job novo, com custo novo, e o número aparece na tela antes do disparo.
 * - **Não retoma job vivo.** Quem está executando não precisa de retomada; precisa de
 *   paciência ou de Cancelar.
 */

import type { NovoJob } from "./fila.js";
import { guardrailsParaAcao } from "./robustez/guardrails.js";
import type { Job } from "./tipos.js";

/** Como a continuação vai acontecer. Ver a tabela no cabeçalho. */
export type ModoRetomada = "sessao" | "disco";

export interface PlanoRetomada {
  modo: ModoRetomada;
  /** O job a criar. Já com escopo, params e teto resolvidos. */
  novo: NovoJob;
  /** Uma frase, para o log e para a confirmação na tela. */
  explicacao: string;
  /** Teto de custo com que o job novo nasce, em US$; `null` = sem teto. */
  tetoUsd: number | null;
}

/**
 * Qual ação da tabela de guardrails gerou este job.
 *
 * O caminho bom é `params.acao`, gravado no disparo desde 16/08. O fallback lê o título
 * (`/ideia no banco-imobiliario…` → `ideia`) e existe só para os jobs JÁ gravados em
 * `dados/`, que nasceram sem o campo — e é justamente entre eles que está o job cuja
 * retomada motivou tudo isto. Fallback silencioso é aceitável aqui porque a consequência de
 * errar é herdar o teto antigo, não fazer coisa errada.
 */
export function acaoDoJob(job: Job): string | null {
  const declarada = job.params["acao"];
  if (typeof declarada === "string" && declarada.trim() !== "") return declarada.trim();
  const doTitulo = /^\/([a-z0-9-]+)/i.exec(job.titulo.trim())?.[1];
  return doTitulo !== undefined ? doTitulo.toLowerCase() : null;
}

/**
 * Teto com que o job de retomada nasce, em ordem de autoridade:
 *
 * 1. o que o usuário pediu explicitamente;
 * 2. senão, **o MAIOR entre a tabela de guardrails atual e o teto do job original.**
 *
 * O passo 2 é o maior, e não a tabela pura, porque `guardrailsParaAcao` devolve o padrão
 * (US$ 3) para qualquer id que ela não conheça — e a classificação da ação é heurística nos
 * jobs antigos. Errar para o maior significa, no pior caso, o mesmo teto de antes; errar
 * para o menor significaria uma retomada que para ANTES de onde a execução original já
 * tinha chegado, que é a única coisa que o botão não pode fazer.
 *
 * `null` (sem teto) em qualquer um dos lados vence: era o comportamento pedido no disparo.
 */
export function tetoDaRetomada(job: Job, pedido?: number): number | null {
  if (typeof pedido === "number" && Number.isFinite(pedido) && pedido > 0) return pedido;

  const original = job.params["tetoUsd"];
  const doJob =
    typeof original === "number" && Number.isFinite(original) && original > 0 ? original : null;

  // Ação não classificada = a tabela não tem opinião. É diferente de a tabela DIZER "sem
  // teto", e confundir os dois transformaria um job não classificável num job ilimitado.
  const acao = acaoDoJob(job);
  if (acao === null) return doJob;

  const daTabela = guardrailsParaAcao(acao).maxBudgetUsd;
  if (daTabela === null || doJob === null) return null;
  return Math.max(doJob, daTabela);
}

/** Por que este job não pode ser retomado — sempre com o que fazer no lugar. */
export class ErroNaoRetomavel extends Error {}

/**
 * Estados em que retomar não faz sentido. Job vivo continua vivo; retomá-lo criaria dois
 * fluxos escrevendo nos mesmos arquivos (o lock de escopo barraria o segundo, mas deixar
 * o botão sugerir isso já é errado).
 */
const ESTADOS_VIVOS = new Set(["na-fila", "executando", "aguardando-input"]);

/**
 * Instrução que abre a sessão retomada.
 *
 * Curta de propósito: o histórico inteiro volta junto, então repetir o pedido original
 * seria pagar duas vezes pelo mesmo contexto. O que ele NÃO pode deduzir do histórico é
 * que houve um corte — do ponto de vista do modelo a conversa simplesmente continua, e sem
 * este aviso ele tende a repetir a última ação em vez de conferir se ela chegou ao disco.
 *
 * A regra de despacho síncrono é repetida aqui, e não é redundância: o preâmbulo original
 * está no histórico, mas ele é a primeira mensagem de uma conversa longa — e é exatamente
 * o fim de turno que esta regra governa.
 */
export function promptDeRetomada(motivo: string | null): string {
  return (
    "<retomada>\n" +
    "Esta sessão foi INTERROMPIDA antes de terminar" +
    (motivo !== null ? ` (motivo: ${motivo})` : "") +
    ", e você está voltando a ela com todo o histórico acima. O pedido original NÃO mudou:\n" +
    "termine o que faltava dele, e só isso.\n\n" +
    "Antes de agir, confira no DISCO o que já existe — arquivos criados, tarefas escritas,\n" +
    "commits feitos. Parte do trabalho do histórico chegou ao disco e parte pode não ter\n" +
    "chegado; refazer o que já está lá gasta crédito à toa e pode duplicar arquivo.\n\n" +
    "Não recomece do zero e não repita etapa concluída. Não peça confirmação: siga.\n\n" +
    "Vale a mesma regra dura de antes: todo despacho de subagente passa\n" +
    "`run_in_background: false` e você ESPERA o resultado na mesma resposta. Só termine o\n" +
    "turno com o pedido realmente concluído — ou dizendo o que faltou e por quê.\n" +
    "</retomada>"
  );
}

/** O `motivo`/`encerrouPor` que o job registrou, para o prompt e para a explicação. */
export function motivoDaParada(job: Job): string | null {
  const r = job.resultado;
  if (r === null || typeof r !== "object") return null;
  const obj = r as { motivo?: unknown; encerrouPor?: unknown };
  for (const v of [obj.motivo, obj.encerrouPor]) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

/**
 * Monta o job que continua `job`. Lança `ErroNaoRetomavel` quando não dá.
 *
 * `tetoUsd` sobrescreve o teto do job original — é o "redisparar com teto maior" que as
 * mensagens de desfecho já prometiam e que não tinha como ser feito pela tela.
 */
export function planejarRetomada(job: Job, tetoUsd?: number): PlanoRetomada {
  if (ESTADOS_VIVOS.has(job.estado)) {
    throw new ErroNaoRetomavel(
      `O job "${job.id}" ainda está ${job.estado}. Espere ele terminar (ou cancele) antes de retomar.`,
    );
  }

  const motivo = motivoDaParada(job);
  const teto = tetoDaRetomada(job, tetoUsd);
  /** Aplica o teto resolvido; remover o campo é a forma de dizer "sem teto". */
  const comTeto = (params: Record<string, unknown>): Record<string, unknown> => {
    if (teto === null) delete params["tetoUsd"];
    else params["tetoUsd"] = teto;
    return params;
  };

  // ---- Modo SESSÃO: job de agente único, com transcript no disco -----------------------
  if (job.tipo === "claude" && typeof job.sessionId === "string" && job.sessionId !== "") {
    const params = comTeto({ ...job.params });
    params["prompt"] = promptDeRetomada(motivo);
    params["retomarSessao"] = job.sessionId;
    return {
      modo: "sessao",
      tetoUsd: teto,
      novo: {
        tipo: job.tipo,
        titulo: `${job.titulo} · retomada`,
        escopo: job.escopo,
        usaClaude: job.usaClaude,
        params,
      },
      explicacao:
        "Continua a MESMA conversa (o histórico volta pelo `resume` do SDK): o fluxo sabe o" +
        " que já fez e termina o que faltou, sem você redigitar o pedido.",
    };
  }

  // ---- Modo DISCO: pipeline (e o claude antigo, sem sessionId) -------------------------
  if (job.tipo === "pipeline") {
    const params = comTeto({ ...job.params });
    return {
      modo: "disco",
      tetoUsd: teto,
      novo: {
        tipo: job.tipo,
        titulo: `${job.titulo} · retomada`,
        escopo: job.escopo,
        usaClaude: job.usaClaude,
        params,
      },
      explicacao:
        "Roda o pipeline de novo lendo `_gestao/tarefas/` do disco: tarefa concluída fica" +
        " concluída e a que estava em andamento é retomada de onde parou.",
    };
  }

  if (job.tipo === "claude") {
    // Sem `sessionId` não há transcript para recarregar. Repetir o prompt é o que sobra —
    // e é EXATAMENTE o que o usuário reclamou de ter de fazer à mão, então pelo menos o
    // botão faz por ele, e a explicação diz a verdade sobre o que vai acontecer.
    const params = comTeto({ ...job.params });
    return {
      modo: "disco",
      tetoUsd: teto,
      novo: {
        tipo: job.tipo,
        titulo: `${job.titulo} · retomada`,
        escopo: job.escopo,
        usaClaude: job.usaClaude,
        params,
      },
      explicacao:
        "Este job não registrou `sessionId`, então não há conversa para recarregar: o mesmo" +
        " pedido roda de novo. O que já foi gravado em disco continua valendo e o fluxo o" +
        " encontra — mas parte do raciocínio será refeita.",
    };
  }

  throw new ErroNaoRetomavel(
    `Jobs do tipo "${job.tipo}" não são retomáveis — só fluxos de agente (\`claude\`) e do pipeline.`,
  );
}

/**
 * Este job DEVERIA oferecer o botão? Separado de `planejarRetomada` porque a tela precisa
 * decidir sem montar nada, e o servidor precisa montar sem consultar a tela.
 *
 * Deliberadamente generoso: qualquer job terminado de fluxo é retomável. Restringir a
 * "só os que pararam por cota" esconderia o botão justamente nos casos que ninguém
 * previu — e retomar um job que já tinha terminado bem é inofensivo (o fluxo confere o
 * disco, não acha o que fazer e encerra barato).
 */
export function ehRetomavel(job: Pick<Job, "tipo" | "estado">): boolean {
  if (ESTADOS_VIVOS.has(job.estado)) return false;
  return job.tipo === "claude" || job.tipo === "pipeline";
}
