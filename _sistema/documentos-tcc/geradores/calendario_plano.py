# -*- coding: utf-8 -*-
"""O CALENDARIO do plano de desenvolvimento — fonte unica de todas as datas.

As figuras (figuras_plano.py) e o texto (plano_corpo.py) leem daqui. Antes, as
datas eram repetidas a mao em ~15 lugares do texto, e a data de inicio mudou duas
vezes: de 13/04 para 04/09, e de 04/09 para 11/09 com prazo em 26/01. Mudar o
calendario agora e mexer SO neste arquivo.

    python calendario_plano.py      # imprime o calendario resultante e confere o prazo
"""
import datetime

# ------------------------------------------------------------------- o que se edita
INICIO = datetime.date(2026, 9, 11)         # dia 1 da E1
PRAZO_FINAL = datetime.date(2027, 1, 26)    # entrega do TCC — nao pode ser ultrapassado
DIAS_POR_ETAPA = 15

# Recesso de fim de ano, entre duas etapas. Sem ele uma etapa cairia inteira sobre o
# Natal e o Ano-Novo. None = sem recesso.
RECESSO_ANTES_DA_ETAPA = 8
DIAS_RECESSO = 15

FASES = {
    "plan": "Planejamento",
    "desenv": "Desenvolvimento",
    "valid": "Validação",
}

# (numero, nome curto usado nas figuras, fase)
ETAPAS = [
    (1, "Requisitos e estado da arte", "plan"),
    (2, "Arquitetura e ambiente", "plan"),
    (3, "Fundação, agente e ferramentas", "desenv"),
    (4, "Linha de produção de tarefas", "desenv"),
    (5, "Integração e execução em paralelo", "desenv"),
    (6, "Memória e painel", "desenv"),
    (7, "Testes com projetos reais", "valid"),
    (8, "Ajustes finais e entrega", "valid"),
]


# ------------------------------------------------------------------ o que se deduz
def _montar():
    datas, recesso, d = {}, None, INICIO
    for numero, _, _ in ETAPAS:
        if RECESSO_ANTES_DA_ETAPA is not None and numero == RECESSO_ANTES_DA_ETAPA:
            recesso = (d, d + datetime.timedelta(days=DIAS_RECESSO - 1))
            d += datetime.timedelta(days=DIAS_RECESSO)
        datas[numero] = (d, d + datetime.timedelta(days=DIAS_POR_ETAPA - 1))
        d += datetime.timedelta(days=DIAS_POR_ETAPA)
    return datas, recesso


DATAS, RECESSO = _montar()
NUMEROS = [n for n, _, _ in ETAPAS]
NOME = {n: nome for n, nome, _ in ETAPAS}
FASE = {n: fase for n, _, fase in ETAPAS}
N_ETAPAS = len(ETAPAS)

FIM_DA_ULTIMA_ETAPA = DATAS[NUMEROS[-1]][1]
MARGEM = (PRAZO_FINAL - FIM_DA_ULTIMA_ETAPA).days
DIAS_TOTAIS = (PRAZO_FINAL - INICIO).days + 1

if MARGEM < 0:
    raise SystemExit("O calendario passa do prazo final: a ultima etapa termina em %s, "
                     "o prazo e %s. Tire uma etapa ou encurte o recesso."
                     % (FIM_DA_ULTIMA_ETAPA.strftime("%d/%m/%Y"),
                        PRAZO_FINAL.strftime("%d/%m/%Y")))


def etapas_da_fase(fase):
    return [n for n in NUMEROS if FASE[n] == fase]


def dias_da_fase(fase):
    return len(etapas_da_fase(fase)) * DIAS_POR_ETAPA


INICIO_DESENVOLVIMENTO = DATAS[etapas_da_fase("desenv")[0]][0]
FIM_DESENVOLVIMENTO = DATAS[etapas_da_fase("desenv")[-1]][1]


def br(data, ano=True):
    """04/09/2026, ou 04/09 com ano=False."""
    return data.strftime("%d/%m/%Y" if ano else "%d/%m")


def faixa(fase):
    """'E3 a E6' — o intervalo de etapas de uma fase, por extenso."""
    ns = etapas_da_fase(fase)
    if len(ns) == 1:
        return "E%d" % ns[0]
    if len(ns) == 2:
        return "E%d e E%d" % (ns[0], ns[1])
    return "E%d a E%d" % (ns[0], ns[-1])


if __name__ == "__main__":
    for n in NUMEROS:
        if RECESSO and n == RECESSO_ANTES_DA_ETAPA:
            print("  recesso   %s a %s" % (br(RECESSO[0]), br(RECESSO[1])))
        ini, fim = DATAS[n]
        print("  E%-2d       %s a %s   %-15s %s" % (n, br(ini), br(fim), FASES[FASE[n]], NOME[n]))
    print()
    print("  inicio do projeto        %s" % br(INICIO))
    print("  inicio do desenvolvimento %s" % br(INICIO_DESENVOLVIMENTO))
    print("  fim do desenvolvimento   %s" % br(FIM_DESENVOLVIMENTO))
    print("  fim da ultima etapa      %s" % br(FIM_DA_ULTIMA_ETAPA))
    print("  prazo final              %s   (%d dias de margem)" % (br(PRAZO_FINAL), MARGEM))
    print("  total                    %d dias corridos" % DIAS_TOTAIS)
