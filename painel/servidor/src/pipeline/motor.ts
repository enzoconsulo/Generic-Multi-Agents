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
  decidirTarefa,
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
  /**
   * A etapa caiu por LIMITE DE ASSINATURA (T-064), com a hora de reabertura quando anunciada.
   * Cota é parede rígida: só o relógio abre. Todo despacho seguinte é desperdício garantido,
   * e desperdício CARO — medido no job `c080b98c`, um único despacho cortado por cota custou
   * US$ 4,11 antes de devolver nada.
   */
  limiteDeUso?: string;
  /** Chamadas de ferramenta que a etapa gastou (T-065). */
  chamadas?: number;
  /** Teto DECLARADO no prompt do papel para esta tarefa (T-065). Alvo, não alarme. */
  orcadoFerramentas?: number;
  /**
   * p90 medido de chamadas para o papel (`limiarDeDebate`). Passar daqui é o ALARME: o agente
   * se debateu. É o que alimenta a política do ciclo seguinte — ver `debatesPorTarefa`.
   */
  limiarDebate?: number;
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
  /**
   * Quantas tarefas foram commitadas desde a última alteração de documentação — o LOTE
   * CUMULATIVO do portão do documentador. Derivado do repositório, sem estado novo.
   *
   * Opcional: quem não implementa cai no contador por rodada, que é o comportamento antigo
   * (e o que mantinha o documentador desligado — ver `MIN_TAREFAS_PARA_DOCUMENTAR`).
   */
  tarefasSemDocumentacao?(): Promise<number>;
  /**
   * Arquivos alterados e NÃO commitados que estão fora das `areas` da tarefa (e fora de
   * `_gestao/`). Consultado logo depois de cada construtor — ver `extrapolou`.
   *
   * `ignorar` recebe as `areas` das outras tarefas em voo: sob paralelismo, sujeira na area
   * ALHEIA é trabalho de outro agente, e atribuí-la a esta tarefa seria pior que não olhar.
   */
  alteracoesForaDasAreas?(
    tarefa: TarefaResumo,
    ignorar: readonly string[],
  ): Promise<readonly string[]>;
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
   * A OUTRA METADE da medida acima: tarefas em que a máquina não decidiu NADA, porque nenhum
   * critério trazia `verificar:`. O portão do meio dessas tarefas é julgamento puro.
   *
   * Existe porque contar só `criteriosExecutados` é medida que se elogia sozinha — e ela
   * ficou alta e simpática enquanto a Fase 6 do banco-imobiliario rodava com **27 critérios
   * e zero `verificar:`**, tudo caindo em julgamento, com o verificador refazendo do zero o
   * ritual que o construtor acabara de fazer. O sinal existia em `relatorioCriterios`
   * (a linha `Graus de prova:`), era escrito no arquivo da tarefa e ninguém o lia.
   *
   * Não reprova nem bloqueia: é defeito de PLANEJAMENTO, e quem conserta é o replanejamento,
   * não o construtor. Só precisa aparecer no relatório da rodada.
   */
  criteriosSemComando: { tarefa: string; julgados: number }[];
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
  /**
   * Escritas de `tentativas` feitas por quem NÃO é o construtor (T-063), ignoradas nas
   * decisões da rodada. Raro por construção — se aparecer com frequência, o prompt do papel
   * em questão é que precisa de conserto, não o motor.
   */
  tentativasIgnoradas: { tarefa: string; papel: string; escrito: number; mantido: number }[];
  /**
   * Etapas que passaram do orçamento de ferramentas DECLARADO no prompt do papel (T-065).
   * Mede, não corta: idas ao modelo custam ao quadrado, e sem registro o estouro some.
   */
  estouros: { tarefa: string; agente: string; chamadas: number; orcado: number }[];
  /**
   * Construtores que deixaram alteração FORA das `areas` que a tarefa declarou (16/08).
   *
   * `areas` é o mutex do paralelismo, mas ele guardava só a ESCOLHA: `maquina.ts` recusa
   * tarefas com areas colidentes e nada conferia se o agente ficou dentro delas. Em 14/08 o
   * próprio orquestrador furou o mutex escrevendo uma linha de "Contexto extra" que mandava a
   * T-042 editar a `area` da T-043 — e a checagem de disjunção disse "ok", porque olhava o
   * frontmatter. O agravante fechava o ciclo: o commit de recuperação leva `areas` + arquivo
   * da tarefa, então trabalho fora delas não entrava no commit, não era revisado, e ficava
   * solto na árvore, onde o `temTrabalhoParcial` do próximo agente podia atribuí-lo a outra
   * tarefa.
   */
  foraDeAreas: { tarefa: string; agente: string; arquivos: string[] }[];
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
    | "teto-de-voltas"
    /** Limite da assinatura batido (T-064): só o relógio reabre, insistir é desperdício. */
    | "cota";
  /**
   * Hora de reabertura anunciada pelo provedor, quando `encerrouPor === "cota"` (16/08).
   *
   * O dado já existia — `despachante.ts` o extrai com `horaDeReabertura` e o devolve em
   * `limiteDeUso` — e morria dentro do laço, escrito só numa linha de log. A tela, que é
   * onde a pergunta "quando posso redisparar?" é feita, nunca o recebia. Mais um sensor sem
   * atuador; aqui ele sobe até o resultado do job.
   */
  limiteDeUso?: string;
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

/**
 * Lote mínimo para valer um despacho de documentador (CLAUDE.md: "após lote de 3+").
 *
 * O número está certo; a UNIDADE estava errada. O portão contava tarefas concluídas NA
 * RODADA, e "lote" no `CLAUDE.md` é CUMULATIVO. Em 41 rodadas medidas o máximo concluído
 * numa rodada foi 2 (mediana 0), então `documentou` deu `false` 41 vezes de 41: o mecanismo
 * existia, estava testado e era inalcançável pelo caminho real. Hoje o lote vem de
 * `tarefasSemDocumentacao` (commits `T-XXX:` desde o último commit de documentação), com o
 * contador da rodada de piso.
 */
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
    criteriosSemComando: [],
    criteriosQuebrados: [],
    custoPorTarefa: [],
    impedimentos: [],
    tentativasIgnoradas: [],
    estouros: [],
    foraDeAreas: [],
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
   * `tentativas` EM QUE O MOTOR CONFIA, por tarefa (T-063).
   *
   * O campo é escrito à mão por agentes e decide TRÊS coisas: o limite de 3 ciclos, o
   * escalonamento para o modelo reforçado e a autocorreção. Por protocolo quem o incrementa é
   * o CONSTRUTOR, ao assumir a tarefa; verificador e revisor só o leem, para numerar o
   * `### Ciclo N` que escrevem no texto.
   *
   * Medido no job `7cd4a453`: o `testador` da T-032 aprovou a tarefa e, na mesma gravação,
   * escreveu `tentativas: 2 → 4` — confundindo "este é o ciclo 4" com o contador. O motor leu
   * `4 > 3`, concluiu "esgotou os ciclos" e despachou o planejador, que se recusou a
   * replanejar porque não havia nada errado com a abordagem. Um despacho inteiro de
   * desperdício, e o replanejamento se repetiria a cada rodada até alguém corrigir o arquivo.
   *
   * O motor VÊ quem rodou cada etapa, então não precisa confiar no campo cegamente: aceita a
   * escrita do construtor e ignora a dos outros papéis nas DECISÕES da rodada. Ignorar na
   * decisão é diferente de reescrever o arquivo — o frontmatter continua sendo do agente, e o
   * motor só escreve nele nos dois pontos deliberados de sempre (promoção e bloqueio).
   */
  const tentativasConfiaveis = new Map<string, number>();

  /**
   * Lê as tarefas aplicando o `tentativas` confiável. Primeira vez que vê uma tarefa, adota o
   * valor do arquivo — a desconfiança começa só depois de o motor ter observado um despacho.
   */
  const lerTarefas = async (): Promise<TarefaResumo[]> => {
    const tarefas = await dep.lerTarefas();
    return tarefas.map((t) => {
      const confiavel = tentativasConfiaveis.get(t.id);
      if (confiavel === undefined) {
        tentativasConfiaveis.set(t.id, t.tentativas);
        return t;
      }
      return confiavel === t.tentativas ? t : { ...t, tentativas: confiavel };
    });
  };
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
  /**
   * Tarefas em que ALGUM agente passou do `limiarDeDebate` nesta rodada. É o atuador do
   * estouro de ferramentas: uma vez marcada, a tarefa não recebe mais despacho barato.
   *
   * Memória por RODADA, pela mesma razão assumida em `naturezasPorTarefa`: o número de
   * chamadas de uma etapa não sobrevive no arquivo da tarefa, e reconstruí-lo de prosa seria
   * o erro que `diagnostico.ts` alerta para não cometer. Entre rodadas o sinal se perde, e
   * está certo — a rodada nova começa com o orçamento e o histórico limpos.
   */
  const debatesPorTarefa = new Set<string>();
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
    const tarefas = await lerTarefas();

    // Tarefas que fecharam desde a última volta alimentam a autocalibragem do orçamento.
    //
    // A autocalibragem morava no lugar errado e media a coisa errada (achado de 10/08). Ela
    // ficava no despacho do revisor — `registrarTarefaConcluida(orcamento, r.custoUsd)` — e
    // isso errava DUAS vezes:
    //
    // 1. **Unidade errada.** `r.custoUsd` é o custo da ETAPA do revisor, não o da TAREFA. O
    //    orçamento passava a acreditar que uma tarefa custa o que custa um revisor. Medido no
    //    job `341ba362`: `custosObservados: [1.68]` enquanto a única tarefa da rodada (T-034)
    //    tinha consumido US$ 7,06 — subestimativa de 4×, sempre para baixo, sempre no sentido
    //    de começar trabalho que não cabe.
    // 2. **Momento errado.** Disparava em TODO despacho de revisor, inclusive nos que
    //    REPROVAM. Tarefa que voltou para o construtor entrava na média de "tarefas
    //    concluídas".
    //
    // Aqui os dois se resolvem: o gatilho é o status `concluida` de verdade, e o número é o
    // acumulado real da tarefa, que `custosPorTarefa` já mantém desde a T-060. A conta certa
    // já existia no arquivo — só não era ela que alimentava a decisão. É o mesmo padrão que a
    // Fase 4 registrou três vezes: o sinal certo, lido no lugar errado do laço.
    for (const t of tarefas) {
      if (t.status === "concluida" && !concluidasAntes.has(t.id)) {
        concluidasAntes.add(t.id);
        if (volta > 0) {
          rel.tarefasConcluidas.push(t.id);
          const real = custosPorTarefa.get(t.id)?.custoUsd ?? 0;
          if (real > 0) orcamento = registrarTarefaConcluida(orcamento, real);
        }
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

    const emAndamento = promover.length > 0 ? await lerTarefas() : tarefas;

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
      const decididos = executados.filter(
        (r) => r.estado === "passou" || r.estado === "falhou",
      ).length;
      rel.criteriosExecutados += decididos;

      // A outra metade da medida (ver `criteriosSemComando`). O caso que interessa é o
      // extremo: a máquina não decidiu NADA nesta tarefa. Reportar toda proporção imperfeita
      // viraria ruído — critério estético sem comando é legítimo e normal. Tarefa inteira
      // sem um único comando é planejamento com critério no degrau errado.
      const semComando = executados.filter((r) => r.estado === "nao-executado").length;
      if (decididos === 0 && semComando > 0) {
        rel.criteriosSemComando.push({ tarefa: passo.tarefa.id, julgados: semComando });
        dep.log(
          "info",
          `${passo.tarefa.id}: ${semComando} critério(s) e NENHUM \`verificar:\` — o portão do` +
            " meio desta tarefa é julgamento puro. Defeito de planejamento, não do agente:" +
            " quem conserta é o replanejamento.",
        );
      }

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

    // TETO POR TAREFA. O `decidir` acima protege o JOB; esta trava protege a RODADA de ser
    // monopolizada por uma tarefa só. Sem ela o teto de job faz seu trabalho e a rodada
    // ainda fecha zerada — foi o que aconteceu duas vezes seguidas com a T-034 (US$ 7,06 e
    // depois US$ 12,40 acumulados, nenhuma tarefa bancada), e é a queixa literal do usuário.
    //
    // Estacionar não é bloquear: o status não muda, `tentativas` não é gasta, o trabalho
    // segue commitado. A tarefa só sai desta RODADA, e o próximo `/trabalhar` a retoma com
    // o orçamento inteiro. Sai por `emCircuito` — o mesmo caminho do agente cortado — para
    // o laço não reescolher a mesma tarefa e girar até `MAX_VOLTAS`.
    //
    // SÓ NA FRONTEIRA DE CICLO, e isto é o que torna a trava segura: ela vale apenas quando
    // o próximo passo seria COMEÇAR mais um retrabalho (construtor com `tentativas >= 1`).
    // Aplicá-la em qualquer passo estacionaria tarefa no verificador ou no revisor — jogando
    // fora um ciclo já pago a um passo de fechar, que é o oposto do objetivo. É a mesma
    // doutrina do `decidir` acima, um nível abaixo: nunca cortar no meio, só não COMEÇAR o
    // que não cabe. Primeiro ciclo nunca é estacionado; quem gira é que paga.
    const iniciandoRetrabalho = passo.papel === "construtor" && passo.tarefa.tentativas >= 1;
    const gastoDaTarefa = custosPorTarefa.get(passo.tarefa.id)?.custoUsd ?? 0;
    const dt = decidirTarefa(orcamento, iniciandoRetrabalho ? gastoDaTarefa : 0);
    if (dt.estacionar) {
      dep.log("erro", `${passo.tarefa.id} estacionada: ${dt.motivo}`);
      rel.impedimentos.push({ tarefa: passo.tarefa.id, motivo: dt.motivo });
      emCircuito.add(passo.tarefa.id);
      continue;
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
    const politica = politicaDe(diag, passo.tarefa.tentativas, ctx.reforco !== null, {
      debateuAntes: debatesPorTarefa.has(passo.tarefa.id),
    });

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
    // O relatório passa a listar o ALARME (p90 medido), não o alvo declarado. Calibrado no
    // alvo, isto acusava 36-52% dos despachos — e lista que acusa metade das linhas não é
    // lida, muito menos vira decisão. Ver `limiarDeDebate` em `despachante.ts`.
    if (r.chamadas !== undefined && r.limiarDebate !== undefined && r.chamadas > r.limiarDebate) {
      rel.estouros.push({
        tarefa: passo.tarefa.id,
        agente: agente.nome,
        chamadas: r.chamadas,
        orcado: r.limiarDebate,
      });
      // O ATUADOR (item 1 do handoff de 15/08). O estouro era empilhado e lido em UM lugar
      // só — para imprimir uma linha. Aqui ele passa a agir onde a doutrina permite: ANTES de
      // começar o PRÓXIMO despacho da MESMA tarefa. Nunca corta o despacho em voo, que é
      // decisão fechada (interromper custa igual sem entregar nada, US$ 4,11 medidos).
      //
      // O que ele significa: debater-se REPETE. Um agente que gastou o decil superior de
      // chamadas e ainda assim voltou reprovado não vai resolver a mesma tarefa com o
      // caminho barato — e o caminho barato é exatamente o que `politicaDe` escolhe em
      // `mecanica` e em `defeito menor`.
      debatesPorTarefa.add(passo.tarefa.id);
    }

    // ---- EXTRAPOLAÇÃO DE `areas`, POR ETAPA (16/08) -----------------------------------
    // O sensor já existia (`alteracoesForaDe`), e denunciava a sobra no relatório FINAL —
    // quando a rodada acabou e não há mais o que fazer com a informação. Aqui ele passa a
    // ser lido no único momento em que ainda serve: logo depois do construtor, com o revisor
    // da MESMA tarefa ainda por vir.
    //
    // O atuador é escrever nas Notas, e a escolha é deliberada. Commitar os arquivos de fora
    // seria a correção "óbvia" e está proibida: sob paralelismo isso rouba trabalho de outra
    // tarefa, e é o mesmo erro do `git add -A` que fazia código entrar sem revisão. O que se
    // pode fazer com segurança é tornar o fato VISÍVEL para quem julga — o revisor recebe as
    // Notas, e assim decide sobre um fato em vez de sobre um silêncio.
    if (passo.papel === "construtor" && dep.alteracoesForaDasAreas !== undefined) {
      // Sob paralelismo, sujeira na area ALHEIA é trabalho de outro agente. Atribuí-la a esta
      // tarefa produziria acusação falsa toda vez que duas tarefas rodam na mesma rodada.
      const areasAlheias = tarefas
        .filter((t) => t.id !== passo.tarefa.id)
        .flatMap((t) => t.areas);
      let fora: readonly string[] = [];
      try {
        fora = await dep.alteracoesForaDasAreas(passo.tarefa, areasAlheias);
      } catch {
        // Diagnóstico nunca derruba a rodada.
      }
      if (fora.length > 0) {
        const lista = fora.slice(0, 10).join(", ") + (fora.length > 10 ? ` … (+${fora.length - 10})` : "");
        rel.foraDeAreas.push({ tarefa: passo.tarefa.id, agente: agente.nome, arquivos: [...fora] });
        dep.log(
          "erro",
          `${passo.tarefa.id}: ${agente.nome} alterou arquivo FORA das \`areas\` declaradas —` +
            ` ${lista}. O mutex do paralelismo guarda a escolha, não a execução: ou o despacho` +
            " pediu algo fora do escopo, ou o agente extrapolou. Registrado nas Notas para o" +
            " revisor julgar; NÃO entra no commit da tarefa.",
        );
        if (dep.anexarNotas !== undefined) {
          await dep.anexarNotas(
            passo.tarefa,
            [
              "",
              `**Fora das \`areas\` (detectado pelo motor):** ${lista}`,
              "",
              "Estes arquivos foram alterados por esta etapa e estão FORA das `areas` que a",
              "tarefa declarou. Não entram no commit da tarefa, então não aparecem no diff que",
              "o revisor julga — confira se a alteração era legítima (e a `area` é que estava",
              "incompleta) ou se é sobra que precisa ser desfeita.",
            ].join("\n"),
          );
        }
      }
    }
    orcamento = comGasto(orcamento, orcamento.gastoUsd + r.custoUsd);
    // A autocalibragem NÃO é alimentada aqui — ver o topo do laço. O revisor aprovar é o
    // último passo, não a prova de que a tarefa fechou, e o custo dele não é o da tarefa.

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
      // COTA BATIDA (T-064): parede rígida, e o provedor DIZ que bateu. Antes o motor
      // adivinhava falha sistêmica por 3 falhas em sequência — e como cada falha custa (o
      // agente trabalha e é cortado antes de devolver), adivinhar custava até três despachos
      // para descobrir o que a primeira mensagem já informava.
      if (r.limiteDeUso !== undefined) {
        emCircuito.add(passo.tarefa.id);
        rel.etapasFalhas.push({ tarefa: passo.tarefa.id, agente: agente.nome });
        rel.encerrouPor = "cota";
        rel.limiteDeUso = r.limiteDeUso;
        dep.log(
          "erro",
          `Limite da assinatura batido em ${passo.tarefa.id} (reabre: ${r.limiteDeUso}).` +
            " Encerrando a rodada agora: só o relógio abre essa porta, e cada despacho a mais" +
            " gasta sem devolver nada.",
        );
        break;
      }
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
    // ---- QUEM PODE ESCREVER `tentativas` (T-063) --------------------------------------
    // Feito sobre a leitura CRUA, antes do saneamento: o saneador mascara a violação, e o
    // ponto aqui é justamente vê-la. O construtor pode escrever (é o contrato dele); qualquer
    // outro papel que mexa no campo está fora do seu, e o valor novo é ignorado nas decisões.
    const bruta = (await dep.lerTarefas()).find((t) => t.id === passo.tarefa.id);
    if (bruta !== undefined) {
      const confiavel = tentativasConfiaveis.get(passo.tarefa.id) ?? bruta.tentativas;
      if (passo.papel === "construtor") {
        tentativasConfiaveis.set(passo.tarefa.id, bruta.tentativas);
      } else if (bruta.tentativas !== confiavel) {
        // O valor corrompido FICA no arquivo, então todo passo seguinte o vê de novo. A
        // corrupção é um evento só: denuncie na primeira observação daquele valor e siga
        // ignorando em silêncio, senão o relatório repete a mesma linha por etapa e para de
        // ser lido — que é como um aviso morre.
        const jaDenunciado = rel.tentativasIgnoradas.some(
          (x) => x.tarefa === passo.tarefa.id && x.escrito === bruta.tentativas,
        );
        if (!jaDenunciado) {
          rel.tentativasIgnoradas.push({
            tarefa: passo.tarefa.id,
            papel: passo.papel,
            escrito: bruta.tentativas,
            mantido: confiavel,
          });
        }
        if (!jaDenunciado)
          dep.log(
          "erro",
          `${passo.tarefa.id}: o ${passo.papel} escreveu \`tentativas: ${bruta.tentativas}\`` +
            ` (era ${confiavel}) — campo do construtor, e ele decide o limite de ciclos, o` +
            " escalonamento de modelo e a autocorreção. Valor IGNORADO nas decisões desta" +
            " rodada; o número do ciclo se escreve no texto, não no frontmatter.",
        );
      }
    }

    const depois = (await lerTarefas()).find((t) => t.id === passo.tarefa.id);

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
      // OS DOIS SINAIS VALEM JÁ NA 1ª REPETIÇÃO. A T-062 consultava só o commit aqui e
      // guardava a árvore suja para a 2ª, porque árvore suja seria ambígua — "entrega pronta
      // sem registro (T-025) ou agente cortado no meio de uma edição". A segunda metade dessa
      // ambiguidade NÃO É ALCANÇÁVEL neste ponto do fluxo: agente cortado devolve
      // `r.concluiu === false` e sai de circulação ~150 linhas acima, e o gate de impedimento
      // — o outro caso legítimo de "terminou sem mexer no status" — também já rodou. Quem
      // chega aqui terminou normalmente e declarou resultado; árvore suja é entrega.
      //
      // O que a assimetria custava: a T-035 (job `0345125c`) levou três construtores seguidos
      // (23:11:03, 23:16:38, 23:19:39) com o trabalho no disco desde o primeiro — US$ 2,13
      // por trabalho pronto. Continua auto-limitado: o commit limpa a árvore, então a 2ª
      // ocorrência não acha trabalho parcial e cai em `sem-progresso`.
      const recuperou = await recuperarTrabalhoNaoRegistrado(
        passo,
        depois,
        ctx,
        dep,
        headAntes,
        "todos",
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
  //
  // O LOTE É CUMULATIVO (commits de tarefa desde o último commit de documentação), não o
  // que esta rodada concluiu — foi a unidade errada que manteve o mecanismo desligado em
  // 41 de 41 rodadas. O contador da rodada fica de piso: se o git não responder, o
  // comportamento antigo continua valendo em vez de sumir.
  //
  // Exige pelo menos UMA tarefa concluída agora, de propósito: sem isso, uma rodada que
  // acaba em `sem-trabalho` com lote pendente despacharia o documentador toda vez que
  // rodasse, e "execução que não faz nada é sempre a mais barata" — pagaria-se um despacho
  // por rodada para não mudar nada.
  const loteCumulativo = Math.max(
    rel.tarefasConcluidas.length,
    (await dep.tarefasSemDocumentacao?.()) ?? 0,
  );
  if (rel.tarefasConcluidas.length > 0 && loteCumulativo >= MIN_TAREFAS_PARA_DOCUMENTAR) {
    const decisao = decidir(comAgentesEmVoo(comGasto(orcamento, orcamento.gastoUsd), 0));
    if (decisao.acao === "seguir") {
      const tarefas = await lerTarefas();
      const alvo =
        tarefas.find((t) => rel.tarefasConcluidas.includes(t.id)) ?? tarefas[0];
      if (alvo !== undefined) {
        dep.log(
          "info",
          `${loteCumulativo} tarefa(s) sem documentação — atualizando a documentação.`,
        );
        const r = await dep.despachar({
          tarefa: alvo,
          papel: "documentador",
          agente: "documentador",
          modelo: null,
          promptColado: null,
          motivo: `lote de ${loteCumulativo} tarefa(s) sem documentação`,
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
   * - `todos` acrescenta o sinal 2 (árvore suja). Ele foi tratado como AMBÍGUO (entrega pronta
   *   sem registro, ou agente cortado no meio de uma edição) e por isso ficava para a 2ª
   *   repetição — mas a segunda leitura não acontece no caminho que chama daqui: agente
   *   cortado devolve `concluiu: false` e sai de circulação antes. Hoje o motor pede `todos`
   *   já na 1ª; `commit` continua existindo para quem chamar com sinal parcial de propósito.
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
  if (!criterios.some((c) => c.comando !== null)) {
    // Nada a executar: não gasta processo e não escreve bloco de "Passada mecânica" que só
    // diria "não rodei nada". Mas DEVOLVE os critérios em vez de uma lista vazia — este é o
    // caso mais interessante da fábrica, não o menos: tarefa em que a máquina não decide
    // nada é planejamento com critério no degrau errado, e quem chama precisa poder ver
    // isso (`RelatorioMotor.criteriosSemComando`). Devolver `[]` aqui apagava exatamente o
    // sinal que valia a pena — a Fase 6 do banco-imobiliario rodou 27 critérios sem um
    // único `verificar:` sem que uma linha de relatório dissesse isso.
    return criterios.map((c) => ({ texto: c.texto, estado: "nao-executado" as const, comando: null }));
  }

  const resultados = await executarCriterios(criterios, ctx.dirProjeto);
  const relatorio = relatorioCriterios(resultados);
  if (relatorio !== "") await dep.anexarVerificacao(passo.tarefa, relatorio);
  return resultados;
}
