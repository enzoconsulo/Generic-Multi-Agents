import { Router } from "express";
import { ErroInputJaRespondido, ErroInputNaoEncontrado } from "../jobs/inputs.js";
import { obterGerenciador } from "../jobs/instancia.js";
import type { RespostaInput } from "../jobs/tipos.js";

/**
 * Inputs pendentes (T-010): quando um fluxo precisa de aprovação de ferramenta ou faz uma
 * pergunta, o job pausa em `aguardando-input` e a pendência aparece aqui. O usuário responde
 * e o fluxo destrava. Eventos `input-pendente`/`input-respondido` saem pelo SSE (/api/eventos).
 */
export const prefixo = "/api/inputs";

export const router: Router = Router();

/** GET /api/inputs — pendências ABERTAS (aguardando resposta), com textos em PT-BR. */
router.get("/", (_req, res) => {
  res.json({ inputs: obterGerenciador().listarInputs() });
});

/**
 * POST /api/inputs/:id/resposta — corpo { aprovado?, mensagem?, escolha? }.
 * Aprovação de ferramenta: `aprovado` (+`mensagem` opcional na negação). Pergunta: `escolha`.
 * 404 se a pendência não existe; 409 se já foi respondida.
 */
router.post("/:id/resposta", (req, res) => {
  const corpo = (req.body ?? {}) as {
    aprovado?: unknown;
    mensagem?: unknown;
    escolha?: unknown;
  };

  const resposta: RespostaInput = {};
  if (typeof corpo.aprovado === "boolean") resposta.aprovado = corpo.aprovado;
  if (typeof corpo.mensagem === "string") resposta.mensagem = corpo.mensagem;
  if (typeof corpo.escolha === "string") resposta.escolha = corpo.escolha;

  try {
    const pendencia = obterGerenciador().responderInput(req.params.id, resposta);
    res.json({ pendencia });
  } catch (erro) {
    if (erro instanceof ErroInputNaoEncontrado) {
      res.status(404).json({ erro: erro.message });
      return;
    }
    if (erro instanceof ErroInputJaRespondido) {
      res.status(409).json({ erro: erro.message });
      return;
    }
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    res.status(500).json({ erro: `Não foi possível responder o input: ${mensagem}` });
  }
});
