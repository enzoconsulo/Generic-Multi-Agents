import { Router, type Request, type Response } from "express";
import { config, resolverEstrategia } from "../config.js";
import { dirProjeto } from "../acoes/analise.js";
import { ErroPilotoDesligado } from "../jobs/piloto/piloto.js";
import { obterPiloto } from "../jobs/piloto/instancia.js";

/**
 * PILOTO AUTOMÁTICO (24/08): liga/desliga o encadeamento de rodadas de `/trabalhar`.
 *
 * Três verbos e nada mais. O estado inteiro do laço vive no servidor (`dados/piloto.json`)
 * porque um laço que gasta a assinatura não pode depender de uma aba aberta: fechar o
 * navegador não pode nem parar nem duplicar rodada.
 *
 * **POST aqui JÁ EXECUTA** — cria a primeira rodada na hora, como `POST /api/acoes/:id`.
 * A tela avisa o custo ANTES do clique; aqui não há disparo "a seco".
 */
export const prefixo = "/api/piloto";

export const router: Router = Router();

/**
 * Anteparos de DIGITAÇÃO, não política de custo (mesma razão do `TETO_MAXIMO_USD` das
 * ações): um zero a mais num campo de texto não pode virar uma noite de US$ 800.
 */
const TETO_TOTAL_MAXIMO_USD = 200;
const MAX_RODADAS_MAXIMO = 50;

router.get("/", (_req: Request, res: Response) => {
  res.json({ piloto: obterPiloto().estado() });
});

router.post("/", (req: Request, res: Response) => {
  const corpo = (req.body ?? {}) as {
    projeto?: unknown;
    estrategia?: unknown;
    tetoUsdPorRodada?: unknown;
    tetoTotalUsd?: unknown;
    maxRodadas?: unknown;
  };

  if (typeof corpo.projeto !== "string" || corpo.projeto.trim() === "") {
    res.status(400).json({ erro: "Campo `projeto` é obrigatório." });
    return;
  }
  const projeto = corpo.projeto.trim();
  if (dirProjeto(config.fabricaRaiz, projeto) === null) {
    res.status(404).json({ erro: `Projeto não encontrado: "${projeto}"` });
    return;
  }

  const idEstrategia =
    typeof corpo.estrategia === "string" && corpo.estrategia !== ""
      ? corpo.estrategia
      : config.estrategiaPadrao;
  if (resolverEstrategia(idEstrategia) === undefined) {
    res.status(400).json({
      erro: `Estratégia de modelo inválida. Use uma de: ${config.estrategiasModelo
        .map((e) => e.id)
        .join(", ")}.`,
    });
    return;
  }

  const tetoTotalUsd = corpo.tetoTotalUsd;
  if (
    typeof tetoTotalUsd !== "number" ||
    !Number.isFinite(tetoTotalUsd) ||
    tetoTotalUsd <= 0 ||
    tetoTotalUsd > TETO_TOTAL_MAXIMO_USD
  ) {
    res.status(400).json({
      erro: `Campo \`tetoTotalUsd\` deve ser um número entre 0 e ${TETO_TOTAL_MAXIMO_USD}.`,
    });
    return;
  }

  const maxRodadas = corpo.maxRodadas;
  if (
    !Number.isInteger(maxRodadas as number) ||
    (maxRodadas as number) < 1 ||
    (maxRodadas as number) > MAX_RODADAS_MAXIMO
  ) {
    res.status(400).json({
      erro: `Campo \`maxRodadas\` deve ser um inteiro entre 1 e ${MAX_RODADAS_MAXIMO}.`,
    });
    return;
  }

  const porRodada = corpo.tetoUsdPorRodada;
  if (porRodada !== undefined && porRodada !== null) {
    if (typeof porRodada !== "number" || !Number.isFinite(porRodada) || porRodada <= 0) {
      res.status(400).json({ erro: "Campo `tetoUsdPorRodada` deve ser um número positivo." });
      return;
    }
    if (porRodada > tetoTotalUsd) {
      res.status(400).json({
        erro: "O teto por rodada não pode ser maior que o teto acumulado do piloto.",
      });
      return;
    }
  }

  try {
    const piloto = obterPiloto().ligar({
      projeto,
      estrategia: idEstrategia,
      tetoUsdPorRodada: typeof porRodada === "number" ? porRodada : null,
      limites: { tetoTotalUsd, maxRodadas: maxRodadas as number },
    });
    res.status(201).json({ piloto });
  } catch (erro) {
    const texto = erro instanceof Error ? erro.message : String(erro);
    res.status(500).json({ erro: `Não foi possível ligar o piloto: ${texto}` });
  }
});

/** DELETE — desliga. A rodada em voo NÃO é cancelada (ver o cabeçalho de `piloto.ts`). */
router.delete("/", (_req: Request, res: Response) => {
  try {
    res.json({ piloto: obterPiloto().desligar() });
  } catch (erro) {
    if (erro instanceof ErroPilotoDesligado) {
      res.status(409).json({ erro: erro.message });
      return;
    }
    const texto = erro instanceof Error ? erro.message : String(erro);
    res.status(500).json({ erro: `Não foi possível desligar o piloto: ${texto}` });
  }
});
