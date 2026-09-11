# -*- coding: utf-8 -*-
"""Figuras do PLANO DE DESENVOLVIMENTO.

Gera PNGs em figs_plano/. Paleta identica a dos documentos de arquitetura
(documento7_base.py), para que os documentos pareçam da mesma familia.

As datas NAO moram aqui: vem de calendario_plano.py, o mesmo arquivo que o texto
le. Mudar prazo, etapa ou recesso e mexer so la, e as duas figuras de tempo se
redesenham sozinhas.

    fig1_visao_geral   linha do tempo mestra, com inicio e fim do desenvolvimento
    fig2_cronograma    uma barra por etapa, com recesso e prazo final
    fig3_arquitetura   as quatro camadas do sistema
    fig4_ciclo         os seis estados de uma tarefa e os dois portoes

O numero do arquivo e o numero da figura NO DOCUMENTO.

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
from matplotlib.ticker import FixedLocator, FuncFormatter

import calendario_plano as cal

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

COR_FASE = {"plan": ROXO, "desenv": AZUL, "valid": VERDE}
UM_DIA = datetime.timedelta(days=1)

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


def salvar(fig, nome):
    fig.savefig(os.path.join(SAIDA, nome), dpi=200, bbox_inches="tight", pad_inches=0.06)
    plt.close(fig)
    print("  ", nome)


def trechos():
    """A linha do tempo em trechos contiguos: etapas vizinhas da mesma fase fundidas,
    o recesso no lugar dele, e a margem entre a ultima etapa e o prazo final."""
    lista = []
    for n in cal.NUMEROS:
        if cal.RECESSO and n == cal.RECESSO_ANTES_DA_ETAPA:
            lista.append({"tipo": "recesso", "inicio": cal.RECESSO[0], "fim": cal.RECESSO[1]})
        ini, fim = cal.DATAS[n]
        ultimo = lista[-1] if lista else None
        if ultimo and ultimo["tipo"] == "fase" and ultimo["fase"] == cal.FASE[n]:
            ultimo["etapas"].append(n)
            ultimo["fim"] = fim
        else:
            lista.append({"tipo": "fase", "fase": cal.FASE[n], "etapas": [n],
                          "inicio": ini, "fim": fim})
    if cal.MARGEM > 0:
        lista.append({"tipo": "margem", "inicio": cal.FIM_DA_ULTIMA_ETAPA + UM_DIA,
                      "fim": cal.PRAZO_FINAL})
    return lista


def rotulo_etapas(ns):
    return "E%d" % ns[0] if len(ns) == 1 else "E%d–E%d" % (ns[0], ns[-1])


# ------------------------------------------------------------- 1. visao geral
def fig_visao_geral():
    """A figura da primeira pagina. Quem so olhar para ela tem de sair sabendo quando
    o projeto comeca, quando o desenvolvimento comeca e termina, e qual e o prazo."""
    fig, ax = plt.subplots(figsize=(10.2, 2.75))
    ax.set_xlim(-1.5, 101.5)
    ax.set_ylim(0, 36)
    ax.axis("off")
    total = cal.DIAS_TOTAIS

    def x_de(data):
        return (data - cal.INICIO).days / total * 100.0

    for tr in trechos():
        x = x_de(tr["inicio"])
        w = ((tr["fim"] - tr["inicio"]).days + 1) / total * 100.0
        if tr["tipo"] == "recesso":
            ax.add_patch(mpatches.Rectangle((x, 12), w, 9, facecolor="#EDEDE9",
                                            edgecolor="white", linewidth=1.6, zorder=3))
            ax.text(x + w / 2, 16.5, "recesso", ha="center", va="center", rotation=90,
                    fontsize=6.4, color=MUDO, fontweight="bold", zorder=4)
        elif tr["tipo"] == "margem":
            ax.add_patch(mpatches.Rectangle((x, 12), w, 9, facecolor="#F6F6F3",
                                            edgecolor="#CFCFCA", linewidth=0.8,
                                            hatch="////", zorder=3))
        else:
            cor = COR_FASE[tr["fase"]]
            ax.add_patch(mpatches.Rectangle((x, 12), w, 9, facecolor=cor,
                                            edgecolor="white", linewidth=1.6, zorder=3))
            estreito = w < 16
            dias = len(tr["etapas"]) * cal.DIAS_POR_ETAPA
            ax.text(x + w / 2, 18.1, cal.FASES[tr["fase"]].upper(), ha="center",
                    va="center", color="white", fontsize=7.0 if estreito else 8.6,
                    fontweight="bold", zorder=4)
            ax.text(x + w / 2, 14.8, "%s · %d dias" % (rotulo_etapas(tr["etapas"]), dias),
                    ha="center", va="center", color="white",
                    fontsize=6.4 if estreito else 7.2, zorder=4)

    marcadores = ((x_de(cal.INICIO_DESENVOLVIMENTO), "INÍCIO DO DESENVOLVIMENTO",
                   cal.INICIO_DESENVOLVIMENTO),
                  (x_de(cal.FIM_DESENVOLVIMENTO + UM_DIA), "FIM DO DESENVOLVIMENTO",
                   cal.FIM_DESENVOLVIMENTO))
    for cx, rotulo, data in marcadores:
        ax.add_patch(FancyArrowPatch((cx, 27.2), (cx, 21.6), arrowstyle="-|>",
                                     mutation_scale=13, color=AZUL, linewidth=2.0, zorder=5))
        ax.text(cx, 30.6, "%s\n%s" % (rotulo, cal.br(data)), ha="center", va="center",
                fontsize=7.6, color="white", fontweight="bold", zorder=6, linespacing=1.5,
                bbox=dict(boxstyle="round,pad=0.42", facecolor=AZUL, edgecolor="none"))

    ax.text(0, 9.6, "INÍCIO DO PROJETO", ha="left", va="center", fontsize=7,
            color=CINZA, fontweight="bold")
    ax.text(0, 6.4, cal.br(cal.INICIO), ha="left", va="center", fontsize=8.6,
            color=TINTA, fontweight="bold")
    ax.text(100, 9.6, "PRAZO FINAL", ha="right", va="center", fontsize=7,
            color=VERDE, fontweight="bold")
    ax.text(100, 6.4, cal.br(cal.PRAZO_FINAL), ha="right", va="center", fontsize=8.6,
            color=TINTA, fontweight="bold")
    ax.text(50, 6.4, "%d dias  ·  %d etapas de %d dias  ·  %d dias de margem"
            % (total, cal.N_ETAPAS, cal.DIAS_POR_ETAPA, cal.MARGEM),
            ha="center", va="center", fontsize=8, color=MUDO)
    salvar(fig, "fig1_visao_geral.png")


# -------------------------------------------------------------- 2. cronograma
def fig_cronograma():
    linhas = []
    for n in cal.NUMEROS:
        if cal.RECESSO and n == cal.RECESSO_ANTES_DA_ETAPA:
            linhas.append(None)                  # a linha do recesso
        linhas.append(n)

    fig, ax = plt.subplots(figsize=(10.2, 1.1 + 0.36 * len(linhas)))
    x0 = mdates.date2num(cal.INICIO)
    x_prazo = mdates.date2num(cal.PRAZO_FINAL + UM_DIA)
    rotulo_x = x0 - 4
    esquerda, direita = x0 - 72, x_prazo + 12
    topo = len(linhas) - 1

    for i, n in enumerate(linhas):
        y = topo - i
        if n is None:
            ini, fim = cal.RECESSO
            dias = (fim - ini).days + 1
            inicio_barra = mdates.date2num(ini)
            ax.barh(y, dias, left=inicio_barra, height=0.46, color="#EDEDE9",
                    edgecolor="#D5D5D0", linewidth=0.8, zorder=3)
            ax.text(inicio_barra + dias / 2, y, "recesso", ha="center", va="center",
                    fontsize=6.6, color=MUDO, zorder=4)
            ax.text(rotulo_x, y, "Recesso de fim de ano", ha="right", va="center",
                    color=MUDO, fontsize=8.0, style="italic", zorder=4)
        else:
            ini, _ = cal.DATAS[n]
            inicio_barra = mdates.date2num(ini)
            ax.barh(y, cal.DIAS_POR_ETAPA, left=inicio_barra, height=0.62,
                    color=COR_FASE[cal.FASE[n]], edgecolor="white", linewidth=1.1, zorder=3)
            ax.text(inicio_barra + cal.DIAS_POR_ETAPA / 2, y, "E%d" % n, ha="center",
                    va="center", color="white", fontsize=7.4, fontweight="bold", zorder=4)
            ax.text(rotulo_x, y, "E%d   %s" % (n, cal.NOME[n]), ha="right", va="center",
                    color=TINTA, fontsize=8.2, zorder=4)
        ax.plot([rotulo_x + 1.5, inicio_barra - 1], [y, y], color="#E6E6E2",
                linewidth=0.7, zorder=1)

    marcos = ((cal.INICIO_DESENVOLVIMENTO, "início do desenvolvimento", AZUL),
              (cal.FIM_DESENVOLVIMENTO + UM_DIA, "fim do desenvolvimento", AZUL),
              (cal.PRAZO_FINAL + UM_DIA, "prazo final", VERDE))
    for data, texto, cor in marcos:
        xv = mdates.date2num(data)
        ax.plot([xv, xv], [-1.15, topo + 0.55], color=cor, linewidth=1.2,
                linestyle=(0, (5, 3)), zorder=2)
        ax.text(xv, topo + 0.7, texto, ha="center", va="bottom", fontsize=6.9,
                color="white", fontweight="bold", zorder=6,
                bbox=dict(boxstyle="round,pad=0.3", facecolor=cor, edgecolor="none"))

    for fase in ("plan", "desenv", "valid"):
        ns = cal.etapas_da_fase(fase)
        xa = mdates.date2num(cal.DATAS[ns[0]][0])
        xb = mdates.date2num(cal.DATAS[ns[-1]][1] + UM_DIA)
        ax.plot([xa, xb - 0.8], [-1.0, -1.0], color=COR_FASE[fase], linewidth=3.4,
                solid_capstyle="butt", zorder=3)
        ax.text((xa + xb) / 2, -1.38, cal.FASES[fase].upper(), ha="center", va="center",
                fontsize=6.9, color=COR_FASE[fase], fontweight="bold")

    ax.set_ylim(-1.75, topo + 1.6)
    ax.set_xlim(esquerda, direita)

    # Marcas so nos meses do projeto: com o locator automatico a coluna de rotulos
    # ganhava meses vazios de antes do inicio.
    marcas, d = [], datetime.date(cal.INICIO.year, cal.INICIO.month, 1)
    while True:
        d = datetime.date(d.year + (d.month == 12), d.month % 12 + 1, 1)
        if mdates.date2num(d) > direita:
            break
        marcas.append(mdates.date2num(d))
    ax.xaxis.set_major_locator(FixedLocator(marcas))
    ax.xaxis.set_major_formatter(FuncFormatter(
        lambda v, _: "%s/%02d" % (MESES[mdates.num2date(v).month - 1],
                                  mdates.num2date(v).year % 100)))
    ax.grid(axis="x", color="#EDEDE9", linewidth=0.8, zorder=0)
    ax.set_yticks([])
    ax.tick_params(axis="x", labelsize=7.4, length=0, pad=4)
    for lado in ("top", "right", "left"):
        ax.spines[lado].set_visible(False)
    ax.spines["bottom"].set_color("#D9D9D6")
    salvar(fig, "fig2_cronograma.png")


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
          ["Trocável: escolhido por medição, não por palpite"], ROXO, "#EFEDFA")

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
    salvar(fig, "fig3_arquitetura.png")


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

    # Retorno por reprovacao: polilinha explicita por BAIXO da fileira. arc3 curvava
    # para cima e o percurso ficava escondido atras das caixas.
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
    salvar(fig, "fig4_ciclo.png")


if __name__ == "__main__":
    print("calendario: %s a %s (%d dias, %d de margem)"
          % (cal.br(cal.INICIO), cal.br(cal.PRAZO_FINAL), cal.DIAS_TOTAIS, cal.MARGEM))
    print("  desenvolvimento: %s a %s"
          % (cal.br(cal.INICIO_DESENVOLVIMENTO), cal.br(cal.FIM_DESENVOLVIMENTO)))
    print("gerando figuras em", SAIDA)
    fig_visao_geral()
    fig_cronograma()
    fig_arquitetura()
    fig_ciclo()
    print("pronto.")
