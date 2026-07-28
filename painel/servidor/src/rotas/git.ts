import { Router, type Request, type Response } from "express";
import { dirProjeto } from "../acoes/analise.js";
import { config } from "../config.js";
import {
  ErroCommit,
  commitar,
  lerAlteracoes,
  lerDetalheCommit,
  lerHistorico,
} from "../fabrica/git.js";

/**
 * Histórico git (T-028): alimenta o grafo de commits do painel.
 *
 * Atende tanto os projetos quanto a PRÓPRIA fábrica — o repositório da raiz versiona o
 * sistema e o painel, e ver a evolução dele é tão útil quanto a de um projeto.
 *
 * T-029 acrescentou a única escrita deste módulo: `POST /:projeto/commit`. Ela commita
 * localmente e NUNCA faz push — publicar é decisão do dono do repositório.
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

/** Diretório do repositório pedido, ou `null` se o nome não corresponde a nada. */
function repoDe(nome: string): string | null {
  return nome === FABRICA ? config.fabricaRaiz : dirProjeto(config.fabricaRaiz, nome);
}

function naoEncontrado(res: Response, nome: string): void {
  res.status(404).json({ erro: `Projeto "${nome}" não encontrado` });
}

/**
 * GET /api/git/:projeto — histórico do projeto; use `_fabrica` para o repositório da
 * raiz. `?limite=N` (default 80, teto 300).
 */
router.get("/:projeto", async (req: Request<{ projeto: string }>, res: Response) => {
  const nome = req.params.projeto;

  const dir = repoDe(nome);
  if (dir === null) {
    naoEncontrado(res, nome);
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

/** GET /api/git/:projeto/alteracoes — o que está pendente de commit. */
router.get(
  "/:projeto/alteracoes",
  async (req: Request<{ projeto: string }>, res: Response) => {
    const nome = req.params.projeto;
    const dir = repoDe(nome);
    if (dir === null) {
      naoEncontrado(res, nome);
      return;
    }
    res.json({ alteracoes: await lerAlteracoes(dir) });
  },
);

/**
 * GET /api/git/:projeto/commit/:hash — o "resumão" do commit: arquivos tocados, linhas
 * somadas/removidas e o corpo da mensagem. Sai do próprio git, então é instantâneo e não
 * consome nada da assinatura.
 */
router.get(
  "/:projeto/commit/:hash",
  async (req: Request<{ projeto: string; hash: string }>, res: Response) => {
    const nome = req.params.projeto;
    const dir = repoDe(nome);
    if (dir === null) {
      naoEncontrado(res, nome);
      return;
    }

    const detalhe = await lerDetalheCommit(dir, req.params.hash);
    if (detalhe === null) {
      res.status(404).json({ erro: `Commit "${req.params.hash}" não encontrado` });
      return;
    }
    res.json(detalhe);
  },
);

/** POST /api/git/:projeto/commit — `git add -A` + `git commit`. Sem push. */
router.post("/:projeto/commit", async (req: Request<{ projeto: string }>, res: Response) => {
  const nome = req.params.projeto;
  const dir = repoDe(nome);
  if (dir === null) {
    naoEncontrado(res, nome);
    return;
  }

  const mensagem = (req.body as { mensagem?: unknown })?.mensagem;
  if (typeof mensagem !== "string") {
    res.status(400).json({ erro: "Informe a mensagem do commit." });
    return;
  }

  try {
    const hash = await commitar(dir, mensagem);
    res.json({ hash, curto: hash.slice(0, 7) });
  } catch (erro) {
    if (erro instanceof ErroCommit) {
      res.status(erro.status).json({ erro: erro.message });
      return;
    }
    const texto = erro instanceof Error ? erro.message : String(erro);
    res.status(500).json({ erro: `Falha ao commitar: ${texto}` });
  }
});
