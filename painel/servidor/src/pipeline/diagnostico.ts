/**
 * DIAGNÓSTICO DE REPROVAÇÃO — decide COMO refazer, e não só que é preciso refazer.
 *
 * O PROBLEMA. Até aqui o retrabalho tinha um calibre só: qualquer reprovação subia o modelo
 * para `opus` (`tentativas >= 1`) e despachava um construtor inteiro, com 60 voltas e o
 * contexto completo. Isso trata "um teste falhou por um typo" e "o agente entregou outra
 * coisa" exatamente igual — e o segundo é raro, enquanto o primeiro é o caso comum. Medido
 * na T-025: dois ciclos de `opus` para duas correções de poucas linhas.
 *
 * A IDEIA. A fábrica já produz, de graça, DOIS sinais de natureza muito diferente, e o
 * escalonamento ignorava os dois:
 *
 * - **passada mecânica** reprovou → falha OBJETIVA e localizada (o comando disse o que
 *   quebrou). Modelo mais forte não faz um teste passar melhor; o que resolve é o construtor
 *   ler a saída do comando. Barato, escopo estreito.
 * - **conformidade** reprovada → o agente entregou OUTRA COISA. É erro de entendimento, e
 *   aqui economizar é exatamente o erro: o modelo barato já provou que não entendeu o
 *   pedido. Caro, escopo completo, sempre.
 *
 * DE ONDE VEM O SINAL — e este é o ponto de arquitetura. **Observação ao vivo, não leitura
 * de prosa.** O motor sabe qual portão devolveu a tarefa porque foi ELE que despachou o
 * portão e viu o status mudar. Interpretar as seções para descobrir "quem reprovou por
 * último" seria frágil: elas ACUMULAM ciclos, e um veredito velho de conformidade
 * envenenaria a decisão do ciclo seguinte. O texto só é lido para medir GRAVIDADE, e só
 * quando quem reprovou foi o revisor.
 *
 * A REGRA DE OURO DESTE MÓDULO: **na dúvida, o caminho caro.** Toda incerteza — tarefa
 * herdada de outra rodada, seção ilegível, portão desconhecido — cai no comportamento
 * anterior (reforçar, voltas cheias, escopo completo). Barateamento é opt-in, exige sinal
 * explícito, e nunca acontece na última ficha (ver `politicaDe`).
 */

/** Qual portão devolveu a tarefa ao construtor. Observado pelo motor, nunca inferido. */
export type PortaoQueReprovou =
  /** Passada mecânica: um critério com `verificar:` falhou. Objetivo e localizado. */
  | "mecanica"
  /** `testador`/`conferente`: reprovou executando o software. */
  | "verificador"
  /** `revisor`/`revisor-generico`: conformidade e/ou defeitos no diff. */
  | "revisor";

export type Gravidade = "critica" | "importante" | "menor";

export interface Achado {
  gravidade: Gravidade;
  texto: string;
}

/** Veredito de conformidade do revisor (contrato do `.claude/agents/revisor.md`). */
export type Conformidade = "cumpre" | "cumpre-parcial" | "nao-cumpre";

export type NaturezaFalha =
  /** Primeira execução, ou nada observado nesta rodada. */
  | "nenhuma"
  | "mecanica"
  | "funcional"
  /** Entregou outra coisa. O caso caro — nunca barateado. */
  | "conformidade"
  /** Entregou o que foi pedido, com defeitos pontuais. */
  | "defeito";

export interface Diagnostico {
  natureza: NaturezaFalha;
  achados: Achado[];
  /** Há achado `critica`/`importante`? É o que separa "ajuste" de "conserto de verdade". */
  grave: boolean;
  conformidade: Conformidade | null;
}

export const DIAGNOSTICO_DESCONHECIDO: Diagnostico = {
  natureza: "nenhuma",
  achados: [],
  grave: false,
  conformidade: null,
};

/**
 * Última ocorrência de um padrão — as seções ACUMULAM ciclos, então o que vale é o veredito
 * mais recente. Pegar o primeiro faria o ciclo 3 ser decidido pelo texto do ciclo 1.
 */
function ultimaOcorrencia(texto: string, padrao: RegExp): RegExpMatchArray | null {
  const todas = [...(texto ?? "").matchAll(padrao)];
  return todas.length > 0 ? (todas[todas.length - 1] ?? null) : null;
}

/** Lê o veredito `Conformidade: ...` mais recente da seção Conformidade. */
export function lerConformidade(secao: string): Conformidade | null {
  const m = ultimaOcorrencia(
    secao,
    /^[^\S\n]*Conformidade:[^\S\n]*(cumpre-parcial|n[ãa]o-cumpre|cumpre)\b/gim,
  );
  const bruto = (m?.[1] ?? "").toLowerCase();
  if (bruto === "") return null;
  if (bruto.startsWith("cumpre-parcial")) return "cumpre-parcial";
  if (bruto.startsWith("n")) return "nao-cumpre";
  return "cumpre";
}

/**
 * Achados do revisor, no formato do contrato: `[gravidade] arquivo:linha — problema`.
 *
 * Só do ÚLTIMO ciclo: um achado já corrigido em ciclo anterior continua escrito na seção, e
 * mandá-lo de volta ao construtor faria ele "consertar" o que já está certo. O corte é o
 * último cabeçalho de ciclo (`### Ciclo N`), quando existe.
 */
export function lerAchados(secao: string): Achado[] {
  const texto = secao ?? "";
  const cortes = [...texto.matchAll(/^#{2,4}[^\S\n]*Ciclo\b.*$/gim)];
  const ultimoCorte = cortes[cortes.length - 1];
  const trecho =
    ultimoCorte?.index !== undefined ? texto.slice(ultimoCorte.index) : texto;

  const achados: Achado[] = [];
  for (const m of trecho.matchAll(/^[^\S\n]*\[(cr[íi]tica|importante|menor)\][^\S\n]*(.+)$/gim)) {
    const bruto = (m[1] ?? "").toLowerCase();
    const gravidade: Gravidade = bruto.startsWith("cr")
      ? "critica"
      : bruto === "importante"
        ? "importante"
        : "menor";
    achados.push({ gravidade, texto: (m[2] ?? "").trim() });
  }
  return achados;
}

/**
 * IMPEDIMENTO DECLARADO PELO CONSTRUTOR (T-058).
 *
 * A lacuna que isto fecha: **um agente que identifica corretamente um defeito de especificação
 * não tinha como dizer isso à máquina.** O contrato do executor já manda parar e avisar quando um
 * critério é impossível ou o escopo está errado (`.claude/agents/executor.md`) — e na T-030 ele
 * fez exatamente isso, no ciclo 2, escrevendo nas Notas a recomendação que acabou destravando a
 * tarefa. Ninguém estava ouvindo: o motor não lê prosa, e não havia campo para "travado pela
 * especificação". Custou mais três ciclos e ~US$ 9 para chegar à mesma conclusão.
 *
 * A T-054 e a T-057 cobrem só "o comando não executa". Não cobrem critério executável mas ERRADO,
 * escopo impossível, dependência faltando ou contexto factualmente falso — e para esses o único
 * que sabe é quem leu a tarefa inteira.
 *
 * Formato FIXO de propósito: uma linha, no começo dela. Sinal de máquina não se infere de prosa —
 * é a mesma doutrina de `lerConformidade` e `lerAchados`. Vale a ÚLTIMA ocorrência, porque as
 * Notas acumulam ciclos.
 */
export function lerImpedimento(notas: string): string | null {
  const m = ultimaOcorrencia(notas, /^[^\S\n]*Impedimento:[^\S\n]*(.+)$/gim);
  const motivo = (m?.[1] ?? "").trim();
  return motivo === "" ? null : motivo;
}

export interface SecoesRevisao {
  conformidade: string;
  revisao: string;
}

/**
 * Classifica a reprovação a partir do portão observado.
 *
 * `secoes` só é consultada quando o portão foi o revisor — é o único caso em que o texto
 * acrescenta informação (conformidade e gravidade). Nos outros a natureza já está decidida
 * pelo portão, e ler o arquivo seria I/O sem retorno.
 */
export function classificar(
  portao: PortaoQueReprovou | null,
  secoes: SecoesRevisao | null,
): Diagnostico {
  if (portao === null) return DIAGNOSTICO_DESCONHECIDO;
  if (portao === "mecanica") {
    return { natureza: "mecanica", achados: [], grave: false, conformidade: null };
  }
  if (portao === "verificador") {
    return { natureza: "funcional", achados: [], grave: false, conformidade: null };
  }

  const conformidade = lerConformidade(secoes?.conformidade ?? "");
  const achados = lerAchados(secoes?.revisao ?? "");
  const grave = achados.some((a) => a.gravidade !== "menor");

  // Conformidade reprovada domina: entregar outra coisa é erro de ENTENDIMENTO, e nenhum
  // número de defeitos pontuais muda isso. `cumpre-parcial` entra junto — falta pedaço do
  // que foi pedido, que é a mesma família de erro.
  if (conformidade === "nao-cumpre" || conformidade === "cumpre-parcial") {
    return { natureza: "conformidade", achados, grave, conformidade };
  }
  // Revisor reprovou sem veredito de conformidade legível: NÃO assuma que foi só defeito —
  // pode ser conformidade que não deu para ler. Cai no caro.
  if (conformidade === null && achados.length === 0) {
    return { natureza: "conformidade", achados, grave: true, conformidade: null };
  }
  return { natureza: "defeito", achados, grave, conformidade };
}

/** O que o motor decide a partir do diagnóstico. */
export interface PoliticaRetrabalho {
  /** Sobe para o modelo de reforço? */
  reforcar: boolean;
  /** Teto de voltas desta etapa. `null` = usa o padrão do papel. */
  maxTurns: number | null;
  /** `pontual` manda o construtor atacar achados nomeados; `completo` é o de sempre. */
  escopo: "completo" | "pontual";
  /** Frase curta para o log — é o que explica a fatura depois. */
  motivo: string;
}

/** Voltas de um retrabalho ESTREITO. Folgado o bastante para ler, corrigir e testar. */
export const VOLTAS_PONTUAL = 25;
/** Voltas de um conserto de verdade (defeito grave, falha funcional). */
export const VOLTAS_MEDIO = 40;

/**
 * Traduz diagnóstico em política.
 *
 * Duas travas que existem para o barateamento nunca custar qualidade:
 *
 * 1. **A última ficha é sempre cara.** Em `tentativas >= 2` a próxima reprovação bloqueia
 *    (ou dispara replanejamento). Economizar aí é o pior negócio possível: poupa centavos e
 *    arrisca queimar a tarefa. Sempre reforça, sempre voltas cheias.
 * 2. **Conformidade nunca barateia.** É o caso em que o barato já falhou por não entender.
 */
export interface SinaisDaRodada {
  /**
   * Algum agente desta MESMA tarefa passou do `limiarDeDebate` (p90 medido de chamadas de
   * ferramenta) nesta rodada.
   *
   * É o atuador que faltava ao estouro de orçamento (item 1 do handoff de 15/08): o sinal
   * existia, era empilhado em `motor.ts` e lido num lugar só, para imprimir uma linha de
   * relatório. Aqui ele age no único momento em que a doutrina permite — ANTES de começar o
   * próximo despacho, nunca cortando o que está em voo.
   *
   * O que ele acrescenta ao diagnóstico: o portão diz **por que** a tarefa voltou; isto diz
   * **como foi** a tentativa anterior. Um agente que gastou o decil superior de chamadas e
   * ainda assim voltou reprovado não estava fazendo um ajuste de duas linhas — estava
   * procurando, e procurar de novo com menos capacidade repete o mesmo resultado por
   * dinheiro igual. Debater-se repete.
   */
  debateuAntes?: boolean;
}

export function politicaDe(
  diag: Diagnostico,
  tentativas: number,
  temReforco: boolean,
  sinais: SinaisDaRodada = {},
): PoliticaRetrabalho {
  const completoCaro = (motivo: string): PoliticaRetrabalho => ({
    reforcar: temReforco,
    maxTurns: null,
    escopo: "completo",
    motivo,
  });

  // Primeira execução: nada a diagnosticar, e nada a escalar.
  if (tentativas < 1 || diag.natureza === "nenhuma") {
    return { reforcar: false, maxTurns: null, escopo: "completo", motivo: "primeira execução" };
  }

  // Trava 1: última tentativa antes do bloqueio/replanejamento.
  if (tentativas >= 2) {
    return completoCaro("última tentativa antes do bloqueio — sem economia aqui");
  }

  // Trava 2: entregou outra coisa.
  //
  // MAS "conformidade" não é uma coisa só, e tratá-la como uma custou caro (medido na T-034,
  // 10/08). `completoCaro` é a configuração MAIS cara que existe aqui — reforça o modelo, manda
  // refazer com escopo COMPLETO e não põe teto de voltas. Aplicá-la a `cumpre-parcial` parte de
  // uma premissa que os dados desmentem: a de que o construtor "não entendeu o pedido".
  //
  // O que a T-034 realmente foi: 3 dos 4 critérios cumpridos, e o quarto reprovado por um
  // achado NOMEADO, com arquivo, linha e aritmética (a faixa do modal em `width: 26rem` fixa
  // contra um tabuleiro que cresce por `flex-grow`). O construtor entendeu o pedido — errou uma
  // faixa de viewport. O ciclo seguinte, despachado em `opus` com escopo completo e sem teto de
  // voltas, gastou 34 chamadas de ferramenta para trocar UMA LINHA de CSS.
  //
  // A distinção, então, é entre não entender e não terminar:
  //
  // - `nao-cumpre` (ou veredito ilegível) → entregou outra coisa. Continua no calibre máximo.
  // - `cumpre-parcial` COM achados nomeados → falta um pedaço localizado. Mantém o modelo
  //   reforçado (não se economiza capacidade em conformidade), mas o escopo vira PONTUAL, com
  //   teto de voltas: é a mesma forma do `defeito grave` logo abaixo, que já resolve este
  //   formato há tempo — "reforça, mas ataca o que foi apontado".
  // - `cumpre-parcial` SEM nenhum achado nomeado → não há foco para dar ao construtor; o bloco
  //   `<foco>` sairia vazio e o despacho pontual viraria uma adivinhação mais cara. Cai no caro.
  //
  // Note o que NÃO muda: o modelo. A economia vem de não mandar refazer do zero o que já está
  // 3/4 pronto — não de apostar num modelo mais fraco depois de uma reprovação.
  if (diag.natureza === "conformidade") {
    if (diag.conformidade === "cumpre-parcial" && diag.achados.length > 0) {
      return {
        reforcar: temReforco,
        maxTurns: VOLTAS_MEDIO,
        escopo: "pontual",
        motivo:
          "conformidade PARCIAL com achado nomeado — falta pedaço localizado, não erro de" +
          " entendimento: mantém o calibre e ataca o que foi apontado",
      };
    }
    return completoCaro("reprovado por CONFORMIDADE — erro de entendimento, calibre máximo");
  }

  // TRAVA 3: o ciclo anterior se DEBATEU. Vale só para os dois caminhos baratos abaixo —
  // `mecanica` e `defeito menor` são os únicos que apostam num modelo NÃO reforçado, e é
  // exatamente essa aposta que o debate desmente. Os demais já estão no calibre alto, então
  // aqui não há nada a subir e a trava não precisa aparecer.
  //
  // O escopo continua PONTUAL de propósito: o foco (achado nomeado, saída do comando) segue
  // sendo a informação certa, e alargá-lo mandaria o construtor reabrir o que já passa —
  // o desperdício que `blocoDeFoco` existe para evitar. O que muda é a CAPACIDADE, e o teto
  // de voltas sobe junto: mandar um agente que já procurou muito procurar de novo com menos
  // espaço é a pior combinação das duas.
  const debateu = sinais.debateuAntes === true;
  const porDebate = (base: string): PoliticaRetrabalho => ({
    reforcar: temReforco,
    maxTurns: VOLTAS_MEDIO,
    escopo: "pontual",
    motivo: `${base}, MAS o ciclo anterior se debateu (chamadas no decil superior) — debater-se repete: reforça`,
  });

  if (diag.natureza === "mecanica") {
    // O comando já disse o que quebrou. Modelo mais forte não acrescenta nada aqui.
    return debateu
      ? porDebate("falha mecânica (critério executável)")
      : {
          reforcar: false,
          maxTurns: VOLTAS_PONTUAL,
          escopo: "pontual",
          motivo:
            "falha mecânica (critério executável) — objetiva e localizada, sem escalar modelo",
        };
  }

  if (diag.natureza === "defeito") {
    if (diag.grave) {
      return {
        reforcar: temReforco,
        maxTurns: VOLTAS_MEDIO,
        escopo: "pontual",
        motivo: "defeito grave nomeado pelo revisor — reforça, mas ataca o que foi apontado",
      };
    }
    return debateu
      ? porDebate("só achados `menor`")
      : {
          reforcar: false,
          maxTurns: VOLTAS_PONTUAL,
          escopo: "pontual",
          motivo: "só achados `menor` — ajuste pontual, sem escalar modelo",
        };
  }

  // funcional: o software se comportou errado ao ser executado. Fica no calibre alto, mas
  // com voltas medidas — o verificador já entregou a reprodução.
  return {
    reforcar: temReforco,
    maxTurns: VOLTAS_MEDIO,
    escopo: "pontual",
    motivo: "reprovado pelo verificador ao executar — reforça, com a reprodução em mãos",
  };
}

/**
 * Bloco de FOCO para o despacho pontual: os achados nomeados, em ordem de gravidade.
 *
 * Existe para o construtor não reabrir a tarefa inteira quando o que falta é nomeado. Vazio
 * quando não há achado — e aí o despacho sai como sempre foi, sem seção nenhuma a mais.
 */
export function blocoDeFoco(diag: Diagnostico): string {
  const abertura = [
    "<foco>",
    "A entrega anterior está NO LUGAR e foi aproveitada — não recomece do zero, não refaça o",
    "que já passou.",
  ];
  const fecho = [
    "Se algo apontado não proceder, diga por quê nas Notas em vez de mudar o código.",
    "</foco>",
  ];

  if (diag.achados.length > 0) {
    const ordem: Record<Gravidade, number> = { critica: 0, importante: 1, menor: 2 };
    const linhas = [...diag.achados]
      .sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade])
      .map((a) => `- [${a.gravidade}] ${a.texto}`);
    return [
      ...abertura,
      "Corrija exatamente os achados abaixo e nada além deles:",
      ...linhas,
      ...fecho,
    ].join("\n");
  }

  // Sem achado nomeado, mas com falha objetiva: o relatório está no arquivo da tarefa e é
  // mais preciso do que qualquer resumo que coubesse aqui. Apontar para ele custa 2 linhas e
  // evita o pior desperdício do retrabalho — o construtor reabrindo o que já passava.
  if (diag.natureza === "mecanica" || diag.natureza === "funcional") {
    const onde =
      diag.natureza === "mecanica"
        ? "o resultado da passada mecânica (o comando e a saída dele)"
        : "o relatório de reprodução do verificador";
    return [
      ...abertura,
      `Leia ${onde} no FIM da seção \`## Verificação\` da tarefa e corrija exatamente o que`,
      "falhou ali. Não altere o que já estava passando.",
      ...fecho,
    ].join("\n");
  }
  return "";
}
