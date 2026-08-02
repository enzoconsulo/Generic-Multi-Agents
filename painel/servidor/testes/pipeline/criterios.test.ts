import { mkdtempSync, writeFileSync } from "node:fs";
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
