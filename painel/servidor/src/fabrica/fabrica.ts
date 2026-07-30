import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { faseAtualDoPlano, parsearPlano } from "./plano.js";
import { contarPorStatus, lerResumosTarefas, lerTarefas } from "./tarefas.js";
import { lerIdeias, lerLogMaisRecente } from "./sistema.js";
import { lerEquipe } from "./equipe.js";
import { lerAnaliseEstruturada } from "./analise-estruturada.js";
import type {
  ContagemPorStatus,
  EstadoFabrica,
  FaseAtual,
  Plano,
  ProjetoDetalhe,
  ProjetoResumo,
  TarefaCompleta,
  TarefaResumo,
} from "./tipos.js";

/**
 * Visão geral da fábrica: todos os projetos (resumo com tarefas, contagem por status e
 * fase atual), ideias da caixa de entrada e o log diário mais recente.
 * Somente leitura; item malformado aparece com `erros` preenchido, nunca derruba o scan.
 */
export async function lerFabrica(raiz: string): Promise<EstadoFabrica> {
  const erros: string[] = [];
  const nomes = await listarProjetos(raiz, erros);

  // Projetos em PARALELO (e as ideias/log junto): o painel inicial lê a fábrica INTEIRA, e
  // em fila o tempo era a soma de todos os projetos — 206 ms com 10×30 tarefas, medido em
  // `integracao/bench-escala.ts`. É latência de disco somada, não trabalho de CPU.
  const [projetos, ideias, logMaisRecente] = await Promise.all([
    Promise.all(
      nomes.map(async (nome): Promise<ProjetoResumo> => {
        // Resumo não carrega o corpo das tarefas (isso é papel do lerProjeto) — e agora
        // também não PAGA por ele: antes as seções eram parseadas e descartadas na linha
        // seguinte, para toda tarefa de todo projeto.
        const base = await lerBaseProjeto(raiz, nome, false);
        return {
          nome,
          tarefas: base.tarefas,
          contagemPorStatus: base.contagemPorStatus,
          faseAtual: base.faseAtual,
          erros: base.erros,
        };
      }),
    ),
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

  // Tudo junto: a base (tarefas + plano) não depende dos textos, e esperar por ela antes
  // de começar a ler DECISOES/PROGRESSO/ANALISE era latência de disco empilhada à toa.
  const dirGestao = join(raiz, "projetos", nome, "_gestao");
  const [base, decisoes, progresso, analise, analiseEstruturada, equipe] = await Promise.all([
    lerBaseProjeto(raiz, nome, true),
    lerTextoOpcional(join(dirGestao, "DECISOES.md")),
    lerTextoOpcional(join(dirGestao, "PROGRESSO.md")),
    lerTextoOpcional(join(dirGestao, "ANALISE.md")),
    lerAnaliseEstruturada(raiz, nome),
    lerEquipe(raiz, nome),
  ]);

  return {
    nome,
    tarefas: base.tarefas,
    contagemPorStatus: base.contagemPorStatus,
    faseAtual: base.faseAtual,
    plano: base.plano,
    equipe,
    decisoes,
    progresso,
    analise,
    analiseEstruturada,
    erros: base.erros,
  };
}

interface BaseProjeto<T extends TarefaResumo> {
  tarefas: T[];
  contagemPorStatus: ContagemPorStatus;
  faseAtual: FaseAtual | null;
  plano: Plano | null;
  erros: string[];
}

/** Leitura comum a resumo e detalhe: tarefas + plano + derivados. */
async function lerBaseProjeto(
  raiz: string,
  nome: string,
  comSecoes: true,
): Promise<BaseProjeto<TarefaCompleta>>;
async function lerBaseProjeto(
  raiz: string,
  nome: string,
  comSecoes: false,
): Promise<BaseProjeto<TarefaResumo>>;
async function lerBaseProjeto(
  raiz: string,
  nome: string,
  comSecoes: boolean,
): Promise<BaseProjeto<TarefaResumo>> {
  const erros: string[] = [];
  const dirGestao = join(raiz, "projetos", nome, "_gestao");

  const temGestao = await ehDiretorio(dirGestao);
  if (!temGestao) erros.push("projeto sem pasta _gestao/");

  // Tarefas e plano juntos: são arquivos diferentes, não há motivo para esperar um.
  const dirTarefas = join(dirGestao, "tarefas");
  const [tarefas, textoPlano] = await Promise.all([
    comSecoes ? lerTarefas(dirTarefas) : lerResumosTarefas(dirTarefas),
    lerTextoOpcional(join(dirGestao, "PLANO.md")),
  ]);

  let plano: Plano | null = null;
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

/**
 * Nomes dos projetos da fábrica, em ordem alfabética. Exportado porque a injeção de
 * agentes dinâmicos precisa varrer todos quando `/trabalhar` roda sem projeto.
 */
export async function listarProjetos(raiz: string, erros: string[] = []): Promise<string[]> {
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
