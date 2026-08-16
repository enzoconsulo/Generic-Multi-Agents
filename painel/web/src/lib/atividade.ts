import type { FasePlano, LinhaLog, Plano, TarefaCompleta } from "./tipos";

/**
 * Extração da ATIVIDADE dos agentes a partir do log ao vivo, e agregação do PLANO com o
 * progresso real das tarefas (T-023).
 *
 * Tudo aqui é função PURA: é o que permite testar "quem está trabalhando" e "quanto da
 * fase está pronto" sem navegador e sem SSE.
 */

/**
 * O runner loga o despacho de subagente como `Agent → domain` (ou `(subagente) Task →
 * testador`, em outros SDKs) — ver `runner-claude.ts`. Este regex é o contrato entre
 * aquele formato e a visualização da equipe.
 */
const DESPACHO = /(?:\(subagente\)\s*)?(?:Agent|Task)\s*→\s*(.+?)\s*$/;

/**
 * DOIS MOTORES, DOIS FORMATOS DE LOG — e a tela precisa dos dois (16/08).
 *
 * `/trabalhar <projeto>` roda pelo PIPELINE EM CÓDIGO, onde quem despacha é a máquina de
 * estados e não a ferramenta `Agent`: nenhuma linha `Agent → testador` é emitida, nunca.
 * O regex acima, único sensor de "quem está trabalhando" até aqui, casava zero linhas nesses
 * jobs — e o efeito visível era a trilha construir → verificar → revisar sempre apagada e o
 * log inteiro num bloco só, atribuído ao "orquestrador".
 *
 * Hoje esse caminho manda `agente`/`papel`/`tarefa` em CAMPO (ver `LinhaLog`), e a escolha do
 * modo é por job: **se qualquer linha traz `agente`, o job é do pipeline** e a segmentação
 * usa os campos; senão cai no regex, que continua sendo o contrato do runner do Agent SDK.
 * Decidir por job, e não por linha, é o que impede um formato de contaminar o outro.
 */
export function temMetaEstruturada(linhas: readonly LinhaLog[]): boolean {
  return linhas.some((l) => typeof l.agente === "string" && l.agente !== "");
}

/**
 * CABEÇALHO DE ETAPA EM LOG ANTIGO — leitor de compatibilidade, e só isso.
 *
 * Jobs gravados antes de `MetaEtapa` (16/08) não têm os campos, e o histórico do painel é
 * justamente onde se vai olhar um job de ontem: sem isto, a correção das bolinhas valeria
 * só para execuções futuras, e quem abrisse a rodada de ontem continuaria vendo a trilha
 * apagada — concluindo, com razão, que nada foi consertado.
 *
 * As duas formas são as que o pipeline escrevia: `T-048 · revisor · revisor · sonnet · ~16307
 * tok` (despachante) e `T-048 → revisor (motivo)` (motor).
 *
 * **Não é contrato novo: é leitor de arquivo velho.** Todo caminho novo manda os campos, e
 * casar formato de frase entre servidor e tela é exatamente o acoplamento que `MetaEtapa`
 * existe para desfazer. Quando o log antigo deixar de importar, isto sai inteiro.
 */
const CABECALHO_ANTIGO =
  /^(T-\d+[a-z]?)\s*(?:·\s*([a-z-]+)\s*·\s*([a-z0-9-]+)|→\s*([a-z0-9-]+))/i;

export interface CabecalhoAntigo {
  agente: string;
  papel: string | null;
  tarefa: string;
}

/** Agente/papel/tarefa deduzidos de um cabeçalho antigo, ou `null` se a linha não é um. */
export function lerCabecalhoAntigo(texto: string): CabecalhoAntigo | null {
  const m = CABECALHO_ANTIGO.exec(texto.trim());
  if (m === null) return null;
  const agente = m[3] ?? m[4] ?? "";
  if (agente === "") return null;
  return { agente, papel: m[2] ?? null, tarefa: m[1] ?? "" };
}

export interface AtividadeAgente {
  /** Id do agente despachado (`domain`, `testador`, `revisor`…). */
  id: string;
  /** Quantas vezes foi despachado no log. */
  vezes: number;
  /** Momento do despacho mais recente (ISO). */
  ultimoEm: string;
}

/** Id do agente do despacho mais recente, ou null se nenhum despacho no log. */
export function agenteAtivo(linhas: readonly LinhaLog[]): string | null {
  if (temMetaEstruturada(linhas)) {
    // A ÚLTIMA linha manda, inclusive quando ela não tem agente: no pipeline, linha sem meta
    // é o motor decidindo entre etapas (promover, rodar critério, commitar gestão). Dizer
    // "o executor está trabalhando" ali seria mentira — ele já terminou.
    const ultima = linhas[linhas.length - 1];
    return ultima?.agente ?? null;
  }
  for (let i = linhas.length - 1; i >= 0; i--) {
    const linha = linhas[i];
    if (linha === undefined || linha.nivel !== "ferramenta") continue;
    const casou = DESPACHO.exec(linha.texto);
    if (casou?.[1] !== undefined) return casou[1];
  }
  return null;
}

/** Papel do agente que produziu a última linha (só no pipeline em código). */
export function papelAtivo(linhas: readonly LinhaLog[]): string | null {
  return linhas[linhas.length - 1]?.papel ?? null;
}

/** Quantas vezes cada agente foi despachado, do mais recente para o mais antigo. */
export function atividadePorAgente(linhas: readonly LinhaLog[]): AtividadeAgente[] {
  const porId = new Map<string, AtividadeAgente>();
  const estruturado = temMetaEstruturada(linhas);
  let anterior: string | null = null;
  for (const linha of linhas) {
    let id: string | undefined;
    if (estruturado) {
      // No pipeline, "despacho" é a TROCA de agente: cada etapa é uma `query()` própria, e
      // todas as linhas dela vêm carimbadas. Contar linha a linha diria "o executor foi
      // despachado 40 vezes" para um único despacho de 40 chamadas de ferramenta.
      const atual = linha.agente ?? null;
      id = atual !== null && atual !== anterior ? atual : undefined;
      anterior = atual;
    } else {
      if (linha.nivel !== "ferramenta") continue;
      id = DESPACHO.exec(linha.texto)?.[1];
    }
    if (id === undefined) continue;
    const atual = porId.get(id);
    if (atual === undefined) porId.set(id, { id, vezes: 1, ultimoEm: linha.em });
    else {
      atual.vezes += 1;
      atual.ultimoEm = linha.em;
    }
  }
  return [...porId.values()].sort((a, b) => b.ultimoEm.localeCompare(a.ultimoEm));
}

/* ------------------------- Linha do tempo do job ------------------------- */

/** Etapa do pipeline da fábrica, deduzida de QUEM está trabalhando. */
export type EtapaPipeline = "construtor" | "verificador" | "revisor";

/**
 * Nomes dos portões nas DUAS trilhas da fábrica. A etapa do meio se chamava `testador`, o
 * nome do agente da trilha de software — e por isso um projeto genérico, verificado pelo
 * `conferente`, tinha o portão do meio classificado como "construtor". A etapa é o PAPEL;
 * o agente é quem o cumpre naquela trilha.
 */
const VERIFICADORES: ReadonlySet<string> = new Set(["testador", "conferente"]);
const REVISORES: ReadonlySet<string> = new Set(["revisor", "revisor-generico"]);

/**
 * Etapa da trilha a partir do papel (quando o log o traz) ou do nome do agente.
 *
 * `papel` vence sempre que existe: ele é o que o motor DECIDIU, enquanto o nome do agente é
 * uma pista — no passo 3 da resolução (o único que roda no painel) o construtor de um
 * especialista se chama `executor`, e num projeto genérico o verificador se chama
 * `conferente`. Papéis que não são portão (`planejador`, `documentador`) devolvem `null`:
 * eles acontecem FORA do ciclo de uma tarefa, e acender uma bolinha para eles diria que a
 * tarefa andou quando ela não andou.
 */
export function etapaDoAgente(agente: string | null, papel?: string | null): EtapaPipeline | null {
  if (papel !== undefined && papel !== null && papel !== "") {
    if (papel === "construtor") return "construtor";
    // `marco` é o verificador exercitando a META da fase — mesma etapa, outro objeto.
    if (papel === "verificador" || papel === "marco") return "verificador";
    if (papel === "revisor") return "revisor";
    return null;
  }
  if (agente === null) return null;
  const base = agente.replace(/-reforcado$/, "");
  if (VERIFICADORES.has(base)) return "verificador";
  if (REVISORES.has(base)) return "revisor";
  return "construtor";
}

export interface SegmentoAgente {
  /** Agente do trecho; null = orquestrador (antes do primeiro despacho). */
  agente: string | null;
  etapa: EtapaPipeline | null;
  /** Papel do trecho, quando o log o traz (pipeline em código). */
  papel: string | null;
  /** Tarefa do trecho, quando conhecida — o que responde "isto foi sobre o quê?". */
  tarefa: string | null;
  inicio: string;
  /** Último evento do trecho (o trecho corrente usa o último que chegou). */
  fim: string;
  linhas: LinhaLog[];
  duracaoMs: number;
}

/**
 * Agrupa o log em TRECHOS POR AGENTE (T-024): cada despacho `Agent → X` abre um trecho, e
 * tudo que vem depois pertence a ele até o próximo despacho.
 *
 * É o que troca "parede de linhas soltas" por "blocos do que cada agente fez" — a mesma
 * informação, na unidade em que a pessoa raciocina.
 */
export function segmentarPorAgente(linhas: readonly LinhaLog[]): SegmentoAgente[] {
  const segmentos: SegmentoAgente[] = [];
  const estruturado = temMetaEstruturada(linhas);

  const abrir = (linha: LinhaLog | null, agente: string | null, em: string): SegmentoAgente => {
    const papel = linha?.papel ?? null;
    const s: SegmentoAgente = {
      agente,
      etapa: etapaDoAgente(agente, papel),
      papel,
      tarefa: linha?.tarefa ?? null,
      inicio: em,
      fim: em,
      linhas: [],
      duracaoMs: 0,
    };
    segmentos.push(s);
    return s;
  };

  const fechar = (s: SegmentoAgente, linha: LinhaLog): void => {
    s.fim = linha.em;
    if (s.tarefa === null && linha.tarefa !== undefined) s.tarefa = linha.tarefa;
    const ms = Date.parse(s.fim) - Date.parse(s.inicio);
    s.duracaoMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  };

  let atual: SegmentoAgente | null = null;

  for (const linha of linhas) {
    if (estruturado) {
      // Troca de agente abre trecho — inclusive a troca PARA `null`, que é o motor voltando a
      // decidir entre duas etapas. Sem isso, promoções e critérios do motor apareceriam
      // dentro do bloco do agente anterior, creditando a ele trabalho que não é dele.
      const alvo = linha.agente ?? null;
      if (atual === null || atual.agente !== alvo) atual = abrir(linha, alvo, linha.em);
      atual.linhas.push(linha);
      fechar(atual, linha);
      continue;
    }

    const despachado = linha.nivel === "ferramenta" ? DESPACHO.exec(linha.texto)?.[1] : undefined;

    if (despachado !== undefined) {
      atual = abrir(null, despachado, linha.em);
      continue; // a linha do despacho é o cabeçalho do trecho, não conteúdo dele
    }

    // Log de PIPELINE ANTIGO (sem os campos): o cabeçalho da etapa ainda é reconhecível no
    // texto. Ver `lerCabecalhoAntigo` — é leitor de compatibilidade, não contrato.
    const antigo = linha.nivel !== "erro" ? lerCabecalhoAntigo(linha.texto) : null;
    if (antigo !== null) {
      atual = abrir({ ...linha, papel: antigo.papel ?? undefined, tarefa: antigo.tarefa }, antigo.agente, linha.em);
      atual.linhas.push(linha);
      fechar(atual, linha);
      continue;
    }

    if (atual === null) atual = abrir(null, null, linha.em);

    atual.linhas.push(linha);
    fechar(atual, linha);
  }

  // Trecho de orquestrador vazio no fim (despacho sem nada depois ainda) não é ruído:
  // é justamente "acabou de despachar, aguardando" — mantido de propósito.
  return segmentos;
}

/**
 * Segmenta o log de um job de CI por ESTÁGIO (T-026). Um pipeline de CI não tem agentes —
 * rotular o trecho de "orquestrador" seria mentira. As linhas do runner de CI já carregam
 * `estagio`, então é só agrupar por ele.
 */
export function segmentarPorEstagio(linhas: readonly LinhaLog[]): SegmentoAgente[] {
  const segmentos: SegmentoAgente[] = [];
  let atual: SegmentoAgente | null = null;

  for (const linha of linhas) {
    const nome = linha.estagio ?? null;
    if (atual === null || atual.agente !== nome) {
      atual = {
        agente: nome,
        etapa: null, // as etapas construir/verificar/revisar são do pipeline Claude
        papel: null,
        tarefa: null,
        inicio: linha.em,
        fim: linha.em,
        linhas: [],
        duracaoMs: 0,
      };
      segmentos.push(atual);
    }
    atual.linhas.push(linha);
    atual.fim = linha.em;
    const ms = Date.parse(atual.fim) - Date.parse(atual.inicio);
    atual.duracaoMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  }
  return segmentos;
}

/**
 * Última tarefa em foco. Prefere o CAMPO `tarefa` (pipeline em código, onde o motor sabe
 * exatamente qual tarefa despachou) e só cai no texto quando ele não existe — no runner do
 * Agent SDK o id só aparece na prosa do orquestrador.
 */
export function tarefaEmFoco(linhas: readonly LinhaLog[]): string | null {
  for (let i = linhas.length - 1; i >= 0; i--) {
    const t = linhas[i]?.tarefa;
    if (t !== undefined && t !== "") return t;
  }
  for (let i = linhas.length - 1; i >= 0; i--) {
    const casou = /\bT-\d{3,}\b/.exec(linhas[i]?.texto ?? "");
    if (casou !== null) return casou[0];
  }
  return null;
}

/* --------------------- Grafo de execução / paralelismo -------------------- */

/** Teto de construtores em paralelo no mesmo projeto (regra de ouro do CLAUDE.md raiz). */
export const TETO_PARALELO = 3;

export interface NivelExecucao {
  /** 0 = pode começar já; 1 = só depois que tudo do nível 0 concluir; e assim por diante. */
  nivel: number;
  tarefas: TarefaCompleta[];
  /**
   * Ids que a fábrica consegue rodar SIMULTANEAMENTE dentro deste nível. Não basta não
   * ter dependência: os agentes compartilham a MESMA árvore de arquivos, então duas
   * tarefas que tocam a mesma `area` se atropelariam. Teto de 3.
   */
  loteParalelo: string[];
}

export interface GrafoExecucao {
  niveis: NivelExecucao[];
  /** Tarefas presas em ciclo de dependência — nunca executáveis (erro de plano). */
  ciclos: string[];
  /** Dependência apontando para tarefa inexistente (plano desatualizado). */
  quebradas: { tarefa: string; falta: string }[];
  /** Maior lote paralelo do plano inteiro: o teto real de velocidade. */
  paralelismoMaximo: number;
}

/** Duas tarefas colidem se tocam qualquer `area` em comum. */
function colide(a: TarefaCompleta, b: TarefaCompleta): boolean {
  return a.areas.some((x) => b.areas.includes(x));
}

/**
 * Monta a ordem de execução a partir das `dependencias` (T-025).
 *
 * Responde a pergunta que o painel não sabia responder: **o que pode rodar ao mesmo
 * tempo?** Tarefas do mesmo nível não dependem umas das outras; dentro do nível, o
 * `loteParalelo` é o que de fato roda junto respeitando `areas` disjuntas e o teto de 3.
 *
 * Robusto a plano quebrado: dependência para id inexistente é ignorada no cálculo mas
 * REPORTADA, e ciclo é detectado em vez de travar em laço infinito.
 */
export function montarGrafoExecucao(tarefas: readonly TarefaCompleta[]): GrafoExecucao {
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  const quebradas: { tarefa: string; falta: string }[] = [];

  // Só dependências que existem entram no cálculo — as demais viram aviso.
  const deps = new Map<string, string[]>();
  for (const t of tarefas) {
    const validas: string[] = [];
    for (const d of t.dependencias) {
      if (porId.has(d)) validas.push(d);
      else quebradas.push({ tarefa: t.id, falta: d });
    }
    deps.set(t.id, validas);
  }

  // Nivelamento: uma tarefa entra quando TODAS as dependências dela já têm nível.
  const nivelDe = new Map<string, number>();
  let avancou = true;
  while (avancou) {
    avancou = false;
    for (const t of tarefas) {
      if (nivelDe.has(t.id)) continue;
      const minhas = deps.get(t.id) ?? [];
      if (!minhas.every((d) => nivelDe.has(d))) continue;
      const nivel = minhas.reduce((max, d) => Math.max(max, (nivelDe.get(d) ?? 0) + 1), 0);
      nivelDe.set(t.id, nivel);
      avancou = true;
    }
  }

  // Quem sobrou sem nível está num ciclo (A depende de B que depende de A).
  const ciclos = tarefas.filter((t) => !nivelDe.has(t.id)).map((t) => t.id);

  const porNivel = new Map<number, TarefaCompleta[]>();
  for (const t of tarefas) {
    const n = nivelDe.get(t.id);
    if (n === undefined) continue;
    porNivel.set(n, [...(porNivel.get(n) ?? []), t]);
  }

  const niveis: NivelExecucao[] = [...porNivel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([nivel, doNivel]) => ({ nivel, tarefas: doNivel, loteParalelo: montarLote(doNivel) }));

  return {
    niveis,
    ciclos,
    quebradas,
    paralelismoMaximo: niveis.reduce((max, n) => Math.max(max, n.loteParalelo.length), 0),
  };
}

/**
 * Maior lote que roda junto, por varredura gulosa: entra quem não colide em `areas` com
 * ninguém já no lote. Guloso e não ótimo de propósito — o objetivo é mostrar um lote
 * REAL e alcançável, não resolver conjunto independente máximo.
 */
function montarLote(doNivel: readonly TarefaCompleta[]): string[] {
  const lote: TarefaCompleta[] = [];
  for (const t of doNivel) {
    if (lote.length >= TETO_PARALELO) break;
    if (t.status === "concluida" || t.status === "cancelada") continue;
    if (lote.some((j) => colide(j, t))) continue;
    lote.push(t);
  }
  return lote.map((t) => t.id);
}

/* --------------------------------- Plano --------------------------------- */

export interface FaseComProgresso {
  nome: string;
  meta: string;
  marco: FasePlano["marco"];
  /** Tarefas da fase, já resolvidas (as que o PLANO cita e existem em disco). */
  tarefas: TarefaCompleta[];
  /** Ids citados no plano que NÃO têm arquivo de tarefa (plano desatualizado). */
  idsAusentes: string[];
  concluidas: number;
  total: number;
  /** 0–100; fase sem tarefa nenhuma conta como 0 (e não como 100). */
  percentual: number;
}

export interface MapaPlano {
  fases: FaseComProgresso[];
  /** Tarefas que existem mas nenhuma fase cita — não podem sumir da visão. */
  semFase: TarefaCompleta[];
}

/**
 * Cruza o PLANO.md (fases → ids de tarefa) com as tarefas reais, produzindo progresso por
 * fase. Duas escolhas deliberadas de honestidade:
 *  - id citado no plano sem arquivo correspondente vira `idsAusentes` (plano desatualizado
 *    fica VISÍVEL, em vez de sumir da conta e inflar o percentual);
 *  - tarefa órfã (existe mas nenhuma fase cita) vai para `semFase`, nunca é escondida.
 */
export function montarMapaPlano(plano: Plano | null, tarefas: readonly TarefaCompleta[]): MapaPlano {
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  const usadas = new Set<string>();
  const fases: FaseComProgresso[] = [];

  for (const fase of plano?.fases ?? []) {
    const daFase: TarefaCompleta[] = [];
    const idsAusentes: string[] = [];
    for (const id of fase.tarefas) {
      const tarefa = porId.get(id);
      if (tarefa === undefined) {
        idsAusentes.push(id);
        continue;
      }
      daFase.push(tarefa);
      usadas.add(id);
    }
    const concluidas = daFase.filter((t) => t.status === "concluida").length;
    const total = daFase.length;
    fases.push({
      nome: fase.nome,
      meta: fase.meta,
      marco: fase.marco,
      tarefas: daFase,
      idsAusentes,
      concluidas,
      total,
      percentual: total === 0 ? 0 : Math.round((concluidas / total) * 100),
    });
  }

  return { fases, semFase: tarefas.filter((t) => !usadas.has(t.id)) };
}
