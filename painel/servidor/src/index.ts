import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { criarApp } from "./app.js";
import { config, fabricaRaizExiste } from "./config.js";
import { inicializarPainel } from "./inicializar.js";

/**
 * CONTENÇÃO DE QUEDA. Sem isto, QUALQUER exceção assíncrona sem dono — um `res.write` num
 * SSE cujo socket morreu, um `error` de stream sem listener, uma promessa rejeitada fora de
 * cadeia — derruba o processo INTEIRO, em silêncio. Custo real: o job em voo é cortado no
 * meio, e como o `<id>.log.jsonl` só é gravado no assentamento, ele nem log deixa. Foi assim
 * que os jobs `67de2cb4` e `57cb7ac9` (08/08) sumiram sem uma linha de diagnóstico.
 *
 * Decisão deliberada: **registrar e SEGUIR**, em vez do `process.exit(1)` que a convenção
 * recomenda. O painel é cockpit local de um usuário só, e aqui a troca é assimétrica —
 * morrer destrói trabalho de agente já pago e sem evidência; seguir num estado talvez
 * degradado, mas com o rastro em disco, é estritamente melhor. O rastro vai para
 * `dados/quedas.log` justamente porque o console fecha junto com a janela.
 */
function registrarQueda(tipo: string, erro: unknown): void {
  const detalhe = erro instanceof Error ? (erro.stack ?? erro.message) : String(erro);
  const linha = `\n[${new Date().toISOString()}] ${tipo}\n${detalhe}\n`;
  console.error(`[queda] ${tipo}: ${detalhe}`);
  try {
    mkdirSync(config.dirDados, { recursive: true });
    appendFileSync(join(config.dirDados, "quedas.log"), linha, "utf8");
  } catch {
    // Se nem o log de queda dá para gravar, o console acima já é o que temos.
  }
}

process.on("uncaughtException", (erro) => registrarQueda("uncaughtException", erro));
process.on("unhandledRejection", (motivo) => registrarQueda("unhandledRejection", motivo));

const app = await criarApp();

// Registra o runner Claude e liga o hub SSE ao motor de jobs (só em produção/execução
// real; os testes de rota controlam isso por conta própria).
inicializarPainel();

if (!fabricaRaizExiste()) {
  console.warn(
    `[config] Atenção: raiz da fábrica não encontrada em ${config.fabricaRaiz} — defina a env FABRICA_RAIZ se necessário.`,
  );
}

// Bind EXPLÍCITO em loopback: o painel nunca escuta fora de 127.0.0.1.
app.listen(config.porta, config.host, () => {
  console.log(`Painel da Fábrica escutando em http://${config.host}:${config.porta}`);
  console.log(`Raiz da fábrica: ${config.fabricaRaiz}`);
});
