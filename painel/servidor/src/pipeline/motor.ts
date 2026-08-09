import type { Plano, TarefaResumo } from "../fabrica/tipos.js";
import type { PapelAgente } from "../contexto/montador.js";
import {
  AGENTE_GENERICO,
  deveBloquear,
  deveReplanejar,
  podePularVerificacao,
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
  criteriosComFerramentaQuebrada,
  mesmoComando,
  reexecucoesPorAmbiente,
  reprovouNaMecanica,
  type ResultadoCriterio,
} from "./criterios.js";
import { fasesProntasParaMarco, lerVeredicto, type VeredictoMarco } from "./marco.js";
import {
  blocoDeFoco,
  classificar,
  lerImpedimento,
  politicaDe,
  DIAGNOSTICO_DESCONHECIDO,
  type NaturezaFalha,
  type PortaoQueReprovou,
  type SecoesRevisao,
} from "./diagnostico.js";
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
  /** Nome da fase — só no papel `marco`, para o despacho dizer QUAL meta exercitar. */
  fase?: string;
  /**
   * Teto de voltas desta etapa, vindo do diagnóstico do retrabalho. Ausente = padrão do
   * papel. Retrabalho pontual não precisa das 60 voltas de uma construção do zero.
   */
  maxTurns?: number | null;
  /**
   * Bloco `<foco>` do retrabalho pontual: os achados nomeados a corrigir, com a instrução
   * explícita de NÃO recomeçar. Vazio no despacho normal — nada é acrescentado ao prompt.
   */
  foco?: string;
}

export interface ResultadoDespacho {
  /** Custo estimado deste despacho, para o orçamento aprender. */
  custoUsd: number;
  /** O agente devolveu resultado? `false` = foi cortado, e o laço PARA. */
  concluiu: boolean;
  /**
   * Texto final do agente. Só é consumido no papel `marco`, de onde sai o veredito — o
   * único ponto em que o motor precisa LER o que o modelo disse, e por isso o despacho pede
   * uma linha de contrato (`MARCO: aprovado`) em vez de interpretar prosa.
   */
  texto?: string;
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
  /** Há mudança não commitada nas `areas` da tarefa? Base do saneamento de abertura. */
  temTrabalhoParcial(tarefa: TarefaResumo): Promise<boolean>;
  /** PLANO.md parseado, ou `null` se não existe. Base da detecção de marco de fase. */
  lerPlano(): Promise<Plano | null>;
  /** Grava a linha `Marco:` de uma fase. Só é chamado com veredito definido. */
  gravarMarco(fase: string, veredicto: Exclude<VeredictoMarco, "indefinido">): Promise<void>;
  /** Commita as pendências de `_gestao/` ao fim da rodada. */
  commitarGestao(mensagem: string): Promise<void>;
  /**
   * Seções `## Conformidade` e `## Revisão`, cruas. Lidas SÓ quando quem reprovou foi o
   * revisor — é o único caso em que o texto acrescenta informação (veredito de conformidade
   * e gravidade dos achados). Nos outros o portão já decidiu a natureza, e ler seria I/O
   * sem retorno. Opcional: quem não implementa cai no diagnóstico conservador (caro).
   */
  lerRevisaoDe?(tarefa: TarefaResumo): Promise<SecoesRevisao>;
  /**
   * Commita o trabalho de UMA tarefa em nome dela (`T-XXX: ...`), devolvendo o hash.
   * `null` quando não havia nada a commitar.
   *
   * Existe para a recuperação de `sem-progresso`: quando o construtor faz o trabalho mas
   * não registra nada, é o motor que fecha o ciclo — e fecha do jeito certo, com commit
   * próprio da tarefa, para o revisor ter um DIFF para julgar. Opcional: sem ele, a
   * recuperação não acontece e o motor para como antes.
   */
  commitarTarefa?(tarefa: TarefaResumo, mensagem: string): Promise<string | null>;
  /** Anexa texto à seção `## Notas de execução` — usado para registrar o hash recuperado. */
  anexarNotas?(tarefa: TarefaResumo, texto: string): Promise<void>;
  /**
   * Hash do HEAD do repositório do projeto. Comparado ANTES e DEPOIS de uma etapa, diz se o
   * agente commitou — o sinal mais forte de "houve trabalho", e o mais comum na prática:
   * commitar está bem treinado no prompt dos construtores, mexer no frontmatter nem tanto.
   */
  hashHead?(): Promise<string | null>;
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

/**
 * CUSTO DE UMA TAREFA NESTA RODADA (T-060).
 *
 * Existe porque a fábrica não sabia responder "quanto custou a T-030?". Descobrir que foram
 * US$ 12,90 exigiu abrir cinco JSONs de job à mão, cruzar com o git e ler as Notas de cinco
 * ciclos — e o que não é medido não é otimizado. A fase inteira nasceu de o usuário estranhar
 * uma fatura; ele não deveria ter precisado estranhar.
 *
 * `concluiu` não é enfeite: é o DENOMINADOR. A armadilha já registrada em `painel/CLAUDE.md`
 * diz que **execução que não faz nada é sempre a mais barata** — uma métrica de custo que
 * ignora a entrega premiaria a rodada que não entregou nada. Custo só se lê ao lado do que
 * saiu.
 */
export interface CustoDeTarefa {
  tarefa: string;
  custoUsd: number;
  despachos: number;
  /**
   * Fatia gasta em RETRABALHO: despachos feitos quando a tarefa já tinha `tentativas >= 1`.
   * O rótulo sai do fato observado no momento do despacho, não de estimativa depois.
   */
  retrabalhoUsd: number;
  retrabalhoDespachos: number;
  /** Naturezas de reprovação observadas, na ordem — `diagnostico.ts` já as classifica. */
  naturezas: NaturezaFalha[];
  /** A tarefa chegou a `concluida` nesta rodada? Sem isto o custo não quer dizer nada. */
  concluiu: boolean;
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
  /**
   * Critérios cujo COMANDO está quebrado (T-054). Não reprovam a tarefa, mas precisam
   * aparecer: nenhum construtor os conserta, e sem alguém dizer em voz alta a tarefa queima
   * as 3 tentativas em silêncio até bloquear — foi o que custou US$ 12,90 na T-030.
   */
  criteriosQuebrados: {
    tarefa: string;
    comando: string;
    /** Pego na linha-base (T-057), antes do primeiro despacho: nada foi gasto nesta tarefa. */
    antesDeGastar?: boolean;
  }[];
  /** Quanto cada tarefa custou nesta rodada, e quanto disso foi retrabalho (T-060). */
  custoPorTarefa: CustoDeTarefa[];
  /**
   * Impedimentos DECLARADOS pelo construtor (T-058) — a tarefa está travada pela especificação,
   * não pela execução. Vão para o relatório com o motivo: é assim que o canal fica auditável, e
   * é como um construtor que o use como rota de fuga aparece.
   */
  impedimentos: { tarefa: string; motivo: string }[];
  /** Marcos de fase verificados nesta rodada. */
  marcos: { fase: string; veredicto: VeredictoMarco }[];
  /** Tarefas devolvidas para `pronta` no saneamento de abertura. */
  saneadas: string[];
  /** Etapas que falharam (agente sem resultado). A tarefa sai da rodada; as outras seguem. */
  etapasFalhas: { tarefa: string; agente: string }[];
  /** O documentador rodou? */
  documentou: boolean;
  /** Por que o laço parou. */
  encerrouPor:
    | "sem-trabalho"
    | "orcamento"
    | "agente-cortado"
    | "sem-progresso"
    | "teto-de-voltas";
  orcamento: EstadoOrcamento;
}

/**
 * Portão que devolveu cada tarefa ao construtor, NESTA rodada. É a fonte do diagnóstico de
 * retrabalho (`diagnostico.ts`), e é observado — o motor sabe porque foi ele que despachou o
 * portão e viu o status mudar.
 *
 * Só vale dentro da rodada: tarefa herdada de uma sessão anterior não tem entrada aqui e
 * cai, de propósito, no diagnóstico conservador (calibre máximo).
 */
type MapaDeRetornos = Map<string, PortaoQueReprovou>;

/** Teto de voltas do laço — rede contra bug de estado que não avança (nunca deve disparar). */
const MAX_VOLTAS = 200;

/** Lote mínimo para valer um despacho de documentador (CLAUDE.md: "após lote de 3+"). */
const MIN_TAREFAS_PARA_DOCUMENTAR = 3;

/**
 * Teto de despachos por tarefa NUMA rodada. 3 ciclos × 3 papéis = 9, mais folga.
 *
 * Existe porque o limite de 3 ciclos do protocolo depende do campo `tentativas`, e quem o
 * incrementa é o AGENTE. Se ele não incrementar — bug, prompt mal seguido, modelo distraído
 * — a tarefa entra num vaivém `em-teste` ↔ `em-execucao` que a guarda de progresso NÃO pega,
 * porque o status muda a cada volta.
 *
 * O simulador encontrou exatamente isso: 41 despachos na mesma tarefa, US$ 22,55 numa
 * rodada. Confiar no agente para respeitar o próprio teto é a família de suposição que já
 * custou caro nesta fábrica; aqui a conta é do motor, e independe de qualquer arquivo.
 */
const MAX_DESPACHOS_POR_TAREFA = 12;

/**
 * Falhas de etapa EM SEQUÊNCIA que caracterizam problema sistêmico (cota, SDK, ambiente).
 *
 * Uma falha isolada é quase sempre transitória e não deve levar a rodada junto: numa rodada
 * real o `testador` morreu com erro de processo e o laço encerrou, deixando 7 tarefas que
 * não tinham nada a ver paradas. Três seguidas, sem nenhum sucesso no meio, já é outra
 * história — aí insistir só queima despacho.
 */
const MAX_FALHAS_SEGUIDAS = 3;

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
    criteriosQuebrados: [],
    custoPorTarefa: [],
    impedimentos: [],
    marcos: [],
    saneadas: [],
    etapasFalhas: [],
    documentou: false,
    encerrouPor: "sem-trabalho",
    orcamento: ctx.orcamento,
  };
  const concluidasAntes = new Set<string>();
  /** Despachos seguidos SEM mudança de status, por tarefa. Ver a guarda de progresso. */
  const repeticoes = new Map<string, number>();
  /** Despachos TOTAIS por tarefa nesta rodada. Ver `MAX_DESPACHOS_POR_TAREFA`. */
  const despachosPorTarefa = new Map<string, number>();
  /** Tarefas que estouraram o teto e saíram de circulação nesta rodada. */
  const emCircuito = new Set<string>();
  /** Tarefas cuja linha-base de critérios já rodou nesta rodada (T-057). Uma vez por tarefa. */
  const comLinhaBase = new Set<string>();
  /** Contabilidade por tarefa (T-060), montada despacho a despacho. */
  const custosPorTarefa = new Map<string, CustoDeTarefa>();
  /**
   * Naturezas de reprovação na ORDEM em que ocorreram, por tarefa (T-058, gatilho B). Sem
   * deduplicar vizinhas — é justamente a repetição consecutiva que carrega o sinal, ao contrário
   * da lista de `custoPorTarefa`, que existe para leitura humana e colapsa repetição.
   */
  const naturezasPorTarefa = new Map<string, NaturezaFalha[]>();
  /**
   * Tarefas cujo impedimento já foi roteado ao planejador nesta rodada (T-058, gatilho A). Teto
   * de um por tarefa por rodada: a linha `Impedimento:` fica nas Notas para sempre, e sem isto um
   * construtor que trave de novo por outro motivo reabriria o mesmo replanejamento.
   */
  const impedimentosAtendidos = new Set<string>();
  /** Fases cujo marco já foi repetido uma vez por veredito ilegível. */
  const marcosRetentados = new Set<string>();
  /** Etapas que falharam EM SEQUÊNCIA. Zera a cada sucesso. Ver `MAX_FALHAS_SEGUIDAS`. */
  let falhasSeguidas = 0;
  /** Portão que devolveu cada tarefa — a base do diagnóstico de retrabalho. */
  const retornos: MapaDeRetornos = new Map();
  let orcamento = ctx.orcamento;

  // ---- SANEAMENTO DE ABERTURA ------------------------------------------------------
  // Tarefa em `em-execucao` no INÍCIO da rodada é sobra: não há agente rodando ainda. O
  // protocolo manda devolvê-la para `pronta`, EXCETO quando há trabalho parcial consistente
  // — aí o construtor continua de onde parou.
  //
  // O sinal é a ÁRVORE GIT, não as Notas. A primeira versão perguntava "as Notas estão
  // vazias?" e isso não sobrevive ao caso comum: quase toda tarefa retomada já tem Notas
  // antigas (tentativa anterior, relatório de reprovação, registro do orquestrador). Numa
  // rodada real a T-017a foi mantida em `em-execucao` por causa de uma nota escrita no dia
  // anterior sobre uma tentativa que nem existia mais. Prosa é ambígua; `git status` não é.
  {
    const iniciais = await dep.lerTarefas();
    for (const t of iniciais) {
      if (t.status !== "em-execucao") continue;
      if (await dep.temTrabalhoParcial(t)) {
        dep.log(
          "info",
          `${t.id}: em-execucao com mudanças não commitadas nas areas — mantida, o` +
            " construtor continua de onde parou.",
        );
      } else {
        await dep.gravarStatus(t, "pronta");
        rel.saneadas.push(t.id);
        dep.log("info", `${t.id}: sobra de sessão anterior, árvore limpa — devolvida a pronta.`);
      }
    }
  }

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
        // AUTOCORREÇÃO — a constituição já define isto como automático ("uma vez por
        // linhagem"): despache o planejador da trilha em modo replanejamento. Ele quebra ou
        // reescreve a abordagem, cancela a original e cria as substitutas. Parar para
        // perguntar aqui seria transformar uma regra escrita em intervenção manual.
        dep.log("info", `${t.id} esgotou os ciclos — replanejando automaticamente.`);
        const rp = await replanejar(
          t,
          `replanejamento de ${t.id} (esgotou ${t.tentativas} ciclos)`,
          { ctx, dep, rel, orcamento, emCircuito },
        );
        orcamento = rp.orcamento;
        if (!rp.concluiu) {
          rel.encerrouPor = "agente-cortado";
          break;
        }
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

    // ---- MARCO DE FASE ---------------------------------------------------------------
    // Vem ANTES de pegar a próxima tarefa: fechada a última tarefa de uma fase, a pergunta
    // "o conjunto delas faz o que a fase prometia?" precisa ser respondida antes de a fase
    // seguinte começar a empilhar em cima. Detectar e registrar é código; o veredito é do
    // modelo, e vem por uma linha de contrato.
    const pendentes = fasesProntasParaMarco(await dep.lerPlano(), emAndamento).filter(
      (f) => !rel.marcos.some((m) => m.fase === f.fase.nome),
    );
    if (pendentes.length > 0) {
      const alvo = pendentes[0]!;
      const decisaoMarco = decidir(comAgentesEmVoo(orcamento, 0));
      if (decisaoMarco.acao !== "seguir") {
        dep.log("erro", `Marco da fase "${alvo.fase.nome}" adiado — ${decisaoMarco.motivo}`);
        rel.encerrouPor = "orcamento";
        break;
      }
      dep.log("info", `Fase "${alvo.fase.nome}" completa — verificando o marco.`);
      const r = await dep.despachar({
        tarefa: emAndamento.find((t) => t.id === alvo.tarefas[0]) ?? (emAndamento[0] as TarefaResumo),
        papel: "marco",
        agente: AGENTE_GENERICO[ctx.trilha].verificador,
        modelo: null,
        promptColado: null,
        motivo: `marco da fase "${alvo.fase.nome}"`,
        notas: "",
        fase: alvo.fase.nome,
      });
      rel.despachos += 1;
      orcamento = comGasto(orcamento, orcamento.gastoUsd + r.custoUsd);

      let veredicto = r.concluiu ? lerVeredicto(r.texto ?? "") : "indefinido";

      // Veredito ilegível: UMA retentativa, e depois REPROVADO — nunca "pergunte ao
      // humano". A direção do palpite não é arbitrária: `reprovado` gera correção, que é
      // recuperável; `aprovado` esconderia a fase para sempre, porque o registro é o que
      // diz às próximas sessões que o marco já rodou.
      if (veredicto === "indefinido" && r.concluiu && !marcosRetentados.has(alvo.fase.nome)) {
        marcosRetentados.add(alvo.fase.nome);
        dep.log("info", `Marco de "${alvo.fase.nome}": veredito ilegível — repetindo uma vez.`);
        continue;
      }
      if (veredicto === "indefinido") {
        veredicto = "reprovado";
        dep.log(
          "erro",
          `Marco de "${alvo.fase.nome}": veredito continua ilegível — registrando REPROVADO` +
            " (o lado recuperável) e abrindo correção.",
        );
      }

      rel.marcos.push({ fase: alvo.fase.nome, veredicto });
      await dep.gravarMarco(alvo.fase.nome, veredicto as "aprovado" | "reprovado");
      dep.log("info", `Marco da fase "${alvo.fase.nome}": ${veredicto.toUpperCase()}.`);

      // Marco REPROVADO abre correção sozinho. A constituição distingue "causa raiz única"
      // (tarefa corretiva) de "múltiplas causas" (planejador) — distinguir isso É
      // julgamento, então vai sempre ao planejador, que é a generalização segura.
      if (veredicto === "reprovado") {
        const rc = await dep.despachar({
          tarefa:
            emAndamento.find((t) => t.id === alvo.tarefas[0]) ?? (emAndamento[0] as TarefaResumo),
          papel: "planejador",
          agente: AGENTE_GENERICO[ctx.trilha].planejador,
          modelo: null,
          promptColado: null,
          motivo: `correções do marco reprovado da fase "${alvo.fase.nome}"`,
          notas: r.texto ?? "",
          fase: alvo.fase.nome,
        });
        rel.despachos += 1;
        orcamento = comGasto(orcamento, orcamento.gastoUsd + rc.custoUsd);
      }

      if (!r.concluiu) {
        rel.encerrouPor = "agente-cortado";
        break;
      }
      continue;
    }

    const passos = proximosPassos(
      emAndamento.filter((t) => !emCircuito.has(t.id)),
      ctx.trilha,
    );
    if (passos.length === 0) {
      rel.encerrouPor = "sem-trabalho";
      break;
    }

    const passo = passos[0] as Passo;

    // ---- TETO DE DESPACHOS POR TAREFA --------------------------------------------------
    // O limite de 3 ciclos do protocolo depende de o AGENTE incrementar `tentativas`. Se
    // ele não incrementar, a tarefa entra num vaivém `em-teste` ↔ `em-execucao` que a
    // guarda de progresso não pega (o status MUDA a cada volta). Esta conta é do motor.
    const jaGastou = despachosPorTarefa.get(passo.tarefa.id) ?? 0;
    if (jaGastou >= MAX_DESPACHOS_POR_TAREFA) {
      emCircuito.add(passo.tarefa.id);
      rel.bloqueadas.push(passo.tarefa.id);
      await dep.gravarStatus(passo.tarefa, "bloqueada");
      dep.log(
        "erro",
        `${passo.tarefa.id} BLOQUEADA: ${jaGastou} despachos nesta rodada sem concluir —` +
          " está em circuito (provavelmente o campo `tentativas` não está sendo" +
          " incrementado). As outras tarefas seguem.",
      );
      continue;
    }

    // Tarefa só de documentação não tem software para rodar: o portão do meio não tem o
    // que fazer, e o revisor confere conformidade do mesmo jeito. Era a decisão que o
    // CLAUDE.md deixava como "sua"; é uma regra sobre extensões, então é código.
    if (passo.papel === "verificador" && podePularVerificacao(passo.tarefa)) {
      await dep.gravarStatus(passo.tarefa, "em-revisao");
      dep.log(
        "info",
        `${passo.tarefa.id}: só documentação (${passo.tarefa.areas.join(", ")}) — pula o` +
          " verificador e vai direto à revisão.",
      );
      continue;
    }

    // ---- LINHA-BASE DO CRITÉRIO (T-057) ----------------------------------------------
    // Roda os `verificar:` da tarefa contra a árvore INTOCADA, antes do primeiro despacho.
    // A pergunta não é "os critérios passam?" — na linha-base quase todo critério legítimo
    // falha, porque a tarefa ainda não foi feita. A pergunta é: **este comando é capaz de
    // falhar por causa DESTA tarefa?** Comando que nem executa na árvore limpa nunca vai
    // provar nada, e nenhum construtor conserta critério.
    //
    // O sinal é a CLASSE, não a falha (`classificarFalha`): `ferramenta` = critério quebrado;
    // `falha` = critério saudável, é exatamente o que a tarefa vai fazer passar; `ambiente` =
    // ruído de máquina, ignora.
    //
    // Só na PRIMEIRA execução da tarefa (`tentativas === 0`): em retrabalho a árvore já tem a
    // entrega, e "intocada" deixaria de ser verdade — a linha-base perderia o sentido.
    if (
      passo.papel === "construtor" &&
      passo.tarefa.tentativas === 0 &&
      !comLinhaBase.has(passo.tarefa.id)
    ) {
      comLinhaBase.add(passo.tarefa.id);
      const quebrados = await linhaBaseDeCriterios(passo, ctx, dep);
      if (quebrados.length > 0) {
        for (const q of quebrados) {
          rel.criteriosQuebrados.push({
            tarefa: passo.tarefa.id,
            comando: q.comando ?? "",
            antesDeGastar: true,
          });
        }
        // Fora desta rodada, e as outras tarefas seguem (mesma doutrina de `emCircuito`).
        // Sem escrever status: quando o critério for corrigido, a tarefa volta a andar
        // sozinha na rodada seguinte, sem ninguém precisar desbloqueá-la à mão.
        emCircuito.add(passo.tarefa.id);
        dep.log(
          "erro",
          `${passo.tarefa.id} NÃO despachada: ${quebrados.length} critério(s) com comando que` +
            " não executa nem na árvore intocada — é defeito do critério, e nenhum construtor" +
            " o conserta. Nada foi gasto nesta tarefa; peça a correção ao planejador.",
        );
        continue;
      }
    }

    // Passada mecânica: acontece ANTES de gastar um despacho de verificador.
    if (passo.papel === "verificador") {
      const executados = await passadaMecanica(passo, ctx, dep);
      // Conta só o que a máquina REALMENTE decidiu. Somar o array inteiro inflava o número
      // com critérios sem comando e, agora, com inconclusivos — e o relatório da rodada diz
      // "N critério(s) resolvidos por comando, sem gastar modelo". Medida que se elogia
      // sozinha é a que menos se confere.
      rel.criteriosExecutados += executados.filter(
        (r) => r.estado === "passou" || r.estado === "falhou",
      ).length;

      // Termômetro da máquina (T-055): cada reexecução é, no melhor caso, uma reprovação
      // falsa que não aconteceu. Sem registro, a instabilidade volta a ser folclore.
      const reexecucoes = reexecucoesPorAmbiente(executados);
      if (reexecucoes > 0) {
        dep.log(
          "info",
          `${passo.tarefa.id}: ${reexecucoes} comando(s) precisaram de 2ª execução por falha` +
            " de ambiente (a 1ª não valeu). Sinal de contenção nesta máquina, não da tarefa.",
        );
      }

      // Critério quebrado não reprova, mas não pode passar em silêncio: quem corrige critério
      // é o planejador, e ele só age se alguém contar.
      for (const q of criteriosComFerramentaQuebrada(executados)) {
        rel.criteriosQuebrados.push({ tarefa: passo.tarefa.id, comando: q.comando ?? "" });
        dep.log(
          "erro",
          `${passo.tarefa.id}: o comando do critério \`${q.comando}\` NÃO EXECUTA nesta` +
            " máquina — é defeito do critério, não da entrega. A tarefa segue; o critério" +
            " precisa do planejador.",
        );
      }

      if (executados.length > 0 && reprovouNaMecanica(executados)) {
        await dep.gravarStatus(passo.tarefa, "em-execucao");
        // Registra QUEM reprovou: falha mecânica é objetiva e localizada, e o próximo
        // despacho pode ser barato e estreito em vez de subir para `opus`.
        retornos.set(passo.tarefa.id, "mecanica");
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

    // DIAGNÓSTICO DO RETRABALHO. Só para o construtor, e só quando há reprovação: é o que
    // decide se esta etapa é uma construção de novo (calibre máximo) ou um conserto nomeado
    // (barato e estreito). O portão que reprovou foi OBSERVADO nesta rodada; tarefa herdada
    // de outra sessão não tem registro e cai, de propósito, no caminho caro.
    const portao = passo.papel === "construtor" ? (retornos.get(passo.tarefa.id) ?? null) : null;
    const diag =
      portao === null
        ? DIAGNOSTICO_DESCONHECIDO
        : classificar(
            portao,
            // O texto só é lido quando quem reprovou foi o revisor — nos outros casos o
            // portão já basta, e abrir o arquivo seria I/O que não muda decisão nenhuma.
            portao === "revisor" && dep.lerRevisaoDe !== undefined
              ? await dep.lerRevisaoDe(passo.tarefa)
              : null,
          );
    const politica = politicaDe(diag, passo.tarefa.tentativas, ctx.reforco !== null);

    // ---- GATILHO B: CONFORMIDADE REPROVADA DUAS VEZES (T-058) -------------------------
    // "Entregou outra coisa" já roda SEMPRE no calibre máximo, com escopo completo
    // (`politicaDe` → `completoCaro`, sem exceção). Então uma segunda reprovação idêntica não
    // diz que o agente é fraco — ele já estava no melhor calibre disponível, com o pedido
    // inteiro em mão. Diz que o TEXTO da tarefa é ambíguo, e texto de tarefa é do planejador.
    //
    // Só em `tentativas >= 2`, ou seja: substitui o ÚLTIMO despacho de construtor, que ia ser
    // gasto de qualquer jeito e que, ao falhar, dispararia replanejamento no ciclo seguinte. O
    // destino é o mesmo; o que se economiza é a passagem — um despacho de `opus` que o
    // histórico da própria tarefa diz que vai falhar.
    //
    // Memória por RODADA, e isso é uma limitação assumida: entre rodadas `tentativas` sobrevive
    // e o histórico de naturezas não. Contar `Conformidade: nao-cumpre` na seção acumulada
    // resolveria — e é exatamente o que `diagnostico.ts` alerta para não fazer, porque decidir
    // por seção acumulada foi o que envenenaria o ciclo seguinte.
    if (
      passo.papel === "construtor" &&
      passo.tarefa.tentativas >= 2 &&
      diag.natureza === "conformidade" &&
      naturezasPorTarefa.get(passo.tarefa.id)?.at(-1) === "conformidade"
    ) {
      dep.log(
        "erro",
        `${passo.tarefa.id}: reprovada por CONFORMIDADE duas vezes seguidas no calibre máximo —` +
          " o problema é o texto da tarefa, não a execução. Vai ao planejador em vez de gastar" +
          " o último construtor.",
      );
      const rp = await replanejar(
        passo.tarefa,
        `replanejamento de ${passo.tarefa.id} (conformidade reprovada 2× no calibre máximo)`,
        { ctx, dep, rel, orcamento, emCircuito },
      );
      orcamento = rp.orcamento;
      if (!rp.concluiu) {
        rel.encerrouPor = "agente-cortado";
        break;
      }
      continue;
    }
    if (passo.papel === "construtor" && diag.natureza !== "nenhuma") {
      const lista = naturezasPorTarefa.get(passo.tarefa.id) ?? [];
      lista.push(diag.natureza);
      naturezasPorTarefa.set(passo.tarefa.id, lista);
    }

    const agente = resolverAgente(passo, ctx.trilha, ctx.equipe, {
      disponiveis: ctx.disponiveis,
      projeto: ctx.projeto,
      reforco: ctx.reforco,
      ...(passo.papel === "construtor" && portao !== null ? { politica } : {}),
    });
    dep.log("info", `${passo.tarefa.id} → ${agente.nome} (${agente.motivo})`);
    if (portao !== null) {
      dep.log(
        "info",
        `${passo.tarefa.id}: retrabalho ${diag.natureza} — ${politica.motivo}` +
          `${politica.maxTurns !== null ? ` (teto ${politica.maxTurns} voltas)` : ""}` +
          `${diag.achados.length > 0 ? `; ${diag.achados.length} achado(s) em foco` : ""}`,
      );
    }

    // Capturado ANTES do despacho, como STRING: `passo.tarefa` pode ser a mesma referência
    // que `lerTarefas()` devolve, e aí comparar depois leria o valor já mudado — a guarda
    // de progresso passaria a acusar travamento em toda rodada saudável.
    const statusAntes = passo.tarefa.status;
    // Marco do repositório ANTES da etapa: se HEAD andar, o agente commitou. Só é lido para
    // o construtor — é o único papel que entrega artefato — e custa um `git rev-parse`.
    const headAntes =
      passo.papel === "construtor" && dep.hashHead !== undefined ? await dep.hashHead() : null;
    // Conta AQUI, e não ao escolher o passo: quando a passada mecânica reprova, o fluxo
    // volta ao topo SEM despachar — contar antes fazia cada ciclo consumir dois do teto,
    // e o campo passava a medir iterações do laço em vez de despachos, que é o que custa.
    despachosPorTarefa.set(passo.tarefa.id, (despachosPorTarefa.get(passo.tarefa.id) ?? 0) + 1);
    const r = await dep.despachar({
      tarefa: passo.tarefa,
      papel: passo.papel,
      agente: agente.nome,
      modelo: agente.modelo,
      promptColado: agente.promptColado,
      motivo: agente.motivo,
      notas: passo.papel === "revisor" ? await dep.lerNotasDe(passo.tarefa) : "",
      ...(politica.maxTurns !== null ? { maxTurns: politica.maxTurns } : {}),
      ...(politica.escopo === "pontual" ? { foco: blocoDeFoco(diag) } : {}),
    });
    rel.despachos += 1;
    orcamento = comGasto(orcamento, orcamento.gastoUsd + r.custoUsd);
    if (passo.papel === "revisor") orcamento = registrarTarefaConcluida(orcamento, r.custoUsd);

    // CONTABILIDADE POR TAREFA (T-060). O rótulo "retrabalho" sai de `tentativas` COMO ERA no
    // momento do despacho — fato observado, não estimativa feita depois. Contabiliza mesmo
    // quando o agente é cortado (`!r.concluiu`, tratado abaixo): agente cortado no meio já
    // gastou, e contabilidade que só existe no caminho feliz esconde justamente o job caro.
    contabilizar(custosPorTarefa, passo.tarefa.id, {
      custoUsd: r.custoUsd,
      retrabalho: passo.tarefa.tentativas >= 1,
      ...(diag.natureza !== "nenhuma" ? { natureza: diag.natureza } : {}),
    });

    // Agente sem resultado = foi cortado. A tarefa dele sai de circulação (continuar nela
    // seria empilhar trabalho sobre estado desconhecido), mas **a rodada segue nas outras**.
    //
    // A primeira versão encerrava tudo. Numa rodada real o `testador` morreu com um erro do
    // processo e levou junto 7 tarefas que não tinham nada a ver — uma falha pontual, quase
    // sempre transitória, custando a rodada inteira.
    //
    // Falha SISTÊMICA é outra coisa: cota acabada, SDK quebrado, disco cheio. Aí insistir só
    // queima despacho, e o sinal é a sequência — falhas seguidas, sem nenhum sucesso no meio.
    if (!r.concluiu) {
      falhasSeguidas += 1;
      emCircuito.add(passo.tarefa.id);
      rel.etapasFalhas.push({ tarefa: passo.tarefa.id, agente: agente.nome });
      if (falhasSeguidas >= MAX_FALHAS_SEGUIDAS) {
        dep.log(
          "erro",
          `${falhasSeguidas} etapas falharam em sequência — parece falha sistêmica (cota,` +
            " SDK, ambiente). Encerrando para não queimar despacho.",
        );
        rel.encerrouPor = "agente-cortado";
        break;
      }
      dep.log(
        "erro",
        `${agente.nome} não devolveu resultado em ${passo.tarefa.id} — tarefa fora desta` +
          " rodada; as outras seguem.",
      );
      continue;
    }
    falhasSeguidas = 0;

    // ---- GUARDA DE PROGRESSO ---------------------------------------------------------
    // Quem move o status de uma tarefa é o próprio agente, gravando no arquivo — é o
    // contrato dele. Se ele terminar SEM gravar, o motor releria o mesmo passo para sempre,
    // pagando um despacho por volta até o orçamento acabar: um bug do agente viraria uma
    // fatura.
    //
    // A medida é o STATUS, não a contagem de despachos. Contar repetições do par
    // (tarefa, papel) parecia equivalente e não é: um retrabalho legítimo despacha o
    // construtor 3 vezes na MESMA tarefa (tentativas 1, 2, 3), e a contagem cortaria a
    // rodada na segunda. O que caracteriza travamento é o status não mudar depois de o
    // agente dizer que terminou.
    const depois = (await dep.lerTarefas()).find((t) => t.id === passo.tarefa.id);

    // Portão que reprovou, OBSERVADO: o passo era de verificação/revisão e a tarefa voltou
    // para `em-execucao`. É daqui que sai o diagnóstico do próximo retrabalho — fato visto,
    // não prosa interpretada.
    if (depois?.status === "em-execucao" && statusAntes !== "em-execucao") {
      if (passo.papel === "verificador") retornos.set(passo.tarefa.id, "verificador");
      else if (passo.papel === "revisor") retornos.set(passo.tarefa.id, "revisor");
    }
    // Avançou para além do construtor: o diagnóstico daquele ciclo cumpriu seu papel e não
    // pode sobreviver para envenenar o próximo (o motivo da reprovação seguinte será outro).
    if (passo.papel === "construtor" && depois?.status !== statusAntes) {
      retornos.delete(passo.tarefa.id);
    }

    // ---- GATILHO A: IMPEDIMENTO DECLARADO (T-058) ------------------------------------
    // VEM ANTES DA GUARDA DE PROGRESSO, e a ordem é o ponto mais fácil de errar aqui.
    //
    // O construtor que faz a coisa certa — para, escreve o motivo e NÃO move o status, como o
    // contrato dele manda — é indistinguível, para a guarda, de um agente travado. Se a guarda
    // rodasse primeiro, o comportamento honesto seria classificado como travamento e a rodada
    // encerraria por `sem-progresso`: puniríamos exatamente o que queremos que aconteça.
    //
    // Não mexemos em `tentativas`. O agente já o incrementou ao começar (contrato dele), e é o
    // planejador quem o zera ao reescrever a tarefa. Se o planejador DISCORDAR do impedimento e
    // devolver a tarefa como está, a tentativa gasta continua gasta — e é esse o desincentivo
    // contra usar o canal como rota de fuga, sem precisar de punição embutida no motor.
    if (
      passo.papel === "construtor" &&
      depois?.status === statusAntes &&
      !impedimentosAtendidos.has(passo.tarefa.id)
    ) {
      const motivo = lerImpedimento(await dep.lerNotasDe(passo.tarefa));
      if (motivo !== null) {
        impedimentosAtendidos.add(passo.tarefa.id);
        // Uma vez por LINHAGEM, mesma trava da autocorreção que já existe: tarefa que já nasceu
        // de replanejamento e alega impedimento de novo vira problema seu, não outro ciclo.
        if ((passo.tarefa.replanejadaDe ?? "") !== "") {
          rel.impedimentos.push({ tarefa: passo.tarefa.id, motivo });
          rel.bloqueadas.push(passo.tarefa.id);
          emCircuito.add(passo.tarefa.id);
          await dep.gravarStatus(passo.tarefa, "bloqueada");
          dep.log(
            "erro",
            `${passo.tarefa.id} BLOQUEADA: já era replanejamento e o construtor declarou` +
              ` impedimento de novo — ${motivo}`,
          );
          continue;
        }
        rel.impedimentos.push({ tarefa: passo.tarefa.id, motivo });
        dep.log(
          "erro",
          `${passo.tarefa.id}: o construtor declarou IMPEDIMENTO — ${motivo}. Isso é defeito de` +
            " especificação, não de execução: vai ao planejador em vez de mais um construtor.",
        );
        const rp = await replanejar(
          passo.tarefa,
          `replanejamento de ${passo.tarefa.id} (impedimento declarado: ${motivo})`,
          { ctx, dep, rel, orcamento, emCircuito },
        );
        orcamento = rp.orcamento;
        if (!rp.concluiu) {
          rel.encerrouPor = "agente-cortado";
          break;
        }
        continue;
      }
    }

    if (depois !== undefined && depois.status === statusAntes) {
      const vezes = (repeticoes.get(passo.tarefa.id) ?? 0) + 1;
      repeticoes.set(passo.tarefa.id, vezes);
      // RECUPERAÇÃO ANTES DE DESISTIR. O agente pode ter feito o trabalho e falhado só no
      // registro — foi exatamente o que aconteceu com a T-025 (dois ciclos de `opus`
      // editando os arquivos certos, sem gravar `status`, sem commitar), e a rodada
      // fechou com zero tarefa concluída enquanto o trabalho estava pronto no disco.
      //
      // O sinal é a ÁRVORE GIT, o mesmo do saneamento de abertura. Quando o motor fecha o
      // ciclo em nome da tarefa, ele commita e registra o hash nas Notas, para o revisor ter
      // um DIFF de verdade para julgar.
      //
      // Isto NÃO abre um laço infinito, e a razão é bonita: o commit deixa a árvore limpa,
      // então uma segunda ocorrência não encontra trabalho parcial e cai no encerramento
      // abaixo. A recuperação é auto-limitada por construção.
      //
      // T-062: o sinal de COMMIT é consultado já na 1ª repetição, os demais só na 2ª. O
      // porquê da assimetria está no parâmetro `sinais` — commit é declaração do agente,
      // árvore suja é ambígua. Antes os dois esperavam a 2ª, e o caso comum (agente commita e
      // esquece o frontmatter) pagava um despacho de `opus` inteiro para ser descoberto.
      const recuperou = await recuperarTrabalhoNaoRegistrado(
        passo,
        depois,
        ctx,
        dep,
        headAntes,
        vezes >= 2 ? "todos" : "commit",
      );
      if (recuperou) {
        repeticoes.delete(passo.tarefa.id);
        continue;
      }
      if (vezes >= 2) {
        dep.log(
          "erro",
          `${passo.tarefa.id}: ${agente.nome} terminou e o status continua` +
            ` "${statusAntes}" pela ${vezes}ª vez. O agente não está gravando seu` +
            " estado, e não há trabalho não commitado nas areas para recuperar —" +
            " encerrando para não repetir o despacho indefinidamente.",
        );
        rel.encerrouPor = "sem-progresso";
        break;
      }
    } else {
      // Avançou: a linhagem está saudável, zera o contador dela.
      repeticoes.delete(passo.tarefa.id);
    }
  }

  if (rel.encerrouPor === "sem-trabalho" && rel.despachos >= MAX_VOLTAS) {
    rel.encerrouPor = "teto-de-voltas";
  }

  // ---- DOCUMENTADOR ------------------------------------------------------------------
  // A regra do CLAUDE.md é "após lote de tarefas concluídas (3+)". Vem no FECHO e não no
  // meio de propósito: documentar o projeto a cada tarefa pagaria um despacho para
  // reescrever o que a próxima tarefa muda de novo.
  //
  // Respeita o orçamento como qualquer outro despacho — documentação é importante e não é
  // mais importante que terminar a tarefa que já começou.
  if (rel.tarefasConcluidas.length >= MIN_TAREFAS_PARA_DOCUMENTAR) {
    const decisao = decidir(comAgentesEmVoo(comGasto(orcamento, orcamento.gastoUsd), 0));
    if (decisao.acao === "seguir") {
      const tarefas = await dep.lerTarefas();
      const alvo = tarefas.find((t) => rel.tarefasConcluidas.includes(t.id));
      if (alvo !== undefined) {
        dep.log(
          "info",
          `${rel.tarefasConcluidas.length} tarefas concluídas — atualizando a documentação.`,
        );
        const r = await dep.despachar({
          tarefa: alvo,
          papel: "documentador",
          agente: "documentador",
          modelo: null,
          promptColado: null,
          motivo: `lote de ${rel.tarefasConcluidas.length} tarefa(s) concluída(s)`,
          notas: "",
        });
        rel.despachos += 1;
        rel.documentou = r.concluiu;
        orcamento = comGasto(orcamento, orcamento.gastoUsd + r.custoUsd);
      }
    } else {
      dep.log("info", `Documentação adiada: ${decisao.motivo}`);
    }
  }

  // ---- COMMIT DA GESTÃO --------------------------------------------------------------
  // O executor commita a própria tarefa; o que sobra solto é a gestão que o MOTOR escreveu
  // (promoções, bloqueios, marcos, relatório mecânico). Deixar isso não commitado é como a
  // fábrica perdeu trabalho antes: a próxima sessão encontra árvore suja que ninguém
  // reconhece. Nunca lança — falhar o commit não pode apagar o relatório da rodada.
  try {
    await dep.commitarGestao(
      `chore: gestão ${new Date().toISOString().slice(0, 10)} — pipeline` +
        `${rel.tarefasConcluidas.length > 0 ? `: ${rel.tarefasConcluidas.join(", ")}` : ""}`,
    );
  } catch (e) {
    dep.log("erro", `Commit da gestão falhou (o trabalho está no disco): ${(e as Error).message}`);
  }

  // Contabilidade por tarefa, fechada com o DENOMINADOR (T-060): custo só quer dizer algo ao
  // lado do que foi entregue. Ordenada pela maior fatura, que é onde se olha primeiro.
  const concluidas = new Set(rel.tarefasConcluidas);
  rel.custoPorTarefa = [...custosPorTarefa.values()]
    .map((c) => ({ ...c, concluiu: concluidas.has(c.tarefa) }))
    .sort((a, b) => b.custoUsd - a.custoUsd);

  rel.orcamento = orcamento;
  return rel;
}

/**
 * O construtor terminou sem registrar nada — mas fez o trabalho? Então FECHA o ciclo por ele.
 *
 * O caso real (T-025, 08/08): o `executor-reforcado` rodou duas vezes, editou os arquivos
 * certos, escreveu Notas — e não gravou `status`, não registrou hash, não commitou. O motor
 * encerrou por `sem-progresso` e a rodada fechou com ZERO tarefa concluída, com o trabalho
 * pronto no disco. O código só não se perdeu porque o commit de gestão varria a árvore com
 * `git add -A`, o que por sua vez fazia código entrar sem passar pelo revisor. Os dois
 * defeitos se anulavam e escondiam um ao outro.
 *
 * O que esta função faz é o que o construtor deveria ter feito, e SÓ isso:
 * commitar em nome da tarefa, registrar o hash nas Notas e mover para o próximo status.
 * Nada de julgamento — se a entrega presta, quem decide são os dois portões seguintes, que
 * agora vão poder rodar em vez de a rodada morrer aqui.
 *
 * Devolve `false` quando não há o que recuperar (aí o chamador encerra como antes) ou quando
 * o driver não implementa as dependências opcionais — degrada, não quebra.
 */
async function recuperarTrabalhoNaoRegistrado(
  passo: Passo,
  atual: TarefaResumo,
  ctx: ContextoMotor,
  dep: DependenciasMotor,
  headAntes: string | null,
  /**
   * QUAIS SINAIS CONSULTAR (T-062) — e a distinção existe porque eles não têm o mesmo valor
   * probatório:
   *
   * - `commit` (sinal 1) é uma DECLARAÇÃO do agente. Pelo contrato do construtor, commitar
   *   significa "terminei"; um agente não commita trabalho pela metade de propósito. Por isso
   *   ele é consultado já na 1ª repetição: esperar a 2ª só paga um despacho de `opus` para
   *   descobrir o que o commit já dizia.
   * - `todos` acrescenta o sinal 2 (árvore suja), que é AMBÍGUO: pode ser entrega pronta sem
   *   registro (T-025) ou agente cortado no meio de uma edição. Aí a segunda chance vale o
   *   despacho, porque o trabalho pode estar de fato incompleto.
   *
   * Medido no job `fc211543`: o `executor-reforcado` da T-032 corrigiu o achado e commitou
   * `e6f4aa7` sem gravar status; o motor despachou `opus` de novo, o segundo agente escreveu
   * "não há nada a corrigir" e a rodada encerrou por `sem-progresso` com a entrega pronta no
   * repositório. ~US$ 1,5 para confirmar um commit que já estava lá.
   */
  sinais: "commit" | "todos",
): Promise<boolean> {
  // Só o construtor: verificador e revisor não produzem artefato para commitar, e "trabalho
  // não commitado" na área deles seria justamente o que eles NÃO deviam ter feito.
  if (passo.papel !== "construtor") return false;

  // SINAL 1 — O AGENTE COMMITOU. É o caso COMUM, e o que a primeira versão desta função não
  // cobria: ela só olhava trabalho NÃO commitado, e por isso recusava exatamente quando o
  // agente tinha feito tudo certo menos o frontmatter. Medido na rodada 3732d414 (08/08): o
  // `executor-reforcado` da T-026 commitou `51c9ff5` E o hash da revisão, e mesmo assim a
  // rodada morreu por `sem-progresso` — a árvore estava limpa JUSTAMENTE porque ele commitou.
  //
  // Durante uma etapa, só o agente commita (o commit de gestão é no fim da rodada), então
  // HEAD ter andado é prova direta de trabalho entregue.
  if (headAntes !== null && dep.hashHead !== undefined) {
    const headDepois = await dep.hashHead();
    if (headDepois !== null && headDepois !== headAntes) {
      await dep.gravarStatus(atual, "em-teste");
      dep.log(
        "info",
        `${atual.id}: construtor commitou \`${headDepois.slice(0, 7)}\` mas não gravou o` +
          " status — trabalho entregue, promovido a em-teste. A rodada continua.",
      );
      return true;
    }
  }

  // SINAL 2 — trabalho NÃO commitado nas `areas` (o caso da T-025). Ambíguo, então só na
  // segunda passada: ver o parâmetro `sinais`.
  if (sinais === "commit") return false;
  if (dep.commitarTarefa === undefined) return false;
  if (!(await dep.temTrabalhoParcial(atual))) return false;

  const hash = await dep.commitarTarefa(
    atual,
    `${atual.id}: trabalho recuperado pelo motor (construtor não registrou o ciclo)`,
  );
  if (hash === null) return false;

  // O hash nas Notas é o que dá ao revisor um DIFF para julgar — sem ele o revisor cai no
  // projeto inteiro, que é o gasto que a I4 existe para evitar.
  if (dep.anexarNotas !== undefined) {
    await dep.anexarNotas(
      atual,
      [
        "",
        `**Commit:** \`${hash}\``,
        "",
        "Registrado pelo MOTOR, não pelo construtor: a etapa terminou com as `areas`" +
          " modificadas e sem status, hash ou commit. O trabalho foi preservado e commitado" +
          " em nome da tarefa para seguir aos portões de verificação e revisão. Se a entrega" +
          " estiver incompleta, é lá que isso aparece — recuperar o trabalho não é aprová-lo.",
      ].join("\n"),
    );
  }

  // `em-teste` é o destino do construtor nas DUAS trilhas (o que muda é quem verifica, não
  // o status). Pular a verificação, quando cabe, é decidido pelo laço na volta seguinte.
  await dep.gravarStatus(atual, "em-teste");
  dep.log(
    "info",
    `${atual.id}: construtor não registrou o ciclo, mas HÁ trabalho nas areas — commitado` +
      ` como \`${hash.slice(0, 7)}\` e promovido a em-teste. A rodada continua.`,
  );
  return true;
}

/** Roda os critérios com comando e anexa o relatório à tarefa. Vazio quando não há nenhum. */
/**
 * Despacha o PLANEJADOR em modo replanejamento e tira a tarefa de circulação.
 *
 * Extraído porque a T-058 acrescentou duas portas de entrada para o mesmo mecanismo (impedimento
 * declarado e conformidade reprovada duas vezes) e três cópias do mesmo bloco divergiriam. As
 * Notas vão no despacho — é por elas que o planejador recebe o motivo, e é onde o construtor
 * escreve a linha `Impedimento:`.
 *
 * A tarefa sai de circulação de um jeito ou de outro: replanejada (o planejador a cancelou) ou
 * não — e aí não pode voltar ao laço e girar de novo.
 */
async function replanejar(
  t: TarefaResumo,
  motivo: string,
  ambiente: {
    ctx: ContextoMotor;
    dep: DependenciasMotor;
    rel: RelatorioMotor;
    orcamento: EstadoOrcamento;
    emCircuito: Set<string>;
  },
): Promise<{ orcamento: EstadoOrcamento; concluiu: boolean }> {
  const { ctx, dep, rel, emCircuito } = ambiente;
  rel.paraReplanejar.push(t.id);
  const rp = await dep.despachar({
    tarefa: t,
    papel: "planejador",
    agente: AGENTE_GENERICO[ctx.trilha].planejador,
    modelo: null,
    promptColado: null,
    motivo,
    notas: await dep.lerNotasDe(t),
  });
  rel.despachos += 1;
  emCircuito.add(t.id);
  return {
    orcamento: comGasto(ambiente.orcamento, ambiente.orcamento.gastoUsd + rp.custoUsd),
    concluiu: rp.concluiu,
  };
}

/**
 * Soma um despacho à contabilidade da tarefa (T-060). Cria a entrada na primeira vez.
 *
 * `natureza` só entra quando houve reprovação diagnosticada — repetir a mesma natureza a cada
 * despacho do mesmo ciclo transformaria a lista num histograma de despachos em vez de um
 * histórico de reprovações.
 */
function contabilizar(
  mapa: Map<string, CustoDeTarefa>,
  tarefa: string,
  d: { custoUsd: number; retrabalho: boolean; natureza?: NaturezaFalha },
): void {
  const atual: CustoDeTarefa = mapa.get(tarefa) ?? {
    tarefa,
    custoUsd: 0,
    despachos: 0,
    retrabalhoUsd: 0,
    retrabalhoDespachos: 0,
    naturezas: [],
    concluiu: false,
  };
  atual.custoUsd += d.custoUsd;
  atual.despachos += 1;
  if (d.retrabalho) {
    atual.retrabalhoUsd += d.custoUsd;
    atual.retrabalhoDespachos += 1;
  }
  if (d.natureza !== undefined && atual.naturezas.at(-1) !== d.natureza) {
    atual.naturezas.push(d.natureza);
  }
  mapa.set(tarefa, atual);
}

/**
 * Teto de tempo da linha-base. Curto de propósito: aqui só interessa saber se o comando
 * CONSEGUE executar, não esperar que ele conclua. Estouro cai em `ambiente` e é ignorado, então
 * um comando legitimamente longo não vira alarme falso — só não é conferido nesta passada.
 */
const TETO_LINHA_BASE_MS = 60_000;

/**
 * Roda os critérios da tarefa contra a árvore intocada e devolve só os que têm COMANDO
 * QUEBRADO. Ver o bloco que a chama para o porquê.
 *
 * Duas coisas que ela deliberadamente NÃO faz:
 * - **não roda a suíte do projeto** (nem o critério implícito, nem um `verificar:` que repita o
 *   canônico): custaria a bateria inteira por tarefa, reintroduzindo o desperdício que T-056 e
 *   T-059 cortaram, e suíte quebrada é problema do PROJETO, não do critério daquela tarefa;
 * - **não escreve na seção Verificação.** Linha-base é pré-voo, não verificação: gravar ali
 *   colocaria resultado de "antes do trabalho" no lugar onde o próximo agente lê o veredito
 *   da entrega.
 */
async function linhaBaseDeCriterios(
  passo: Passo,
  ctx: ContextoMotor,
  dep: DependenciasMotor,
): Promise<ResultadoCriterio[]> {
  const canonico = (ctx.comandoTestes ?? "").trim();
  const criterios = lerCriterios(await dep.lerCriteriosDe(passo.tarefa)).filter(
    (c) => c.comando !== null && (canonico === "" || !mesmoComando(c.comando, canonico)),
  );
  if (criterios.length === 0) return [];

  const resultados = await executarCriterios(criterios, ctx.dirProjeto, {
    timeoutMs: TETO_LINHA_BASE_MS,
  });
  return criteriosComFerramentaQuebrada(resultados);
}

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
