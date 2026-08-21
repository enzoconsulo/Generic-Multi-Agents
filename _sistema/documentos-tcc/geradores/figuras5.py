# -*- coding: utf-8 -*-
"""Figuras adicionais do documento v5: anatomia do agente e por que a BEAM.
Tambem reescreve os rodapes de fig2 e fig12 que citavam a versao anterior."""
import os
import matplotlib as mpl
mpl.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle

mpl.rcParams["font.family"] = "sans-serif"
mpl.rcParams["font.sans-serif"] = ["Segoe UI", "Calibri", "DejaVu Sans"]

SAIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "figs3")
os.makedirs(SAIDA, exist_ok=True)

INK, SEC, MUT, LINE = "#0b0b0b", "#52514e", "#898781", "#c3c2b7"
BLUE, ORANGE, AQUA, VIOLET = "#2a78d6", "#eb6834", "#1baf7a", "#4a3aa7"
GREEN, RED = "#008300", "#e34948"
BLUE_T, ORANGE_T, AQUA_T, VIOLET_T = "#e9f2fd", "#fdeee8", "#e7f7f1", "#ededf8"
GRAY_T, GREEN_T, RED_T = "#f4f4f1", "#e9f4e9", "#fdeded"


def tela(w, h):
    fig = plt.figure(figsize=(w, h), dpi=220)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, w)
    ax.set_ylim(0, h)
    ax.set_aspect("equal")
    ax.axis("off")
    return fig, ax


def box(ax, x, y, w, h, texto, ec=BLUE, fc=BLUE_T, fs=8.0, tc=INK,
        weight="normal", lw=1.2, r=0.055):
    ax.add_patch(FancyBboxPatch((x, y), w, h,
                                boxstyle="round,pad=0,rounding_size=" + str(r),
                                linewidth=lw, edgecolor=ec, facecolor=fc, zorder=2))
    ax.text(x + w / 2, y + h / 2, texto, ha="center", va="center", fontsize=fs,
            color=tc, weight=weight, linespacing=1.45, zorder=3)


def seta(ax, p1, p2, cor=MUT, lw=1.3, estilo="-|>", ms=7):
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle=estilo, mutation_scale=ms,
                                 linewidth=lw, color=cor, shrinkA=1, shrinkB=1, zorder=1))


def rotulo(ax, x, y, t, fs=7.0, cor=SEC, ha="center", va="center", weight="normal",
           style="normal", rot=0):
    ax.text(x, y, t, fontsize=fs, color=cor, ha=ha, va=va, weight=weight,
            style=style, linespacing=1.4, rotation=rot, zorder=4)


def titulo(ax, x, y, t, fs=7.1):
    rotulo(ax, x, y, t, fs=fs, cor=INK, ha="left", weight="bold")


def salvar(fig, nome):
    fig.savefig(os.path.join(SAIDA, nome), dpi=220, facecolor="white")
    plt.close(fig)
    print("ok:", nome)


# ---------------------------------------------------------------- Anatomia do agente
def fig_agente():
    fig, ax = tela(7.0, 2.72)
    titulo(ax, 0.06, 2.62,
           "Um agente não é um programa: é um papel escrito em texto, mais as ferramentas que ele "
           "pode usar e o modelo que o executa.")

    x0, w = 0.10, 4.22
    ax.add_patch(FancyBboxPatch((x0, 0.62), w, 1.84,
                                boxstyle="round,pad=0,rounding_size=0.06",
                                linewidth=1.3, edgecolor=VIOLET, facecolor="#fbfbfd", zorder=1))
    rotulo(ax, x0 + 0.16, 2.32, "AGENTE  ·  revisor", fs=8.2, cor=VIOLET, ha="left", weight="bold")
    ax.plot([x0 + 0.16, x0 + w - 0.16], [2.20, 2.20], color=LINE, lw=1.0, zorder=2)

    campos = [
        ("PAPEL", "o texto que define o que ele faz — e o que\nele nunca faz: aqui, julgar e devolver,\njamais corrigir", VIOLET),
        ("FERRAMENTAS", "ler arquivo · buscar texto · ver o histórico.\nSem permissão de escrita: não é um pedido,\né uma ausência", ORANGE),
        ("MODELO", "qual capacidade executa este papel —\ne, portanto, quanto custa cada volta", BLUE),
    ]
    y = 2.02
    for nome, desc, cor in campos:
        rotulo(ax, x0 + 0.18, y, nome, fs=6.6, cor=cor, ha="left", weight="bold")
        rotulo(ax, x0 + 1.24, y - 0.12, desc, fs=6.1, cor=SEC, ha="left")
        y -= 0.50

    seta(ax, (x0 + w + 0.06, 1.54), (x0 + w + 0.52, 1.54), cor=SEC, lw=1.4, ms=9)
    rotulo(ax, x0 + w + 0.29, 1.70, "ao ser\nacionado", fs=5.9, cor=MUT, style="italic")

    bx = x0 + w + 0.58
    ax.add_patch(FancyBboxPatch((bx, 0.90), 2.10, 1.28,
                                boxstyle="round,pad=0,rounding_size=0.06",
                                linewidth=1.3, edgecolor=AQUA, facecolor=AQUA_T, zorder=1))
    rotulo(ax, bx + 1.05, 2.00, "EM EXECUÇÃO", fs=7.0, cor=AQUA, weight="bold")
    rotulo(ax, bx + 1.05, 1.52,
           "um trabalho isolado,\ncom prazo, teto de gasto\ne alguém responsável\npor ele",
           fs=6.3, cor=SEC)
    rotulo(ax, bx + 1.05, 1.02, "some quando termina", fs=5.9, cor=MUT, style="italic")

    ax.add_patch(FancyBboxPatch((0.10, 0.10), 6.80, 0.42,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.1, edgecolor=VIOLET, facecolor=VIOLET_T, zorder=1))
    rotulo(ax, 3.50, 0.31,
           "Trocar o texto do papel troca o comportamento. É isso que permite ter, no mesmo sistema, quem constrói e quem aprova —\n"
           "e garantir que não sejam o mesmo, porque quem aprova sequer tem a ferramenta de escrever.",
           fs=6.3, cor=SEC)
    salvar(fig, "fig13-agente.png")


# ---------------------------------------------------------------- Por que a BEAM
def fig_elixir():
    fig, ax = tela(7.0, 3.05)
    titulo(ax, 0.06, 2.95,
           "O sistema precisa manter dezenas de trabalhos lentos e falíveis em voo ao mesmo tempo. "
           "É esse o problema que a BEAM resolve.")

    # painel esquerdo
    ax.add_patch(FancyBboxPatch((0.10, 1.16), 3.28, 1.60,
                                boxstyle="round,pad=0,rounding_size=0.06",
                                linewidth=1.2, edgecolor=RED, facecolor="#fefafa", zorder=1))
    rotulo(ax, 0.26, 2.62, "SEM ISOLAMENTO", fs=6.8, cor=RED, ha="left", weight="bold")
    rotulo(ax, 0.26, 2.45, "um processo do sistema operacional carrega todos os trabalhos",
           fs=5.9, cor=MUT, ha="left", style="italic")
    ax.add_patch(FancyBboxPatch((0.28, 1.60), 2.92, 0.72,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.1, edgecolor=RED, facecolor=RED_T, zorder=2))
    for i, nome in enumerate(["tarefa A", "tarefa B", "tarefa C", "tarefa D"]):
        bx = 0.38 + i * 0.71
        cor = RED if i == 1 else MUT
        box(ax, bx, 1.74, 0.62, 0.44, nome, ec=cor, fc="white", fs=5.9, lw=1.0, r=0.04)
    rotulo(ax, 1.40, 2.26, "erro", fs=6.0, cor=RED, weight="bold")
    rotulo(ax, 1.74, 1.36, "um erro não tratado em B derruba o processo inteiro:\nA, C e D caem junto, e o trabalho delas se perde",
           fs=6.1, cor=RED)

    # painel direito
    ax.add_patch(FancyBboxPatch((3.62, 1.16), 3.28, 1.60,
                                boxstyle="round,pad=0,rounding_size=0.06",
                                linewidth=1.2, edgecolor=AQUA, facecolor="#f8fdfb", zorder=1))
    rotulo(ax, 3.78, 2.62, "NA BEAM", fs=6.8, cor=AQUA, ha="left", weight="bold")
    rotulo(ax, 3.78, 2.45, "cada trabalho é um processo próprio, com um supervisor acima",
           fs=5.9, cor=MUT, ha="left", style="italic")
    box(ax, 4.72, 2.06, 1.10, 0.26, "supervisor", ec=AQUA, fc=AQUA_T, fs=6.0, lw=1.0,
        r=0.04, weight="bold")
    for i, nome in enumerate(["A", "B", "C", "D"]):
        bx = 3.80 + i * 0.78
        morto = (i == 1)
        box(ax, bx, 1.44, 0.66, 0.44, nome, ec=RED if morto else AQUA,
            fc=RED_T if morto else "white", fs=6.2, lw=1.0, r=0.04, weight="bold")
        ax.plot([bx + 0.33, bx + 0.33], [2.06, 1.88], color=LINE, lw=0.8, zorder=1)
    rotulo(ax, 5.26, 1.32, "B morre sozinho. O supervisor percebe\ne recoloca a tarefa na fila",
           fs=6.1, cor=AQUA)

    fatos = [
        ("processo aqui não é o do sistema operacional",
         "pesa poucos KB; criar milhares é rotina"),
        ("processos não compartilham memória",
         "conversam por mensagem: não há corrida por dado"),
        ("supervisor é biblioteca, não disciplina",
         "reinicia o que morreu, sem ninguém pedir"),
    ]
    w = 2.20
    for i, (t, s) in enumerate(fatos):
        x = 0.10 + i * (w + 0.14)
        ax.add_patch(FancyBboxPatch((x, 0.12), w, 0.80,
                                    boxstyle="round,pad=0,rounding_size=0.05",
                                    linewidth=1.0, edgecolor=LINE, facecolor="#fbfbf9", zorder=1))
        rotulo(ax, x + w / 2, 0.72, t, fs=6.2, cor=INK, weight="bold")
        rotulo(ax, x + w / 2, 0.38, s, fs=6.0, cor=SEC)
    salvar(fig, "fig14-beam.png")


fig_agente()
fig_elixir()

# ------------------------------------------------- rodapes que citavam a versao anterior
import io

p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "figuras3.py")
s = io.open(p, encoding="utf-8").read()

s = s.replace('"O QUE A ÁRVORE COMPRA — E QUE HOJE É REGRA ESCRITA EM PORTUGUÊS"',
              '"O QUE A ÁRVORE DE SUPERVISÃO GARANTE, SEM DEPENDER DE NINGUÉM LEMBRAR"')
s = s.replace('"agente cortado no meio   →   o supervisor percebe e a tarefa volta para a fila; deixa de existir “trabalho órfão”"',
              '"um agente é cortado no meio   →   o supervisor percebe e a tarefa volta para a fila: nunca sobra trabalho órfão"')
s = s.replace('"teto de custo estourado   →   o processo é encerrado por quem o supervisiona, não por uma instrução no prompt"',
              '"o teto de custo é atingido   →   quem encerra é o supervisor, e não uma instrução dentro do texto do agente"')
s = s.replace('"A regra herdada da v1: a primeira tarefa de todo projeto é a fundação — e nesta reimplementação a fundação inclui o cliente FALSO da API."',
              '"A fase 1 entrega, junto com o esqueleto, um cliente FALSO da API do modelo."')
s = s.replace('"Sem ele, cada execução da suíte custa dinheiro, e uma suíte que custa dinheiro não é rodada."',
              '"Sem ele, cada execução da suíte de testes custa dinheiro — e uma suíte que custa dinheiro deixa de ser executada."')
io.open(p, "w", encoding="utf-8").write(s)
print("rodapes de fig2 e fig12 atualizados")
