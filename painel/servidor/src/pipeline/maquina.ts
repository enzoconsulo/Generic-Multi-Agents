import type { PapelAgente } from "../contexto/montador.js";
import type { EquipeProjeto, TarefaResumo } from "../fabrica/tipos.js";

/**
 * Máquina de decisões do pipeline — o que hoje um MODELO faz e não deveria.
 *
 * POR QUE EXISTE (medido; ver `_sistema/CUSTO_DE_CONTEXTO.md`, I3). No job `7a1f9a45` o
 * agente `orquestrador` consumiu 36 voltas, 106k de escrita e 2,44M de leitura de cache —
 * **US$ 1,29, 17% do job** — para executar o que é uma máquina de estados: ler frontmatter,
 * promover tarefa cujas dependências fecharam, escolher o agente pelos 3 passos do
 * `equipe.json`, aplicar o escalonamento por `tentativas` e mover status.
 *
 * Nada disso é julgamento. Tudo isso é regra escrita, determinística e verificável — e
 * regra determinística executada por modelo é cara E não confiável: foi um orquestrador
 * que abandonou um agente em voo (`f72534e8`), e foi outro que apontou tarefa para
 * especialista inexistente.
 *
 * O QUE **NÃO** ENTRA AQUI, de propósito: replanejar, julgar marco reprovado, decidir se
 * uma tarefa é trivial o bastante para pular `em-teste`, redigir relatório. Isso é
 * julgamento e continua no modelo. A fronteira é: **se a regra cabe num teste, ela é
 * código.**
 *
 * Este módulo é PURO — nenhuma I/O, nenhuma chamada de modelo. O motor (`motor.ts`) faz o
 * I/O e consulta este arquivo para toda decisão.
 */

/** Trilha do projeto, resolvida pelo `dominio` do `equipe.json` (CLAUDE.md, "As duas trilhas"). */
export type Trilha = "software" | "generica";

/** Sequência de papéis de uma tarefa, por trilha. É a tabela do pipeline, em dados. */
export const ETAPAS: Readonly<Record<Trilha, Readonly<Record<string, PapelAgente | null>>>> = {
  software: {
    pronta: "construtor",
    "em-execucao": "construtor",
    "em-teste": "verificador",
    "em-revisao": "revisor",
  },
  generica: {
    pronta: "construtor",
    "em-execucao": "construtor",
    "em-teste": "verificador",
    "em-revisao": "revisor",
  },
};

/** Agentes genéricos de cada papel, por trilha. */
export const AGENTE_GENERICO: Readonly<Record<Trilha, Readonly<Record<PapelAgente, string>>>> = {
  software: {
    construtor: "executor",
    verificador: "testador",
    revisor: "revisor",
    planejador: "planejador",
    // Marco é o verificador da trilha em outro modo, não um agente novo — o prompt dele já
    // tem a seção "Modo marco". Documentador é comum às duas trilhas.
    marco: "testador",
    documentador: "documentador",
  },
  generica: {
    construtor: "construtor",
    verificador: "conferente",
    revisor: "revisor-generico",
    planejador: "planejador-generico",
    marco: "conferente",
    documentador: "documentador",
  },
};

const SUFIXO_REFORCO = "-reforcado";
const SEPARADOR_PROJETO = "__";

/** Máximo de ciclos antes de bloquear (CLAUDE.md, "Pipeline de cada tarefa"). */
export const MAX_TENTATIVAS = 3;

/** Trilha de um projeto. Ausência de `equipe.json` ou de `dominio` é software, SEMPRE. */
export function trilhaDe(equipe: EquipeProjeto | null | undefined): Trilha {
  const d = equipe?.dominio;
  if (typeof d !== "string" || d.trim() === "" || d.trim() === "software") return "software";
  return "generica";
}

/**
 * Tarefas a promover de `backlog` para `pronta`: todas as `dependencias` `concluida`.
 *
 * Dependência **inexistente** trava a promoção e é reportada — é erro de frontmatter que
 * nunca fecha sozinho, e a distinção já existe em `lib/gestao.ts` do lado da UI. Silenciar
 * aqui deixaria a tarefa presa em `backlog` para sempre sem ninguém saber por quê.
 */
export function promoverProntas(tarefas: readonly TarefaResumo[]): {
  promover: string[];
  travadas: { id: string; faltando: string[]; inexistentes: string[] }[];
} {
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  const promover: string[] = [];
  const travadas: { id: string; faltando: string[]; inexistentes: string[] }[] = [];

  for (const t of tarefas) {
    if (t.status !== "backlog") continue;
    const faltando: string[] = [];
    const inexistentes: string[] = [];
    for (const dep of t.dependencias) {
      const d = porId.get(dep);
      if (d === undefined) inexistentes.push(dep);
      else if (d.status !== "concluida") faltando.push(dep);
    }
    if (faltando.length === 0 && inexistentes.length === 0) promover.push(t.id);
    else travadas.push({ id: t.id, faltando, inexistentes });
  }
  return { promover, travadas };
}

const ORDEM_PRIORIDADE: Readonly<Record<string, number>> = { alta: 0, media: 1, baixa: 2 };

/** Uma unidade de trabalho a despachar: a tarefa e o papel que vem agora. */
export interface Passo {
  tarefa: TarefaResumo;
  papel: PapelAgente;
}

/**
 * Próximos passos despacháveis, já respeitando as regras de paralelismo do CLAUDE.md.
 *
 * As três regras, e por que cada uma existe:
 * 1. **Verificador exige projeto quieto.** Bateria completa sobre árvore com edições
 *    alheias gera reprovação FALSA — o desperdício mais caro do sistema, porque queima um
 *    ciclo inteiro. Se há verificador a rodar, ele roda sozinho.
 * 2. **Até 3 construtores em paralelo, com `areas` disjuntas.** Mesma árvore de trabalho:
 *    dois construtores no mesmo arquivo se atropelam.
 * 3. **Revisor lê o diff commitado** — pode rodar em paralelo com qualquer coisa.
 *
 * Ordem: prioridade; **no empate, quem destrava mais tarefas**; e só então id (que existe
 * para o resultado ser determinístico entre rodadas, não porque o número signifique algo).
 *
 * O desempate por dependentes é o que o `/trabalhar` sempre PROMETEU ("entre iguais, a que
 * destrava mais dependentes") e o código não fazia: caía direto no id, que é a ordem de
 * CRIAÇÃO. Numa fase madura isso inverte a fila — a tarefa que abre caminho para outras três
 * costuma ter sido criada depois delas, então o id a joga para o fim exatamente quando ela é
 * a mais urgente.
 *
 * Limite conhecido, e vale registrar porque a heurística não o cobre: só enxerga a dependência
 * DECLARADA. Uma tarefa de fundação cujo valor é tornar as outras verificáveis — e que ninguém
 * lista em `dependencias` — continua invisível aqui, por mais dependentes reais que tenha.
 * Foi o caso da T-043 do banco-imobiliario, que ficou por último enquanto dois jobs (US$ 14)
 * faziam à mão o ritual que ela existia para eliminar. O conserto DAQUILO é de planejamento
 * (declarar a fundação como dependência de quem ela serve), não de ordenação.
 */
export function proximosPassos(
  tarefas: readonly TarefaResumo[],
  trilha: Trilha,
  maxConstrutores = 3,
): Passo[] {
  const candidatos: Passo[] = [];
  for (const t of tarefas) {
    const papel = ETAPAS[trilha][t.status];
    if (papel === undefined || papel === null) continue;
    candidatos.push({ tarefa: t, papel });
  }
  // Quantas tarefas AINDA ABERTAS esperam por cada uma. Concluída não conta: ela já não
  // espera por ninguém, e somá-la faria uma tarefa antiga parecer urgente para sempre.
  const dependentes = new Map<string, number>();
  for (const t of tarefas) {
    if (t.status === "concluida" || t.status === "cancelada") continue;
    for (const dep of t.dependencias ?? []) {
      dependentes.set(dep, (dependentes.get(dep) ?? 0) + 1);
    }
  }

  candidatos.sort((a, b) => {
    const pa = ORDEM_PRIORIDADE[a.tarefa.prioridade] ?? 1;
    const pb = ORDEM_PRIORIDADE[b.tarefa.prioridade] ?? 1;
    if (pa !== pb) return pa - pb;
    const da = dependentes.get(a.tarefa.id) ?? 0;
    const db = dependentes.get(b.tarefa.id) ?? 0;
    if (da !== db) return db - da; // mais dependentes primeiro
    return a.tarefa.id.localeCompare(b.tarefa.id);
  });

  const revisores = candidatos.filter((c) => c.papel === "revisor");
  const verificadores = candidatos.filter((c) => c.papel === "verificador");

  // Regra 1: verificador manda no projeto. Sai sozinho — só com revisores, que leem o
  // commit e não tocam a árvore.
  if (verificadores.length > 0) return [...revisores, verificadores[0] as Passo];

  const construtores: Passo[] = [];
  const areasTomadas = new Set<string>();
  for (const c of candidatos) {
    if (c.papel !== "construtor") continue;
    if (construtores.length >= maxConstrutores) break;
    const areas = c.tarefa.areas;
    // Tarefa sem `areas` declaradas pode tocar qualquer coisa: roda sozinha entre
    // construtores. Conservador de propósito — o custo do engano é reprovação falsa.
    if (areas.length === 0) {
      if (construtores.length === 0) construtores.push(c);
      break;
    }
    if (areas.some((a) => areasTomadas.has(a))) continue;
    for (const a of areas) areasTomadas.add(a);
    construtores.push(c);
  }
  return [...revisores, ...construtores];
}

/** Resultado da resolução de agente: nome a despachar + como se chegou nele. */
export interface AgenteResolvido {
  /** Nome do subagente. */
  nome: string;
  /** Modelo a usar: `null` = o do fluxo. */
  modelo: string | null;
  /** Prompt do especialista a COLAR no despacho, quando o agente nomeado não existe. */
  promptColado: string | null;
  /**
   * Trilha de decisão, para o log — é o que permite auditar roteamento errado.
   *
   * **DESCREVA O QUE ACONTECEU, NUNCA O QUE FALTOU.** Esta linha é lida meses depois, fora
   * de contexto, e quem a lê julga a saúde do roteamento por ela. O texto antigo do passo 3
   * era `` `engine` não injetado — genérico com prompt colado ``: tecnicamente correto e
   * enganoso, porque abre pelo mecanismo AUSENTE (injeção de subagente, que o painel nunca
   * usa e nem deveria) em vez do efeito REAL (o especialista foi aplicado). Custou uma
   * auditoria inteira em 16/08: 51 despachos saudáveis foram lidos como 51 degradados, e a
   * conclusão errada — "a equipe especializada nunca é usada" — chegou a ser relatada ao
   * usuário antes de ser desmentida por teste.
   *
   * Regra para as próximas: o motivo começa pelo que o despacho É. Ausência só aparece
   * quando ela É o defeito (ex.: `agente:` que não consta no `equipe.json`), e aí vem
   * nomeada como defeito, não como detalhe de implementação.
   */
  motivo: string;
}

/**
 * Resolve QUEM despacha um passo — os 3 passos determinísticos do CLAUDE.md ("Equipe do
 * projeto"), mais o escalonamento de modelo por `tentativas`.
 *
 * Regras de escalonamento (protocolo, regra 12):
 * - `tentativas >= 1` → variante `-reforcado` (a reprovação já provou que o modelo do
 *   disparo não deu conta; repetir a aposta queima uma das 3 tentativas de graça);
 * - `tentativas >= 2` **sob o mesmo especialista** → reforçado GENÉRICO. Duas reprovações
 *   sob o mesmo prompt de domínio são evidência de que a especialização está enviesando o
 *   ataque, e o `agente:` foi decidido no planejamento, quando ninguém sabia onde a tarefa
 *   iria falhar.
 *
 * Só o papel `construtor` usa especialista; verificador e revisor são sempre os da trilha.
 */
export function resolverAgente(
  passo: Passo,
  trilha: Trilha,
  equipe: EquipeProjeto | null,
  opcoes: {
    /** Nomes de subagente realmente disponíveis no disparo (o que foi injetado). */
    disponiveis: ReadonlySet<string>;
    /** Nome do projeto — para o nome qualificado `<projeto>__<id>`. */
    projeto: string;
    /** Modelo do retrabalho; null = a estratégia já está no topo. */
    reforco: string | null;
    /**
     * Decisão do diagnóstico sobre ESTE retrabalho (ver `diagnostico.ts`). Ausente = a
     * regra antiga, `tentativas >= 1` sempre reforça.
     *
     * Opcional de propósito: quem não diagnostica — testes antigos, simulador, qualquer
     * chamador novo — continua caindo no comportamento caro de sempre. Barateamento é
     * opt-in e exige sinal explícito; nunca é o que acontece por omissão.
     */
    politica?: { reforcar: boolean } | undefined;
  },
): AgenteResolvido {
  const generico = AGENTE_GENERICO[trilha][passo.papel];
  const tentativas = passo.tarefa.tentativas;
  const reforcar =
    opcoes.politica !== undefined
      ? opcoes.politica.reforcar && opcoes.reforco !== null
      : tentativas >= 1 && opcoes.reforco !== null;
  const sufixo = reforcar ? SUFIXO_REFORCO : "";
  const modelo = reforcar ? opcoes.reforco : null;

  // Verificador e revisor NÃO escalam de modelo: o gatilho do reforço é "a construção
  // falhou", e quem falhou foi o construtor. Subir o verificador junto pagaria modelo caro
  // para reexecutar a mesma bateria de testes — e é justamente por rodar barato que o
  // `testador` pode rodar sempre.
  if (passo.papel !== "construtor") {
    return {
      nome: generico,
      modelo: null,
      promptColado: null,
      motivo: `papel ${passo.papel}: agente fixo da trilha ${trilha}`,
    };
  }

  const id = (passo.tarefa.agente ?? "").trim();
  if (id === "") {
    return {
      nome: `${generico}${sufixo}`,
      modelo,
      promptColado: null,
      motivo: `sem \`agente:\` → genérico da trilha${reforcar ? " (reforçado)" : ""}`,
    };
  }

  const especialista = equipe?.agentes.find((a) => a.id === id) ?? null;
  if (especialista === null) {
    // Apontar para especialista inexistente é defeito de PLANEJAMENTO. Cai no genérico,
    // mas o motivo tem de aparecer no log — senão só se descobre por acaso, meses depois.
    return {
      nome: `${generico}${sufixo}`,
      modelo,
      promptColado: null,
      // Aqui a ausência É o defeito, então ela lidera — mas o efeito vem junto, para quem lê
      // o log saber o que de fato rodou.
      motivo:
        `genérico da trilha SEM especialização — \`agente: ${id}\` não consta no` +
        " equipe.json (defeito de planejamento, não do agente)",
    };
  }

  // 3 reprovações? Não há 4ª: quem chama trata pelo `deveBloquear`.
  // 2 reprovações sob o mesmo especialista: troca para o reforçado genérico.
  if (tentativas >= 2 && opcoes.reforco !== null) {
    return {
      nome: `${generico}${SUFIXO_REFORCO}`,
      modelo: opcoes.reforco,
      promptColado: null,
      motivo:
        `\`${id}\` reprovou ${tentativas}× — troca para o reforçado genérico antes da` +
        " última tentativa (a especialização está enviesando o ataque)",
    };
  }

  for (const candidato of [`${id}${sufixo}`, `${opcoes.projeto}${SEPARADOR_PROJETO}${id}${sufixo}`]) {
    if (opcoes.disponiveis.has(candidato)) {
      return {
        nome: candidato,
        modelo,
        promptColado: null,
        // "subagente" explícito para distinguir do passo 3, que aplica o MESMO especialista
        // por outro meio. Sem isso as duas linhas ficariam idênticas no log e não daria para
        // auditar por qual caminho o roteamento passou.
        motivo: `especialista \`${id}\` como subagente${reforcar ? " (reforçado)" : ""}`,
      };
    }
  }

  // Passo 3: genérico da trilha com o prompt do especialista COLADO no despacho.
  //
  // **Este é o caminho NORMAL do painel, não a exceção** — medido em 16/08: 51 de 51
  // despachos com `agente:`, em 41 rodadas. `runner-pipeline.ts` passa `disponiveis` vazio de
  // propósito: injetar subagente pelo SDK serve a um orquestrador-MODELO que decide chamar
  // `Agent`, e aqui quem despacha é a máquina de estados, que monta a `query()` inteira. Não
  // há a quem oferecer um subagente. Os passos 1 e 2 existem para o chat interativo.
  //
  // A especialização NÃO se perde: `promptColado` entra num bloco `<especialista>` ao lado do
  // `<seu-papel>` (ver `despachante.ts`), e há teste travando as duas metades da cadeia.
  return {
    nome: `${generico}${sufixo}`,
    modelo,
    promptColado: especialista.prompt,
    motivo: `especialista \`${id}\` colado no despacho${reforcar ? " (reforçado)" : ""}`,
  };
}

/**
 * Extensões que NÃO são código executável. Tarefa cujas `areas` são só isto pode pular o
 * portão do meio: não há software para rodar, e o revisor confere conformidade do mesmo
 * jeito. É a regra que o CLAUDE.md deixava como "decisão sua" — e ela cabe num teste, então
 * é código.
 *
 * Conservador de propósito: `.json`, `.yml` e afins ficam de FORA da lista, porque config
 * quebrada derruba software de verdade.
 */
const EXTENSOES_SEM_EXECUCAO: ReadonlySet<string> = new Set([".md", ".txt", ".rst", ".adoc"]);

/**
 * A tarefa é só de documentação/texto? Aí o verificador não tem o que executar.
 *
 * Tarefa SEM `areas` nunca pula: não declarar o que toca é o oposto de provar que não toca
 * código.
 */
export function podePularVerificacao(tarefa: TarefaResumo): boolean {
  if (tarefa.areas.length === 0) return false;
  return tarefa.areas.every((a) => {
    const ponto = a.lastIndexOf(".");
    return ponto !== -1 && EXTENSOES_SEM_EXECUCAO.has(a.slice(ponto).toLowerCase());
  });
}

/** A tarefa esgotou os 3 ciclos? (`tentativas` conta execuções, não reprovações.) */
export function deveBloquear(tarefa: TarefaResumo): boolean {
  return tarefa.tentativas > MAX_TENTATIVAS;
}

/**
 * Ao bloquear: replanejar ou entregar ao usuário?
 *
 * Autocorreção vale UMA vez por linhagem — tarefa que já nasceu de replanejamento
 * (`replanejada-de` preenchido) e esgotou de novo vira `bloqueada` para o usuário. Sem
 * esse limite, uma tarefa mal dimensionada gera replanejamentos em cascata, cada um
 * pagando um planejador inteiro.
 */
export function deveReplanejar(tarefa: TarefaResumo): boolean {
  return deveBloquear(tarefa) && (tarefa.replanejadaDe ?? "") === "";
}
