import { Router, type Request, type Response } from "express";
import { config } from "../config.js";
import {
  ErroAjustes,
  definirIdentidade,
  lerContaClaude,
  lerContaGitHub,
  type Ajustes,
} from "../fabrica/ajustes.js";

/**
 * Ajustes (T-032): estado das contas de que a fábrica depende — Claude (executa) e
 * GitHub (recebe o que é publicado) — mais a configuração efetiva do painel.
 *
 * Só devolve DIAGNÓSTICO: existência de credencial, meio de autenticação, identidade dos
 * commits. Nunca conteúdo de credencial nem de chave privada.
 */
export const prefixo = "/api/ajustes";

export const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const [github, claude] = await Promise.all([lerContaGitHub(), lerContaClaude()]);
    const ajustes: Ajustes = {
      github,
      claude,
      painel: {
        porta: config.porta,
        fabricaRaiz: config.fabricaRaiz,
        dirDados: config.dirDados,
        tetoJobsClaude: config.tetoJobsClaude,
        estrategias: config.estrategiasModelo.map((e) => e.id),
      },
    };
    res.json(ajustes);
  } catch (erro) {
    const texto = erro instanceof Error ? erro.message : String(erro);
    res.status(500).json({ erro: `Falha ao ler os ajustes: ${texto}` });
  }
});

/** PUT /api/ajustes/identidade — nome e e-mail que assinam os commits (git global). */
router.put("/identidade", async (req: Request, res: Response) => {
  const corpo = req.body as { nome?: unknown; email?: unknown };
  if (typeof corpo?.nome !== "string" || typeof corpo?.email !== "string") {
    res.status(400).json({ erro: "Informe nome e e-mail." });
    return;
  }

  try {
    await definirIdentidade(corpo.nome, corpo.email);
    res.json(await lerContaGitHub());
  } catch (erro) {
    if (erro instanceof ErroAjustes) {
      res.status(erro.status).json({ erro: erro.message });
      return;
    }
    const texto = erro instanceof Error ? erro.message : String(erro);
    res.status(500).json({ erro: `Falha ao gravar: ${texto}` });
  }
});
