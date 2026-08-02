import { readFile, writeFile } from "node:fs/promises";
import type { FasePlano, Plano, TarefaResumo } from "../fabrica/tipos.js";

/**
 * Marco de fase — detecção, veredito e registro.
 *
 * É a segunda coisa que o orquestrador-modelo fazia e que ninguém passou a fazer quando o
 * laço virou código: ao concluir a última tarefa de uma fase do `PLANO.md`, despachar o
 * verificador em modo marco (exercitar a META da fase de ponta a ponta, não uma tarefa) e
 * registrar o resultado na linha `Marco:`.
 *
 * A divisão de trabalho é a mesma do resto do pipeline: **detectar e registrar é código**
 * (contar tarefas de uma fase e escrever uma linha não é julgamento); **o veredito é do
 * modelo** — só quem roda o software de verdade pode dizer se a meta foi atingida.
 *
 * Sem isto, uma fase fechava e ninguém verificava a meta: as tarefas passavam nos próprios
 * critérios e a pergunta "o conjunto delas faz o que a fase prometia?" ficava sem dono. É
 * justamente o tipo de buraco que só aparece quando o projeto já está montado errado.
 */

/** Uma fase pronta para ter o marco verificado. */
export interface FaseParaMarco {
  fase: FasePlano;
  /** Tarefas da fase, todas `concluida`. */
  tarefas: string[];
}

/**
 * Fases cujas tarefas estão TODAS concluídas e cujo marco ainda está `pendente`.
 *
 * Fase sem linha `Marco:` (o parser devolve `null`) fica de fora: é defeito do PLANO.md, e
 * inventar um marco onde o plano não pediu seria pior que não verificar. Fase já
 * `aprovado` não repete — o registro é o que diz às próximas sessões que já rodou.
 *
 * Fase `reprovado` também fica de fora: ela continua em andamento e o que destrava é a
 * correção (tarefa nova), não uma nova verificação do mesmo estado.
 */
export function fasesProntasParaMarco(
  plano: Plano | null,
  tarefas: readonly TarefaResumo[],
): FaseParaMarco[] {
  if (plano === null) return [];
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  const prontas: FaseParaMarco[] = [];

  for (const fase of plano.fases) {
    if (fase.marco === null || fase.marco.estado !== "pendente") continue;
    if (fase.tarefas.length === 0) continue;

    // Toda tarefa da fase precisa existir E estar concluída. Tarefa citada no plano que
    // não tem arquivo é erro de planejamento (já denunciado na promoção); aqui ela
    // simplesmente impede o marco, que é o comportamento seguro.
    const todas = fase.tarefas.every((id) => porId.get(id)?.status === "concluida");
    if (todas) prontas.push({ fase, tarefas: [...fase.tarefas] });
  }
  return prontas;
}

export type VeredictoMarco = "aprovado" | "reprovado" | "indefinido";

/**
 * Lê o veredito do texto final do agente.
 *
 * O despacho pede uma linha `MARCO: aprovado` / `MARCO: reprovado`, e é ela que vale — um
 * contrato explícito, não adivinhação sobre prosa. A busca por APROVADO/REPROVADO solto é
 * só reserva, e usa a ÚLTIMA ocorrência porque o relatório costuma citar as duas palavras
 * ("...não foi REPROVADO por isso, e o marco está APROVADO").
 *
 * `indefinido` quando nada casa — e aí o motor NÃO escreve nada no PLANO.md. Registrar
 * "aprovado" por não ter entendido a resposta seria a pior falha possível aqui.
 */
export function lerVeredicto(texto: string): VeredictoMarco {
  const t = texto ?? "";
  const linha = [...t.matchAll(/^\s*MARCO:\s*(aprovado|reprovado)\s*$/gim)].pop();
  if (linha !== undefined) return (linha[1] ?? "").toLowerCase() as VeredictoMarco;

  const solto = [...t.matchAll(/\b(APROVADO|REPROVADO)\b/g)].pop();
  if (solto !== undefined) return (solto[1] ?? "").toLowerCase() as VeredictoMarco;
  return "indefinido";
}

/** Valor novo da linha `Marco:`, no formato do contrato (`_sistema/templates/PLANO.md`). */
export function textoDoMarco(
  veredicto: Exclude<VeredictoMarco, "indefinido">,
  data: string,
  correcoes: readonly string[] = [],
): string {
  if (veredicto === "aprovado") return `aprovado ${data}`;
  const lista = correcoes.length > 0 ? ` (correções: ${correcoes.join(", ")})` : "";
  return `reprovado ${data}${lista}`;
}

export type ResultadoMarco = { ok: true; de: string; para: string } | { ok: false; motivo: string };

/**
 * Grava a linha `Marco:` de UMA fase do PLANO.md.
 *
 * Mesma disciplina de `fabrica/escrita-tarefas.ts`: substituição por LINHA, nunca
 * parse-e-reserializa. O PLANO.md é lido por humano e o diff dele precisa mostrar a
 * mudança, não o arquivo inteiro reformatado.
 *
 * Localiza a fase pelo título `## <nome>` e troca a PRIMEIRA linha `Marco:` abaixo dele,
 * parando no próximo `## ` — assim duas fases com metas parecidas não se confundem.
 */
export async function gravarMarco(
  arquivoPlano: string,
  nomeFase: string,
  valor: string,
): Promise<ResultadoMarco> {
  let texto: string;
  try {
    texto = await readFile(arquivoPlano, "utf8");
  } catch (e) {
    return { ok: false, motivo: `não foi possível ler o PLANO.md: ${(e as Error).message}` };
  }

  const nl = texto.includes("\r\n") ? "\r\n" : "\n";
  const linhas = texto.split(/\r?\n/);
  const alvo = `## ${nomeFase}`.trim().toLowerCase();

  let inicio = -1;
  for (let i = 0; i < linhas.length; i++) {
    if ((linhas[i] ?? "").trim().toLowerCase() === alvo) {
      inicio = i;
      break;
    }
  }
  if (inicio === -1) return { ok: false, motivo: `fase "${nomeFase}" não encontrada no PLANO.md` };

  for (let i = inicio + 1; i < linhas.length; i++) {
    if (/^##\s/.test(linhas[i] ?? "")) break;
    const m = /^(\s*(?:[-*]\s*)?(?:\*\*)?Marco(?:\*\*)?\s*:\s*)(.*)$/i.exec(linhas[i] ?? "");
    if (m === null) continue;

    const anterior = (m[2] ?? "").trim();
    linhas[i] = `${m[1]}${valor}`;
    try {
      await writeFile(arquivoPlano, linhas.join(nl), "utf8");
    } catch (e) {
      return { ok: false, motivo: `não foi possível gravar: ${(e as Error).message}` };
    }
    return { ok: true, de: anterior, para: valor };
  }
  return { ok: false, motivo: `fase "${nomeFase}" não tem linha \`Marco:\`` };
}
