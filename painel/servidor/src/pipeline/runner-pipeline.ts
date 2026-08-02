import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { lerEquipe, lerResumosTarefas, parsearPlano, parsearTarefa } from "../fabrica/index.js";
import { commitar } from "../fabrica/git.js";
import { gravarMarco, textoDoMarco } from "./marco.js";
import { anexarNaSecao, gravarStatusTarefa } from "../fabrica/escrita-tarefas.js";
import { consultaReal, type Consulta } from "../jobs/claude/runner-claude.js";
import type { ContextoExecucao, Job, Runner } from "../jobs/tipos.js";
import type { TarefaResumo } from "../fabrica/tipos.js";
import { criarDespachante } from "./despachante.js";
import { rodarPipeline, type DependenciasMotor, type RelatorioMotor } from "./motor.js";
import { trilhaDe } from "./maquina.js";
import { detectarEcossistema } from "../ci/ecossistemas.js";
import { novoOrcamento } from "./orcamento.js";

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
    async function secao(t: TarefaResumo, qual: "criteriosAceite" | "notasExecucao"): Promise<string> {
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
        try {
          const hash = await commitar(dirProjeto, mensagem);
          ctx.emitir("log", { nivel: "assistente", texto: `Gestão commitada: ${hash.slice(0, 7)}` });
        } catch (e) {
          // Árvore limpa é o caso NORMAL quando os agentes commitaram tudo — não é erro.
          const msg = (e as Error).message;
          ctx.emitir("log", {
            nivel: /nada a commitar|no changes|nenhuma altera/i.test(msg) ? "assistente" : "erro",
            texto: `Commit da gestão: ${msg}`,
          });
        }
      },
      despachar,
      log: (nivel, texto) =>
        ctx.emitir("log", { nivel: nivel === "erro" ? "erro" : "assistente", texto }),
    };

    const relatorio = await rodarPipeline(
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

    const texto = montarRelatorio(p.projeto, relatorio);
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
  if (r.documentou) linhas.push("Documentação atualizada.");
  if (r.criteriosExecutados > 0) {
    linhas.push(
      `${r.criteriosExecutados} critério(s) resolvidos por comando, sem gastar modelo.`,
    );
  }
  // Os dois pedem AÇÃO e por isso vão por último, que é onde se olha.
  if (r.paraReplanejar.length > 0) {
    linhas.push(
      `PRECISA DE JULGAMENTO — replanejar: ${r.paraReplanejar.join(", ")}. Rode` +
        " `/trabalhar` no chat ou a ação 'Replanejar' do painel: quebrar ou reescrever uma" +
        " tarefa é decisão, não regra.",
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
