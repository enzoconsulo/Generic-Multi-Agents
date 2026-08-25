import type { EstadoJob } from "../tipos.js";

/**
 * PILOTO AUTOMÁTICO — a DECISÃO, pura e sem I/O.
 *
 * Por que este módulo existe: a fábrica já sabia dizer POR QUE uma rodada de `/trabalhar`
 * terminou (`RelatorioMotor.encerrouPor`, e o `motivo` traduzido em `runner-pipeline.ts`),
 * e ninguém agia sobre esse sinal — o defeito recorrente descrito no CLAUDE.md da raiz:
 * **sensor sem atuador**. O piloto é o atuador. Aqui mora só a regra; `piloto.ts` faz o
 * resto (escutar a fila, persistir, criar a rodada seguinte).
 *
 * A separação não é estética. A doutrina do painel é "cabe num teste? então é código", e
 * um laço que gasta a assinatura sozinho é justamente o que não pode depender de
 * julgamento: toda parada precisa ser reproduzível numa tabela.
 *
 * Três decisões de desenho que valem registro:
 *
 * 1. **`orcamento` NÃO para o piloto.** O teto de custo por rodada é uma parada LIMPA por
 *    desenho (`pipeline/orcamento.ts`: nunca cortar agente no meio, só não começar o que
 *    não cabe) e as tarefas que ficaram foram *estacionadas*, não bloqueadas — o próximo
 *    `/trabalhar` as retoma com o orçamento inteiro. Encadear é o caminho de recuperação
 *    que o motor já esperava; quem freia o conjunto é o teto ACUMULADO do piloto.
 * 2. **Cota dorme, não para.** Só o relógio reabre. Redisparar contra a parede é barato
 *    (medido: 16s e US$ 0,00) mas inútil, então o piloto espera a hora anunciada — com um
 *    teto de sonecas, porque a hora vem em TEXTO LIVRE e pode não ser interpretável.
 * 3. **Duas rodadas seguidas sem NENHUMA tarefa concluída param tudo.** É o anteparo
 *    contra o vaivém que já mediu 41 despachos e US$ 22,55 numa rodada só. Um laço
 *    automático sem esse freio transformaria aquele incidente em conta de fim de semana.
 */

/** Por que o piloto parou. Vocabulário fechado: é o que a tela traduz e o que o teste trava. */
export type MotivoParada =
  | "desligado"
  | "sem-tarefa"
  | "sem-credito"
  | "sem-progresso"
  | "precisa-replanejar"
  | "falha"
  | "teto-gasto"
  | "teto-rodadas";

export interface LimitesPiloto {
  /** Teto de gasto ACUMULADO do piloto (US$), somando todas as rodadas. */
  tetoTotalUsd: number;
  /** Máximo de rodadas INICIADAS. Conta também as que o boot retomou. */
  maxRodadas: number;
}

export interface EstadoPiloto {
  ligado: boolean;
  /** Projeto único do rodízio (decisão de 24/08: um projeto fixo, escolhido no toggle). */
  projeto: string;
  /** Id da estratégia de modelo usada em cada rodada. */
  estrategia: string;
  /** Teto por rodada (US$); `null` = o da tabela de guardrails. */
  tetoUsdPorRodada: number | null;
  limites: LimitesPiloto;
  /** Rodadas INICIADAS desde que o piloto foi ligado. */
  rodadas: number;
  /** Gasto acumulado (US$) das rodadas já assentadas. */
  gastoUsd: number;
  /** Tarefas concluídas acumuladas. */
  tarefasConcluidas: number;
  /** Rodadas seguidas que fecharam sem concluir tarefa nenhuma. */
  rodadasSemProgresso: number;
  /** Sonecas de cota SEGUIDAS (zeradas por qualquer rodada produtiva). */
  sonecas: number;
  ligadoEm: string;
  /** Job da rodada em voo (ou da última); `null` antes da primeira. */
  ultimoJobId: string | null;
  /** Quando o piloto rearma sozinho após cota (ISO); `null` = não está dormindo. */
  rearmaEm: string | null;
  parouPor: MotivoParada | null;
  parouEm: string | null;
  /** Uma frase em PT-BR dizendo o que aconteceu — é o que a tela mostra. */
  detalheParada: string | null;
}

/** O que interessa do desfecho de uma rodada. Montado a partir do job terminal. */
export interface DesfechoRodada {
  estado: EstadoJob;
  encerrouPor: string | null;
  motivo: "limite-uso" | "teto-custo" | null;
  /** Hora de reabertura anunciada pelo provedor — TEXTO LIVRE, não ISO. */
  reabreEm: string | null;
  custoUsd: number;
  tarefasConcluidas: number;
  paraReplanejar: number;
  bloqueadas: number;
  erro: string | null;
}

export type Decisao =
  | { acao: "continuar" }
  | { acao: "dormir"; detalhe: string }
  | { acao: "parar"; motivo: MotivoParada; detalhe: string };

/** Sonecas de cota seguidas antes de desistir. Ver decisão 2 no cabeçalho. */
export const MAX_SONECAS = 6;

/** Rodadas seguidas sem tarefa concluída que o piloto tolera. Ver decisão 3. */
export const MAX_SEM_PROGRESSO = 2;

/** A rodada bateu na cota da assinatura? Aceita os dois vocabulários, como `web/lib/cota.ts`. */
function parouPorCota(d: DesfechoRodada): boolean {
  return d.motivo === "limite-uso" || d.encerrouPor === "cota";
}

/**
 * Acumula o desfecho no estado e decide o que vem depois — a ÚNICA porta de entrada, para
 * que "somar o gasto" e "decidir com o gasto somado" nunca saiam de ordem.
 *
 * `agora` é injetado (ISO) em vez de lido do relógio: sem isso a decisão deixaria de ser
 * pura e os testes voltariam a depender de tempo real.
 */
export function avancar(
  antes: EstadoPiloto,
  desfecho: DesfechoRodada,
  agora: string,
): { estado: EstadoPiloto; decisao: Decisao } {
  const produziu = desfecho.tarefasConcluidas > 0;
  const estado: EstadoPiloto = {
    ...antes,
    gastoUsd: Number((antes.gastoUsd + Math.max(0, desfecho.custoUsd)).toFixed(4)),
    tarefasConcluidas: antes.tarefasConcluidas + desfecho.tarefasConcluidas,
    rodadasSemProgresso: produziu ? 0 : antes.rodadasSemProgresso + 1,
    // A soneca é contada no ramo de cota, dentro do `decidir`; rodada produtiva zera a série.
    sonecas: produziu ? 0 : antes.sonecas,
    rearmaEm: null,
  };

  const decisao = decidir(estado, desfecho);

  if (decisao.acao === "parar") {
    estado.ligado = false;
    estado.parouPor = decisao.motivo;
    estado.parouEm = agora;
    estado.detalheParada = decisao.detalhe;
  } else if (decisao.acao === "dormir") {
    estado.sonecas = estado.sonecas + 1;
    estado.detalheParada = decisao.detalhe;
  } else {
    estado.detalheParada = null;
  }

  return { estado, decisao };
}

/**
 * A tabela de decisão. A ORDEM é a regra: o mais definitivo vem antes, e nada "continua"
 * por omissão sem ter passado por todos os freios.
 */
function decidir(e: EstadoPiloto, d: DesfechoRodada): Decisao {
  if (!e.ligado) {
    return { acao: "parar", motivo: "desligado", detalhe: "O piloto foi desligado." };
  }

  // Cancelamento é decisão explícita do usuário sobre AQUELA rodada; encadear por cima
  // dela seria desfazer o que ele acabou de mandar fazer.
  if (d.estado === "cancelado") {
    return {
      acao: "parar",
      motivo: "desligado",
      detalhe: "A rodada foi cancelada à mão — o piloto não encadeia por cima disso.",
    };
  }

  if (d.estado === "falhou" || d.estado === "interrompido") {
    const causa = d.erro !== null && d.erro !== "" ? `: ${d.erro}` : ".";
    return {
      acao: "parar",
      motivo: "falha",
      detalhe:
        `A rodada terminou em "${d.estado}"${causa}` +
        " Falha de infraestrutura não melhora repetindo.",
    };
  }

  if (parouPorCota(d)) {
    if (e.sonecas + 1 > MAX_SONECAS) {
      return {
        acao: "parar",
        motivo: "sem-credito",
        detalhe:
          `Cota batida ${MAX_SONECAS}× seguidas sem conseguir produzir.` +
          " Religue quando ela tiver reaberto de verdade.",
      };
    }
    const anuncio = d.reabreEm !== null && d.reabreEm.trim() !== "" ? d.reabreEm.trim() : null;
    const quando = anuncio !== null ? ` (o provedor anunciou ${anuncio})` : "";
    return {
      acao: "dormir",
      detalhe: `Cota da assinatura batida${quando}. O piloto rearma sozinho e retoma de onde parou.`,
    };
  }

  // Freios do piloto, com o gasto DESTA rodada já somado.
  if (e.gastoUsd >= e.limites.tetoTotalUsd) {
    return {
      acao: "parar",
      motivo: "teto-gasto",
      detalhe:
        `Teto acumulado de US$ ${e.limites.tetoTotalUsd.toFixed(2)} atingido` +
        ` (gasto: US$ ${e.gastoUsd.toFixed(2)}).`,
    };
  }
  if (e.rodadas >= e.limites.maxRodadas) {
    return {
      acao: "parar",
      motivo: "teto-rodadas",
      detalhe: `Limite de ${e.limites.maxRodadas} rodada(s) atingido.`,
    };
  }

  // Acabou o trabalho: é o desfecho FELIZ, e o único em que parar não é sintoma.
  if (d.encerrouPor === "sem-trabalho") {
    if (d.paraReplanejar > 0) {
      return {
        acao: "parar",
        motivo: "precisa-replanejar",
        detalhe:
          `${d.paraReplanejar} tarefa(s) esgotaram os ciclos e pedem replanejamento — ` +
          "isso é julgamento, e o motor não decide sozinho.",
      };
    }
    const bloqueio =
      d.bloqueadas > 0
        ? ` Restam ${d.bloqueadas} tarefa(s) bloqueada(s), que precisam de você.`
        : "";
    return {
      acao: "parar",
      motivo: "sem-tarefa",
      detalhe: `Não há mais tarefa pronta em ${e.projeto}.${bloqueio}`,
    };
  }

  // Rede contra bug de estado que não avança — nunca deveria disparar.
  if (d.encerrouPor === "teto-de-voltas") {
    return {
      acao: "parar",
      motivo: "falha",
      detalhe: "A rodada bateu no teto de voltas do motor — há estado que não avança. Olhe o log.",
    };
  }

  if (e.rodadasSemProgresso >= MAX_SEM_PROGRESSO) {
    return {
      acao: "parar",
      motivo: "sem-progresso",
      detalhe:
        `${e.rodadasSemProgresso} rodadas seguidas sem concluir tarefa nenhuma. ` +
        "Insistir só multiplica o custo do vaivém.",
    };
  }

  return { acao: "continuar" };
}

/**
 * O piloto ainda pode INICIAR mais uma rodada? Conferido de novo na hora de criar (e não
 * só no `decidir`), porque a rodada também nasce por outros caminhos — o `ligar` e a
 * retomada de boot — e limite que só vale num caminho é limite que vaza no outro.
 */
export function podeIniciarRodada(e: EstadoPiloto): Decisao {
  if (e.rodadas >= e.limites.maxRodadas) {
    return {
      acao: "parar",
      motivo: "teto-rodadas",
      detalhe: `Limite de ${e.limites.maxRodadas} rodada(s) atingido.`,
    };
  }
  if (e.gastoUsd >= e.limites.tetoTotalUsd) {
    return {
      acao: "parar",
      motivo: "teto-gasto",
      detalhe:
        `Teto acumulado de US$ ${e.limites.tetoTotalUsd.toFixed(2)} atingido` +
        ` (gasto: US$ ${e.gastoUsd.toFixed(2)}).`,
    };
  }
  return { acao: "continuar" };
}
