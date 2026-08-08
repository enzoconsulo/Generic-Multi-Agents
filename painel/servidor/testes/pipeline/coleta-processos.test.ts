import { describe, expect, it } from "vitest";
import {
  analisarLinhas,
  descendentesDe,
  escolherOrfaos,
  type ProcessoVivo,
} from "../../src/pipeline/coleta-processos.js";

/**
 * A coleta MATA processo de verdade, então o que ela decide é o que precisa de teste — e a
 * decisão é uma função pura, exercitada aqui sem encostar no sistema.
 *
 * O caso real que originou tudo: agente sobe `PORT=3001 npm start` para a evidência visual,
 * a etapa acaba, o `claude` morre e o servidor fica de pé para sempre (51 MB, segurando a
 * porta) numa máquina que opera com ~400 MB livres.
 *
 * Matar exige DUAS provas, e cada teste abaixo ataca uma delas:
 *  - PROPRIEDADE (`observados`): a fábrica lançou;
 *  - ABANDONO (órfão): ninguém mais responde por ele.
 */

const PAINEL = 100;
const T0 = 1_000_000; // "início do job"

function p(pid: number, ppid: number, nome: string, criadoEm: number, comando = ""): ProcessoVivo {
  return { pid, ppid, nome, criadoEm, comando };
}

/** Critério com propriedade declarada — o caso normal. */
function criterio(observados: number[]) {
  return { painelPid: PAINEL, desdeMs: T0, observados: new Set(observados) };
}

describe("escolherOrfaos", () => {
  it("recolhe a árvore órfã que o agente deixou (npm start sobrevivendo ao claude)", () => {
    const processos = [
      p(PAINEL, 1, "node.exe", T0 - 5000, "node servidor/dist/index.js"),
      // pid 200 era o `claude` desta etapa — MORREU, não está na lista.
      p(300, 200, "bash.exe", T0 + 1000, "bash -c npm start"),
      p(301, 300, "npm.exe", T0 + 1100, "npm start"),
      p(302, 301, "node.exe", T0 + 1200, "node server/index.js"),
    ];
    // Todos foram vistos pendurados no painel enquanto o `claude` vivia.
    const escolhidos = escolherOrfaos(processos, criterio([300, 301, 302]));
    // Só a RAIZ: o kill é de árvore, os filhos vêm junto.
    expect(escolhidos.map((x) => x.pid)).toEqual([300]);
  });

  /**
   * REGRESSÃO do falso positivo que o dry-run contra a máquina real pegou: com o critério
   * "órfão + nascido na janela", um comando que o PRÓPRIO USUÁRIO rodou no terminal virava
   * alvo, porque o shell que o lançou já tinha saído. Órfão prova abandono, não propriedade.
   */
  it("NÃO toca em órfão que a fábrica não lançou (comando do usuário)", () => {
    const processos = [
      p(PAINEL, 1, "node.exe", T0 - 5000),
      p(900, 999, "bash.exe", T0 + 100, "bash -c npx tsx algo-do-usuario.ts"),
    ];
    // `observados` vazio: nunca esteve pendurado no painel.
    expect(escolherOrfaos(processos, criterio([]))).toEqual([]);
  });

  it("NÃO toca no painel", () => {
    const processos = [p(PAINEL, 1, "node.exe", T0 + 10, "node servidor/dist/index.js")];
    expect(escolherOrfaos(processos, criterio([PAINEL]))).toEqual([]);
  });

  /**
   * A propriedade que torna a coleta segura com jobs em PARALELO: descendente vivo do painel
   * é trabalho de alguém, e nunca é recolhido — mesmo tendo sido observado e sendo novo.
   */
  it("NÃO toca em descendente VIVO do painel (agente de job paralelo)", () => {
    const processos = [
      p(PAINEL, 1, "node.exe", T0 - 5000),
      p(400, PAINEL, "node.exe", T0 + 500, "claude de outro job"),
      p(401, 400, "bash.exe", T0 + 600, "npm test de outro job"),
    ];
    expect(escolherOrfaos(processos, criterio([400, 401]))).toEqual([]);
  });

  it("NÃO toca em órfão que já existia ANTES do job", () => {
    const processos = [
      p(PAINEL, 1, "node.exe", T0 - 5000),
      p(500, 999, "node.exe", T0 - 60_000, "servidor que o usuário subiu de manhã"),
    ];
    expect(escolherOrfaos(processos, criterio([500]))).toEqual([]);
  });

  it("NÃO toca em processo fora da família de shell/runtime dos agentes", () => {
    const processos = [
      p(PAINEL, 1, "node.exe", T0 - 5000),
      p(600, 999, "chrome.exe", T0 + 100, "navegador do usuário"),
    ];
    expect(escolherOrfaos(processos, criterio([600]))).toEqual([]);
  });

  /**
   * PID é reciclado. Sem comparar o instante de criação, um processo cujo pai morreu e cujo
   * número foi reaproveitado por outro processo pareceria bem-parentado — e o lixo escaparia.
   */
  it("pai mais NOVO que o filho é pid reciclado, não pai: o filho é órfão", () => {
    const processos = [
      p(PAINEL, 1, "node.exe", T0 - 5000),
      // 700 nasceu DEPOIS de 701, logo não pode ser o pai de 701.
      p(700, 1, "cmd.exe", T0 + 9000, "processo novo que herdou o pid"),
      p(701, 700, "node.exe", T0 + 1000, "node server/index.js"),
    ];
    const escolhidos = escolherOrfaos(processos, criterio([700, 701]));
    expect(escolhidos.map((x) => x.pid).sort()).toEqual([700, 701]);
  });

  /** O inverso da armadilha acima: cadeia legítima até o painel não pode virar "órfã". */
  it("cadeia longa e viva até o painel é preservada inteira", () => {
    const processos = [
      p(PAINEL, 1, "node.exe", T0 - 5000),
      p(800, PAINEL, "cmd.exe", T0 + 100),
      p(801, 800, "bash.exe", T0 + 200),
      p(802, 801, "node.exe", T0 + 300),
    ];
    expect(escolherOrfaos(processos, criterio([800, 801, 802]))).toEqual([]);
  });

  it("lista vazia não quebra", () => {
    expect(escolherOrfaos([], criterio([]))).toEqual([]);
  });
});

describe("descendentesDe — a prova de propriedade, colhida enquanto a cadeia existe", () => {
  it("pega a cadeia inteira pendurada no painel, e nada além dela", () => {
    const processos = [
      p(PAINEL, 1, "node.exe", T0),
      p(300, PAINEL, "node.exe", T0 + 10, "claude"),
      p(301, 300, "bash.exe", T0 + 20),
      p(302, 301, "node.exe", T0 + 30),
      p(900, 999, "node.exe", T0 + 40, "processo do usuário"),
    ];
    expect([...descendentesDe(processos, PAINEL)].sort((a, b) => a - b)).toEqual([300, 301, 302]);
  });

  it("não inclui o próprio painel", () => {
    expect(descendentesDe([p(PAINEL, 1, "node.exe", T0)], PAINEL).has(PAINEL)).toBe(false);
  });
});

describe("analisarLinhas (formato do Windows)", () => {
  it("lê pid|ppid|nome|criadoEm|comando", () => {
    const r = analisarLinhas("300|200|node.exe|1700000000000|node server/index.js\n");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ pid: 300, ppid: 200, nome: "node.exe", criadoEm: 1700000000000 });
    expect(r[0]?.comando).toBe("node server/index.js");
  });

  /** O comando é o ÚNICO campo que pode conter o separador — por isso vai por último. */
  it("preserva `|` dentro do comando", () => {
    const r = analisarLinhas("1|2|cmd.exe|1700000000000|dir | findstr x");
    expect(r[0]?.comando).toBe("dir | findstr x");
  });

  it("linha malformada é ignorada, não derruba a leitura", () => {
    const r = analisarLinhas("lixo\n\n1|2|node.exe|1700000000000|ok\nx|y|z|w|v\n");
    expect(r.map((x) => x.pid)).toEqual([1]);
  });

  it("processo sem linha de comando ainda é lido", () => {
    const r = analisarLinhas("5|4|node.exe|1700000000000|");
    expect(r[0]?.pid).toBe(5);
    expect(r[0]?.comando).toBe("");
  });
});
