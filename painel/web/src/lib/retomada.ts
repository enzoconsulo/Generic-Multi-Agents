import type { Job } from "./tipos";

/**
 * O BOTÃO RETOMAR: o que ele oferece, e o que ele promete (16/08).
 *
 * O pedido do usuário, na íntegra: *"agora está com a mensagem clara de limite, mas como eu
 * deveria redisparar? colo exatamente o mesmo do meu primeiro prompt na mesma ação que não
 * foi finalizada? não está claro nem entendível"*.
 *
 * A pergunta é justa e a tela não a respondia. `lib/desfecho.ts` explicava muito bem o que
 * ACONTECE ao redisparar, e nada sobre COMO — e o "como" real era voltar à página do
 * projeto, achar a ação certa e redigitar o pedido inteiro de memória. Este módulo existe
 * para que a resposta seja um botão em vez de um parágrafo.
 *
 * **Ele não inventa nada sobre o job**: o modo sai do mesmo dado que o servidor usa
 * (`tipo` + `sessionId`), e a decisão de verdade — montar o job — mora em
 * `servidor/src/jobs/retomada.ts`. Aqui só se decide o que a tela mostra, porque os testes
 * da web são de lógica pura e um `if` dentro do JSX seria lógica não verificada.
 */

/** Como a continuação vai acontecer. Espelha `ModoRetomada` do servidor. */
export type ModoRetomada = "sessao" | "disco";

export interface OfertaRetomada {
  modo: ModoRetomada;
  /** Texto do botão. Curto — o detalhe vai na `promessa`. */
  rotulo: string;
  /**
   * O que exatamente vai acontecer, em uma frase, na segunda pessoa. É esta frase que
   * responde "preciso colar o prompt de novo?" — e a resposta é sempre não.
   */
  promessa: string;
}

const ESTADOS_VIVOS = new Set(["na-fila", "executando", "aguardando-input"]);

/**
 * Resposta do `POST /api/jobs/:id/retomar`. O teto vem DE LÁ, e não é calculado aqui de
 * propósito: quem o resolve é `servidor/src/jobs/retomada.ts`, consultando a tabela de
 * guardrails atual. Recalcular na web exigiria uma segunda cópia daquela tabela, que
 * divergiria na primeira recalibragem — e uma tela que anuncia um teto diferente do que o
 * job recebeu é pior que uma tela que não anuncia teto nenhum.
 */
export interface RespostaRetomada {
  modo?: unknown;
  tetoUsd?: unknown;
}

/** Confirmação a mostrar depois do clique, com o teto REAL do job criado. */
export function confirmacaoDeRetomada(resposta: RespostaRetomada): string {
  const teto = resposta.tetoUsd;
  const comTeto =
    typeof teto === "number" && Number.isFinite(teto) && teto > 0
      ? ` Ele nasce com o orçamento zerado e teto de US$ ${teto.toFixed(2)}.`
      : " Ele nasce com o orçamento zerado e sem teto de custo.";
  return `Retomada disparada — a execução nova aparece no topo da lista.${comTeto}`;
}

/**
 * O que oferecer para este job; `null` quando não há o que oferecer.
 *
 * Job VIVO não recebe oferta: ele não precisa de retomada, precisa de paciência (ou de
 * Cancelar). Job de CI também não — não é fluxo de agente e não tem estado a continuar.
 */
export function ofertaDeRetomada(job: Job): OfertaRetomada | null {
  if (ESTADOS_VIVOS.has(job.estado)) return null;

  if (job.tipo === "claude") {
    const temSessao = typeof job.sessionId === "string" && job.sessionId !== "";
    if (temSessao) {
      return {
        modo: "sessao",
        rotulo: "Retomar de onde parou",
        promessa:
          "Continua ESTA MESMA conversa, com todo o histórico: o fluxo já sabe o que pediu e" +
          " o que já fez, e termina só o que faltou. Você não precisa colar o pedido de novo.",
      };
    }
    return {
      modo: "disco",
      rotulo: "Rodar de novo",
      promessa:
        "Este job é antigo e não guardou a sessão, então não há conversa para recarregar: o" +
        " MESMO pedido roda outra vez (você não precisa redigitá-lo). O que já ficou gravado" +
        " em disco continua valendo e o fluxo o encontra, mas parte do caminho será refeita.",
    };
  }

  if (job.tipo === "pipeline") {
    return {
      modo: "disco",
      rotulo: "Retomar a rodada",
      promessa:
        "Roda o pipeline de novo lendo as tarefas do disco — tarefa concluída fica concluída" +
        " e a que estava em andamento é retomada de onde parou. Você não precisa colar nada:" +
        " é assim que o pipeline retoma, porque ele abre várias sessões e não há uma só para" +
        " recarregar.",
    };
  }

  return null;
}

/**
 * Aviso a exibir JUNTO do botão quando a parede de cota ainda está de pé.
 *
 * Não desabilita o botão, pela mesma razão que `lib/cota.ts` não bloqueia o disparo: a hora
 * que o provedor anuncia é texto livre e a cota reabre sozinha. Barrar por palpite custaria
 * mais que os 16 segundos que se perdem tentando.
 */
export function avisoAntesDeRetomar(reabreEm: string | null): string {
  return (
    "A assinatura estava no limite na última execução" +
    (reabreEm !== null ? `, e a cota reabre: ${reabreEm}` : " e o provedor não anunciou a hora") +
    ". Retomar antes disso para em segundos sem entregar nada — nada se perde, mas também" +
    " nada anda. Espere a hora e clique de novo."
  );
}
