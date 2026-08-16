/**
 * TETO DE CUSTO DE UM FLUXO DE AGENTE ÚNICO (`/ideia`, `/status`, ações por projeto…).
 *
 * Existe porque o runner Claude estava consultando `pipeline/orcamento.ts`, que responde a
 * uma pergunta que aqui não faz sentido: *"ainda cabe COMEÇAR outra tarefa?"*. Um `/ideia`
 * não tem "próxima tarefa" — é um fluxo só, do começo ao fim.
 *
 * O estrago era um alarme falso, e ele tocava em 100% das execuções. Medido nos 5 jobs de
 * `/ideia` com log em disco (16/08):
 *
 * | job | gasto quando o alarme tocou | teto | custo final |
 * |---|---|---|---|
 * | `80d4fa46` | US$ 0,50 | 3 | US$ 2,99 |
 * | `d21c6a24` | US$ 0,55 | 3 | US$ 1,87 |
 * | `6ef752b7` | US$ 0,39 | 3 | US$ 4,61 |
 * | `9ba81214` | US$ 0,53 | 3 | US$ 3,29 |
 * | `2f388226` | US$ 0,39 | 3 | (cortado pela cota) |
 *
 * A conta que produzia isso: o teto do pipeline compara o restante com
 * `CUSTO_TAREFA_PADRAO × FATOR_SEGURANCA` = 2,10 × 1,25 = US$ 2,63. Com teto de US$ 3, o
 * alarme dispara assim que o gasto passa de **US$ 0,37** — os primeiros 12% do fluxo — e
 * anuncia "Não começo outra: termino o que está em andamento e encerro", falando de tarefas
 * que este job nunca teve.
 *
 * O usuário leu isso como a fábrica se limitando, e a leitura era razoável: *"eu pedi algo
 * simples e ele já disse que ficou perto do teto e que precisava apenas terminar a tarefa em
 * vez de fazer mais"*. Alarme que toca em toda execução não carrega informação — é o mesmo
 * diagnóstico que recalibrou o orçamento de ferramentas em 16/08, agora do outro lado do
 * sistema.
 *
 * O que fica: **um aviso só, tarde, e que diz o que vai acontecer.** Nada aqui muda o
 * comportamento do modelo (ele nunca viu esse texto — é log de tela); muda o que o log
 * afirma, que é o que o usuário usa para decidir.
 */

/** Fração do teto a partir da qual vale avisar. Ver `avisar`. */
export const FRACAO_DE_AVISO = 0.8;

export type AcaoFluxo = "seguir" | "avisar" | "esperar" | "encerrar";

export interface DecisaoFluxo {
  acao: AcaoFluxo;
  /** Frase pronta para o log; vazia quando `seguir`. */
  motivo: string;
}

/**
 * O que fazer com o gasto atual.
 *
 * - `seguir` — abaixo de 80% do teto. Silêncio: é o estado normal e não há decisão a tomar.
 * - `avisar` — passou de 80%. Uma linha, UMA vez, dizendo o que acontece ao bater o teto.
 *   80% e não 50% porque o aviso precisa ser raro para ser lido; nos jobs medidos acima ele
 *   teria tocado em 2 de 4, contra 4 de 4 do alarme antigo.
 * - `esperar` — estourou, mas há subagente em voo. **Nunca cortar agente no meio**: o que
 *   ele não gravou se perde e o job ainda aparece como sucesso (30/07 e 01/08).
 * - `encerrar` — estourou e nada em voo. Para agora, enquanto é barato.
 */
export function decidirFluxo(
  tetoUsd: number | null,
  gastoUsd: number,
  agentesEmVoo: number,
): DecisaoFluxo {
  if (tetoUsd === null || !Number.isFinite(tetoUsd) || tetoUsd <= 0) {
    return { acao: "seguir", motivo: "" };
  }
  const gasto = Number.isFinite(gastoUsd) && gastoUsd > 0 ? gastoUsd : 0;
  const emVoo = Math.max(0, Math.trunc(agentesEmVoo));

  if (gasto >= tetoUsd) {
    if (emVoo > 0) {
      return {
        acao: "esperar",
        motivo:
          `Teto de US$ ${tetoUsd.toFixed(2)} estourado (US$ ${gasto.toFixed(2)}), mas ${emVoo}` +
          " agente(s) ainda trabalhando: espero terminarem para encerrar sem destruir o que" +
          " estão fazendo.",
      };
    }
    return {
      acao: "encerrar",
      motivo:
        `Teto de US$ ${tetoUsd.toFixed(2)} atingido (US$ ${gasto.toFixed(2)}). Encerrando aqui —` +
        " o que já foi gravado em disco continua valendo, e o botão Retomar continua deste" +
        " ponto sem refazer o que já foi feito.",
    };
  }

  if (gasto >= tetoUsd * FRACAO_DE_AVISO) {
    return {
      acao: "avisar",
      motivo:
        `US$ ${gasto.toFixed(2)} de US$ ${tetoUsd.toFixed(2)} do teto deste fluxo. Se bater o` +
        " teto, o fluxo é interrompido sem cortar agente no meio; o que estiver em disco fica" +
        " valendo e o botão Retomar continua daqui.",
    };
  }

  return { acao: "seguir", motivo: "" };
}
