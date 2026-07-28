import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { dirProjeto } from "../acoes/analise.js";

/**
 * ESCRITA da equipe do projeto (T-035) — `projetos/<nome>/_gestao/equipe.json`.
 *
 * Quarta exceção deliberada à regra "o painel nunca escreve nos arquivos da fábrica",
 * junto de `ANALISE.md`, `ci.json` e a importação de projetos. Está registrada em
 * DECISOES.md e no CLAUDE.md do painel — exceção não escrita é como a regra vira letra
 * morta por acúmulo.
 *
 * As regras de validação são AS MESMAS da leitura (`fabrica/equipe.ts`), de propósito:
 * validação escrita duas vezes com regras diferentes é como um arquivo passa na gravação
 * e é rejeitado na leitura seguinte, deixando o projeto com uma equipe que não carrega.
 */

export class ErroEquipe extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
    readonly problemas: string[] = [],
  ) {
    super(mensagem);
    this.name = "ErroEquipe";
  }
}

/** Um agente como ele chega da web (antes de validar). */
export interface AgenteEntrada {
  id?: unknown;
  nome?: unknown;
  descricao?: unknown;
  prompt?: unknown;
  ferramentas?: unknown;
}

/** Agente já validado, no formato exato que `equipe.json` guarda. */
export interface AgenteGravavel {
  id: string;
  nome: string;
  descricao: string;
  prompt: string;
  ferramentas?: string[];
}

const ID_VALIDO = /^[a-z0-9-]+$/;

/**
 * Valida a lista inteira e devolve os agentes prontos para gravar, ou a lista de
 * problemas. Valida TUDO antes de decidir (não para no primeiro erro): quem está
 * editando cinco agentes na tela precisa ver os cinco problemas de uma vez, não
 * descobrir um por vez a cada tentativa de salvar.
 */
export function validarEquipe(bruto: unknown): { agentes: AgenteGravavel[]; problemas: string[] } {
  const problemas: string[] = [];

  if (!Array.isArray(bruto)) {
    return { agentes: [], problemas: ["O campo `agentes` precisa ser uma lista."] };
  }

  const agentes: AgenteGravavel[] = [];
  const idsVistos = new Set<string>();

  bruto.forEach((item, i) => {
    const bruta = (item ?? {}) as AgenteEntrada;
    const posicao = `agente ${i + 1}`;

    const id = typeof bruta.id === "string" ? bruta.id.trim() : "";
    const prompt = typeof bruta.prompt === "string" ? bruta.prompt : "";

    if (id === "") {
      problemas.push(`${posicao}: falta o \`id\`.`);
    } else if (!ID_VALIDO.test(id)) {
      problemas.push(`${posicao}: id "${id}" inválido — use minúsculas, números e hífen.`);
    } else if (idsVistos.has(id)) {
      problemas.push(`${posicao}: id "${id}" está duplicado.`);
    }
    if (id !== "") idsVistos.add(id);

    // Sem prompt o agente é carregado e IGNORADO pelo injetor — falha silenciosa, que é
    // pior que erro na cara. Por isso é bloqueio de gravação, não aviso.
    if (prompt.trim() === "") {
      problemas.push(`${posicao}${id !== "" ? ` (${id})` : ""}: falta o \`prompt\`.`);
    }

    let ferramentas: string[] | undefined;
    if (bruta.ferramentas !== undefined && bruta.ferramentas !== null) {
      if (!Array.isArray(bruta.ferramentas) || bruta.ferramentas.some((f) => typeof f !== "string")) {
        problemas.push(`${posicao}: \`ferramentas\` precisa ser uma lista de textos.`);
      } else {
        ferramentas = (bruta.ferramentas as string[]).map((f) => f.trim()).filter((f) => f !== "");
      }
    }

    const nome = typeof bruta.nome === "string" && bruta.nome.trim() !== "" ? bruta.nome.trim() : id;
    const descricao = typeof bruta.descricao === "string" ? bruta.descricao.trim() : "";

    agentes.push({
      id,
      nome,
      descricao,
      prompt,
      ...(ferramentas !== undefined ? { ferramentas } : {}),
    });
  });

  return { agentes, problemas };
}

/**
 * Grava `equipe.json` do projeto. Lança `ErroEquipe` com 404 (projeto inexistente ou nome
 * com travessia) ou 400 (validação).
 *
 * Lista VAZIA é gravação legítima: significa "este projeto volta a usar o executor
 * genérico". Apagar o arquivo daria o mesmo efeito, mas escrever `[]` deixa explícito que
 * foi uma decisão, e não um arquivo que se perdeu.
 */
export async function gravarEquipe(
  fabricaRaiz: string,
  projeto: string,
  bruto: unknown,
): Promise<AgenteGravavel[]> {
  const dir = dirProjeto(fabricaRaiz, projeto);
  if (dir === null) throw new ErroEquipe(404, `Projeto não encontrado: "${projeto}"`);

  const { agentes, problemas } = validarEquipe(bruto);
  if (problemas.length > 0) {
    throw new ErroEquipe(400, "A equipe tem problemas que impedem a gravação.", problemas);
  }

  const caminho = join(dir, "_gestao", "equipe.json");
  // `_gestao/` pode não existir: pasta clonada à mão é projeto válido para o leitor.
  // Isso já derrubou a config de CI com ENOENT/500 — armadilha registrada no CLAUDE.md.
  await mkdir(dirname(caminho), { recursive: true });
  await writeFile(caminho, `${JSON.stringify({ agentes }, null, 2)}\n`, "utf8");
  return agentes;
}
