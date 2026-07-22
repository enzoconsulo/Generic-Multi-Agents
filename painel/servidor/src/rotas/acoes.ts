import { Router } from "express";
import { config, resolverEstrategia } from "../config.js";
import { ErroAcaoDesconhecida, montarJobAcao } from "../acoes/acoes.js";
import { agentesParaAcao } from "../acoes/agentes-dinamicos.js";
import { obterGerenciador } from "../jobs/instancia.js";

/**
 * Disparo das ações da fábrica (T-011): POST cria um job "claude" que roda o comando
 * correspondente. A LISTA/descrição das ações continua em /api/fabrica; aqui é só o
 * disparo. Requer o runner "claude" registrado (feito na inicialização do servidor).
 */
export const prefixo = "/api/acoes";

export const router: Router = Router();

/** POST /api/acoes/:id — corpo { argumentos?, estrategia?, maxTurns? } → cria o job. */
router.post("/:id", async (req, res) => {
  const corpo = (req.body ?? {}) as {
    argumentos?: unknown;
    estrategia?: unknown;
    maxTurns?: unknown;
  };

  // Estratégia de modelo: valida contra a lista; ausente = padrão da config.
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

  if (corpo.argumentos !== undefined && typeof corpo.argumentos !== "string") {
    res.status(400).json({ erro: "Campo `argumentos` deve ser texto." });
    return;
  }
  if (corpo.maxTurns !== undefined && !Number.isInteger(corpo.maxTurns as number)) {
    res.status(400).json({ erro: "Campo `maxTurns` deve ser inteiro." });
    return;
  }

  const argumentos = typeof corpo.argumentos === "string" ? corpo.argumentos : "";

  try {
    // Agentes dinâmicos: só /trabalhar <projeto> com equipe.json recebe especialistas.
    const agentes = await agentesParaAcao(config.fabricaRaiz, req.params.id, argumentos);

    const novo = montarJobAcao(
      {
        id: req.params.id,
        argumentos,
        modelo: estrategia.modelo,
        fallback: estrategia.fallback,
        ...(agentes ? { agentes } : {}),
        ...(typeof corpo.maxTurns === "number" ? { maxTurns: corpo.maxTurns } : {}),
      },
      config.fabricaRaiz,
    );
    const job = obterGerenciador().criarJob(novo);
    res.status(201).json({ job });
  } catch (erro) {
    if (erro instanceof ErroAcaoDesconhecida) {
      res.status(404).json({ erro: erro.message });
      return;
    }
    // Runner "claude" não registrado (ex.: em testes sem inicialização) ou params ruins.
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
