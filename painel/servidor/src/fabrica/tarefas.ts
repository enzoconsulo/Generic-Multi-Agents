import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  campoLista,
  campoTexto,
  normalizarData,
  separarFrontmatter,
} from "./frontmatter.js";
import {
  PRIORIDADES_TAREFA,
  STATUS_TAREFA,
  type ContagemPorStatus,
  type SecoesTarefa,
  type StatusTarefa,
  type TarefaCompleta,
  type TarefaResumo,
} from "./tipos.js";

/** Lê todas as tarefas (T-*.md) de uma pasta `_gestao/tarefas/`. Pasta ausente = lista
 *  vazia (o erro de _gestao/ é reportado no nível do projeto, não aqui). */
export async function lerTarefas(dirTarefas: string): Promise<TarefaCompleta[]> {
  let nomes: string[];
  try {
    nomes = await readdir(dirTarefas);
  } catch {
    return [];
  }
  const arquivos = nomes.filter((nome) => /^T-\d+.*\.md$/i.test(nome)).sort();
  const tarefas: TarefaCompleta[] = [];
  for (const nome of arquivos) {
    const texto = await readFile(join(dirTarefas, nome), "utf8");
    tarefas.push(parsearTarefa(nome, texto));
  }
  return tarefas;
}

/** Transforma o texto de um arquivo de tarefa em dados tipados. Nunca lança:
 *  qualquer problema vira entrada em `erros` e os campos ganham fallbacks. */
export function parsearTarefa(arquivo: string, texto: string): TarefaCompleta {
  const erros: string[] = [];
  const { dados, corpo, erro } = separarFrontmatter(texto);
  if (erro !== null) erros.push(erro);

  const idDoNome = arquivo.match(/^T-\d+/)?.[0] ?? "";

  const id = lerTextoObrigatorio(dados, "id", erros) ?? idDoNome;
  const titulo = lerTextoObrigatorio(dados, "titulo", erros) ?? "";

  const status = lerTextoObrigatorio(dados, "status", erros) ?? "";
  if (status !== "" && !(STATUS_TAREFA as readonly string[]).includes(status)) {
    erros.push(`status desconhecido: "${status}"`);
  }

  const prioridade = lerTextoObrigatorio(dados, "prioridade", erros) ?? "";
  if (prioridade !== "" && !(PRIORIDADES_TAREFA as readonly string[]).includes(prioridade)) {
    erros.push(`prioridade desconhecida: "${prioridade}"`);
  }

  const dependencias = lerLista(dados, "dependencias", erros);
  const areas = lerLista(dados, "areas", erros);

  let tentativas = 0;
  const tentativasBruto = dados["tentativas"];
  if (
    typeof tentativasBruto === "number" &&
    Number.isInteger(tentativasBruto) &&
    tentativasBruto >= 0
  ) {
    tentativas = tentativasBruto;
  } else {
    erros.push("campo tentativas ausente ou inválido");
  }

  const criada = lerData(dados, "criada", erros);
  const atualizada = lerData(dados, "atualizada", erros);

  // Opcionais: só são validados (e reportados) quando o campo existe no frontmatter.
  let replanejadaDe: string | null = null;
  if (dados["replanejada-de"] !== undefined) {
    replanejadaDe = campoTexto(dados["replanejada-de"]);
    if (replanejadaDe === null) erros.push("campo replanejada-de inválido");
  }

  let agente: string | null = null;
  if (dados["agente"] !== undefined) {
    agente = campoTexto(dados["agente"]);
    if (agente === null) erros.push("campo agente inválido");
  }

  return {
    arquivo,
    id,
    titulo,
    status,
    prioridade,
    dependencias,
    areas,
    tentativas,
    replanejadaDe,
    agente,
    criada,
    atualizada,
    erros,
    secoes: parsearSecoes(corpo),
  };
}

/** Quebra o corpo da tarefa nas seções do protocolo (títulos `## `). Comparação sem
 *  acentos/caixa para tolerar variações; seção ausente fica string vazia. */
export function parsearSecoes(corpo: string): SecoesTarefa {
  const mapa: Record<string, keyof SecoesTarefa> = {
    objetivo: "objetivo",
    contexto: "contexto",
    "criterios de aceite": "criteriosAceite",
    "notas de execucao": "notasExecucao",
    verificacao: "verificacao",
    revisao: "revisao",
  };
  const secoes: SecoesTarefa = {
    objetivo: "",
    contexto: "",
    criteriosAceite: "",
    notasExecucao: "",
    verificacao: "",
    revisao: "",
  };

  let atual: keyof SecoesTarefa | null = null;
  let acumulado: string[] = [];
  const despejar = (): void => {
    if (atual !== null) secoes[atual] = acumulado.join("\n").trim();
    acumulado = [];
  };

  for (const linha of corpo.split(/\r?\n/)) {
    const titulo = /^##\s+(.+)$/.exec(linha)?.[1];
    if (titulo !== undefined) {
      despejar();
      atual = mapa[normalizarTitulo(titulo)] ?? null;
    } else if (atual !== null) {
      acumulado.push(linha);
    }
  }
  despejar();
  return secoes;
}

/** Contagem por status do protocolo; status fora do vocabulário fica de fora
 *  (sinalizado em `erros` da tarefa). */
export function contarPorStatus(tarefas: readonly TarefaResumo[]): ContagemPorStatus {
  const contagem = Object.fromEntries(
    STATUS_TAREFA.map((status) => [status, 0]),
  ) as ContagemPorStatus;
  for (const tarefa of tarefas) {
    if ((STATUS_TAREFA as readonly string[]).includes(tarefa.status)) {
      contagem[tarefa.status as StatusTarefa] += 1;
    }
  }
  return contagem;
}

function lerTextoObrigatorio(
  dados: Record<string, unknown>,
  campo: string,
  erros: string[],
): string | null {
  const valor = campoTexto(dados[campo]);
  if (valor === null) erros.push(`campo ${campo} ausente ou inválido`);
  return valor;
}

function lerLista(
  dados: Record<string, unknown>,
  campo: string,
  erros: string[],
): string[] {
  const valor = campoLista(dados[campo]);
  if (valor === null) {
    erros.push(`campo ${campo} ausente ou inválido (esperava lista)`);
    return [];
  }
  return valor;
}

function lerData(
  dados: Record<string, unknown>,
  campo: string,
  erros: string[],
): string | null {
  const valor = normalizarData(dados[campo]);
  if (valor === null) erros.push(`campo ${campo} ausente ou inválido (esperava AAAA-MM-DD)`);
  return valor;
}

function normalizarTitulo(titulo: string): string {
  // NFD separa os diacríticos em code points próprios (faixa 0x0300–0x036F),
  // que são então descartados — comparação fica imune a acento e caixa.
  const decomposto = titulo.trim().toLowerCase().normalize("NFD");
  let resultado = "";
  for (const caractere of decomposto) {
    const codigo = caractere.codePointAt(0) ?? 0;
    if (codigo < 0x0300 || codigo > 0x036f) resultado += caractere;
  }
  return resultado;
}
