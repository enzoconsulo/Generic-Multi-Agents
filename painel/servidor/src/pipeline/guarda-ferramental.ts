/**
 * GUARDA DE FERRAMENTAL — o agente não pode reinventar uma ferramenta que a fábrica já tem.
 *
 * POR QUE EXISTE. A fábrica dirige o navegador desde 28/07 com
 * `_sistema/ferramentas/captura.mjs` (Edge/Chrome já instalados, via DevTools Protocol, zero
 * dependência). Mesmo assim, TRÊS vezes um agente não soube disso e improvisou:
 *
 * | quando | o que fez | custo |
 * |---|---|---|
 * | T-026 | declarou "não há navegador disponível neste ambiente (sem `puppeteer` instalado)" e pulou a evidência | reprovado por conformidade |
 * | T-036 ciclo 1 | script descartável chamando `captura.mjs` com `spawnSync` de dentro do próprio servidor | 0 entrega |
 * | T-036 ciclo 2 | **instalou o puppeteer** (`package.json` + 354 linhas de lockfile) | etapa morreu, dependência largada na árvore |
 *
 * O inventário injetado no contexto (`_sistema/FERRAMENTAS.md`) resolve o caso do agente que
 * NÃO SABE. Este módulo resolve o caso do agente que sabe e tenta assim mesmo — a mesma
 * divisão de trabalho da `guarda-processos`: doutrina no prompt ajuda, hook é o que TRAVA.
 *
 * ESCOPO DELIBERADAMENTE ESTREITO, e a razão é econômica: recusa injusta custa uma volta ao
 * modelo (que custa ao quadrado), então só entra padrão cuja alternativa correta é certa e
 * nomeável. Instalar driver de navegador tem alternativa exata; "escrever script auxiliar" não
 * tem, e por isso NÃO é barrado aqui — fica como doutrina no inventário.
 */

import type { VeredictoGuarda } from "./guarda-processos.js";

/**
 * Gerenciadores de pacote que a fábrica encontra. `npx` fica de fora de propósito: `npx` não
 * grava dependência no projeto, e barrá-lo pegaria invocação legítima de ferramenta.
 */
const INSTALADORES = String.raw`(?:npm\s+(?:i|install|add)|pnpm\s+(?:i|install|add)|yarn\s+add|bun\s+(?:i|install|add)|pip3?\s+install|python\s+-m\s+pip\s+install)`;

/** Drivers de navegador — todos redundantes com `captura.mjs` nesta máquina. */
const DRIVERS =
  String.raw`(?:puppeteer(?:-core)?|playwright|@playwright/test|selenium(?:-webdriver)?|chromedriver|geckodriver|webdriverio|cypress|nightwatch|@puppeteer/browsers)`;

const PADROES: readonly { re: RegExp; o_que: string; saida: string }[] = [
  {
    re: new RegExp(String.raw`\b${INSTALADORES}\b[^\n]*\b${DRIVERS}\b`, "i"),
    o_que: "instalar um driver de navegador",
    saida:
      "Esta máquina JÁ dirige o Edge/Chrome instalado, sem dependência nenhuma: " +
      "`node _sistema/ferramentas/captura.mjs <url> <arquivo.png> --espera=3000`, com `--js` " +
      "para a tela que só existe depois de um clique e `--exigir` para afirmar geometria. " +
      "Se o projeto tiver `ferramentas/cenario.mjs`, rode `--listar` e use a cena: ela sobe o " +
      "servidor, captura, afirma e derruba pelo PID numa invocação só. " +
      "Baixar um Chromium inteiro leva minutos, polui o `package.json` do projeto e entrega " +
      "menos — já foi tentado na T-036 e a etapa morreu com a dependência largada na árvore.",
  },
  {
    // `playwright install` / `puppeteer browsers install`: baixa o navegador sem passar pelo
    // gerenciador de pacote, então escapa do padrão acima.
    re: /\b(?:npx\s+)?(?:playwright|puppeteer)\b[^\n]*\binstall\b/i,
    o_que: "baixar um navegador próprio",
    saida:
      "O navegador já está instalado nesta máquina e o `_sistema/ferramentas/captura.mjs` o " +
      "dirige pelo DevTools Protocol. Não há navegador a baixar.",
  },
];

/**
 * Avalia um comando de shell antes de ele rodar.
 *
 * Conservador por construção: na dúvida PERMITE — pela mesma razão da `guarda-processos`, uma
 * recusa injusta quebra tarefa legítima e custa ciclo de retrabalho.
 */
export function avaliarReinvencao(comando: string): VeredictoGuarda {
  const bruto = (comando ?? "").trim();
  if (bruto === "") return { permitido: true };

  for (const { re, o_que, saida } of PADROES) {
    if (re.test(bruto)) {
      return {
        permitido: false,
        motivo:
          `Comando recusado pela guarda de ferramental da fábrica: ${o_que}. ` +
          `${saida} O inventário completo do que você já tem está em ` +
          "`_sistema/FERRAMENTAS.md`, e ele abre o seu contexto neste despacho.",
      };
    }
  }
  return { permitido: true };
}
