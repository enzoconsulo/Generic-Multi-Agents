import { mapaDependencias, tarefasPromoviveis } from "../../lib/gestao";
import type { Job, ProjetoDetalhe } from "../../lib/tipos";

/**
 * "Próximo passo sugerido" (T-022): olha o estado real do projeto e diz, em uma frase, o
 * que fazer agora.
 *
 * Existe por causa de um beco sem saída real: importar um projeto gera análise, mas NÃO
 * gera plano, tarefas nem equipe — então o `/trabalhar` não tinha o que fazer e a tela
 * não explicava por quê. Quem chega no painel não deveria precisar deduzir isso.
 *
 * Função PURA de propósito: sugestão errada é pior que nenhuma, então isto é testado
 * caso a caso.
 */

export type AcaoSugerida = "pedir" | "trabalhar" | "jobs" | null;

export interface PassoSugerido {
  /** ok = tudo em ordem; acao = tem algo a fazer; atencao = precisa de você. */
  tom: "ok" | "acao" | "atencao";
  titulo: string;
  detalhe: string;
  acao: AcaoSugerida;
}

const EM_ANDAMENTO = new Set(["em-execucao", "em-teste", "em-revisao"]);

export function proximoPasso(projeto: ProjetoDetalhe, jobAtivo: Job | null): PassoSugerido {
  // 1. Algo rodando agora domina tudo: o estado vai mudar sozinho.
  if (jobAtivo !== null) {
    return {
      tom: "ok",
      titulo: "A fábrica está trabalhando neste projeto agora",
      detalhe: `${jobAtivo.titulo} — acompanhe o passo a passo no console.`,
      acao: "jobs",
    };
  }

  const tarefas = projeto.tarefas;
  const contar = (f: (s: string) => boolean) => tarefas.filter((t) => f(t.status)).length;
  const bloqueadas = contar((s) => s === "bloqueada");
  const andando = contar((s) => EM_ANDAMENTO.has(s));
  // A FILA É O QUE O MOTOR PODE DESPACHAR, e por muito tempo isto foi `pronta || backlog`.
  // Backlog inteiro NÃO é fila: tarefa presa por dependência é o plano funcionando, e
  // anunciá-la como "pronta para executar" mandava o usuário clicar num botão que abriria e
  // fecharia a rodada sem fazer nada. Ficou visível em 21/08, quando o cartão passou a
  // mostrar a estimativa: a mesma tela dizia "2 tarefas prontas para executar" logo acima de
  // "nada despachável agora" — e quem estava certo era a estimativa.
  const promoviveis = tarefasPromoviveis(tarefas, mapaDependencias(tarefas)).length;
  const naFila = contar((s) => s === "pronta") + promoviveis;
  const concluidas = contar((s) => s === "concluida");
  // Frontmatter ilegível: o leitor devolve a tarefa com campos vazios e a lista de erros. O
  // sinal existia desde sempre e ninguém o lia — e tarefa sem `status` some do pipeline em
  // silêncio, que é o pior desfecho possível para quem acha que o trabalho está na fila.
  const quebradas = tarefas.filter((t) => t.erros.length > 0);

  // 2. Sem tarefa nenhuma: é o caso do projeto recém-importado — o beco sem saída.
  if (tarefas.length === 0) {
    return {
      tom: "acao",
      titulo: "Este projeto ainda não tem nada planejado",
      detalhe:
        projeto.analise !== null && projeto.analise.trim() !== ""
          ? "O código já foi analisado. Diga o que você quer que seja feito e a fábrica " +
            "transforma isso em plano, tarefas e uma equipe de especialistas."
          : "Diga o que você quer que seja feito: a fábrica planeja, divide em tarefas e " +
            "monta a equipe de especialistas antes de escrever código.",
      acao: "pedir",
    };
  }

  // 3. Bloqueio espera DECISÃO humana — nenhum botão resolve, então não sugere ação.
  if (bloqueadas > 0) {
    return {
      tom: "atencao",
      titulo: `${bloqueadas} tarefa(s) bloqueada(s) esperando você`,
      detalhe:
        "A fábrica tentou e não conseguiu sozinha. Abra a tarefa no quadro abaixo: o " +
        "motivo está nas seções Verificação/Revisão.",
      acao: null,
    };
  }

  // 4. Tarefa "em andamento" sem job rodando = sobra de sessão interrompida.
  if (andando > 0) {
    return {
      tom: "atencao",
      titulo: `${andando} tarefa(s) presa(s) no meio do caminho`,
      detalhe:
        "Estão marcadas como em andamento, mas nada está rodando — provavelmente uma " +
        "execução foi interrompida. Rodar a fábrica de novo sana e retoma do ponto certo.",
      acao: "trabalhar",
    };
  }

  // 5. Fila com trabalho: o caminho feliz.
  if (naFila > 0) {
    return {
      tom: "acao",
      titulo: `${naFila} tarefa(s) na fila, prontas para executar`,
      detalhe:
        "Clique em Trabalhar neste projeto: a fábrica executa cada uma pelo ciclo " +
        "completo (constrói → testa → revisa) sem precisar de você.",
      acao: "trabalhar",
    };
  }

  // 6. Fila vazia, mas há tarefa que o leitor não conseguiu ler: é isso que trava, e
  // nenhuma outra frase da tela diria. Vem antes de "tudo concluído" porque, do ponto de
  // vista do usuário, tudo concluído com uma tarefa ilegível no meio é mentira.
  if (quebradas.length > 0) {
    const ids = quebradas.map((t) => t.id || t.arquivo).join(", ");
    return {
      tom: "atencao",
      titulo: `${quebradas.length} tarefa(s) com frontmatter ilegível`,
      detalhe:
        `${ids}: o YAML do topo do arquivo não abre, então a tarefa fica sem status e o ` +
        "pipeline a ignora em silêncio. Corrija o frontmatter (aspas e dois-pontos no " +
        "título são a causa comum) para ela voltar a circular.",
      acao: null,
    };
  }

  // 7. Nada na fila e tudo concluído: pedir o próximo passo.
  if (concluidas > 0) {
    return {
      tom: "ok",
      titulo: "Tudo que estava planejado foi concluído",
      detalhe: "Peça a próxima funcionalidade para a fábrica planejar e executar.",
      acao: "pedir",
    };
  }

  // 8. Resto (só canceladas, por exemplo).
  return {
    tom: "acao",
    titulo: "Nenhuma tarefa executável no momento",
    detalhe: "Peça uma funcionalidade para a fábrica planejar o próximo ciclo.",
    acao: "pedir",
  };
}
