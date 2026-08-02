/**
 * Teto de custo por job, com PARADA LIMPA.
 *
 * POR QUE EXISTE. Dos 55 jobs já rodados pela fábrica, **10 falharam e os 10 falharam por
 * cota** — nenhum por bug. Não existia teto: todo `/trabalhar` rodava até bater na parede da
 * assinatura. Pior, o instrumento que parecia ser o freio não era: `maxTurns` limita só o
 * laço do orquestrador, enquanto `num_turns` é SOMADO entre os `result` (inclusive os dos
 * subagentes) — jobs somaram 211 e 212 voltas com o teto configurado em 120.
 *
 * O QUE TORNA A PARADA "LIMPA". Cortar um fluxo no meio de um agente destrói o trabalho
 * dele: o que não foi para o disco se perde e o job ainda aparece como sucesso (foi assim
 * em 30/07 e de novo em 01/08). Então este módulo nunca manda "pare já" enquanto houver
 * agente em voo — ele distingue três decisões:
 *
 * - `seguir` — dentro do orçamento;
 * - `nao-iniciar` — ainda cabe terminar o que está em andamento, mas **não** cabe começar
 *   outra tarefa. É o estado mais valioso, e o que faltava: metade do desperdício não foi
 *   estourar o teto, foi COMEÇAR um ciclo que não tinha como terminar;
 * - `encerrar` — nada em voo e o orçamento acabou: encerre agora, enquanto é barato.
 *
 * AUTOCALIBRAGEM. O custo de um ciclo varia por projeto e por modelo, então cravar um
 * número seria errado em toda fábrica menos numa. O orçamento aprende do próprio job: cada
 * tarefa concluída alimenta a média observada, e é ela que decide se ainda cabe começar
 * outra. Antes da primeira medição usa `CUSTO_TAREFA_PADRAO`, calibrado nos jobs reais.
 */

/**
 * Custo médio de um ciclo completo (construtor + verificador + revisor) antes de haver
 * medição própria. Vem dos jobs reais: ~US$ 2,14 por tarefa entregue no banco-imobiliario.
 * É estimativa inicial — na segunda tarefa do job já é substituída pela medição.
 */
export const CUSTO_TAREFA_PADRAO = 2.1;

/**
 * Multiplicador de segurança sobre o custo estimado da próxima tarefa.
 *
 * 1,0 seria apostar na média: metade das tarefas custa mais que ela, e a que estoura é
 * justamente a que fica pela metade. 1,25 compra a margem sem desperdiçar orçamento — com
 * teto de US$ 6 e média de US$ 2, ainda começa a terceira tarefa.
 */
export const FATOR_SEGURANCA = 1.25;

export type AcaoOrcamento = "seguir" | "nao-iniciar" | "encerrar";

/**
 * Estado nomeado, mais fino que a ação. Existe porque DUAS situações bem diferentes levam a
 * `nao-iniciar` — "ainda cabe terminar, mas não cabe começar" e "já estourou e há agente em
 * voo" — e quem lê o log precisa distinguir. Deduplicar aviso pela AÇÃO esconderia a
 * segunda; deduplicar pelo texto não funciona (ele embute o gasto, que muda a cada volta).
 * A `situacao` é a chave estável e distinta que faltava.
 */
export type SituacaoOrcamento =
  | "dentro"
  | "resta-pouco"
  | "estourado-esperando"
  | "estourado-encerrar";

export interface DecisaoOrcamento {
  acao: AcaoOrcamento;
  situacao: SituacaoOrcamento;
  /** Frase pronta para o log e para a UI. Vazia quando `seguir`. */
  motivo: string;
  gastoUsd: number;
  restanteUsd: number;
  /** Custo estimado da próxima tarefa no momento da decisão. */
  estimativaProximaUsd: number;
}

export interface EstadoOrcamento {
  /** Teto do job. `null` = sem teto (comportamento antigo; ver `semTeto`). */
  tetoUsd: number | null;
  gastoUsd: number;
  /** Custos das tarefas já concluídas NESTE job — a base da autocalibragem. */
  custosObservados: number[];
  /** Há agente trabalhando agora? Parada limpa depende disto. */
  agentesEmVoo: number;
}

/** Orçamento sem teto — o comportamento anterior, explícito em vez de implícito. */
export function semTeto(): EstadoOrcamento {
  return { tetoUsd: null, gastoUsd: 0, custosObservados: [], agentesEmVoo: 0 };
}

export function novoOrcamento(tetoUsd: number | null): EstadoOrcamento {
  const teto = typeof tetoUsd === "number" && Number.isFinite(tetoUsd) && tetoUsd > 0 ? tetoUsd : null;
  return { tetoUsd: teto, gastoUsd: 0, custosObservados: [], agentesEmVoo: 0 };
}

/**
 * Custo estimado da próxima tarefa: a média do que ESTE job já mediu, ou o padrão quando
 * ainda não há medição. Usa média e não mediana de propósito — com 1 a 5 amostras a
 * mediana ignora justamente o outlier caro, que é o que se quer respeitar.
 */
export function estimativaProximaTarefa(estado: EstadoOrcamento): number {
  const n = estado.custosObservados.length;
  if (n === 0) return CUSTO_TAREFA_PADRAO;
  return estado.custosObservados.reduce((s, c) => s + c, 0) / n;
}

/** Decide o que fazer, dado o estado atual. Puro — quem chama aplica. */
export function decidir(estado: EstadoOrcamento): DecisaoOrcamento {
  const estimativa = estimativaProximaTarefa(estado);
  if (estado.tetoUsd === null) {
    return {
      acao: "seguir",
      situacao: "dentro",
      motivo: "",
      gastoUsd: estado.gastoUsd,
      restanteUsd: Number.POSITIVE_INFINITY,
      estimativaProximaUsd: estimativa,
    };
  }

  const restante = estado.tetoUsd - estado.gastoUsd;
  const comum = {
    gastoUsd: estado.gastoUsd,
    restanteUsd: restante,
    estimativaProximaUsd: estimativa,
  };

  // Estourou o teto. Só encerra de verdade com a árvore quieta — cortar agente em voo
  // destrói o trabalho dele, que é o desperdício que este módulo existe para evitar.
  if (restante <= 0) {
    return estado.agentesEmVoo > 0
      ? {
          acao: "nao-iniciar",
          situacao: "estourado-esperando",
          motivo:
            `Teto de US$ ${estado.tetoUsd.toFixed(2)} estourado (US$ ${estado.gastoUsd.toFixed(2)}),` +
            ` mas ${estado.agentesEmVoo} agente(s) ainda trabalhando: espero terminarem para` +
            " encerrar sem destruir o que estão fazendo.",
          ...comum,
        }
      : {
          acao: "encerrar",
          situacao: "estourado-encerrar",
          motivo:
            `Teto de US$ ${estado.tetoUsd.toFixed(2)} atingido (US$ ${estado.gastoUsd.toFixed(2)}).` +
            " Nada em voo — encerrando com o trabalho concluído preservado.",
          ...comum,
        };
  }

  // Ainda há orçamento, mas não o bastante para um ciclo inteiro. Começar aqui é garantir
  // tarefa pela metade — o desperdício que não aparecia em lugar nenhum.
  const precisa = estimativa * FATOR_SEGURANCA;
  if (restante < precisa) {
    return {
      acao: "nao-iniciar",
      situacao: "resta-pouco",
      motivo:
        `Restam US$ ${restante.toFixed(2)} do teto de US$ ${estado.tetoUsd.toFixed(2)}, e uma` +
        ` tarefa custa ~US$ ${estimativa.toFixed(2)} neste job. Não começo outra: termino o` +
        " que está em andamento e encerro.",
      ...comum,
    };
  }

  return { acao: "seguir", situacao: "dentro", motivo: "", ...comum };
}

/** Registra o custo de uma tarefa concluída — alimenta a autocalibragem. */
export function registrarTarefaConcluida(
  estado: EstadoOrcamento,
  custoUsd: number,
): EstadoOrcamento {
  if (!Number.isFinite(custoUsd) || custoUsd <= 0) return estado;
  return { ...estado, custosObservados: [...estado.custosObservados, custoUsd] };
}

/** Atualiza o gasto corrente. O runner chama a cada volta, com o acumulado do job. */
export function comGasto(estado: EstadoOrcamento, gastoUsd: number): EstadoOrcamento {
  if (!Number.isFinite(gastoUsd) || gastoUsd < 0) return estado;
  return { ...estado, gastoUsd };
}

/** Atualiza quantos agentes estão em voo. */
export function comAgentesEmVoo(estado: EstadoOrcamento, n: number): EstadoOrcamento {
  return { ...estado, agentesEmVoo: Math.max(0, Math.trunc(n)) };
}
