# -*- coding: utf-8 -*-
"""O CALENDARIO do plano de desenvolvimento — fonte unica de todas as datas.

As figuras (figuras_plano.py) e o texto (plano_corpo.py) leem daqui. Antes, as
datas eram repetidas a mao em ~15 lugares do texto, e o calendario ja mudou quatro
vezes. Mudar o calendario e mexer SO neste arquivo.

    python calendario_plano.py      # imprime o calendario resultante e confere o prazo
"""
import datetime

# ------------------------------------------------------------------- o que se edita
INICIO = datetime.date(2026, 9, 4)          # dia 1 da E1
PRAZO_FINAL = datetime.date(2027, 1, 26)    # inicio das aulas — nao pode ser ultrapassado
DIAS_POR_ETAPA = 15

# A ultima etapa vai ate o prazo final, e por isso pode ser mais curta (ou mais longa)
# que as outras. Hoje ela tem 10 dias: a validacao usa as ferias ate o primeiro dia de
# aula, sem sobra e sem estouro.
ULTIMA_ETAPA_ATE_O_PRAZO = True

# Pausa entre duas etapas. None = sem pausa. O plano atual nao tem: as ferias sao usadas
# para validar e refinar o sistema.
RECESSO_ANTES_DA_ETAPA = None
DIAS_RECESSO = 15

FASES = {
    "plan": "Planejamento",
    "desenv": "Desenvolvimento",
    "valid": "Validação e refinamento",
}

# (numero, nome curto usado nas figuras, fase)
ETAPAS = [
    (1, "Requisitos e estado da arte", "plan"),
    (2, "Arquitetura e ambiente", "plan"),
    (3, "Fundação, agente e ferramentas", "desenv"),
    (4, "Linha de produção de tarefas", "desenv"),
    (5, "Integração e execução em paralelo", "desenv"),
    (6, "Memória do projeto", "desenv"),
    (7, "Painel e automação", "desenv"),
    (8, "Testes com projetos reais", "valid"),
    (9, "Refinamento", "valid"),
    (10, "Refinamento final e entrega", "valid"),
]


# ------------------------------------------------------------------ o que se deduz
UM_DIA = datetime.timedelta(days=1)


def _montar():
    datas, recesso, d = {}, None, INICIO
    for i, (numero, _, _) in enumerate(ETAPAS):
        if RECESSO_ANTES_DA_ETAPA is not None and numero == RECESSO_ANTES_DA_ETAPA:
            recesso = (d, d + datetime.timedelta(days=DIAS_RECESSO - 1))
            d += datetime.timedelta(days=DIAS_RECESSO)
        ultima = i == len(ETAPAS) - 1
        if ultima and ULTIMA_ETAPA_ATE_O_PRAZO:
            fim = PRAZO_FINAL
        else:
            fim = d + datetime.timedelta(days=DIAS_POR_ETAPA - 1)
        datas[numero] = (d, fim)
        d = fim + UM_DIA
    return datas, recesso


DATAS, RECESSO = _montar()
NUMEROS = [n for n, _, _ in ETAPAS]
NOME = {n: nome for n, nome, _ in ETAPAS}
FASE = {n: fase for n, _, fase in ETAPAS}
DURACAO = {n: (fim - ini).days + 1 for n, (ini, fim) in DATAS.items()}
N_ETAPAS = len(ETAPAS)

FIM_DA_ULTIMA_ETAPA = DATAS[NUMEROS[-1]][1]
MARGEM = (PRAZO_FINAL - FIM_DA_ULTIMA_ETAPA).days
DIAS_TOTAIS = (PRAZO_FINAL - INICIO).days + 1


def _br(data):
    return data.strftime("%d/%m/%Y")


if MARGEM < 0:
    raise SystemExit("O calendario passa do prazo final: a ultima etapa termina em %s, "
                     "o prazo e %s. Tire uma etapa ou encurte o recesso."
                     % (_br(FIM_DA_ULTIMA_ETAPA), _br(PRAZO_FINAL)))

if ULTIMA_ETAPA_ATE_O_PRAZO and not 5 <= DURACAO[NUMEROS[-1]] <= 2 * DIAS_POR_ETAPA:
    raise SystemExit("A ultima etapa ficou com %d dias para chegar ao prazo de %s. "
                     "Com menos de 5 ou mais de %d, acrescente ou tire uma etapa."
                     % (DURACAO[NUMEROS[-1]], _br(PRAZO_FINAL), 2 * DIAS_POR_ETAPA))


def etapas_da_fase(fase):
    return [n for n in NUMEROS if FASE[n] == fase]


def dias_da_fase(fase):
    return sum(DURACAO[n] for n in etapas_da_fase(fase))


INICIO_DESENVOLVIMENTO = DATAS[etapas_da_fase("desenv")[0]][0]
FIM_DESENVOLVIMENTO = DATAS[etapas_da_fase("desenv")[-1]][1]
ETAPAS_CHEIAS = [n for n in NUMEROS if DURACAO[n] == DIAS_POR_ETAPA]


def br(data, ano=True):
    """04/09/2026, ou 04/09 com ano=False."""
    return data.strftime("%d/%m/%Y" if ano else "%d/%m")


def faixa(fase):
    """'E3 a E7' — o intervalo de etapas de uma fase, por extenso."""
    ns = etapas_da_fase(fase)
    if len(ns) == 1:
        return "E%d" % ns[0]
    if len(ns) == 2:
        return "E%d e E%d" % (ns[0], ns[1])
    return "E%d a E%d" % (ns[0], ns[-1])


if __name__ == "__main__":
    for n in NUMEROS:
        if RECESSO and n == RECESSO_ANTES_DA_ETAPA:
            print("  recesso    %s a %s" % (br(RECESSO[0]), br(RECESSO[1])))
        ini, fim = DATAS[n]
        print("  E%-2d        %s a %s  %2d dias  %-24s %s"
              % (n, br(ini), br(fim), DURACAO[n], FASES[FASE[n]], NOME[n]))
    print()
    print("  inicio do projeto          %s" % br(INICIO))
    print("  inicio do desenvolvimento  %s" % br(INICIO_DESENVOLVIMENTO))
    print("  fim do desenvolvimento     %s" % br(FIM_DESENVOLVIMENTO))
    print("  prazo final                %s   (%d dias de margem)" % (br(PRAZO_FINAL), MARGEM))
    for fase in FASES:
        print("  %-26s %d dias (%s)" % (FASES[fase], dias_da_fase(fase), faixa(fase)))
    print("  total                      %d dias corridos" % DIAS_TOTAIS)
