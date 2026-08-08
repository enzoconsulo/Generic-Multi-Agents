import { describe, expect, it } from "vitest";
import {
  avaliarComandoDeProcesso,
  comandoDoToolInput,
} from "../../src/pipeline/guarda-processos.js";

/**
 * O painel é um `node.exe` e é ele quem executa os agentes. Um agente que mata node por
 * NOME derruba o painel no meio do job — sem exceção de JS e sem falha do Windows, logo sem
 * rastro em nenhum dos dois registros. Esta guarda é o que impede, no caminho do pipeline,
 * que isso volte a ser possível (lá roda `bypassPermissions`, então não há `canUseTool`).
 */
describe("guarda de processos — recusa o que mata por nome ou por porta", () => {
  const proibidos: [string, string][] = [
    ["taskkill /IM node.exe /F", "taskkill por imagem"],
    ["taskkill /F /IM node.exe", "taskkill por imagem, flags trocadas"],
    ["Stop-Process -Name node -Force", "Stop-Process por nome"],
    ["Get-Process node | Stop-Process -Force", "pipeline do PowerShell"],
    ["pkill -f node", "pkill"],
    ["killall node", "killall"],
    ["kill $(lsof -t -i:3000)", "PID vindo de substituição"],
    ["netstat -ano | findstr :3000 && taskkill /PID 123 /F", "achar dono da porta e matar"],
    ["wmic process where name='node.exe' delete", "wmic delete"],
  ];

  for (const [comando, caso] of proibidos) {
    it(`recusa: ${caso}`, () => {
      const v = avaliarComandoDeProcesso(comando);
      expect(v.permitido, `deveria recusar: ${comando}`).toBe(false);
      // O motivo precisa ENSINAR a saída, senão o agente tenta outra variante do mesmo erro.
      expect(v.motivo).toMatch(/PORT=|porta/i);
    });
  }

  /**
   * Recusar demais custaria ciclos de retrabalho em tarefa legítima — a guarda é estreita
   * de propósito. Matar por PID é justamente o que a doutrina MANDA fazer.
   */
  const permitidos: [string, string][] = [
    ["taskkill /PID 4242 /T /F", "matar o PID que o próprio agente subiu"],
    ["npm test", "suíte"],
    ["PORT=3001 npm start", "a saída correta para porta ocupada"],
    ["node --test tests/turno.test.js", "um teste só"],
    ["git status", "comando comum"],
    ["grep -rn 'kill' server/", "a palavra kill dentro de uma busca"],
    ["", "comando vazio"],
  ];

  for (const [comando, caso] of permitidos) {
    it(`permite: ${caso}`, () => {
      expect(avaliarComandoDeProcesso(comando).permitido, `deveria permitir: ${comando}`).toBe(
        true,
      );
    });
  }
});

describe("comandoDoToolInput", () => {
  it("extrai o comando do tool_input do Bash/PowerShell", () => {
    expect(comandoDoToolInput({ command: "npm test" })).toBe("npm test");
  });

  it("entrada fora do formato não quebra — vira string vazia (logo, permitido)", () => {
    for (const entrada of [null, undefined, 42, "texto", {}, { command: 7 }]) {
      expect(comandoDoToolInput(entrada)).toBe("");
    }
    expect(avaliarComandoDeProcesso(comandoDoToolInput(null)).permitido).toBe(true);
  });
});
