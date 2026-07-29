/**
 * Escalonamento do leitor: fábrica SINTÉTICA com N projetos × M tarefas. **Não gasta
 * assinatura.**
 *
 *   npx tsx integracao/bench-escala.ts [--projetos=10] [--tarefas=30] [--rodadas=15]
 *
 * Existe porque a fábrica real tem 1 projeto hoje, e medir só nela responde a pergunta
 * errada: o leitor precisa aguentar a fábrica que o sistema foi feito para ter.
 *
 * **Metodologia — a primeira versão disto quase fez tirar conclusão de ruído.** Medindo
 * uma variante por execução, os números iam de 117 ms a 280 ms para o MESMO código, com
 * outlier de 13,5 s: no Windows, arquivo recém-criado é varrido pelo antivírus, e o
 * cache do SO esquenta durante a medição. Nada disso é o código.
 *
 * Por isso aqui: fixture criado UMA vez, aquecimento longo antes de cronometrar, e as
 * variantes INTERCALADAS na mesma execução (A,B,A,B,…). Intercalar é o que importa —
 * qualquer deriva da máquina passa a atingir as duas igualmente, e a comparação
 * sobrevive. Relatório em MEDIANA (imune a outlier), com mínimo junto: em I/O o mínimo é
 * o mais próximo do custo real do código, e a distância entre eles é a medida do ruído.
 */
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lerFabrica } from "../src/fabrica/fabrica.js";
import { lerResumosTarefas, lerTarefas } from "../src/fabrica/tarefas.js";

const arg = (nome: string, padrao: number): number => {
  const a = process.argv.find((x) => x.startsWith(`--${nome}=`));
  return a ? Number(a.split("=")[1]) : padrao;
};
const nProjetos = arg("projetos", 10);
const nTarefas = arg("tarefas", 30);
const rodadas = arg("rodadas", 15);

const STATUS = ["backlog", "pronta", "em-execucao", "em-teste", "em-revisao", "concluida"];

function tarefaFalsa(i: number, projeto: string): string {
  const status = STATUS[i % STATUS.length]!;
  const deps = i > 2 ? `[T-${String(i - 1).padStart(3, "0")}]` : "[]";
  return `---
id: T-${String(i).padStart(3, "0")}
titulo: Tarefa sintética ${i} do projeto ${projeto}
projeto: ${projeto}
status: ${status}
prioridade: ${i % 3 === 0 ? "alta" : "media"}
dependencias: ${deps}
areas: [src/modulo-${i % 7}.ts]
tentativas: 0
criada: 2026-07-01
atualizada: 2026-07-29
---

## Objetivo
${"Objetivo com corpo realista para o parser de seções trabalhar. ".repeat(6)}

## Contexto
${"Contexto que ocupa espaço parecido com o de uma tarefa de verdade. ".repeat(10)}

## Critérios de aceite
- [ ] critério um
- [ ] critério dois

## Notas de execução
${"Nota. ".repeat(20)}

## Verificação
${"Relatório de verificação. ".repeat(15)}

## Revisão
`;
}

async function montarFabrica(): Promise<string> {
  const raiz = await mkdtemp(join(tmpdir(), "bench-fabrica-"));
  for (let p = 0; p < nProjetos; p++) {
    const nome = `projeto-${String(p).padStart(2, "0")}`;
    const gestao = join(raiz, "projetos", nome, "_gestao");
    await mkdir(join(gestao, "tarefas"), { recursive: true });
    await Promise.all([
      writeFile(
        join(gestao, "PLANO.md"),
        `# Plano\n\n## Fase 1 — Fundação\nMeta: coisa.\nMarco: pendente\n\n## Fase 2 — Núcleo\nMeta: outra.\nMarco: pendente\n`,
        "utf8",
      ),
      writeFile(join(gestao, "DECISOES.md"), "# Decisões\n\n" + "linha\n".repeat(200), "utf8"),
      writeFile(join(gestao, "PROGRESSO.md"), "# Progresso\n\n" + "linha\n".repeat(200), "utf8"),
      ...Array.from({ length: nTarefas }, (_, i) =>
        writeFile(
          join(gestao, "tarefas", `T-${String(i).padStart(3, "0")}-sintetica.md`),
          tarefaFalsa(i, nome),
          "utf8",
        ),
      ),
    ]);
  }
  await mkdir(join(raiz, "_sistema", "ideias"), { recursive: true });
  await mkdir(join(raiz, "_sistema", "logs"), { recursive: true });
  await writeFile(join(raiz, "_sistema", "logs", "2026-07-29.md"), "# Log\n", "utf8");
  return raiz;
}

const mediana = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const minimo = (xs: number[]): number => Math.min(...xs);

/** Roda as variantes INTERCALADAS, para a deriva da máquina atingir todas por igual. */
async function comparar(
  titulo: string,
  variantes: Record<string, () => Promise<unknown>>,
): Promise<void> {
  const nomes = Object.keys(variantes);
  const amostras: Record<string, number[]> = Object.fromEntries(nomes.map((n) => [n, []]));

  // Aquecimento generoso: cache do SO + antivírus terminando de olhar os arquivos novos.
  for (let i = 0; i < 5; i++) for (const n of nomes) await variantes[n]!();

  for (let r = 0; r < rodadas; r++) {
    for (const n of nomes) {
      const t = process.hrtime.bigint();
      await variantes[n]!();
      amostras[n]!.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
  }

  console.log(`\n${titulo}`);
  const base = mediana(amostras[nomes[0]!]!);
  for (const n of nomes) {
    const med = mediana(amostras[n]!);
    const rel = n === nomes[0] ? "" : `   ${(base / med).toFixed(2)}× vs ${nomes[0]}`;
    console.log(
      `  ${n.padEnd(26)} mediana ${med.toFixed(1).padStart(7)} ms   min ${minimo(amostras[n]!)
        .toFixed(1)
        .padStart(7)} ms${rel}`,
    );
  }
}

const raiz = await montarFabrica();
const dirTarefas = join(raiz, "projetos", "projeto-00", "_gestao", "tarefas");
console.log(
  `fábrica sintética: ${nProjetos} projetos × ${nTarefas} tarefas ` +
    `(${nProjetos * nTarefas} arquivos), ${rodadas} rodadas intercaladas`,
);

try {
  await comparar("Parse do corpo em seções — o que `lerFabrica` descartava (mesmo I/O)", {
    "com seções": () => lerTarefas(dirTarefas),
    "só frontmatter": () => lerResumosTarefas(dirTarefas),
  });

  // Reimplementa a versão SERIAL (como era antes da T-043) para o A/B ser contra código
  // real, não contra um número anotado de outra execução — que foi exatamente o erro que
  // a metodologia acima existe para evitar.
  const { readdir, readFile } = await import("node:fs/promises");
  const { parsearTarefa } = await import("../src/fabrica/tarefas.js");
  const lerTarefasSerial = async (dir: string): Promise<unknown[]> => {
    const nomes = (await readdir(dir)).filter((n) => /^T-\d+.*\.md$/i.test(n)).sort();
    const out: unknown[] = [];
    for (const nome of nomes) out.push(parsearTarefa(nome, await readFile(join(dir, nome), "utf8")));
    return out;
  };
  const lerFabricaSerial = async (): Promise<unknown[]> => {
    const nomes = (await readdir(join(raiz, "projetos"), { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    const out: unknown[] = [];
    for (const nome of nomes) {
      out.push(await lerTarefasSerial(join(raiz, "projetos", nome, "_gestao", "tarefas")));
    }
    return out;
  };

  await comparar("Leitura de todos os projetos: serial (antes) × paralela (agora)", {
    "serial (antes)": lerFabricaSerial,
    "paralela (agora)": () => lerFabrica(raiz),
  });
} finally {
  await rm(raiz, { recursive: true, force: true });
}
