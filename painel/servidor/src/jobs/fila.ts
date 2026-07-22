import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { carregarJobs, salvarJob } from "./persistencia.js";
import {
  ESTADOS_CANCELAVEIS,
  ESTADOS_TERMINAIS,
  type ContextoExecucao,
  type EscopoLock,
  type EstadoJob,
  type EventoJob,
  type Job,
  type Runner,
} from "./tipos.js";

/** Job referenciado não existe (a rota traduz para 404). */
export class ErroJobNaoEncontrado extends Error {
  constructor(id: string) {
    super(`Job "${id}" não encontrado`);
    this.name = "ErroJobNaoEncontrado";
  }
}

/** Job existe mas está em estado que não aceita cancelamento (a rota traduz para 409). */
export class ErroJobNaoCancelavel extends Error {
  constructor(job: Job) {
    super(`Job "${job.id}" não pode ser cancelado no estado "${job.estado}"`);
    this.name = "ErroJobNaoCancelavel";
  }
}

export interface OpcoesGerenciador {
  /** Diretório dos metadados persistidos (produção: `dados/jobs/`). */
  dirJobs: string;
  /** Teto de jobs `usaClaude` executando ao mesmo tempo (>= 1). */
  tetoClaude: number;
}

export interface NovoJob {
  tipo: string;
  titulo: string;
  escopo: EscopoLock;
  usaClaude: boolean;
  params?: Record<string, unknown>;
}

interface Execucao {
  job: Job;
  controlador: AbortController;
}

/**
 * Fila de jobs com locks de concorrência (decisão em _gestao/DECISOES.md 2026-07-21):
 *
 * - `global` executa somente quando NADA mais roda e, enquanto executa, nada inicia.
 *   Um global aguardando na fila também barra os jobs enfileirados DEPOIS dele
 *   (senão jobs de projeto o adiariam para sempre).
 * - Dois jobs do MESMO projeto nunca executam juntos; projetos diferentes executam em
 *   paralelo até o teto Claude (`usaClaude: true`); jobs não-Claude ignoram o teto.
 * - Runners são plugáveis por tipo (`registrarRunner`); o runner real chega na T-008.
 *
 * Transições e eventos de runner saem TODOS no `emissor`, evento `"evento"`, payload
 * `EventoJob` (canal único — a T-009 pluga o SSE nele).
 */
export class GerenciadorJobs {
  readonly emissor = new EventEmitter();

  private readonly jobs = new Map<string, Job>();
  /** IDs em estado `na-fila`, na ordem de chegada. */
  private readonly fila: string[] = [];
  private readonly execucoes = new Map<string, Execucao>();
  /** Jobs cujo cancelamento foi pedido enquanto executavam. */
  private readonly cancelamentosPedidos = new Set<string>();
  private readonly runners = new Map<string, Runner>();
  private readonly dirJobs: string;
  private readonly tetoClaude: number;

  constructor(opcoes: OpcoesGerenciador) {
    this.dirJobs = opcoes.dirJobs;
    if (!Number.isInteger(opcoes.tetoClaude) || opcoes.tetoClaude < 1) {
      throw new Error(`Teto Claude inválido: ${opcoes.tetoClaude}. Use um inteiro >= 1.`);
    }
    this.tetoClaude = opcoes.tetoClaude;

    // Histórico persistido volta para a memória. Job que ficou em estado não-terminal
    // (processo caiu/reiniciou no meio) vira `interrompido` — o disco nunca fica
    // mentindo "executando" para sempre.
    for (const job of carregarJobs(this.dirJobs)) {
      if (!ESTADOS_TERMINAIS.has(job.estado)) {
        job.estado = "interrompido";
        job.terminadoEm = agora();
        job.erro = "Processo do painel reiniciou antes de o job terminar";
        this.persistir(job);
      }
      this.jobs.set(job.id, job);
    }
  }

  /** Pluga o runner de um tipo de job (ex.: "fake" nos testes; "claude" na T-008). */
  registrarRunner(tipo: string, runner: Runner): void {
    this.runners.set(tipo, runner);
  }

  /** Cria o job em `na-fila`, persiste e tenta agendar imediatamente. */
  criarJob(entrada: NovoJob): Job {
    if (!this.runners.has(entrada.tipo)) {
      throw new Error(`Tipo de job desconhecido: "${entrada.tipo}" (nenhum runner registrado)`);
    }
    validarEscopo(entrada.escopo);
    const job: Job = {
      id: this.gerarId(),
      tipo: entrada.tipo,
      titulo: entrada.titulo,
      escopo: entrada.escopo,
      usaClaude: entrada.usaClaude,
      params: entrada.params ?? {},
      estado: "na-fila",
      criadoEm: agora(),
    };
    // Persiste ANTES de entrar na fila: se o disco falhar (cheio, EBUSY) ou os params
    // não serializarem (BigInt, referência circular), o chamador recebe o erro e
    // NENHUM job fantasma fica agendável. Também garante que todo job na memória é
    // serializável — as transições seguintes usam persistência não-fatal.
    salvarJob(this.dirJobs, job);
    this.jobs.set(job.id, job);
    this.fila.push(job.id);
    this.emitirEvento(job.id, "estado", { de: null, para: job.estado, job: { ...job } });
    this.agendar();
    return job;
  }

  obter(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  /** Lista jobs (mais recentes primeiro), com filtro opcional por estado. */
  listar(estado?: EstadoJob): Job[] {
    const todos = [...this.jobs.values()];
    const filtrados = estado ? todos.filter((job) => job.estado === estado) : todos;
    return filtrados.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }

  /**
   * Cancela um job. `na-fila`: sai da fila e termina `cancelado` na hora.
   * `executando`/`aguardando-input`: aciona o AbortSignal do runner; o estado final
   * `cancelado` assenta quando a promessa do runner terminar. Retorna o job no estado
   * pós-pedido.
   */
  cancelar(id: string): Job {
    const job = this.jobs.get(id);
    if (!job) throw new ErroJobNaoEncontrado(id);
    if (!ESTADOS_CANCELAVEIS.has(job.estado)) throw new ErroJobNaoCancelavel(job);

    if (job.estado === "na-fila") {
      const posicao = this.fila.indexOf(id);
      if (posicao !== -1) this.fila.splice(posicao, 1);
      this.mudarEstado(job, "cancelado", { terminadoEm: agora() });
      // Um global cancelado deixa de barrar quem estava atrás dele na fila.
      this.agendar();
      return job;
    }

    // Contrato para a T-008: job em `aguardando-input` DEVE manter sua entrada em
    // `execucoes` (a promessa do runner segue pendente enquanto espera o input do
    // usuário). Sem ela, o `?.abort()` abaixo vira no-op silencioso e o 202 da rota
    // promete um cancelamento que nunca assenta. Na T-007 nada gera esse estado.
    this.cancelamentosPedidos.add(id);
    this.execucoes.get(id)?.controlador.abort();
    return job;
  }

  /** Quantos jobs estão executando agora (diagnóstico/testes). */
  get executandoAgora(): number {
    return this.execucoes.size;
  }

  // ------------------------------------------------------------------ internos

  private agendar(): void {
    // Global executando = exclusividade total: nada inicia até ele terminar.
    if ([...this.execucoes.values()].some(({ job }) => job.escopo === "global")) return;

    for (const id of [...this.fila]) {
      const job = this.jobs.get(id);
      // Guarda contra reentrância: um listener síncrono do emissor pode cancelar um
      // job enfileirado DURANTE este passe (a cópia da fila fica defasada) — job que
      // já saiu de `na-fila` nunca inicia.
      if (!job || job.estado !== "na-fila") continue;

      if (job.escopo === "global") {
        // Só inicia com a máquina vazia; iniciando ou não, barra os que vieram depois.
        if (this.execucoes.size === 0) this.iniciar(job);
        break;
      }

      const ocupado = [...this.execucoes.values()].some(({ job: j }) => j.escopo === job.escopo);
      if (ocupado) continue;

      if (job.usaClaude) {
        const claudeAtivos = [...this.execucoes.values()].filter(({ job: j }) => j.usaClaude).length;
        if (claudeAtivos >= this.tetoClaude) continue;
      }

      this.iniciar(job);
    }
  }

  private iniciar(job: Job): void {
    const posicao = this.fila.indexOf(job.id);
    if (posicao !== -1) this.fila.splice(posicao, 1);

    const controlador = new AbortController();
    this.execucoes.set(job.id, { job, controlador });
    this.mudarEstado(job, "executando", { iniciadoEm: agora() });

    const runner = this.runners.get(job.tipo);
    const contexto: ContextoExecucao = {
      emitir: (tipo, dados) => this.emitirEvento(job.id, tipo, dados),
      sinal: controlador.signal,
    };

    // Promise.resolve().then(...) também captura runner que lança sincronamente.
    // A cadeia final NUNCA pode virar unhandled rejection (Node 22 derrubaria o
    // processo inteiro): `mudarEstado` já engole falha de persistência/listener,
    // o `finally` garante que a fila sempre reagenda e o `.catch` é o pára-quedas
    // de última instância.
    void Promise.resolve()
      .then(() => {
        if (!runner) throw new Error(`Nenhum runner registrado para o tipo "${job.tipo}"`);
        return runner.executar(job, contexto);
      })
      .then(
        (resultado) => ({ falha: undefined, resultado }),
        (falha: unknown) => ({ falha: mensagemDeErro(falha), resultado: undefined }),
      )
      .then(({ falha, resultado }) => {
        const cancelado = this.cancelamentosPedidos.has(job.id);
        this.execucoes.delete(job.id);
        this.cancelamentosPedidos.delete(job.id);
        try {
          if (cancelado) {
            this.mudarEstado(job, "cancelado", { terminadoEm: agora() });
          } else if (falha !== undefined) {
            this.mudarEstado(job, "falhou", { terminadoEm: agora(), erro: falha });
          } else {
            this.mudarEstado(job, "concluido", { terminadoEm: agora(), resultado });
          }
        } finally {
          this.agendar();
        }
      })
      .catch((erro: unknown) => {
        console.error(
          `[jobs] Erro inesperado ao assentar o job ${job.id}: ${mensagemDeErro(erro)}`,
        );
      });
  }

  /**
   * Transição de estado no caminho quente da fila: NUNCA lança. Persistência que
   * falha é avisada e o fluxo segue (o estado em memória é a fonte imediata; o boot
   * saneador conserta o disco no próximo reinício). Listener que lança também não
   * derruba a fila (ver `emitirEvento`).
   */
  private mudarEstado(job: Job, novo: EstadoJob, extras: Partial<Job>): void {
    const de = job.estado;
    job.estado = novo;
    Object.assign(job, extras);
    this.persistir(job);
    this.emitirEvento(job.id, "estado", { de, para: novo, job: { ...job } });
  }

  /** Persistência não-fatal: disco cheio/EBUSY/EPERM não pode matar a fila. */
  private persistir(job: Job): void {
    try {
      salvarJob(this.dirJobs, job);
    } catch (erro) {
      console.warn(
        `[jobs] Falha ao persistir o job ${job.id} (estado "${job.estado}"): ` +
          `${mensagemDeErro(erro)}. O estado em memória segue valendo.`,
      );
    }
  }

  /** Emissão não-fatal: listener que lança (ex.: SSE da T-009) não derruba a fila. */
  private emitirEvento(jobId: string, tipo: string, dados?: unknown): void {
    const evento: EventoJob = { jobId, tipo, dados, em: agora() };
    try {
      this.emissor.emit("evento", evento);
    } catch (erro) {
      console.error(
        `[jobs] Listener de evento lançou ao processar "${tipo}" do job ${jobId}: ` +
          mensagemDeErro(erro),
      );
    }
  }

  private gerarId(): string {
    for (;;) {
      const id = randomUUID().replaceAll("-", "").slice(0, 8);
      if (!this.jobs.has(id)) return id;
    }
  }
}

function validarEscopo(escopo: string): asserts escopo is EscopoLock {
  if (escopo === "global") return;
  if (escopo.startsWith("projeto:") && escopo.length > "projeto:".length) return;
  throw new Error(`Escopo de lock inválido: "${escopo}". Use "global" ou "projeto:<nome>".`);
}

function mensagemDeErro(falha: unknown): string {
  return falha instanceof Error ? falha.message : String(falha);
}

function agora(): string {
  return new Date().toISOString();
}
