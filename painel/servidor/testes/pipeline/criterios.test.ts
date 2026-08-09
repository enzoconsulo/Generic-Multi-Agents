import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  avaliarComando,
  BINARIOS_PERMITIDOS,
  classificarFalha,
  criterioDaSuite,
  criteriosComFerramentaQuebrada,
  executarCriterios,
  lerCriterios,
  reexecucoesPorAmbiente,
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

  /**
   * Falha de ambiente ou de ferramenta virando reprovação da TAREFA é o desperdício mais
   * caro da fábrica: queima um ciclo inteiro por um erro que não é do código.
   *
   * Este teste JÁ EXISTIA afirmando `falhou` — ou seja, codificava o defeito como se fosse o
   * contrato, com um comentário que descrevia o desperdício logo acima da asserção que o
   * garantia. A T-054 inverte a asserção: opção inválida não decide nada sobre a entrega.
   */
  it("comando inexistente não lança — e não reprova a tarefa", async () => {
    const r = await executarCriterios(
      [{ texto: "x", comando: "node --isso-nao-existe", marcado: false }],
      projeto(),
    );
    expect(r[0]?.estado).toBe("inconclusivo");
    expect(r[0]?.classe).toBe("ferramenta");
    expect(r[0]?.saida).toBeTypeOf("string");
    expect(reprovouNaMecanica(r)).toBe(false);
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

    // Estouro de tempo é ambiente (T-054): mata a árvore, registra, e NÃO reprova a tarefa.
    expect(r[0]?.estado).toBe("inconclusivo");
    expect(r[0]?.classe).toBe("ambiente");
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

describe("classificarFalha — separar 'a entrega falhou' de 'não deu para medir' (T-054)", () => {
  const base = {
    argv: ["npm", "test"],
    saida: "",
    code: 1 as number | string | null,
    signal: null as string | null,
    estourouNossoTeto: false,
    existeNoDisco: () => false,
  };

  it("comando que rodou e reprovou continua sendo `falha`", () => {
    expect(classificarFalha({ ...base, saida: "3 testes falharam\nassert: esperado 2" })).toBe(
      "falha",
    );
  });

  it("nosso teto de tempo é ambiente, nunca defeito da tarefa", () => {
    expect(classificarFalha({ ...base, estourouNossoTeto: true })).toBe("ambiente");
  });

  // POSIX: processo morto não devolve exit code útil, devolve sinal.
  it("morte por sinal é ambiente", () => {
    expect(classificarFalha({ ...base, code: null, signal: "SIGSEGV" })).toBe("ambiente");
  });

  /**
   * O crash que reprovou T-024, T-027, T-029 e T-030 sem defeito nenhum. Qualquer NTSTATUS
   * de erro entra, não só o 0xC0000409 que apareceu nas Notas.
   */
  it("crash nativo do Windows é ambiente", () => {
    expect(classificarFalha({ ...base, code: 3221226505 })).toBe("ambiente"); // 0xC0000409
    expect(classificarFalha({ ...base, code: 3221225477 })).toBe("ambiente"); // 0xC0000005
  });

  it("recurso esgotado é ambiente, em qualquer stack", () => {
    for (const s of ["ENOMEM", "EMFILE", "JavaScript heap out of memory", "MemoryError"]) {
      expect(classificarFalha({ ...base, saida: `algo ${s} algo` })).toBe("ambiente");
    }
  });

  it("binário ausente é ferramenta — o critério aponta para o que não existe", () => {
    expect(classificarFalha({ ...base, code: "ENOENT" })).toBe("ferramenta");
    expect(classificarFalha({ ...base, code: 127, saida: "pytest: command not found" })).toBe(
      "ferramenta",
    );
    expect(
      classificarFalha({
        ...base,
        code: 1,
        saida: "'ruff' is not recognized as an internal or external command",
      }),
    ).toBe("ferramenta");
  });

  it("opção inválida é ferramenta", () => {
    expect(
      classificarFalha({
        ...base,
        argv: ["node", "--opcao-xyz"],
        code: 9,
        saida: "node.exe: bad option: --opcao-xyz",
      }),
    ).toBe("ferramenta");
    expect(classificarFalha({ ...base, saida: "npm ERR! Missing script: \"tst\"" })).toBe(
      "ferramenta",
    );
  });

  /**
   * O CASO DIFÍCIL, e a razão de o discriminador ser o disco e não a mensagem. As duas
   * situações abaixo imprimem exatamente o mesmo erro do Node.
   */
  describe("alvo não encontrado: mesma mensagem, desfechos opostos", () => {
    // `String.raw` de propósito: a mensagem real do Node vem com separador do Windows, e
    // escrever isso com escape manual já estragou este teste uma vez — `"C:\proj\tests"` em
    // TypeScript é `C:proj<TAB>ests`, e o caso passava/reprovava pelo motivo errado.
    const ALVO_DIRETORIO = String.raw`C:\proj\tests`;
    const ALVO_ARQUIVO = String.raw`C:\proj\tests\turno.test.js`;

    it("alvo que EXISTE e não carrega é ferramenta (o caso T-030)", () => {
      expect(
        classificarFalha({
          ...base,
          argv: ["node", "--test", "tests"],
          saida: `Error: Cannot find module '${ALVO_DIRETORIO}'\ncode: 'MODULE_NOT_FOUND'`,
          existeNoDisco: (c) => c === ALVO_DIRETORIO, // o diretório está lá
        }),
      ).toBe("ferramenta");
    });

    it("alvo que NÃO existe é falha da tarefa (o formato de T-017a)", () => {
      expect(
        classificarFalha({
          ...base,
          argv: ["node", "--test", "tests/turno.test.js"],
          saida: `Error: Cannot find module '${ALVO_ARQUIVO}'`,
          existeNoDisco: () => false, // a tarefa deveria ter criado o arquivo e não criou
        }),
      ).toBe("falha");
    });

    // Prova que o teste acima reprova pelo motivo CERTO: mesma mensagem, mesmo comando, e a
    // única coisa que muda é o disco. Sem isto, os dois casos poderiam estar dando o
    // resultado esperado por engano — foi exatamente o que aconteceu na primeira versão.
    it("é o DISCO que decide: mesma entrada, resposta oposta", () => {
      const entrada = {
        ...base,
        argv: ["node", "--test", "tests/turno.test.js"],
        saida: `Error: Cannot find module '${ALVO_ARQUIVO}'`,
      };
      expect(classificarFalha({ ...entrada, existeNoDisco: () => true })).toBe("ferramenta");
      expect(classificarFalha({ ...entrada, existeNoDisco: () => false })).toBe("falha");
    });

    it("módulo que um teste não conseguiu importar é falha, não ferramenta", () => {
      // O alvo não é argumento do comando: a suíte rodou e um import quebrou. Defeito real.
      expect(
        classificarFalha({
          ...base,
          argv: ["npm", "test"],
          saida: "Error: Cannot find module '../src/motor.js'",
          existeNoDisco: () => true,
        }),
      ).toBe("falha");
    });
  });

  it("reconhece alvo de outras stacks, não só do Node", () => {
    expect(
      classificarFalha({
        ...base,
        argv: ["python", "suite.py"],
        saida: "can't open file 'suite.py': [Errno 2] No such file",
        existeNoDisco: () => true,
      }),
    ).toBe("ferramenta");
    expect(
      classificarFalha({
        ...base,
        argv: ["go", "test", "./pacote"],
        saida: "no Go files in ./pacote",
        existeNoDisco: () => true,
      }),
    ).toBe("ferramenta");
  });
});

describe("inconclusivo no relatório e nos portões", () => {
  it("não reprova a tarefa — é o laço que custou US$ 12,90 na T-030", () => {
    expect(
      reprovouNaMecanica([
        { texto: "a", estado: "passou", comando: "npm test" },
        { texto: "b", estado: "inconclusivo", classe: "ferramenta", comando: "node --test tests" },
      ]),
    ).toBe(false);
  });

  it("aparece na escada e na linha Graus de prova", () => {
    const texto = relatorioCriterios([
      { texto: "suíte", estado: "passou", comando: "npm test" },
      { texto: "alvo", estado: "inconclusivo", classe: "ferramenta", comando: "node --test tests" },
      { texto: "tela", estado: "nao-executado", comando: null },
    ]);
    expect(texto).toContain("[inconclusivo] alvo");
    expect(texto).toContain("o critério é que precisa de conserto");
    expect(texto).toContain("Graus de prova: 1 executado(s), 1 para julgamento, 1 INCONCLUSIVO(s)");
  });

  // Linha que diz "0 de alguma coisa" em toda rodada saudável para de ser lida.
  it("sem inconclusivo, a linha continua exatamente como era", () => {
    const texto = relatorioCriterios([{ texto: "suíte", estado: "passou", comando: "npm test" }]);
    expect(texto).toContain("Graus de prova: 1 executado(s), 0 para julgamento (de 1).");
    expect(texto).not.toContain("INCONCLUSIVO");
  });

  it("só a classe `ferramenta` vira pedido de correção de critério", () => {
    const quebrados = criteriosComFerramentaQuebrada([
      { texto: "a", estado: "inconclusivo", classe: "ferramenta", comando: "node --test tests" },
      { texto: "b", estado: "inconclusivo", classe: "ambiente", comando: "npm test" },
      { texto: "c", estado: "falhou", comando: "npm test" },
    ]);
    expect(quebrados).toHaveLength(1);
    expect(quebrados[0]?.comando).toBe("node --test tests");
  });
});

describe("executarCriterios — a T-030 ponta a ponta, com processo de verdade", () => {
  it("reproduz o critério quebrado da T-030 e NÃO reprova a tarefa", async () => {
    const dir = mkdtempSync(join(tmpdir(), "t030-"));
    mkdirSync(join(dir, "tests"));
    writeFileSync(join(dir, "tests", "a.test.js"), "");

    // Exatamente o que estava escrito na T-030. O diretório existe; o runner é que não sabe
    // consumi-lo nesta forma.
    const r = await executarCriterios(
      [{ texto: "a suíte passa", comando: "node --test tests", marcado: false }],
      dir,
    );

    expect(r[0]?.estado).toBe("inconclusivo");
    expect(r[0]?.classe).toBe("ferramenta");
    expect(reprovouNaMecanica(r)).toBe(false);
  }, 30_000);

  it("arquivo de teste que a tarefa não criou continua reprovando de verdade", async () => {
    const dir = mkdtempSync(join(tmpdir(), "t017-"));
    mkdirSync(join(dir, "tests"));

    const r = await executarCriterios(
      [{ texto: "o teste roda", comando: "node --test tests/naoexiste.test.js", marcado: false }],
      dir,
    );

    expect(r[0]?.estado).toBe("falhou");
    expect(reprovouNaMecanica(r)).toBe(true);
  }, 30_000);
});

describe("retentativa única para falha de AMBIENTE (T-055)", () => {
  /**
   * Script que se comporta diferente na 1ª e na 2ª execução, contando num arquivo. É o único
   * jeito honesto de testar retentativa: um mock diria que o código chama duas vezes, não que
   * o resultado da segunda é o que vale.
   *
   * `comoFalha` decide o que a PRIMEIRA execução faz — e com isso o teste cobre as três
   * decisões da T-055 com o mesmo aparato.
   */
  function projetoInstavel(comoFalha: "ambiente" | "falha" | "trava"): string {
    const dir = mkdtempSync(join(tmpdir(), "t055-"));
    const contador = join(dir, "contador.txt");
    const primeira =
      comoFalha === "ambiente"
        ? // ENOMEM na saída → classe `ambiente` (o padrão vale para qualquer stack).
          'process.stderr.write("ENOMEM: sem memoria\\n"); process.exit(1);'
        : comoFalha === "falha"
          ? // Reprovação legítima: nada de ambiente na saída, só código não-zero.
            'process.stderr.write("2 testes falharam\\n"); process.exit(1);'
          : // Trava para estourar o NOSSO teto de tempo.
            "setInterval(() => {}, 1000);";
    // A saída antecipada vem PRIMEIRO, e o ramo da 1ª execução é a última coisa do arquivo.
    // Escrito ao contrário (`if (!existe) { ...primeira } process.exit(0)`) o caso "trava"
    // não travava: `setInterval` não bloqueia, o script seguia para o `exit(0)` e o teste
    // media um comando que passou de primeira em vez de um que estourou o tempo.
    writeFileSync(
      join(dir, "instavel.js"),
      `const { existsSync, writeFileSync } = require("node:fs");
       const contador = ${JSON.stringify(contador)};
       if (existsSync(contador)) process.exit(0);
       writeFileSync(contador, "1");
       ${primeira}`,
      "utf8",
    );
    return dir;
  }

  /**
   * O caso que paga a tarefa: a 1ª execução caiu por contenção, a 2ª passou. Antes da T-054
   * isso reprovava a tarefa e queimava uma das 3 fichas; antes da T-055 ficava inconclusivo e
   * ia para julgamento do verificador. Agora é o que sempre foi: um comando que passa.
   */
  it("caiu por ambiente na 1ª e passou na 2ª → PASSOU, com o registro da reexecução", async () => {
    const dir = projetoInstavel("ambiente");
    const r = await executarCriterios(
      [{ texto: "a suíte passa", comando: "node instavel.js", marcado: false }],
      dir,
    );

    expect(r[0]?.estado).toBe("passou");
    expect(r[0]?.reexecutado).toBe(true);
    expect(reprovouNaMecanica(r)).toBe(false);
    expect(reexecucoesPorAmbiente(r)).toBe(1);
    // O registro tem de sobreviver até o relatório: é ele que mede a máquina.
    expect(relatorioCriterios(r)).toContain("na 2ª execução; a 1ª caiu por ambiente");
  }, 30_000);

  /**
   * A trava contra economia burra: reprovação legítima NÃO é retentada. O script passaria na
   * segunda execução — se houvesse uma. Não há, então o resultado é `falhou`, e é isso que
   * prova que o retry não é cego.
   */
  it("reprovação legítima não é retentada — segue reprovando", async () => {
    const dir = projetoInstavel("falha");
    const r = await executarCriterios(
      [{ texto: "a suíte passa", comando: "node instavel.js", marcado: false }],
      dir,
    );

    expect(r[0]?.estado).toBe("falhou");
    expect(r[0]?.reexecutado).toBeUndefined();
    expect(reprovouNaMecanica(r)).toBe(true);
    expect(reexecucoesPorAmbiente(r)).toBe(0);
  }, 30_000);

  /**
   * ESTOURO DE TEMPO NÃO É RETENTADO — desvio deliberado ao plano da fase, travado aqui.
   *
   * O argumento que autoriza retentar ambiente é "custa segundos": verdadeiro para crash, que
   * falha rápido, e falso para estouro, que já consumiu o teto inteiro. Retentar dobraria o
   * pior caso de tempo justamente na máquina onde a suíte é o gargalo.
   *
   * A prova não é cronômetro (que seria frágil): o script PASSARIA na segunda execução, então
   * um `passou` aqui denunciaria a retentativa. O `inconclusivo` é a prova de que não houve.
   */
  it("estouro de tempo NÃO é retentado, mesmo sendo ambiente", async () => {
    const dir = projetoInstavel("trava");
    const r = await executarCriterios(
      [{ texto: "a suíte passa", comando: "node instavel.js", marcado: false }],
      dir,
      { timeoutMs: 1200 },
    );

    expect(r[0]?.estado).toBe("inconclusivo");
    expect(r[0]?.classe).toBe("ambiente");
    expect(r[0]?.reexecutado).toBeUndefined();
    // E o principal: mesmo sem retentativa, estouro deixou de reprovar a tarefa.
    expect(reprovouNaMecanica(r)).toBe(false);
  }, 30_000);
});
