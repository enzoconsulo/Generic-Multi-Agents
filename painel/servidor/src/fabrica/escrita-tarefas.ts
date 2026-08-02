import { readFile, writeFile } from "node:fs/promises";

/**
 * Escrita cirúrgica no arquivo de uma tarefa.
 *
 * ISTO É UMA EXCEÇÃO DELIBERADA À REGRA DA CASA. O `CLAUDE.md` do painel diz: *"O painel
 * NUNCA escreve status de tarefa/projeto: quem escreve nos arquivos da fábrica são os
 * fluxos Claude disparados"*, com uma lista curta de exceções (`ANALISE.md`, `ci.json`,
 * `equipe.json`, importação). O motor do pipeline entra nessa lista, e o motivo é a própria
 * I3: **promover uma tarefa cujas dependências fecharam e bloquear uma que esgotou os
 * ciclos são regras escritas, não julgamento.** Enquanto um modelo fazia isso, custava
 * US$ 1,29 por job e errava de formas que código não erra.
 *
 * O que continua sendo dos agentes, e não muda: `em-execucao`, `em-teste`, `em-revisao`,
 * `concluida`, `tentativas`, e todo o corpo da tarefa. O motor só toca em `pronta`
 * (promoção) e `bloqueada` (esgotamento) — os dois pontos que a máquina de estados decide.
 *
 * REGRA DE IMPLEMENTAÇÃO: substituição por LINHA, nunca parse-e-reserializa. Reserializar
 * o frontmatter com `gray-matter` reescreveria aspas, ordem de chaves e formatação do
 * arquivo inteiro — o diff da tarefa viraria ruído e a revisão humana ficaria inútil. Aqui
 * o arquivo sai idêntico exceto pelas duas linhas que mudaram.
 */

/** Fim de linha do arquivo — preservado (o repo vive em Windows e faz checkout CRLF). */
function quebra(texto: string): string {
  return texto.includes("\r\n") ? "\r\n" : "\n";
}

/** Limites do bloco de frontmatter (`---` na 1ª linha até o próximo `---`). */
function limitesFrontmatter(linhas: string[]): { inicio: number; fim: number } | null {
  if (linhas[0]?.trim() !== "---") return null;
  for (let i = 1; i < linhas.length; i++) {
    if (linhas[i]?.trim() === "---") return { inicio: 1, fim: i };
  }
  return null;
}

export type ResultadoEscrita =
  | { ok: true; de: string; para: string }
  | { ok: false; motivo: string };

/**
 * Troca o `status:` de uma tarefa e atualiza `atualizada:` para hoje.
 *
 * Nunca lança: um arquivo torto não pode derrubar o pipeline inteiro no meio — ele vira
 * `{ ok: false }` e o motor registra e segue, que é a mesma disciplina do leitor
 * (`fabrica/tarefas.ts` nunca quebra o scan por arquivo malformado).
 */
export async function gravarStatusTarefa(
  arquivo: string,
  novoStatus: string,
  hoje = new Date().toISOString().slice(0, 10),
): Promise<ResultadoEscrita> {
  let texto: string;
  try {
    texto = await readFile(arquivo, "utf8");
  } catch (e) {
    return { ok: false, motivo: `não foi possível ler: ${(e as Error).message}` };
  }

  const nl = quebra(texto);
  const linhas = texto.split(/\r?\n/);
  const limites = limitesFrontmatter(linhas);
  if (limites === null) return { ok: false, motivo: "arquivo sem frontmatter delimitado por ---" };

  let anterior: string | null = null;
  let achouAtualizada = false;

  for (let i = limites.inicio; i < limites.fim; i++) {
    const linha = linhas[i] ?? "";
    const mStatus = /^(\s*status\s*:\s*)(.*)$/.exec(linha);
    if (mStatus !== null && anterior === null) {
      anterior = (mStatus[2] ?? "").trim();
      linhas[i] = `${mStatus[1]}${novoStatus}`;
      continue;
    }
    const mAtual = /^(\s*atualizada\s*:\s*)(.*)$/.exec(linha);
    if (mAtual !== null && !achouAtualizada) {
      achouAtualizada = true;
      linhas[i] = `${mAtual[1]}${hoje}`;
    }
  }

  if (anterior === null) return { ok: false, motivo: "frontmatter sem campo `status`" };
  // Mesmo status: não reescreve. Evita commit de ruído e mantém `atualizada` honesta.
  if (anterior === novoStatus) return { ok: true, de: anterior, para: novoStatus };

  try {
    await writeFile(arquivo, linhas.join(nl), "utf8");
  } catch (e) {
    return { ok: false, motivo: `não foi possível gravar: ${(e as Error).message}` };
  }
  return { ok: true, de: anterior, para: novoStatus };
}

/**
 * Anexa texto ao fim de uma seção do corpo (`## Verificação`, `## Notas de execução`…).
 *
 * Usado pela passada mecânica de critérios, que precisa deixar a prova no arquivo ANTES de
 * o verificador ser despachado — é assim que ele sabe o que não precisa refazer. Se a
 * seção não existir, ela é criada no fim: perder o relatório em silêncio seria pior que um
 * título fora de ordem.
 */
export async function anexarNaSecao(
  arquivo: string,
  titulo: string,
  texto: string,
): Promise<ResultadoEscrita> {
  if ((texto ?? "").trim() === "") return { ok: true, de: titulo, para: "(vazio, nada a fazer)" };

  let original: string;
  try {
    original = await readFile(arquivo, "utf8");
  } catch (e) {
    return { ok: false, motivo: `não foi possível ler: ${(e as Error).message}` };
  }

  const nl = quebra(original);
  const linhas = original.split(/\r?\n/);
  const alvo = `## ${titulo}`.toLowerCase();

  let inicio = -1;
  for (let i = 0; i < linhas.length; i++) {
    if ((linhas[i] ?? "").trim().toLowerCase() === alvo) {
      inicio = i;
      break;
    }
  }

  const bloco = texto.trim().split("\n");
  if (inicio === -1) {
    linhas.push("", `## ${titulo}`, "", ...bloco, "");
  } else {
    // Fim da seção = próximo `## ` no mesmo nível, ou fim do arquivo.
    let fim = linhas.length;
    for (let i = inicio + 1; i < linhas.length; i++) {
      if (/^##\s/.test(linhas[i] ?? "")) {
        fim = i;
        break;
      }
    }
    // Recua sobre as linhas em branco do fim da seção, para o texto não nascer solto.
    let corte = fim;
    while (corte > inicio + 1 && (linhas[corte - 1] ?? "").trim() === "") corte--;
    linhas.splice(corte, 0, "", ...bloco, "");
  }

  try {
    await writeFile(arquivo, linhas.join(nl), "utf8");
  } catch (e) {
    return { ok: false, motivo: `não foi possível gravar: ${(e as Error).message}` };
  }
  return { ok: true, de: titulo, para: `+${bloco.length} linha(s)` };
}
