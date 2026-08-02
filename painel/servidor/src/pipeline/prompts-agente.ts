import { readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";

/**
 * Carrega o prompt de um agente da fábrica a partir de `.claude/agents/<nome>.md`.
 *
 * É a peça que torna o pipeline em código possível. Hoje o painel injeta agentes e um
 * MODELO decide quando despachá-los; aqui o painel **lê o prompt do agente e o usa numa
 * `query()` própria**. Some o intermediário: a etapa não é "peça ao orquestrador que chame
 * o executor", é "rode o executor". Consequências que valem mais que a economia:
 *
 * - **não existe despacho para esquecer de esperar.** O bug que destruiu trabalho duas
 *   vezes (30/07 e 01/08) era um modelo encerrando o turno com agente em voo. Aqui quem
 *   chama é `await query(...)`: não há como não esperar;
 * - o painel escolhe modelo, ferramentas e contexto de cada etapa, que é o que a I2 e a I4
 *   precisavam e não conseguiam com o despacho no modelo;
 * - o roteamento vira auditável: sai no log qual arquivo virou qual etapa.
 *
 * A fonte continua sendo o MESMO arquivo que o chat interativo usa. Não há prompt duplicado
 * — mudar `executor.md` muda os dois caminhos, que é a única forma de isto não divergir.
 */

/** Um agente pronto para virar uma `query()`. */
export interface AgenteCarregado {
  nome: string;
  /** Corpo do arquivo (sem o frontmatter). */
  prompt: string;
  /** `tools` do frontmatter; `null` quando o arquivo não declara (herda todas). */
  tools: string[] | null;
  /** `model` do frontmatter; `null` para `inherit` ou ausente. */
  modelo: string | null;
}

/**
 * Cache por caminho. Os arquivos de agente não mudam durante um job, e reler 10 kB a cada
 * etapa é I/O gratuito num repositório que vive sob OneDrive (lento e intermitente — já
 * causou EBUSY e timeouts em cascata nesta base).
 */
const cache = new Map<string, AgenteCarregado | null>();

/** Esvazia o cache. Usado nos testes, que criam fábricas falsas em pastas temporárias. */
export function limparCacheAgentes(): void {
  cache.clear();
}

/** Nome de agente é usado para montar caminho: barrar travessia antes de tocar o disco. */
function nomeSeguro(nome: string): string | null {
  const n = (nome ?? "").trim();
  return /^[a-zA-Z0-9_-]+$/.test(n) ? n : null;
}

/**
 * Lê `<raizFabrica>/.claude/agents/<nome>.md`. Devolve `null` quando não existe — o
 * chamador decide o que fazer (tipicamente: é um especialista de `equipe.json`, que não
 * tem arquivo).
 */
export async function carregarAgente(
  raizFabrica: string,
  nome: string,
): Promise<AgenteCarregado | null> {
  const seguro = nomeSeguro(nome);
  if (seguro === null) return null;

  const caminho = join(raizFabrica, ".claude", "agents", `${seguro}.md`);
  const emCache = cache.get(caminho);
  if (emCache !== undefined) return emCache;

  let texto: string;
  try {
    texto = await readFile(caminho, "utf8");
  } catch {
    cache.set(caminho, null);
    return null;
  }

  // `matter(texto, {})` com o objeto de options SEMPRE: sem ele a lib cacheia ANTES do
  // parse, e um YAML inválido faz as chamadas seguintes com o mesmo conteúdo retornarem
  // "sucesso" com `data` vazio. Armadilha registrada no CLAUDE.md do painel.
  const { data, content } = matter(texto, {});
  const toolsBruto = data["tools"];
  const modeloBruto = data["model"];

  const carregado: AgenteCarregado = {
    nome: seguro,
    prompt: content.trim(),
    tools:
      typeof toolsBruto === "string" && toolsBruto.trim() !== ""
        ? toolsBruto.split(",").map((t) => t.trim()).filter((t) => t !== "")
        : Array.isArray(toolsBruto)
          ? toolsBruto.map(String)
          : null,
    // `inherit` é o valor que a fábrica usa para "o modelo do disparo" — vira null aqui,
    // e quem monta a query decide. Tratar a string literal como nome de modelo mandaria
    // "inherit" ao SDK, que é o tipo de erro que passa e some.
    modelo:
      typeof modeloBruto === "string" && modeloBruto.trim() !== "" && modeloBruto !== "inherit"
        ? modeloBruto.trim()
        : null,
  };
  cache.set(caminho, carregado);
  return carregado;
}

/**
 * Ferramentas de TODOS os agentes do pipeline, unidas.
 *
 * Por que unir em vez de respeitar a lista de cada um: as definições de ferramenta vêm
 * ANTES do systemPrompt na chave de cache, então lista divergente entre etapas impede
 * qualquer reaproveitamento do que vem depois — e o bloco custa ~12k tokens reescritos a
 * cada etapa (`_sistema/CUSTO_DE_CONTEXTO.md`, I2).
 *
 * O que se perde: o `revisor` deixa de ser impedido de escrever POR FERRAMENTA. A
 * disciplina dele continua no prompt ("Não corrige código"), e o portão real é outro — ele
 * não commita, e o que ele escrevesse apareceria no diff da tarefa seguinte. Trocar uma
 * guarda fraca por 12k tokens por etapa é o negócio certo; trocá-la em silêncio não seria,
 * por isso está escrito aqui.
 */
export const FERRAMENTAS_PIPELINE: readonly string[] = [
  "Read",
  "Glob",
  "Grep",
  "Edit",
  "Write",
  "NotebookEdit",
  "Bash",
  "PowerShell",
  "WebSearch",
  "WebFetch",
];
