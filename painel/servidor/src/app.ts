import { existsSync } from "node:fs";
import { join } from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { carregarRotas } from "./agregador-rotas.js";
import { config } from "./config.js";

/** Erros de middlewares/rotas podem trazer o status HTTP (ex.: express.json usa 400/413/415). */
type ErroComStatus = Error & { status?: unknown; statusCode?: unknown };

/** Extrai o status HTTP do erro quando válido (4xx/5xx); qualquer outra coisa vira 500. */
function statusDoErro(erro: ErroComStatus): number {
  const bruto = erro.status ?? erro.statusCode;
  return typeof bruto === "number" && Number.isInteger(bruto) && bruto >= 400 && bruto <= 599
    ? bruto
    : 500;
}

/** Mensagens PT-BR para os erros de cliente mais comuns (sem vazar detalhes internos). */
const MENSAGENS_4XX: Record<number, string> = {
  400: "Requisição inválida (corpo malformado)",
  413: "Corpo da requisição grande demais",
  415: "Tipo de conteúdo não suportado",
};

/** Cria o app Express com rotas dinâmicas, SPA buildada e tratamento de erro. */
export async function criarApp(): Promise<Express> {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());

  const montadas = await carregarRotas(app);
  console.log(`[rotas] montadas: ${montadas.join(", ") || "(nenhuma)"}`);

  // Rota /api desconhecida: 404 em JSON (nunca cai no fallback da SPA).
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({ erro: "Rota de API não encontrada" });
  });

  // Produção local: serve a SPA buildada com fallback para as rotas do react-router.
  if (existsSync(config.webDist)) {
    app.use(express.static(config.webDist));
    app.use((req: Request, res: Response, next: NextFunction) => {
      // HEAD espelha GET (res.sendFile já omite o corpo em HEAD).
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      res.sendFile(join(config.webDist, "index.html"));
    });
  } else {
    console.warn(
      `[web] ${config.webDist} não existe — rode "npm run build" para servir a SPA (em dev, use o Vite em http://localhost:5173).`,
    );
  }

  // Error handler final em JSON (assinatura de 4 argumentos é obrigatória).
  // Respeita o status que o erro trouxer (4xx = erro do CLIENTE, ex.: JSON malformado
  // no express.json → 400); sem status válido, é falha do servidor → 500.
  app.use((erro: ErroComStatus, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(erro); // resposta já em streaming: delega ao Express
    const status = statusDoErro(erro);
    if (status >= 500) {
      console.error("[erro]", erro);
      res.status(status).json({ erro: "Erro interno do servidor" });
    } else {
      console.warn(`[erro-cliente] ${status}: ${erro.message}`);
      res.status(status).json({ erro: MENSAGENS_4XX[status] ?? "Erro na requisição" });
    }
  });

  return app;
}
