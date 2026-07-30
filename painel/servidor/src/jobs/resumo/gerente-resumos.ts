import type { GerenciadorJobs } from "../fila.js";
import type { DadosTransicao, EventoJob, Job } from "../tipos.js";
import { ESTADOS_TERMINAIS } from "../tipos.js";
import type { Consulta } from "../claude/runner-claude.js";
import { consultaReal } from "../claude/runner-claude.js";
import { RastreadorTrechos, type TrechoFechado } from "./segmentos.js";
import { resumirTrecho } from "./resumidor.js";

/**
 * Gerente de resumos (T-039): vigia os logs, e cada vez que um TRECHO de agente fecha,
 * manda resumir num modelo barato e anexa o resultado ao job.
 *
 * Mesmo padrão do watchdog — escuta o emissor da fila, sem acoplar o runner.
 *
 * Duas decisões:
 *
 * 1. **Resume só quando o trecho FECHA**, nunca durante. Resumir trecho aberto entregaria
 *    o resumo de metade do trabalho e ainda cobraria de novo quando o resto chegasse.
 * 2. **Nada aqui pode derrubar a fila.** Resumo é conveniência: se o modelo estiver fora,
 *    o console volta a mostrar o texto cru e o job segue igual. Por isso tudo é
 *    disparado sem `await` na cadeia da fila e todo erro morre aqui dentro.
 */
/**
 * O job terminou por limite de uso da assinatura? Lido por FORMA do `resultado` (o runner
 * Claude grava `motivo: "limite-uso"` lá), para o gerente não depender do runner.
 */
function motivoLimiteDeUso(job: Job | undefined): boolean {
  const r = job?.resultado;
  return r !== null && typeof r === "object" && (r as { motivo?: unknown }).motivo === "limite-uso";
}

export class GerenteResumos {
  private readonly rastreadores = new Map<string, RastreadorTrechos>();
  /** Resumos em voo, para o `parar()` de teste conseguir esperar tudo assentar. */
  private readonly emVoo = new Set<Promise<void>>();

  constructor(
    private readonly gerenciador: GerenciadorJobs,
    private readonly consulta: Consulta = consultaReal,
  ) {}

  iniciar(): void {
    this.gerenciador.emissor.on("evento", this.aoEvento);
  }

  parar(): void {
    this.gerenciador.emissor.off("evento", this.aoEvento);
    this.rastreadores.clear();
  }

  /** Espera os resumos em voo (só os testes precisam disso). */
  async aguardar(): Promise<void> {
    while (this.emVoo.size > 0) await Promise.all([...this.emVoo]);
  }

  private readonly aoEvento = (evento: EventoJob): void => {
    if (evento.tipo === "log") {
      const dados = (evento.dados ?? {}) as { nivel?: unknown; texto?: unknown };
      if (typeof dados.nivel !== "string" || typeof dados.texto !== "string") return;

      // Só fluxos Claude: um pipeline de CI não tem agentes, e resumir stdout de build
      // com um modelo seria gastar para explicar o que o próprio comando já diz.
      const job = this.gerenciador.obter(evento.jobId);
      if (job === undefined || !job.usaClaude) return;

      const rastreador = this.obterRastreador(evento.jobId);
      const fechado = rastreador.adicionar({
        nivel: dados.nivel,
        texto: dados.texto,
        em: evento.em,
      });
      if (fechado !== null) this.despachar(evento.jobId, fechado);
      return;
    }

    if (evento.tipo === "estado") {
      const { para, job } = (evento.dados ?? {}) as Partial<DadosTransicao>;
      if (para === undefined || !ESTADOS_TERMINAIS.has(para)) return;
      // Fim do job: fecha o trecho em aberto — senão o último agente, justamente o que
      // costuma trazer a conclusão, nunca ganharia resumo.
      const rastreador = this.rastreadores.get(evento.jobId);
      this.rastreadores.delete(evento.jobId);
      const ultimo = rastreador?.encerrar() ?? null;
      if (ultimo === null) return;

      // Cota batida (T-045): resumir agora é chamada garantidamente perdida — o resumidor
      // usa a MESMA assinatura que acabou de bater no teto. Na rodada real isso rendeu
      // dois cartões `naoDeu` que só informavam que a cota estava esgotada.
      if (motivoLimiteDeUso(job)) {
        console.warn(
          `[resumos] Job ${evento.jobId} parou por limite de uso — resumo do trecho ` +
            `${ultimo.indice} adiado para não gastar contra a cota esgotada.`,
        );
        return;
      }
      this.despachar(evento.jobId, ultimo);
    }
  };

  private obterRastreador(jobId: string): RastreadorTrechos {
    let r = this.rastreadores.get(jobId);
    if (r === undefined) {
      r = new RastreadorTrechos();
      this.rastreadores.set(jobId, r);
    }
    return r;
  }

  /** Dispara o resumo em segundo plano. Erro morre aqui: a fila não pode ser afetada. */
  private despachar(jobId: string, trecho: TrechoFechado): void {
    const promessa = (async () => {
      try {
        const resumo = await resumirTrecho(trecho, this.consulta);
        this.gerenciador.anexarResumo(jobId, resumo);
      } catch (erro) {
        console.error(
          `[resumos] Falha ao resumir o trecho ${trecho.indice} do job ${jobId}: ${
            erro instanceof Error ? erro.message : String(erro)
          }. O console cai no texto cru.`,
        );
      }
    })();
    this.emVoo.add(promessa);
    void promessa.finally(() => this.emVoo.delete(promessa));
  }
}
