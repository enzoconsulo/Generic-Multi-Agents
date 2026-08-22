import { Router } from "express";
import { config, resolverEstrategia } from "../config.js";
import { ErroAcaoDesconhecida, montarJobAcao } from "../acoes/acoes.js";
import { ErroProjetoInexistente, montarJobAnalise } from "../acoes/analise.js";
import { agentesParaAcao } from "../acoes/agentes-dinamicos.js";
import { obterGerenciador } from "../jobs/instancia.js";

/**
 * Traduz "runner ausente" no status HTTP certo, ou null se não for isso.
 *
 * A mensagem deixou de citar só o runner Claude em 02/08: `/trabalhar <projeto>` passou a
 * gerar job do tipo `pipeline`, e uma mensagem que nomeia o runner errado manda quem
 * diagnostica olhar para o lugar errado.
 */
function statusRunnerAusente(erro: unknown): { status: number; erro: string } | null {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  if (mensagem.includes("Tipo de job desconhecido")) {
    return {
      status: 503,
      erro:
        "Execução de fluxos indisponível: runner não registrado no servidor" +
        ` (${mensagem}). Os fluxos da fábrica precisam dos runners "claude" e "pipeline".`,
    };
  }
  return null;
}

/**
 * Disparo das ações da fábrica (T-011): POST cria um job "claude" que roda o comando
 * correspondente. A LISTA/descrição das ações continua em /api/fabrica; aqui é só o
 * disparo. Requer o runner "claude" registrado (feito na inicialização do servidor).
 */
export const prefixo = "/api/acoes";

export const router: Router = Router();

/**
 * POST /api/acoes/analisar — corpo { projeto, estrategia?, maxTurns? }. Cria o job de
 * ANÁLISE (T-012): lê o código do projeto e gera/atualiza `_gestao/ANALISE.md`. Definida
 * ANTES de `/:id` para o Express não tratar "analisar" como um id de ação.
 */
router.post("/analisar", async (req, res) => {
  const corpo = (req.body ?? {}) as {
    projeto?: unknown;
    estrategia?: unknown;
    maxTurns?: unknown;
  };

  if (typeof corpo.projeto !== "string" || corpo.projeto.trim() === "") {
    res.status(400).json({ erro: "Campo `projeto` é obrigatório." });
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
    const novo = await montarJobAnalise(corpo.projeto.trim(), config.fabricaRaiz, {
      modelo: estrategia.modelo,
      fallback: estrategia.fallback,
      ...(typeof corpo.maxTurns === "number" ? { maxTurns: corpo.maxTurns } : {}),
    });
    const job = obterGerenciador().criarJob(novo);
    res.status(201).json({ job });
  } catch (erro) {
    if (erro instanceof ErroProjetoInexistente) {
      res.status(404).json({ erro: erro.message });
      return;
    }
    const runnerAusente = statusRunnerAusente(erro);
    if (runnerAusente) {
      res.status(runnerAusente.status).json({ erro: runnerAusente.erro });
      return;
    }
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    res.status(500).json({ erro: `Não foi possível criar o job: ${mensagem}` });
  }
});

/**
 * Teto máximo aceito num disparo (US$). Não é política de custo — é anteparo de DIGITAÇÃO:
 * um zero a mais num campo de texto vira uma rodada de US$ 800 sem que nada pergunte nada.
 * Quem quiser mais que isto edita a tabela de guardrails, que é onde a decisão mora.
 */
const TETO_MAXIMO_USD = 100;

/**
 * POST /api/acoes/:id — corpo { argumentos?, estrategia?, maxTurns?, tetoUsd? } → cria o job.
 *
 * `tetoUsd` sobrepõe o teto da tabela para ESTE disparo. Existe desde 21/08, quando o cartão
 * passou a mostrar a estimativa medida do projeto ao lado do teto vigente: mostrar o número
 * sem deixar mexer nele seria informar e não dar decisão.
 */
router.post("/:id", async (req, res) => {
  const corpo = (req.body ?? {}) as {
    argumentos?: unknown;
    estrategia?: unknown;
    maxTurns?: unknown;
    tetoUsd?: unknown;
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
  if (corpo.tetoUsd !== undefined) {
    const t = corpo.tetoUsd;
    if (typeof t !== "number" || !Number.isFinite(t) || t <= 0 || t > TETO_MAXIMO_USD) {
      res.status(400).json({
        erro: `Campo \`tetoUsd\` deve ser um número entre 0 e ${TETO_MAXIMO_USD}.`,
      });
      return;
    }
  }

  const argumentos = typeof corpo.argumentos === "string" ? corpo.argumentos : "";

  try {
    // Agentes dinâmicos: só /trabalhar <projeto> com equipe.json recebe especialistas.
    const agentes = await agentesParaAcao(
      config.fabricaRaiz,
      req.params.id,
      argumentos,
      estrategia.reforco,
    );

    const novo = montarJobAcao(
      {
        id: req.params.id,
        argumentos,
        modelo: estrategia.modelo,
        fallback: estrategia.fallback,
        reforco: estrategia.reforco,
        ...(agentes ? { agentes } : {}),
        ...(typeof corpo.maxTurns === "number" ? { maxTurns: corpo.maxTurns } : {}),
        ...(typeof corpo.tetoUsd === "number" ? { tetoUsd: corpo.tetoUsd } : {}),
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
    const runnerAusente = statusRunnerAusente(erro);
    if (runnerAusente) {
      res.status(runnerAusente.status).json({ erro: runnerAusente.erro });
      return;
    }
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    res.status(500).json({ erro: `Não foi possível criar o job: ${mensagem}` });
  }
});
