import { projetoDoEscopo } from "./formato";
import type { EstadoPiloto, Job, MotivoParadaPiloto } from "./tipos";

/**
 * O que a tela do piloto automático DECIDE — separado do componente porque os testes da
 * web são de lógica pura (sem DOM): lógica dentro de JSX é lógica não verificada.
 *
 * O piloto é o único mecanismo do painel que gasta a assinatura sem ninguém clicando em
 * nada. Por isso as duas coisas que ele mostra na tela são, nesta ordem: **quanto já
 * gastou** e **por que parou**. "Ligado/desligado" sozinho não responde nenhuma pergunta
 * que o usuário faça de manhã olhando a tela.
 */

/** Rótulo curto do motivo — é o selo. */
export const ROTULO_MOTIVO: Record<MotivoParadaPiloto, string> = {
  desligado: "Desligado",
  "sem-tarefa": "Trabalho concluído",
  "sem-credito": "Cota da assinatura",
  "sem-progresso": "Sem progresso",
  "precisa-replanejar": "Precisa de replanejamento",
  falha: "Falha",
  "teto-gasto": "Teto de gasto",
  "teto-rodadas": "Teto de rodadas",
};

/**
 * Tom do selo. `sem-tarefa` é VERDE: acabou o trabalho é o desfecho feliz, e pintá-lo de
 * vermelho ensinaria o usuário a ignorar o vermelho — que é onde moram cota e falha.
 */
export function tomDoMotivo(motivo: MotivoParadaPiloto): "ok" | "info" | "atencao" | "erro" {
  if (motivo === "sem-tarefa") return "ok";
  if (motivo === "desligado") return "info";
  if (motivo === "falha") return "erro";
  return "atencao";
}

export interface SituacaoPiloto {
  tom: "ok" | "info" | "atencao" | "erro";
  titulo: string;
  detalhe: string;
  /** O formulário de ligar deve aparecer? */
  podeLigar: boolean;
}

/** O que o cartão diz, em uma linha de título e uma de detalhe. */
export function situacaoDoPiloto(
  piloto: EstadoPiloto | null,
  agora: Date = new Date(),
): SituacaoPiloto {
  if (piloto === null) {
    return {
      tom: "info",
      titulo: "Piloto desligado",
      detalhe:
        "Ligado, ele encadeia rodadas de Trabalhar sozinho até acabar a tarefa, a cota ou o teto.",
      podeLigar: true,
    };
  }

  if (piloto.ligado && piloto.rearmaEm !== null) {
    return {
      tom: "atencao",
      titulo: `Dormindo até a cota reabrir · ${horaCurta(piloto.rearmaEm, agora)}`,
      detalhe: piloto.detalheParada ?? "A rodada bateu na cota da assinatura.",
      podeLigar: false,
    };
  }

  if (piloto.ligado) {
    return {
      tom: "ok",
      titulo: `Piloto ligado em ${piloto.projeto} · rodada ${piloto.rodadas} de ${piloto.limites.maxRodadas}`,
      detalhe: resumoDaSessao(piloto),
      podeLigar: false,
    };
  }

  const motivo = piloto.parouPor ?? "desligado";
  return {
    tom: tomDoMotivo(motivo),
    titulo: `Parou: ${ROTULO_MOTIVO[motivo]}`,
    detalhe: `${piloto.detalheParada ?? ""} ${resumoDaSessao(piloto)}`.trim(),
    podeLigar: true,
  };
}

/** A linha de contabilidade da sessão do piloto — o que ele fez e o que custou. */
export function resumoDaSessao(piloto: EstadoPiloto): string {
  const tarefas =
    piloto.tarefasConcluidas === 1 ? "1 tarefa concluída" : `${piloto.tarefasConcluidas} tarefas concluídas`;
  const rodadas = piloto.rodadas === 1 ? "1 rodada" : `${piloto.rodadas} rodadas`;
  return `${rodadas} · ${tarefas} · ~US$ ${piloto.gastoUsd.toFixed(2)} de US$ ${piloto.limites.tetoTotalUsd.toFixed(2)}`;
}

/** Quanto do teto acumulado já foi gasto (0–1), para a barra. */
export function fracaoDoTeto(piloto: EstadoPiloto): number {
  if (piloto.limites.tetoTotalUsd <= 0) return 0;
  return Math.min(1, Math.max(0, piloto.gastoUsd / piloto.limites.tetoTotalUsd));
}

export interface ConfigPilotoForm {
  tetoTotalUsd: number;
  maxRodadas: number;
  tetoUsdPorRodada: number | null;
}

/**
 * Recusa a configuração ANTES do POST — que já executa. Os limites são os mesmos da rota
 * (o servidor continua sendo a autoridade); aqui eles existem para o erro chegar como
 * texto no formulário e não como uma rodada disparada por engano.
 */
export function validarConfig(cfg: ConfigPilotoForm): string | null {
  if (!Number.isFinite(cfg.tetoTotalUsd) || cfg.tetoTotalUsd <= 0) {
    return "Informe um teto de gasto acumulado maior que zero.";
  }
  if (cfg.tetoTotalUsd > 200) return "O teto acumulado máximo é US$ 200.";
  if (!Number.isInteger(cfg.maxRodadas) || cfg.maxRodadas < 1) {
    return "Informe pelo menos 1 rodada.";
  }
  if (cfg.maxRodadas > 50) return "O máximo é 50 rodadas.";
  if (cfg.tetoUsdPorRodada !== null) {
    if (!Number.isFinite(cfg.tetoUsdPorRodada) || cfg.tetoUsdPorRodada <= 0) {
      return "O teto por rodada deve ser maior que zero.";
    }
    if (cfg.tetoUsdPorRodada > cfg.tetoTotalUsd) {
      return "O teto por rodada não pode ser maior que o teto acumulado.";
    }
  }
  return null;
}

/**
 * O aviso de custo que aparece ANTES de ligar. Sempre em termos do PIOR caso: o piloto é
 * a única coisa aqui que dispara sozinha, e a régua honesta para ela é o máximo que pode
 * gastar antes de parar, não a média de uma rodada.
 */
export function avisoDeCusto(cfg: ConfigPilotoForm, estimativaPorRodadaUsd: number | null): string {
  const teto = `Ele para sozinho em US$ ${cfg.tetoTotalUsd.toFixed(2)} ou ${cfg.maxRodadas} rodada(s), o que vier primeiro.`;
  if (estimativaPorRodadaUsd === null || estimativaPorRodadaUsd <= 0) return teto;
  const previsto = Math.min(cfg.tetoTotalUsd, estimativaPorRodadaUsd * cfg.maxRodadas);
  return `Pela medição deste projeto, ~US$ ${previsto.toFixed(2)} no total. ${teto}`;
}

/** Hora do rearme, curta ("hoje às 05:02" / "amanhã às 05:02"). */
export function horaCurta(iso: string, agora: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "em breve";
  const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const mesmoDia = d.toDateString() === agora.toDateString();
  return mesmoDia ? `hoje às ${hora}` : `amanhã às ${hora}`;
}

/**
 * Qual projeto o seletor propõe quando o piloto é ligado de uma tela sem projeto (Jobs).
 *
 * O do job mais RECENTE que ainda existe na lista de projetos — quem abre Jobs quase sempre
 * quer continuar o que acabou de rodar. Sem isso o seletor nasce vazio e obriga a escolher
 * de novo algo que a tela inteira já está mostrando. `jobs` vem ordenado do mais novo para
 * o mais velho (`useJobsAoVivo`); vazio devolve o primeiro projeto, ou `""` se não há nenhum.
 */
export function projetoSugerido(jobs: Job[], projetos: string[]): string {
  for (const job of jobs) {
    const nome = projetoDoEscopo(job.escopo);
    if (nome !== null && projetos.includes(nome)) return nome;
  }
  return projetos[0] ?? "";
}
