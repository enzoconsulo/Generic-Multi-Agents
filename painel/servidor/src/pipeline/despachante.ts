import { ehLimiteDeUso, horaDeReabertura, type Consulta } from "../jobs/claude/runner-claude.js";
import { estimarCusto } from "../jobs/claude/precos.js";
import { montarContexto, papelDoAgente } from "../contexto/montador.js";
import type { EquipeProjeto } from "../fabrica/tipos.js";
import { carregarAgente, FERRAMENTAS_PIPELINE } from "./prompts-agente.js";
import { avaliarComandoDeProcesso, comandoDoToolInput } from "./guarda-processos.js";
import type { PedidoDespacho, ResultadoDespacho } from "./motor.js";

/**
 * Transforma UM passo do pipeline numa `query()` do SDK.
 *
 * É aqui que as intervenções I2, I3 e I4 finalmente acontecem juntas, porque só aqui o
 * painel controla os quatro parâmetros que decidem o custo e o comportamento de uma etapa:
 * qual prompt, qual modelo, quais ferramentas e QUE CONTEXTO.
 *
 * Três propriedades que vêm de graça com este desenho e não vinham com o anterior:
 *
 * 1. **Não existe agente abandonado.** Quem chama é `for await (… of consulta(…))` dentro
 *    de um `await`. O bug que destruiu trabalho em 30/07 e 01/08 — um modelo encerrando o
 *    turno com agente em voo — não tem como acontecer: não há modelo decidindo esperar.
 * 2. **O agente não pode despachar subagente.** `FERRAMENTAS_PIPELINE` não inclui
 *    `Agent`/`Task`. A regra "subagentes não criam subagentes" deixa de ser pedido no
 *    prompt e vira ausência de ferramenta.
 * 3. **O prefixo é estável entre etapas.** Mesmo `systemPrompt` (preset sem seções
 *    dinâmicas), mesmas ferramentas, e o bloco compartilhado do projeto abrindo a mensagem
 *    — nessa ordem de propósito, é o que o cache consegue reaproveitar.
 *
 * O prompt de cada agente vem do MESMO arquivo que o chat interativo usa
 * (`.claude/agents/<nome>.md`). Não há cópia: mudar `executor.md` muda os dois caminhos.
 */

export interface OpcoesDespachante {
  raizFabrica: string;
  dirProjeto: string;
  projeto: string;
  /** Modelo do fluxo — usado quando nem o pedido nem o arquivo do agente cravam um. */
  modeloFluxo: string;
  fallback?: string | undefined;
  equipe: EquipeProjeto | null;
  consulta: Consulta;
  abortController: AbortController;
  emitir(nivel: "info" | "erro" | "ferramenta", texto: string): void;
  /** Teto de voltas por etapa. Etapa que passa disso está girando, não trabalhando. */
  maxTurnsPorEtapa?: number;
}

/** Voltas por papel. O construtor é o único que realmente escreve muito. */
const MAX_TURNS: Readonly<Record<string, number>> = {
  construtor: 60,
  verificador: 40,
  revisor: 40,
  planejador: 60,
};

/** Quebra de linha usada para montar os blocos de despacho. */
const QUEBRA = String.fromCharCode(10);

/**
 * Instrução de confinamento e de contrato. Curta de propósito: o prompt do agente já traz a
 * disciplina inteira, e cada linha aqui é relida a cada volta da etapa.
 */
function blocoDespacho(pedido: PedidoDespacho, dirProjeto: string): string {
  const t = pedido.tarefa;

  // MARCO: não é sobre uma tarefa, é sobre a META da fase. E pede um veredito em FORMA DE
  // CONTRATO — o motor precisa lê-lo para gravar o PLANO.md, e interpretar prosa aí seria a
  // pior fragilidade possível: registrar "aprovado" por engano é irreversível na prática.
  if (pedido.papel === "marco") {
    return [
      "<despacho>",
      `Projeto: ${dirProjeto}`,
      `MODO MARCO DE FASE — fase: "${pedido.fase ?? "?"}"`,
      "Não verifique uma tarefa: leia a META desta fase em `_gestao/PLANO.md` e exercite-a",
      "de ponta a ponta no software real. Não altere status de tarefa nenhuma.",
      "Confinamento: não toque em NADA fora do caminho do projeto acima.",
      "",
      "TERMINE sua última mensagem com uma linha, sozinha, exatamente assim:",
      "MARCO: aprovado",
      "ou",
      "MARCO: reprovado",
      "Sem essa linha o resultado NÃO é registrado e o marco terá de ser refeito.",
      "</despacho>",
    ].join(QUEBRA);
  }

  if (pedido.papel === "documentador") {
    return [
      "<despacho>",
      `Projeto: ${dirProjeto}`,
      "Um lote de tarefas foi concluído. Atualize a documentação do projeto (README,",
      "CLAUDE.md do projeto, PROGRESSO.md) para refletir o estado REAL do código.",
      "Confinamento: não toque em NADA fora do caminho do projeto acima.",
      "Commite o que alterar.",
      "</despacho>",
    ].join(QUEBRA);
  }
  const situacao =
    t.tentativas >= 1
      ? "RETRABALHO — há reprovação registrada nas seções Verificação/Conformidade/Revisão"
      : "primeira execução";
  return [
    "<despacho>",
    `Projeto: ${dirProjeto}`,
    `Tarefa: ${t.id} (_gestao/tarefas/${t.arquivo})`,
    `Situação: ${situacao}`,
    "Confinamento: não toque em NADA fora do caminho do projeto acima.",
    "Registre tudo no arquivo da tarefa antes de terminar; seu contrato de estado está no",
    "seu próprio prompt.",
    "</despacho>",
    // Só existe no retrabalho PONTUAL, e é a diferença entre "refaça a tarefa" e "conserte
    // isto": sem ele o construtor reabre o que já passou, e é aí que o retrabalho fica caro.
    ...(pedido.foco !== undefined && pedido.foco !== "" ? ["", pedido.foco] : []),
  ].join("\n");
}

/**
 * Cria a função `despachar` que o motor consome.
 *
 * Devolve `concluiu: false` em vez de lançar quando a etapa falha: o motor trata isso
 * parando o laço com o trabalho anterior preservado, que é sempre melhor que uma exceção
 * subindo no meio de uma rodada.
 */
export function criarDespachante(
  o: OpcoesDespachante,
): (pedido: PedidoDespacho) => Promise<ResultadoDespacho> {
  return async function despachar(pedido: PedidoDespacho): Promise<ResultadoDespacho> {
    const agente = await carregarAgente(o.raizFabrica, pedido.agente);
    if (agente === null) {
      o.emitir("erro", `Agente \`${pedido.agente}\` não existe em .claude/agents/ — etapa abortada.`);
      return { custoUsd: 0, concluiu: false };
    }

    const papel = papelDoAgente(pedido.agente);
    // Hash do último commit registrado nas Notas — o revisor julga o diff, não o projeto.
    const hash = hashDasNotas(pedido);
    const ctx = await montarContexto({
      dirProjeto: o.dirProjeto,
      papel,
      areas: pedido.tarefa.areas,
      hashCommit: hash,
    });

    // ORDEM IMPORTA: o bloco compartilhado abre a mensagem porque é a única parte idêntica
    // entre etapas — tudo que vier antes dele numa etapa e não na outra mata o cache.
    const mensagem = [
      ctx.compartilhado,
      "",
      "<seu-papel>",
      agente.prompt,
      "</seu-papel>",
      ...(pedido.promptColado !== null
        ? [
            "",
            "<especialista>",
            `Contexto extra: você atua como especialista desta equipe.`,
            pedido.promptColado,
            "</especialista>",
          ]
        : []),
      "",
      blocoDespacho(pedido, o.dirProjeto),
      "",
      ctx.especifico,
    ].join("\n");

    const modelo = pedido.modelo ?? agente.modelo ?? o.modeloFluxo;
    const tokens = ctx.medida.compartilhadoTok + ctx.medida.especificoTok;
    o.emitir(
      "info",
      `${pedido.tarefa.id} · ${papel} · ${pedido.agente} · ${modelo} · ~${tokens} tok de ` +
        `contexto (${ctx.medida.arquivosIncluidos.length} arquivo(s) embutido(s))`,
    );

    const consulta = o.consulta({
      prompt: mensagem,
      options: {
        // cwd é o PROJETO: caminho relativo do agente funciona, e o confinamento fica
        // reforçado pelo próprio diretório de trabalho.
        cwd: o.dirProjeto,
        model: modelo,
        ...(o.fallback !== undefined ? { fallbackModel: o.fallback } : {}),
        // Sem `Agent`/`Task`: a regra "subagentes não criam subagentes" vira ausência de
        // ferramenta em vez de pedido no prompt.
        allowedTools: [...FERRAMENTAS_PIPELINE],
        permissionMode: "bypassPermissions",
        // A ÚNICA conferência de comando neste caminho. `bypassPermissions` desliga o
        // `canUseTool`, mas o `sdk.d.ts` garante que o PreToolUse decide mesmo sob bypass.
        // Barra o agente de matar o painel que o executa — ver `guarda-processos.ts`.
        hooks: {
          PreToolUse: [
            {
              hooks: [
                async (entrada: unknown) => {
                  const i = entrada as { tool_name?: string; tool_input?: unknown };
                  const veredicto = avaliarComandoDeProcesso(comandoDoToolInput(i.tool_input));
                  if (veredicto.permitido) return { continue: true };
                  o.emitir(
                    "erro",
                    `GUARDA: comando de kill recusado para ${pedido.agente} — ${veredicto.motivo ?? ""}`,
                  );
                  return {
                    continue: true,
                    hookSpecificOutput: {
                      hookEventName: "PreToolUse" as const,
                      permissionDecision: "deny" as const,
                      permissionDecisionReason: veredicto.motivo ?? "recusado",
                    },
                  };
                },
              ],
            },
          ],
        },
        abortController: o.abortController,
        // Ordem: teto do PEDIDO (diagnóstico do retrabalho) > teto do despachante (testes) >
        // padrão do papel. O do pedido vem primeiro porque é o único que sabe se esta etapa
        // é uma construção do zero ou um conserto de três linhas.
        maxTurns: pedido.maxTurns ?? o.maxTurnsPorEtapa ?? MAX_TURNS[papel] ?? 40,
        // Nada de disco: o contexto é montado por nós, e carregar os CLAUDE.md da fábrica
        // aqui traria doutrina de ORQUESTRAÇÃO para dentro de um agente que não orquestra.
        settingSources: [],
        // Canal de diagnóstico do processo `claude`. Sem ele, uma queda chega como a frase
        // "Claude Code process exited with code 1" e não há o que investigar — foi
        // exatamente o que aconteceu numa rodada real, com o testador morrendo aos 5min42
        // sem deixar rastro. Guardamos as últimas linhas e só as mostramos SE houver falha.
        stderr: (dado: string) => {
          for (const linha of String(dado).split(QUEBRA)) {
            if (linha.trim() === "") continue;
            ultimasDoStderr.push(linha);
            if (ultimasDoStderr.length > 20) ultimasDoStderr.shift();
          }
        },
        systemPrompt: {
          type: "preset" as const,
          preset: "claude_code" as const,
          excludeDynamicSections: true,
        },
      },
    });

    let custoUsd = 0;
    let erro = false;
    let terminou = false;
    let textoFinal = "";
    /** Últimas linhas de stderr do processo `claude` — só exibidas se a etapa falhar. */
    const ultimasDoStderr: string[] = [];
    const porModelo: Record<
      string,
      { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number; custoUsd: number }
    > = {};

    try {
      for await (const bruto of consulta) {
        const msg = bruto as {
          type?: string;
          is_error?: boolean;
          total_cost_usd?: number;
          message?: { model?: string; usage?: Record<string, unknown>; content?: unknown[] };
        };
        if (msg.type === "assistant") {
          const u = msg.message?.usage;
          if (u !== undefined) {
            const m = (porModelo[msg.message?.model ?? modelo] ??= {
              entrada: 0,
              saida: 0,
              cacheLeitura: 0,
              cacheEscrita: 0,
              custoUsd: 0,
            });
            m.entrada = Math.max(m.entrada, num(u["input_tokens"]));
            m.saida = Math.max(m.saida, num(u["output_tokens"]));
            m.cacheLeitura += num(u["cache_read_input_tokens"]);
            m.cacheEscrita += num(u["cache_creation_input_tokens"]);
          }
          for (const bloco of (msg.message?.content ?? []) as { type?: string; name?: string }[]) {
            if (bloco.type === "tool_use" && bloco.name !== undefined) {
              o.emitir("ferramenta", `${pedido.agente}: ${bloco.name}`);
            }
          }
        } else if (msg.type === "result") {
          terminou = true;
          erro = msg.is_error === true;
          if (typeof msg.total_cost_usd === "number") custoUsd = msg.total_cost_usd;
          const r = (msg as { result?: unknown }).result;
          if (typeof r === "string") textoFinal = r;
        }
      }
    } catch (e) {
      const mensagem = (e as Error).message;
      o.emitir("erro", `Etapa ${pedido.agente} falhou: ${mensagem}`);
      if (ultimasDoStderr.length > 0) {
        o.emitir("erro", `stderr do agente:${QUEBRA}${ultimasDoStderr.join(QUEBRA)}`);
      }
      /**
       * LIMITE DE ASSINATURA (T-064). O provedor anuncia a cota na mensagem de erro, e
       * `ehLimiteDeUso` já sabe reconhecê-la desde a T-045 — mas o sinal morria AQUI: o
       * `texto` devolvido é o `result` do SDK, que num corte por cota nunca chega, e o motor
       * ficava sem nada para ler. Ele então adivinhava falha sistêmica por 3 falhas em
       * sequência, e cada uma dessas falhas custa dinheiro: medido no job `c080b98c`, um
       * único despacho cortado por cota custou US$ 4,11 antes de devolver nada.
       *
       * Cota é parede rígida — só o relógio abre. Reconhecer é parar na hora.
       */
      return {
        custoUsd: custoUsd || (estimarCusto(porModelo)?.usd ?? 0),
        concluiu: false,
        texto: textoFinal,
        ...(ehLimiteDeUso(mensagem) || ultimasDoStderr.some((l) => ehLimiteDeUso(l))
          ? { limiteDeUso: horaDeReabertura(mensagem) ?? "sem hora anunciada" }
          : {}),
      };
    }

    // Custo real do SDK quando veio; senão a estimativa, para o orçamento nunca ficar cego
    // justamente na etapa que foi cortada — que é a cara.
    if (custoUsd === 0) custoUsd = estimarCusto(porModelo)?.usd ?? 0;

    if (!terminou || erro) {
      o.emitir("erro", `Etapa ${pedido.agente} terminou sem resultado válido.`);
      return { custoUsd, concluiu: false, texto: textoFinal };
    }
    return { custoUsd, concluiu: true, texto: textoFinal };
  };
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Último hash de commit registrado nas Notas de execução, no formato que o executor grava
 * (`**Commit:** \`<hash>\``). O revisor precisa dele para receber o diff em vez do projeto.
 *
 * Quando não há hash — tarefa nunca commitada, ou executor que pulou o passo — o montador
 * registra a ausência e o revisor roda `git show` sozinho. Degrada, não quebra.
 */
function hashDasNotas(pedido: PedidoDespacho): string | null {
  const notas = pedido.notas ?? "";
  const achados = [...notas.matchAll(/\*\*Commit:\*\*\s*`([0-9a-f]{7,40})`/gi)];
  const ultimo = achados[achados.length - 1];
  return ultimo?.[1] ?? null;
}
