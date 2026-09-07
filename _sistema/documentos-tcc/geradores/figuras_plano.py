# -*- coding: utf-8 -*-
"""Figuras do PLANO DE DESENVOLVIMENTO.

Gera PNGs em figs_plano/. Paleta identica a dos documentos de arquitetura
(documento7_base.py), para que os dois documentos pareçam da mesma familia.

Quatro figuras, de proposito — o documento e curto e cada figura precisa
carregar informacao que nenhuma tabela carrega melhor:

    fig1_visao_geral   linha do tempo mestra, com inicio e fim do desenvolvimento
    fig2_arquitetura   as quatro camadas do sistema
    fig3_ciclo         os seis estados de uma tarefa e os dois portoes
    fig4_cronograma    as 13 etapas, uma barra cada

O numero do arquivo e o numero da figura NO DOCUMENTO — nao a ordem em que
sao geradas aqui.

    python figuras_plano.py
"""
import datetime
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch
from matplotlib.ticker import FuncFormatter

# O locale do matplotlib e o do sistema (en_US nesta maquina), entao o nome do mes
# vem em ingles se deixado por conta do DateFormatter. Formatamos a mao.
MESES = ["jan", "fev", "mar", "abr", "mai", "jun",
         "jul", "ago", "set", "out", "nov", "dez"]

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, "figs_plano")
os.makedirs(SAIDA, exist_ok=True)

AZUL = "#184F95"
AZUL_CLARO = "#2A78D6"
TINTA = "#0B0B0B"
CINZA = "#52514E"
MUDO = "#898781"
ROXO = "#4A3AA7"
VERDE = "#14865D"
LARANJA = "#C24E1E"
VERMELHO = "#B52C2C"
PAPEL = "#FFFFFF"

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 8,
    "axes.edgecolor": "#D9D9D6",
    "text.color": TINTA,
    "axes.labelcolor": CINZA,
    "xtick.color": CINZA,
    "ytick.color": CINZA,
    "figure.facecolor": PAPEL,
    "savefig.facecolor": PAPEL,
})

# ------------------------------------------------------------------ o calendario
INICIO = datetime.date(2026, 9, 4)
# O recesso de fim de ano entra ANTES da E8. Sem ele a etapa cairia inteira
# sobre o Natal e o Ano-Novo, e o prazo deixaria de ser realista.
RECESSO_ANTES_DE = 8
DIAS_RECESSO = 15

FASES = {
    "plan": ("PLANEJAMENTO", ROXO),
    "desenv": ("DESENVOLVIMENTO", AZUL),
    "valid": ("VALIDAÇÃO", VERDE),
}

ETAPAS = [
    (1, "Requisitos e viabilidade", "plan"),
    (2, "Estado da arte e linha de base", "plan"),
    (3, "Projeto da arquitetura", "plan"),
    (4, "Projeto detalhado e ambiente", "plan"),
    (5, "Fundação do sistema", "desenv"),
    (6, "O agente e as ferramentas", "desenv"),
    (7, "Linha de produção de tarefas", "desenv"),
    (8, "Integração com o fornecedor", "desenv"),
    (9, "Execução em paralelo", "desenv"),
    (10, "Memória do projeto", "desenv"),
    (11, "Painel de acompanhamento", "desenv"),
    (12, "Testes com projetos reais", "valid"),
    (13, "Ajustes finais e entrega", "valid"),
]


def calendario():
    """Devolve {numero: (inicio, fim)} e o par (inicio, fim) do recesso."""
    datas, recesso, d = {}, None, INICIO
    for numero, _, _ in ETAPAS:
        if numero == RECESSO_ANTES_DE:
            recesso = (d, d + datetime.timedelta(days=DIAS_RECESSO - 1))
            d += datetime.timedelta(days=DIAS_RECESSO)
        datas[numero] = (d, d + datetime.timedelta(days=14))
        d = d + datetime.timedelta(days=15)
    return datas, recesso


DATAS, RECESSO = calendario()
FIM = DATAS[13][1]


def br(data):
    return data.strftime("%d/%m/%Y")


def salvar(fig, nome):
    fig.savefig(os.path.join(SAIDA, nome), dpi=200, bbox_inches="tight", pad_inches=0.06)
    plt.close(fig)
    print("  ", nome)


# ------------------------------------------------------------- 1. visao geral
def fig_visao_geral():
    """A figura da primeira pagina: as tres fases e onde o desenvolvimento comeca
    e termina. E a unica coisa que alguem precisa ver para entender o plano."""
    fig, ax = plt.subplots(figsize=(10.2, 2.7))
    ax.set_xlim(-1.5, 101.5)
    ax.set_ylim(0, 36)
    ax.axis("off")

    total = (FIM - INICIO).days + 1
    x, largura_util = 0.0, 100.0

    blocos = [
        ("plan", "PLANEJAMENTO", "E1–E4", 60),
        ("recesso", "RECESSO", "", DIAS_RECESSO),
        ("desenv", "DESENVOLVIMENTO", "E5–E11", 105),
        ("valid", "VALIDAÇÃO", "E12–E13", 30),
    ]
    bordas = [0.0]
    for chave, titulo, sub, dias in blocos:
        w = dias / total * largura_util
        if chave == "recesso":
            ax.add_patch(mpatches.Rectangle((x, 12), w, 9, facecolor="#EDEDE9",
                                            edgecolor="white", linewidth=1.6, zorder=3))
            ax.text(x + w / 2, 16.5, "recesso", ha="center", va="center", rotation=90,
                    fontsize=6.4, color=MUDO, fontweight="bold", zorder=4)
        else:
            cor = FASES[chave][1]
            ax.add_patch(mpatches.Rectangle((x, 12), w, 9, facecolor=cor,
                                            edgecolor="white", linewidth=1.6, zorder=3))
            estreito = w < 20
            ax.text(x + w / 2, 18.1, titulo, ha="center", va="center", color="white",
                    fontsize=7.4 if estreito else 8.6, fontweight="bold", zorder=4)
            ax.text(x + w / 2, 14.8, "%s · %d dias" % (sub, dias), ha="center",
                    va="center", color="white", fontsize=6.6 if estreito else 7.2, zorder=4)
        x += w
        bordas.append(x)

    inicio_dev, fim_dev = bordas[2], bordas[3]

    # os dois marcadores que o plano precisa deixar obvios
    for cx, rotulo, data, cor in ((inicio_dev, "INÍCIO DO DESENVOLVIMENTO", DATAS[5][0], AZUL),
                                  (fim_dev, "FIM DO DESENVOLVIMENTO", DATAS[11][1], AZUL)):
        ax.add_patch(FancyArrowPatch((cx, 27.2), (cx, 21.6), arrowstyle="-|>",
                                     mutation_scale=13, color=cor, linewidth=2.0, zorder=5))
        ax.text(cx, 30.6, "%s\n%s" % (rotulo, br(data)), ha="center", va="center",
                fontsize=7.6, color="white", fontweight="bold", zorder=6, linespacing=1.5,
                bbox=dict(boxstyle="round,pad=0.42", facecolor=cor, edgecolor="none"))

    # as duas pontas do projeto
    ax.text(0, 9.6, "INÍCIO DO PROJETO", ha="left", va="center", fontsize=7,
            color=CINZA, fontweight="bold")
    ax.text(0, 6.4, br(INICIO), ha="left", va="center", fontsize=8.6, color=TINTA,
            fontweight="bold")
    ax.text(100, 9.6, "ENTREGA FINAL", ha="right", va="center", fontsize=7,
            color=CINZA, fontweight="bold")
    ax.text(100, 6.4, br(FIM), ha="right", va="center", fontsize=8.6, color=TINTA,
            fontweight="bold")
    ax.text(50, 6.4, "%d dias  ·  13 etapas de 15 dias" % total, ha="center",
            va="center", fontsize=8, color=MUDO)
    salvar(fig, "fig1_visao_geral.png")


# -------------------------------------------------------------- 2. cronograma
def fig_cronograma():
    fig, ax = plt.subplots(figsize=(10.2, 4.8))
    x0 = mdates.date2num(INICIO)
    rotulo_x = x0 - 5
    esquerda = x0 - 104

    for i, (numero, nome, fase) in enumerate(ETAPAS):
        y = len(ETAPAS) - 1 - i
        ini, fim = DATAS[numero]
        cor = FASES[fase][1]
        ax.barh(y, 15, left=mdates.date2num(ini), height=0.62, color=cor,
                edgecolor="white", linewidth=1.1, zorder=3)
        ax.text(mdates.date2num(ini) + 7.5, y, "E%d" % numero, ha="center", va="center",
                color="white", fontsize=7.4, fontweight="bold", zorder=4)
        ax.text(rotulo_x, y, "E%-2d  %s" % (numero, nome), ha="right", va="center",
                color=TINTA, fontsize=8.2, zorder=4)
        ax.plot([rotulo_x + 1.5, mdates.date2num(ini) - 1], [y, y],
                color="#E6E6E2", linewidth=0.7, zorder=1)

    # o recesso, na faixa da etapa que ele antecede
    yr = len(ETAPAS) - 1 - (RECESSO_ANTES_DE - 1) + 0.5
    ax.barh(yr, DIAS_RECESSO, left=mdates.date2num(RECESSO[0]), height=0.34,
            color="#EDEDE9", edgecolor="#D5D5D0", linewidth=0.8, zorder=3)
    ax.text(mdates.date2num(RECESSO[0]) + DIAS_RECESSO / 2, yr, "recesso",
            ha="center", va="center", fontsize=6.2, color=MUDO, zorder=4)

    # as linhas que marcam onde o desenvolvimento comeca e termina
    for data, texto in ((DATAS[5][0], "início do desenvolvimento"),
                        (DATAS[11][1] + datetime.timedelta(days=1), "fim do desenvolvimento")):
        xv = mdates.date2num(data)
        ax.plot([xv, xv], [-1.5, len(ETAPAS) - 0.4], color=AZUL, linewidth=1.2,
                linestyle=(0, (5, 3)), zorder=2)
        ax.text(xv, len(ETAPAS) - 0.3, texto, ha="center", va="bottom", fontsize=6.9,
                color="white", fontweight="bold", zorder=6,
                bbox=dict(boxstyle="round,pad=0.3", facecolor=AZUL, edgecolor="none"))

    ax.set_ylim(-1.9, len(ETAPAS) + 0.5)
    ax.set_xlim(esquerda, mdates.date2num(FIM) + 16)
    ax.xaxis.set_major_locator(mdates.MonthLocator())
    ax.xaxis.set_major_formatter(FuncFormatter(
        lambda v, _: "%s/%02d" % (MESES[mdates.num2date(v).month - 1],
                                  mdates.num2date(v).year % 100)))
    ax.grid(axis="x", color="#EDEDE9", linewidth=0.8, zorder=0)
    ax.set_yticks([])
    ax.tick_params(axis="x", labelsize=7.4, length=0, pad=4)
    for lado in ("top", "right", "left"):
        ax.spines[lado].set_visible(False)
    ax.spines["bottom"].set_color("#D9D9D6")

    faixas = [(1, 4, "plan"), (5, 11, "desenv"), (12, 13, "valid")]
    for a, b, fase in faixas:
        xa = mdates.date2num(DATAS[a][0])
        xb = mdates.date2num(DATAS[b][1])
        ax.plot([xa, xb], [-1.45, -1.45], color=FASES[fase][1], linewidth=3.4,
                solid_capstyle="butt", zorder=3)
        ax.text((xa + xb) / 2, -1.75, FASES[fase][0], ha="center", va="center",
                fontsize=6.9, color=FASES[fase][1], fontweight="bold")
    salvar(fig, "fig4_cronograma.png")


# ------------------------------------------------------------- 3. arquitetura
def fig_arquitetura():
    fig, ax = plt.subplots(figsize=(10.2, 5.2))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 62)
    ax.axis("off")

    def bloco(x, y, w, h, titulo, itens, cor, fundo, tam=8.2):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.25,rounding_size=0.8",
                                    facecolor=fundo, edgecolor=cor, linewidth=1.3, zorder=2))
        ax.text(x + 1.6, y + h - 2.6, titulo, fontsize=tam, fontweight="bold",
                color=cor, va="center", zorder=3)
        for k, it in enumerate(itens):
            ax.text(x + 1.6, y + h - 5.6 - k * 3.0, it, fontsize=7.3, color=CINZA,
                    va="center", zorder=3)

    def faixa(y, h, texto, cor, tam=7.0):
        ax.add_patch(mpatches.Rectangle((0, y), 4.4, h, facecolor=cor, edgecolor="none", zorder=2))
        ax.text(2.2, y + h / 2, texto, fontsize=tam, color="white", fontweight="bold",
                rotation=90, ha="center", va="center", zorder=3)

    faixa(48, 12, "TELA", VERDE)
    bloco(6, 48, 44, 12, "Painel ao vivo",
          ["Quadro de tarefas por estado · console do agente",
           "custo da rodada · parar e retomar"], VERDE, "#EAF7F1")
    bloco(53, 48, 41, 12, "Automação das rodadas",
          ["Encadeia rodadas até um critério de parada",
           "teto de gasto e de rodadas obrigatórios"], VERDE, "#EAF7F1")

    faixa(27, 18.5, "MOTOR", AZUL)
    bloco(6, 27, 28, 18.5, "Máquina de tarefas",
          ["Seis estados", "mudança de estado em transação",
           "dois portões independentes", "escada de resposta à falha"], AZUL, "#EAF2FD")
    bloco(37, 27, 27, 18.5, "Supervisão dos agentes",
          ["Um processo por agente em voo",
           "cada um com dono e endereço",
           "matar um não derruba os outros"], AZUL, "#EAF2FD")
    bloco(67, 27, 27, 18.5, "Ferramentas confinadas",
          ["ler · escrever · editar · buscar",
           "rodar comando, com prazo",
           "registrar resultado"], AZUL, "#EAF2FD")

    faixa(15, 9.5, "FRONTEIRAS", ROXO, tam=5.6)
    bloco(6, 15, 44, 9.5, "Fornecedor de modelo",
          ["Trocável: entra como adaptador, sem mexer no motor"], ROXO, "#EFEDFA")
    bloco(53, 15, 41, 9.5, "Mecanismo de busca",
          ["Trocável: escolhido por medição na Etapa 10"], ROXO, "#EFEDFA")

    faixa(1, 11, "DADOS", LARANJA)
    bloco(6, 1, 28, 11, "Banco de dados",
          ["Projetos, tarefas, ciclos,", "despachos e custos"], LARANJA, "#FCF0EA")
    bloco(37, 1, 27, 11, "Fila de trabalhos",
          ["Enfileirar e mudar o estado", "da tarefa na mesma transação"], LARANJA, "#FCF0EA")
    bloco(67, 1, 27, 11, "Memória do projeto",
          ["Histórico consultável, com", "a fonte de cada informação"], LARANJA, "#FCF0EA")

    for y0, y1 in ((48, 45.8), (27, 24.8), (15, 12.2)):
        for x in (20, 50, 80):
            ax.add_patch(FancyArrowPatch((x, y0), (x, y1), arrowstyle="-|>",
                                         mutation_scale=8, color="#C9C9C4",
                                         linewidth=1.0, zorder=1))
    salvar(fig, "fig2_arquitetura.png")


# ------------------------------------------------------------------- 4. ciclo
def fig_ciclo():
    fig, ax = plt.subplots(figsize=(10.2, 3.05))
    ax.set_xlim(0, 100)
    ax.set_ylim(1.6, 34)
    ax.axis("off")

    estados = [("na fila", MUDO), ("pronta", AZUL_CLARO), ("em execução", AZUL),
               ("em teste", LARANJA), ("em revisão", ROXO), ("concluída", VERDE)]
    w, gap = 14.2, 2.6
    x, centros = 1.5, []
    for nome, cor in estados:
        ax.add_patch(FancyBboxPatch((x, 18), w, 7.4,
                                    boxstyle="round,pad=0.2,rounding_size=0.7",
                                    facecolor=cor, edgecolor="none", zorder=3))
        ax.text(x + w / 2, 21.7, nome, ha="center", va="center", color="white",
                fontsize=8.3, fontweight="bold", zorder=4)
        centros.append(x + w / 2)
        x += w + gap

    for i in range(len(estados) - 1):
        ax.add_patch(FancyArrowPatch((centros[i] + w / 2 + 0.3, 21.7),
                                     (centros[i + 1] - w / 2 - 0.5, 21.7),
                                     arrowstyle="-|>", mutation_scale=10,
                                     color=CINZA, linewidth=1.2, zorder=2))

    for cx, nome, cor in ((centros[2], "quem constrói", AZUL),
                          (centros[3], "quem testa", LARANJA),
                          (centros[4], "quem revisa", ROXO)):
        ax.text(cx, 27.6, nome, ha="center", va="center", fontsize=7.6,
                color=cor, fontweight="bold")

    for cx, pergunta, cor in ((centros[3], "funciona?", LARANJA),
                              (centros[4], "é o que foi pedido?", ROXO)):
        ax.text(cx, 30.8, pergunta, ha="center", va="center", fontsize=7.8,
                color="white", fontweight="bold", zorder=4,
                bbox=dict(boxstyle="round,pad=0.34", facecolor=cor, edgecolor="none"))

    for origem, nivel, desloc in ((3, 14.4, 2.8), (4, 10.8, -2.8)):
        xa, xb = centros[origem], centros[2] + desloc
        ax.plot([xa, xa, xb, xb], [17.9, nivel, nivel, 16.6], color=VERMELHO,
                linewidth=1.15, linestyle=(0, (4, 2.6)), solid_capstyle="butt", zorder=5)
        ax.add_patch(FancyArrowPatch((xb, 16.9), (xb, 17.9), arrowstyle="-|>",
                                     mutation_scale=9, color=VERMELHO,
                                     linewidth=1.15, zorder=5))
    ax.text((centros[2] + centros[5]) / 2, 6.8,
            "reprovada — volta para execução, com o relatório do que faltou",
            ha="center", va="center", fontsize=7.6, color=VERMELHO)
    ax.text((centros[2] + centros[5]) / 2, 3.4,
            "no 4º ciclo a tarefa é bloqueada; quem conta os ciclos é o sistema, não o agente",
            ha="center", va="center", fontsize=7.3, color=MUDO)
    ax.text(1.5, 30.8, "os dois portões,\nduas perguntas", fontsize=8, color=TINTA,
            fontweight="bold", va="center", ha="left")
    salvar(fig, "fig3_ciclo.png")


if __name__ == "__main__":
    print("calendario: %s a %s (%d dias)" % (br(INICIO), br(FIM), (FIM - INICIO).days + 1))
    print("  desenvolvimento: %s a %s" % (br(DATAS[5][0]), br(DATAS[11][1])))
    print("gerando figuras em", SAIDA)
    fig_visao_geral()
    fig_arquitetura()
    fig_ciclo()
    fig_cronograma()
    print("pronto.")
