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
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import { encerrarArvore } from "../ci/processo.js";

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

/**
 * POR QUE UM COMANDO NÃO PASSOU — e esta distinção é a razão de ser da T-054.
 *
 * Até aqui havia dois desfechos, `passou` e `falhou`, e tudo que não passava devolvia a
 * tarefa ao construtor. Isso trata "o teste reprovou" e "o comando não existe" como a mesma
 * coisa. Medido: a T-030 do banco-imobiliario gastou **4 ciclos e US$ 12,90** porque o
 * critério dizia `node --test tests` — forma que o Node 22 não aceita (diretório nu vira
 * módulo de entrada) — e o construtor, que por contrato NÃO pode alterar critério, era
 * despachado de novo a cada volta para consertar um `.bat` que já estava correto desde o
 * primeiro ciclo.
 *
 * Nenhum construtor conserta um comando quebrado, e nenhum modelo mais forte faz uma máquina
 * sem memória parar de derrubar processo.
 */
export type ClasseFalha =
  /** O comando não chegou a avaliar NADA: binário ausente, opção inválida, alvo ilegível. */
  | "ferramenta"
  /** A máquina atrapalhou: morte por sinal, crash nativo, teto de tempo, recurso esgotado. */
  | "ambiente"
  /** O comando rodou e reprovou de verdade. O ÚNICO que devolve a tarefa ao construtor. */
  | "falha";

/** Resultado de um critério depois da passada mecânica. */
export interface ResultadoCriterio {
  texto: string;
  /**
   * - `passou` / `falhou`: o comando rodou e decidiu — grau `[executado]`, de graça;
   * - `nao-executado`: não havia comando ou ele foi recusado. **Vai para o verificador**,
   *   que é o comportamento de sempre. Nunca é aprovação por omissão.
   * - `inconclusivo`: o comando não conseguiu responder à pergunta (ferramenta quebrada ou
   *   ambiente hostil). **Nunca reprova e nunca aprova** — vai para julgamento, e quando a
   *   classe é `ferramenta` o que precisa de conserto é o CRITÉRIO, não a entrega.
   */
  estado: "passou" | "falhou" | "nao-executado" | "inconclusivo";
  comando: string | null;
  /** Motivo da recusa, quando `nao-executado` por causa do comando. */
  recusa?: MotivoRecusa;
  /** Por que não decidiu, quando `inconclusivo`. */
  classe?: ClasseFalha;
  /**
   * O comando rodou DUAS vezes: a primeira caiu por ambiente e foi reexecutada (T-055). Vale
   * para qualquer desfecho da segunda — inclusive `passou`, que é o caso interessante, porque
   * é exatamente uma reprovação falsa que deixou de acontecer.
   */
  reexecutado?: boolean;
  /**
   * O veredito veio de um critério anterior do MESMO lote que declarava o mesmo comando
   * (T-059) — este não foi executado de novo. Ver `executarCriterios`.
   */
  espelho?: boolean;
  /** Saída relevante (cortada) quando falhou — é o que o construtor precisa ler. */
  saida?: string;
}

/**
 * Exit codes que dizem "não consegui nem começar" — e sempre amarrados ao BINÁRIO, porque
 * fora de contexto eles não significam nada: um programa qualquer pode sair com 9 querendo
 * dizer outra coisa. 127 e 9009 são do interpretador de comandos, não do programa, e por
 * isso valem para qualquer binário.
 */
const CODIGOS_DE_USO_INDEVIDO: ReadonlyMap<string, ReadonlySet<number>> = new Map([
  ["*", new Set([127, 9009])], // POSIX: command not found · cmd.exe: não reconhecido
  ["node", new Set([9])], //     bad option
  ["git", new Set([129])], //    uso indevido (git responde com o usage)
]);

/**
 * Crash nativo no Windows chega como NTSTATUS de erro no exit code — qualquer valor a partir
 * de 0xC0000000. Cobre de uma vez o `0xC0000409` (stack buffer overrun) e o `0xC0000005`
 * (access violation) que aparecem nas Notas de T-024, T-027, T-029 e T-030 sempre que a
 * suíte roda com a máquina sem memória. Em POSIX o equivalente não é código: é `signal`.
 */
const PISO_NTSTATUS_ERRO = 0xc0000000;

/** A máquina atrapalhou. `EBUSY`/`EPERM` entram porque o repositório vive sob OneDrive. */
const SINAIS_DE_AMBIENTE: readonly RegExp[] = [
  /\bENOMEM\b/,
  /\bEMFILE\b/,
  /\bENFILE\b/,
  /\bEAGAIN\b/,
  /\bEADDRINUSE\b/,
  /\bECONNRESET\b/,
  /\bETIMEDOUT\b/,
  /\bEBUSY\b/,
  /\bEPERM\b/,
  /JavaScript heap out of memory/i,
  /runtime: out of memory/i, // Go
  /\bMemoryError\b/, // Python
];

/** O binário não existe. Mensagem do shell, não do programa — vale para qualquer stack. */
const SINAIS_DE_BINARIO_AUSENTE: readonly RegExp[] = [
  /\bcommand not found\b/i,
  /is not recognized as an internal or external command/i,
  /n[ãa]o [ée] reconhecido como um comando/i, // Windows em PT-BR
  /\bspawn\b[^\n]*\bENOENT\b/i,
];

/** O binário existe, mas não entendeu o que você pediu. */
const SINAIS_DE_OPCAO_INVALIDA: readonly RegExp[] = [
  /\bbad option\b/i,
  /\bunknown option\b/i,
  /\bunrecognized option\b/i,
  /\binvalid option\b/i,
  /\bMissing script\b/i, // npm run <script que não existe>
];

/**
 * O ALVO que o comando não conseguiu abrir, quando o erro nomeia um. Um padrão por
 * ecossistema — reconhecer só o do Node repetiria, num arquivo novo, o defeito que
 * `ci/ecossistemas.ts` já corrigiu duas vezes.
 */
const PADROES_DE_ALVO: readonly RegExp[] = [
  /Cannot find module ['"]([^'"]+)['"]/, //            Node (CommonJS)
  /Cannot find package ['"]([^'"]+)['"]/, //           Node (ESM)
  /can't open file ['"]([^'"]+)['"]/i, //              Python
  /No such file or directory: ['"]([^'"]+)['"]/i, //   Python / POSIX
  /no Go files in (\S+)/, //                           Go
  /MSB1009[^\n]*?([^\s"']+\.(?:sln|csproj|fsproj|vbproj))/i, // MSBuild/.NET
];

function primeiroAlvo(saida: string): string | null {
  for (const p of PADROES_DE_ALVO) {
    const m = p.exec(saida ?? "");
    const alvo = (m?.[1] ?? "").trim();
    if (alvo !== "") return alvo;
  }
  return null;
}

/** Compara caminhos sem depender do separador do sistema nem de barra final. */
function normalizarCaminho(bruto: string): string {
  return bruto.replace(/\\/g, "/").replace(/\/+$/, "");
}

export interface ContextoDeFalha {
  /** O comando já quebrado em argumentos, como foi executado. */
  argv: readonly string[];
  /** stdout + stderr do processo. */
  saida: string;
  /** Exit code numérico, ou o código textual do spawn (`ENOENT`). */
  code: number | string | null;
  /** Sinal que matou o processo (POSIX). */
  signal: string | null;
  /** NOSSO teto de tempo estourou (não o do `execFile`). */
  estourouNossoTeto: boolean;
  /**
   * O caminho existe no disco? É o que separa "critério malformado" de "a tarefa não
   * entregou" — ver `classificarFalha`. Recebe caminho já resolvido contra o projeto.
   */
  existeNoDisco: (caminho: string) => boolean;
}

/**
 * Classifica POR QUE o comando não passou.
 *
 * O CASO DIFÍCIL, e é o que quase fez esta função nascer errada: "não achei o alvo" tem
 * exatamente a mesma cara nos dois cenários opostos.
 *
 * - `node --test tests` → `Cannot find module '.../tests'`: o diretório EXISTE, o runner é
 *   que não sabe consumi-lo naquela forma. **O critério está quebrado** (T-030).
 * - `node --test tests/turno.test.js` → mesma mensagem: o arquivo NÃO existe porque a tarefa
 *   deveria tê-lo criado e não criou. **A tarefa falhou** (é o formato de T-017a/b/c).
 *
 * O discriminador não é a mensagem, é o disco: **alvo que existe e não carrega é ferramenta;
 * alvo que não existe é falha de verdade.** Casar só o nome do argumento — que foi a
 * primeira tentativa — teria transformado toda tarefa que esquece de criar o próprio arquivo
 * de teste num "critério suspeito", e o portão pararia de pegar justamente o defeito comum.
 *
 * Na dúvida, `falha`: errar para o lado de reprovar é o comportamento de hoje e no máximo
 * gasta um ciclo; errar para o lado de não reprovar deixa defeito passar.
 */
export function classificarFalha(ctx: ContextoDeFalha): ClasseFalha {
  // 1. Ambiente que não deixa medir. Vem primeiro porque é inequívoco: nada disso é opinião.
  if (ctx.estourouNossoTeto) return "ambiente";
  if ((ctx.signal ?? "") !== "") return "ambiente";
  if (typeof ctx.code === "number" && ctx.code >= PISO_NTSTATUS_ERRO) return "ambiente";

  const saida = ctx.saida ?? "";
  const bin = (ctx.argv[0] ?? "").toLowerCase().replace(/\.(exe|cmd|bat)$/, "");

  // 2. O binário não existe. `ENOENT` textual vem do spawn, antes de qualquer execução.
  if (ctx.code === "ENOENT") return "ferramenta";
  if (SINAIS_DE_BINARIO_AUSENTE.some((p) => p.test(saida))) return "ferramenta";

  // 3. Exit code de uso indevido, sempre amarrado ao binário que o emitiu.
  if (typeof ctx.code === "number") {
    const universais = CODIGOS_DE_USO_INDEVIDO.get("*");
    const doBinario = CODIGOS_DE_USO_INDEVIDO.get(bin);
    if (universais?.has(ctx.code) === true) return "ferramenta";
    if (doBinario?.has(ctx.code) === true && SINAIS_DE_OPCAO_INVALIDA.some((p) => p.test(saida))) {
      return "ferramenta";
    }
  }
  if (SINAIS_DE_OPCAO_INVALIDA.some((p) => p.test(saida))) return "ferramenta";

  // 4. O alvo nomeado no erro: existe no disco mas não carrega? Então é o comando que está
  //    errado. Só vale quando o alvo é ARGUMENTO do próprio comando — um módulo qualquer que
  //    um teste não conseguiu importar é falha da tarefa, não do critério.
  const alvo = primeiroAlvo(saida);
  if (alvo !== null) {
    const normalizado = normalizarCaminho(alvo);
    const ehArgumento = ctx.argv.slice(1).some((arg) => {
      if (arg.startsWith("-")) return false; // flag não é alvo
      const a = normalizarCaminho(arg);
      return a !== "" && (normalizado === a || normalizado.endsWith(`/${a}`));
    });
    if (ehArgumento && ctx.existeNoDisco(alvo)) return "ferramenta";
  }

  // 5. Recurso esgotado só é consultado AQUI: a mensagem pode aparecer dentro da saída de uma
  //    suíte que rodou inteira e reprovou por outro motivo, e aí quem manda é a reprovação.
  if (SINAIS_DE_AMBIENTE.some((p) => p.test(saida))) return "ambiente";

  return "falha";
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
  /**
   * COMANDO REPETIDO NO LOTE RODA UMA VEZ (T-059).
   *
   * O mesmo comando, no mesmo lote, sobre a mesma árvore, não pode dar resposta diferente —
   * então executar de novo é pagar duas vezes pela mesma informação. Quem paga mais caro é o
   * critério implícito da suíte (`criterioDaSuite`), que vai SEMPRE na frente: uma tarefa que
   * declara `verificar: npm test` roda a suíte inteira duas vezes na mesma passada.
   *
   * E não é caso raro: o exemplo de abertura do template oficial de tarefa era exatamente
   * `- [ ] \`npm test\` roda a suíte inteira. \`verificar: npm test\``, ou seja, a fábrica
   * ENSINAVA a duplicata. (O template foi corrigido junto com esta guarda; a guarda existe
   * porque as tarefas já escritas seguem no disco, e porque doutrina não se aplica
   * retroativamente.)
   *
   * Reaproveitar o veredito é melhor que descartar o critério: o texto do critério pode dizer
   * mais do que o comando (na T-030, o critério 2 era um critério de conteúdo com uma checagem
   * de suíte enxertada), e descartá-lo apagaria a pergunta em vez da duplicata.
   */
  const jaExecutado = new Map<string, ResultadoCriterio>();

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
    // Já rodou neste lote? O veredito é o mesmo, por construção.
    const chave = chaveDeComando(avaliacao.argv);
    const anterior = jaExecutado.get(chave);
    if (anterior !== undefined) {
      saida.push({
        ...anterior,
        texto: c.texto,
        comando: c.comando,
        espelho: true,
      });
      continue;
    }

    const primeira = await rodarUmaVez(avaliacao.argv, dirProjeto, timeout);

    /**
     * RETENTATIVA ÚNICA PARA FALHA DE AMBIENTE (T-055).
     *
     * Regressão real falha as DUAS vezes; crash por contenção normalmente não. A troca é
     * assimétrica em ordens de magnitude: a reexecução custa segundos de CPU e zero token,
     * enquanto uma reprovação falsa custa ~US$ 1,5-3 **mais uma das 3 fichas da tarefa** — e
     * a ficha é o recurso escasso, porque na terceira a tarefa bloqueia.
     *
     * ESTOURO DE TEMPO FICA FORA, e é uma correção deliberada ao plano da fase. O argumento
     * que autoriza retentar ("custa segundos") é verdadeiro para crash, que falha rápido, e
     * FALSO para estouro: ele já consumiu o teto inteiro, então retentar dobra 10 min para 20
     * por critério — na máquina onde a suíte já é o gargalo. Um estouro segue `inconclusivo`,
     * que por si só já é o ganho grande: ele deixou de reprovar a tarefa.
     *
     * `ferramenta` também não se retenta: comando impossível continua impossível.
     */
    const retentar = !primeira.ok && primeira.classe === "ambiente" && !primeira.estourou;
    const r = retentar ? await rodarUmaVez(avaliacao.argv, dirProjeto, timeout) : primeira;
    // Só é verdade quando houve DUAS execuções — é o que permite medir a instabilidade da
    // máquina depois, em vez de esquecê-la.
    const marca = retentar ? { reexecutado: true } : {};

    const resultado: ResultadoCriterio = r.ok
      ? { texto: c.texto, estado: "passou", comando: c.comando, ...marca, saida: cortar(r.stdout) }
      : r.classe === "falha"
        ? { texto: c.texto, estado: "falhou", comando: c.comando, ...marca, saida: cortar(r.bruta) }
        : {
            texto: c.texto,
            estado: "inconclusivo",
            classe: r.classe,
            comando: c.comando,
            ...marca,
            // Inconclusivo: o comando não respondeu à pergunta. Dizer POR QUE na própria saída
            // é o que impede o desperdício de sempre — o construtor gastando um ciclo atrás de
            // um bug que não existe, ou o verificador tomando ruído de máquina por veredito.
            saida: cortar(`${explicacaoDe(r, timeout)}\n\n${r.bruta}`),
          };

    saida.push(resultado);
    jaExecutado.set(chave, resultado);
  }
  return saida;
}

/** Por que o comando não decidiu — texto que vai para a tarefa, lido pelo próximo agente. */
function explicacaoDe(r: Extract<Execucao, { ok: false }>, timeout: number): string {
  if (r.estourou) {
    return (
      `Comando excedeu o teto de ${Math.round(timeout / 1000)}s e a árvore de processos foi` +
      " encerrada. Isso é limite de tempo, não defeito da tarefa."
    );
  }
  if (r.classe === "ferramenta") {
    return (
      "O COMANDO DO CRITÉRIO não conseguiu executar (binário ausente, opção inválida ou alvo" +
      " que existe mas ele não sabe consumir). Isso é defeito do critério, não da entrega —" +
      " nenhum construtor conserta, quem corrige critério é o planejador."
    );
  }
  return (
    "A máquina atrapalhou (processo morto, crash nativo ou recurso esgotado) nas DUAS" +
    " execuções. Não diz nada sobre a entrega."
  );
}

/**
 * Chave de identidade de um comando, para reconhecer repetição dentro do lote (T-059).
 *
 * Compara a lista de argumentos, não a string: `npm  test` e `npm test` são o mesmo comando, e
 * o planejador quebra linha e espaça como quiser. `npm run test` e `npm t` também entram —
 * são alias documentados de `npm test` no próprio gerenciador, e é a variação que de fato
 * aparece nas tarefas. Nada além disso: equivalência SEMÂNTICA (que `npm test` expande para o
 * script `test` do `package.json`, podendo bater com um `node --test` escrito à mão) exigiria
 * ler e interpretar manifesto de cada ecossistema, e chave de deduplicação que erra para o
 * lado de dizer "é o mesmo" faria um critério herdar veredito de outro. Na dúvida, executa.
 */
export function chaveDeComando(argv: readonly string[]): string {
  const partes = argv.filter((a) => a !== "");
  const bin = (partes[0] ?? "").toLowerCase().replace(/\.(exe|cmd|bat)$/, "");
  const resto = partes.slice(1);
  // `<pm> run test` → `<pm> test`; `npm t` → `npm test`.
  if (["npm", "pnpm", "yarn", "bun"].includes(bin)) {
    if (resto[0] === "run" && resto.length === 2) return `${bin} ${resto[1]}`;
    if (resto.length === 1 && resto[0] === "t") return `${bin} test`;
  }
  return [bin, ...resto].join(" ");
}

/** Desfecho de UMA execução do comando. */
type Execucao =
  | { ok: true; stdout: string }
  | { ok: false; classe: ClasseFalha; bruta: string; estourou: boolean };

/**
 * Roda o comando UMA vez e classifica o desfecho. Extraído do laço para a retentativa da
 * T-055 poder chamá-lo de novo sem duplicar nada — inclusive o kill de árvore, que é a parte
 * que não pode divergir entre as duas execuções.
 */
async function rodarUmaVez(
  argv: readonly string[],
  dirProjeto: string,
  timeout: number,
): Promise<Execucao> {
  const [bin, ...args] = argv;
  // O timeout é NOSSO, nunca o do `execFile`. O dele manda um SIGTERM só para o filho
  // DIRETO — que no Windows é o `cmd.exe` do `shell: true` — e deixa `npm`, `node --test`
  // e um processo por arquivo de teste vivos para sempre. Medido no banco-imobiliario:
  // 8 `node.exe` órfãos por estouro, cada um segurando um servidor HTTP + Socket.IO. A
  // suíte roda uma vez por tarefa por ciclo, então uma rodada de `/trabalhar` acumulava
  // dezenas deles até a máquina (7,9 GB) não sustentar mais o painel — que morria sem
  // deixar rastro, levando junto o job em voo. Ver `ci/processo.ts`.
  let estourou = false;
  const chamada = exec(bin as string, args, {
    cwd: dirProjeto,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
    // Windows: `npm` é `npm.cmd` e precisa de shell para resolver. O comando já passou
    // pela allowlist e pela recusa de metacaracteres, então não há o que injetar aqui.
    shell: process.platform === "win32",
  });
  const cronometro = setTimeout(() => {
    estourou = true;
    const pid = chamada.child.pid;
    if (pid !== undefined) encerrarArvore(pid);
  }, timeout);

  try {
    const r = await chamada;
    return { ok: true, stdout: r.stdout };
  } catch (e) {
    const err = e as {
      stdout?: string;
      stderr?: string;
      message?: string;
      code?: number | string;
      signal?: string;
    };
    const bruta = `${err.stdout ?? ""}\n${err.stderr ?? err.message ?? ""}`;
    const classe = classificarFalha({
      argv,
      saida: bruta,
      code: err.code ?? null,
      signal: err.signal ?? null,
      estourouNossoTeto: estourou,
      existeNoDisco: (caminho) =>
        existsSync(isAbsolute(caminho) ? caminho : resolve(dirProjeto, caminho)),
    });
    return { ok: false, classe, bruta, estourou };
  } finally {
    clearTimeout(cronometro);
  }
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
    if (r.estado === "inconclusivo") {
      const porque =
        r.classe === "ferramenta"
          ? "o comando do critério não executou — **o critério é que precisa de conserto**"
          : "a máquina atrapalhou (processo morto, crash nativo ou recurso esgotado)";
      const espelho = r.espelho === true ? " (mesmo comando já avaliado acima)" : "";
      linhas.push(
        `- [inconclusivo] ${r.texto} — \`${r.comando}\` → ${porque}${espelho}. Não reprova a` +
          " tarefa.",
      );
      if (r.espelho !== true && (r.saida ?? "") !== "") {
        linhas.push("", "```", r.saida ?? "", "```", "");
      }
      continue;
    }
    const marca = r.estado === "passou" ? "PASSOU" : "FALHOU";
    // As duas notas mudam como o resultado deve ser LIDO, então não podem ficar de fora:
    // a reexecução é o registro de uma reprovação falsa que a T-055 evitou (sem ela a
    // instabilidade da máquina volta a ser folclore em vez de número), e o espelho avisa que
    // este critério não foi conferido por si — senão o relatório afirmaria duas verificações
    // onde houve uma.
    const notas: string[] = [];
    if (r.reexecutado === true) notas.push("na 2ª execução; a 1ª caiu por ambiente");
    if (r.espelho === true) notas.push("mesmo comando já executado acima; veredito reaproveitado");
    const nota = notas.length > 0 ? ` (${notas.join("; ")})` : "";
    linhas.push(`- [executado] ${r.texto} — \`${r.comando}\` → **${marca}**${nota}`);
    // Saída só na PRIMEIRA aparição do comando: repetir a mesma parede de texto por critério
    // espelhado é o que fazia o relatório deixar de ser lido.
    if (r.estado === "falhou" && r.espelho !== true && (r.saida ?? "") !== "") {
      linhas.push("", "```", r.saida ?? "", "```", "");
    }
  }

  const executados = resultados.filter(
    (r) => r.estado === "passou" || r.estado === "falhou",
  ).length;
  const inconclusivos = resultados.filter((r) => r.estado === "inconclusivo").length;
  const julgados = resultados.length - executados - inconclusivos;
  const partes = [`${executados} executado(s)`, `${julgados} para julgamento`];
  // O inconclusivo só aparece quando existe: linha de relatório que diz "0 de alguma coisa"
  // em toda rodada saudável vira ruído e para de ser lida justamente quando importa.
  if (inconclusivos > 0) partes.push(`${inconclusivos} INCONCLUSIVO(s)`);
  linhas.push("", `Graus de prova: ${partes.join(", ")} (de ${resultados.length}).`);
  return linhas.join("\n");
}

/**
 * Algum critério com comando falhou DE VERDADE? Aí não vale gastar verificador — devolva ao
 * construtor.
 *
 * `inconclusivo` de propósito não conta: devolver a tarefa porque o comando não roda é o
 * laço que custou US$ 12,90 na T-030. Ele não aprova nada — segue para o verificador julgar,
 * e quando a classe é `ferramenta` o relatório da rodada pede correção do critério.
 */
export function reprovouNaMecanica(resultados: readonly ResultadoCriterio[]): boolean {
  return resultados.some((r) => r.estado === "falhou");
}

/**
 * Critérios cujo COMANDO está quebrado. É o que o motor precisa levar ao relatório da rodada:
 * nenhum despacho de construtor conserta isso, e sem alguém dizer em voz alta a tarefa
 * silenciosamente queima as 3 tentativas até bloquear.
 */
export function criteriosComFerramentaQuebrada(
  resultados: readonly ResultadoCriterio[],
): ResultadoCriterio[] {
  return resultados.filter(
    // Espelho fora: é o MESMO comando quebrado, e pedir a correção dele duas vezes só torna o
    // relatório mais fácil de ignorar.
    (r) => r.estado === "inconclusivo" && r.classe === "ferramenta" && r.espelho !== true,
  );
}

/**
 * Quantos comandos precisaram de uma segunda execução por falha de ambiente (T-055).
 *
 * É o termômetro da máquina. Cada unidade aqui é, no melhor caso, uma reprovação falsa que
 * não aconteceu — e a soma ao longo das rodadas é o dado que a T-061 precisa para dizer se a
 * instabilidade está melhorando ou piorando, em vez de se discutir por impressão.
 */
export function reexecucoesPorAmbiente(resultados: readonly ResultadoCriterio[]): number {
  // Espelho fora, e este é o detalhe que faz a conta valer: o critério espelhado HERDA o
  // `reexecutado` do original (é o mesmo resultado copiado), e contá-lo mediria o número de
  // critérios afetados em vez de execuções perdidas — inflando o termômetro da máquina
  // justamente onde ele vai ser usado para decidir se a instabilidade melhorou.
  return resultados.filter((r) => r.reexecutado === true && r.espelho !== true).length;
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
