import { Router } from "express";
import { config, resolverEstrategia } from "../config.js";
import { obterGerenciador } from "../jobs/instancia.js";
import {
  ErroImportacao,
  montarJobImportar,
  validarImportacao,
} from "../projetos/importar.js";

/**
 * Cadastro de projetos pela web (T-013). Criar projeto NOVO já é a ação `/novo-projeto`
 * (T-011, home); aqui fica a IMPORTAÇÃO de uma pasta existente.
 *
 * Mesmo prefixo do leitor de projetos (`/api/projetos`): o agregador monta os dois routers
 * e o Express casa por método+caminho (POST /importar só existe aqui; os GET caem no leitor).
 */
export const prefixo = "/api/projetos";

export const router: Router = Router();

/**
 * POST /api/projetos/importar — corpo { caminho, nome?, estrategia? }. Valida (rápido) e
 * cria um job NÃO-Claude que copia a pasta para `projetos/<nome>/`, garante git + `_gestao/`
 * e enfileira a análise. 400 validação, 409 nome em uso, 201 com o job criado.
 */
router.post("/importar", (req, res) => {
  const corpo = (req.body ?? {}) as {
    caminho?: unknown;
    nome?: unknown;
    estrategia?: unknown;
  };

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

  try {
    const validada = validarImportacao(corpo.caminho, corpo.nome, config.fabricaRaiz);
    const novo = montarJobImportar(validada, config.fabricaRaiz, {
      modeloAnalise: estrategia.modelo,
      fallbackAnalise: estrategia.fallback,
    });
    const job = obterGerenciador().criarJob(novo);
    res.status(201).json({ job });
  } catch (erro) {
    if (erro instanceof ErroImportacao) {
      res.status(erro.status).json({ erro: erro.message });
      return;
    }
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (mensagem.includes("Tipo de job desconhecido")) {
      res.status(503).json({
        erro: "Importação indisponível: runner de importação não registrado no servidor.",
      });
      return;
    }
    res.status(500).json({ erro: `Não foi possível importar: ${mensagem}` });
  }
});
