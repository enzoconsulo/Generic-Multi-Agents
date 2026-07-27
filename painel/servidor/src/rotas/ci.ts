import { Router } from "express";
import { dirProjeto } from "../acoes/analise.js";
import { config } from "../config.js";
import {
  ErroConfigCiInvalida,
  ErroSemPackageJson,
  lerOuCriarConfig,
  salvarConfig,
} from "../ci/config.js";
import { lerResultados } from "../ci/resultados.js";
import { montarJobCi } from "../ci/runner-ci.js";
import { obterGerenciador } from "../jobs/instancia.js";

/**
 * CI local por projeto (T-017): disparar o pipeline, consultar resultado/histórico e
 * editar `_gestao/ci.json` pela API. O runner "ci" precisa estar registrado
 * (`inicializar.ts`); sem ele, o disparo responde 503 (mesmo padrão de acoes.ts).
 */
export const prefixo = "/api/ci";

export const router: Router = Router();

function resolverProjetoOu404(req: { params: { projeto: string } }, res: { status: (n: number) => { json: (b: unknown) => void } }): string | null {
  const dir = dirProjeto(config.fabricaRaiz, req.params.projeto);
  if (dir === null) {
    res.status(404).json({ erro: `Projeto "${req.params.projeto}" não encontrado` });
    return null;
  }
  return dir;
}

/** POST /api/ci/:projeto/rodar — cria o job de CI (não-Claude) e devolve 201 com o job. */
router.post("/:projeto/rodar", async (req, res) => {
  const dir = resolverProjetoOu404(req, res);
  if (dir === null) return;

  try {
    const novo = await montarJobCi(req.params.projeto, config.fabricaRaiz, config.dirDados);
    const job = obterGerenciador().criarJob(novo);
    res.status(201).json({ job });
  } catch (erro) {
    if (erro instanceof ErroSemPackageJson) {
      res.status(422).json({ erro: erro.message });
      return;
    }
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (mensagem.includes("Tipo de job desconhecido")) {
      res.status(503).json({ erro: "CI indisponível: runner de CI não registrado no servidor." });
      return;
    }
    res.status(500).json({ erro: `Não foi possível criar o job de CI: ${mensagem}` });
  }
});

/** GET /api/ci/:projeto — último resultado + histórico (null/[] se nunca rodou). */
router.get("/:projeto", (req, res) => {
  if (resolverProjetoOu404(req, res) === null) return;
  const dados = lerResultados(config.dirDados, req.params.projeto);
  res.json({ ultimo: dados?.ultimo ?? null, historico: dados?.historico ?? [] });
});

/** GET /api/ci/:projeto/config — config (cria defaults deduzidos do package.json se faltar). */
router.get("/:projeto/config", async (req, res) => {
  const dir = resolverProjetoOu404(req, res);
  if (dir === null) return;
  try {
    const cfg = await lerOuCriarConfig(dir, req.params.projeto);
    res.json({ config: cfg });
  } catch (erro) {
    if (erro instanceof ErroSemPackageJson) {
      res.status(422).json({ erro: erro.message });
      return;
    }
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    res.status(500).json({ erro: `Não foi possível ler a config de CI: ${mensagem}` });
  }
});

/** PUT /api/ci/:projeto/config — corpo é a config completa; valida e grava. */
router.put("/:projeto/config", async (req, res) => {
  const dir = resolverProjetoOu404(req, res);
  if (dir === null) return;
  try {
    const salva = await salvarConfig(dir, req.body);
    res.json({ config: salva });
  } catch (erro) {
    if (erro instanceof ErroConfigCiInvalida) {
      res.status(400).json({ erro: erro.message });
      return;
    }
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    res.status(500).json({ erro: `Não foi possível salvar a config de CI: ${mensagem}` });
  }
});
