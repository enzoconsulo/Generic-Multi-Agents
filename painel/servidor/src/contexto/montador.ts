import { readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, normalize, sep, isAbsolute } from "node:path";

const exec = promisify(execFile);

/**
 * Montador de contexto — decide O QUE cada agente recebe, em vez de deixar cada um
 * descobrir o projeto sozinho.
 *
 * POR QUE EXISTE (medido; ver `_sistema/CUSTO_DE_CONTEXTO.md`). 80-90% da conta de cada job
 * é contexto, não produção, e a maior parte disso é agente varrendo o projeto para se
 * orientar: no job `f72534e8`, 20 dos 34 `Read` do agente `servidor` foram só para
 * descobrir o que existe. Cada arquivo lido é pago em ESCRITA de cache (17,5× a leitura) e
 * depois RELIDO a cada volta de API.
 *
 * O ponto que torna isto determinístico — e não um palpite: **a tarefa já declara o que vai
 * tocar**, no campo `areas` do frontmatter, escrito pelo planejador. Então o par
 * (papel do agente, tarefa) basta para montar o contexto certo sem nenhuma chamada de
 * modelo. O que o montador não previu, o agente lê com `Read` — **degrada, não quebra**, e
 * é por isso que ser incompleto aqui é seguro e ser genérico é possível.
 *
 * DOIS BLOCOS, e a divisão é o que dá o ganho de cache (I2):
 *
 * - `compartilhado` — **byte-idêntico entre todos os despachos do mesmo projeto**. É o que
 *   pode ser escrito no cache UMA vez e lido por todos os agentes seguintes a 0,1× do
 *   preço. Nada volátil pode entrar aqui: data, hash, contagem ou caminho absoluto zeram o
 *   ganho sem avisar (por isso `semCabecalhoVolatil`).
 * - `especifico` — o que muda por agente e por tarefa. Vai depois da fronteira de cache.
 *
 * REGRA DE OURO, herdada da medição: **denso ou nada.** Bloco grande no contexto é EMPATE
 * (economiza escrita e devolve o mesmo em leitura, porque é relido a cada volta). Só
 * compensa o que substitui mais do que ocupa — MAPA e diff sim, despejo de código-fonte
 * não. `TETO_ESPECIFICO_BYTES` existe para essa regra não depender de ninguém lembrar dela.
 */

/**
 * Papel no pipeline. É ele — e não o nome do agente — que decide o contexto, porque a
 * fábrica tem duas trilhas com nomes diferentes para o mesmo papel e especialistas com
 * nomes cunhados por projeto.
 */
export type PapelAgente =
  | "construtor"
  | "verificador"
  | "revisor"
  | "planejador"
  /** Verifica a META de uma FASE de ponta a ponta, não uma tarefa. Ver `pipeline/marco.ts`. */
  | "marco"
  /** Atualiza README/CLAUDE.md/PROGRESSO depois de um lote de tarefas. */
  | "documentador";

/** Nomes fixos das duas trilhas. Qualquer outro nome é especialista, logo construtor. */
const PAPEL_POR_NOME: Readonly<Record<string, PapelAgente>> = {
  executor: "construtor",
  construtor: "construtor",
  testador: "verificador",
  conferente: "verificador",
  revisor: "revisor",
  "revisor-generico": "revisor",
  planejador: "planejador",
  "planejador-generico": "planejador",
  documentador: "documentador",
  pesquisador: "planejador",
};

/** Sufixo das variantes reforçadas — não muda o papel, só o modelo. */
const SUFIXO_REFORCO = "-reforcado";
/** Separador do nome qualificado `<projeto>__<id>` (ver `agentes-dinamicos.ts`). */
const SEPARADOR_PROJETO = "__";

/**
 * Papel de um agente pelo nome, tolerante às duas formas que o despacho produz: o sufixo
 * `-reforcado` (retrabalho) e o prefixo `<projeto>__` (colisão de id entre projetos).
 * Nome desconhecido é **construtor** de propósito: é o papel que recebe MAIS contexto, e
 * errar para menos deixaria um especialista sem o que precisa para trabalhar.
 */
export function papelDoAgente(nome: string): PapelAgente {
  let n = (nome ?? "").trim();
  const corte = n.indexOf(SEPARADOR_PROJETO);
  if (corte !== -1) n = n.slice(corte + SEPARADOR_PROJETO.length);
  if (n.endsWith(SUFIXO_REFORCO)) n = n.slice(0, -SUFIXO_REFORCO.length);
  return PAPEL_POR_NOME[n] ?? "construtor";
}

/** Medição do que foi montado — vai para o log e para a UI. */
export interface MedidaContexto {
  compartilhadoTok: number;
  especificoTok: number;
  /** Caminhos (relativos ao projeto) efetivamente embutidos no bloco específico. */
  arquivosIncluidos: string[];
  /** O que foi pedido e ficou de fora, com o motivo. Vazio é o normal. */
  omitidos: { caminho: string; motivo: string }[];
}

export interface BlocosContexto {
  compartilhado: string;
  especifico: string;
  medida: MedidaContexto;
}

/**
 * Teto do bloco específico. Estourou: os arquivos restantes viram MENÇÃO (caminho + motivo)
 * em vez de conteúdo, e o agente decide se abre.
 *
 * O número sai da conta da seção 3 de `CUSTO_DE_CONTEXTO.md`: embutir conteúdo que o agente
 * NÃO vai usar é pior que não embutir, porque ele é relido a cada volta. 60 kB ≈ 15k tokens
 * é o ponto em que embutir ainda ganha da varredura (~20 chamadas com contexto cheio).
 */
export const TETO_ESPECIFICO_BYTES = 60 * 1024;

/** Aproximação de tokens usada em toda a fábrica (bytes/4). Serve para ordem de grandeza. */
export function aproxTokens(texto: string): number {
  return Math.round(Buffer.byteLength(texto, "utf8") / 4);
}

/**
 * Remove do MAPA o comentário de geração, que carrega hash do HEAD e data.
 *
 * É o detalhe que decide o ganho de cache inteiro: o bloco compartilhado tem de ser
 * byte-idêntico entre despachos, e esse cabeçalho muda a cada commit. Deixá-lo passar não
 * quebra nada visível — só faz o cache nunca casar, silenciosamente, que é a pior forma de
 * falhar. (O MAPA no disco mantém o cabeçalho: lá ele serve para o humano saber se está
 * velho.)
 */
export function semCabecalhoVolatil(mapa: string): string {
  return mapa.replace(/^<!--\s*GERADO por[\s\S]*?-->\s*/m, "").trimStart();
}

/** Lê um arquivo do projeto; ausente devolve null em vez de lançar. */
async function lerOpcional(caminho: string): Promise<string | null> {
  try {
    return await readFile(caminho, "utf8");
  } catch {
    return null;
  }
}

/**
 * Resolve um caminho declarado em `areas` DENTRO do projeto.
 *
 * `areas` é escrito por um modelo (o planejador), então é entrada não confiável: `..`,
 * caminho absoluto ou barra invertida não podem virar leitura fora do projeto. Mesma
 * família do `dirProjeto` de `analise.ts` e da validação de hash em `git.ts` — argumento
 * não validado vira travessia.
 */
export function resolverArea(dirProjeto: string, area: string): string | null {
  const bruto = (area ?? "").trim();
  if (bruto === "" || isAbsolute(bruto) || /^[a-zA-Z]:/.test(bruto)) return null;
  const rel = normalize(bruto.replace(/\\/g, "/"));
  if (rel === ".." || rel.startsWith(`..${sep}`) || rel.startsWith("../")) return null;
  return join(dirProjeto, rel);
}

const HASH_VALIDO = /^[0-9a-f]{7,40}$/i;

/**
 * Diff de um commit, para o revisor. `null` quando o hash é inválido, o commit não existe
 * ou o diff é grande demais para caber no bloco.
 *
 * `execFile` com array de argumentos (nunca shell) e hash validado como hexadecimal: um
 * valor como `--upload-pack=…` seria lido como FLAG pelo git.
 */
export async function lerDiff(
  dirRepo: string,
  hash: string,
  tetoBytes = TETO_ESPECIFICO_BYTES,
): Promise<string | null> {
  if (!HASH_VALIDO.test(hash ?? "")) return null;
  try {
    const { stdout } = await exec("git", ["show", "--patch", "--format=%s%n%n%b", hash], {
      cwd: dirRepo,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    if (Buffer.byteLength(stdout, "utf8") > tetoBytes) return null;
    return stdout;
  } catch {
    return null;
  }
}

/** Entrada do montador: tudo que ele precisa saber, e nada de I/O do chamador. */
export interface PedidoContexto {
  dirProjeto: string;
  /**
   * Raiz da fábrica — só para ler `_sistema/FERRAMENTAS.md`. Opcional: ausente, o bloco sai
   * sem o inventário em vez de falhar (é o que os testes de fixture fazem).
   */
  raizFabrica?: string | undefined;
  papel: PapelAgente;
  /** `areas` do frontmatter da tarefa. Vazio = o montador não embute fonte nenhuma. */
  areas?: readonly string[];
  /** Hash do commit de entrega — só o revisor usa. */
  hashCommit?: string | null;
  /** Teto do bloco específico; existe para o teste não depender do valor de produção. */
  tetoBytes?: number;
}

/**
 * Bloco COMPARTILHADO de um projeto: ferramental da fábrica + `CLAUDE.md` + MAPA (sem o
 * cabeçalho volátil).
 *
 * Idêntico para todo agente do projeto — é o que o cache pode reaproveitar. Se algum dos três
 * não existir, o bloco sai menor em vez de falhar: projeto recém-criado ou importado à mão
 * é caso legítimo (ver "armadilhas" do painel: `_gestao/` pode não existir).
 *
 * O INVENTÁRIO VEM PRIMEIRO, e a ordem é deliberada: `_sistema/FERRAMENTAS.md` é o único
 * pedaço idêntico entre PROJETOS diferentes, então pô-lo na frente faz o prefixo de cache
 * ser compartilhado por toda a fábrica, e não só pelos despachos de um projeto.
 *
 * POR QUE ele é injetado em vez de ficar só nos prompts dos agentes: um agente que não sabe
 * que a ferramenta existe não a procura. Três reincidências medidas — T-026 (executor declarou
 * "não há navegador disponível neste ambiente" e pulou a evidência; o revisor teve de apontar
 * que `captura.mjs` existia), T-036 ciclo 1 (script descartável com `spawnSync` dentro do
 * próprio servidor: 0 entrega) e T-036 ciclo 2 (o testador **instalou o puppeteer**). Nenhuma
 * delas é desobediência: em nenhum dos três casos o inventário estava no contexto do agente.
 */
export async function montarCompartilhado(
  dirProjeto: string,
  raizFabrica?: string,
): Promise<string> {
  const [ferramental, mapa, claude] = await Promise.all([
    raizFabrica === undefined
      ? Promise.resolve(null)
      : lerOpcional(join(raizFabrica, "_sistema", "FERRAMENTAS.md")),
    lerOpcional(join(dirProjeto, "_gestao", "MAPA.md")),
    lerOpcional(join(dirProjeto, "CLAUDE.md")),
  ]);

  const partes: string[] = [];
  if (ferramental !== null) {
    partes.push(
      "<ferramental-da-fabrica>",
      "O que você JÁ TEM. Consulte ANTES de escrever script auxiliar, instalar dependência",
      "ou declarar que algo não é possível neste ambiente.",
      "",
      ferramental.trim(),
      "</ferramental-da-fabrica>",
      "",
    );
  }
  if (claude !== null) {
    partes.push("<contexto-projeto>", claude.trim(), "</contexto-projeto>");
  }
  if (mapa !== null) {
    partes.push(
      "",
      "<mapa-do-projeto>",
      "Índice do projeto: o que existe, onde, e a assinatura de cada símbolo público.",
      "Use-o em vez de varrer o código — abrir arquivo para descobrir o que já está aqui é",
      "o desperdício nº 1 medido nesta fábrica.",
      "",
      semCabecalhoVolatil(mapa).trim(),
      "</mapa-do-projeto>",
    );
  }
  return partes.join("\n");
}

/** Rótulo humano de cada papel, para o cabeçalho do bloco específico. */
const INTENCAO: Readonly<Record<PapelAgente, string>> = {
  construtor: "Os arquivos que a tarefa declarou em `areas` vão abaixo, já lidos.",
  verificador:
    "Você verifica EXECUTANDO. Os arquivos de `areas` vão abaixo só para você localizar o" +
    " que os critérios citam — não para revisar código.",
  revisor:
    "Seu objeto de trabalho é o diff abaixo, não o projeto. Abra arquivo só quando o diff" +
    " sozinho não permitir decidir se há defeito.",
  planejador: "Nenhum fonte embutido: seu trabalho é sobre a especificação, não sobre o código.",
  marco:
    "Você verifica a META DA FASE de ponta a ponta, no software real — não uma tarefa. Use o" +
    " MAPA para se situar e rode o projeto; nenhum fonte vai embutido de propósito.",
  documentador:
    "Nenhum fonte embutido: o MAPA acima já diz o que existe e com que assinatura, que é o" +
    " que a documentação precisa refletir. Abra só o que for descrever em detalhe.",
};

/**
 * Bloco ESPECÍFICO: o que este papel precisa para ESTA tarefa.
 *
 * Regra por papel — é aqui que mora a economia da I4:
 * - `construtor` recebe o conteúdo das `areas` (é o que ele vai editar);
 * - `verificador` idem, para localizar o que os critérios citam (ele verifica executando);
 * - `revisor` recebe o DIFF e **nenhum fonte** — reconstruir o projeto a cada revisão era
 *   gasto puro;
 * - `planejador` não recebe fonte nenhum.
 */
export async function montarEspecifico(pedido: PedidoContexto): Promise<{
  texto: string;
  medida: Omit<MedidaContexto, "compartilhadoTok" | "especificoTok">;
}> {
  const teto = pedido.tetoBytes ?? TETO_ESPECIFICO_BYTES;
  const incluidos: string[] = [];
  const omitidos: { caminho: string; motivo: string }[] = [];
  const partes: string[] = ["<contexto-da-tarefa>", INTENCAO[pedido.papel]];

  if (pedido.papel === "revisor") {
    const hash = pedido.hashCommit ?? "";
    const diff = hash === "" ? null : await lerDiff(pedido.dirProjeto, hash, teto);
    if (diff !== null) {
      partes.push("", `<diff commit=\"${hash}\">`, diff.trimEnd(), "</diff>");
      incluidos.push(`git show ${hash}`);
    } else if (hash === "") {
      omitidos.push({ caminho: "(diff)", motivo: "tarefa sem hash de commit registrado" });
    } else {
      omitidos.push({
        caminho: `git show ${hash}`,
        motivo: "diff ausente, hash inválido ou maior que o teto — rode `git show` você mesmo",
      });
    }
  } else if (
    pedido.papel !== "planejador" &&
    pedido.papel !== "marco" &&
    pedido.papel !== "documentador"
  ) {
    let usados = 0;
    for (const area of pedido.areas ?? []) {
      const caminho = resolverArea(pedido.dirProjeto, area);
      if (caminho === null) {
        omitidos.push({ caminho: area, motivo: "caminho fora do projeto — ignorado" });
        continue;
      }
      const conteudo = await lerOpcional(caminho);
      if (conteudo === null) {
        // DIRETÓRIO NÃO É ARQUIVO, e confundir os dois mentia para o agente (23/08). A T-059
        // do banco-imobiliario declarou `areas: [public/css, public/js]`; `lerOpcional`
        // devolveu `null` para os dois e o montador anunciou "ainda não existe (será criado
        // por esta tarefa)" — sobre pastas com dezenas de arquivos. O agente foi ao trabalho
        // com ZERO arquivo embutido, achando que partia do nada, e a tarefa custou dois
        // ciclos e um `opus`.
        //
        // Não expandimos a pasta: embutir um diretório inteiro estoura o teto do bloco e
        // desfaz o motivo de o montador existir. O conserto é dizer a VERDADE — e nomear o
        // defeito onde ele mora, que é o `areas` da tarefa (campo do planejador).
        let ehPasta = false;
        try {
          ehPasta = (await stat(caminho)).isDirectory();
        } catch {
          ehPasta = false;
        }
        omitidos.push({
          caminho: area,
          motivo: ehPasta
            ? "é um DIRETÓRIO, não um arquivo — `areas` deve declarar arquivos, um por linha;" +
              " nada foi embutido, localize com Glob/Grep antes de editar"
            : "ainda não existe (será criado por esta tarefa)",
        });
        continue;
      }
      const tamanho = Buffer.byteLength(conteudo, "utf8");
      if (usados + tamanho > teto) {
        omitidos.push({ caminho: area, motivo: "estouraria o teto do bloco — leia com Read" });
        continue;
      }
      usados += tamanho;
      incluidos.push(area);
      partes.push("", `<arquivo caminho=\"${area}\">`, conteudo.trimEnd(), "</arquivo>");
    }
  }

  if (omitidos.length > 0) {
    partes.push(
      "",
      "<nao-embutido>",
      ...omitidos.map((o) => `- ${o.caminho} — ${o.motivo}`),
      "</nao-embutido>",
    );
  }
  partes.push("</contexto-da-tarefa>");
  return { texto: partes.join("\n"), medida: { arquivosIncluidos: incluidos, omitidos } };
}

/** Monta os dois blocos de uma vez, já medidos. */
export async function montarContexto(pedido: PedidoContexto): Promise<BlocosContexto> {
  const [compartilhado, esp] = await Promise.all([
    montarCompartilhado(pedido.dirProjeto, pedido.raizFabrica),
    montarEspecifico(pedido),
  ]);
  return {
    compartilhado,
    especifico: esp.texto,
    medida: {
      compartilhadoTok: aproxTokens(compartilhado),
      especificoTok: aproxTokens(esp.texto),
      ...esp.medida,
    },
  };
}
