import { avisoDespachoEmVoo, avisoDespachoFundo, type ResultadoComDespachos } from "./avisos-job";
import { avisoLimiteDeUso, type ResultadoComMotivo } from "./limite-uso";
import { avisoTetoCusto, type ResultadoComTeto } from "./teto-custo";

/**
 * DESFECHO de um job: o que de fato aconteceu, em vez do estado cru da fila (16/08).
 *
 * O defeito que isto conserta foi relatado assim pelo usuário: *"quando o job falha por
 * limite, ele dá como concluída — mas de certa forma falhou, e também não foi concluída"*.
 * Ele está certo, e a ambiguidade é real: `concluido` é o estado da FILA (o runner devolveu
 * um resultado em vez de lançar), não um veredito sobre a entrega. Um `/trabalhar` cortado
 * pela cota no meio da terceira tarefa termina exatamente igual, na tela, a um que varreu o
 * backlog inteiro: selo verde escrito "Concluído".
 *
 * Duas coisas NÃO são a correção, e é útil dizer por quê:
 *
 * - **Marcar o job como `falhou`.** Parada por teto de custo é o sistema funcionando, e a
 *   parada por cota preserva tudo que já foi commitado. Pintar as duas de vermelho mandaria
 *   o usuário refazer trabalho pronto — o conselho errado que a T-047 já pagou uma vez.
 * - **Criar estados novos na fila.** O estado da fila governa locks, cancelamento e
 *   persistência; mexer nele para melhorar um rótulo é trocar semântica por cosmética.
 *
 * A correção é separar as duas perguntas: o job TERMINOU (estado da fila) e o job ENTREGOU
 * (desfecho). Este módulo responde a segunda, lendo o que o runner já grava em
 * `job.resultado` — nenhum dado novo foi preciso, só passou a ser lido.
 *
 * **Este é o ÚNICO módulo que a tela de Jobs consulta sobre desfecho.** Os avisos longos
 * continuam morando onde nasceram (`limite-uso`, `teto-custo`, `avisos-job`), cada um com a
 * história do incidente que o criou, e são COMPOSTOS aqui. Reescrever aquelas frases numa
 * quarta cópia teria criado o problema clássico: quatro textos sobre o mesmo fato, três
 * deles desatualizando em silêncio.
 *
 * A lógica mora aqui e não no JSX porque os testes da web são de lógica pura.
 */

/** Tom visual — decide a cor do selo. */
export type TomDesfecho = "vivo" | "ok" | "atencao" | "erro" | "neutro";

export interface Desfecho {
  /** Texto do selo. É ele que substitui o "Concluído" ambíguo. */
  rotulo: string;
  tom: TomDesfecho;
  /** Por que terminou assim, numa frase; `null` quando o rótulo já basta. */
  explicacao: string | null;
  /**
   * Avisos longos que se aplicam a este job, na ordem de leitura (o dano consumado primeiro).
   * Vêm dos módulos que os criaram — ver o cabeçalho.
   */
  detalhes: string[];
  /** O que acontece AO REDISPARAR — a pergunta que o usuário faz em seguida. */
  retomada: string | null;
  /**
   * `true` quando o desfecho diverge do estado cru da fila. A tela mostra os dois nesse caso:
   * esconder o estado da fila trocaria uma ambiguidade por outra, e é ele que explica por que
   * o job não aparece como erro em lugar nenhum.
   */
  qualificado: boolean;
}

/** Só o que este módulo lê de um job — mantém o contrato estreito e testável. */
export interface JobParaDesfecho {
  estado: string;
  erro?: string | undefined;
  resultado?: unknown;
}

/**
 * Campos de `job.resultado` consultados aqui. Todos opcionais: jobs antigos em `dados/` foram
 * gravados sem eles, e o pipeline grava um conjunto diferente do runner Claude.
 *
 * Estende os contratos dos três módulos de aviso de propósito — é isso que permite passar o
 * mesmo objeto para todos sem cast nem cópia de campo.
 */
interface ResultadoLido extends ResultadoComMotivo, ResultadoComTeto, ResultadoComDespachos {
  /** Desfecho do laço do pipeline (`sem-trabalho`, `cota`, `orcamento`…). */
  encerrouPor?: string;
  despachos?: number;
}

function lerResultado(resultado: unknown): ResultadoLido {
  return resultado !== null && typeof resultado === "object" ? (resultado as ResultadoLido) : {};
}

function inteiro(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * O QUE JÁ ESTÁ VALENDO, em fatos contáveis.
 *
 * Existe porque toda mensagem de parada precisa responder "perdi o esforço?" — e responder
 * com o número real é o que impede o usuário de refazer o que já está commitado. Prefere as
 * tarefas concluídas (pipeline, o dado forte) e cai nos turnos do runner Claude.
 */
export function entregaDoJob(resultado: unknown): string | null {
  const r = lerResultado(resultado);
  const concluidas = Array.isArray(r.tarefasConcluidas) ? r.tarefasConcluidas.length : 0;
  if (concluidas > 0) {
    const ids = (r.tarefasConcluidas as unknown[]).filter((x) => typeof x === "string").join(", ");
    return `${concluidas} tarefa(s) concluída(s) e commitada(s)${ids !== "" ? `: ${ids}` : ""}.`;
  }
  const despachos = inteiro(r.despachos);
  if (despachos !== null) {
    return `Nenhuma tarefa fechou; ${despachos} despacho(s) de agente rodaram (o trabalho commitado no meio continua valendo).`;
  }
  const turnos = inteiro(r.numTurnos);
  if (turnos !== null) return `${turnos} turno(s) concluído(s) — o que foi commitado está valendo.`;
  return null;
}

/** Como o estado cru da fila se chama em PT-BR — usado quando não há qualificação. */
const ROTULO_ESTADO: Readonly<Record<string, string>> = {
  "na-fila": "Na fila",
  executando: "Executando",
  "aguardando-input": "Aguardando você",
  concluido: "Concluído",
  falhou: "Falhou",
  cancelado: "Cancelado",
  interrompido: "Interrompido",
};

/**
 * Desfechos do PIPELINE EM CÓDIGO, por `encerrouPor`. As frases de retomada descrevem o
 * mecanismo real: cada rodada relê `_gestao/tarefas/` do disco e o saneamento de abertura
 * decide tarefa por tarefa se ela continua ou recomeça — ver `pipeline/motor.ts`.
 */
const POR_ENCERRAMENTO: Readonly<
  Record<string, { rotulo: string; tom: TomDesfecho; explicacao: string; retomada: string }>
> = {
  "sem-trabalho": {
    rotulo: "Concluído",
    tom: "ok",
    explicacao: "A rodada foi até o fim: não sobrou tarefa despachável.",
    retomada: "O que resta no backlog depende de outra tarefa ou de planejamento novo.",
  },
  orcamento: {
    rotulo: "Parou no teto de custo",
    tom: "atencao",
    explicacao:
      "Parada PLANEJADA: o orçamento do job acabou e o laço não começou nada que não coubesse." +
      " Nenhum agente foi cortado no meio.",
    retomada:
      "Redisparar com um teto maior continua daqui — tarefa concluída fica concluída e a que" +
      " estava em andamento é retomada.",
  },
  cota: {
    rotulo: "Parou no limite da assinatura",
    tom: "erro",
    explicacao:
      "A cota da assinatura acabou no meio de uma etapa. Não é defeito da fábrica e não há" +
      " o que corrigir: só o relógio reabre.",
    retomada:
      "NADA do que já foi feito se perde — o estado vive nos arquivos das tarefas, não no job." +
      " Quando a cota voltar, redispare: a rodada relê o disco, mantém o que está concluído e" +
      " retoma a tarefa em voo de onde ela parou.",
  },
  "agente-cortado": {
    rotulo: "Parou: agente sem resultado",
    tom: "atencao",
    explicacao:
      "Um agente terminou sem devolver resultado e o laço parou para não empilhar trabalho" +
      " sobre estado desconhecido.",
    retomada:
      "Ao redisparar, as demais tarefas seguem normalmente e a afetada é retomada (ou refeita," +
      " se ele não deixou nada na árvore).",
  },
  "sem-progresso": {
    rotulo: "Parou: estado não gravado",
    tom: "atencao",
    explicacao:
      "Um agente terminou sem gravar o próprio status e sem deixar trabalho na árvore. O laço" +
      " parou para não repetir o mesmo despacho indefinidamente.",
    retomada:
      "Ao redisparar, a tarefa volta a `pronta` e é refeita do início. Se repetir, é bug do" +
      " agente e não da tarefa.",
  },
  "teto-de-voltas": {
    rotulo: "Parou: teto de voltas",
    tom: "erro",
    explicacao: "O laço bateu no teto de voltas — isto é sintoma de bug no motor, não uso normal.",
    retomada: "Investigue antes de redisparar: repetir sem corrigir bate no mesmo teto.",
  },
};

/**
 * Desfecho de um job. Nunca lança e nunca inventa: sem dado no `resultado`, devolve o estado
 * cru da fila com `qualificado: false`, que é o comportamento antigo.
 */
export function desfechoDoJob(job: JobParaDesfecho): Desfecho {
  const cru = ROTULO_ESTADO[job.estado] ?? job.estado;

  // Job vivo não tem desfecho — tem estado. Qualquer veredito aqui seria adivinhação.
  if (job.estado === "na-fila" || job.estado === "executando" || job.estado === "aguardando-input") {
    return { rotulo: cru, tom: "vivo", explicacao: null, detalhes: [], retomada: null, qualificado: false };
  }

  const r = lerResultado(job.resultado);
  const reabre = texto(r.reabreEm);
  // Ordem de leitura fixa: dano consumado, risco, e depois a natureza da parada. É a mesma
  // ordem que a aba Jobs já usava e ela não é arbitrária — quando os dois primeiros aparecem,
  // são eles que decidem o que o usuário faz a seguir.
  const detalhes = [
    avisoDespachoEmVoo(r),
    avisoDespachoFundo(r),
    avisoLimiteDeUso(r),
    avisoTetoCusto(r),
  ].filter((x): x is string => x !== null);

  // Dano CONSUMADO vence qualquer desfecho bom: agente cortado no meio é a única leitura que
  // importa, mesmo num job que por todo o resto correu bem.
  const emVoo = inteiro(r.despachosEmVoo);
  if (emVoo !== null) {
    return {
      rotulo: "Concluído com trabalho abandonado",
      tom: "erro",
      explicacao:
        `${emVoo} agente(s) ainda trabalhavam quando a sessão fechou e foram cortados no meio.`,
      detalhes,
      retomada:
        "NÃO leia este job como entrega: confira o arquivo da tarefa, os commits e a árvore" +
        " suja do projeto antes de redisparar.",
      qualificado: true,
    };
  }

  // COTA vale nos DOIS caminhos: o runner Claude LANÇA (job `falhou`) e o pipeline RETORNA
  // (job `concluido`). Mesmo fato, mesma reação do usuário, mesmo selo — a divergência de
  // estado da fila é detalhe de implementação e não pode virar duas leituras na tela.
  if (r.motivo === "limite-uso") {
    const base = POR_ENCERRAMENTO["cota"]!;
    return {
      rotulo: base.rotulo,
      tom: "erro",
      explicacao:
        base.explicacao +
        (reabre !== null ? ` A cota reabre: ${reabre}.` : " O provedor não anunciou a hora."),
      detalhes,
      retomada: base.retomada,
      qualificado: true,
    };
  }

  if (r.motivo === "teto-custo") {
    const base = POR_ENCERRAMENTO["orcamento"]!;
    return {
      rotulo: base.rotulo,
      tom: "atencao",
      explicacao: base.explicacao,
      detalhes,
      retomada: base.retomada,
      qualificado: true,
    };
  }

  if (job.estado === "falhou") {
    return {
      rotulo: "Falhou",
      tom: "erro",
      explicacao: texto(job.erro) ?? "O fluxo terminou com erro.",
      detalhes,
      retomada: "Corrija a causa antes de redisparar — o estado das tarefas em disco não mudou.",
      qualificado: false,
    };
  }
  if (job.estado === "cancelado" || job.estado === "interrompido") {
    return {
      rotulo: cru,
      tom: "neutro",
      explicacao:
        job.estado === "cancelado"
          ? "Cancelado por você."
          : "O painel caiu ou foi reiniciado com este job em voo.",
      detalhes,
      retomada:
        "Redisparar retoma pelo disco: o que estava commitado continua valendo, e a tarefa em" +
        " andamento é retomada ou devolvida a `pronta`.",
      qualificado: false,
    };
  }

  const encerrouPor = texto(r.encerrouPor);
  const base = encerrouPor !== null ? POR_ENCERRAMENTO[encerrouPor] : undefined;
  if (base !== undefined) {
    const entrega = entregaDoJob(job.resultado);
    return {
      rotulo: base.rotulo,
      tom: base.tom,
      explicacao: base.explicacao + (entrega !== null ? ` ${entrega}` : ""),
      detalhes,
      retomada: base.retomada,
      qualificado: base.rotulo !== "Concluído",
    };
  }

  return { rotulo: cru, tom: "ok", explicacao: null, detalhes, retomada: null, qualificado: false };
}

/** Classe CSS do selo a partir do tom. */
export function classeDesfecho(tom: TomDesfecho): string {
  return `desfecho-${tom}`;
}
