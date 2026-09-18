# -*- coding: utf-8 -*-
"""Figuras do PLANO DE DESENVOLVIMENTO.

Gera PNGs em figs_plano/. Paleta identica a dos documentos de arquitetura
(documento7_base.py), para que os documentos pareçam da mesma familia.

As datas NAO moram aqui: vem de calendario_plano.py, e os pacotes da WBS vem de
pacotes_plano.py. Mudar prazo, etapa ou recesso e mexer so no calendario.

    fig1_visao_geral   linha do tempo mestra, com inicio e fim do desenvolvimento
    fig2_cascata       as tres fases do modelo em cascata, com os portoes
    fig3_cronograma    uma barra por etapa (Gantt)
    fig4_wbs           a arvore de decomposicao: projeto, fases, etapas, pacotes
    fig5_validacao     o ciclo testar -> medir -> corrigir
    fig6_arquitetura   as quatro camadas do sistema (desenho logico)
    fig7_infra         onde o sistema roda (desenho fisico)
    fig8_ciclo         os seis estados de uma tarefa e os dois portoes

O numero do arquivo e o numero da figura NO DOCUMENTO.

TODAS as figuras usam figsize de 10,2 pol de largura. Nao mude isso sem motivo: o
documento as insere com 15 a 17 cm, e e essa razao que faz o texto de todas elas
sair impresso no mesmo tamanho. Uma figura mais estreita sai com letra maior que
as vizinhas.

    python figuras_plano.py
"""
import datetime
import os
import textwrap

import matplotlib
matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch
from matplotlib.ticker import FixedLocator, FuncFormatter

import calendario_plano as cal
import pacotes_plano as pac

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


def seta(ax, de, para, cor, largura=1.3, escala=11):
    ax.add_patch(FancyArrowPatch(de, para, arrowstyle="-|>", mutation_scale=escala,
                                 color=cor, linewidth=largura, zorder=5))


def trechos():
    """A linha do tempo em trechos contiguos: etapas vizinhas da mesma fase fundidas,
    o recesso no lugar dele (se houver), e a margem ate o prazo final (se houver)."""
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
            # Tres tamanhos de fonte: um bloco de uma etapa so (~10% da largura) nao
            # comporta nem a fonte reduzida dos blocos de duas.
            if w < 12:
                tam_titulo, tam_sub = 6.2, 6.0
            elif w < 16:
                tam_titulo, tam_sub = 7.0, 6.4
            else:
                tam_titulo, tam_sub = 8.4, 7.2
            dias = sum(cal.DURACAO[n] for n in tr["etapas"])
            ax.text(x + w / 2, 18.1, cal.FASES[tr["fase"]].upper(), ha="center",
                    va="center", color="white", fontsize=tam_titulo,
                    fontweight="bold", zorder=4)
            ax.text(x + w / 2, 14.8, "%s · %d dias" % (rotulo_etapas(tr["etapas"]), dias),
                    ha="center", va="center", color="white", fontsize=tam_sub, zorder=4)

    marcadores = ((x_de(cal.INICIO_DESENVOLVIMENTO), "INÍCIO DO DESENVOLVIMENTO",
                   cal.INICIO_DESENVOLVIMENTO),
                  (x_de(cal.FIM_DESENVOLVIMENTO + UM_DIA), "FIM DO DESENVOLVIMENTO",
                   cal.FIM_DESENVOLVIMENTO))
    for cx, rotulo, data in marcadores:
        seta(ax, (cx, 27.2), (cx, 21.6), AZUL, largura=2.0, escala=13)
        ax.text(cx, 30.6, "%s\n%s" % (rotulo, cal.br(data)), ha="center", va="center",
                fontsize=7.6, color="white", fontweight="bold", zorder=6, linespacing=1.5,
                bbox=dict(boxstyle="round,pad=0.42", facecolor=AZUL, edgecolor="none"))

    ax.text(0, 9.6, "INÍCIO DO PROJETO", ha="left", va="center", fontsize=7,
            color=CINZA, fontweight="bold")
    ax.text(0, 6.4, cal.br(cal.INICIO), ha="left", va="center", fontsize=8.6,
            color=TINTA, fontweight="bold")
    ax.text(100, 9.6, "PRAZO FINAL · INÍCIO DAS AULAS", ha="right", va="center",
            fontsize=7, color=VERDE, fontweight="bold")
    ax.text(100, 6.4, cal.br(cal.PRAZO_FINAL), ha="right", va="center", fontsize=8.6,
            color=TINTA, fontweight="bold")

    resumo = "%d dias  ·  %d etapas" % (total, cal.N_ETAPAS)
    resumo += "  ·  %d dias de margem" % cal.MARGEM if cal.MARGEM else "  ·  sem pausa"
    ax.text(50, 6.4, resumo, ha="center", va="center", fontsize=8, color=MUDO)
    salvar(fig, "fig1_visao_geral.png")


# ---------------------------------------------------------------- 2. cascata
def fig_cascata():
    """As tres fases em degraus: cada uma termina numa entrega, e a seguinte so comeca
    depois dela. E a figura que explica o modelo de desenvolvimento.

    A descricao de cada fase fica sob o proprio degrau: com mais de ~50 caracteres ela
    passa por baixo da caixa seguinte. O rotulo 'portao' fica DENTRO do vao entre dois
    degraus, onde nao esbarra em nada."""
    fig, ax = plt.subplots(figsize=(10.2, 2.4))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 39)
    ax.axis("off")

    descricao = {
        "plan": "requisitos e arquitetura, antes de programar",
        "desenv": "uma parte completa do sistema por etapa",
        "valid": "critérios medidos até serem atingidos",
    }
    xs, larguras, ys = [1, 36, 71], [29, 29, 28], [26, 14, 2]
    fases = ["plan", "desenv", "valid"]

    for i, chave in enumerate(fases):
        x, w, y = xs[i], larguras[i], ys[i]
        cor = COR_FASE[chave]
        ax.add_patch(FancyBboxPatch((x, y), w, 11, boxstyle="round,pad=0.3,rounding_size=0.8",
                                    facecolor=cor, edgecolor="none", zorder=3))
        ax.text(x + w / 2, y + 7.0, cal.FASES[chave].upper(), ha="center", va="center",
                color="white", fontsize=8.2, fontweight="bold", zorder=4)
        ax.text(x + w / 2, y + 3.3, "%s · %d dias" % (cal.faixa(chave), cal.dias_da_fase(chave)),
                ha="center", va="center", color="white", fontsize=7.2, zorder=4)
        ax.text(x + 0.5, y - 2.4, descricao[chave], ha="left", va="center",
                fontsize=6.9, color=CINZA)

        if i:
            xa = xs[i - 1] + larguras[i - 1]
            ya, yb = ys[i - 1] + 5.5, y + 5.5
            ax.plot([xa, xa + 2.6, xa + 2.6], [ya, ya, yb + 0.6], color=CINZA,
                    linewidth=1.2, zorder=4)
            seta(ax, (xa + 2.6, yb + 1.4), (x - 0.4, yb), CINZA, escala=10)
            ax.text(xa + 1.1, ya + 2.0, "portão", ha="left", va="center",
                    fontsize=6.4, color=CINZA, fontweight="bold")
    salvar(fig, "fig2_cascata.png")


# -------------------------------------------------------------- 3. cronograma
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
            ax.text(rotulo_x, y, "Recesso", ha="right", va="center",
                    color=MUDO, fontsize=8.0, style="italic", zorder=4)
        else:
            ini, _ = cal.DATAS[n]
            inicio_barra = mdates.date2num(ini)
            dias = cal.DURACAO[n]
            ax.barh(y, dias, left=inicio_barra, height=0.62,
                    color=COR_FASE[cal.FASE[n]], edgecolor="white", linewidth=1.1, zorder=3)
            ax.text(inicio_barra + dias / 2, y, "E%d" % n, ha="center",
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
                fontsize=6.6, color=COR_FASE[fase], fontweight="bold")

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
    salvar(fig, "fig3_cronograma.png")


# --------------------------------------------------------------------- 4. WBS
def fig_wbs():
    """A arvore de decomposicao: projeto -> fases -> etapas -> pacotes de trabalho.
    Dez cartoes em duas fileiras de cinco; a fase de cada etapa esta na cor.

    O xlim vai ate 101,5: a quinta coluna termina em 101 e ficava cortada em 100."""
    fig, ax = plt.subplots(figsize=(10.2, 5.4))
    ax.set_xlim(0, 101.5)
    ax.set_ylim(12, 100)
    ax.axis("off")

    # nivel 1 — o projeto
    ax.add_patch(FancyBboxPatch((32, 92), 36, 7, boxstyle="round,pad=0.3,rounding_size=0.7",
                                facecolor=TINTA, edgecolor="none", zorder=3))
    ax.text(50, 95.5, "FÁBRICA DE SOFTWARE MULTI-AGENTE", ha="center", va="center",
            color="white", fontsize=8.0, fontweight="bold", zorder=4)

    # nivel 2 — as fases
    fases = [("plan", 2, 28), ("desenv", 33, 34), ("valid", 70, 28)]
    centros = [x + w / 2 for _, x, w in fases]
    ax.plot([50, 50], [92, 89.6], color="#C9C9C4", linewidth=1.0, zorder=1)
    ax.plot([centros[0], centros[-1]], [89.6, 89.6], color="#C9C9C4", linewidth=1.0, zorder=1)
    for (chave, x, w), cx in zip(fases, centros):
        ax.plot([cx, cx], [89.6, 87], color="#C9C9C4", linewidth=1.0, zorder=1)
        ax.add_patch(FancyBboxPatch((x, 80), w, 7, boxstyle="round,pad=0.3,rounding_size=0.7",
                                    facecolor=COR_FASE[chave], edgecolor="none", zorder=3))
        ax.text(cx, 84.8, cal.FASES[chave].upper(), ha="center", va="center",
                color="white", fontsize=7.4, fontweight="bold", zorder=4)
        ax.text(cx, 81.8, "%s · %d dias" % (cal.faixa(chave), cal.dias_da_fase(chave)),
                ha="center", va="center", color="white", fontsize=6.6, zorder=4)

    # niveis 3 e 4 — etapas e pacotes, em duas fileiras de cinco
    col_w, folga = 18.6, 1.75
    for i, n in enumerate(cal.NUMEROS):
        x = 1 + (i % 5) * (col_w + folga)
        topo = 72 if i < 5 else 40
        cor = COR_FASE[cal.FASE[n]]
        pacotes = pac.PACOTES[n]
        alto = 3.0 + len(pacotes) * 3.2

        ax.add_patch(FancyBboxPatch((x, topo - 7), col_w, 7,
                                    boxstyle="round,pad=0.25,rounding_size=0.6",
                                    facecolor=cor, edgecolor="none", zorder=3))
        ax.text(x + 1.3, topo - 3.5, "E%d" % n, ha="left", va="center", color="white",
                fontsize=8.0, fontweight="bold", zorder=4)
        nome = "\n".join(textwrap.wrap(cal.NOME[n], 22)[:2])
        ax.text(x + 5.6, topo - 3.5, nome, ha="left", va="center", color="white",
                fontsize=6.2, zorder=4, linespacing=1.25)

        ax.add_patch(FancyBboxPatch((x, topo - 7 - alto), col_w, alto,
                                    boxstyle="round,pad=0.25,rounding_size=0.6",
                                    facecolor="#FBFBF9", edgecolor="#E2E2DE",
                                    linewidth=0.9, zorder=2))
        for k, (rotulo, _dias) in enumerate(pacotes):
            y = topo - 9.6 - k * 3.2
            ax.text(x + 1.3, y, "%d.%d" % (n, k + 1), ha="left", va="center",
                    fontsize=6.6, color=cor, fontweight="bold", zorder=4)
            ax.text(x + 4.7, y, rotulo, ha="left", va="center", fontsize=6.7,
                    color=CINZA, zorder=4)
    salvar(fig, "fig4_wbs.png")


# ------------------------------------------------------------ 5. validacao
def fig_validacao():
    """O ciclo da fase de validacao. Ela nao tem lista fechada de tarefas: repete
    testar -> medir -> corrigir ate os criterios de desempenho serem atingidos."""
    fig, ax = plt.subplots(figsize=(10.2, 2.7))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 34)
    ax.axis("off")

    ns = cal.etapas_da_fase("valid")
    inicio, fim = cal.DATAS[ns[0]][0], cal.DATAS[ns[-1]][1]

    def bloco(x, y, w, h, texto, borda, fundo, cor_texto=TINTA):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.3,rounding_size=0.8",
                                    facecolor=fundo, edgecolor=borda, linewidth=1.4, zorder=3))
        ax.text(x + w / 2, y + h / 2, texto, ha="center", va="center", fontsize=8.0,
                color=cor_texto, fontweight="bold", zorder=4, linespacing=1.35)

    bloco(1.5, 17, 19, 8, "Rodar os projetos\nde teste", VERDE, "#EAF7F1")
    bloco(26, 17, 19, 8, "Medir cada critério\nde desempenho", VERDE, "#EAF7F1")

    cx, cy, mx, my = 58.5, 21, 8.8, 6.4
    ax.add_patch(mpatches.Polygon([(cx - mx, cy), (cx, cy + my), (cx + mx, cy), (cx, cy - my)],
                                  closed=True, facecolor="#FDF1EA", edgecolor=LARANJA,
                                  linewidth=1.4, zorder=3))
    ax.text(cx, cy, "atingidos?", ha="center", va="center", fontsize=8.0,
            color=LARANJA, fontweight="bold", zorder=4)

    bloco(76.5, 17, 22, 8, "Entregar\n%s" % cal.br(fim), VERDE, VERDE, cor_texto="white")
    bloco(26, 2.5, 19, 8, "Corrigir e ajustar,\ncom a causa registrada", VERMELHO, "#FBECEA")

    seta(ax, (20.9, 21), (25.6, 21), CINZA)
    seta(ax, (45.4, 21), (cx - mx - 0.2, 21), CINZA)
    seta(ax, (cx + mx + 0.2, 21), (76.1, 21), VERDE, largura=1.6)
    ax.text((cx + mx + 76.1) / 2, 22.9, "sim", ha="center", va="bottom", fontsize=7.8,
            color=VERDE, fontweight="bold")

    # nao: desce do losango, volta pela correcao e sobe de novo para os testes
    ax.plot([cx, cx, 45.6], [cy - my, 6.5, 6.5], color=VERMELHO, linewidth=1.3, zorder=4)
    seta(ax, (46.6, 6.5), (45.5, 6.5), VERMELHO)
    ax.text(cx + 1.4, 10.6, "não", ha="left", va="center", fontsize=7.8,
            color=VERMELHO, fontweight="bold")
    ax.plot([25.7, 11, 11], [6.5, 6.5, 15.4], color=VERMELHO, linewidth=1.3, zorder=4)
    seta(ax, (11, 15.2), (11, 16.6), VERMELHO)
    ax.text(18.3, 4.2, "repete o ciclo", ha="center", va="center", fontsize=7.2,
            color=MUDO, style="italic")

    ax.text(87.5, 12.6, "ao atingir os critérios —\nou no prazo, com o número medido",
            ha="center", va="center", fontsize=7.0, color=MUDO, linespacing=1.4)
    ax.text(1.5, 31.2, "%s  ·  de %s a %s  ·  do fim do semestre ao início das aulas"
            % (cal.faixa("valid"), cal.br(inicio), cal.br(fim)),
            ha="left", va="center", fontsize=8.0, color=VERDE, fontweight="bold")
    salvar(fig, "fig5_validacao.png")


# ------------------------------------------------------------- 6. arquitetura
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
    salvar(fig, "fig6_arquitetura.png")


# ---------------------------------------------------------- 7. infraestrutura
def fig_infra():
    """Onde o sistema roda: uma maquina so, e uma unica saida para a internet.

    O rotulo da maquina e curto de proposito: com o nome completo ele chegava ao x=46,
    onde sobe a linha tracejada da internet, e os dois se cruzavam."""
    fig, ax = plt.subplots(figsize=(10.2, 3.2))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 49)
    ax.axis("off")

    def bloco(x, y, w, h, titulo, linhas, cor, fundo):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.3,rounding_size=0.8",
                                    facecolor=fundo, edgecolor=cor, linewidth=1.3, zorder=3))
        ax.text(x + 1.6, y + h - 3.0, titulo, fontsize=8.0, fontweight="bold",
                color=cor, va="center", zorder=4)
        for k, l in enumerate(linhas):
            ax.text(x + 1.6, y + h - 6.6 - k * 3.4, l, fontsize=7.0, color=CINZA,
                    va="center", zorder=4)

    # a maquina
    ax.add_patch(FancyBboxPatch((17, 2), 66, 34, boxstyle="round,pad=0.4,rounding_size=1.0",
                                facecolor="#FAFAF7", edgecolor="#C9C9C4", linewidth=1.4,
                                linestyle=(0, (6, 3)), zorder=1))
    ax.text(18.6, 33.0, "MÁQUINA LOCAL · 8 GB, 4 NÚCLEOS", fontsize=7.2, color=MUDO,
            fontweight="bold", va="center", zorder=2)

    bloco(20, 15, 28, 14, "Aplicação Elixir",
          ["motor: agentes, fila e portões", "painel web · porta 4000"], AZUL, "#EAF2FD")
    bloco(52, 15, 28, 14, "PostgreSQL",
          ["tarefas, ciclos e custos", "fila de trabalhos e busca"], LARANJA, "#FCF0EA")
    bloco(20, 3.5, 28, 9, "Projetos gerados",
          ["um repositório git por projeto"], VERDE, "#EAF7F1")
    bloco(52, 3.5, 28, 9, "Cópia de segurança",
          ["do banco de dados"], VERDE, "#EAF7F1")

    # fora da maquina
    bloco(1, 15, 14, 14, "Navegador", ["o painel"], VERDE, "#EAF7F1")
    ax.add_patch(FancyBboxPatch((66, 40.5), 32, 7.5, boxstyle="round,pad=0.3,rounding_size=0.8",
                                facecolor="#EFEDFA", edgecolor=ROXO, linewidth=1.3, zorder=3))
    ax.text(82, 44.2, "Fornecedor do modelo", ha="center", va="center", fontsize=8.0,
            color=ROXO, fontweight="bold", zorder=4)

    seta(ax, (15.4, 22), (19.6, 22), CINZA)
    ax.add_patch(FancyArrowPatch((48.4, 22), (51.6, 22), arrowstyle="<|-|>",
                                 mutation_scale=10, color=CINZA, linewidth=1.3, zorder=5))
    seta(ax, (34, 14.8), (34, 12.9), CINZA)
    seta(ax, (66, 14.8), (66, 12.9), CINZA)

    ax.plot([46, 46, 82], [29.4, 39, 39], color=ROXO, linewidth=1.3,
            linestyle=(0, (5, 3)), zorder=4)
    seta(ax, (82, 38.6), (82, 40.3), ROXO)
    ax.text(47.6, 37.3, "HTTPS · única saída para a internet", ha="left", va="center",
            fontsize=7.0, color=ROXO)
    ax.text(18.6, 0.4, "O banco sobe por script quando se vai trabalhar, não como serviço "
                       "permanente.", fontsize=6.9, color=MUDO, va="center")
    salvar(fig, "fig7_infra.png")


# ------------------------------------------------------------------- 8. ciclo
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
    salvar(fig, "fig8_ciclo.png")


if __name__ == "__main__":
    print("calendario: %s a %s (%d dias, %d de margem)"
          % (cal.br(cal.INICIO), cal.br(cal.PRAZO_FINAL), cal.DIAS_TOTAIS, cal.MARGEM))
    print("gerando figuras em", SAIDA)
    fig_visao_geral()
    fig_cascata()
    fig_cronograma()
    fig_wbs()
    fig_validacao()
    fig_arquitetura()
    fig_infra()
    fig_ciclo()
    print("pronto.")
