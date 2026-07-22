import { join } from "node:path";
import { montarJobAnalise } from "../acoes/analise.js";
import { obterGerenciador } from "../jobs/instancia.js";
import type { ContextoExecucao, Job, Runner } from "../jobs/tipos.js";
import { executarImportacao } from "./importar.js";

/**
 * Runner do job NÃO-Claude de importação (T-013): copia a pasta para `projetos/<nome>/`,
 * garante git + `_gestao/` mínimo e, ao final, ENFILEIRA a análise do projeto recém-
 * importado. O lock `projeto:<nome>` (compartilhado pelos dois jobs) garante que a análise
 * só rode depois que a cópia terminar.
 */

interface ParamsImportar {
  origem: string;
  nome: string;
  fabricaRaiz: string;
  modeloAnalise: string;
  fallbackAnalise?: string;
}

export class RunnerImportar implements Runner {
  async executar(job: Job, ctx: ContextoExecucao): Promise<unknown> {
    const p = lerParams(job.params);
    const destino = join(p.fabricaRaiz, "projetos", p.nome);

    await executarImportacao(p.origem, destino, p.fabricaRaiz, p.nome, ctx);

    // Enfileira a análise (não-fatal: a cópia já valeu; sem runner claude só logamos).
    try {
      const jobAnalise = await montarJobAnalise(p.nome, p.fabricaRaiz, {
        modelo: p.modeloAnalise,
        fallback: p.fallbackAnalise,
      });
      const criado = obterGerenciador().criarJob(jobAnalise);
      ctx.emitir("log", {
        nivel: "resultado",
        texto: `Análise do projeto importado enfileirada (job ${criado.id}).`,
      });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      ctx.emitir("log", {
        nivel: "erro",
        texto: `Cópia concluída, mas não foi possível enfileirar a análise: ${mensagem}`,
      });
    }

    return { nome: p.nome, destino };
  }
}

function lerParams(params: Record<string, unknown>): ParamsImportar {
  const origem = params["origem"];
  const nome = params["nome"];
  const fabricaRaiz = params["fabricaRaiz"];
  const modeloAnalise = params["modeloAnalise"];
  const fallbackAnalise = params["fallbackAnalise"];
  if (typeof origem !== "string" || origem === "") throw new Error("Job importar sem `origem`.");
  if (typeof nome !== "string" || nome === "") throw new Error("Job importar sem `nome`.");
  if (typeof fabricaRaiz !== "string" || fabricaRaiz === "") {
    throw new Error("Job importar sem `fabricaRaiz`.");
  }
  if (typeof modeloAnalise !== "string" || modeloAnalise === "") {
    throw new Error("Job importar sem `modeloAnalise`.");
  }
  return {
    origem,
    nome,
    fabricaRaiz,
    modeloAnalise,
    ...(typeof fallbackAnalise === "string" && fallbackAnalise !== "" ? { fallbackAnalise } : {}),
  };
}
