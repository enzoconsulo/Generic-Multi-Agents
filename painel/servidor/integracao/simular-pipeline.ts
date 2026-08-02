/**
 * SIMULAÇÃO do pipeline contra a fábrica REAL — sem gastar um centavo.
 *
 * Roda o motor inteiro (`RunnerPipeline`) sobre os arquivos de verdade, com um SDK falso no
 * lugar do `query()`. Tudo que não é a chamada ao modelo acontece de verdade: leitura de
 * tarefas, resolução de agente, montagem de contexto, passada mecânica de critérios,
 * decisões de orçamento. O que ele imprime é **o que aconteceria** se você disparasse.
 *
 * POR QUE ISTO EXISTE. A fábrica já foi cortada duas vezes por um fluxo que parecia
 * sucesso (30/07 e 01/08), e nas duas o diagnóstico só veio horas depois, lendo log à mão.
 * Um caminho novo de execução precisa de um jeito de ser conferido ANTES de rodar valendo —
 * e que possa ser reexecutado sempre que alguém mexer no pipeline.
 *
 * USO:
 *   npx tsx integracao/simular-pipeline.ts <projeto> [--teto=8]
 *
 * NÃO ESCREVE NADA: o `gravarStatus` e o `anexarVerificacao` são interceptados e apenas
 * registrados. Rodar isto nunca pode sujar o repositório do projeto.
 */
import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { lerEquipe, lerResumosTarefas, parsearPlano, parsearTarefa } from "../src/fabrica/index.js";
import { trilhaDe } from "../src/pipeline/maquina.js";
import { novoOrcamento } from "../src/pipeline/orcamento.js";
import { rodarPipeline, type DependenciasMotor } from "../src/pipeline/motor.js";
import { criarDespachante } from "../src/pipeline/despachante.js";
import { temTrabalhoParcial } from "../src/pipeline/trabalho-parcial.js";
import type { Consulta } from "../src/jobs/claude/runner-claude.js";
import type { TarefaResumo } from "../src/fabrica/tipos.js";

const argv = process.argv.slice(2);
const projeto = argv.find((a) => !a.startsWith("--")) ?? "";
const teto = Number(argv.find((a) => a.startsWith("--teto="))?.split("=")[1] ?? "8");
const raiz = resolve(process.cwd(), "..", "..");

if (projeto === "") {
  console.error("uso: npx tsx integracao/simular-pipeline.ts <projeto> [--teto=8]");
  process.exit(1);
}

const dirProjeto = join(raiz, "projetos", projeto);
const dirTarefas = join(dirProjeto, "_gestao", "tarefas");

/** Custo médio por etapa observado nos jobs reais — para a simulação prever o orçamento. */
const CUSTO_ETAPA_SIMULADO = 0.55;

const prompts: { agente: string; tokens: number; arquivos: number }[] = [];

/** SDK falso: não chama nada, só devolve um `result` plausível e anota o que recebeu. */
const consultaFalsa: Consulta = (args) => {
  const texto = String(args.prompt);
  const modelo = String((args.options as Record<string, unknown>)["model"] ?? "?");
  prompts.push({
    agente: modelo,
    tokens: Math.round(Buffer.byteLength(texto, "utf8") / 4),
    arquivos: (texto.match(/<arquivo caminho=/g) ?? []).length,
  });
  return (async function* () {
    yield { type: "result", is_error: false, total_cost_usd: CUSTO_ETAPA_SIMULADO, num_turns: 5 };
  })();
};

async function secao(t: TarefaResumo, qual: "criteriosAceite" | "notasExecucao"): Promise<string> {
  try {
    const texto = await readFile(join(dirTarefas, t.arquivo), "utf8");
    return parsearTarefa(t.arquivo, texto).secoes[qual] ?? "";
  } catch {
    return "";
  }
}

const equipe = await lerEquipe(raiz, projeto);
const trilha = trilhaDe(equipe);

console.log(`\n=== SIMULAÇÃO — ${projeto} (trilha ${trilha}, teto US$ ${teto.toFixed(2)}) ===`);
console.log("Nada será escrito. Nenhuma chamada de modelo será feita.\n");

/**
 * O estado das tarefas fica em MEMÓRIA a partir daqui: a simulação precisa que o status
 * avance (senão o motor para na guarda de progresso, corretamente), mas o disco é
 * intocável. As transições espelham o contrato de cada agente.
 */
const emMemoria = new Map(
  ((await lerResumosTarefas(dirTarefas)) as TarefaResumo[]).map((t) => [t.id, { ...t }]),
);
const proximo: Record<string, string> = {
  pronta: "em-teste",
  "em-execucao": "em-teste",
  "em-teste": "em-revisao",
  "em-revisao": "concluida",
};

const escritas: string[] = [];
const dep: DependenciasMotor = {
  lerTarefas: async () => [...emMemoria.values()],
  gravarStatus: async (t, status) => {
    escritas.push(`  [painel grava] ${t.id}: ${emMemoria.get(t.id)?.status} → ${status}`);
    const atual = emMemoria.get(t.id);
    if (atual !== undefined) atual.status = status;
  },
  anexarVerificacao: async (t, texto) => {
    escritas.push(`  [painel anexa] ${t.id}: +${texto.split("\n").length} linhas na Verificação`);
  },
  temTrabalhoParcial: (t) => temTrabalhoParcial(dirProjeto, t.areas),
  lerCriteriosDe: (t) => secao(t, "criteriosAceite"),
  lerNotasDe: (t) => secao(t, "notasExecucao"),
  lerPlano: async () => {
    try {
      return parsearPlano(await readFile(join(dirProjeto, "_gestao", "PLANO.md"), "utf8"));
    } catch {
      return null;
    }
  },
  gravarMarco: async (fase, veredicto) => {
    escritas.push(`  [painel grava] PLANO.md · ${fase}: Marco → ${veredicto}`);
  },
  commitarGestao: async (mensagem) => {
    escritas.push(`  [painel commita] ${mensagem}`);
  },
  despachar: async (pedido) => {
    const r = await criarDespachante({
      raizFabrica: raiz,
      dirProjeto,
      projeto,
      modeloFluxo: "sonnet",
      equipe,
      consulta: consultaFalsa,
      abortController: new AbortController(),
      emitir: (nivel, texto) => {
        if (nivel !== "ferramenta") console.log(`  ${texto}`);
      },
    })(pedido);
    // O agente real gravaria o próprio status ao terminar; aqui a simulação faz por ele —
    // exceto nos papéis que não mexem em tarefa nenhuma.
    if (pedido.papel !== "marco" && pedido.papel !== "documentador") {
      const atual = emMemoria.get(pedido.tarefa.id);
      if (atual !== undefined) atual.status = proximo[atual.status] ?? "concluida";
    }
    // Marco: devolve o veredito no formato de contrato, como o agente real faria.
    return { ...r, texto: pedido.papel === "marco" ? "MARCO: aprovado" : r.texto };
  },
  log: (nivel, texto) => console.log(`${nivel === "erro" ? "  ! " : "  "}${texto}`),
};

const rel = await rodarPipeline(
  {
    dirProjeto,
    projeto,
    trilha,
    equipe,
    disponiveis: new Set<string>(),
    reforco: "opus",
    orcamento: novoOrcamento(teto),
  },
  dep,
);

console.log("\n--- escritas que o painel faria ---");
console.log(escritas.length > 0 ? escritas.join("\n") : "  (nenhuma)");

console.log("\n--- contexto por etapa ---");
for (const [i, p] of prompts.entries()) {
  console.log(`  ${i + 1}. modelo ${p.agente.padEnd(8)} ~${p.tokens} tok, ${p.arquivos} arquivo(s) embutido(s)`);
}
const total = prompts.reduce((s, p) => s + p.tokens, 0);
const medio = prompts.length > 0 ? Math.round(total / prompts.length) : 0;
console.log(`  média: ~${medio} tok por etapa (linha de base do orquestrador-modelo: ~53.500)`);

console.log("\n--- desfecho ---");
console.log(`  despachos: ${rel.despachos}`);
console.log(`  concluídas: ${rel.tarefasConcluidas.join(", ") || "(nenhuma)"}`);
console.log(`  promovidas: ${rel.promovidas.join(", ") || "(nenhuma)"}`);
console.log(`  critérios por comando: ${rel.criteriosExecutados}`);
console.log(`  para replanejar: ${rel.paraReplanejar.join(", ") || "(nenhuma)"}`);
console.log(`  bloqueadas: ${rel.bloqueadas.join(", ") || "(nenhuma)"}`);
console.log(`  saneadas na abertura: ${rel.saneadas.join(", ") || "(nenhuma)"}`);
console.log(
  `  marcos: ${rel.marcos.map((m) => `${m.fase}=${m.veredicto}`).join(", ") || "(nenhum)"}`,
);
console.log(`  documentador rodou: ${rel.documentou ? "sim" : "não"}`);
console.log(`  encerrou por: ${rel.encerrouPor}`);
console.log(`  gasto simulado: US$ ${rel.orcamento.gastoUsd.toFixed(2)}\n`);
