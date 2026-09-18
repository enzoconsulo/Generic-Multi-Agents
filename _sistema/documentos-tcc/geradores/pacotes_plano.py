# -*- coding: utf-8 -*-
"""As TAREFAS de cada etapa, com o prazo de cada uma — a WBS do plano.

Cada item e um pacote de trabalho na figura da WBS e uma tarefa na tabela de prazos:
e a mesma coisa, com um nome em cada lugar. Sao a mesma decomposicao que aparece na
coluna "O que sera feito" do cronograma (o CONTEUDO, em plano_corpo.py), so que em
rotulo curto. **Mexeu num, mexa no outro.**

    (rotulo, dias uteis)

Numeracao: E3.1, E3.2 ... — estende a sigla das etapas, em vez de criar uma nova.
A decomposicao para aqui; abaixo disso fica o trabalho do dia, que nao entra no plano.

Duas regras que este arquivo cobra sozinho:
  - rotulo de no maximo 21 caracteres, senao vaza da coluna do cartao na figura (que a
    conferencia automatica nao enxerga, porque figura e imagem);
  - a soma dos prazos de uma etapa nao pode passar dos dias uteis dela. O que sobra e
    folga, e ela e de proposito: entrega tem de ser verificada, e imprevisto acontece.
"""
import calendario_plano as cal

PACOTES = {
    1: [("Requisitos", 3), ("Estado da arte", 3), ("Arquitetura", 2),
        ("Tarefas e critérios", 2)],
    2: [("Ambiente", 2), ("Banco e custo", 3), ("Fronteiras", 3),
        ("Cópia de segurança", 1)],
    3: [("Ferramentas", 3), ("Confinamento", 2), ("Agente supervisionado", 2),
        ("Adaptadores", 2)],
    4: [("Seis estados", 2), ("Fila e equipe", 2), ("Critérios de aceite", 2),
        ("Os dois portões", 2), ("Diagnóstico", 2)],
    5: [("Supervisão", 2), ("Fila durável", 2), ("Paralelismo", 2),
        ("Limite de uso", 2), ("Recuperação", 2)],
    6: [("Medição da busca", 2), ("Histórico", 2), ("Busca híbrida", 3),
        ("Contexto com fonte", 2), ("Avaliação", 1)],
    7: [("Medidas de execução", 2), ("Quadro e console", 3), ("Parar e retomar", 1),
        ("Rodadas automáticas", 2), ("Segredos", 2)],
    8: [("Projetos de teste", 2), ("Medição", 3), ("Máquina de 8 GB", 1),
        ("Falhas provocadas", 2)],
    9: [("Correções", 4), ("Ajuste de desenho", 3), ("Nova medição", 2)],
    10: [("Último ciclo", 2), ("Versão congelada", 1), ("Medição final", 1),
         ("Documento de entrega", 2)],
}


def dias(n):
    """Dias uteis somados das tarefas da etapa `n`."""
    return sum(d for _, d in PACOTES[n])


def folga(n):
    """Dias uteis da etapa que nao estao comprometidos com tarefa."""
    return cal.UTEIS[n] - dias(n)


_problemas = []
if sorted(PACOTES) != cal.NUMEROS:
    _problemas.append("as tarefas cobrem as etapas %s, mas o calendario tem %s"
                      % (sorted(PACOTES), cal.NUMEROS))
else:
    for _n, _itens in PACOTES.items():
        for _rotulo, _d in _itens:
            if len(_rotulo) > 21:
                _problemas.append("E%d: rótulo '%s' tem %d caracteres (máximo 21, senão "
                                  "vaza do cartão da figura)" % (_n, _rotulo, len(_rotulo)))
            if _d < 1:
                _problemas.append("E%d: '%s' com prazo de %d dias" % (_n, _rotulo, _d))
        if dias(_n) > cal.UTEIS[_n]:
            _problemas.append("E%d: as tarefas somam %d dias úteis, mas a etapa tem %d"
                              % (_n, dias(_n), cal.UTEIS[_n]))

if _problemas:
    raise SystemExit("pacotes_plano.py:\n  - " + "\n  - ".join(_problemas))


if __name__ == "__main__":
    for n in cal.NUMEROS:
        itens = "  ·  ".join("%d.%d %s (%d)" % (n, k + 1, r, d)
                             for k, (r, d) in enumerate(PACOTES[n]))
        print("  E%-2d  %2d de %2d úteis, folga %d" % (n, dias(n), cal.UTEIS[n], folga(n)))
        print("       %s" % itens)
    print()
    print("  total: %d dias úteis planejados, %d disponíveis, %d de folga"
          % (sum(dias(n) for n in cal.NUMEROS), cal.UTEIS_TOTAIS,
             sum(folga(n) for n in cal.NUMEROS)))
