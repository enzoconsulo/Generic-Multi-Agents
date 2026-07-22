import { Router } from "express";
import { ErroJobNaoCancelavel, ErroJobNaoEncontrado } from "../jobs/fila.js";
import { obterGerenciador } from "../jobs/instancia.js";
import { ESTADOS_JOB, type EstadoJob } from "../jobs/tipos.js";

/**
 * API de consulta e cancelamento de jobs (T-007). A CRIAÇÃO de jobs não passa por
 * aqui: as ações da fábrica (T-011+) criam jobs direto no gerenciador.
 */
export const prefixo = "/api/jobs";

export const router: Router = Router();

/** GET /api/jobs?estado=<opcional> — lista (mais recentes primeiro). */
router.get("/", (req, res) => {
  const bruto = req.query.estado;
  let estado: EstadoJob | undefined;
  if (bruto !== undefined) {
    if (typeof bruto !== "string" || !(ESTADOS_JOB as readonly string[]).includes(bruto)) {
      res.status(400).json({
        erro: `Estado inválido: "${String(bruto)}". Use um de: ${ESTADOS_JOB.join(", ")}.`,
      });
      return;
    }
    estado = bruto as EstadoJob;
  }
  res.json({ jobs: obterGerenciador().listar(estado) });
});

/** GET /api/jobs/:id — o job, ou 404. */
router.get("/:id", (req, res) => {
  const job = obterGerenciador().obter(req.params.id);
  if (!job) {
    res.status(404).json({ erro: `Job "${req.params.id}" não encontrado` });
    return;
  }
  res.json(job);
});

/**
 * POST /api/jobs/:id/cancelar — `na-fila` cancela na hora (200); `executando`/
 * `aguardando-input` aciona o AbortSignal e o estado final assenta quando o runner
 * terminar (202). Estado não cancelável: 409. Corpo: o job pós-pedido.
 */
router.post("/:id/cancelar", (req, res) => {
  try {
    const job = obterGerenciador().cancelar(req.params.id);
    res.status(job.estado === "cancelado" ? 200 : 202).json(job);
  } catch (erro) {
    if (erro instanceof ErroJobNaoEncontrado) {
      res.status(404).json({ erro: erro.message });
      return;
    }
    if (erro instanceof ErroJobNaoCancelavel) {
      res.status(409).json({ erro: erro.message });
      return;
    }
    throw erro;
  }
});
