import { Router } from "express";
import type { EventoJob } from "../jobs/tipos.js";
import { hub } from "../eventos/hub.js";

/**
 * Stream SSE único de eventos de jobs (T-009). O front abre um `EventSource` aqui e
 * recebe TODAS as transições e logs (cada evento traz `jobId` para demultiplexar).
 * Comandos e respostas da UI vão por POST normal (SSE é só backend → UI).
 */
export const prefixo = "/api/eventos";

export const router: Router = Router();

router.get("/", (req, res) => {
  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  // Retomada após F5/reconexão: o navegador reenvia o último id via header.
  const cabecalho = req.header("Last-Event-ID");
  const ultimoId = cabecalho !== undefined && /^\d+$/.test(cabecalho) ? Number(cabecalho) : undefined;

  // Uma limpeza só, idempotente: o encerramento pode chegar por `close` do request, por
  // erro de socket ou pela própria escrita falhando.
  let encerrado = false;
  let remover: () => void = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;
  const encerrar = (): void => {
    if (encerrado) return;
    encerrado = true;
    if (ping !== undefined) clearInterval(ping);
    remover();
    try {
      res.end();
    } catch {
      // Socket já morto: não há o que encerrar.
    }
  };

  /**
   * Escrever num SSE cujo socket morreu LANÇA. Enquanto isso acontecia dentro do `publicar`
   * do hub havia um `try/catch` em volta; no heartbeat abaixo não havia nada, e um `throw`
   * dentro de callback de `setInterval` não tem quem o pegue — vira `uncaughtException` e
   * derruba o painel inteiro, junto com o job em voo. Toda escrita passa por aqui.
   */
  const escreverSeguro = (pedaco: string): boolean => {
    if (encerrado) return false;
    try {
      res.write(pedaco);
      return true;
    } catch {
      encerrar();
      return false;
    }
  };

  const escrever = (id: number, evento: EventoJob): void => {
    escreverSeguro(`id: ${id}\nevent: job\ndata: ${JSON.stringify(evento)}\n\n`);
  };

  // Sem listener de `error`, um ECONNRESET no socket é emitido como exceção sem dono — a
  // mesma queda por outro caminho.
  res.on("error", encerrar);
  req.on("error", encerrar);
  req.on("close", encerrar);

  // Comentário inicial destrava o EventSource imediatamente.
  escreverSeguro(": conectado\n\n");
  remover = hub.adicionarCliente(escrever, ultimoId);
  // Registro tardio de cliente: se o socket já morreu entre a linha acima e esta, desfaz.
  if (encerrado) remover();

  // Heartbeat: detecta conexão morta e mantém intermediários sem bufferizar.
  ping = setInterval(() => {
    escreverSeguro(": ping\n\n");
  }, 15000);
});
