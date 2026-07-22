import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { campoTexto, separarFrontmatter } from "./frontmatter.js";

/**
 * Catálogo das 6 ações globais da fábrica (/novo-projeto, /ideia, /trabalhar, /status,
 * /encerrar-dia, /manutencao).
 *
 * Fonte única de verdade das descrições: o frontmatter (`description`, `argument-hint`)
 * dos arquivos REAIS `.claude/commands/<id>.md` da raiz da fábrica, lidos NA HORA de
 * cada chamada (nunca cacheados — se o comando mudar, o painel reflete na próxima
 * consulta). Arquivo ausente, ilegível ou com frontmatter inválido → fallback em PT-BR;
 * este módulo nunca lança.
 *
 * `disponivel: true` desde a T-011 (Fase 2): os endpoints de disparo (`POST /api/acoes/:id`)
 * existem e a UI pode executar as ações.
 */

export const IDS_ACOES = [
  "novo-projeto",
  "ideia",
  "trabalhar",
  "status",
  "encerrar-dia",
  "manutencao",
] as const;
export type IdAcao = (typeof IDS_ACOES)[number];

export interface AcaoFabrica {
  /** Identificador estável (nome do comando sem a barra), ex.: "novo-projeto". */
  id: IdAcao;
  /** Nome exibível do comando, com a barra: "/novo-projeto". */
  nome: string;
  descricao: string;
  /** Dica dos argumentos esperados (`argument-hint`); null = ação sem argumentos. */
  argumentos: string | null;
  /** false até existirem os endpoints de disparo (T-011). */
  disponivel: boolean;
}

/** Fallbacks em PT-BR usados quando `.claude/commands/<id>.md` falta ou está quebrado. */
const FALLBACKS: Record<IdAcao, { descricao: string; argumentos: string | null }> = {
  "novo-projeto": {
    descricao:
      "Cria um projeto novo em projetos/<nome> com git, especificação, plano e backlog de tarefas",
    argumentos: "<nome-do-projeto> — <descrição da ideia>",
  },
  ideia: {
    descricao:
      "Registra uma ideia na caixa de entrada e a converte em tarefas (projeto existente) ou em proposta de projeto novo",
    argumentos: "<texto da ideia> (opcionalmente citando o projeto)",
  },
  trabalhar: {
    descricao:
      "Loop principal da fábrica — executa o pipeline completo (executor → testador → revisor) em todas as tarefas prontas, sem intervenção",
    argumentos: "[nome-do-projeto] (vazio = todos os projetos)",
  },
  status: {
    descricao: "Painel do estado atual — projetos, tarefas por status, bloqueios e próximos passos",
    argumentos: "[nome-do-projeto] (vazio = todos)",
  },
  "encerrar-dia": {
    descricao:
      "Fecha o expediente — consolida o log diário, atualiza o progresso dos projetos e prepara o dia seguinte",
    argumentos: null,
  },
  manutencao: {
    descricao:
      "Checagem de integridade da fábrica — valida tarefas, git e estrutura; corrige o que é seguro e reporta o resto",
    argumentos: null,
  },
};

/**
 * Monta o catálogo lendo `.claude/commands/*.md` da raiz da fábrica informada.
 * Arquivo presente e parseado é a fonte dos DOIS campos: `description` (se vier vazio,
 * mantém a descrição de fallback — card sem texto é UI quebrada) e `argument-hint`
 * (ausente = ação sem argumentos → null). Arquivo ausente/ilegível, ou cujo frontmatter
 * não renda nem uma linha `description:` → fallback inteiro.
 *
 * YAML inválido NÃO derruba a leitura: comandos reais da fábrica trazem valores como
 * `argument-hint: [nome-do-projeto] (vazio = todos)` que o js-yaml rejeita, mas o
 * consumidor real (Claude Code) aceita — nesse caso os campos são recuperados linha a
 * linha do bloco de frontmatter, preservando o texto literal do arquivo.
 */
export async function catalogoAcoes(raiz: string): Promise<AcaoFabrica[]> {
  return Promise.all(
    IDS_ACOES.map(async (id): Promise<AcaoFabrica> => {
      const fallback = FALLBACKS[id];
      let descricao = fallback.descricao;
      let argumentos = fallback.argumentos;

      const texto = await lerTextoOpcional(join(raiz, ".claude", "commands", `${id}.md`));
      if (texto !== null) {
        const { dados, erro } = separarFrontmatter(texto);
        if (erro === null) {
          descricao = campoTexto(dados.description) ?? fallback.descricao;
          argumentos = campoTexto(dados["argument-hint"]);
        } else {
          const campos = extrairCamposTolerante(texto);
          const descricaoDoArquivo = campos?.description;
          if (descricaoDoArquivo !== undefined && descricaoDoArquivo !== "") {
            descricao = descricaoDoArquivo;
            const hint = campos?.["argument-hint"];
            argumentos = hint !== undefined && hint !== "" ? hint : null;
          }
          // Sem linha description aproveitável: frontmatter é lixo → fallback inteiro.
        }
      }

      return { id, nome: `/${id}`, descricao, argumentos, disponivel: true };
    }),
  );
}

/**
 * Extração tolerante dos campos do frontmatter quando o YAML falha: pega as linhas
 * `chave: valor` entre as cercas `---`, com o valor como TEXTO LITERAL (trim).
 * Retorna null se o texto nem tem um bloco de frontmatter fechado.
 */
function extrairCamposTolerante(texto: string): Record<string, string> | null {
  const linhas = texto.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (linhas[0]?.trim() !== "---") return null;

  const campos: Record<string, string> = {};
  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i] ?? "";
    if (linha.trim() === "---") return campos;
    const par = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(linha);
    if (par !== null && par[1] !== undefined) campos[par[1]] = (par[2] ?? "").trim();
  }
  return null; // cerca de fechamento ausente: não é frontmatter
}

async function lerTextoOpcional(caminho: string): Promise<string | null> {
  try {
    return await readFile(caminho, "utf8");
  } catch {
    return null;
  }
}
