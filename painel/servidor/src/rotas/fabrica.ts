import { Router } from "express";
import { config } from "../config.js";
import { catalogoAcoes } from "../fabrica/catalogo-acoes.js";
import {
  lerFabrica,
  STATUS_TAREFA,
  type ContagemPorStatus,
  type ProjetoResumo,
} from "../fabrica/index.js";

/**
 * Visão geral da fábrica (T-004, somente leitura): catálogo das 6 ações globais
 * (descrições lidas na hora de `.claude/commands/*.md`) + resumo agregado
 * (nº de projetos e tarefas por status). Estado sempre derivado dos arquivos
 * no momento da consulta — nada é cacheado.
 */
export const prefixo = "/api/fabrica";

export const router: Router = Router();

/** Soma as contagens de todos os projetos (sempre com as 8 chaves do protocolo). */
function agregarContagens(projetos: ProjetoResumo[]): ContagemPorStatus {
  const total = { ...VAZIA };
  for (const projeto of projetos) {
    for (const status of STATUS_TAREFA) {
      total[status] += projeto.contagemPorStatus[status] ?? 0;
    }
  }
  return total;
}

const VAZIA: ContagemPorStatus = {
  backlog: 0,
  pronta: 0,
  "em-execucao": 0,
  "em-teste": 0,
  "em-revisao": 0,
  concluida: 0,
  bloqueada: 0,
  cancelada: 0,
};

/** GET /api/fabrica — { acoes, resumo, erros }. */
router.get("/", async (_req, res) => {
  const [acoes, estado] = await Promise.all([
    catalogoAcoes(config.fabricaRaiz),
    lerFabrica(config.fabricaRaiz),
  ]);

  res.json({
    acoes,
    resumo: {
      projetos: estado.projetos.length,
      tarefasPorStatus: agregarContagens(estado.projetos),
    },
    /** Modelos que a UI pode escolher ao disparar uma ação (do mais barato ao mais caro). */
    modelos: config.modelosPermitidos,
    modeloPadrao: config.modeloPadrao,
    /** Problemas no nível da raiz da fábrica (ex.: pasta projetos/ inexistente). */
    erros: estado.erros,
  });
});
