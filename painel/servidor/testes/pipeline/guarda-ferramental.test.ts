import { describe, expect, it } from "vitest";
import { avaliarReinvencao } from "../../src/pipeline/guarda-ferramental.js";
import { FERRAMENTAS_PIPELINE, FERRAMENTAS_PROIBIDAS } from "../../src/pipeline/prompts-agente.js";

/**
 * A fábrica dirige o navegador desde 28/07 sem instalar nada (`captura.mjs`, via DevTools
 * Protocol). Três agentes não souberam disso e improvisaram — o último INSTALOU o puppeteer
 * no meio de uma verificação, deixou a dependência na árvore e a etapa morreu. O inventário
 * injetado no contexto cobre quem não sabe; esta guarda cobre quem tenta assim mesmo.
 */
describe("guarda de ferramental — recusa reinventar o que a fábrica já tem", () => {
  const proibidos: [string, string][] = [
    ["npm install puppeteer", "o caso real da T-036"],
    ["npm i -D puppeteer@^25.7.0", "com flag e versão"],
    ["npm install --save-dev playwright", "playwright"],
    ["pnpm add @playwright/test", "pnpm"],
    ["yarn add selenium-webdriver", "yarn"],
    ["bun install chromedriver", "bun"],
    ["pip install selenium", "pip"],
    ["npm i cypress", "cypress"],
    ["npx playwright install chromium", "baixar navegador sem passar pelo gerenciador"],
    ["npx puppeteer browsers install chrome", "puppeteer browsers install"],
  ];

  for (const [comando, caso] of proibidos) {
    it(`recusa: ${caso}`, () => {
      const v = avaliarReinvencao(comando);
      expect(v.permitido, `deveria recusar: ${comando}`).toBe(false);
      // Recusa que não NOMEIA a alternativa só faz o agente tentar outra variante do erro.
      expect(v.motivo).toMatch(/captura\.mjs/);
      expect(v.motivo).toMatch(/FERRAMENTAS\.md/);
    });
  }

  /**
   * Estreita de propósito: recusa injusta quebra tarefa legítima e custa uma volta ao modelo
   * — que custa ao quadrado. Só entra padrão cuja alternativa correta é exata e nomeável.
   */
  const permitidos: [string, string][] = [
    ["npm install", "instalar as dependências do próprio projeto"],
    ["npm install express socket.io", "dependência legítima do projeto"],
    ["npm test", "a suíte"],
    ["node _sistema/ferramentas/captura.mjs http://localhost:3001/ a.png", "a ferramenta certa"],
    ["node ferramentas/cenario.mjs --cena=compra-390", "a cena do projeto"],
    ["npx tsx integracao/simular-pipeline.ts banco-imobiliario", "npx legítimo"],
    ["git log --oneline -5", "git"],
    ["", "comando vazio"],
  ];

  for (const [comando, caso] of permitidos) {
    it(`permite: ${caso}`, () => {
      expect(avaliarReinvencao(comando).permitido, `deveria permitir: ${comando}`).toBe(true);
    });
  }
});

/**
 * O defeito que motivou tudo isto: `allowedTools` só AUTO-APROVA — quem restringe é `tools`.
 * O `sdk.d.ts` é literal ("To restrict which tools are available, use the `tools` option
 * instead"), e o job `1a3bc22e` provou na prática: o `executor` chamou `ScheduleWakeup` seis
 * vezes, ferramenta que nunca esteve na allowlist.
 */
describe("famílias de ferramenta do pipeline", () => {
  it("proíbe despachar subagente e agendar continuação futura", () => {
    for (const proibida of ["Agent", "Task", "ScheduleWakeup", "CronCreate", "Monitor"]) {
      expect(FERRAMENTAS_PROIBIDAS).toContain(proibida);
    }
  });

  it("nenhuma ferramenta proibida aparece na lista permitida", () => {
    for (const proibida of FERRAMENTAS_PROIBIDAS) {
      expect(FERRAMENTAS_PIPELINE).not.toContain(proibida);
    }
  });

  it("mantém o que o agente realmente precisa para trabalhar", () => {
    for (const necessaria of ["Read", "Edit", "Write", "Bash", "Grep", "Glob"]) {
      expect(FERRAMENTAS_PIPELINE).toContain(necessaria);
    }
  });
});
