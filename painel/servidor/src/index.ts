import { appendFileSync, mkdirSync } from "node:fs";
import { freemem, totalmem } from "node:os";
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

/**
 * PULSO DE VIDA — o que separa "morri de memória" de "me mataram".
 *
 * As quedas de 08/08 não deixaram NADA: nem `quedas.log` (logo não foi exceção de JS), nem
 * evento de falha do Windows (logo não foi abort). As duas explicações que sobram são
 * indistinguíveis pelo que existe hoje: (a) o processo foi terminado de fora — e agentes
 * desta fábrica comprovadamente rodam `taskkill`, com o painel sendo *também* um `node.exe`;
 * (b) a máquina (7,9 GB, limite de commit ~9,7 GB) ficou sem memória.
 *
 * O pulso resolve isso sem custo relevante: uma linha a cada 30s com memória livre e uso do
 * processo. Se o arquivo terminar com memória saudável, foi morte externa. Se terminar com a
 * memória despencando, foi esgotamento. `SIGTERM`/`SIGINT` também são anotados, então um
 * encerramento pedido nunca é confundido com queda.
 */
function pulso(evento: string): void {
  const livreMb = Math.round(freemem() / 1024 / 1024);
  const totalMb = Math.round(totalmem() / 1024 / 1024);
  const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const linha =
    `[${new Date().toISOString()}] ${evento} pid=${process.pid} ` +
    `rss=${rssMb}MB livre=${livreMb}/${totalMb}MB\n`;
  try {
    mkdirSync(config.dirDados, { recursive: true });
    appendFileSync(join(config.dirDados, "pulso.log"), linha, "utf8");
  } catch {
    // Diagnóstico é conveniência: nunca pode atrapalhar o painel.
  }
}

pulso("subiu");
// `unref` para o pulso jamais segurar o processo vivo sozinho.
setInterval(() => pulso("vivo"), 30_000).unref();
for (const sinal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] as const) {
  process.on(sinal, () => {
    pulso(`encerrado por ${sinal}`);
    process.exit(0);
  });
}

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
