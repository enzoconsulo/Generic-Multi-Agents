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
 *   node _sistema/ferramentas/captura.mjs <url> <arquivo.png> [--espera=2500] [--altura=1200]
 *                                [--console]
 *                                [--js="<expressão>"] [--pos-espera=1200]
 *
 * `--js` roda uma expressão na página ANTES de capturar (e `--pos-espera` dá tempo do
 * resultado pintar). É o que permite conferir tela que só existe depois de um clique —
 * caixa que abre, item que expande. Sem isso só se vê o estado inicial.
 *   --js="[...document.querySelectorAll('.caixa-cab')].at(-1).click()"
 *
 * `--console` reporta erros/avisos da página e falhas de rede, e sai com código 2 se
 * houver algum. O PNG prova que a tela PINTOU; não prova que ela FUNCIONA — um TypeError
 * num handler de clique não muda um pixel. Para varrer telas em lote, é o que dá veredito
 * sem precisar olhar imagem por imagem.
 *
 * `--exigir="<expressão>"` AFIRMA algo sobre a página e sai com código 3 se a expressão for
 * falsa. Pode repetir quantas vezes quiser — todas rodam na MESMA subida de navegador, e o
 * código de saída é o veredito do conjunto:
 *   --exigir="getComputedStyle(document.querySelector('.botao')).height >= '44px'"
 *   --exigir="document.querySelector('.modal').getBoundingClientRect().top > innerHeight*0.4"
 *
 * POR QUE EXISTE (medido em 10/08). Critério de UI parecia ser sempre "julgamento", então
 * ia inteiro para o verificador: na T-034, 4 dos 5 critérios saíram `[julgado]` e o testador
 * refez do zero o mesmo ritual do executor — subir servidor, forçar a jogada por socket,
 * dirigir o navegador — para remedir números que o executor já tinha medido. Duas contas
 * caras para a mesma pergunta.
 *
 * Mas critério visual quase nunca é uma coisa só: "o modal fica ancorado na base e não cobre
 * o tabuleiro" tem uma parte GEOMÉTRICA (mensurável, objetiva) e uma parte ESTÉTICA (ficou
 * bom?). A geométrica é exatamente o que `--exigir` responde, antes de gastar despacho. A
 * estética continua com o verificador, olhando o PNG — que esta mesma execução já gravou.
 *
 * ATENÇÃO — `--exigir` NÃO serve para escrever `verificar:` direto na tarefa, e achar que
 * servia foi um erro que durou um dia (11/08). Dois motivos, cada um fatal sozinho:
 *   1. a passada mecânica (`pipeline/criterios.ts`) recusa comando que contenha `< > ; | & $`
 *      ou crase, e afirmação geométrica é feita de `<=`/`>=` — o comando é REJEITADO antes
 *      de rodar, não executado;
 *   2. este script NÃO sobe servidor. Um `verificar:` apontado para `localhost:3000` numa
 *      passada mecânica bate em porta morta e vira reprovação falsa.
 * Em `verificar:`, use uma CENA nomeada versionada no projeto
 * (`node ferramentas/cenario.mjs --cena=<nome>`), que sobe o servidor, monta o estado e
 * chama este script por dentro, com as expressões no código. `--exigir` continua valendo
 * — e é ótimo — quando um agente ou uma pessoa roda a captura à mão.
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
/** Argumento de texto (`--js=...`): pode conter `=`, então só o primeiro separa. */
const argTexto = (nome) => {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3) : null;
};
const espera = arg("espera", 2500);
const js = argTexto("js");
const posEspera = arg("pos-espera", 1200);
const altura = arg("altura", 1200);
const largura = arg("largura", 1400);
const porta = arg("porta", 9333);
/** `--console`: também reporta erros/avisos da página e falhas de rede. */
const verConsole = process.argv.includes("--console");
/**
 * `--exigir=...` repetido: TODAS as afirmações desta captura. `argTexto` pega só a primeira
 * ocorrência, e aqui a repetição é o ponto — uma subida de navegador tem de conseguir
 * responder a todos os critérios geométricos da tarefa, senão cada asserção custa um
 * servidor + um navegador de novo, que é justamente o desperdício que isto ataca.
 */
const exigencias = process.argv
  .filter((a) => a.startsWith("--exigir="))
  .map((a) => a.slice("--exigir=".length));

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
  /**
   * Erros da PÁGINA (`--console`). Captura de tela prova que a tela pintou; não prova que
   * ela funcionou — um `TypeError` num handler de clique não muda um pixel. Sem isto, um
   * "teste de clique" só olha bonito.
   */
  const problemas = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id !== undefined) {
      pendentes.get(msg.id)?.(msg.result);
      pendentes.delete(msg.id);
      return;
    }
    if (!msg.method) return;
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params?.exceptionDetails ?? {};
      problemas.push(`EXCEÇÃO: ${d.exception?.description ?? d.text ?? "erro sem descrição"}`);
    } else if (msg.method === "Runtime.consoleAPICalled") {
      if (msg.params?.type === "error" || msg.params?.type === "warning") {
        const texto = (msg.params.args ?? [])
          .map((a) => a.value ?? a.description ?? a.type)
          .join(" ");
        problemas.push(`${msg.params.type.toUpperCase()}: ${texto}`);
      }
    } else if (msg.method === "Log.entryAdded") {
      const e = msg.params?.entry ?? {};
      // Rede quebrada (404/500 em /api/...) entra por aqui, não pelo console da página.
      if (e.level === "error") problemas.push(`REDE/LOG: ${e.text ?? ""} ${e.url ?? ""}`.trim());
    }
    eventos.get(msg.method)?.();
  };
  const cmd = (method, params = {}) =>
    new Promise((ok) => {
      const meu = ++id;
      pendentes.set(meu, ok);
      ws.send(JSON.stringify({ id: meu, method, params }));
    });

  await cmd("Page.enable");
  // Ligado ANTES de navegar: erro na montagem do app é o que mais interessa e acontece
  // antes de qualquer clique.
  if (verConsole) {
    await cmd("Runtime.enable");
    await cmd("Log.enable");
  }
  const carregou = new Promise((ok) => eventos.set("Page.loadEventFired", ok));
  await cmd("Page.navigate", { url });
  await Promise.race([carregou, dorme(15000)]);

  // Respiro para o React resolver os fetches e pintar — é exatamente o que falta no
  // `--screenshot` simples.
  await dorme(espera);

  // Interação opcional: clique/scroll/preenchimento antes do retrato.
  if (js !== null) {
    // Teto obrigatório: com `awaitPromise`, uma promessa que nunca resolve — caso
    // clássico, exceção DENTRO de um setTimeout, que o `exceptionDetails` não pega —
    // deixaria a captura pendurada para sempre. Melhor fotografar o que deu e avisar.
    const r = await Promise.race([
      cmd("Runtime.evaluate", { expression: js, awaitPromise: true, returnByValue: true }),
      dorme(15000).then(() => "estourou"),
    ]);
    if (r === "estourou") {
      console.error("aviso: --js não terminou em 15s; capturando o estado atual");
    } else if (r?.exceptionDetails) {
      throw new Error(`--js falhou: ${r.exceptionDetails.text ?? "erro na expressão"}`);
    } else if (r?.result?.value !== undefined) {
      // O retorno da expressão vai para o stdout: é assim que um clique DIZ o que fez
      // ("abriu 3 campos", "achou 0 botões") sem precisar decifrar a imagem depois.
      const v = r.result.value;
      console.log(`js: ${typeof v === "string" ? v : JSON.stringify(v)}`);
    }
    await dorme(posEspera);
  }

  const { data } = await cmd("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true, // página inteira, não só a dobra
  });
  writeFileSync(saida, Buffer.from(data, "base64"));
  console.log(`ok: ${saida}`);

  if (verConsole) {
    // Repetição idêntica é ruído (um mesmo erro dispara a cada render).
    const unicos = [...new Set(problemas)];
    if (unicos.length === 0) {
      console.log("console: limpo (nenhum erro, aviso ou falha de rede)");
    } else {
      console.log(`console: ${unicos.length} problema(s)`);
      for (const p of unicos.slice(0, 30)) console.log(`  - ${p.slice(0, 300)}`);
      // Sai != 0 para o chamador poder falhar um sweep de telas sem ler PNG por PNG.
      process.exitCode = 2;
    }
  }

  // AFIRMAÇÕES. Rodam DEPOIS de o PNG estar no disco, de propósito: uma exigência que falha
  // é exatamente quando a evidência visual mais importa — o verificador precisa do retrato
  // para julgar o que a expressão não alcança. Falhar antes de gravar deixaria o portão sem
  // o que olhar.
  if (exigencias.length > 0) {
    let reprovadas = 0;
    for (const expr of exigencias) {
      let veredito;
      try {
        const r = await Promise.race([
          cmd("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }),
          dorme(15000).then(() => "estourou"),
        ]);
        if (r === "estourou") veredito = { ok: false, nota: "não terminou em 15s" };
        else if (r?.exceptionDetails)
          veredito = { ok: false, nota: `erro: ${r.exceptionDetails.text ?? "expressão inválida"}` };
        else {
          const v = r?.result?.value;
          // Truthy decide. O valor vai junto no log porque "falso" sem o número medido não
          // diz ao construtor o que consertar — e é ele quem lê isto no relatório.
          veredito = { ok: Boolean(v), nota: `valor: ${JSON.stringify(v) ?? "undefined"}` };
        }
      } catch (e) {
        veredito = { ok: false, nota: `erro: ${e?.message ?? e}` };
      }
      if (!veredito.ok) reprovadas += 1;
      console.log(`exigir[${veredito.ok ? "ok" : "FALHOU"}]: ${expr}  → ${veredito.nota}`);
    }
    if (reprovadas > 0) {
      console.log(`exigir: ${reprovadas} de ${exigencias.length} afirmação(ões) falharam`);
      process.exitCode = 3;
    }
  }
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
