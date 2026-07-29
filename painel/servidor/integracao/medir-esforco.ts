/**
 * Mede o efeito REAL do `effort` nas ações mecânicas (T-042). **GASTA A ASSINATURA.**
 *
 * Fora de `testes/` pelo mesmo motivo do `canusetool.ts`: roda contra o SDK de verdade e
 * cobra, então não pode cair no `npm test`.
 *
 *   npx tsx integracao/medir-esforco.ts [--projeto=<nome>]
 *
 * O que se quer responder é uma pergunta só: rebaixar o esforço nas ações de zeladoria
 * economiza o suficiente para justificar o risco de piorar o resultado? Sem isto, a
 * tabela de guardrails é opinião — e opinião sobre custo já saiu cara aqui (o `effort`
 * nasceu com o nome errado e passou despercebido justamente por ninguém ter medido).
 *
 * Cuidados que fazem o A/B valer alguma coisa:
 * - **Mesma entrada nas duas pernas.** `conferir` e `progresso` ESCREVEM no projeto, e a
 *   segunda rodada encontraria o trabalho da primeira já feito — mediria "não havia nada
 *   a fazer", não o efeito do esforço. Por isso o repositório do projeto é restaurado
 *   entre as pernas, e o script se recusa a rodar se a árvore não estiver limpa.
 * - **Tokens, não só preço** (armadilha registrada no CLAUDE.md): o preço esconde a causa.
 * - **Caminho de produção.** Usa `montarJobAcao*` + `RunnerClaude` de verdade, não uma
 *   chamada montada à mão — medir um caminho que não é o que roda não prova nada.
 */

import { execFileSync } from "node:child_process";
import { montarJobAcao } from "../src/acoes/acoes.js";
import { montarJobAcaoProjeto } from "../src/acoes/acoes-projeto.js";
import { consultaReal, RunnerClaude, type Consulta } from "../src/jobs/claude/runner-claude.js";
import type { ContextoExecucao, Job, NovoJob } from "../src/jobs/tipos.js";
import { config } from "../src/config.js";

const projeto = (process.argv.find((a) => a.startsWith("--projeto=")) ?? "--projeto=ia-hibrida-limpa").split("=")[1]!;
const raiz = config.fabricaRaiz;
const dirProjeto = `${raiz}\\projetos\\${projeto}`;

const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: dirProjeto, encoding: "utf8" }).trim();

function arvoreLimpa(): boolean {
  return git("status", "--porcelain") === "";
}

/**
 * HEAD de antes do experimento. Fixado porque `conferir` e `progresso` podem COMMITAR: um
 * `checkout --` não desfaria isso, a segunda perna partiria de outro estado e o A/B
 * mediria a diferença entre dois pontos de partida em vez do efeito do esforço.
 */
const HEAD_ORIGINAL = git("rev-parse", "HEAD");

/** Devolve o projeto ao estado do início — a mesma entrada para as duas pernas. */
function restaurar(): void {
  git("reset", "--hard", HEAD_ORIGINAL);
  // Sem -x: arquivo ignorado (node_modules, .venv) não é lixo do experimento.
  git("clean", "-fd");
}

interface Medida {
  acao: string;
  esforco: string;
  custoUsd: number | null;
  numTurnos: number | null;
  entrada: number | null;
  saida: number | null;
  segundos: number;
  /**
   * Trabalho ENTREGUE, contra o HEAD do início. É a coluna que decide: sem ela, uma perna
   * que não fez nada aparece como a mais barata e vira "economia".
   */
  arquivosTocados: number;
  /** Mudança ainda não commitada (o agente pode entregar de qualquer um dos dois jeitos). */
  naArvore: number;
  /** `--shortstat` do que foi commitado: distingue "corrigiu" de "encostou no arquivo". */
  linhas: string;
}

/** Contexto mínimo: o experimento não precisa de eventos, só do resultado. */
function contexto(): ContextoExecucao {
  return {
    emitir: () => {},
    sinal: new AbortController().signal,
    pedirInput: async () => ({}),
    anotar: () => {},
  };
}

/**
 * Espia o `result` bruto para pegar `usage`. O `ResultadoClaude` do runner não expõe
 * tokens, e é justamente o que mostra a CAUSA de a conta subir ou cair.
 */
function consultaComUsage(guardar: (u: Record<string, unknown>) => void): Consulta {
  return (args) => {
    const iter = consultaReal(args);
    return (async function* () {
      for await (const m of iter) {
        const msg = m as { type?: string; usage?: Record<string, unknown> };
        if (msg.type === "result" && msg.usage) guardar(msg.usage);
        yield m;
      }
    })();
  };
}

function jobDe(novo: NovoJob): Job {
  return {
    id: `medida-${Date.now()}`,
    tipo: novo.tipo,
    titulo: novo.titulo,
    escopo: novo.escopo,
    usaClaude: true,
    params: novo.params ?? {},
    estado: "executando",
    criadoEm: new Date().toISOString(),
  };
}

async function rodar(rotulo: string, novo: NovoJob, esforco: string | undefined): Promise<Medida> {
  restaurar();
  const params = { ...(novo.params ?? {}) };
  // A perna de baseline remove a chave: ausente = padrão do modelo, que era o
  // comportamento de TODO fluxo antes da T-042.
  if (esforco === undefined) delete params["esforco"];
  else params["esforco"] = esforco;

  let usage: Record<string, unknown> = {};
  const runner = new RunnerClaude(consultaComUsage((u) => (usage = u)));
  const t0 = Date.now();
  const r = await runner.executar(jobDe({ ...novo, params }), contexto());
  const segundos = (Date.now() - t0) / 1000;

  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  // Contra o HEAD do início, NÃO contra a árvore: os agentes de zeladoria commitam, e
  // `git status` depois de um commit lê limpo. A primeira versão disto mediu "0 arquivos
  // tocados" nas seis pernas — inclusive nas que commitaram — e quase fez passar por
  // economia de 74% uma execução que simplesmente não fez o trabalho.
  const tocados = git("diff", "--name-only", HEAD_ORIGINAL, "HEAD")
    .split("\n")
    .filter((l) => l !== "").length;
  const naArvore = git("status", "--porcelain").split("\n").filter((l) => l !== "").length;
  const linhas = git("diff", "--shortstat", HEAD_ORIGINAL, "HEAD");

  return {
    acao: rotulo,
    esforco: esforco ?? "(padrão)",
    custoUsd: r.custoUsd,
    numTurnos: r.numTurnos,
    entrada: num(usage["input_tokens"]),
    saida: num(usage["output_tokens"]),
    segundos,
    arquivosTocados: tocados,
    naArvore,
    linhas: linhas === "" ? "—" : linhas,
  };
}

async function main(): Promise<void> {
  if (!arvoreLimpa()) {
    console.error(
      `Árvore de ${projeto} tem mudanças não commitadas. O experimento RESTAURA o\n` +
        "repositório entre as pernas e apagaria esse trabalho. Commite ou guarde antes.",
    );
    process.exit(1);
  }

  const modelo = "sonnet"; // estratégia padrão do painel
  const alvos: { rotulo: string; novo: NovoJob }[] = [
    {
      rotulo: "/status",
      novo: montarJobAcao({ id: "status", modelo, argumentos: projeto }, raiz),
    },
    {
      rotulo: "projeto:conferir",
      novo: await montarJobAcaoProjeto("conferir", projeto, raiz, { modelo }),
    },
    {
      rotulo: "projeto:progresso",
      novo: await montarJobAcaoProjeto("progresso", projeto, raiz, { modelo }),
    },
  ];

  const medidas: Medida[] = [];
  for (const alvo of alvos) {
    for (const esforco of [undefined, "medium"]) {
      process.stderr.write(`… ${alvo.rotulo} @ ${esforco ?? "padrão"}\n`);
      try {
        const m = await rodar(alvo.rotulo, alvo.novo, esforco);
        medidas.push(m);
        process.stderr.write(
          `  US$ ${m.custoUsd?.toFixed(4) ?? "?"} · ${m.saida ?? "?"} tokens de saída · ${m.segundos.toFixed(0)}s\n`,
        );
      } catch (e) {
        process.stderr.write(`  FALHOU: ${e instanceof Error ? e.message : String(e)}\n`);
      }
    }
  }
  restaurar();

  console.log("\n| ação | esforço | US$ | turnos | saída | seg | arq. | árvore | entregue |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const m of medidas) {
    console.log(
      `| ${m.acao} | ${m.esforco} | ${m.custoUsd?.toFixed(4) ?? "?"} | ${m.numTurnos ?? "?"} | ` +
        `${m.saida ?? "?"} | ${m.segundos.toFixed(0)} | ${m.arquivosTocados} | ${m.naArvore} | ${m.linhas} |`,
    );
  }

  console.log("\n### Variação por ação (padrão → medium)");
  for (const alvo of alvos) {
    const a = medidas.find((m) => m.acao === alvo.rotulo && m.esforco === "(padrão)");
    const b = medidas.find((m) => m.acao === alvo.rotulo && m.esforco === "medium");
    if (!a || !b || a.custoUsd === null || b.custoUsd === null) continue;
    const pct = ((b.custoUsd - a.custoUsd) / a.custoUsd) * 100;
    console.log(
      `- **${alvo.rotulo}**: US$ ${a.custoUsd.toFixed(4)} → ${b.custoUsd.toFixed(4)} ` +
        `(${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%), saída ${a.saida ?? "?"} → ${b.saida ?? "?"} tokens, ` +
        `${a.segundos.toFixed(0)}s → ${b.segundos.toFixed(0)}s`,
    );
    console.log(
      `  - entregue: **${a.linhas}** → **${b.linhas}** ` +
        `(${a.arquivosTocados} → ${b.arquivosTocados} arquivos). ` +
        (b.arquivosTocados === 0 && a.arquivosTocados > 0
          ? "⚠️ NÃO é economia: a perna barata não fez o trabalho."
          : "Trabalho comparável — economia real."),
    );
  }
  const total = medidas.reduce((s, m) => s + (m.custoUsd ?? 0), 0);
  console.log(`\nCusto do experimento: US$ ${total.toFixed(2)}`);
}

await main();
