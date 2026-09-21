import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  conferirServicos,
  lerServicos,
  servicosNoChao,
  type Executor,
  type ServicoDeclarado,
} from "../../src/pipeline/pre-voo.js";

async function projetoFalso(ci: string | null): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pre-voo-"));
  await mkdir(join(dir, "_gestao"), { recursive: true });
  if (ci !== null) await writeFile(join(dir, "_gestao", "ci.json"), ci, "utf8");
  return dir;
}

/**
 * Executor de mentira: responde por prefixo de comando. `roteiro` mapeia comando → lista de
 * desfechos, consumida em ordem — é como se expressa "estava no chão, subiu, agora atende".
 */
function executorFalso(roteiro: Record<string, boolean[]>): { exec: Executor; chamadas: string[] } {
  const chamadas: string[] = [];
  const exec: Executor = async (comando) => {
    chamadas.push(comando);
    const fila = roteiro[comando];
    const ok = fila === undefined ? true : (fila.shift() ?? false);
    return { ok, saida: ok ? "pronto" : "no chão" };
  };
  return { exec, chamadas };
}

describe("lerServicos", () => {
  it("projeto sem ci.json não declara serviço nenhum", async () => {
    expect(await lerServicos(await projetoFalso(null))).toEqual([]);
  });

  /**
   * A garantia que mantém este módulo barato: projeto que não declara `servicos` não paga
   * nada, e o pipeline segue idêntico ao de antes do pré-voo existir.
   */
  it("ci.json sem a chave `servicos` devolve lista vazia", async () => {
    const dir = await projetoFalso(JSON.stringify({ ecossistema: "elixir", estagios: [] }));
    expect(await lerServicos(dir)).toEqual([]);
  });

  it("JSON inválido não derruba o pipeline — devolve vazio", async () => {
    expect(await lerServicos(await projetoFalso("{ isto não é json"))).toEqual([]);
  });

  it("lê nome, checar e subir", async () => {
    const dir = await projetoFalso(
      JSON.stringify({ servicos: [{ nome: "postgres", checar: "pg_isready", subir: "sobe.ps1" }] }),
    );
    expect(await lerServicos(dir)).toEqual([
      { nome: "postgres", checar: "pg_isready", subir: "sobe.ps1" },
    ]);
  });

  it("`subir` é opcional — sem ele o pré-voo só constata", async () => {
    const dir = await projetoFalso(
      JSON.stringify({ servicos: [{ nome: "redis", checar: "redis-cli ping" }] }),
    );
    const s = await lerServicos(dir);
    expect(s[0]?.subir).toBeUndefined();
  });

  /** Sem comando de checagem não há pré-voo, só palpite — e palpite é o que isto remove. */
  it("descarta entrada sem `checar` em vez de inventar um", async () => {
    const dir = await projetoFalso(
      JSON.stringify({
        servicos: [{ nome: "sem-checagem" }, { checar: "sem-nome" }, { nome: "ok", checar: "c" }],
      }),
    );
    expect(await lerServicos(dir)).toEqual([{ nome: "ok", checar: "c" }]);
  });
});

describe("conferirServicos", () => {
  const postgres: ServicoDeclarado = { nome: "postgres", checar: "checa", subir: "sobe" };

  it("serviço no ar não roda `subir` — custo zero quando está tudo bem", async () => {
    const { exec, chamadas } = executorFalso({ checa: [true] });
    const r = await conferirServicos([postgres], exec);
    expect(r).toEqual([{ nome: "postgres", noAr: true, religado: false }]);
    expect(chamadas).toEqual(["checa"]);
  });

  it("serviço no chão é religado e a rodada segue", async () => {
    const { exec, chamadas } = executorFalso({ checa: [false, true], sobe: [true] });
    const r = await conferirServicos([postgres], exec);
    expect(r[0]).toMatchObject({ noAr: true, religado: true });
    expect(chamadas).toEqual(["checa", "sobe", "checa"]);
  });

  /**
   * A regra que veio da máquina real: `banco-v2.ps1 subir` SAI NÃO-ZERO quando o Postgres
   * entra em crash recovery, e mesmo assim o banco sobe segundos depois. Quem responde
   * "está no ar?" é o checador, nunca o script de subida.
   */
  it("veredito é do `checar`, mesmo quando o `subir` sai não-zero", async () => {
    const { exec } = executorFalso({ checa: [false, true], sobe: [false] });
    const r = await conferirServicos([postgres], exec);
    expect(r[0]).toMatchObject({ noAr: true, religado: true });
  });

  it("sem `subir`, serviço no chão é só constatado", async () => {
    const { exec, chamadas } = executorFalso({ checa: [false] });
    const r = await conferirServicos([{ nome: "redis", checar: "checa" }], exec);
    expect(r[0]).toMatchObject({ noAr: false, religado: false });
    expect(chamadas).toEqual(["checa"]);
  });

  /** UMA tentativa, não um laço: quem persiste é o vigia, fora da rodada. */
  it("não insiste quando o `subir` não resolve", async () => {
    const { exec, chamadas } = executorFalso({ checa: [false, false], sobe: [true] });
    const r = await conferirServicos([postgres], exec);
    expect(r[0]?.noAr).toBe(false);
    expect(chamadas).toEqual(["checa", "sobe", "checa"]);
  });

  it("detalhe do fracasso vai para o relatório", async () => {
    const { exec } = executorFalso({ checa: [false, false], sobe: [false] });
    const r = await conferirServicos([postgres], exec);
    expect(r[0]?.detalhe).toContain("no chão");
  });
});

describe("servicosNoChao", () => {
  it("só os que continuam fora depois da tentativa", () => {
    const chao = servicosNoChao([
      { nome: "a", noAr: true, religado: false },
      { nome: "b", noAr: false, religado: false },
      { nome: "c", noAr: true, religado: true },
    ]);
    expect(chao.map((s) => s.nome)).toEqual(["b"]);
  });

  it("tudo no ar = lista vazia, e a rodada começa", () => {
    expect(servicosNoChao([{ nome: "a", noAr: true, religado: false }])).toEqual([]);
  });
});
