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
  reprovouNaMecanica,
  type ResultadoCriterio,
} from "./criterios.js";
import { fasesProntasParaMarco, lerVeredicto, type VeredictoMarco } from "./marco.js";
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
  /** Fases cujo marco já foi repetido uma vez por veredito ilegível. */
  const marcosRetentados = new Set<string>();
  /** Etapas que falharam EM SEQUÊNCIA. Zera a cada sucesso. Ver `MAX_FALHAS_SEGUIDAS`. */
  let falhasSeguidas = 0;
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
        rel.paraReplanejar.push(t.id);
        dep.log("info", `${t.id} esgotou os ciclos — replanejando automaticamente.`);
        const rp = await dep.despachar({
          tarefa: t,
          papel: "planejador",
          agente: AGENTE_GENERICO[ctx.trilha].planejador,
          modelo: null,
          promptColado: null,
          motivo: `replanejamento de ${t.id} (esgotou ${t.tentativas} ciclos)`,
          notas: await dep.lerNotasDe(t),
        });
        rel.despachos += 1;
        orcamento = comGasto(orcamento, orcamento.gastoUsd + rp.custoUsd);
        // Sai de circulação de um jeito ou de outro: replanejada (o planejador a cancelou)
        // ou não — e aí não pode voltar ao laço e girar de novo.
        emCircuito.add(t.id);
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

    // Capturado ANTES do despacho, como STRING: `passo.tarefa` pode ser a mesma referência
    // que `lerTarefas()` devolve, e aí comparar depois leria o valor já mudado — a guarda
    // de progresso passaria a acusar travamento em toda rodada saudável.
    const statusAntes = passo.tarefa.status;
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
    });
    rel.despachos += 1;
    orcamento = comGasto(orcamento, orcamento.gastoUsd + r.custoUsd);
    if (passo.papel === "revisor") orcamento = registrarTarefaConcluida(orcamento, r.custoUsd);

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
    if (depois !== undefined && depois.status === statusAntes) {
      const vezes = (repeticoes.get(passo.tarefa.id) ?? 0) + 1;
      repeticoes.set(passo.tarefa.id, vezes);
      if (vezes >= 2) {
        dep.log(
          "erro",
          `${passo.tarefa.id}: ${agente.nome} terminou e o status continua` +
            ` "${statusAntes}" pela ${vezes}ª vez. O agente não está gravando seu` +
            " estado — encerrando para não repetir o despacho indefinidamente.",
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
