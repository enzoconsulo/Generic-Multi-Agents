import { Router } from "express";
import { config, resolverEstrategia } from "../config.js";
import {
  ACOES_PROJETO,
  ErroAcaoProjetoDesconhecida,
  acaoProjetoPorId,
  montarJobAcaoProjeto,
} from "../acoes/acoes-projeto.js";
import { ErroProjetoInexistente } from "../acoes/analise.js";
import { obterGerenciador } from "../jobs/instancia.js";

/**
 * Ações de agente por projeto (T-033): listagem do catálogo e disparo.
 *
 * Arquivo PRÓPRIO, e não mais uma rota dentro de `rotas/acoes.ts`, pela convenção do
 * painel: tarefa nova adiciona arquivo novo em `rotas/` (o agregador carrega sozinho),
 * o que mantém as `areas` disjuntas e o paralelismo possível.
 */
export const prefixo = "/api/acoes-projeto";

export const router: Router = Router();

/** GET /api/acoes-projeto — catálogo das ações disponíveis por projeto. */
router.get("/", (_req, res) => {
  res.json({ acoes: ACOES_PROJETO });
});

/**
 * POST /api/acoes-projeto/:id — corpo { projeto, entrada?, estrategia?, maxTurns? }.
 * Cria o job "claude" que despacha o especialista no projeto informado.
 */
router.post("/:id", async (req, res) => {
  const corpo = (req.body ?? {}) as {
    projeto?: unknown;
    entrada?: unknown;
    estrategia?: unknown;
    maxTurns?: unknown;
  };

  const acao = acaoProjetoPorId(req.params.id);
  if (acao === null) {
    res.status(404).json({ erro: `Ação de projeto desconhecida: "${req.params.id}".` });
    return;
  }

  if (typeof corpo.projeto !== "string" || corpo.projeto.trim() === "") {
    res.status(400).json({ erro: "Campo `projeto` é obrigatório." });
    return;
  }
  if (corpo.entrada !== undefined && typeof corpo.entrada !== "string") {
    res.status(400).json({ erro: "Campo `entrada` deve ser texto." });
    return;
  }

  // Ação que EXIGE entrada não pode rodar sem ela: o prompt ficaria com a pergunta em
  // branco e o agente inventaria o próprio objetivo. Quem decide é o catálogo.
  const entrada = typeof corpo.entrada === "string" ? corpo.entrada.trim() : "";
  if (acao.entrada?.obrigatoria === true && entrada === "") {
    res.status(400).json({ erro: `A ação "${acao.rotulo}" precisa de uma pergunta.` });
    return;
  }

  const idEstrategia =
    typeof corpo.estrategia === "string" && corpo.estrategia !== ""
      ? corpo.estrategia
      : config.estrategiaPadrao;
  const estrategia = resolverEstrategia(idEstrategia);
  if (estrategia === undefined) {
    res.status(400).json({
      erro: `Estratégia de modelo inválida. Use uma de: ${config.estrategiasModelo
        .map((e) => e.id)
        .join(", ")}.`,
    });
    return;
  }
  if (corpo.maxTurns !== undefined && !Number.isInteger(corpo.maxTurns as number)) {
    res.status(400).json({ erro: "Campo `maxTurns` deve ser inteiro." });
    return;
  }

  try {
    const novo = await montarJobAcaoProjeto(req.params.id, corpo.projeto.trim(), config.fabricaRaiz, {
      modelo: estrategia.modelo,
      fallback: estrategia.fallback,
      entrada,
      ...(typeof corpo.maxTurns === "number" ? { maxTurns: corpo.maxTurns } : {}),
    });
    const job = obterGerenciador().criarJob(novo);
    res.status(201).json({ job });
  } catch (erro) {
    if (erro instanceof ErroProjetoInexistente) {
      res.status(404).json({ erro: erro.message });
      return;
    }
    if (erro instanceof ErroAcaoProjetoDesconhecida) {
      res.status(404).json({ erro: erro.message });
      return;
    }
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (mensagem.includes("Tipo de job desconhecido")) {
      res.status(503).json({
        erro: "Execução de fluxos indisponível: runner Claude não registrado no servidor.",
      });
      return;
    }
    res.status(500).json({ erro: `Não foi possível criar o job: ${mensagem}` });
  }
});
