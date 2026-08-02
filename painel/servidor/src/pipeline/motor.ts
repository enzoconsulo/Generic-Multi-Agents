import type { TarefaResumo } from "../fabrica/tipos.js";
import type { PapelAgente } from "../contexto/montador.js";
import {
  deveBloquear,
  deveReplanejar,
  promoverProntas,
  proximosPassos,
  resolverAgente,
  type Passo,
  type Trilha,
} from "./maquina.js";
import {
  criterioDaSuite,
  executarCriterios,
  lerCriterios,
  relatorioCriterios,
  reprovouNaMecanica,
  type ResultadoCriterio,
} from "./criterios.js";
import {
  comAgentesEmVoo,
  comGasto,
  decidir,
  registrarTarefaConcluida,
  type EstadoOrcamento,
} from "./orcamento.js";

/**
 * Motor do pipeline — o laço que hoje um MODELO executa e que é, de ponta a ponta, uma
 * máquina de estados (I3 de `_sistema/CUSTO_DE_CONTEXTO.md`).
 *
 * Medido no job `7a1f9a45`: o `orquestrador` custou **US$ 1,29, 17% do job**, em 36 voltas
 * e 2,44M de cache relido, para promover tarefa, escolher agente e mover status. Além de
 * caro, é a camada que já falhou de formas que código não falha — abandonou agente em voo
 * (`f72534e8`) e apontou tarefa para especialista inexistente.
 *
 * TODAS as dependências são injetadas. Não porque "é bonito", mas porque a única forma de
 * testar este laço sem gastar a assinatura é substituir o despacho — e um laço de
 * orquestração sem teste é exatamente o que produziu os dois incidentes acima.
 *
 * O QUE ELE **NÃO** DECIDE, de propósito: replanejar, julgar marco reprovado, redigir
 * relatório, decidir se uma tarefa é trivial o bastante para pular o teste. Isso é
 * julgamento, continua no modelo, e o motor apenas SINALIZA (`replanejar`, `bloquear`).
 */

/** Um despacho a fazer: tudo que o driver precisa para chamar o agente. */
export interface PedidoDespacho {
  tarefa: TarefaResumo;
  papel: PapelAgente;
  agente: string;
  /** Modelo a forçar; null = o do fluxo. */
  modelo: string | null;
  /** Prompt do especialista a colar, quando o agente nomeado não foi injetado. */
  promptColado: string | null;
  /** Como se chegou neste agente — vai para o log, permite auditar roteamento errado. */
  motivo: string;
  /**
   * Seção `## Notas de execução` da tarefa. Só é lida para o papel `revisor`, que precisa
   * do hash do commit ali registrado — é o que permite entregar a ele o DIFF em vez do
   * projeto inteiro (I4). Vazia para os demais: ler seção que ninguém usa é o desperdício
   * que este módulo existe para evitar.
   */
  notas: string;
}

export interface ResultadoDespacho {
  /** Custo estimado deste despacho, para o orçamento aprender. */
  custoUsd: number;
  /** O agente devolveu resultado? `false` = foi cortado, e o laço PARA. */
  concluiu: boolean;
}

export interface DependenciasMotor {
  /** Estado atual das tarefas. Relido a cada volta: os agentes escrevem status no disco. */
  lerTarefas(): Promise<readonly TarefaResumo[]>;
  /** Muda o status de uma tarefa (promoção e bloqueio; o resto é o próprio agente). */
  gravarStatus(tarefa: TarefaResumo, status: string): Promise<void>;
  /** Anexa texto à seção `## Verificação` — usado pela passada mecânica. */
  anexarVerificacao(tarefa: TarefaResumo, texto: string): Promise<void>;
  /** Despacha um agente e ESPERA. Bloqueante por contrato. */
  despachar(pedido: PedidoDespacho): Promise<ResultadoDespacho>;
  /** Seção `## Critérios de aceite` de uma tarefa, crua. */
  lerCriteriosDe(tarefa: TarefaResumo): Promise<string>;
  /** Seção `## Notas de execução`, crua. Consultada só quando o passo é do revisor. */
  lerNotasDe(tarefa: TarefaResumo): Promise<string>;
  log(nivel: "info" | "erro", texto: string): void;
}

export interface ContextoMotor {
  dirProjeto: string;
  /**
   * Comando de teste do projeto, vindo da detecção de ecossistema do CI. Vira um critério
   * IMPLÍCITO da passada mecânica — ver `criterioDaSuite`. `null` desliga.
   */
  comandoTestes?: string | null;
  projeto: string;
  trilha: Trilha;
  equipe: Parameters<typeof resolverAgente>[2];
  disponiveis: ReadonlySet<string>;
  reforco: string | null;
  orcamento: EstadoOrcamento;
}

export interface RelatorioMotor {
  despachos: number;
  tarefasConcluidas: string[];
  promovidas: string[];
  /** Tarefas que esgotaram os ciclos e pedem JULGAMENTO do modelo. */
  paraReplanejar: string[];
  bloqueadas: string[];
  /** Critérios resolvidos sem modelo — a economia da I5, medida. */
  criteriosExecutados: number;
  /** Por que o laço parou. */
  encerrouPor:
    | "sem-trabalho"
    | "orcamento"
    | "agente-cortado"
    | "sem-progresso"
    | "teto-de-voltas";
  orcamento: EstadoOrcamento;
}

/** Teto de voltas do laço — rede contra bug de estado que não avança (nunca deve disparar). */
const MAX_VOLTAS = 200;

/**
 * Roda o pipeline até acabar o trabalho, o orçamento, ou algo dar errado.
 *
 * A ordem dentro de uma volta importa e não é arbitrária:
 * 1. relê as tarefas do disco (os agentes escrevem status lá — é a fonte da verdade);
 * 2. promove o que destravou;
 * 3. **passada mecânica ANTES do verificador** — é a I5: critério que falha num comando
 *    volta ao construtor sem pagar ~US$ 0,50 de despacho para confirmar o óbvio;
 * 4. consulta o orçamento ANTES de despachar, nunca depois.
 */
export async function rodarPipeline(
  ctx: ContextoMotor,
  dep: DependenciasMotor,
): Promise<RelatorioMotor> {
  const rel: RelatorioMotor = {
    despachos: 0,
    tarefasConcluidas: [],
    promovidas: [],
    paraReplanejar: [],
    bloqueadas: [],
    criteriosExecutados: 0,
    encerrouPor: "sem-trabalho",
    orcamento: ctx.orcamento,
  };
  const concluidasAntes = new Set<string>();
  /** Quantas vezes cada par (tarefa, papel) foi despachado. Ver a guarda de progresso. */
  const repeticoes = new Map<string, number>();
  let orcamento = ctx.orcamento;

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const tarefas = await dep.lerTarefas();

    // Tarefas que fecharam desde a última volta alimentam a autocalibragem do orçamento.
    for (const t of tarefas) {
      if (t.status === "concluida" && !concluidasAntes.has(t.id)) {
        concluidasAntes.add(t.id);
        if (volta > 0) rel.tarefasConcluidas.push(t.id);
      }
    }

    // Esgotou os ciclos? Não é decisão do motor o que fazer — é sinal para o modelo.
    for (const t of tarefas) {
      if (!deveBloquear(t)) continue;
      if (rel.paraReplanejar.includes(t.id) || rel.bloqueadas.includes(t.id)) continue;
      if (deveReplanejar(t)) {
        rel.paraReplanejar.push(t.id);
        dep.log("erro", `${t.id} esgotou os ciclos — replanejamento (decisão do modelo).`);
      } else {
        rel.bloqueadas.push(t.id);
        await dep.gravarStatus(t, "bloqueada");
        dep.log("erro", `${t.id} bloqueada: já era replanejamento e esgotou de novo.`);
      }
    }

    const { promover, travadas } = promoverProntas(tarefas);
    for (const id of promover) {
      const t = tarefas.find((x) => x.id === id);
      if (t === undefined) continue;
      await dep.gravarStatus(t, "pronta");
      rel.promovidas.push(id);
    }
    // Dependência INEXISTENTE nunca fecha sozinha: é erro de frontmatter, e silenciar aqui
    // deixaria a tarefa presa em backlog para sempre sem ninguém saber por quê.
    for (const t of travadas) {
      if (t.inexistentes.length > 0) {
        dep.log("erro", `${t.id} trava em dependência INEXISTENTE: ${t.inexistentes.join(", ")}.`);
      }
    }

    const emAndamento = promover.length > 0 ? await dep.lerTarefas() : tarefas;
    const passos = proximosPassos(emAndamento, ctx.trilha);
    if (passos.length === 0) {
      rel.encerrouPor = "sem-trabalho";
      break;
    }

    const passo = passos[0] as Passo;

    // Passada mecânica: acontece ANTES de gastar um despacho de verificador.
    if (passo.papel === "verificador") {
      const executados = await passadaMecanica(passo, ctx, dep);
      rel.criteriosExecutados += executados.length;
      if (executados.length > 0 && reprovouNaMecanica(executados)) {
        await dep.gravarStatus(passo.tarefa, "em-execucao");
        dep.log(
          "erro",
          `${passo.tarefa.id}: critério objetivo falhou na passada mecânica — volta ao` +
            " construtor sem gastar o verificador.",
        );
        continue;
      }
    }

    // Orçamento consultado ANTES do despacho. `nao-iniciar` encerra o laço com o que já
    // foi entregue preservado — nunca corta agente, porque aqui não há nenhum em voo.
    orcamento = comAgentesEmVoo(comGasto(orcamento, orcamento.gastoUsd), 0);
    const decisao = decidir(orcamento);
    if (decisao.acao !== "seguir") {
      dep.log("erro", `Orçamento: ${decisao.motivo}`);
      rel.encerrouPor = "orcamento";
      break;
    }

    const agente = resolverAgente(passo, ctx.trilha, ctx.equipe, {
      disponiveis: ctx.disponiveis,
      projeto: ctx.projeto,
      reforco: ctx.reforco,
    });
    dep.log("info", `${passo.tarefa.id} → ${agente.nome} (${agente.motivo})`);

    const r = await dep.despachar({
      tarefa: passo.tarefa,
      papel: passo.papel,
      agente: agente.nome,
      modelo: agente.modelo,
      promptColado: agente.promptColado,
      motivo: agente.motivo,
      notas: passo.papel === "revisor" ? await dep.lerNotasDe(passo.tarefa) : "",
    });
    rel.despachos += 1;
    orcamento = comGasto(orcamento, orcamento.gastoUsd + r.custoUsd);
    if (passo.papel === "revisor") orcamento = registrarTarefaConcluida(orcamento, r.custoUsd);

    // Agente sem resultado = foi cortado. Continuar seria empilhar trabalho em cima de
    // estado desconhecido, que é como se produz reprovação falsa.
    if (!r.concluiu) {
      dep.log("erro", `${agente.nome} não devolveu resultado — encerrando o laço.`);
      rel.encerrouPor = "agente-cortado";
      break;
    }

    // Guarda de PROGRESSO. Quem move o status de `em-execucao` para `em-teste` é o próprio
    // agente, gravando no arquivo — é o contrato dele. Se ele terminar sem gravar, o motor
    // releria o mesmo passo para sempre, pagando um despacho por volta até o orçamento
    // acabar: um bug do agente viraria uma fatura. Duas repetições do mesmo par
    // (tarefa, papel) encerram o laço com o que já foi entregue preservado.
    const chave = `${passo.tarefa.id}:${passo.papel}`;
    const vezes = (repeticoes.get(chave) ?? 0) + 1;
    repeticoes.set(chave, vezes);
    if (vezes >= 2) {
      dep.log(
        "erro",
        `${passo.tarefa.id}: ${agente.nome} terminou mas o status continua` +
          ` \`${passo.tarefa.status}\`. O agente não gravou seu estado — encerrando para` +
          " não repetir o despacho indefinidamente.",
      );
      rel.encerrouPor = "sem-progresso";
      break;
    }
  }

  if (rel.encerrouPor === "sem-trabalho" && rel.despachos >= MAX_VOLTAS) {
    rel.encerrouPor = "teto-de-voltas";
  }
  rel.orcamento = orcamento;
  return rel;
}

/** Roda os critérios com comando e anexa o relatório à tarefa. Vazio quando não há nenhum. */
async function passadaMecanica(
  passo: Passo,
  ctx: ContextoMotor,
  dep: DependenciasMotor,
): Promise<ResultadoCriterio[]> {
  const secao = await dep.lerCriteriosDe(passo.tarefa);
  const suite = criterioDaSuite(ctx.comandoTestes ?? null);
  // A suíte vai PRIMEIRO: se ela quebrou, o resto do relatório é ruído — o construtor
  // precisa ver isso na primeira linha.
  const criterios = [...(suite !== null ? [suite] : []), ...lerCriterios(secao)];
  if (!criterios.some((c) => c.comando !== null)) return [];

  const resultados = await executarCriterios(criterios, ctx.dirProjeto);
  const relatorio = relatorioCriterios(resultados);
  if (relatorio !== "") await dep.anexarVerificacao(passo.tarefa, relatorio);
  return resultados;
}
