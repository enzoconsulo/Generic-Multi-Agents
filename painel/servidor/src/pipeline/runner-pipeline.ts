import { join } from "node:path";
import { appendFile, readFile } from "node:fs/promises";
import { lerEquipe, lerResumosTarefas, parsearPlano, parsearTarefa } from "../fabrica/index.js";
import { alteracoesForaDe, commitarCaminhos, lerHead } from "../fabrica/git.js";
import { gravarMarco, textoDoMarco } from "./marco.js";
import { temTrabalhoParcial } from "./trabalho-parcial.js";
import { anexarNaSecao, gravarStatusTarefa } from "../fabrica/escrita-tarefas.js";
import { consultaReal, type Consulta } from "../jobs/claude/runner-claude.js";
import type { ContextoExecucao, Job, Runner } from "../jobs/tipos.js";
import type { SecoesTarefa, TarefaResumo } from "../fabrica/tipos.js";
import { resolverArea } from "../contexto/montador.js";
import { criarDespachante } from "./despachante.js";
import { rodarPipeline, type DependenciasMotor, type RelatorioMotor } from "./motor.js";
import { trilhaDe } from "./maquina.js";
import { detectarEcossistema } from "../ci/ecossistemas.js";
import { novoOrcamento } from "./orcamento.js";
import { coletarOrfaos, RastreadorDescendentes } from "./coleta-processos.js";

/**
 * Runner do PIPELINE EM CÓDIGO — o `/trabalhar` sem orquestrador-modelo.
 *
 * Substitui um fluxo em que um modelo lia frontmatter, decidia a ordem, escolhia o agente e
 * despachava — US$ 1,29 por job (17%) para executar uma máquina de estados, e a camada que
 * abandonou trabalho duas vezes por encerrar o turno com agente em voo.
 *
 * O QUE ESTE RUNNER **NÃO** FAZ, e é deliberado: replanejar, julgar marco de fase, redigir
 * relatório de sessão, decidir que uma tarefa é trivial o bastante para pular o teste. Isso
 * é julgamento. Ele SINALIZA (`paraReplanejar`, `bloqueadas`) e o relatório final diz o que
 * ficou para o humano ou para um fluxo de julgamento decidir. **Meio termo é isto**: o
 * mecânico vira código, o julgamento continua no modelo, e a fronteira é "cabe num teste?".
 *
 * Segurança de estado: o painel passa a escrever `pronta` e `bloqueada` nos arquivos de
 * tarefa — exceção deliberada à regra "o painel nunca escreve status", justificada e
 * isolada em `fabrica/escrita-tarefas.ts`. Todo o resto do arquivo continua sendo escrito
 * pelos agentes.
 */

export interface ParamsPipeline {
  /** Raiz da fábrica. */
  raiz: string;
  /** Nome do projeto sob `projetos/`. */
  projeto: string;
  modelo: string;
  fallback?: string;
  /** Modelo do retrabalho; ausente = estratégia já no topo. */
  reforco?: string | null;
  /** Teto de custo do job em US$; ausente = sem teto. */
  tetoUsd?: number;
}

export interface ResultadoPipeline extends RelatorioMotor {
  projeto: string;
  custoEstimadoUsd: number;
  /** Texto pronto para a UI e para o log do dia. */
  texto: string;
}

export class RunnerPipeline implements Runner {
  constructor(private readonly consulta: Consulta = consultaReal) {}

  async executar(job: Job, ctx: ContextoExecucao): Promise<ResultadoPipeline> {
    // Marco zero da coleta de órfãos: nada nascido ANTES disto é candidato. O rastreador
    // começa junto porque a prova de propriedade é perecível — ver `coleta-processos.ts`.
    const iniciouEmMs = Date.now();
    const rastreador = new RastreadorDescendentes(process.pid);
    rastreador.iniciar();
    const p = lerParams(job.params ?? {});
    const dirProjeto = join(p.raiz, "projetos", p.projeto);
    const dirTarefas = join(dirProjeto, "_gestao", "tarefas");

    const controlador = new AbortController();
    if (ctx.sinal.aborted) controlador.abort();
    else ctx.sinal.addEventListener("abort", () => controlador.abort(), { once: true });

    const equipe = await lerEquipe(p.raiz, p.projeto);
    const trilha = trilhaDe(equipe);
    // Comando de teste do projeto, pela mesma detecção que o CI usa. Vira o critério
    // implícito da passada mecânica: a suíte é o que o verificador roda em TODA tarefa, e
    // rodar comando não deveria custar um despacho de modelo.
    const eco = await detectarEcossistema(dirProjeto);
    const comandoTestes = eco?.comandos.testes ?? null;
    ctx.emitir("log", {
      nivel: "inicio",
      texto:
        `Pipeline em código · projeto ${p.projeto} · trilha ${trilha} · modelo ${p.modelo}` +
        `${p.tetoUsd !== undefined ? ` · teto US$ ${p.tetoUsd.toFixed(2)}` : " · SEM teto"}` +
        `${comandoTestes !== null ? ` · suíte: \`${comandoTestes}\`` : " · sem suíte detectada"}`,
    });

    const despachar = criarDespachante({
      raizFabrica: p.raiz,
      dirProjeto,
      projeto: p.projeto,
      modeloFluxo: p.modelo,
      fallback: p.fallback,
      equipe,
      consulta: this.consulta,
      abortController: controlador,
      emitir: (nivel, texto) =>
        ctx.emitir("log", { nivel: nivel === "ferramenta" ? "ferramenta" : nivel === "erro" ? "erro" : "assistente", texto }),
    });

    /** Seção crua de uma tarefa, lendo o arquivo completo só quando é preciso. */
    async function secao(t: TarefaResumo, qual: keyof SecoesTarefa): Promise<string> {
      try {
        const texto = await readFile(join(dirTarefas, t.arquivo), "utf8");
        return parsearTarefa(t.arquivo, texto).secoes[qual] ?? "";
      } catch {
        return "";
      }
    }

    const dep: DependenciasMotor = {
      lerTarefas: async () => (await lerResumosTarefas(dirTarefas)) as readonly TarefaResumo[],
      gravarStatus: async (t, status) => {
        const r = await gravarStatusTarefa(join(dirTarefas, t.arquivo), status);
        if (!r.ok) ctx.emitir("log", { nivel: "erro", texto: `${t.id}: ${r.motivo}` });
        else if (r.de !== r.para) {
          ctx.emitir("log", { nivel: "assistente", texto: `${t.id}: ${r.de} → ${r.para}` });
        }
      },
      anexarVerificacao: async (t, texto) => {
        const r = await anexarNaSecao(join(dirTarefas, t.arquivo), "Verificação", texto);
        if (!r.ok) ctx.emitir("log", { nivel: "erro", texto: `${t.id}: ${r.motivo}` });
      },
      temTrabalhoParcial: (t) => temTrabalhoParcial(dirProjeto, t.areas),
      // Só é chamado quando o REVISOR reprovou — o único caso em que o texto acrescenta
      // informação (veredito de conformidade e gravidade dos achados).
      lerRevisaoDe: async (t) => ({
        conformidade: await secao(t, "conformidade"),
        revisao: await secao(t, "revisao"),
      }),
      // Commit em nome da TAREFA: `areas` + o arquivo da própria tarefa, nunca a árvore
      // inteira (o `git add -A` já provou o estrago que faz — código entrando sem revisão).
      commitarTarefa: async (t, mensagem) => {
        const caminhos = [
          ...t.areas.filter((a) => resolverArea(dirProjeto, a) !== null),
          `_gestao/tarefas/${t.arquivo}`,
        ];
        try {
          return await commitarCaminhos(dirProjeto, mensagem, caminhos);
        } catch (e) {
          ctx.emitir("log", { nivel: "erro", texto: `${t.id}: commit de recuperação — ${(e as Error).message}` });
          return null;
        }
      },
      hashHead: () => lerHead(dirProjeto),
      anexarNotas: async (t, texto) => {
        const r = await anexarNaSecao(join(dirTarefas, t.arquivo), "Notas de execução", texto);
        if (!r.ok) ctx.emitir("log", { nivel: "erro", texto: `${t.id}: ${r.motivo}` });
      },
      lerCriteriosDe: (t) => secao(t, "criteriosAceite"),
      lerNotasDe: (t) => secao(t, "notasExecucao"),
      lerPlano: async () => {
        try {
          return parsearPlano(await readFile(join(dirProjeto, "_gestao", "PLANO.md"), "utf8"));
        } catch {
          // Projeto sem PLANO.md é caso legítimo (importado à mão): sem plano, sem marco.
          return null;
        }
      },
      gravarMarco: async (fase, veredicto) => {
        const r = await gravarMarco(
          join(dirProjeto, "_gestao", "PLANO.md"),
          fase,
          textoDoMarco(veredicto, new Date().toISOString().slice(0, 10)),
        );
        ctx.emitir("log", {
          nivel: r.ok ? "assistente" : "erro",
          texto: r.ok
            ? `PLANO.md · ${fase}: Marco ${r.de} → ${r.para}`
            : `Marco de ${fase}: ${r.motivo}`,
        });
      },
      commitarGestao: async (mensagem) => {
        // SÓ `_gestao/`. Antes isto era `git add -A`, e o commit de gestão arrastava código
        // de tarefa para dentro de si — código que assim entra no repositório sem NUNCA
        // passar pelo revisor (que julga o diff do hash registrado nas Notas) e que ainda
        // por cima mascara a falha do construtor que não commitou. Ver `commitarCaminhos`.
        try {
          const hash = await commitarCaminhos(dirProjeto, mensagem, ["_gestao"]);
          ctx.emitir("log", {
            nivel: "assistente",
            texto:
              hash === null
                ? "Gestão: nada pendente para commitar."
                : `Gestão commitada: ${hash.slice(0, 7)}`,
          });
        } catch (e) {
          ctx.emitir("log", { nivel: "erro", texto: `Commit da gestão: ${(e as Error).message}` });
        }

        // Sobra FORA de `_gestao/` = algum construtor terminou sem commitar. Com o `add -A`
        // isso era invisível: a sobra era engolida e a árvore ficava limpa, então o defeito
        // desaparecia junto com a evidência. Agora é dito em voz alta, com os arquivos.
        try {
          const sobras = await alteracoesForaDe(dirProjeto, ["_gestao"]);
          if (sobras.length > 0) {
            ctx.emitir("log", {
              nivel: "erro",
              texto:
                `ATENÇÃO: ${sobras.length} arquivo(s) alterados fora de _gestao/ e NÃO ` +
                `commitados — algum construtor terminou sem commitar. Este código não passou ` +
                `pelo revisor: ${sobras.slice(0, 10).join(", ")}` +
                `${sobras.length > 10 ? ` … (+${sobras.length - 10})` : ""}`,
            });
          }
        } catch {
          // Diagnóstico: nunca pode derrubar o fechamento da rodada.
        }
      },
      despachar,
      log: (nivel, texto) =>
        ctx.emitir("log", { nivel: nivel === "erro" ? "erro" : "assistente", texto }),
    };

    let relatorio: RelatorioMotor;
    try {
      relatorio = await rodarPipeline(
        {
          dirProjeto,
          projeto: p.projeto,
          trilha,
          comandoTestes,
          equipe,
          // Vazio de propósito: neste caminho NÃO existem subagentes injetados. O especialista
          // chega como "genérico + prompt colado" (passo 3 da resolução), que é uniforme e é
          // o único modo que funciona quando quem despacha é código.
          disponiveis: new Set<string>(),
          reforco: p.reforco ?? null,
          orcamento: novoOrcamento(p.tetoUsd ?? null),
        },
        dep,
      );
    } catch (erro) {
      // Rodada que morre no meio é justamente a que mais deixa processo de pé — parar o
      // rastreador aqui evita que o temporizador sobreviva ao job que o criou.
      rastreador.parar();
      throw erro;
    }

    // COLETA DE ÓRFÃOS — depois do laço, quando nenhuma etapa desta rodada está mais em voo.
    // Recolhe o que os agentes deixaram de pé (o clássico é `npm start` para a evidência
    // visual). Só mexe em processo ÓRFÃO nascido durante este job, então agente de job
    // paralelo — que continua pendurado no painel, vivo — nunca entra na conta.
    rastreador.parar();
    // Uma última amostra: a etapa final pode ter lançado algo depois da amostra anterior, e
    // aqui a cadeia até o painel ainda costuma estar intacta.
    await rastreador.amostrar();
    const coleta = await coletarOrfaos({
      painelPid: process.pid,
      desdeMs: iniciouEmMs,
      observados: rastreador.observados,
    });
    if (coleta.recolhidos > 0) {
      ctx.emitir("log", {
        nivel: "assistente",
        texto:
          `Coleta de processos: ${coleta.recolhidos} órfão(s) encerrado(s) — ` +
          coleta.detalhes.join(" · "),
      });
    }

    const texto = montarRelatorio(p.projeto, relatorio);

    // LOG DO DIA, escrito pelo motor. É o último automatismo que sobrava do orquestrador, e
    // o único cuja parte cara — redigir prosa — não é necessária: o que a próxima sessão
    // precisa ler são FATOS (o que rodou, o que fechou, o que travou, quanto custou), e
    // esses o motor tem de graça. Prosa sobre eles é do `/encerrar-dia`, que continua no
    // modelo.
    try {
      await appendFile(
        join(p.raiz, "_sistema", "logs", `${new Date().toISOString().slice(0, 10)}.md`),
        `
## Pipeline — ${p.projeto} (${new Date().toISOString().slice(11, 16)} UTC)

` +
          `${texto}
`,
        "utf8",
      );
    } catch (e) {
      // Nunca derruba a rodada: o relatório já está no job e no console.
      ctx.emitir("log", { nivel: "erro", texto: `Log do dia não gravado: ${(e as Error).message}` });
    }

    ctx.emitir("log", { nivel: "resultado", texto });
    return {
      ...relatorio,
      projeto: p.projeto,
      custoEstimadoUsd: relatorio.orcamento.gastoUsd,
      texto,
    };
  }
}

/** Frases de encerramento — cada uma pede uma reação diferente do usuário. */
const POR_QUE: Readonly<Record<RelatorioMotor["encerrouPor"], string>> = {
  "sem-trabalho": "Não há mais tarefa despachável (o backlog restante depende de algo).",
  orcamento: "Encerrado pelo TETO DE CUSTO — parada planejada, nada foi cortado no meio.",
  "agente-cortado": "Um agente não devolveu resultado; o laço parou para não empilhar trabalho sobre estado desconhecido.",
  "sem-progresso": "Um agente terminou sem gravar o próprio status; o laço parou para não repetir o despacho.",
  "teto-de-voltas": "Teto de voltas do laço atingido — isto é sintoma de bug, investigue.",
};

function montarRelatorio(projeto: string, r: RelatorioMotor): string {
  const linhas = [
    `Pipeline de ${projeto}: ${r.despachos} despacho(s), ` +
      `${r.tarefasConcluidas.length} tarefa(s) concluída(s).`,
    POR_QUE[r.encerrouPor],
  ];
  if (r.tarefasConcluidas.length > 0) linhas.push(`Concluídas: ${r.tarefasConcluidas.join(", ")}.`);
  if (r.promovidas.length > 0) linhas.push(`Promovidas: ${r.promovidas.join(", ")}.`);
  if (r.saneadas.length > 0) {
    linhas.push(`Saneadas na abertura (sobras sem Notas): ${r.saneadas.join(", ")}.`);
  }
  for (const m of r.marcos) {
    linhas.push(
      m.veredicto === "indefinido"
        ? `MARCO da fase "${m.fase}": veredito não identificado — PLANO.md NÃO foi alterado, confira à mão.`
        : `Marco da fase "${m.fase}": ${m.veredicto.toUpperCase()}.`,
    );
  }
  if (r.etapasFalhas.length > 0) {
    linhas.push(
      'Etapas que falharam (tarefa fora desta rodada, as outras seguiram): ' +
        r.etapasFalhas.map((e) => e.tarefa + ' no ' + e.agente).join('; ') + '.',
    );
  }
  if (r.documentou) linhas.push("Documentação atualizada.");
  if (r.criteriosExecutados > 0) {
    linhas.push(
      `${r.criteriosExecutados} critério(s) resolvidos por comando, sem gastar modelo.`,
    );
  }
  // Os dois pedem AÇÃO e por isso vão por último, que é onde se olha.
  if (r.paraReplanejar.length > 0) {
    linhas.push(
      `Replanejadas automaticamente (esgotaram os ciclos): ${r.paraReplanejar.join(", ")}.` +
        " O planejador quebrou ou reescreveu a abordagem; as substitutas entram na próxima" +
        " rodada.",
    );
  }
  if (r.bloqueadas.length > 0) {
    linhas.push(`BLOQUEADAS para você: ${r.bloqueadas.join(", ")} (já eram replanejamento).`);
  }
  linhas.push(`Gasto estimado: US$ ${r.orcamento.gastoUsd.toFixed(2)}.`);
  return linhas.join("\n");
}

function lerParams(params: Record<string, unknown>): ParamsPipeline {
  const raiz = params["raiz"];
  const projeto = params["projeto"];
  const modelo = params["modelo"];
  if (typeof raiz !== "string" || raiz === "") throw new Error("Job pipeline sem `raiz`.");
  // Nome de projeto vira caminho: barrar travessia aqui, não confiar em quem chamou.
  if (typeof projeto !== "string" || !/^[a-zA-Z0-9._-]+$/.test(projeto) || projeto.startsWith(".")) {
    throw new Error("Job pipeline sem `projeto` válido.");
  }
  if (typeof modelo !== "string" || modelo === "") throw new Error("Job pipeline sem `modelo`.");

  const fallback = params["fallback"];
  const reforco = params["reforco"];
  const teto = params["tetoUsd"];
  return {
    raiz,
    projeto,
    modelo,
    ...(typeof fallback === "string" && fallback !== "" ? { fallback } : {}),
    ...(typeof reforco === "string" && reforco !== "" ? { reforco } : {}),
    ...(typeof teto === "number" && Number.isFinite(teto) && teto > 0 ? { tetoUsd: teto } : {}),
  };
}
