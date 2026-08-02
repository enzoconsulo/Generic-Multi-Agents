/**
 * Critérios de aceite com FORMA EXECUTÁVEL (I5 de `_sistema/CUSTO_DE_CONTEXTO.md`).
 *
 * A ideia, em uma frase: **critério que uma máquina pode conferir não devia custar um
 * modelo.** Hoje o verificador (`testador`/`conferente`) é despachado para todo critério,
 * inclusive "`npm test` passa" — e um despacho custa ~US$ 0,50 antes de qualquer
 * julgamento. No job `7a1f9a45` o `testador` sozinho consumiu 54 voltas e ~US$ 1,45.
 *
 * Não é conceito novo: é a **escada de verificação** que `_sistema/DOMINIOS.md` já define
 * para a trilha genérica — `[executado]` > `[inspecionado]` > `[julgado]` — aplicada
 * também à de software, e com o degrau de cima saindo de graça.
 *
 * FORMATO. O planejador escreve, na linha seguinte ao critério, um bloco indentado:
 *
 * ```markdown
 * - [ ] `npm test` roda a suíte inteira sem falha.
 *       `verificar: npm test`
 * - [ ] O arquivo de teste da tarefa existe.
 *       `verificar: test -f tests/turno-resolucao.test.js`
 * - [ ] A tela do tabuleiro fica legível em 1280px.
 * ```
 *
 * O terceiro não tem comando — e não deve ter. **A régua não é "dá para automatizar", é "a
 * automação responde a MESMA pergunta"**: `grep` que confirma que uma string existe no
 * bundle não prova que a tela ficou boa, e o painel já registra duas tarefas dadas por
 * prontas exatamente assim. Critério de julgamento continua indo para o verificador.
 *
 * SEGURANÇA. O comando vem de um arquivo escrito por um modelo, então é entrada NÃO
 * confiável: roda com `execFile` + shell explícito mas com allowlist de binário, sem
 * encadeamento (`&&`, `;`, `|`, backtick, `$(`), e sempre confinado ao diretório do projeto.
 * Comando fora da allowlist não é executado — vira `nao-executado`, e o verificador julga
 * como sempre. Degrada, não abre buraco.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** Um critério de aceite lido do arquivo da tarefa. */
export interface Criterio {
  /** Texto do critério, sem o `- [ ]`. */
  texto: string;
  /** Comando declarado em `verificar:`, ou null quando é critério de julgamento. */
  comando: string | null;
  /** Marcado como feito no arquivo (`- [x]`). */
  marcado: boolean;
}

/**
 * Binários permitidos. Allowlist, nunca lista de proibições — mesma doutrina da URL de
 * remoto em `publicacao.ts`, onde `ext::<comando>` mostrou que "proibir o que eu lembrar"
 * não fecha nada.
 *
 * O critério de entrada: o binário **verifica** (roda teste, checa arquivo, compila) e não
 * publica, não instala e não apaga. `git` entra só em modo leitura, filtrado abaixo.
 */
export const BINARIOS_PERMITIDOS: ReadonlySet<string> = new Set([
  "npm", "npx", "node", "pnpm", "yarn",
  "python", "python3", "pytest", "ruff", "mypy",
  "go", "cargo", "dotnet", "mvn", "gradle",
  "test", "ls", "cat", "grep", "rg", "find",
  "tsc", "eslint", "prettier", "vitest", "jest",
  "git",
]);

/** Subcomandos de `git` que só LEEM. `git push`/`clean`/`reset` nunca entram aqui. */
const GIT_LEITURA: ReadonlySet<string> = new Set([
  "status", "log", "show", "diff", "ls-files", "rev-parse", "describe", "cat-file",
]);

/** Metacaracteres de shell: encadeamento e substituição viram recusa, não escape. */
const PERIGOSO = /[;&|`$><\n\r]|\$\(/;

export type MotivoRecusa =
  | "sem-comando"
  | "binario-nao-permitido"
  | "encadeamento-proibido"
  | "git-nao-leitura";

/** O comando é seguro para rodar sem supervisão? */
export function avaliarComando(
  comando: string,
): { ok: true; argv: string[] } | { ok: false; motivo: MotivoRecusa } {
  const bruto = (comando ?? "").trim();
  if (bruto === "") return { ok: false, motivo: "sem-comando" };
  if (PERIGOSO.test(bruto)) return { ok: false, motivo: "encadeamento-proibido" };

  const argv = bruto.split(/\s+/);
  const bin = (argv[0] ?? "").toLowerCase().replace(/\.(exe|cmd|bat)$/, "");
  if (!BINARIOS_PERMITIDOS.has(bin)) return { ok: false, motivo: "binario-nao-permitido" };
  if (bin === "git" && !GIT_LEITURA.has((argv[1] ?? "").toLowerCase())) {
    return { ok: false, motivo: "git-nao-leitura" };
  }
  return { ok: true, argv };
}

/**
 * Lê os critérios da seção `## Critérios de aceite` de uma tarefa.
 *
 * Tolerante por construção (mesma regra do resto de `fabrica/`): linha malformada não
 * derruba o parse — ela vira critério sem comando, que é o comportamento antigo.
 */
export function lerCriterios(secao: string): Criterio[] {
  const criterios: Criterio[] = [];
  const linhas = (secao ?? "").split(/\r?\n/);

  for (let i = 0; i < linhas.length; i++) {
    const m = /^\s*[-*]\s*\[( |x|X)\]\s*(.+?)\s*$/.exec(linhas[i] ?? "");
    if (m === null) continue;

    // O critério e o comando podem ocupar VÁRIAS linhas: o planejador quebra linha o tempo
    // todo, e a continuação vem indentada. A primeira versão lia só a linha do `- [ ]`, e
    // numa rodada real isso truncou 11 critérios no meio da frase ("emite ao jogador da vez
    // uma") — inclusive no relatório que o verificador lê para saber o que julgar.
    const partes: string[] = [m[2] ?? ""];
    let comando: string | null = null;
    for (let j = i + 1; j < linhas.length; j++) {
      const linha = linhas[j] ?? "";
      if (/^\s*[-*]\s*\[/.test(linha)) break; // próximo critério
      if (linha.trim() === "") continue;
      if (!/^\s+/.test(linha)) break; // saiu da continuação indentada
      partes.push(linha.trim());
    }

    const inteiro = partes.join(" ");
    const cmd = /`verificar:\s*([^`]+)`/.exec(inteiro);
    if (cmd !== null) comando = (cmd[1] ?? "").trim();

    criterios.push({
      texto: inteiro.replace(/`verificar:[^`]*`/, "").replace(/\s+/g, " ").trim(),
      comando,
      marcado: (m[1] ?? " ").toLowerCase() === "x",
    });
  }
  return criterios;
}

/** Resultado de um critério depois da passada mecânica. */
export interface ResultadoCriterio {
  texto: string;
  /**
   * - `passou` / `falhou`: o comando rodou e decidiu — grau `[executado]`, de graça;
   * - `nao-executado`: não havia comando ou ele foi recusado. **Vai para o verificador**,
   *   que é o comportamento de sempre. Nunca é aprovação por omissão.
   */
  estado: "passou" | "falhou" | "nao-executado";
  comando: string | null;
  /** Motivo da recusa, quando `nao-executado` por causa do comando. */
  recusa?: MotivoRecusa;
  /** Saída relevante (cortada) quando falhou — é o que o construtor precisa ler. */
  saida?: string;
}

/** Corta a saída para caber num relatório sem virar parede de texto. */
function cortar(texto: string, max = 2000): string {
  const t = (texto ?? "").trim();
  return t.length > max ? `${t.slice(0, max)}\n… (saída cortada)` : t;
}

/**
 * Executa os critérios que têm comando. Os demais voltam como `nao-executado` para o
 * verificador julgar.
 *
 * NUNCA lança: uma falha de ambiente aqui viraria reprovação falsa da tarefa, que é o
 * desperdício mais caro da fábrica (queima um ciclo inteiro).
 */
export async function executarCriterios(
  criterios: readonly Criterio[],
  dirProjeto: string,
  opcoes: { timeoutMs?: number } = {},
): Promise<ResultadoCriterio[]> {
  const timeout = opcoes.timeoutMs ?? 10 * 60_000;
  const saida: ResultadoCriterio[] = [];

  for (const c of criterios) {
    if (c.comando === null) {
      saida.push({ texto: c.texto, estado: "nao-executado", comando: null });
      continue;
    }
    const avaliacao = avaliarComando(c.comando);
    if (!avaliacao.ok) {
      saida.push({
        texto: c.texto,
        estado: "nao-executado",
        comando: c.comando,
        recusa: avaliacao.motivo,
      });
      continue;
    }
    const [bin, ...args] = avaliacao.argv;
    try {
      const r = await exec(bin as string, args, {
        cwd: dirProjeto,
        timeout,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        // Windows: `npm` é `npm.cmd` e precisa de shell para resolver. O comando já passou
        // pela allowlist e pela recusa de metacaracteres, então não há o que injetar aqui.
        shell: process.platform === "win32",
      });
      saida.push({ texto: c.texto, estado: "passou", comando: c.comando, saida: cortar(r.stdout) });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      saida.push({
        texto: c.texto,
        estado: "falhou",
        comando: c.comando,
        saida: cortar(`${err.stdout ?? ""}\n${err.stderr ?? err.message ?? ""}`),
      });
    }
  }
  return saida;
}

/**
 * Relatório em markdown para a seção `## Verificação` da tarefa, no formato da escada de
 * `DOMINIOS.md`. Fecha com a linha `Graus de prova:`, que é o que denuncia projeto rodando
 * com "um portão e meio" — muitos `julgados` é sinal de planejamento com critério no degrau
 * errado, não de agente relapso.
 */
export function relatorioCriterios(resultados: readonly ResultadoCriterio[]): string {
  if (resultados.length === 0) return "";
  const linhas: string[] = ["### Passada mecânica (sem modelo)", ""];

  for (const r of resultados) {
    if (r.estado === "nao-executado") {
      const porque =
        r.recusa === undefined
          ? "sem comando declarado"
          : `comando recusado: ${r.recusa}`;
      linhas.push(`- [julgado] ${r.texto} — ${porque}; fica para o verificador.`);
      continue;
    }
    const marca = r.estado === "passou" ? "PASSOU" : "FALHOU";
    linhas.push(`- [executado] ${r.texto} — \`${r.comando}\` → **${marca}**`);
    if (r.estado === "falhou" && (r.saida ?? "") !== "") {
      linhas.push("", "```", r.saida ?? "", "```", "");
    }
  }

  const executados = resultados.filter((r) => r.estado !== "nao-executado").length;
  const julgados = resultados.length - executados;
  linhas.push(
    "",
    `Graus de prova: ${executados} executado(s), ${julgados} para julgamento` +
      ` (de ${resultados.length}).`,
  );
  return linhas.join("\n");
}

/** Algum critério com comando falhou? Aí não vale gastar verificador — devolva ao construtor. */
export function reprovouNaMecanica(resultados: readonly ResultadoCriterio[]): boolean {
  return resultados.some((r) => r.estado === "falhou");
}

/**
 * Critério IMPLÍCITO que vale para toda tarefa de software: **a suíte do projeto continua
 * passando.**
 *
 * Não está escrito em tarefa nenhuma e mesmo assim é executado em TODA verificação — é o
 * passo 3 do `testador` ("Rode a suíte completa do projeto. A tarefa não pode ter quebrado
 * o que já existia"). Ou seja: a fábrica já paga por isso a cada tarefa, num despacho de
 * modelo, para rodar um comando.
 *
 * Torná-lo implícito aqui é o que faz a I5 valer sem depender de o planejador lembrar de
 * escrever `verificar:` em cada tarefa — e vale para qualquer stack, porque o comando sai
 * da detecção de ecossistema que o CI já usa (Node, Python, Go, Rust, .NET, Maven, Gradle).
 *
 * `null` quando o ecossistema não tem comando de teste: aí não há o que rodar, e o
 * verificador julga como sempre.
 */
export function criterioDaSuite(comandoTestes: string | null): Criterio | null {
  const cmd = (comandoTestes ?? "").trim();
  if (cmd === "") return null;
  return {
    texto: "A suíte do projeto continua passando (não quebrou o que já existia)",
    comando: cmd,
    marcado: false,
  };
}
