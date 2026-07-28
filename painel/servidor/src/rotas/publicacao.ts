import { Router, type Request, type Response } from "express";
import { config } from "../config.js";
import {
  ErroBloqueioSeguranca,
  ErroPublicacao,
  criarGitignore,
  definirRemoto,
  dirDoRepo,
  iniciarRepo,
  listarRepos,
  publicar,
} from "../fabrica/publicacao.js";
import { varrerRepo } from "../fabrica/seguranca.js";

/**
 * Publicação (T-030): o link do repositório na nuvem e o push, para a fábrica e para
 * cada subprojeto — que são repositórios INDEPENDENTES, cada um com seu remoto.
 *
 * Separado de `/api/git` de propósito: lá é o repositório local (histórico, commit);
 * aqui é tudo que atravessa a rede.
 */
export const prefixo = "/api/repos";

export const router = Router();

/** Resolve o diretório do repositório ou responde 404. */
function dirOu404(res: Response, id: string): string | null {
  const dir = dirDoRepo(config.fabricaRaiz, id);
  if (dir === null) {
    res.status(404).json({ erro: `Repositório "${id}" não encontrado` });
    return null;
  }
  return dir;
}

function responderErro(res: Response, erro: unknown, prefixoMsg: string): void {
  // Bloqueio de segurança leva o relatório junto: a UI precisa mostrar O QUE barrou.
  if (erro instanceof ErroBloqueioSeguranca) {
    res.status(erro.status).json({
      erro: erro.message,
      detalhe: null,
      relatorio: erro.relatorio,
    });
    return;
  }
  if (erro instanceof ErroPublicacao) {
    res.status(erro.status).json({ erro: erro.message, detalhe: erro.detalhe });
    return;
  }
  const texto = erro instanceof Error ? erro.message : String(erro);
  res.status(500).json({ erro: `${prefixoMsg}: ${texto}`, detalhe: null });
}

/** GET /api/repos — todos os repositórios da fábrica e seu estado de publicação. */
router.get("/", async (_req: Request, res: Response) => {
  try {
    res.json({ repos: await listarRepos(config.fabricaRaiz) });
  } catch (erro) {
    responderErro(res, erro, "Falha ao listar os repositórios");
  }
});

/** PUT /api/repos/:id/remoto — grava o endereço do repositório na nuvem. */
router.put("/:id/remoto", async (req: Request<{ id: string }>, res: Response) => {
  const dir = dirOu404(res, req.params.id);
  if (dir === null) return;

  const url = (req.body as { url?: unknown })?.url;
  if (typeof url !== "string") {
    res.status(400).json({ erro: "Informe o endereço do repositório.", detalhe: null });
    return;
  }

  try {
    res.json({ remoto: await definirRemoto(dir, url) });
  } catch (erro) {
    responderErro(res, erro, "Falha ao gravar o endereço");
  }
});

/** GET /api/repos/:id/seguranca — a conferência pré-publicação (o "push-safe"). */
router.get("/:id/seguranca", async (req: Request<{ id: string }>, res: Response) => {
  const dir = dirOu404(res, req.params.id);
  if (dir === null) return;

  try {
    res.json(await varrerRepo(dir));
  } catch (erro) {
    responderErro(res, erro, "Falha na conferência");
  }
});

/** POST /api/repos/:id/init — `git init` num projeto que ainda não é repositório. */
router.post("/:id/init", async (req: Request<{ id: string }>, res: Response) => {
  const dir = dirOu404(res, req.params.id);
  if (dir === null) return;

  try {
    res.json({ branch: await iniciarRepo(dir) });
  } catch (erro) {
    responderErro(res, erro, "Falha ao iniciar o repositório");
  }
});

/** POST /api/repos/:id/gitignore — cria um .gitignore adequado ao ecossistema. */
router.post("/:id/gitignore", async (req: Request<{ id: string }>, res: Response) => {
  const dir = dirOu404(res, req.params.id);
  if (dir === null) return;

  try {
    await criarGitignore(dir);
    res.json({ criado: true });
  } catch (erro) {
    responderErro(res, erro, "Falha ao criar o .gitignore");
  }
});

/**
 * POST /api/repos/:id/push — publica o branch atual. Sem pull, sem merge, sem force.
 * Corpo `{ ignorarAvisos: true }` publica APESAR da conferência de segurança — decisão
 * explícita do usuário, nunca o padrão.
 */
router.post("/:id/push", async (req: Request<{ id: string }>, res: Response) => {
  const dir = dirOu404(res, req.params.id);
  if (dir === null) return;

  const ignorarAvisos = (req.body as { ignorarAvisos?: unknown })?.ignorarAvisos === true;
  try {
    res.json(await publicar(dir, { ignorarAvisos }));
  } catch (erro) {
    responderErro(res, erro, "Falha ao publicar");
  }
});
