import { Router } from "express";
import { config } from "../config.js";
import { lerEquipe } from "../fabrica/equipe.js";
import { ErroEquipe, gravarEquipe } from "../fabrica/equipe-escrita.js";
import { dirProjeto } from "../acoes/analise.js";

/**
 * Equipe de especialistas do projeto (T-035): leitura e gravação de `_gestao/equipe.json`.
 *
 * A leitura já existia embutida em `/api/projetos/:nome` (campo `equipe`); esta rota
 * existe para o editor poder reler e regravar sem puxar o detalhe inteiro do projeto.
 */
export const prefixo = "/api/equipe";

export const router: Router = Router();

/** GET /api/equipe/:projeto — equipe atual, com os erros de validação da leitura. */
router.get("/:projeto", async (req, res) => {
  const projeto = req.params.projeto;
  if (dirProjeto(config.fabricaRaiz, projeto) === null) {
    res.status(404).json({ erro: `Projeto não encontrado: "${projeto}"` });
    return;
  }
  res.json(await lerEquipe(config.fabricaRaiz, projeto));
});

/**
 * PUT /api/equipe/:projeto — corpo { agentes: [...] }. Substitui a equipe inteira.
 *
 * Substituição total, e não edição por agente, porque a tela edita a lista como um todo:
 * PATCH por id exigiria resolver conflito de edição concorrente para um arquivo que uma
 * pessoa só edita, na própria máquina.
 */
router.put("/:projeto", async (req, res) => {
  const corpo = (req.body ?? {}) as { agentes?: unknown };

  if (corpo.agentes === undefined) {
    res.status(400).json({ erro: "Campo `agentes` é obrigatório." });
    return;
  }

  try {
    const agentes = await gravarEquipe(config.fabricaRaiz, req.params.projeto, corpo.agentes);
    res.json({ agentes, gravado: true });
  } catch (erro) {
    if (erro instanceof ErroEquipe) {
      res.status(erro.status).json({ erro: erro.message, problemas: erro.problemas });
      return;
    }
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    res.status(500).json({ erro: `Não foi possível gravar a equipe: ${mensagem}` });
  }
});
