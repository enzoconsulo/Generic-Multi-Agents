import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ConfigCi } from "../../src/ci/config.js";
import { lerResultados } from "../../src/ci/resultados.js";
import { RunnerCi, montarJobCi } from "../../src/ci/runner-ci.js";
import type { ContextoExecucao, Job } from "../../src/jobs/tipos.js";

/** Fábrica falsa mínima com um projeto sob projetos/<nome>. */
function fabricaComProjeto(nome: string, arquivos: Record<string, string> = {}): string {
  const raiz = mkdtempSync(join(tmpdir(), "ci-run-fab-"));
  const dir = join(raiz, "projetos", nome);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "_gestao"), { recursive: true });
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    writeFileSync(join(dir, rel), conteudo, "utf8");
  }
  return raiz;
}

/**
 * Grava `_gestao/ci.json` DIRETO (em vez de deixar deduzir do package.json): os testes
 * do runner focam na ORQUESTRAÇÃO dos estágios (ordem, pular, falha, cancelamento), não
 * na dedução de defaults (coberta em `config.test.ts`) — usar `npm install` de verdade
 * aqui deixaria a suíte lenta e sujeita à variação de carga da máquina.
 */
function escreverCiJson(dirProjeto: string, config: ConfigCi): void {
  writeFileSync(join(dirProjeto, "_gestao", "ci.json"), JSON.stringify(config), "utf8");
}

function ctxFake(sinal: AbortSignal = new AbortController().signal) {
  const eventos: { tipo: string; dados?: unknown }[] = [];
  const ctx: ContextoExecucao = {
    emitir: (tipo, dados) => eventos.push({ tipo, dados }),
    sinal,
    pedirInput: async () => ({}),
    anotar: () => {},
  };
  return { ctx, eventos };
}

function porEstagio<T extends { estagio: string }>(estagios: T[], nome: string): T {
  const achado = estagios.find((e) => e.estagio === nome);
  if (achado === undefined) throw new Error(`Estágio "${nome}" ausente no resultado.`);
  return achado;
}

function jobDe(params: Record<string, unknown>): Job {
  return {
    id: "ci-teste",
    tipo: "ci",
    titulo: "CI: teste",
    escopo: `projeto:${params.projeto as string}`,
    usaClaude: false,
    params,
    estado: "executando",
    criadoEm: new Date().toISOString(),
  };
}

describe("montarJobCi", () => {
  it("valida config (deduzindo defaults) e monta o job não-Claude com lock por projeto", async () => {
    const raiz = fabricaComProjeto("app", {
      "package.json": JSON.stringify({ scripts: { test: "node t.js" } }),
    });
    const novo = await montarJobCi("app", raiz, join(raiz, "dados"));
    expect(novo).toEqual({
      tipo: "ci",
      titulo: "CI: app",
      escopo: "projeto:app",
      usaClaude: false,
      params: { projeto: "app", fabricaRaiz: raiz, dirDados: join(raiz, "dados") },
    });
  });
});

describe("RunnerCi.executar", () => {
  it(
    "roda os estágios habilitados em ordem, pula lint (sem script) com aviso, persiste resultado",
    async () => {
      const raiz = fabricaComProjeto("verde", {
        "instalar.js": "console.log('instalando'); process.exit(0);",
        "teste.js": "console.log('rodando testes'); process.exit(0);",
        "build.js": "console.log('buildando'); process.exit(0);",
      });
      const dirProjeto = join(raiz, "projetos", "verde");
      escreverCiJson(dirProjeto, {
        estagios: {
          instalar: { comando: "node instalar.js", habilitado: true },
          lint: { comando: null, habilitado: false },
          testes: { comando: "node teste.js", habilitado: true },
          build: { comando: "node build.js", habilitado: true },
        },
        timeoutMs: 10000,
      });
      const dirDados = join(raiz, "dados");
      const { ctx, eventos } = ctxFake();
      const job = jobDe({ projeto: "verde", fabricaRaiz: raiz, dirDados });

      const resultado = (await new RunnerCi().executar(job, ctx)) as {
        estado: string;
        estagios: { estagio: string; estado: string; aviso: string | null }[];
      };

      expect(resultado.estado).toBe("sucesso");
      expect(porEstagio(resultado.estagios, "instalar").estado).toBe("sucesso");
      expect(porEstagio(resultado.estagios, "lint").estado).toBe("pulado");
      expect(porEstagio(resultado.estagios, "lint").aviso).toMatch(/desabilitado/i);
      expect(porEstagio(resultado.estagios, "testes").estado).toBe("sucesso");
      expect(porEstagio(resultado.estagios, "build").estado).toBe("sucesso");

      // Persistido em dados/ci/<projeto>.json
      const persistido = lerResultados(dirDados, "verde");
      expect(persistido?.ultimo.estado).toBe("sucesso");
      expect(persistido?.ultimo.jobId).toBe("ci-teste");

      // Log dos estágios chegou via ctx.emitir com o estágio identificado.
      const logsTestes = eventos.filter(
        (e) => e.tipo === "log" && (e.dados as { estagio?: string }).estagio === "testes",
      );
      expect(logsTestes.some((e) => (e.dados as { texto?: string }).texto === "rodando testes")).toBe(
        true,
      );
    },
    10000,
  );

  it(
    "estágio que sai com código != 0 falha, interrompe os seguintes e o resultado reflete isso",
    async () => {
      const raiz = fabricaComProjeto("vermelho", {
        "teste.js": "console.error('teste quebrou'); process.exit(1);",
        "build.js": "console.log('não deveria rodar'); process.exit(0);",
      });
      const dirProjeto = join(raiz, "projetos", "vermelho");
      escreverCiJson(dirProjeto, {
        estagios: {
          instalar: { comando: null, habilitado: false },
          lint: { comando: null, habilitado: false },
          testes: { comando: "node teste.js", habilitado: true },
          build: { comando: "node build.js", habilitado: true },
        },
        timeoutMs: 10000,
      });
      const dirDados = join(raiz, "dados");
      const { ctx } = ctxFake();
      const job = jobDe({ projeto: "vermelho", fabricaRaiz: raiz, dirDados });

      const resultado = (await new RunnerCi().executar(job, ctx)) as {
        estado: string;
        estagios: { estagio: string; estado: string; codigoSaida: number | null; aviso: string | null }[];
      };

      expect(resultado.estado).toBe("falhou");
      expect(porEstagio(resultado.estagios, "testes").estado).toBe("falhou");
      expect(porEstagio(resultado.estagios, "testes").codigoSaida).toBe(1);
      expect(porEstagio(resultado.estagios, "build").estado).toBe("pulado");
      expect(porEstagio(resultado.estagios, "build").aviso).toMatch(/anterior falhou/i);

      const persistido = lerResultados(dirDados, "vermelho");
      expect(persistido?.ultimo.estado).toBe("falhou");
    },
    10000,
  );

  it("cancelamento (sinal abortado) encerra o processo em andamento e não roda os estágios seguintes", async () => {
    const raiz = fabricaComProjeto("cancelavel", {
      "teste.js": "setInterval(() => {}, 1000);",
    });
    const dirProjeto = join(raiz, "projetos", "cancelavel");
    escreverCiJson(dirProjeto, {
      estagios: {
        instalar: { comando: null, habilitado: false },
        lint: { comando: null, habilitado: false },
        testes: { comando: "node teste.js", habilitado: true },
        build: { comando: null, habilitado: false },
      },
      timeoutMs: 10000,
    });
    const dirDados = join(raiz, "dados");
    const controlador = new AbortController();
    const { ctx } = ctxFake(controlador.signal);
    const job = jobDe({ projeto: "cancelavel", fabricaRaiz: raiz, dirDados });

    setTimeout(() => controlador.abort(), 200);
    const resultado = (await new RunnerCi().executar(job, ctx)) as { estado: string };
    expect(resultado.estado).toBe("cancelado");
  }, 20000);
});
