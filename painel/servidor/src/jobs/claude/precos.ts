/**
 * Tabela de preços por modelo, para ESTIMAR o custo de um job quando o SDK não reportou
 * o valor real (T-049).
 *
 * Por que isto existe: `total_cost_usd` só chega na mensagem `result`. Um job cortado no
 * meio — cota batida, cancelamento, watchdog — nunca recebe `result` e gravava
 * `custoUsd: null`. Como jobs que estouram a cota são justamente os MAIS caros, o painel
 * subcontava exatamente o que mais importa: numa rodada real de 40 min com 21 despachos de
 * agente e 472 chamadas de ferramenta, o histórico marcou US$ 0,00.
 *
 * O número daqui é **estimativa** e é rotulado como tal em toda a UI. Ele nunca sobrescreve
 * o custo real: quando o `result` chega, o valor do SDK vence.
 *
 * ## Preços (USD por 1M tokens, tabela padrão da API)
 *
 * Leitura de cache = 0,1× entrada. É por isso que num fluxo agêntico a LEITURA DE CACHE
 * domina o VOLUME de tokens (cada turno reenvia o contexto) enquanto a ESCRITA domina o
 * PREÇO por token — cada sessão nova reescreve o prefixo.
 *
 * ## Como estes valores foram conferidos
 *
 * Não foram copiados de memória: foram resolvidos contra os 6 jobs de `dados/jobs/` que têm
 * `modelUsage` E `total_cost_usd` reais.
 *
 * **1. A tabela é a PADRÃO, não a promocional.** Caso decisivo, `358c14f1` (Sonnet 5,
 * US$ 6,850 de `costUSD`, 11.235.358 de leitura de cache, 95.592 de saída):
 *
 *   - com 3 / 15, sobra US$ 2,04 para escrita de cache → ~545k tokens, compatível com os
 *     602k de escrita medidos no job (o resto é do Haiku);
 *   - com 2 / 10 (promocional), sobrariam US$ 3,65 → ~1,46M tokens de escrita, mais que o
 *     DOBRO do que o job inteiro escreveu. Impossível.
 *
 * Sem essa conferência a estimativa sairia ~35% baixa e ninguém notaria.
 *
 * **2. A escrita de cache NÃO é 1,25×** — é ~1,75× na prática. Este número foi MEDIDO, não
 * escolhido. Com o 1,25× do TTL de 5 minutos a estimativa ficava sistematicamente baixa, e
 * o erro era pior justamente nos jobs pequenos (29% em `5dfb1fe3` e `3d2f928c`, contra 2,8%
 * no maior). Varrendo o multiplicador contra os 6 jobs:
 *
 * ```
 *   x1,25 → erro médio 18,5%  pior 29,3%      x1,60 → erro médio  8,0%  pior 15,6%
 *   x1,50 → erro médio 10,7%  pior 19,5%      x1,75 → erro médio  5,8%  pior  9,8%
 *                                             x2,00 → erro médio  7,4%  pior 16,1%
 * ```
 *
 * A curva tem mínimo interno em ~1,75, e isso tem explicação física: a API cobra 1,25× no
 * TTL de 5 min e **2× no TTL de 1 hora**, e o SDK usa os DOIS. Resolvendo a mistura no
 * `5dfb1fe3` dá ~100% em 1 h (bate na 4ª casa decimal); no `358c14f1`, ~22%. Ou seja, a
 * proporção varia por job e **nenhum multiplicador fixo pode ser exato** — 1,75 é o ponto
 * que minimiza o erro na amostra real, não uma constante da API.
 *
 * Consequência prática, e o motivo de tudo isto estar escrito aqui: a estimativa vale para
 * ordem de grandeza e comparação entre jobs, **não** para fechar conta. É por isso que a UI
 * a rotula como "~estimado" e nunca a soma com custo real sem dizer.
 */

/**
 * Multiplicador da escrita de cache sobre o preço de entrada. Ver a seção 2 do cabeçalho:
 * é uma CALIBRAGEM contra dados reais (erro médio 5,8%), não o valor de tabela de nenhum
 * dos dois TTLs. Mexer aqui sem refazer a varredura desfaz a medição.
 */
const MULT_ESCRITA_CACHE = 1.75;

/** Erro médio observado da estimativa contra o custo real, na amostra de calibragem. */
export const ERRO_MEDIO_ESTIMATIVA = 0.06;

/** Preço em USD por 1M tokens, por natureza de token. */
export interface PrecoModelo {
  entrada: number;
  saida: number;
  cacheLeitura: number;
  cacheEscrita: number;
}

/**
 * Deriva o preço completo a partir do par (entrada, saída), que é como a documentação
 * publica. Escrever as quatro linhas à mão convidaria a erro de digitação justamente nos
 * dois multiplicadores que mais pesam.
 */
function precos(entrada: number, saida: number): PrecoModelo {
  return {
    entrada,
    saida,
    cacheLeitura: entrada * 0.1,
    cacheEscrita: entrada * MULT_ESCRITA_CACHE,
  };
}

/**
 * Casamento por PREFIXO do id do modelo, porque o SDK reporta tanto o alias
 * (`claude-sonnet-5`) quanto a forma datada (`claude-haiku-4-5-20251001`), e a datada
 * chega dos subagentes. A ordem importa: a lista é varrida de cima para baixo e o primeiro
 * prefixo que casa vence, então variantes mais específicas vêm antes.
 */
const TABELA: ReadonlyArray<readonly [prefixo: string, preco: PrecoModelo]> = [
  ["claude-fable-5", precos(10, 50)],
  ["claude-mythos-5", precos(10, 50)],
  ["claude-opus-5", precos(5, 25)],
  ["claude-opus-4", precos(5, 25)],
  ["claude-sonnet-5", precos(3, 15)],
  ["claude-sonnet-4", precos(3, 15)],
  ["claude-haiku-4", precos(1, 5)],
];

/** Preço de um modelo, ou `null` quando ele não está na tabela (modelo novo). */
export function precoDe(modelo: string): PrecoModelo | null {
  for (const [prefixo, preco] of TABELA) {
    if (modelo.startsWith(prefixo)) return preco;
  }
  return null;
}

/** Uso de um modelo, na forma que o acumulador do runner produz. */
export interface UsoModelo {
  entrada: number;
  saida: number;
  cacheLeitura: number;
  cacheEscrita: number;
}

export interface EstimativaCusto {
  /** Custo estimado em USD somando só os modelos conhecidos. */
  usd: number;
  /**
   * Modelos que apareceram no uso e NÃO estão na tabela. Não-vazio significa que `usd`
   * está SUBESTIMADO — a UI precisa dizer isso em vez de mostrar um número redondo e
   * errado. É o modo de falha silenciosa que este campo existe para impedir: modelo novo
   * entra na fábrica, a estimativa despenca, e parece economia.
   */
  modelosDesconhecidos: string[];
}

/**
 * Estima o custo de um job a partir do uso por modelo.
 *
 * Devolve `null` quando não há uso nenhum — "sem dado" e "custou zero" são coisas
 * diferentes, e colapsar as duas em `0` foi metade do problema original.
 */
export function estimarCusto(porModelo: Record<string, UsoModelo>): EstimativaCusto | null {
  const nomes = Object.keys(porModelo);
  if (nomes.length === 0) return null;

  let usd = 0;
  const modelosDesconhecidos: string[] = [];

  for (const nome of nomes) {
    const uso = porModelo[nome];
    if (uso === undefined) continue;
    const preco = precoDe(nome);
    if (preco === null) {
      // Modelo sem preço e SEM CONSUMO não subestima nada — e o aviso existe para dizer
      // exatamente isso ("`usd` está subestimado"). O caso real é o `<synthetic>`, o
      // pseudo-modelo que o SDK carimba em mensagem que ele mesmo fabricou (erro, aviso,
      // interrupção): ele aparece com os quatro campos zerados em 6 jobs de `dados/jobs/`, e
      // fazia TODA estimativa de job cortado sair com "modelo sem preço / estimativa
      // SUBESTIMADA" — alarme falso justamente no desfecho em que a estimativa é a única
      // contabilidade que existe.
      //
      // A regra é aritmética de propósito, e não uma lista de nomes: qualquer pseudo-modelo
      // futuro entra por ela, enquanto um modelo NOVO de verdade — que chega com consumo —
      // continua sendo denunciado, que é o modo de falha que este campo protege.
      if (uso.entrada + uso.saida + uso.cacheLeitura + uso.cacheEscrita > 0) {
        modelosDesconhecidos.push(nome);
      }
      continue;
    }
    usd +=
      (uso.entrada * preco.entrada +
        uso.saida * preco.saida +
        uso.cacheLeitura * preco.cacheLeitura +
        uso.cacheEscrita * preco.cacheEscrita) /
      1_000_000;
  }

  return { usd, modelosDesconhecidos };
}
