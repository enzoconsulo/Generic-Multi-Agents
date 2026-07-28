import type { GerenciadorJobs } from "../fila.js";
import type { DadosTransicao, EventoJob, Job } from "../tipos.js";

/**
 * Watchdog de inatividade (T-019): vigia jobs Claude em execução e interrompe os que
 * ficam MUDOS por tempo demais — fluxo travado segurando o lock do projeto é o pior
 * estado do painel, porque nada mais daquele projeto anda até alguém perceber à mão.
 *
 * Duas decisões que valem registro:
 *
 * 1. **Conta a partir do ÚLTIMO evento, não do início.** Um `/trabalhar` legítimo pode
 *    durar horas; o que denuncia travamento é silêncio, não duração. (A pesquisa alerta
 *    que subagentes em background podem segurar o encerramento por até ~10 min APÓS o
 *    `result` — por isso o limite default é generoso.)
 * 2. **`aguardando-input` NÃO conta como inatividade.** O job está esperando um humano,
 *    e humano demora; matar por isso destruiria justamente o fluxo da T-010. O relógio
 *    volta a correr quando o job retoma para `executando`.
 *
 * Jobs não-Claude (CI, importação) ficam de fora: o CI já tem timeout por estágio (T-017)
 * e um `npm install` silencioso é normal — duas proteções concorrentes só criariam
 * interrupção falsa.
 */

export interface OpcoesWatchdog {
  /** Silêncio tolerado antes de interromper (ms) — usado quando o job não traz o seu. */
  limiteMs: number;
  /** Período da varredura (ms). Default: 1/4 do limite, no mínimo 1s. */
  intervaloMs?: number;
  /** Relógio injetável — os testes controlam o tempo sem esperar de verdade. */
  agora?: () => number;
}

/** O que o watchdog guarda de cada job vigiado. */
interface Vigiado {
  /** Instante do último sinal de vida. */
  ultimo: number;
  /** Silêncio tolerado POR ESTE job (ms) — vem de `params.watchdogMs`. */
  limiteMs: number;
}

export class Watchdog {
  private readonly ultimoEvento = new Map<string, Vigiado>();
  private temporizador: ReturnType<typeof setInterval> | undefined;
  private readonly agora: () => number;
  private readonly intervaloMs: number;

  constructor(
    private readonly gerenciador: GerenciadorJobs,
    private readonly opcoes: OpcoesWatchdog,
  ) {
    this.agora = opcoes.agora ?? (() => Date.now());
    this.intervaloMs = opcoes.intervaloMs ?? Math.max(1000, Math.floor(opcoes.limiteMs / 4));
  }

  /** Passa a vigiar. `unref` para o watchdog nunca segurar o processo vivo sozinho. */
  iniciar(): void {
    if (this.temporizador !== undefined) return;
    this.gerenciador.emissor.on("evento", this.aoEvento);
    this.temporizador = setInterval(() => this.varrer(), this.intervaloMs);
    this.temporizador.unref?.();
  }

  parar(): void {
    if (this.temporizador !== undefined) clearInterval(this.temporizador);
    this.temporizador = undefined;
    this.gerenciador.emissor.off("evento", this.aoEvento);
    this.ultimoEvento.clear();
  }

  /** Jobs sob vigilância agora (diagnóstico e testes). */
  get vigiados(): string[] {
    return [...this.ultimoEvento.keys()];
  }

  private readonly aoEvento = (evento: EventoJob): void => {
    if (evento.tipo === "estado") {
      const { para, job } = (evento.dados ?? {}) as Partial<DadosTransicao>;
      if (para === undefined || job === undefined) return;
      if (para === "executando" && this.deveVigiar(job)) {
        // O limite é resolvido na ENTRADA da vigilância e congelado: mudar de limite no
        // meio do silêncio faria o job saltar de "quase cortado" para "recém-visto".
        this.ultimoEvento.set(evento.jobId, {
          ultimo: this.agora(),
          limiteMs: limiteDoJob(job) ?? this.opcoes.limiteMs,
        });
      } else {
        // Terminal ou `aguardando-input`: sai da vigilância (ver decisão 2 acima).
        this.ultimoEvento.delete(evento.jobId);
      }
      return;
    }
    // Qualquer outro evento (log, ferramenta, estágio…) é sinal de vida.
    const vigiado = this.ultimoEvento.get(evento.jobId);
    if (vigiado !== undefined) vigiado.ultimo = this.agora();
  };

  private deveVigiar(job: Job): boolean {
    return job.usaClaude;
  }

  /**
   * Uma passada de verificação. Público para os testes rodarem determinístico (relógio
   * injetado + chamada direta), sem depender de timer real.
   */
  varrer(): void {
    const agora = this.agora();
    for (const [id, vigiado] of [...this.ultimoEvento]) {
      if (agora - vigiado.ultimo <= vigiado.limiteMs) continue;
      this.ultimoEvento.delete(id);
      try {
        // A mensagem informa o limite que valeu PARA ESTE job — dizer "15 min" onde
        // valeram 20 é a mesma família de erro que a tela que mente.
        this.gerenciador.interromper(id, motivoInatividade(vigiado.limiteMs));
      } catch {
        // O job pode ter assentado entre a varredura e a interrupção — nesse caso
        // `interromper` lança (estado não-cancelável) e não há nada a fazer.
      }
    }
  }
}

/**
 * Limite de silêncio que o próprio job carrega (`params.watchdogMs`, gravado por quem
 * montou o job a partir da tabela de guardrails). `null` quando o job não traz um válido
 * — aí vale o padrão do watchdog.
 *
 * O job carrega o valor em vez de o watchdog deduzir a ação a partir do título/prompt:
 * deduzir acoplaria o vigia ao texto dos comandos, que é justamente o que a tabela
 * data-driven existe para evitar.
 */
function limiteDoJob(job: Job): number | null {
  const bruto = (job.params ?? {})["watchdogMs"];
  return typeof bruto === "number" && Number.isFinite(bruto) && bruto > 0 ? bruto : null;
}

export function motivoInatividade(limiteMs: number): string {
  const minutos = Math.round(limiteMs / 60000);
  const janela = minutos >= 1 ? `${minutos} min` : `${Math.round(limiteMs / 1000)}s`;
  return `Interrompido pelo watchdog: nenhum sinal de atividade por mais de ${janela}.`;
}
