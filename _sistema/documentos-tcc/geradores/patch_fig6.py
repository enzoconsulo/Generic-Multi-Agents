# -*- coding: utf-8 -*-
"""Reescreve fig6 (maquina de estados) incluindo a saida de replanejamento."""
import io, os

N = chr(92) + "n"

novo = '''def fig6():
    """Maquina de estados da tarefa, com a escada de resposta ao fracasso."""
    fig, ax = tela(7.0, 2.75)
    estados = [("backlog", GRAY_T, MUT), ("pronta", BLUE_T, BLUE),
               ("em-execução", ORANGE_T, ORANGE), ("em-teste", ORANGE_T, ORANGE),
               ("em-revisão", ORANGE_T, ORANGE), ("concluída", GREEN_T, GREEN)]
    w, gap, h, y = 1.02, 0.14, 0.42, 1.90
    x0 = (7.0 - (6 * w + 5 * gap)) / 2
    xs = []
    for i, (t, fc, ec) in enumerate(estados):
        x = x0 + i * (w + gap)
        xs.append(x)
        box(ax, x, y, w, h, t, ec=ec, fc=fc, fs=7.3, weight="bold")
        if i < 5:
            seta(ax, (x + w + 0.02, y + h / 2), (x + w + gap - 0.02, y + h / 2), cor=SEC)
    for i, t in enumerate(["deps concluídas", "construtor assume", "commit feito",
                           "critérios OK", "conforme e sem bug"]):
        rotulo(ax, xs[i + 1] + w / 2, y + h + 0.13, t, fs=6.1, cor=MUT)

    def cotovelo(xa, xb, ydip, texto):
        ax.plot([xa, xa, xb], [y, ydip, ydip], color=RED, lw=1.15, zorder=1)
        seta(ax, (xb, ydip), (xb, y - 0.01), cor=RED, lw=1.15)
        rotulo(ax, (xa + xb) / 2, ydip + 0.10, texto, fs=6.3, cor=RED)

    cotovelo(xs[3] + w * 0.5, xs[2] + w * 0.62, 1.56, "reprovado: não funciona")
    cotovelo(xs[4] + w * 0.5, xs[2] + w * 0.30, 1.22,
             "reprovado: não é o que foi pedido, ou tem defeito")

    # ---- esgotou os 3 ciclos: duas saidas, e a primeira NAO e desistir
    xb = xs[2] + w * 0.30
    ax.plot([xb, xb], [1.22, 1.02], color=RED, lw=1.15, zorder=1)
    ax.plot([1.55, 4.62], [1.02, 1.02], color=RED, lw=1.15, zorder=1)
    rotulo(ax, xb + 0.10, 1.11, "3 ciclos esgotados", fs=6.3, cor=RED, ha="left")

    # saida 1 (primeira vez): replanejamento
    seta(ax, (1.55, 1.02), (1.55, 0.76), cor=VIOLET, lw=1.15)
    ax.add_patch(FancyBboxPatch((0.40, 0.34), 2.30, 0.42,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.2, edgecolor=VIOLET, facecolor=VIOLET_T, zorder=2))
    rotulo(ax, 1.55, 0.65, "REPLANEJADA", fs=6.6, cor=VIOLET, weight="bold")
    rotulo(ax, 1.55, 0.46, "o planejador quebra a tarefa%sem duas ou três menores" % N,
           fs=6.0, cor=SEC)
    # as substitutas voltam para o inicio da fila
    ax.plot([0.60, 0.60], [0.76, 1.72], color=VIOLET, lw=1.0, zorder=1, linestyle=(0, (3, 2)))
    seta(ax, (0.60, 1.72), (0.60, 1.88), cor=VIOLET, lw=1.0)
    rotulo(ax, 0.72, 1.42, "as substitutas entram%scomo tarefas novas" % N, fs=5.9,
           cor=VIOLET, ha="left")

    # saida 2 (ja tinha sido replanejada): bloqueia
    seta(ax, (4.62, 1.02), (4.62, 0.78), cor=RED, lw=1.15)
    box(ax, 4.07, 0.40, 1.10, 0.36, "bloqueada", ec=RED, fc=RED_T, fs=7.0, weight="bold")
    rotulo(ax, 5.28, 0.66, "só quando a tarefa JÁ havia sido", fs=6.0, cor=RED, ha="left")
    rotulo(ax, 5.28, 0.52, "replanejada uma vez: sai da fila", fs=6.0, cor=RED, ha="left")
    rotulo(ax, 5.28, 0.38, "e é reportada ao usuário", fs=6.0, cor=RED, ha="left")

    titulo(ax, 0.10, 2.62,
           "Seis estados. Reprovar não é o fim: antes de desistir de uma tarefa, o sistema tenta redimensioná-la uma vez.")
    salvar(fig, "fig6-estados.png")
'''

p = "figuras3.py"
s = io.open(p, encoding="utf-8").read()
ini = s.index("def fig6():")
marca = '    salvar(fig, "fig6-estados.png")\n'
fim = s.index(marca, ini) + len(marca)
io.open(p, "w", encoding="utf-8").write(s[:ini] + novo + s[fim:])
print("fig6 reescrita com a saida de replanejamento")
