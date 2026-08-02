import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolverArea } from "../contexto/montador.js";

const exec = promisify(execFile);

/**
 * Existe trabalho NÃO COMMITADO nas `areas` de uma tarefa?
 *
 * É o sinal que o saneamento de abertura precisa, e a primeira versão errava o alvo. A
 * regra era "Notas de execução vazias = nada foi feito = recomeça", e ela não sobrevive ao
 * caso comum: **quase toda tarefa retomada já tem Notas antigas** — de uma tentativa
 * anterior, de um relatório de reprovação, ou de um registro do orquestrador. Numa rodada
 * real a T-017a foi mantida em `em-execucao` por causa de uma nota escrita no dia anterior
 * sobre uma tentativa que nem existia mais.
 *
 * A árvore git não tem esse problema: ou há mudança não commitada nos arquivos que a tarefa
 * declarou tocar, ou não há. Prosa é ambígua; `git status` não é.
 *
 * Falha para o lado seguro: se o git não responder (pasta que não é repositório, git
 * ausente), devolve `true` — "pode haver trabalho". Preservar em dúvida é sempre melhor que
 * descartar em dúvida.
 */
export async function temTrabalhoParcial(
  dirProjeto: string,
  areas: readonly string[],
): Promise<boolean> {
  // Sem `areas` declaradas não dá para olhar em lugar nenhum: assume que há trabalho, para
  // não jogar fora o que não se sabe medir.
  if (areas.length === 0) return true;

  const caminhos = areas
    .filter((a) => resolverArea(dirProjeto, a) !== null)
    .map((a) => a.split("\\").join("/"));
  if (caminhos.length === 0) return true;

  try {
    const { stdout } = await exec("git", ["status", "--porcelain", "--", ...caminhos], {
      cwd: dirProjeto,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout.trim() !== "";
  } catch {
    return true;
  }
}
