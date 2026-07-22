import { randomUUID } from "node:crypto";
import type { NovaPendencia, Pendencia, RespostaInput } from "./tipos.js";

/**
 * Registro em memória das pendências de input (T-010). Guarda cada pendência ABERTA com o
 * resolver/rejeitar da Promise que o runner está aguardando (via `ctx.pedirInput`). Não
 * mexe em estado de job — isso é do gerenciador; aqui é só o pareamento pergunta↔resposta.
 *
 * Recuperação pós-reinício NÃO é desta tarefa (T-019): se o processo cair com pendência
 * aberta, as Promises se perdem com a memória (o job carregado do disco vira `interrompido`
 * pelo boot saneador). Documentado como limitação conhecida.
 */

export class ErroInputNaoEncontrado extends Error {
  constructor(id: string) {
    super(`Input pendente não encontrado: "${id}".`);
    this.name = "ErroInputNaoEncontrado";
  }
}

export class ErroInputJaRespondido extends Error {
  constructor(id: string) {
    super(`O input "${id}" já foi respondido.`);
    this.name = "ErroInputJaRespondido";
  }
}

interface Entrada {
  pendencia: Pendencia;
  resolver: (r: RespostaInput) => void;
  rejeitar: (e: Error) => void;
}

export class RegistroInputs {
  private readonly abertas = new Map<string, Entrada>();
  /** IDs já respondidos — distingue 409 (já respondido) de 404 (nunca existiu). */
  private readonly respondidas = new Set<string>();

  /** Cria uma pendência e devolve a Promise que resolve quando o usuário responder. */
  criar(
    jobId: string,
    nova: NovaPendencia,
  ): { pendencia: Pendencia; promessa: Promise<RespostaInput> } {
    const pendencia: Pendencia = {
      id: randomUUID().replaceAll("-", "").slice(0, 8),
      jobId,
      criadaEm: new Date().toISOString(),
      ...nova,
    };
    let resolver!: (r: RespostaInput) => void;
    let rejeitar!: (e: Error) => void;
    const promessa = new Promise<RespostaInput>((res, rej) => {
      resolver = res;
      rejeitar = rej;
    });
    this.abertas.set(pendencia.id, { pendencia, resolver, rejeitar });
    return { pendencia, promessa };
  }

  /** Pendências ABERTAS (as respondidas ficam no metadado do job, para auditoria). */
  listar(): Pendencia[] {
    return [...this.abertas.values()].map((e) => e.pendencia);
  }

  obter(id: string): Pendencia | undefined {
    return this.abertas.get(id)?.pendencia;
  }

  /**
   * Resolve uma pendência aberta com a resposta do usuário. `ErroInputNaoEncontrado` (404)
   * se nunca existiu; `ErroInputJaRespondido` (409) se já foi respondida.
   */
  responder(id: string, resposta: RespostaInput): Pendencia {
    const entrada = this.abertas.get(id);
    if (!entrada) {
      if (this.respondidas.has(id)) throw new ErroInputJaRespondido(id);
      throw new ErroInputNaoEncontrado(id);
    }
    this.abertas.delete(id);
    this.respondidas.add(id);
    entrada.pendencia.respondidaEm = new Date().toISOString();
    entrada.pendencia.resposta = resposta;
    entrada.resolver(resposta);
    return entrada.pendencia;
  }

  /**
   * Rejeita todas as pendências abertas de um job (usado no cancelamento): a Promise que o
   * runner aguarda passa a rejeitar, e o erro propaga até o runner encerrar.
   */
  abortarDeJob(jobId: string, motivo: string): void {
    for (const [id, entrada] of this.abertas) {
      if (entrada.pendencia.jobId === jobId) {
        this.abertas.delete(id);
        entrada.rejeitar(new Error(motivo));
      }
    }
  }
}
