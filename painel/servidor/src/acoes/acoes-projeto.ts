import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";
import type { NovoJob } from "../jobs/fila.js";
import { guardrailsParaAcao } from "../jobs/robustez/guardrails.js";
import { ErroProjetoInexistente, dirProjeto } from "./analise.js";

/**
 * AÇÕES DE AGENTE POR PROJETO (T-033): pedir UM especialista para UM projeto, em vez de
 * só os dois extremos que existiam antes ("planeje tudo" pelo /ideia e "execute tudo"
 * pelo /trabalhar).
 *
 * Duas diferenças em relação à análise (T-012), que é o outro fluxo por projeto:
 *
 * 1. **`cwd` é a RAIZ DA FÁBRICA, não a pasta do projeto** — e é o ponto central do
 *    desenho. Os `.claude/agents/` vivem na raiz; rodando de lá, o fluxo DESPACHA o
 *    agente de verdade (`executor`, `revisor`, …). Rodar dentro do projeto obrigaria a
 *    recopiar a definição de cada agente dentro do prompt, criando uma segunda fonte de
 *    verdade do que é um "documentador" — que sai de sincronia no primeiro ajuste feito
 *    em `.claude/agents/`.
 * 2. Em troca, o **confinamento passa a ser explícito no texto** do despacho (caminho
 *    absoluto + proibição de sair dele), do jeito que o "Modelo de despacho" do CLAUDE.md
 *    da raiz já manda — na análise ele vinha de graça pelo `cwd`.
 *
 * Catálogo data-driven, no mesmo espírito de `catalogo-acoes.ts` e da tabela de
 * guardrails: ação nova = uma entrada aqui + um arquivo em `prompts/projeto/<id>.md`.
 */

/** Quão "pesado" o fluxo tende a ser — alimenta a estimativa de custo na UI. */
export type PesoAcao = "leve" | "medio" | "pesado";

/**
 * Duas famílias, porque respondem a perguntas diferentes e a UI as separa:
 * `especialista` = um agente da fábrica faz um serviço; `cuidado` = zeladoria do próprio
 * projeto, feita pelo orquestrador (o que antes só existia para a fábrica inteira).
 */
export type GrupoAcaoProjeto = "especialista" | "cuidado";

export interface AcaoProjeto {
  id: string;
  grupo: GrupoAcaoProjeto;
  /** Rótulo do botão na página do projeto. */
  rotulo: string;
  /** Uma frase dizendo o que sai disso, na língua do usuário (não a do código). */
  resumo: string;
  /**
   * Agente da fábrica que o fluxo despacha (documental: quem manda é o prompt).
   * `orquestrador` quando não há especialista — o próprio fluxo faz o trabalho.
   */
  agente: string;
  peso: PesoAcao;
  /**
   * Quando definido, a UI pede um texto e ele entra no prompt como `$ENTRADA`.
   * `obrigatoria` mora AQUI, e não numa comparação por id espalhada pela rota e pela UI:
   * regra duplicada em dois lugares é regra que diverge no próximo ajuste.
   */
  entrada: { rotulo: string; placeholder: string; obrigatoria: boolean } | null;
}

/**
 * As cinco de especialista (T-033) e as duas de cuidado do projeto (T-034). O `peso`
 * reflete o tamanho típico do fluxo, não o risco: `revisar` e `testar` rodam software de
 * verdade, mas nem por isso custam mais que um replanejamento.
 */
export const ACOES_PROJETO: readonly AcaoProjeto[] = [
  {
    id: "documentar",
    grupo: "especialista",
    rotulo: "Documentar",
    resumo:
      "O documentador atualiza README, CLAUDE.md e PROGRESSO.md para refletirem o código como ele está hoje.",
    agente: "documentador",
    peso: "medio",
    entrada: null,
  },
  {
    id: "pesquisar",
    grupo: "especialista",
    rotulo: "Pesquisar",
    resumo:
      "O pesquisador investiga na web e entrega um relatório com recomendação em _gestao/pesquisas/. Não altera código.",
    agente: "pesquisador",
    peso: "medio",
    entrada: {
      rotulo: "O que você precisa saber antes de decidir?",
      placeholder:
        "Ex.: qual biblioteca de gráficos usar com React 18; o SQLite aguenta o volume previsto; como autenticar na API do Spotify",
      // Sem pergunta, o pesquisador inventaria o próprio objetivo.
      obrigatoria: true,
    },
  },
  {
    id: "revisar",
    grupo: "especialista",
    rotulo: "Revisar código",
    resumo:
      "O revisor caça bugs reais (correção, segurança, casos de borda) no que entrou por último. Aponta, não corrige.",
    agente: "revisor",
    peso: "medio",
    entrada: null,
  },
  {
    id: "replanejar",
    grupo: "especialista",
    rotulo: "Replanejar",
    resumo:
      "O planejador reescreve a abordagem do que está travado e quebra em tarefas novas. Não escreve código.",
    agente: "planejador",
    peso: "pesado",
    entrada: {
      rotulo: "O que replanejar? (opcional)",
      placeholder:
        "Ex.: as tarefas bloqueadas; a fase 2 inteira; deixe vazio para o planejador decidir pelo estado atual",
      // Vazio é legítimo: o planejador decide pelo estado atual do projeto.
      obrigatoria: false,
    },
  },
  {
    id: "testar",
    grupo: "especialista",
    rotulo: "Testar",
    resumo:
      "O testador roda o software de verdade e confere os critérios de aceite. Aprova ou reprova com relatório.",
    agente: "testador",
    peso: "medio",
    entrada: null,
  },

  /**
   * As duas da T-034: o que só existia para a fábrica inteira (`/manutencao` e
   * `/encerrar-dia`, os únicos comandos sem `argument-hint`), agora com escopo de UM
   * projeto. Aqui não há especialista a despachar — é o próprio orquestrador que faz.
   */
  {
    id: "conferir",
    grupo: "cuidado",
    rotulo: "Conferir integridade",
    resumo:
      "Valida as tarefas, o plano e o git DESTE projeto. Corrige o que é mecânico e reporta o que exige sua decisão.",
    agente: "orquestrador",
    peso: "medio",
    entrada: null,
  },
  {
    id: "progresso",
    grupo: "cuidado",
    rotulo: "Atualizar progresso",
    resumo:
      "Consolida o PROGRESSO.md do projeto com o que de fato aconteceu e deixa o próximo passo explícito.",
    agente: "orquestrador",
    peso: "medio",
    entrada: null,
  },
] as const;

/** Ação do catálogo pelo id, ou null se não existe. */
export function acaoProjetoPorId(id: string): AcaoProjeto | null {
  return ACOES_PROJETO.find((a) => a.id === id) ?? null;
}

/** Ação de projeto desconhecida — a rota traduz para 404. */
export class ErroAcaoProjetoDesconhecida extends Error {
  constructor(id: string) {
    super(`Ação de projeto desconhecida: "${id}"`);
    this.name = "ErroAcaoProjetoDesconhecida";
  }
}

export interface OpcoesAcaoProjeto {
  /** Modelo primário (alias) já resolvido da estratégia. */
  modelo: string;
  /** Fallback (alias) já resolvido; ausente/null = sem fallback. */
  fallback?: string | null;
  /** Texto livre do usuário, para as ações que pedem entrada. */
  entrada?: string;
  /** Guarda de custo; ausente = o guardrail da ação. */
  maxTurns?: number;
}

/** Prompt versionado da ação. Lança se sumir (erro de instalação, não de uso). */
export async function lerPromptProjeto(
  id: string,
  raizPainel: string = config.raizPainel,
): Promise<string> {
  return readFile(join(raizPainel, "servidor", "src", "acoes", "prompts", "projeto", `${id}.md`), "utf8");
}

/**
 * Monta o job "claude" de uma ação de agente sobre um projeto.
 *
 * Lock `projeto:<nome>` (igual à análise): trava só aquele projeto, então ações de
 * projetos diferentes rodam em paralelo e duas do mesmo projeto se enfileiram — que é o
 * comportamento certo, porque elas mexem na mesma árvore de trabalho.
 */
export async function montarJobAcaoProjeto(
  idAcao: string,
  projeto: string,
  fabricaRaiz: string,
  opcoes: OpcoesAcaoProjeto,
): Promise<NovoJob> {
  const acao = acaoProjetoPorId(idAcao);
  if (acao === null) throw new ErroAcaoProjetoDesconhecida(idAcao);

  // Valida o projeto ANTES de qualquer outra coisa: barra travessia de caminho e
  // projeto inexistente (mesma guarda da análise, deliberadamente reusada).
  const dir = dirProjeto(fabricaRaiz, projeto);
  if (dir === null) throw new ErroProjetoInexistente(projeto);

  const modelo = await lerPromptProjeto(idAcao);
  const prompt = montarDespacho(modelo, { projeto, dirProjeto: dir, entrada: opcoes.entrada ?? "" });

  const maxTurns = opcoes.maxTurns ?? guardrailsParaAcao(`projeto:${idAcao}`).maxTurns;

  return {
    tipo: "claude",
    titulo: `${acao.rotulo} — ${projeto}`,
    escopo: `projeto:${projeto}`,
    usaClaude: true,
    params: {
      prompt,
      // Raiz da fábrica: é onde estão os `.claude/agents/` que o fluxo vai despachar.
      cwd: fabricaRaiz,
      modelo: opcoes.modelo,
      ...(opcoes.fallback ? { fallback: opcoes.fallback } : {}),
      maxTurns,
    },
  };
}

/**
 * Substitui os marcadores do prompt versionado. Substituição literal (nada de regex com o
 * valor do usuário), e `$ENTRADA` some quando não há texto — deixar o marcador cru no
 * prompt faria o agente tratar a palavra "$ENTRADA" como parte do pedido.
 */
export function montarDespacho(
  modelo: string,
  valores: { projeto: string; dirProjeto: string; entrada: string },
): string {
  return modelo
    .split("$PROJETO")
    .join(valores.projeto)
    .split("$DIR_PROJETO")
    .join(valores.dirProjeto)
    .split("$ENTRADA")
    .join(valores.entrada.trim());
}
