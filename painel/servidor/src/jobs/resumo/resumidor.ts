import type { Consulta } from "../claude/runner-claude.js";
import { consultaReal } from "../claude/runner-claude.js";
import type { TrechoFechado } from "./segmentos.js";

/**
 * Resumidor de trecho (T-039): transforma a fala de um agente em 2 linhas + tópicos.
 *
 * **Haiku fixo, e é decisão de custo.** Resumir é mecânico, e o volume aqui é o maior do
 * painel (um por trecho, vários por job) — é exatamente onde um modelo caro escalaria a
 * conta sem melhorar nada. Mesma lógica que já pôs o testador em haiku.
 *
 * O modo de falha que interessa evitar é resumo que INVENTA. O prompt manda devolver
 * `naoDeu` em vez de preencher, e quem consome cai no texto cru nesse caso — um resumo
 * errado é pior que nenhum, porque o usuário passa a confiar nele em vez de abrir o texto.
 */

export const MODELO_RESUMO = "haiku";

export interface ItemResumo {
  /** `feito` = entregue; `atencao` = ressalva, pendência ou coisa que ficou de fora. */
  tipo: "feito" | "atencao";
  texto: string;
}

export interface Resumo {
  /** Índice do trecho dentro do job. */
  indice: number;
  agente: string | null;
  /** Até 2 frases curtas, em prosa. */
  linhas: string[];
  itens: ItemResumo[];
  custoUsd: number | null;
  /** Quando true, não houve resumo utilizável — a UI mostra o texto cru. */
  naoDeu: boolean;
}

const PROMPT = `Você resume a saída de UM agente de uma fábrica de software para uma
interface. Quem lê NÃO quer ler o texto original — quer entender em 5 segundos.

Responda SOMENTE com um objeto JSON, sem cercas de código, neste formato:
{"linhas": ["...", "..."], "itens": [{"tipo": "feito", "texto": "..."}]}

Regras:
- "linhas": no máximo 2 frases, curtas, em português (BR), dizendo o que o agente FEZ e o
  achado mais importante. Sem preâmbulo ("o agente relatou que..."), direto ao fato.
- "itens": no máximo 5. Cada texto com no máximo 60 caracteres.
  - "feito": o que foi entregue OU um fato já resolvido. Ex.: "README criado",
    "marco da Fase 1 aprovado", "15/15 testes passaram".
  - "atencao": SÓ o que exige ação ou deu errado. Ex.: "how_to_use ficou de fora",
    "3 testes falharam", "sem suíte automatizada".
  - Na dúvida use "feito". Marcar status neutro como atenção transforma o cartão num
    campo de alertas e o usuário para de distinguir o que importa.
- Cite nomes concretos que aparecem no original (arquivos, tarefas, números). Sem eles o
  resumo vira genérico e inútil.
- **NUNCA invente.** Se o texto não permitir um resumo fiel, responda exatamente
  {"naoDeu": true}. Resumo inventado é pior que resumo nenhum.

Texto do agente a resumir:
---
`;

/** Corta o texto que vai ao resumidor: o custo é por token e o começo/fim carregam o sentido. */
export function recortar(texto: string, teto = 12000): string {
  if (texto.length <= teto) return texto;
  const meio = Math.floor(teto / 2);
  return `${texto.slice(0, meio)}\n\n[…trecho longo, meio omitido…]\n\n${texto.slice(-meio)}`;
}

/**
 * Extrai o JSON da resposta do modelo. Tolerante de propósito: modelo barato às vezes
 * embrulha em cercas de código ou fala antes do objeto, e derrubar o resumo por isso
 * seria trocar um problema cosmético por uma funcionalidade quebrada.
 */
export function extrairJson(bruto: string): unknown | null {
  const semCercas = bruto.replace(/```(?:json)?/gi, "").trim();
    const inicio = semCercas.indexOf("{");
  const fim = semCercas.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  try {
    return JSON.parse(semCercas.slice(inicio, fim + 1));
  } catch {
    return null;
  }
}

/** Valida e normaliza o que o modelo devolveu. Nunca lança. */
export function normalizar(dados: unknown, indice: number, agente: string | null): Resumo {
  const vazio: Resumo = { indice, agente, linhas: [], itens: [], custoUsd: null, naoDeu: true };
  if (dados === null || typeof dados !== "object") return vazio;
  const obj = dados as Record<string, unknown>;
  if (obj["naoDeu"] === true) return vazio;

  const linhas = Array.isArray(obj["linhas"])
    ? obj["linhas"].filter((l): l is string => typeof l === "string" && l.trim() !== "").slice(0, 2)
    : [];
  const itens = Array.isArray(obj["itens"])
    ? obj["itens"]
        .map((i) => {
          const item = (i ?? {}) as Record<string, unknown>;
          const texto = typeof item["texto"] === "string" ? item["texto"].trim() : "";
          const tipo = item["tipo"] === "atencao" ? "atencao" : "feito";
          return texto === "" ? null : ({ tipo, texto } as ItemResumo);
        })
        .filter((i): i is ItemResumo => i !== null)
        .slice(0, 5)
    : [];

  // Sem nenhuma linha o cartão não diz nada — cai no texto cru em vez de mostrar vazio.
  if (linhas.length === 0) return vazio;
  return { indice, agente, linhas, itens, custoUsd: null, naoDeu: false };
}

/**
 * Resume um trecho. Nunca lança: qualquer falha (SDK fora, JSON ruim, modelo tagarela)
 * vira `naoDeu: true` e a UI mostra o texto cru — o console não pode quebrar porque o
 * resumo falhou.
 */
export async function resumirTrecho(
  trecho: TrechoFechado,
  consulta: Consulta = consultaReal,
): Promise<Resumo> {
  const falha: Resumo = {
    indice: trecho.indice,
    agente: trecho.agente,
    linhas: [],
    itens: [],
    custoUsd: null,
    naoDeu: true,
  };

  try {
    const iter = consulta({
      prompt: `${PROMPT}${recortar(trecho.texto)}\n---`,
      options: {
        model: MODELO_RESUMO,
        maxTurns: 1,
        // Resumir é uma pergunta, não uma tarefa agêntica: sem ferramentas, o modelo não
        // tem como sair lendo arquivo nem gastar turno à toa.
        //
        // `tools: []` é o que REMOVE as ferramentas — `allowedTools: []` só diz que
        // nenhuma é auto-aprovada, e as definições continuam ocupando o contexto (as do
        // Claude Code são grandes). Confundir os dois foi o que manteve o resumo caro
        // depois da primeira rodada de corte.
        tools: [],
        allowedTools: [],
        // Thinking é ligado por padrão e aqui é gasto puro: medido, respondia com ~549
        // tokens de saída para um JSON que cabe em ~160. Resumir texto que já existe é
        // mecânico — não há o que raciocinar. Cortou o custo pela metade sem mudar a
        // qualidade do resumo (conferido em job real).
        thinking: { type: "disabled" },
        // As DUAS linhas abaixo são o que torna o resumo barato — sem elas, cada resumo
        // custava ~US$0,05 (medido), mais que o dobro do que a tarefa inteira deveria
        // gastar em resumos. O SDK monta um agente de codificação por padrão:
        //  - `settingSources` omitido carrega TODOS os settings do disco, e o do projeto
        //    arrasta os CLAUDE.md — aqui, os da fábrica e do painel, inteiros, para
        //    resumir duas linhas. `[]` desliga isso.
        //  - `systemPrompt` omitido usa o preset do Claude Code, que é enorme. Uma string
        //    própria o substitui pelo mínimo que a tarefa precisa.
        settingSources: [],
        systemPrompt:
          "Você resume texto em JSON. Responda apenas com o JSON pedido, sem comentários.",
        cwd: process.cwd(),
      },
    });

    let texto = "";
    let custoUsd: number | null = null;
    for await (const bruto of iter) {
      const msg = bruto as {
        type?: string;
        message?: { content?: { type?: string; text?: string }[] };
        result?: unknown;
        total_cost_usd?: unknown;
      };
      if (msg.type === "assistant") {
        for (const bloco of msg.message?.content ?? []) {
          if (bloco.type === "text" && typeof bloco.text === "string") texto += bloco.text;
        }
      } else if (msg.type === "result") {
        if (typeof msg.result === "string" && msg.result !== "") texto = msg.result;
        if (typeof msg.total_cost_usd === "number") custoUsd = msg.total_cost_usd;
      }
    }

    const resumo = normalizar(extrairJson(texto), trecho.indice, trecho.agente);
    return { ...resumo, custoUsd };
  } catch {
    return falha;
  }
}
