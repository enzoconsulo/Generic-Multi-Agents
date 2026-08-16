import type { FaseAtual, FasePlano, MarcoFase, Plano } from "./tipos.js";

/**
 * Parser do PLANO.md (contrato: `_sistema/templates/PLANO.md`):
 *   `# Plano — <nome>`, visão em texto livre, e uma seção `## <nome da fase>` por fase
 *   com linhas `Meta:` (pode continuar em várias linhas), `Marco:` e `Tarefas:`.
 * Nunca lança: problemas estruturais vão para `Plano.erros`.
 */
export function parsearPlano(texto: string): Plano {
  const erros: string[] = [];
  const fases: FasePlano[] = [];
  let titulo = "";
  const visaoLinhas: string[] = [];
  let faseCorrente: FasePlano | null = null;
  let coletandoMeta = false;

  for (const linha of texto.split(/\r?\n/)) {
    const tituloFase = /^##\s+(.+)$/.exec(linha)?.[1];
    if (tituloFase !== undefined) {
      faseCorrente = { nome: tituloFase.trim(), meta: "", marco: null, tarefas: [] };
      fases.push(faseCorrente);
      coletandoMeta = false;
      continue;
    }

    // `^#\s` não casa com `##` (o 2º caractere é `#`, não espaço).
    const tituloDoc = /^#\s+(.+)$/.exec(linha)?.[1];
    if (tituloDoc !== undefined && faseCorrente === null) {
      titulo = tituloDoc.trim();
      continue;
    }

    if (faseCorrente === null) {
      visaoLinhas.push(linha);
      continue;
    }

    const chave = /^(Meta|Marco|Tarefas):\s*(.*)$/.exec(linha);
    if (chave !== null) {
      const nome = chave[1] ?? "";
      const valor = (chave[2] ?? "").trim();
      coletandoMeta = false;
      if (nome === "Meta") {
        faseCorrente.meta = valor;
        coletandoMeta = true;
      } else if (nome === "Marco") {
        faseCorrente.marco = parsearMarco(valor);
      } else {
        // O SUFIXO DE LETRA É PARTE DO ID (`T-017a`), e esquecê-lo desligava o marco da fase
        // INTEIRA, em silêncio (achado de 16/08).
        //
        // O padrão era `/T-\d+/g`, que lia `T-017a, T-017b, T-017c` como `T-017` três vezes.
        // `fasesProntasParaMarco` então procurava a tarefa `T-017` — que não existe, porque
        // ela foi CANCELADA justamente para virar as três — e, não achando, concluía que a
        // fase não estava completa. O marco nunca ficava pronto e nada acusava: não há erro,
        // só uma fase que jamais entra na lista de pendentes.
        //
        // O alcance é maior que um projeto: sufixo de letra é a convenção da fábrica para
        // REPLANEJAMENTO (T-017 → T-017a/b/c). Ou seja, replanejar uma tarefa desativava o
        // portão de marco da fase dela, permanentemente, em qualquer projeto. Medido no
        // banco-imobiliario: a Fase 2 ficou `pendente` por duas semanas com as 13 tarefas
        // concluídas, e o marco só foi verificado quando um humano olhou o PLANO.md.
        faseCorrente.tarefas = valor.match(/T-\d+[a-z]*/gi) ?? [];
      }
      continue;
    }

    // Continuação da Meta: linhas não vazias logo após `Meta:`; linha em branco encerra.
    if (coletandoMeta) {
      const conteudo = linha.trim();
      if (conteudo === "") {
        coletandoMeta = false;
      } else {
        faseCorrente.meta += (faseCorrente.meta === "" ? "" : " ") + conteudo;
      }
    }
  }

  if (fases.length === 0) erros.push("plano sem nenhuma fase (## ...)");
  for (const fase of fases) {
    if (fase.marco === null) erros.push(`fase "${fase.nome}" sem linha Marco:`);
  }

  return {
    titulo,
    visao: visaoLinhas.join("\n").trim(),
    fases,
    erros,
  };
}

/** Interpreta o valor da linha `Marco:` — `pendente`, `aprovado AAAA-MM-DD` ou
 *  `reprovado AAAA-MM-DD (correções: T-NNN, ...)`; resto vira `desconhecido`. */
export function parsearMarco(bruto: string): MarcoFase {
  const primeiraPalavra = bruto.split(/\s+/)[0]?.toLowerCase() ?? "";
  const estado: MarcoFase["estado"] =
    primeiraPalavra === "pendente" || primeiraPalavra === "aprovado" || primeiraPalavra === "reprovado"
      ? primeiraPalavra
      : "desconhecido";
  return {
    bruto,
    estado,
    data: bruto.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null,
  };
}

/** Fase atual do projeto: primeira fase cujo marco está `pendente` (contrato do
 *  protocolo); se nenhuma está pendente, a primeira `reprovado` (fase reprovada
 *  continua em andamento até o marco reaprovar); todas aprovadas → null. */
export function faseAtualDoPlano(plano: Plano): FaseAtual | null {
  const pendente = plano.fases.find((fase) => fase.marco?.estado === "pendente");
  if (pendente?.marco != null) return { nome: pendente.nome, marco: pendente.marco };
  const reprovada = plano.fases.find((fase) => fase.marco?.estado === "reprovado");
  if (reprovada?.marco != null) return { nome: reprovada.nome, marco: reprovada.marco };
  return null;
}
