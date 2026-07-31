import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Histórico de log de um job, gravado em `<dirJobs>/<id>.log.jsonl` (T-048).
 *
 * POR QUE EXISTE: até aqui o log de execução vivia SÓ no buffer em memória do hub SSE
 * (500 eventos, compartilhado por todos os jobs). Job terminado, painel reiniciado ou
 * simplesmente 500 eventos depois, e não sobrava nada além do resumo — que é escrito por
 * um modelo pequeno e pode divergir do que aconteceu. Quando o `/novo-projeto
 * banco-imobiliario` parou no meio, não havia UM registro para responder "o que houve":
 * o diagnóstico teve que sair do texto final gravado no `resultado`, por sorte suficiente.
 * Log de fluxo agêntico é a única evidência de por que ele parou; perder isso é caro.
 *
 * ESCRITA DE UMA VEZ, no fim: as linhas ficam num buffer em memória durante a execução e
 * vão para o disco quando o job termina. Append por linha significaria I/O no caminho
 * quente — e este repositório vive sob OneDrive, onde I/O por arquivo é lento e
 * intermitente (já causou EBUSY/EPERM na persistência de job). O preço é perder o log de
 * um job se o processo morrer no meio; o job também fica órfão nesse caso, e o saneamento
 * de boot já cuida dele.
 */

export interface LinhaHistorico {
  em: string;
  nivel: string;
  texto: string;
}

export interface HistoricoLog {
  linhas: LinhaHistorico[];
  /** Quantas linhas foram descartadas no meio por causa do teto (0 = histórico inteiro). */
  descartadas: number;
}

/**
 * Teto por job. Um `/trabalhar` longo passa de 10 mil linhas; guardar tudo faria o
 * `dados/` crescer sem controle e o payload da tela junto.
 */
export const MAX_LINHAS_INICIO = 500;
export const MAX_LINHAS_FIM = 3500;

/** Buffer vazio para um job que começa. */
export function historicoVazio(): HistoricoLog {
  return { linhas: [], descartadas: 0 };
}

/**
 * Acrescenta uma linha, cortando o MEIO quando passa do teto.
 *
 * Corta o meio, não o fim: o começo diz como o fluxo foi montado (sessão, modelo, primeiras
 * decisões) e o fim é onde ele quebrou — o meio é a parte repetitiva. Cortar o fim, que é o
 * default preguiçoso, jogaria fora exatamente a evidência que se procura.
 *
 * O corte acontece já em memória (e não só na gravação) porque um `/trabalhar` longo passa
 * de 10 mil linhas e o buffer vive durante toda a execução.
 */
export function empurrarLinha(historico: HistoricoLog, linha: LinhaHistorico): void {
  historico.linhas.push(linha);
  const teto = MAX_LINHAS_INICIO + MAX_LINHAS_FIM;
  if (historico.linhas.length <= teto) return;
  // Remove o excedente logo depois do bloco inicial, preservando começo e fim.
  const sobra = historico.linhas.length - teto;
  historico.linhas.splice(MAX_LINHAS_INICIO, sobra);
  historico.descartadas += sobra;
}

function caminho(dirJobs: string, jobId: string): string {
  return join(dirJobs, `${jobId}.log.jsonl`);
}

/**
 * Grava o histórico do job. Nunca lança: log é diagnóstico, e falha de disco não pode
 * derrubar o assentamento de um job que já terminou.
 */
export function salvarHistorico(dirJobs: string, jobId: string, historico: HistoricoLog): void {
  const { linhas, descartadas } = historico;
  if (linhas.length === 0) return;
  const corpo = linhas.map((l) => JSON.stringify(l));
  if (descartadas > 0) {
    // A marca entra NO MEIO, onde o corte aconteceu — assim quem lê o arquivo vê o buraco
    // no lugar certo em vez de descobrir no fim que faltava coisa.
    corpo.splice(MAX_LINHAS_INICIO, 0, JSON.stringify({
      em: linhas[MAX_LINHAS_INICIO]?.em ?? "",
      nivel: "erro",
      texto: `[${descartadas} linha(s) omitidas aqui pelo teto de histórico]`,
    } satisfies LinhaHistorico));
  }
  try {
    writeFileSync(caminho(dirJobs, jobId), `${corpo.join("\n")}\n`, "utf8");
  } catch (erro) {
    console.warn(
      `[jobs] Não deu para gravar o histórico de log de ${jobId}: ` +
        `${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

/** Lê o histórico gravado. Ausente ou ilegível = lista vazia (não é erro). */
export function lerHistorico(dirJobs: string, jobId: string): LinhaHistorico[] {
  const arquivo = caminho(dirJobs, jobId);
  if (!existsSync(arquivo)) return [];
  try {
    return readFileSync(arquivo, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => {
        try {
          const v = JSON.parse(l) as Partial<LinhaHistorico>;
          return {
            em: typeof v.em === "string" ? v.em : "",
            nivel: typeof v.nivel === "string" ? v.nivel : "log",
            texto: typeof v.texto === "string" ? v.texto : "",
          };
        } catch {
          // Linha corrompida vira texto cru: é melhor mostrar do que sumir com ela.
          return { em: "", nivel: "log", texto: l };
        }
      });
  } catch (erro) {
    console.warn(
      `[jobs] Histórico de log de ${jobId} ilegível: ` +
        `${erro instanceof Error ? erro.message : String(erro)}`,
    );
    return [];
  }
}

/** Apaga o histórico junto com o job podado — senão o `.log.jsonl` viraria lixo órfão. */
export function apagarHistorico(dirJobs: string, jobId: string): void {
  try {
    rmSync(caminho(dirJobs, jobId), { force: true });
  } catch {
    // Mesmo tratamento da poda de job: disco ocupado não pode impedir o painel de subir.
  }
}
