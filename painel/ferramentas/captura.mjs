/**
 * Captura de tela do painel para VERIFICAÇÃO VISUAL — a lacuna que sobrou do projeto
 * inteiro (nenhuma tela tinha sido vista renderizada).
 *
 * Dirige o Edge/Chrome já instalado no Windows pelo DevTools Protocol. Sem dependência
 * nova: o Node 22 tem `WebSocket` e `fetch` nativos.
 *
 * Por que CDP e não `--screenshot` direto: o modo simples captura ANTES de o React
 * resolver as chamadas de API — sai "Carregando…" em toda seção. E
 * `--virtual-time-budget`, que existiria para isso, derruba o navegador nesta máquina.
 * Com CDP dá para esperar o load, dar um respiro para o fetch e só então capturar.
 *
 * Uso:
 *   node ferramentas/captura.mjs <url> <arquivo.png> [--espera=2500] [--altura=1200]
 */

import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

const NAVEGADORES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

const url = process.argv[2];
const saida = process.argv[3];
if (!url || !saida) {
  console.error("uso: node ferramentas/captura.mjs <url> <arquivo.png> [--espera=ms] [--altura=px]");
  process.exit(1);
}
const arg = (nome, padrao) => {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? Number(achado.split("=")[1]) : padrao;
};
const espera = arg("espera", 2500);
const altura = arg("altura", 1200);
const largura = arg("largura", 1400);
const porta = arg("porta", 9333);

const navegador = NAVEGADORES.find((p) => existsSync(p));
if (!navegador) {
  console.error("Nenhum Edge/Chrome encontrado nos caminhos padrão do Windows.");
  process.exit(1);
}

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

const filho = spawn(
  navegador,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    `--remote-debugging-port=${porta}`,
    `--window-size=${largura},${altura}`,
    // Perfil descartável: sem isto ele pode reaproveitar uma sessão aberta do usuário.
    `--user-data-dir=${process.env.TEMP}\\captura-perfil-${porta}`,
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);

let ws;
try {
  // O DevTools demora alguns instantes para abrir a porta.
  let alvo = null;
  for (let i = 0; i < 40 && alvo === null; i++) {
    await dorme(250);
    try {
      const lista = await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json();
      alvo = lista.find((t) => t.type === "page") ?? null;
    } catch {
      /* ainda subindo */
    }
  }
  if (alvo === null) throw new Error(`DevTools não respondeu na porta ${porta}`);

  ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((ok, falha) => {
    ws.onopen = ok;
    ws.onerror = () => falha(new Error("falha ao conectar no DevTools"));
  });

  let id = 0;
  const pendentes = new Map();
  const eventos = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id !== undefined) {
      pendentes.get(msg.id)?.(msg.result);
      pendentes.delete(msg.id);
    } else if (msg.method) {
      eventos.get(msg.method)?.();
    }
  };
  const cmd = (method, params = {}) =>
    new Promise((ok) => {
      const meu = ++id;
      pendentes.set(meu, ok);
      ws.send(JSON.stringify({ id: meu, method, params }));
    });

  await cmd("Page.enable");
  const carregou = new Promise((ok) => eventos.set("Page.loadEventFired", ok));
  await cmd("Page.navigate", { url });
  await Promise.race([carregou, dorme(15000)]);

  // Respiro para o React resolver os fetches e pintar — é exatamente o que falta no
  // `--screenshot` simples.
  await dorme(espera);

  const { data } = await cmd("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true, // página inteira, não só a dobra
  });
  writeFileSync(saida, Buffer.from(data, "base64"));
  console.log(`ok: ${saida}`);
} catch (erro) {
  console.error("falhou:", erro.message);
  process.exitCode = 1;
} finally {
  try {
    ws?.close();
  } catch {
    /* já fechado */
  }
  filho.kill();
}
