/**
 * Suíte do `captura.mjs` — a primeira que esta ferramenta tem.
 *
 * POR QUE EXISTE. `captura.mjs` é a espinha da prova visual de TODO projeto web da fábrica,
 * e tinha **zero** teste enquanto o painel tinha mil. O preço apareceu de uma vez só, em
 * 2026-08-14: três defeitos que viviam nela havia meses, nenhum deles capturável por leitura.
 *
 *   1. `--largura=390` entregava um viewport de 496 (pedia tamanho de JANELA, que tem mínimo).
 *      Uma fase inteira do banco-imobiliario foi julgada na régua errada, e dois agentes
 *      chegaram a conclusões opostas sobre o mesmo modal.
 *   2. O Edge headless responde `prefers-reduced-motion: reduce`. Toda tarefa de animação
 *      fotografava o caminho ACESSÍVEL achando que fotografava o normal — evidência que
 *      provava o contrário do que a tarefa pedia.
 *   3. `filho.kill()` matava só o processo de topo e deixava a árvore do navegador órfã.
 *      Órfão acumulado já derrubou o painel levando junto o job em voo.
 *
 * Todos os três eram invisíveis para quem lesse o código e óbvios para quem RODASSE. Por isso
 * esta suíte é de integração de verdade: sobe o navegador, mede, e confere o que sobrou vivo.
 * Roda em segundos e não gasta modelo.
 *
 * Uso: `node --test _sistema/ferramentas/`
 *
 * NÃO entra no `npm test` do painel de propósito: aquela suíte não toca dependência externa,
 * e subir navegador é exatamente isso.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const AQUI = dirname(fileURLToPath(import.meta.url));
const CAPTURA = join(AQUI, "captura.mjs");

/** Roda a ferramenta e devolve saída + código, sem lançar em código != 0. */
async function capturar(args) {
  try {
    const { stdout, stderr } = await exec(process.execPath, [CAPTURA, ...args], {
      timeout: 120_000,
    });
    return { codigo: 0, stdout, stderr };
  } catch (e) {
    return { codigo: e.code ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

/** Dimensão real do PNG, lida do cabeçalho (bytes 16..23, big-endian). */
function dimensaoPng(caminho) {
  const b = readFileSync(caminho);
  return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) };
}

/** Quantos processos de navegador existem agora (só Windows; noutro SO devolve null). */
function navegadoresVivos() {
  if (process.platform !== "win32") return null;
  const saida = execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "(Get-Process msedge,chrome -ErrorAction SilentlyContinue | Measure-Object).Count",
    ],
    { encoding: "utf8" },
  );
  return Number(saida.trim());
}

const png = (nome) => join(tmpdir(), `captura-teste-${process.pid}-${nome}.png`);

test("o viewport pedido é o viewport entregue, inclusive em largura de celular", async () => {
  // 390 e 360 são MENORES que a largura mínima de janela do headless (~496): antes do
  // `setDeviceMetricsOverride` eram inalcançáveis, e pedir 390 devolvia 496 em silêncio.
  for (const [largura, altura] of [
    [390, 844],
    [360, 640],
    [1400, 900],
  ]) {
    const arquivo = png(`vp-${largura}`);
    const r = await capturar([
      "about:blank",
      arquivo,
      `--largura=${largura}`,
      `--altura=${altura}`,
      "--espera=400",
    ]);
    assert.equal(r.codigo, 0, `saída ${r.codigo} para ${largura}x${altura}: ${r.stderr}`);
    assert.match(
      r.stdout,
      new RegExp(`viewport: ${largura}x${altura} \\(pedido ${largura}x${altura}\\)`),
      "a linha `viewport:` precisa sair SEMPRE e bater — é ela que vai para as Notas",
    );
    const d = dimensaoPng(arquivo);
    assert.equal(d.largura, largura, `o PNG saiu com ${d.largura}px de largura`);
    rmSync(arquivo, { force: true });
  }
});

test("o navegador NÃO reporta movimento reduzido por padrão", async () => {
  // A armadilha que fez toda tarefa de animação da fábrica fotografar o caminho acessível.
  const arquivo = png("prm");
  const r = await capturar([
    "about:blank",
    arquivo,
    "--espera=400",
    "--exigir=matchMedia('(prefers-reduced-motion: reduce)').matches === false",
  ]);
  assert.equal(
    r.codigo,
    0,
    "o padrão tem de ser `no-preference`: o usuário comum não pediu menos movimento",
  );
  rmSync(arquivo, { force: true });
});

test("--movimento-reduzido fotografa o caminho acessível quando pedido", async () => {
  const arquivo = png("prm-on");
  const r = await capturar([
    "about:blank",
    arquivo,
    "--espera=400",
    "--movimento-reduzido",
    "--exigir=matchMedia('(prefers-reduced-motion: reduce)').matches === true",
  ]);
  assert.equal(r.codigo, 0, "verificar o caminho acessível é requisito real, não deve sumir");
  rmSync(arquivo, { force: true });
});

test("--exigir decide: verdadeiro sai 0, falso sai 3", async () => {
  const a = png("ex-ok");
  const ok = await capturar(["about:blank", a, "--espera=400", "--exigir=1 + 1 === 2"]);
  assert.equal(ok.codigo, 0);
  rmSync(a, { force: true });

  const b = png("ex-nao");
  const nao = await capturar(["about:blank", b, "--espera=400", "--exigir=1 + 1 === 3"]);
  assert.equal(nao.codigo, 3, "afirmação falsa PRECISA reprovar — senão a ferramenta só sabe passar");
  rmSync(b, { force: true });
});

test("o PNG é gravado mesmo quando a afirmação falha", async () => {
  // Deliberado: quando a exigência falha é justamente quando o verificador mais precisa ver
  // a tela. Falhar antes de gravar deixaria o portão sem o que julgar.
  const arquivo = png("falha-grava");
  const r = await capturar(["about:blank", arquivo, "--espera=400", "--exigir=false"]);
  assert.equal(r.codigo, 3);
  assert.ok(dimensaoPng(arquivo).largura > 0, "o retrato tem de estar no disco mesmo reprovando");
  rmSync(arquivo, { force: true });
});

test("não deixa processo de navegador para trás", async () => {
  // O defeito que já derrubou o painel: matar o processo de topo deixa renderer/GPU órfãos.
  const antes = navegadoresVivos();
  if (antes === null) return; // só faz sentido no Windows

  const arquivo = png("orfao");
  await capturar(["about:blank", arquivo, "--espera=400"]);
  rmSync(arquivo, { force: true });

  // O encerramento da árvore não é instantâneo.
  await new Promise((r) => setTimeout(r, 2500));
  const depois = navegadoresVivos();
  assert.ok(
    depois <= antes,
    `sobraram ${depois - antes} processo(s) de navegador: a árvore não foi encerrada`,
  );
});

test("duas capturas SIMULTÂNEAS não disputam porta nem perfil", async () => {
  // A fábrica roda até 3 construtores em paralelo. Com porta e perfil fixos, o segundo
  // processo podia conversar com o DevTools do primeiro e fotografar a página ERRADA —
  // evidência trocada em silêncio, a pior classe de defeito para um portão de verificação.
  const a = png("par-a");
  const b = png("par-b");
  const [ra, rb] = await Promise.all([
    capturar(["about:blank", a, "--largura=390", "--altura=844", "--espera=400"]),
    capturar(["about:blank", b, "--largura=1400", "--altura=900", "--espera=400"]),
  ]);
  assert.equal(ra.codigo, 0, `primeira captura falhou: ${ra.stderr}`);
  assert.equal(rb.codigo, 0, `segunda captura falhou: ${rb.stderr}`);
  assert.equal(dimensaoPng(a).largura, 390, "a captura A pegou o viewport da B");
  assert.equal(dimensaoPng(b).largura, 1400, "a captura B pegou o viewport da A");
  rmSync(a, { force: true });
  rmSync(b, { force: true });
});
