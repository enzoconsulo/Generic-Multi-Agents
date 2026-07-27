import { dirProjeto, ErroProjetoInexistente } from "../acoes/analise.js";
import type { NovoJob } from "../jobs/fila.js";
import type { ContextoExecucao, Job, Runner } from "../jobs/tipos.js";
import { ESTAGIOS_CI, lerOuCriarConfig, type ConfigEstagioCi, type EstagioCi } from "./config.js";
import { executarComando } from "./processo.js";
import { salvarResultado, type EstadoResultadoCi, type ResultadoCi, type ResultadoEstagio } from "./resultados.js";

/**
 * Runner do job NÃO-Claude de CI (T-017): roda instalar→lint→testes→build via
 * `_gestao/ci.json` do projeto, com log ao vivo (SSE) e resultado persistido em
 * `dados/ci/<projeto>.json`. Lock `projeto:<nome>` (mesmo escopo do runner Claude e do
 * de importação) garante que nunca roda junto com um fluxo do mesmo projeto.
 */

interface ParamsCi {
  projeto: string;
  fabricaRaiz: string;
  dirDados: string;
}

function lerParams(params: Record<string, unknown>): ParamsCi {
  const projeto = params["projeto"];
  const fabricaRaiz = params["fabricaRaiz"];
  const dirDados = params["dirDados"];
  if (typeof projeto !== "string" || projeto === "") throw new Error("Job CI sem `projeto`.");
  if (typeof fabricaRaiz !== "string" || fabricaRaiz === "") {
    throw new Error("Job CI sem `fabricaRaiz`.");
  }
  if (typeof dirDados !== "string" || dirDados === "") throw new Error("Job CI sem `dirDados`.");
  return { projeto, fabricaRaiz, dirDados };
}

/**
 * Monta o job "ci". Valida a existência do projeto e da config (cria defaults do
 * ecossistema se faltar) ANTES de enfileirar — projeto inexistente falha na hora, não
 * depois de esperar o lock. Lança `ErroProjetoInexistente` se o projeto não existe.
 */
export async function montarJobCi(
  projeto: string,
  fabricaRaiz: string,
  dirDados: string,
): Promise<NovoJob> {
  const dir = dirProjeto(fabricaRaiz, projeto);
  if (dir === null) throw new ErroProjetoInexistente(projeto);
  await lerOuCriarConfig(dir);
  return {
    tipo: "ci",
    titulo: `CI: ${projeto}`,
    escopo: `projeto:${projeto}`,
    usaClaude: false,
    params: { projeto, fabricaRaiz, dirDados },
  };
}

function pulado(estagio: EstagioCi, cfg: ConfigEstagioCi, aviso: string): ResultadoEstagio {
  return {
    estagio,
    estado: "pulado",
    comando: cfg.comando,
    iniciadoEm: null,
    terminadoEm: null,
    duracaoMs: null,
    codigoSaida: null,
    aviso,
  };
}

function agora(): string {
  return new Date().toISOString();
}

export class RunnerCi implements Runner {
  async executar(job: Job, ctx: ContextoExecucao): Promise<unknown> {
    const p = lerParams(job.params);
    const dir = dirProjeto(p.fabricaRaiz, p.projeto);
    if (dir === null) throw new ErroProjetoInexistente(p.projeto);

    const cfg = await lerOuCriarConfig(dir);

    const resultado: ResultadoCi = {
      jobId: job.id,
      projeto: p.projeto,
      estado: "executando",
      iniciadoEm: agora(),
      terminadoEm: null,
      estagios: [],
    };
    const persistir = () => salvarResultado(p.dirDados, resultado);
    persistir();

    let interrompidoPorFalha = false;
    let cancelado = false;

    for (const nome of ESTAGIOS_CI) {
      if (ctx.sinal.aborted) {
        cancelado = true;
        break;
      }
      const cfgEstagio = cfg.estagios[nome];

      if (!cfgEstagio.habilitado || cfgEstagio.comando === null) {
        resultado.estagios.push(pulado(nome, cfgEstagio, "Estágio desabilitado na configuração."));
        ctx.emitir("ci-estagio", resultado.estagios.at(-1));
        persistir();
        continue;
      }

      if (interrompidoPorFalha) {
        resultado.estagios.push(
          pulado(nome, cfgEstagio, "Estágio anterior falhou — pipeline interrompido."),
        );
        ctx.emitir("ci-estagio", resultado.estagios.at(-1));
        persistir();
        continue;
      }

      const iniciadoEm = agora();
      const t0 = Date.now();
      ctx.emitir("ci-estagio-inicio", { estagio: nome, comando: cfgEstagio.comando });
      const { codigoSaida, encerradoPor } = await executarComando({
        comando: cfgEstagio.comando,
        cwd: dir,
        timeoutMs: cfg.timeoutMs,
        sinal: ctx.sinal,
        aoLog: (texto, fluxo) => ctx.emitir("log", { estagio: nome, fluxo, texto }),
      });

      const estado: ResultadoEstagio["estado"] =
        encerradoPor === "cancelado" ? "cancelado" : encerradoPor === "timeout" ? "falhou" : codigoSaida === 0 ? "sucesso" : "falhou";

      const r: ResultadoEstagio = {
        estagio: nome,
        estado,
        comando: cfgEstagio.comando,
        iniciadoEm,
        terminadoEm: agora(),
        duracaoMs: Date.now() - t0,
        codigoSaida,
        aviso: encerradoPor === "timeout" ? `Timeout após ${cfg.timeoutMs}ms sem terminar.` : null,
      };
      resultado.estagios.push(r);
      ctx.emitir("ci-estagio", r);
      persistir();

      if (estado === "cancelado") {
        cancelado = true;
        break;
      }
      if (estado !== "sucesso") interrompidoPorFalha = true;
    }

    const estadoFinal: EstadoResultadoCi = cancelado
      ? "cancelado"
      : resultado.estagios.some((e) => e.estado === "falhou")
        ? "falhou"
        : "sucesso";
    resultado.estado = estadoFinal;
    resultado.terminadoEm = agora();
    persistir();
    ctx.emitir("ci-fim", resultado);

    return resultado;
  }
}
