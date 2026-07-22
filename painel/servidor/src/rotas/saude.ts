import { existsSync } from "node:fs";
import { Router } from "express";
import { config } from "../config.js";

/** Healthcheck do painel — também serve de exemplo do contrato { prefixo, router }. */
export const prefixo = "/api/saude";

export const router: Router = Router();

router.get("/", (_req, res) => {
  res.json({
    ok: true,
    fabricaRaiz: config.fabricaRaiz,
    fabricaRaizExiste: existsSync(config.fabricaRaiz),
  });
});
