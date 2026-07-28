import { Router, type Request, type Response } from "express";
import { dirProjeto } from "../acoes/analise.js";
import { config } from "../config.js";
import { lerHistorico } from "../fabrica/git.js";

/**
 * Histórico git (T-028): alimenta o grafo de commits do painel.
 *
 * Atende tanto os projetos quanto a PRÓPRIA fábrica — o repositório da raiz versiona o
 * sistema e o painel, e ver a evolução dele é tão útil quanto a de um projeto.
 */
export const prefixo = "/api/git";

export const router: Router = Router();

/** Nome reservado para o repositório da raiz da fábrica (não colide: `/` é proibido em nome). */
const FABRICA = "_fabrica";

function limiteDe(req: Request): number {
  const bruto = Number(req.query["limite"]);
  if (!Number.isInteger(bruto) || bruto < 1) return 80;
  return Math.min(bruto, 300); // teto: grafo gigante não ajuda ninguém e pesa o desenho
}

/**
 * GET /api/git/:projeto — histórico do projeto; use `_fabrica` para o repositório da
 * raiz. `?limite=N` (default 80, teto 300).
 */
router.get("/:projeto", async (req: Request<{ projeto: string }>, res: Response) => {
  const nome = req.params.projeto;

  const dir = nome === FABRICA ? config.fabricaRaiz : dirProjeto(config.fabricaRaiz, nome);
  if (dir === null) {
    res.status(404).json({ erro: `Projeto "${nome}" não encontrado` });
    return;
  }

  try {
    const historico = await lerHistorico(dir, limiteDe(req));
    res.json(historico);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    res.status(500).json({ erro: `Falha ao ler o histórico: ${mensagem}` });
  }
});
