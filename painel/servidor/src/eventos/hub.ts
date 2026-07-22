import type { EventEmitter } from "node:events";
import type { EventoJob } from "../jobs/tipos.js";

/**
 * Hub de eventos SSE (T-009): canal ÚNICO multiplexado (cada evento carrega `jobId`).
 * Decisão em _gestao/DECISOES.md — um endpoint só, com buffer de replay por
 * `Last-Event-ID`, em vez de um stream por job (estouraria o limite de ~6 conexões
 * HTTP/1.1 do navegador).
 *
 * Cada cliente é uma função `escrever(id, evento)`; a rota SSE registra a sua e remove no
 * fechamento. O hub escuta o emissor do gerenciador de jobs (`conectar`).
 */

export interface EventoNumerado {
  id: number;
  evento: EventoJob;
}

type Escritor = (id: number, evento: EventoJob) => void;

export class HubEventos {
  private readonly clientes = new Set<Escritor>();
  private readonly buffer: EventoNumerado[] = [];
  private proximoId = 1;
  private conectado = false;
  private readonly maxBuffer: number;

  constructor(maxBuffer = 500) {
    this.maxBuffer = maxBuffer;
  }

  /** Passa a repassar os eventos do gerenciador de jobs. Idempotente. */
  conectar(emissor: EventEmitter): void {
    if (this.conectado) return;
    this.conectado = true;
    emissor.on("evento", (evento: EventoJob) => this.publicar(evento));
  }

  /** Numera, guarda no buffer de replay e envia a todos os clientes conectados. */
  publicar(evento: EventoJob): EventoNumerado {
    const numerado: EventoNumerado = { id: this.proximoId++, evento };
    this.buffer.push(numerado);
    if (this.buffer.length > this.maxBuffer) this.buffer.shift();
    for (const escrever of this.clientes) {
      try {
        escrever(numerado.id, evento);
      } catch {
        // Cliente com socket morto: será removido no evento "close" da resposta.
      }
    }
    return numerado;
  }

  /**
   * Registra um cliente e reenvia o que ele perdeu (eventos com id > ultimoId).
   * Retorna a função para removê-lo.
   */
  adicionarCliente(escrever: Escritor, ultimoId?: number): () => void {
    if (ultimoId !== undefined) {
      for (const { id, evento } of this.buffer) {
        if (id > ultimoId) escrever(id, evento);
      }
    }
    this.clientes.add(escrever);
    return () => this.clientes.delete(escrever);
  }

  get totalClientes(): number {
    return this.clientes.size;
  }
}

/** Instância única do hub (a rota e a inicialização usam a mesma). */
export const hub = new HubEventos();
