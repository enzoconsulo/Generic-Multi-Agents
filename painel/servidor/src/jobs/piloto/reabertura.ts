/**
 * QUANDO o piloto rearma depois de bater na cota da assinatura.
 *
 * O provedor anuncia a reabertura em TEXTO LIVRE — `horaDeReabertura` (em
 * `jobs/claude/runner-claude.ts`) só recorta o que vem depois de "resets", e o resultado é
 * coisa como `5am`, `10:30pm` ou `5am (America/Sao_Paulo)`. `web/lib/cota.ts` decidiu, de
 * propósito, NÃO bloquear nada com base nisso: barrar um botão por palpite é pior que o
 * desperdício de 16 segundos que evitaria.
 *
 * Aqui a aposta é diferente e por isso vale a pena: errar para MENOS custa uma rodada de
 * ~US$ 0,00 e 16 segundos (medido em `dados/jobs/`, três rodadas seguidas contra a parede);
 * errar para MAIS custa espera. Então o parser é otimista, o resultado é sempre limitado
 * por uma janela sã, e o número de tentativas tem teto (`MAX_SONECAS`, em `decisao.ts`).
 *
 * O fuso entre parênteses é IGNORADO de propósito: o painel roda na máquina do usuário, o
 * anúncio é feito para ele, e converter fuso a partir de texto livre acrescentaria uma
 * classe de erro silencioso para ganhar pouco. A margem de segurança cobre a diferença.
 */

/** Espera mínima. Rearmar em seguida é a mesma parede, com outro nome. */
export const ESPERA_MINIMA_MS = 60_000;

/** Espera máxima. Cota nenhuma leva mais que isso; acima disso o parser errou. */
export const ESPERA_MAXIMA_MS = 6 * 60 * 60 * 1000;

/** Espera quando o anúncio não veio ou não foi interpretável. */
export const ESPERA_CEGA_MS = 30 * 60 * 1000;

/** Folga somada à hora anunciada — chegar em cima do horário é chegar cedo. */
const MARGEM_MS = 2 * 60 * 1000;

/**
 * Interpreta a hora anunciada como o PRÓXIMO instante local em que ela ocorre.
 * `null` quando não há nada reconhecível no texto.
 */
export function interpretarReabertura(texto: string | null, agora: Date): Date | null {
  if (texto === null) return null;
  const achado = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(texto.trim());
  if (achado === null) return null;

  const hora = Number(achado[1]);
  const minuto = achado[2] !== undefined ? Number(achado[2]) : 0;
  const sufixo = achado[3]?.toLowerCase();
  if (!Number.isInteger(hora) || !Number.isInteger(minuto) || minuto > 59) return null;

  let h = hora;
  if (sufixo === "am") {
    if (hora < 1 || hora > 12) return null;
    h = hora === 12 ? 0 : hora;
  } else if (sufixo === "pm") {
    if (hora < 1 || hora > 12) return null;
    h = hora === 12 ? 12 : hora + 12;
  } else if (hora > 23) {
    return null;
  }

  const alvo = new Date(agora);
  alvo.setHours(h, minuto, 0, 0);
  // Hora que já passou hoje é a de amanhã — cota que reabre "às 5am" às 23h é a de amanhã.
  if (alvo.getTime() <= agora.getTime()) alvo.setDate(alvo.getDate() + 1);
  return alvo;
}

/**
 * Quanto esperar, em ms, antes da próxima tentativa. Sempre dentro da janela sã: um
 * anúncio mal interpretado nunca vira nem rajada nem sono de um dia inteiro.
 */
export function esperaDeRearme(texto: string | null, agora: Date): number {
  const alvo = interpretarReabertura(texto, agora);
  const bruto = alvo === null ? ESPERA_CEGA_MS : alvo.getTime() + MARGEM_MS - agora.getTime();
  return Math.min(ESPERA_MAXIMA_MS, Math.max(ESPERA_MINIMA_MS, bruto));
}
