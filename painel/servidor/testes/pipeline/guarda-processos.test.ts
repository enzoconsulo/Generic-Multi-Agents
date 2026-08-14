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
    // As três formas que a mensagem de recusa ENSINA — ver o bloco abaixo.
    ["node ferramentas/cenario.mjs --cena=modal-divida-390", "a cena versionada do projeto"],
    ["npm start & PID=$!", "subir o servidor guardando o PID"],
    ["kill $PID", "encerrar pela variável já capturada (não é substituição de comando)"],
  ];

  for (const [comando, caso] of permitidos) {
    it(`permite: ${caso}`, () => {
      expect(avaliarComandoDeProcesso(comando).permitido, `deveria permitir: ${comando}`).toBe(
        true,
      );
    });
  }

  /**
   * A ORIENTAÇÃO PRECISA SER EXECUTÁVEL — este é o teste que faltou no `--exigir`.
   *
   * Aquele mecanismo tinha teste, documentação e um agente que o usara com sucesso, e
   * ainda assim era rejeitado pela passada mecânica: ninguém havia conferido se o comando
   * ENSINADO passava pelo filtro que o receberia. Aqui o risco é o mesmo, e mais agudo,
   * porque quem lê esta mensagem já está sendo recusado uma vez — mandá-lo para um segundo
   * comando também recusado é o laço que matou o testador da T-036.
   */
  it("todo comando que a mensagem de recusa ensina passa pela própria guarda", () => {
    const recusado = avaliarComandoDeProcesso("pkill node");
    const motivo = recusado.motivo ?? "";

    // Os comandos citados no texto, extraídos do próprio motivo para não divergirem dele.
    const ensinados = ["PORT=3001 npm start", "taskkill /PID $s.Id /T /F", "npm test"];
    for (const comando of ensinados) {
      expect(motivo, `a mensagem deveria ensinar: ${comando}`).toContain(comando);
      expect(
        avaliarComandoDeProcesso(comando).permitido,
        `a guarda ensina "${comando}" e recusaria o agente que obedecesse`,
      ).toBe(true);
    }

    /*
     * PASSAR PELA GUARDA NÃO É FUNCIONAR — a versão anterior desta mensagem ensinava
     * `npm start & PID=$!` + `kill $PID`, e este teste a aprovava, porque testava só se a
     * guarda permitiria o comando. Permitia. Só que no Bash tool do Windows o `$!` devolve o
     * PID do JOB do Git Bash, não o do processo Windows (medido: 626 contra 3780 reais): o
     * `kill` do Git Bash traduz e mata o processo direto, mas `taskkill /PID` com esse número
     * falha, e o `node.exe` que o `npm` deixou fica órfão de qualquer jeito.
     *
     * Órfão acumulado é o que já derrubou o painel levando junto o job em voo, então a
     * orientação tem de dar o PID REAL e matar a ÁRVORE — o que só o PowerShell com
     * `-PassThru` entrega. Fica travado aqui para a forma antiga não voltar por descuido.
     */
    // Citar o `$!` é BOM — é o erro que o agente cometeria sozinho. O que não pode é citá-lo
    // como receita: se aparecer, tem de vir precedido da desaconselhação.
    if (motivo.includes("PID=$!")) {
      expect(
        motivo,
        "o `$!` só pode aparecer como anti-padrão, nunca como a receita a seguir",
      ).toMatch(/NÃO use[^.]*PID=\$!/);
    }
    expect(motivo, "o /T é o que mata o node.exe filho que o npm deixa").toContain("/T");

    // A cena versionada é a saída preferencial para prova visual — sem ela, o agente de UI
    // volta a improvisar o ritual que o leva a matar processo.
    expect(motivo).toMatch(/cenario\.mjs/);
    expect(motivo).toMatch(/captura\.mjs/);
  });
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
