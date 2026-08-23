import { ehLimiteDeUso, horaDeReabertura, type Consulta } from "../jobs/claude/runner-claude.js";
import { estimarCusto } from "../jobs/claude/precos.js";
import { montarContexto, papelDoAgente } from "../contexto/montador.js";
import type { EquipeProjeto } from "../fabrica/tipos.js";
import { carregarAgente, FERRAMENTAS_PIPELINE, FERRAMENTAS_PROIBIDAS } from "./prompts-agente.js";
import { avaliarComandoDeProcesso, comandoDoToolInput } from "./guarda-processos.js";
import { avaliarReinvencao } from "./guarda-ferramental.js";
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
 * 2. **O agente não pode despachar subagente nem agendar continuação futura.**
 *    `FERRAMENTAS_PIPELINE` (passada em `tools`, que é o que restringe de verdade) não inclui
 *    `Agent`/`Task`, e `FERRAMENTAS_PROIBIDAS` remove a família de agendamento. As regras
 *    "subagentes não criam subagentes" e "nunca agende continuação futura" deixam de ser
 *    pedido no prompt e viram ausência de ferramenta.
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
  emitir(nivel: "info" | "erro" | "ferramenta", texto: string, meta?: MetaEtapa): void;
  /** Teto de voltas por etapa. Etapa que passa disso está girando, não trabalhando. */
  maxTurnsPorEtapa?: number;
}

/**
 * QUEM produziu esta linha de log, em campos — não em prosa (16/08).
 *
 * A aba Jobs desenha "quem trabalha agora" e a trilha construir → verificar → revisar a
 * partir do log, e até aqui ela só sabia ler o formato do runner do Agent SDK
 * (`Agent → testador`, casado por regex). O pipeline em CÓDIGO nunca emite essa linha —
 * quem despacha é a máquina de estados, não a ferramenta `Agent` —, então em TODO job de
 * `/trabalhar <projeto>` a segmentação por agente devolvia um bloco único e a trilha ficava
 * apagada. O sensor não estava quebrado: ele lia um formato que este caminho não produz.
 *
 * A correção é mandar o dado em campo em vez de fazer a UI reconhecê-lo no texto. Casar
 * formato de frase entre servidor e tela já mordeu esta fábrica antes (o `→ agente` dos
 * resumos, cuja invariante precisa de teste para não morrer em silêncio); campo estruturado
 * não tem esse modo de falha.
 */
export interface MetaEtapa {
  /** Nome do agente despachado (`executor`, `conferente`, `revisor-generico`…). */
  agente: string;
  /** Papel no pipeline — é ele, e não o nome, que decide a etapa da trilha. */
  papel: string;
  /** Tarefa em foco (`T-012`); ausente nos papéis que não olham uma tarefa. */
  tarefa?: string;
}

/** Voltas por papel. O construtor é o único que realmente escreve muito. */
const MAX_TURNS: Readonly<Record<string, number>> = {
  construtor: 60,
  verificador: 40,
  revisor: 40,
  planejador: 60,
};

/**
 * ORÇAMENTO DE FERRAMENTAS DECLARADO NOS PROMPTS (T-065), resolvido em número.
 *
 * Os prompts trazem o teto em tabela — o do construtor escala com o número de `areas`
 * (30/45/60), o do verificador é 25 e o do revisor 20. Duas consequências disso, medidas nas
 * quatro rodadas reais de 09/08:
 *
 * 1. **Ninguém enxergava o estouro.** Três despachos passaram do teto declarado (construtor
 *    com 39 contra 30 e 52 contra 45; testador com 32 contra 25) e nada registrou. O freio da
 *    máquina é o `maxTurns`, que vale 40-60 e conta VOLTAS DO MODELO, não chamadas — unidade
 *    diferente, número diferente, e por isso ele não substitui esta conta.
 * 2. **O agente tinha de derivar o próprio teto** contando as `areas` contra uma tabela. O
 *    motor já sabe o número; dizer qual é custa uma linha.
 *
 * Isto MEDE, não corta. Cortar exigiria converter chamadas em voltas, e despacho interrompido
 * no meio custa igual sem entregar nada (medido na T-064: US$ 4,11 num corte por cota).
 */
export function orcamentoDeFerramentas(papel: string, areas: number): number {
  if (papel === "construtor") return areas <= 2 ? 30 : areas === 3 ? 45 : 60;
  if (papel === "verificador") return 25;
  if (papel === "revisor") return 20;
  return 60;
}

/**
 * LIMIAR DE DEBATE — a partir de quantas chamadas o agente deixou de trabalhar e passou a se
 * debater. É OUTRO número, e a confusão entre os dois é o defeito que isto conserta (16/08).
 *
 * `orcamentoDeFerramentas` é um ALVO: o número que o prompt diz ao agente para ele economizar.
 * Alvo é exortação, e alvo bom é apertado — é normal e saudável que seja excedido às vezes.
 * O relatório, porém, usava esse mesmo número como SENSOR de anomalia, e um sensor calibrado
 * no alvo não carrega informação nenhuma.
 *
 * Medido sobre 135 etapas reais de `dados/jobs/*.log.jsonl` (contando as linhas `ferramenta`
 * de cada etapa, sem gastar um centavo de modelo):
 *
 * | papel | teto declarado | estourava em | p90 real |
 * |---|---|---|---|
 * | verificador | 25 | **52%** dos despachos | 37 |
 * | construtor  | 30 | **36%** | 57 |
 * | revisor     | 20 | 20% | 28 |
 *
 * Um alarme que toca em metade das rodadas é ruído, e ruído é o que impede o sinal de virar
 * ATUADOR: ligar política de retrabalho a um gatilho que dispara sempre equivale a "sempre o
 * caro" — exatamente o que `diagnostico.ts` existe para desfazer. Por isso o limiar é o p90:
 * dispara em ~1 despacho em 10, e aí "estourou" volta a significar alguma coisa.
 *
 * A OUTRA descoberta da mesma medição, e ela derruba uma premissa: **o número de `areas` não
 * prevê o número de chamadas.** Mediana de 21 com ≤2 areas contra 12 com 3 areas; p90 de 57 e
 * 58, respectivamente. A escada 30/45/60 escala numa variável que não correlaciona — o que
 * varia é a natureza do trabalho, não quantos arquivos a tarefa declarou. O limiar, por isso,
 * é PLANO para o construtor. (O alvo do prompt segue escalonado de propósito: lá ele é
 * conselho de dimensionamento, e conselho por tamanho de tarefa continua fazendo sentido.)
 *
 * INVARIANTE que o teste trava: o limiar é sempre MAIOR que o maior alvo declarado do papel.
 * Alarme abaixo do próprio alvo é incoerente — acusaria de debate um agente que respeitou o
 * que o prompt pediu. É por isso que o construtor fica em 65 e não no p90 puro (57): o alvo
 * da faixa de 4 `areas` é 60. Taxas de disparo resultantes, na mesma amostra: construtor 6%,
 * verificador 12%, revisor 10%.
 *
 * Refazer a calibragem depois de mais rodadas: o script está no log de 2026-08-16.
 */
export function limiarDeDebate(papel: string): number {
  if (papel === "construtor") return 65;
  if (papel === "verificador") return 37;
  if (papel === "revisor") return 28;
  return 60;
}

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
    const papel = papelDoAgente(pedido.agente);
    // `marco` e `documentador` recebem uma tarefa só para satisfazer o tipo do pedido — o
    // trabalho deles é sobre a FASE e sobre o projeto. Carimbar o id dela na linha faria a
    // tela dizer que o marco é da T-007, que é mentira visível.
    const meta: MetaEtapa = {
      agente: pedido.agente,
      papel,
      ...(pedido.papel === "marco" || pedido.papel === "documentador"
        ? {}
        : { tarefa: pedido.tarefa.id }),
    };
    /** Emite já carimbado com quem é a etapa. Usar sempre este, nunca `o.emitir` cru. */
    const emitir = (nivel: "info" | "erro" | "ferramenta", texto: string): void =>
      o.emitir(nivel, texto, meta);

    const agente = await carregarAgente(o.raizFabrica, pedido.agente);
    if (agente === null) {
      emitir("erro", `Agente \`${pedido.agente}\` não existe em .claude/agents/ — etapa abortada.`);
      return { custoUsd: 0, concluiu: false };
    }

    // Hash do último commit registrado nas Notas — o revisor julga o diff, não o projeto.
    const hash = hashDasNotas(pedido);
    const ctx = await montarContexto({
      dirProjeto: o.dirProjeto,
      raizFabrica: o.raizFabrica,
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
    // NOME EFETIVO, não o do arquivo de agente (23/08). No painel o especialista NUNCA é
    // subagente — `runner-pipeline.ts` passa `disponiveis` vazio de propósito, então o
    // roteamento sempre cai no passo 3 do CLAUDE.md e o prompt do especialista é colado no
    // despacho. Só que esta linha, que é a que a tela destaca, escrevia `executor` seco: o
    // usuário lia a fábrica inteira rodando no genérico e concluiu, com razão a partir do que
    // via, que os especialistas do `equipe.json` eram inúteis. Eram invisíveis.
    const efetivo =
      pedido.especialista !== undefined && pedido.especialista !== ""
        ? `${pedido.especialista}@${pedido.agente}`
        : pedido.agente;
    emitir(
      "info",
      `${pedido.tarefa.id} · ${papel} · ${efetivo} · ${modelo} · ~${tokens} tok de ` +
        `contexto (${ctx.medida.arquivosIncluidos.length} arquivo(s) embutido(s))`,
    );
    // `areas` com diretório não embute nada e some no meio dos "omitidos" — que ninguém lê.
    // Aqui vira ERRO visível: é defeito de planejamento, e só se conserta se alguém o vir.
    for (const om of ctx.medida.omitidos) {
      if (om.motivo.startsWith("é um DIRETÓRIO")) {
        emitir(
          "erro",
          `${pedido.tarefa.id}: \`areas\` declara \`${om.caminho}\`, que é um DIRETÓRIO —` +
            " nada foi embutido e o agente vai trabalhar às cegas nessa parte. `areas` deve" +
            " listar ARQUIVOS (é também o mutex do paralelismo). Defeito do planejamento.",
        );
      }
    }

    const consulta = o.consulta({
      prompt: mensagem,
      options: {
        // cwd é o PROJETO: caminho relativo do agente funciona, e o confinamento fica
        // reforçado pelo próprio diretório de trabalho.
        cwd: o.dirProjeto,
        model: modelo,
        ...(o.fallback !== undefined ? { fallbackModel: o.fallback } : {}),
        /**
         * `tools` RESTRINGE; `allowedTools` só auto-aprova. Confundir os dois deixou a
         * fábrica sem restrição nenhuma por semanas, com o comentário aqui afirmando o
         * contrário. O `sdk.d.ts` é literal em `allowedTools`: *"To restrict which tools are
         * available, use the `tools` option instead."*
         *
         * A prova de que não restringia está no job `1a3bc22e` (14/08): o `executor` chamou
         * **`ScheduleWakeup` seis vezes** — ferramenta que nunca esteve em
         * `FERRAMENTAS_PIPELINE`. Ele tentava agendar continuação futura para esperar uma
         * captura, num job headless onde não existe quem acorde ninguém; a etapa morreu com
         * `exit 1` e a tarefa ficou sem entrega. Mesma família do `run_in_background` que
         * destruiu trabalho em 30/07 e 01/08: proteção que depende de o modelo lembrar não é
         * proteção, e proteção escrita na opção errada não é nem lembrete.
         *
         * `disallowedTools` é cinto e suspensório para a família perigosa: o `sdk.d.ts` diz
         * que ela é *"removed from the model's context"*, então cobre também o que o harness
         * injete por fora da allowlist.
         */
        tools: [...FERRAMENTAS_PIPELINE],
        disallowedTools: [...FERRAMENTAS_PROIBIDAS],
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
                  const comando = comandoDoToolInput(i.tool_input);
                  // Duas guardas, um hook: matar processo alheio e reinventar ferramenta que a
                  // fábrica já tem. Separadas em módulos porque são motivos distintos, unidas
                  // aqui porque o ponto de decisão tem de ser único — guarda que depende de um
                  // caminho novo lembrar de chamá-la não é guarda.
                  const processo = avaliarComandoDeProcesso(comando);
                  const veredicto = processo.permitido ? avaliarReinvencao(comando) : processo;
                  if (veredicto.permitido) return { continue: true };
                  emitir(
                    "erro",
                    `GUARDA: comando recusado para ${pedido.agente} — ${veredicto.motivo ?? ""}`,
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
    /** Chamadas de ferramenta desta etapa, para conferir contra o orçamento declarado (T-065). */
    let chamadas = 0;
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
              chamadas += 1;
              emitir("ferramenta", `${pedido.agente}: ${bloco.name}`);
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
      emitir("erro", `Etapa ${pedido.agente} falhou: ${mensagem}`);
      if (ultimasDoStderr.length > 0) {
        emitir("erro", `stderr do agente:${QUEBRA}${ultimasDoStderr.join(QUEBRA)}`);
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

    // Estouro do orçamento DECLARADO (T-065): mede, não corta. O custo de um agente cresce
    // com o quadrado das idas ao modelo, então passar do teto é caro — e sem registro isso
    // some. Fica em `info`: passar do ALVO é frequente e normal (36-52% dos despachos,
    // medido), então isto é termômetro para leitura humana, nunca alarme.
    const orcado = orcamentoDeFerramentas(papel, pedido.tarefa.areas.length);
    if (chamadas > orcado) {
      emitir(
        "info",
        `${pedido.tarefa.id}: ${pedido.agente} usou ${chamadas} chamadas de ferramenta,` +
          ` acima do alvo declarado de ${orcado} para ${papel} com` +
          ` ${pedido.tarefa.areas.length} area(s). Idas ao modelo custam ao quadrado.`,
      );
    }

    // O ALARME é outro número — ver `limiarDeDebate`. Passar daqui é o decil superior medido:
    // o agente parou de trabalhar e passou a se debater. É este, e só este, que vira decisão
    // no ciclo seguinte (`politicaDe`).
    const limiar = limiarDeDebate(papel);
    if (chamadas > limiar) {
      emitir(
        "erro",
        `${pedido.tarefa.id}: ${pedido.agente} se DEBATEU — ${chamadas} chamadas, acima do` +
          ` p90 medido para ${papel} (${limiar}). O próximo despacho desta tarefa não usa` +
          " caminho barato.",
      );
    }

    if (!terminou || erro) {
      emitir("erro", `Etapa ${pedido.agente} terminou sem resultado válido.`);
      return {
        custoUsd,
        concluiu: false,
        texto: textoFinal,
        chamadas,
        orcadoFerramentas: orcado,
        limiarDebate: limiar,
      };
    }
    return {
      custoUsd,
      concluiu: true,
      texto: textoFinal,
      chamadas,
      orcadoFerramentas: orcado,
      limiarDebate: limiar,
    };
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
