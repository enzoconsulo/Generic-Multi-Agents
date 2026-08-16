import type { Job } from "./tipos";

/**
 * PAREDE DE COTA — a assinatura está batida AGORA? (16/08)
 *
 * Nasce de evidência em disco, sem gastar um centavo de modelo. Sequência real do
 * banco-imobiliario, lida em `dados/jobs/`:
 *
 * | hora | job | desfecho | gasto |
 * |---|---|---|---|
 * | 21:09 | `af43d53c` | **cota** batida com o executor na T-046; T-038 fechou e ficou | US$ 2,58 |
 * | 23:47 | `2ce58842` | cota de novo — 16s, 1 despacho, ZERO progresso | US$ 0,00 |
 * | 23:56 | `ef2d176c` | cota de novo — 16s, 1 despacho, ZERO progresso | US$ 0,00 |
 * | 00:24 | `a0c785f8` | T-046 **concluída** | US$ 1,92 |
 *
 * Duas leituras saem daí, e as duas viraram tela:
 *
 * 1. **A retomada funciona.** A T-046 foi cortada no meio às 21:09 e fechou às 00:24, sem
 *    ninguém mexer em nada — o estado vive nos arquivos das tarefas, não no job.
 * 2. **Redisparar contra a parede é desperdício puro.** Duas rodadas gastaram 32 segundos e
 *    duas linhas do histórico para descobrir o que a primeira já sabia. O dado existia
 *    (`reabreEm`, que o despachante extrai desde a T-064) e não alimentava decisão nenhuma —
 *    o defeito recorrente desta fábrica: sensor sem atuador.
 *
 * **Este módulo não bloqueia nada, e é deliberado.** A hora anunciada pelo provedor é texto
 * livre, e cota reabre sozinha; barrar o botão por um palpite seria pior que o desperdício
 * de 16 segundos que ele evita. Ele AVISA, com a hora quando ela existe.
 *
 * Sem estado novo no servidor: a lista de jobs que a tela já recebe contém tudo.
 */

/** Janela em que uma cota batida ainda é considerada vigente sem prova em contrário. */
const HORAS_DE_VALIDADE = 6;

export interface ParedeDeCota {
  /** Job em que a cota foi batida. */
  jobId: string;
  /** Quando bateu (ISO). */
  em: string;
  /** Hora de reabertura anunciada pelo provedor, como veio; `null` se não anunciou. */
  reabreEm: string | null;
}

interface ResultadoDeCota {
  motivo?: unknown;
  encerrouPor?: unknown;
  reabreEm?: unknown;
  limiteDeUso?: unknown;
  custoUsd?: unknown;
  custoEstimadoUsd?: unknown;
  tarefasConcluidas?: unknown;
}

function ler(job: Job): ResultadoDeCota {
  const r = job.resultado;
  return r !== null && typeof r === "object" ? (r as ResultadoDeCota) : {};
}

/**
 * Este job parou por cota? Aceita os dois vocabulários de propósito: `motivo` é o do runner
 * Claude (e o que o pipeline passou a traduzir), `encerrouPor` é o do pipeline — e os jobs
 * já gravados em `dados/` só têm o segundo.
 */
function parouPorCota(job: Job): boolean {
  const r = ler(job);
  return r.motivo === "limite-uso" || r.encerrouPor === "cota";
}

/**
 * Este job PRODUZIU alguma coisa? É a prova de que a parede caiu — melhor que qualquer
 * relógio, porque não depende de interpretar a hora que o provedor escreveu em texto livre.
 */
function houveProgresso(job: Job): boolean {
  const r = ler(job);
  if (Array.isArray(r.tarefasConcluidas) && r.tarefasConcluidas.length > 0) return true;
  for (const v of [r.custoUsd, r.custoEstimadoUsd]) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return true;
  }
  return false;
}

function quando(job: Job): number {
  return Date.parse(job.terminadoEm ?? job.criadoEm);
}

/**
 * A cota está batida agora? `null` = pode disparar à vontade.
 *
 * Regra, em ordem: acha a batida mais recente; se QUALQUER job posterior produziu algo, a
 * parede caiu (prova observada vence relógio); senão, ela vale por `HORAS_DE_VALIDADE`.
 */
export function paredeDeCota(jobs: readonly Job[], agora: number = Date.now()): ParedeDeCota | null {
  let ultima: Job | null = null;
  for (const job of jobs) {
    if (!parouPorCota(job)) continue;
    if (ultima === null || quando(job) > quando(ultima)) ultima = job;
  }
  if (ultima === null) return null;

  const bateuEm = quando(ultima);
  if (!Number.isFinite(bateuEm)) return null;
  if (agora - bateuEm > HORAS_DE_VALIDADE * 3_600_000) return null;

  // Prova de que a cota voltou: alguém rodou depois e entregou.
  for (const job of jobs) {
    if (quando(job) > bateuEm && houveProgresso(job)) return null;
  }

  const r = ler(ultima);
  const hora = [r.reabreEm, r.limiteDeUso].find(
    (v): v is string => typeof v === "string" && v.trim() !== "" && v.trim() !== "sem hora anunciada",
  );
  return {
    jobId: ultima.id,
    em: ultima.terminadoEm ?? ultima.criadoEm,
    reabreEm: hora?.trim() ?? null,
  };
}

/** Texto do aviso. Diz o que fazer, não só o que aconteceu. */
export function avisoParede(parede: ParedeDeCota): string {
  return (
    "A assinatura bateu no limite de uso na última execução." +
    (parede.reabreEm !== null
      ? ` A cota reabre: ${parede.reabreEm}.`
      : " O provedor não anunciou a hora.") +
    " Disparar agora para no mesmo ponto, em segundos, sem entregar nada — medido: duas" +
    " tentativas contra a parede custaram 32 segundos e zero tarefa. O trabalho já feito está" +
    " commitado e a próxima rodada retoma de onde parou."
  );
}
