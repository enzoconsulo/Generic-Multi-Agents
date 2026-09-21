/**
 * PRÉ-VOO DOS SERVIÇOS DE QUE A BATERIA DEPENDE (21/09).
 *
 * POR QUE ISTO EXISTE. A passada mecânica roda a suíte do projeto antes de gastar
 * verificador — ótimo negócio quando a suíte responde sobre a ENTREGA. Só que uma suíte que
 * precisa de banco não responde sobre a entrega quando o banco está no chão: ela responde
 * sobre a máquina. E o motor não tinha como saber a diferença, porque não havia pré-voo
 * nenhum no pipeline.
 *
 * O estrago medido, na T-056 do fabrica-v2: SEIS ciclos de retrabalho sobre um artefato
 * correto e provado desde o primeiro commit (`c3eea89`). O Postgres desta máquina não é
 * serviço do Windows — sobe à mão, por `_sistema/ferramentas/banco-v2.ps1` — e o alias
 * `test:` do projeto roda `ecto.create` antes de qualquer teste, então com o banco fora do
 * ar até uma suíte 100% PURA sai não-zero. Três rodadas de 21/09: 6 despachos, 0 tarefas,
 * US$ 12,10.
 *
 * A DOUTRINA QUE ISTO SEGUE é a do teto de orçamento, escrita no CLAUDE.md: **nunca cortar
 * no meio, só não COMEÇAR o que não cabe.** Despacho interrompido custa igual sem entregar
 * nada; rodada que nem começa custa zero. Por isso o pré-voo roda ANTES do motor, e o
 * desfecho ruim encerra a rodada em vez de deixá-la queimar tentativas contra a parede.
 *
 * E ele é DECLARATIVO, não adivinhado. Ninguém aqui tenta deduzir "este projeto usa
 * Postgres" do `mix.exs`: o projeto declara seus serviços em `_gestao/ci.json`, o mesmo
 * arquivo que já é a fonte dos comandos da bateria. Projeto que não declara nada não paga
 * nada — `servicos` ausente devolve lista vazia e o pipeline segue como sempre.
 *
 * Formato, em `_gestao/ci.json`:
 *
 * ```json
 * "servicos": [
 *   {
 *     "nome": "postgres",
 *     "checar": "C:/pgsql/18/bin/pg_isready.exe -h 127.0.0.1 -p 5432",
 *     "subir": "powershell -NoProfile -File _sistema/ferramentas/banco-v2.ps1 subir"
 *   }
 * ]
 * ```
 *
 * `subir` é opcional: sem ele o pré-voo só constata e relata, que já é infinitamente melhor
 * que classificar a máquina como defeito de código.
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** Um serviço externo de que a bateria do projeto depende. */
export interface ServicoDeclarado {
  nome: string;
  /** Comando que responde "está no ar?" pelo exit code. Barato e sem efeito colateral. */
  checar: string;
  /** Comando que tenta subi-lo. Ausente = o pré-voo só constata. */
  subir?: string | null;
}

/** Desfecho do pré-voo de UM serviço. */
export interface ResultadoServico {
  nome: string;
  /** No ar ao fim do pré-voo — é só isto que decide se a rodada começa. */
  noAr: boolean;
  /** Estava no chão e o `subir` o trouxe de volta. */
  religado: boolean;
  /** Saída do último comando que falhou, cortada. Vazio quando deu tudo certo. */
  detalhe?: string;
}

/** Timeout de um `checar` — tem que ser barato por construção. */
const TIMEOUT_CHECAR_MS = 15_000;
/**
 * Timeout de um `subir`. Folgado de propósito: depois de um desligamento sujo o Postgres
 * sobe em crash recovery e fica minutos respondendo "the database system is starting up".
 * Cortar aí deixaria o banco subindo e a rodada achando que ele não subiu — o pior dos dois.
 */
const TIMEOUT_SUBIR_MS = 4 * 60_000;

function cortar(texto: string, max = 600): string {
  const t = (texto ?? "").trim();
  return t.length > max ? `${t.slice(0, max)}\n… (saída cortada)` : t;
}

/**
 * Lê os serviços declarados em `_gestao/ci.json`.
 *
 * NUNCA lança, e a razão é a mesma do leitor de tarefas: um arquivo torto não pode derrubar
 * o pipeline inteiro. Arquivo ausente, JSON inválido, `servicos` de formato errado — todos
 * viram lista vazia, que é exatamente o comportamento de antes deste módulo existir.
 */
export async function lerServicos(dirProjeto: string): Promise<ServicoDeclarado[]> {
  let bruto: unknown;
  try {
    bruto = JSON.parse(await readFile(join(dirProjeto, "_gestao", "ci.json"), "utf8"));
  } catch {
    return [];
  }
  if (typeof bruto !== "object" || bruto === null) return [];
  const lista = (bruto as { servicos?: unknown }).servicos;
  if (!Array.isArray(lista)) return [];

  const servicos: ServicoDeclarado[] = [];
  for (const item of lista) {
    if (typeof item !== "object" || item === null) continue;
    const { nome, checar, subir } = item as Record<string, unknown>;
    // `nome` e `checar` são obrigatórios: sem comando de checagem não há pré-voo, só
    // palpite — e palpite é o que este módulo existe para remover.
    if (typeof nome !== "string" || nome.trim() === "") continue;
    if (typeof checar !== "string" || checar.trim() === "") continue;
    servicos.push({
      nome: nome.trim(),
      checar: checar.trim(),
      ...(typeof subir === "string" && subir.trim() !== "" ? { subir: subir.trim() } : {}),
    });
  }
  return servicos;
}

/** Roda um comando de shell e diz só se ele saiu zero. Injetado nos testes. */
export type Executor = (comando: string, timeoutMs: number) => Promise<{ ok: boolean; saida: string }>;

export const executorReal =
  (cwd: string): Executor =>
  async (comando, timeoutMs) => {
    try {
      const r = await exec(comando, {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
        shell: true,
      });
      return { ok: true, saida: `${r.stdout ?? ""}` };
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      return { ok: false, saida: `${err.stdout ?? ""}\n${err.stderr ?? err.message ?? ""}` };
    }
  };

/**
 * Confere cada serviço e, quando ele está no chão E declara `subir`, tenta uma vez.
 *
 * UMA tentativa, não um laço: se `subir` não resolveu de primeira, o problema não é timing —
 * é estado (data dir preso, porta ocupada por defunto, disco cheio), e insistir em laço só
 * adia o relatório que a pessoa precisa ler. Quem persiste é o vigia (`manter-postgres.ps1`),
 * que roda fora da rodada e tem a paciência certa para isso.
 */
export async function conferirServicos(
  servicos: readonly ServicoDeclarado[],
  executar: Executor,
): Promise<ResultadoServico[]> {
  const resultados: ResultadoServico[] = [];
  for (const s of servicos) {
    const antes = await executar(s.checar, TIMEOUT_CHECAR_MS);
    if (antes.ok) {
      resultados.push({ nome: s.nome, noAr: true, religado: false });
      continue;
    }
    if (s.subir === undefined || s.subir === null) {
      resultados.push({ nome: s.nome, noAr: false, religado: false, detalhe: cortar(antes.saida) });
      continue;
    }
    const subida = await executar(s.subir, TIMEOUT_SUBIR_MS);
    // O veredito é sempre do `checar`, nunca do `subir`. Um script de subida pode sair zero
    // tendo só disparado o processo (e sair não-zero tendo subido um banco que ainda estava
    // em recovery — foi o que aconteceu em 21/09). Quem responde "está no ar?" é o checador.
    const depois = await executar(s.checar, TIMEOUT_CHECAR_MS);
    resultados.push({
      nome: s.nome,
      noAr: depois.ok,
      religado: depois.ok,
      ...(depois.ok ? {} : { detalhe: cortar(`${subida.saida}\n${depois.saida}`) }),
    });
  }
  return resultados;
}

/** Os que continuam no chão depois da tentativa. Rodada não começa com esta lista cheia. */
export function servicosNoChao(resultados: readonly ResultadoServico[]): ResultadoServico[] {
  return resultados.filter((r) => !r.noAr);
}
