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

  const escrever = (id: number, evento: EventoJob): void => {
    res.write(`id: ${id}\n`);
    res.write("event: job\n");
    res.write(`data: ${JSON.stringify(evento)}\n\n`);
  };

  // Comentário inicial destrava o EventSource imediatamente.
  res.write(": conectado\n\n");
  const remover = hub.adicionarCliente(escrever, ultimoId);

  // Heartbeat: detecta conexão morta e mantém intermediários sem bufferizar.
  const ping = setInterval(() => {
    res.write(": ping\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(ping);
    remover();
    res.end();
  });
});
