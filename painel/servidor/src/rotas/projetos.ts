import { Router } from "express";
import { config } from "../config.js";
import { lerFabrica, lerProjeto } from "../fabrica/index.js";

/**
 * Projetos da fábrica (T-004, somente leitura): lista com resumo por projeto e
 * detalhe completo (tarefas com corpo, plano, decisões, progresso, análise).
 * Estado sempre derivado dos arquivos no momento da consulta.
 */
export const prefixo = "/api/projetos";

export const router: Router = Router();

/**
 * GET /api/projetos — { projetos: [{ nome, contagemPorStatus, faseAtual, erros }] }.
 * Lista leve para os cards da página inicial: as tarefas em si ficam no detalhe.
 */
router.get("/", async (_req, res) => {
  const estado = await lerFabrica(config.fabricaRaiz);
  res.json({
    projetos: estado.projetos.map(({ nome, contagemPorStatus, faseAtual, erros }) => ({
      nome,
      contagemPorStatus,
      faseAtual,
      erros,
    })),
  });
});

/**
 * GET /api/projetos/:nome — detalhe completo do projeto (tarefas com frontmatter +
 * corpo, plano com fases/meta/marco, textos de decisões/progresso e `analise`, que é
 * null enquanto o projeto não tem _gestao/ANALISE.md). Projeto inexistente (ou nome
 * com travessia de caminho, que o leitor rejeita): 404 em JSON.
 */
router.get("/:nome", async (req, res) => {
  const detalhe = await lerProjeto(config.fabricaRaiz, req.params.nome);
  if (detalhe === null) {
    res.status(404).json({ erro: `Projeto "${req.params.nome}" não encontrado` });
    return;
  }
  res.json(detalhe);
});
