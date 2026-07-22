import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { faseAtualDoPlano, parsearPlano } from "./plano.js";
import { contarPorStatus, lerTarefas } from "./tarefas.js";
import { lerIdeias, lerLogMaisRecente } from "./sistema.js";
import type {
  ContagemPorStatus,
  EstadoFabrica,
  FaseAtual,
  Plano,
  ProjetoDetalhe,
  ProjetoResumo,
  TarefaCompleta,
} from "./tipos.js";

/**
 * Visão geral da fábrica: todos os projetos (resumo com tarefas, contagem por status e
 * fase atual), ideias da caixa de entrada e o log diário mais recente.
 * Somente leitura; item malformado aparece com `erros` preenchido, nunca derruba o scan.
 */
export async function lerFabrica(raiz: string): Promise<EstadoFabrica> {
  const erros: string[] = [];
  const nomes = await listarProjetos(raiz, erros);

  const projetos: ProjetoResumo[] = [];
  for (const nome of nomes) {
    const base = await lerBaseProjeto(raiz, nome);
    projetos.push({
      nome,
      // Resumo não carrega o corpo das tarefas (isso é papel do lerProjeto).
      tarefas: base.tarefas.map(({ secoes: _secoes, ...resumo }) => resumo),
      contagemPorStatus: base.contagemPorStatus,
      faseAtual: base.faseAtual,
      erros: base.erros,
    });
  }

  const [ideias, logMaisRecente] = await Promise.all([
    lerIdeias(raiz),
    lerLogMaisRecente(raiz),
  ]);

  return { projetos, ideias, logMaisRecente, erros };
}

/**
 * Visão completa de um projeto: tarefas com corpo (seções), plano inteiro, e textos de
 * DECISOES.md, PROGRESSO.md e ANALISE.md (null quando o arquivo não existe).
 * Projeto inexistente (ou nome com separador de caminho) → null, sem exceção.
 */
export async function lerProjeto(raiz: string, nome: string): Promise<ProjetoDetalhe | null> {
  if (!nomeDeProjetoValido(nome)) return null;
  if (!(await ehDiretorio(join(raiz, "projetos", nome)))) return null;

  const base = await lerBaseProjeto(raiz, nome);
  const dirGestao = join(raiz, "projetos", nome, "_gestao");
  const [decisoes, progresso, analise] = await Promise.all([
    lerTextoOpcional(join(dirGestao, "DECISOES.md")),
    lerTextoOpcional(join(dirGestao, "PROGRESSO.md")),
    lerTextoOpcional(join(dirGestao, "ANALISE.md")),
  ]);

  return {
    nome,
    tarefas: base.tarefas,
    contagemPorStatus: base.contagemPorStatus,
    faseAtual: base.faseAtual,
    plano: base.plano,
    decisoes,
    progresso,
    analise,
    erros: base.erros,
  };
}

interface BaseProjeto {
  tarefas: TarefaCompleta[];
  contagemPorStatus: ContagemPorStatus;
  faseAtual: FaseAtual | null;
  plano: Plano | null;
  erros: string[];
}

/** Leitura comum a resumo e detalhe: tarefas + plano + derivados. */
async function lerBaseProjeto(raiz: string, nome: string): Promise<BaseProjeto> {
  const erros: string[] = [];
  const dirGestao = join(raiz, "projetos", nome, "_gestao");

  const temGestao = await ehDiretorio(dirGestao);
  if (!temGestao) erros.push("projeto sem pasta _gestao/");

  const tarefas = await lerTarefas(join(dirGestao, "tarefas"));

  let plano: Plano | null = null;
  const textoPlano = await lerTextoOpcional(join(dirGestao, "PLANO.md"));
  if (textoPlano !== null) {
    plano = parsearPlano(textoPlano);
    // Problemas estruturais do plano sobem para o projeto (o resumo não carrega o plano).
    erros.push(...plano.erros.map((problema) => `PLANO.md: ${problema}`));
  } else if (temGestao) {
    erros.push("PLANO.md ausente em _gestao/");
  }

  return {
    tarefas,
    contagemPorStatus: contarPorStatus(tarefas),
    faseAtual: plano !== null ? faseAtualDoPlano(plano) : null,
    plano,
    erros,
  };
}

async function listarProjetos(raiz: string, erros: string[]): Promise<string[]> {
  try {
    const entradas = await readdir(join(raiz, "projetos"), { withFileTypes: true });
    return entradas
      .filter((entrada) => entrada.isDirectory())
      .map((entrada) => entrada.name)
      .sort();
  } catch {
    erros.push("pasta projetos/ não encontrada na raiz da fábrica");
    return [];
  }
}

/** Blinda contra travessia de caminho: nome de projeto é um único segmento. */
function nomeDeProjetoValido(nome: string): boolean {
  return nome !== "" && nome !== "." && nome !== ".." && !/[\\/]/.test(nome);
}

async function ehDiretorio(caminho: string): Promise<boolean> {
  try {
    return (await stat(caminho)).isDirectory();
  } catch {
    return false;
  }
}

async function lerTextoOpcional(caminho: string): Promise<string | null> {
  try {
    return await readFile(caminho, "utf8");
  } catch {
    return null;
  }
}
