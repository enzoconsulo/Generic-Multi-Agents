import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { GerenciadorJobs, NovoJob } from "../fila.js";
import { ESTADOS_TERMINAIS, type DadosTransicao, type EventoJob, type Job } from "../tipos.js";
import {
  avancar,
  podeIniciarRodada,
  type DesfechoRodada,
  type EstadoPiloto,
  type LimitesPiloto,
} from "./decisao.js";
import { esperaDeRearme } from "./reabertura.js";

/**
 * PILOTO AUTOMÁTICO — o atuador: encadeia rodadas de `/trabalhar <projeto>` até um
 * critério de parada, sem ninguém apertar botão entre elas.
 *
 * **Por que rodada NOVA a cada volta, e não um job que nunca termina.** A pergunta que
 * originou isto foi "não acumula token demais?". No job `pipeline` não acumula: cada etapa
 * já é uma `query()` nova do SDK (não há `resume` em `despachante.ts`), então o contexto
 * nasce do zero em todo despacho. O que a rodada nova zera é OUTRA coisa, e é ela que
 * justifica o desenho:
 *
 * - o **orçamento** volta inteiro (`pipeline/orcamento.ts`), soltando as tarefas que a
 *   rodada anterior *estacionou* na fronteira do teto;
 * - as tarefas são **relidas do disco**, incorporando o que agentes e humanos mudaram;
 * - os **ritos de fecho** rodam (commit da gestão, documentador a cada lote de 3+);
 * - o log do job não cresce sem fim (ele já tem teto por job, em `historico-log.ts`).
 *
 * Ou seja: encadear jobs é o caminho de recuperação que o motor JÁ esperava — só faltava
 * quem apertasse o botão de novo. Este módulo é esse dedo.
 *
 * **O que ele não faz, de propósito:** não cancela job em voo quando é desligado. A
 * doutrina de custo da fábrica é "nunca cortar no meio, só não COMEÇAR o que não cabe" —
 * despacho interrompido custa igual sem entregar nada (US$ 4,11 medidos num corte por
 * cota). Desligar o piloto significa não encadear a PRÓXIMA rodada.
 */

/** O que o usuário escolhe ao ligar o piloto. */
export interface ConfigPiloto {
  projeto: string;
  estrategia: string;
  tetoUsdPorRodada?: number | null;
  limites: LimitesPiloto;
}

export interface OpcoesPiloto {
  /** Arquivo de estado (produção: `dados/piloto.json`). */
  arquivo: string;
  /** Monta o job da próxima rodada. Injetado para o teste não depender da config real. */
  montarRodada: (estado: EstadoPiloto) => NovoJob;
  /** Relógio injetável — os testes controlam o tempo sem esperar de verdade. */
  agora?: () => Date;
  /** Agendador injetável, pela mesma razão. Devolve o cancelador. */
  agendar?: (ms: number, acao: () => void) => () => void;
}

/** Piloto nunca existiu / foi apagado: a tela mostra o formulário de ligar. */
export class ErroPilotoDesligado extends Error {
  constructor() {
    super("O piloto automático não está ligado.");
    this.name = "ErroPilotoDesligado";
  }
}

export class Piloto {
  private estadoAtual: EstadoPiloto | null = null;
  private cancelarSoneca: (() => void) | null = null;
  private escutando = false;
  private readonly agora: () => Date;
  private readonly agendar: (ms: number, acao: () => void) => () => void;
  /**
   * Jobs cuja transição terminal NÃO deve ser interpretada como desfecho de rodada.
   *
   * Existe para o boot: o gerenciador sanea jobs pendurados do processo anterior e publica
   * as transições `→ interrompido` DEPOIS que tudo já está de pé. Sem esta lista, o piloto
   * leria o próprio job da rodada anterior como "falha de infraestrutura" e se desligaria
   * exatamente no reinício que ele deveria atravessar.
   */
  private readonly ignorados = new Set<string>();

  constructor(
    private readonly gerenciador: GerenciadorJobs,
    private readonly opcoes: OpcoesPiloto,
  ) {
    this.agora = opcoes.agora ?? (() => new Date());
    this.agendar =
      opcoes.agendar ??
      ((ms, acao) => {
        const t = setTimeout(acao, ms);
        t.unref?.();
        return () => clearTimeout(t);
      });
  }

  /**
   * Passa a escutar a fila e retoma o que o processo anterior deixou ligado. Idempotente.
   *
   * A retomada CONTA como rodada (`criarRodada` incrementa), e é isso que impede um painel
   * que morre no boot de virar laço infinito: `maxRodadas` é o freio, e ele vale para todo
   * caminho que inicia rodada.
   */
  iniciar(): void {
    if (this.escutando) return;
    this.estadoAtual = ler(this.opcoes.arquivo);
    this.gerenciador.emissor.on("evento", this.aoEvento);
    this.escutando = true;

    const e = this.estadoAtual;
    if (e === null || !e.ligado) return;

    // O job da rodada anterior morreu com o processo: seu desfecho não é sinal de nada.
    if (e.ultimoJobId !== null) this.ignorados.add(e.ultimoJobId);

    if (e.rearmaEm !== null) {
      const faltam = new Date(e.rearmaEm).getTime() - this.agora().getTime();
      this.dormir(Number.isFinite(faltam) ? Math.max(0, faltam) : 0);
      return;
    }
    this.criarRodada();
  }

  parar(): void {
    this.gerenciador.emissor.off("evento", this.aoEvento);
    this.escutando = false;
    this.cancelarSoneca?.();
    this.cancelarSoneca = null;
  }

  /** Estado atual (ou `null` se o piloto nunca foi ligado nesta instalação). */
  estado(): EstadoPiloto | null {
    return this.estadoAtual === null ? null : { ...this.estadoAtual };
  }

  /** Liga o piloto e dispara a primeira rodada. Zera os acumulados — é uma sessão nova. */
  ligar(cfg: ConfigPiloto): EstadoPiloto {
    this.cancelarSoneca?.();
    this.cancelarSoneca = null;
    const agora = this.agora().toISOString();
    this.gravar({
      ligado: true,
      projeto: cfg.projeto,
      estrategia: cfg.estrategia,
      tetoUsdPorRodada: cfg.tetoUsdPorRodada ?? null,
      limites: cfg.limites,
      rodadas: 0,
      gastoUsd: 0,
      tarefasConcluidas: 0,
      rodadasSemProgresso: 0,
      sonecas: 0,
      ligadoEm: agora,
      ultimoJobId: null,
      rearmaEm: null,
      parouPor: null,
      parouEm: null,
      detalheParada: null,
    });
    this.criarRodada();
    return this.estado()!;
  }

  /**
   * Desliga. NÃO cancela o job em voo (ver o cabeçalho): o que ele já pagou continua
   * valendo, e a rodada termina normalmente — só não nasce outra.
   */
  desligar(): EstadoPiloto {
    if (this.estadoAtual === null) throw new ErroPilotoDesligado();
    this.cancelarSoneca?.();
    this.cancelarSoneca = null;
    this.gravar({
      ...this.estadoAtual,
      ligado: false,
      rearmaEm: null,
      parouPor: "desligado",
      parouEm: this.agora().toISOString(),
      detalheParada:
        "Desligado por você. A rodada em andamento, se houver, termina normalmente" +
        " — cortar no meio custaria igual sem entregar nada.",
    });
    return this.estado()!;
  }

  // ------------------------------------------------------------------ internos

  private readonly aoEvento = (evento: EventoJob): void => {
    if (evento.tipo !== "estado") return;
    const e = this.estadoAtual;
    if (e === null || !e.ligado) return;
    if (evento.jobId !== e.ultimoJobId) return;
    if (this.ignorados.has(evento.jobId)) return;

    const { para, job } = (evento.dados ?? {}) as Partial<DadosTransicao>;
    if (para === undefined || job === undefined || !ESTADOS_TERMINAIS.has(para)) return;

    const { estado, decisao } = avancar(e, desfechoDoJob(job), this.agora().toISOString());
    this.gravar(estado);

    if (decisao.acao === "parar") {
      console.log(`[piloto] parou (${decisao.motivo}): ${decisao.detalhe}`);
      return;
    }
    if (decisao.acao === "dormir") {
      this.dormir(esperaDeRearme(desfechoDoJob(job).reabreEm, this.agora()));
      return;
    }
    // Fora do assentamento da fila: criar job dentro do próprio evento de transição
    // reentraria no agendador da fila no meio do fecho do job anterior.
    setImmediate(() => this.criarRodada());
  };

  /** Agenda o rearme e registra o instante no estado, para a tela poder mostrá-lo. */
  private dormir(ms: number): void {
    if (this.estadoAtual === null) return;
    this.cancelarSoneca?.();
    const alvo = new Date(this.agora().getTime() + ms).toISOString();
    this.gravar({ ...this.estadoAtual, rearmaEm: alvo });
    this.cancelarSoneca = this.agendar(ms, () => {
      this.cancelarSoneca = null;
      if (this.estadoAtual?.ligado !== true) return;
      this.gravar({ ...this.estadoAtual, rearmaEm: null });
      this.criarRodada();
    });
  }

  /** Cria a rodada seguinte, ou desliga o piloto se algum teto já não a permite. */
  private criarRodada(): void {
    const e = this.estadoAtual;
    if (e === null || !e.ligado) return;

    const permissao = podeIniciarRodada(e);
    if (permissao.acao === "parar") {
      this.gravar({
        ...e,
        ligado: false,
        rearmaEm: null,
        parouPor: permissao.motivo,
        parouEm: this.agora().toISOString(),
        detalheParada: permissao.detalhe,
      });
      console.log(`[piloto] parou (${permissao.motivo}): ${permissao.detalhe}`);
      return;
    }

    const proximo: EstadoPiloto = { ...e, rodadas: e.rodadas + 1, rearmaEm: null };
    try {
      const job = this.gerenciador.criarJob(this.opcoes.montarRodada(proximo));
      proximo.ultimoJobId = job.id;
      this.gravar(proximo);
      console.log(`[piloto] rodada ${proximo.rodadas} de ${e.limites.maxRodadas}: job ${job.id}`);
    } catch (erro) {
      const texto = erro instanceof Error ? erro.message : String(erro);
      this.gravar({
        ...e,
        ligado: false,
        rearmaEm: null,
        parouPor: "falha",
        parouEm: this.agora().toISOString(),
        detalheParada: `Não foi possível criar a rodada: ${texto}`,
      });
      console.error(`[piloto] parou (falha): ${texto}`);
    }
  }

  private gravar(estado: EstadoPiloto): void {
    this.estadoAtual = estado;
    salvar(this.opcoes.arquivo, estado);
  }
}

/**
 * Traduz o job terminal no desfecho que a decisão entende. DEFENSIVO de propósito: o
 * `resultado` é `unknown` no modelo de job, e um job cortado no meio pode não ter nenhum
 * dos campos — nesse caso o desfecho é "não sei", e o `decidir` já trata pelo estado.
 */
export function desfechoDoJob(job: Job): DesfechoRodada {
  const r = (job.resultado !== null && typeof job.resultado === "object"
    ? job.resultado
    : {}) as Record<string, unknown>;
  const numero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const tamanho = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
  const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

  return {
    estado: job.estado,
    encerrouPor: texto(r["encerrouPor"]),
    motivo: r["motivo"] === "limite-uso" || r["motivo"] === "teto-custo" ? r["motivo"] : null,
    // `reabreEm` é o nome no pipeline; `limiteDeUso` é o do relatório do motor.
    reabreEm: texto(r["reabreEm"]) ?? texto(r["limiteDeUso"]),
    custoUsd: numero(r["custoEstimadoUsd"]) || numero(r["custoUsd"]),
    tarefasConcluidas: tamanho(r["tarefasConcluidas"]),
    paraReplanejar: tamanho(r["paraReplanejar"]),
    bloqueadas: tamanho(r["bloqueadas"]),
    erro: texto(job.erro),
  };
}

/** Leitura tolerante: arquivo ausente ou corrompido = piloto nunca ligado. */
export function ler(arquivo: string): EstadoPiloto | null {
  if (!existsSync(arquivo)) return null;
  try {
    const bruto: unknown = JSON.parse(readFileSync(arquivo, "utf8"));
    return pareceEstado(bruto) ? bruto : null;
  } catch (erro) {
    console.warn(`[piloto] ${arquivo} ignorado: ${erro instanceof Error ? erro.message : erro}`);
    return null;
  }
}

/** Escrita atômica e síncrona, pelo mesmo motivo de `jobs/persistencia.ts`. */
export function salvar(arquivo: string, estado: EstadoPiloto): void {
  try {
    mkdirSync(dirname(arquivo), { recursive: true });
    const temporario = `${arquivo}.tmp`;
    writeFileSync(temporario, JSON.stringify(estado, null, 2), "utf8");
    renameSync(temporario, arquivo);
  } catch (erro) {
    // Disco cheio não pode derrubar o laço: o estado em memória segue sendo a fonte
    // imediata, como na fila de jobs.
    console.warn(`[piloto] falha ao gravar ${arquivo}: ${erro instanceof Error ? erro.message : erro}`);
  }
}

function pareceEstado(v: unknown): v is EstadoPiloto {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const limites = o["limites"];
  return (
    typeof o["ligado"] === "boolean" &&
    typeof o["projeto"] === "string" &&
    typeof o["rodadas"] === "number" &&
    typeof o["gastoUsd"] === "number" &&
    limites !== null &&
    typeof limites === "object" &&
    typeof (limites as Record<string, unknown>)["maxRodadas"] === "number" &&
    typeof (limites as Record<string, unknown>)["tetoTotalUsd"] === "number"
  );
}
