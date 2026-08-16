import { Router } from "express";
import { obterGerenciador } from "../jobs/instancia.js";
import { ErroNaoRetomavel, planejarRetomada } from "../jobs/retomada.js";

/**
 * POST /api/jobs/:id/retomar — cria o job que CONTINUA um job interrompido (16/08).
 *
 * Arquivo próprio, e não uma rota a mais em `rotas/jobs.ts`, pela convenção da casa:
 * arquivo novo em vez de arquivo compartilhado (o agregador acha sozinho). O prefixo é o
 * mesmo de `jobs.ts` de propósito — os dois routers convivem sob `/api/jobs`, e é assim
 * que a URL fica onde o usuário espera encontrá-la.
 *
 * A decisão inteira mora em `jobs/retomada.ts`, que é puro e testável; aqui só se traduz
 * HTTP ↔ operação.
 */
export const prefixo = "/api/jobs";

export const router: Router = Router();

router.post("/:id/retomar", (req, res) => {
  const gerenciador = obterGerenciador();
  const job = gerenciador.obter(req.params.id);
  if (!job) {
    res.status(404).json({ erro: `Job "${req.params.id}" não encontrado` });
    return;
  }

  // Teto opcional: é o "redisparar com um teto maior" que as mensagens de desfecho já
  // prometiam e que não tinha por onde ser feito. Valor torto é rejeitado em vez de
  // ignorado — teto silenciosamente descartado é um freio que parece existir e não existe.
  const corpo = (req.body ?? {}) as { tetoUsd?: unknown };
  let tetoUsd: number | undefined;
  if (corpo.tetoUsd !== undefined) {
    if (typeof corpo.tetoUsd !== "number" || !Number.isFinite(corpo.tetoUsd) || corpo.tetoUsd <= 0) {
      res.status(400).json({ erro: "Campo `tetoUsd` deve ser um número maior que zero." });
      return;
    }
    tetoUsd = corpo.tetoUsd;
  }

  try {
    const plano = planejarRetomada(job, tetoUsd);
    const novo = gerenciador.criarJob(plano.novo);
    res.status(201).json({
      job: novo,
      modo: plano.modo,
      explicacao: plano.explicacao,
      tetoUsd: plano.tetoUsd,
    });
  } catch (erro) {
    if (erro instanceof ErroNaoRetomavel) {
      res.status(409).json({ erro: erro.message });
      return;
    }
    throw erro;
  }
});
