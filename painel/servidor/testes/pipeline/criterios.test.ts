import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  avaliarComando,
  BINARIOS_PERMITIDOS,
  criterioDaSuite,
  executarCriterios,
  lerCriterios,
  relatorioCriterios,
  reprovouNaMecanica,
} from "../../src/pipeline/criterios.js";

describe("lerCriterios", () => {
  it("lê critérios simples, sem comando", () => {
    const c = lerCriterios("- [ ] A tela fica legível.\n- [x] O botão existe.");
    expect(c).toHaveLength(2);
    expect(c[0]?.texto).toBe("A tela fica legível.");
    expect(c[0]?.comando).toBeNull();
    expect(c[1]?.marcado).toBe(true);
  });

  it("lê o comando na MESMA linha", () => {
    const c = lerCriterios("- [ ] A suíte passa. `verificar: npm test`");
    expect(c[0]?.comando).toBe("npm test");
    // O marcador sai do texto: ele é instrução para a máquina, não parte do critério.
    expect(c[0]?.texto).toBe("A suíte passa.");
  });

  // O planejador quebra linha o tempo todo — o parser de markdown da casa já aprendeu isso
  // do jeito difícil (ver "Parser próprio de markdown" nas armadilhas do painel).
  it("lê o comando em continuação INDENTADA", () => {
    const c = lerCriterios(
      ["- [ ] A suíte passa.", "      `verificar: npm test`", "- [ ] Outro."].join("\n"),
    );
    expect(c).toHaveLength(2);
    expect(c[0]?.comando).toBe("npm test");
    expect(c[1]?.comando).toBeNull();
  });

  it("não rouba o comando do critério seguinte", () => {
    const c = lerCriterios(
      ["- [ ] Sem comando.", "- [ ] Com comando.", "      `verificar: npm test`"].join("\n"),
    );
    expect(c[0]?.comando).toBeNull();
    expect(c[1]?.comando).toBe("npm test");
  });

  it("seção vazia ou sem itens devolve lista vazia", () => {
    expect(lerCriterios("")).toEqual([]);
    expect(lerCriterios("Texto solto sem checkbox.")).toEqual([]);
  });
});

describe("avaliarComando — entrada NÃO confiável (escrita por um modelo)", () => {
  it("aceita comando de verificação comum", () => {
    expect(avaliarComando("npm test")).toEqual({ ok: true, argv: ["npm", "test"] });
    expect(avaliarComando("node --test tests/x.test.js").ok).toBe(true);
    expect(avaliarComando("test -f tests/x.js").ok).toBe(true);
  });

  // Allowlist, nunca lista de proibições: `ext::<comando>` na URL de remoto já mostrou
  // nesta base que "proibir o que eu lembrar" não fecha nada.
  it("recusa binário fora da allowlist", () => {
    expect(avaliarComando("curl http://x").ok).toBe(false);
    expect(avaliarComando("rm -rf .").ok).toBe(false);
    expect(avaliarComando("bash script.sh").ok).toBe(false);
  });

  it("recusa encadeamento e substituição de shell", () => {
    for (const cmd of [
      "npm test && rm -rf .",
      "npm test; curl evil",
      "npm test | sh",
      "npm test `whoami`",
      "npm test $(whoami)",
      "npm test > /etc/passwd",
      "npm test\nrm -rf .",
    ]) {
      const r = avaliarComando(cmd);
      expect(r.ok, `deveria recusar: ${cmd}`).toBe(false);
    }
  });

  // `git` verifica coisas úteis, mas `git push`/`reset`/`clean` não são verificação.
  it("git entra só em modo leitura", () => {
    expect(avaliarComando("git status --porcelain").ok).toBe(true);
    expect(avaliarComando("git log --oneline -1").ok).toBe(true);
    expect(avaliarComando("git push origin main").ok).toBe(false);
    expect(avaliarComando("git reset --hard").ok).toBe(false);
    expect(avaliarComando("git clean -fd").ok).toBe(false);
  });

  it("comando vazio é recusado, não executado com argv vazio", () => {
    expect(avaliarComando("")).toEqual({ ok: false, motivo: "sem-comando" });
    expect(avaliarComando("   ")).toEqual({ ok: false, motivo: "sem-comando" });
  });

  it("a allowlist não contém nada que publique, instale ou apague", () => {
    for (const proibido of ["rm", "curl", "wget", "ssh", "scp", "chmod", "bash", "sh", "powershell"]) {
      expect(BINARIOS_PERMITIDOS.has(proibido), `${proibido} não deveria estar na allowlist`).toBe(
        false,
      );
    }
  });
});

describe("executarCriterios", () => {
  function projeto(): string {
    const dir = mkdtempSync(join(tmpdir(), "criterios-"));
    writeFileSync(join(dir, "existe.txt"), "ok", "utf8");
    return dir;
  }

  it("roda o comando e marca passou/falhou", async () => {
    const dir = projeto();
    const r = await executarCriterios(
      [
        { texto: "arquivo existe", comando: "node -e \"process.exit(0)\"", marcado: false },
        { texto: "sempre falha", comando: "node -e \"process.exit(1)\"", marcado: false },
      ],
      dir,
    );
    expect(r[0]?.estado).toBe("passou");
    expect(r[1]?.estado).toBe("falhou");
  });

  // Nunca é aprovação por omissão: o que a máquina não decide vai para o verificador.
  it("critério sem comando volta como nao-executado", async () => {
    const r = await executarCriterios([{ texto: "a tela fica boa", comando: null, marcado: false }], projeto());
    expect(r[0]?.estado).toBe("nao-executado");
    expect(r[0]?.recusa).toBeUndefined();
  });

  it("comando recusado volta como nao-executado, com o motivo", async () => {
    const r = await executarCriterios(
      [{ texto: "x", comando: "curl http://evil", marcado: false }],
      projeto(),
    );
    expect(r[0]?.estado).toBe("nao-executado");
    expect(r[0]?.recusa).toBe("binario-nao-permitido");
  });

  // Falha de ambiente virando reprovação da TAREFA é o desperdício mais caro da fábrica:
  // queima um ciclo inteiro por um erro que não é do código.
  it("comando inexistente não lança — vira falha registrada", async () => {
    const r = await executarCriterios(
      [{ texto: "x", comando: "node --isso-nao-existe", marcado: false }],
      projeto(),
    );
    expect(r[0]?.estado).toBe("falhou");
    expect(r[0]?.saida).toBeTypeOf("string");
  });

  /**
   * REGRESSÃO da queda do painel de 08/08.
   *
   * O `timeout` do `execFile` manda SIGTERM só para o filho DIRETO. Com `shell: true` (que
   * o Windows exige para `npm`), esse filho é o `cmd.exe` — e `npm`, `node --test` e um
   * processo por arquivo de teste sobrevivem. Medido no banco-imobiliario: 8 `node.exe`
   * órfãos por estouro, cada um segurando servidor HTTP + Socket.IO. A suíte roda uma vez
   * por tarefa por ciclo, então os órfãos acumulavam até a máquina não sustentar o painel.
   *
   * O teste prova a NETA morta, não a filha: é a neta que vazava.
   */
  it("estouro de tempo mata a ÁRVORE, não só o filho direto", async () => {
    const dir = projeto();
    const batida = join(dir, "batida.txt");
    // Neta: bate num arquivo sem parar. Se sobreviver ao estouro, a batida continua.
    writeFileSync(
      join(dir, "neta.js"),
      `const { writeFileSync } = require("node:fs");
       setInterval(() => writeFileSync(${JSON.stringify(batida)}, String(Date.now())), 50);
       setTimeout(() => process.exit(0), 60000);`,
      "utf8",
    );
    // Filha: só lança a neta e fica viva. É nela que o SIGTERM do execFile acertava.
    writeFileSync(
      join(dir, "filha.js"),
      `require("node:child_process").spawn(process.execPath, ["neta.js"], {
         cwd: __dirname, stdio: "ignore",
       });
       setInterval(() => {}, 1000);`,
      "utf8",
    );

    const r = await executarCriterios(
      [{ texto: "trava de proposito", comando: "node filha.js", marcado: false }],
      dir,
      { timeoutMs: 1500 },
    );

    expect(r[0]?.estado).toBe("falhou");
    expect(r[0]?.saida).toContain("árvore de processos");

    // A prova: depois do estouro a neta parou de bater.
    await new Promise((r2) => setTimeout(r2, 600));
    const marca = readFileSync(batida, "utf8");
    await new Promise((r2) => setTimeout(r2, 900));
    expect(readFileSync(batida, "utf8")).toBe(marca);
  });
});

describe("relatorioCriterios", () => {
  it("usa a escada de DOMINIOS.md e fecha com Graus de prova", () => {
    const texto = relatorioCriterios([
      { texto: "suíte passa", estado: "passou", comando: "npm test" },
      { texto: "tela boa", estado: "nao-executado", comando: null },
    ]);
    expect(texto).toContain("[executado] suíte passa");
    expect(texto).toContain("[julgado] tela boa");
    expect(texto).toContain("Graus de prova: 1 executado(s), 1 para julgamento (de 2).");
  });

  it("mostra a saída de quem falhou — é o que o construtor precisa ler", () => {
    const texto = relatorioCriterios([
      { texto: "suíte", estado: "falhou", comando: "npm test", saida: "3 testes falharam" },
    ]);
    expect(texto).toContain("FALHOU");
    expect(texto).toContain("3 testes falharam");
  });

  it("lista vazia não gera relatório", () => {
    expect(relatorioCriterios([])).toBe("");
  });
});

describe("reprovouNaMecanica", () => {
  // Se a máquina já provou que falhou, despachar o verificador é pagar ~US$ 0,50 para
  // confirmar o que se sabe. Volta direto ao construtor.
  it("é true assim que um critério executado falha", () => {
    expect(
      reprovouNaMecanica([
        { texto: "a", estado: "passou", comando: "x" },
        { texto: "b", estado: "falhou", comando: "y" },
      ]),
    ).toBe(true);
  });

  it("nao-executado NÃO conta como reprovação", () => {
    expect(
      reprovouNaMecanica([
        { texto: "a", estado: "passou", comando: "x" },
        { texto: "b", estado: "nao-executado", comando: null },
      ]),
    ).toBe(false);
  });
});

describe("criterioDaSuite — o critério implícito de toda tarefa", () => {
  /**
   * "A suíte continua passando" não está escrito em tarefa nenhuma e mesmo assim é
   * executado em TODA verificação — é o passo 3 do `testador`. A fábrica já pagava por
   * isso, num despacho de modelo, para rodar um comando. Torná-lo implícito é o que faz a
   * I5 valer sem depender de o planejador lembrar de escrever `verificar:` em cada tarefa.
   */
  it("vira um critério com o comando do ecossistema", () => {
    const c = criterioDaSuite("npm test");
    expect(c?.comando).toBe("npm test");
    expect(c?.texto).toContain("suíte");
  });

  it("funciona para qualquer stack, não só Node", () => {
    expect(criterioDaSuite("pytest")?.comando).toBe("pytest");
    expect(criterioDaSuite("go test ./...")?.comando).toBe("go test ./...");
    expect(criterioDaSuite("cargo test")?.comando).toBe("cargo test");
  });

  // Ecossistema sem comando de teste: não há o que rodar, e o verificador julga como sempre.
  it("sem comando de teste, não inventa critério", () => {
    expect(criterioDaSuite(null)).toBeNull();
    expect(criterioDaSuite("")).toBeNull();
    expect(criterioDaSuite("   ")).toBeNull();
  });

  it("o comando passa pela mesma allowlist dos demais", () => {
    const c = criterioDaSuite("npm test");
    expect(avaliarComando(c?.comando ?? "").ok).toBe(true);
  });
});

describe("lerCriterios — critério multi-linha (bug de rodada real)", () => {
  /**
   * Numa rodada REAL, 11 dos 13 critérios saíram truncados no meio da frase — "emite ao
   * jogador da vez uma", "parar em «Vá para a". A primeira versão lia só a linha do
   * `- [ ]`. O estrago não era estético: esse relatório é o que o verificador lê para saber
   * o que ainda precisa julgar.
   */
  it("junta a continuação indentada no texto do critério", () => {
    const c = lerCriterios(
      [
        "- [ ] Parar numa propriedade livre emite ao jogador da vez uma",
        "      decisão de compra; responder \"comprar\" debita o preço e marca a posse.",
        "- [ ] Outro critério.",
      ].join("\n"),
    );
    expect(c).toHaveLength(2);
    expect(c[0]?.texto).toContain("decisão de compra");
    expect(c[0]?.texto).not.toMatch(/uma$/);
  });

  it("colapsa espaço para o relatório caber numa linha", () => {
    const c = lerCriterios(["- [ ] Um    critério", "      com     espaços."].join("\n"));
    expect(c[0]?.texto).toBe("Um critério com espaços.");
  });

  it("junta o texto E acha o comando na continuação", () => {
    const c = lerCriterios(
      [
        "- [ ] `tests/x.test.js` roda com `node --test tests/x.test.js`, sobe o servidor",
        "      numa porta livre e verifica a compra.",
        "      `verificar: node --test tests/x.test.js`",
      ].join("\n"),
    );
    expect(c[0]?.comando).toBe("node --test tests/x.test.js");
    expect(c[0]?.texto).toContain("verifica a compra");
    expect(c[0]?.texto).not.toContain("verificar:");
  });
});
