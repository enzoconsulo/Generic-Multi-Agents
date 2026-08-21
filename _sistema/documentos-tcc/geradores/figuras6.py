# -*- coding: utf-8 -*-
"""Variantes v6 das figuras de cache e de memoria, com o jargao traduzido.
Salva com nomes proprios para nao alterar as figuras que a v5 ja usa."""
import io, os
from matplotlib.patches import FancyBboxPatch

AQUI = os.path.dirname(os.path.abspath(__file__))

# reaproveita os helpers e as cores de figuras3.py, sem executar as figuras
_src = io.open(os.path.join(AQUI, "figuras3.py"), encoding="utf-8").read()
_cabeca = _src[:_src.index("# ---------------------------------------------------------------- Fig 1")]
exec(compile(_cabeca, "figuras3-helpers", "exec"))


# ---------------------------------------------------------------- cache (v6)
def fig_cache():
    fig, ax = tela(7.0, 3.90)
    titulo(ax, 0.06, 3.78,
           "A requisição é montada do que nunca muda para o que muda sempre — e essa ordem é o que decide a conta.")
    rotulo(ax, 0.06, 3.60,
           "A ordem é fixada pela API: primeiro as ferramentas, depois as instruções, depois a conversa. "
           "Um caractere alterado invalida tudo o que vem depois dele.",
           fs=6.3, cor=SEC, ha="left")

    blocos = [
        ("1", "definições de ferramentas", "idênticas para todo agente do sistema", "nunca muda", BLUE),
        ("2", "as regras e o protocolo de tarefas", "o contrato que vale para todos os agentes", "nunca muda", BLUE),
        ("3", "índice do projeto", "regerado a cada commit", "muda por commit", AQUA),
        ("4", "histórico da tarefa (ciclos anteriores)", "cresce a cada retrabalho", "muda por ciclo", VIOLET),
        ("", "o pedido desta volta", "a tarefa, o diff, a pergunta", "muda sempre", ORANGE),
    ]
    x, w, h, passo = 0.10, 4.10, 0.44, 0.53
    topo = 3.40
    for i, (num, nome, sub, vol, cor) in enumerate(blocos):
        y = topo - i * passo - h
        ax.add_patch(FancyBboxPatch((x, y), w, h,
                                    boxstyle="round,pad=0,rounding_size=0.05",
                                    linewidth=1.1, edgecolor=cor,
                                    facecolor="white" if num else GRAY_T, zorder=2))
        rotulo(ax, x + 0.16, y + h * 0.66, nome, fs=7.1, cor=INK, ha="left", weight="bold")
        rotulo(ax, x + 0.16, y + h * 0.26, sub, fs=6.0, cor=SEC, ha="left")
        rotulo(ax, x + w - 0.14, y + h / 2, vol, fs=6.0, cor=MUT, ha="right", style="italic")
        if num:
            ax.add_patch(FancyBboxPatch((x + w + 0.10, y + 0.06), 0.30, h - 0.12,
                                        boxstyle="round,pad=0,rounding_size=0.04",
                                        linewidth=1.0, edgecolor=cor, facecolor=cor, zorder=2))
            rotulo(ax, x + w + 0.25, y + h / 2, num, fs=7.2, cor="white", weight="bold")

    rotulo(ax, x + w + 0.68, 2.30, "onde se marca “guarde até aqui”", fs=6.2, cor=MUT,
           rot=90, style="italic")
    rotulo(ax, x + w / 2, 0.72,
           "(sem marcação — tudo o que muda sempre fica DEPOIS do último ponto guardado)",
           fs=6.0, cor=MUT, style="italic")

    px = 5.00
    ax.add_patch(FancyBboxPatch((px, 0.84), 1.90, 2.60,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.1, edgecolor=LINE, facecolor="#fbfbf9", zorder=1))
    rotulo(ax, px + 0.14, 3.30, "O QUE CUSTA O QUÊ", fs=6.8, cor=INK, ha="left", weight="bold")
    itens = [
        ("guardar — vale 5 min", "1,25x", "25% a mais, uma vez só"),
        ("guardar — vale 1 hora", "2,0x", "compensa com 3+ reusos"),
        ("REAPROVEITAR", "0,1x", "é aqui que o ganho mora"),
        ("pontos por requisição", "4", "onde marcar é escolha sua"),
        ("trecho mínimo", "512 tok", "abaixo disso não é guardado"),
    ]
    yy = 3.04
    for nome, val, sub in itens:
        rotulo(ax, px + 0.14, yy, nome, fs=6.2, cor=SEC, ha="left")
        rotulo(ax, px + 1.76, yy, val, fs=7.0, cor=BLUE, ha="right", weight="bold")
        rotulo(ax, px + 0.14, yy - 0.15, sub, fs=5.7, cor=MUT, ha="left", style="italic")
        yy -= 0.42
    rotulo(ax, px + 0.95, 1.02,
           "reaproveitar custa 1/10\nde processar de novo", fs=6.2, cor=AQUA, weight="bold")

    ax.add_patch(FancyBboxPatch((0.10, 0.10), 6.80, 0.48,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.1, edgecolor=RED, facecolor=RED_T, zorder=1))
    rotulo(ax, 3.50, 0.34,
           "O erro que zera tudo em silêncio: uma data, um contador ou um número de commit dentro dos blocos 1 a 3.\n"
           "Nenhum erro é levantado — a economia simplesmente não acontece, e só a contabilidade denuncia.",
           fs=6.3, cor=RED)
    salvar(fig, "fig5-cache-v6.png")


# ---------------------------------------------------------------- memoria (v6)
def fig_rag():
    fig, ax = tela(7.0, 3.30)
    titulo(ax, 0.06, 3.20,
           "O índice gerado responde “o que existe”. O índice por significado responde “isto já foi resolvido aqui?”.")

    rotulo(ax, 0.10, 2.92, "INDEXAÇÃO   (roda ao commitar, fora do caminho do trabalho)",
           fs=6.5, cor=AQUA, ha="left", weight="bold")
    passos_ing = [
        ("o material", "decisões, achados de\nrevisão, tarefas\nconcluídas, o guia", AQUA),
        ("corte em pedaços", "por seção e por função,\nnão a cada N letras\n(não parte frase ao meio)", AQUA),
        ("virar vetores", "cada pedaço vira uma\nlista de números, no\npróprio computador", ORANGE),
        ("guardar", "no mesmo banco; acha o\nparecido sem precisar\ncomparar com todos", VIOLET),
    ]
    w, gap, h, y = 1.56, 0.18, 0.62, 2.16
    x0 = 0.10
    for i, (t, s, ec) in enumerate(passos_ing):
        x = x0 + i * (w + gap)
        box(ax, x, y, w, h, "", ec=ec, fc="white", lw=1.0, r=0.045)
        rotulo(ax, x + w / 2, y + h - 0.16, t, fs=7.0, cor=INK, weight="bold")
        rotulo(ax, x + w / 2, y + h / 2 - 0.13, s, fs=5.7, cor=SEC)
        if i < 3:
            seta(ax, (x + w + 0.02, y + h / 2), (x + w + gap - 0.02, y + h / 2), cor=MUT)

    rotulo(ax, 0.10, 1.90, "CONSULTA   (antes de gastar a primeira volta de modelo)",
           fs=6.5, cor=BLUE, ha="left", weight="bold")
    consulta = [
        (0.10, "a tarefa", "objetivo, critérios\ne áreas declaradas", BLUE, BLUE_T),
        (1.84, "duas buscas juntas", "por significado (vetor)\n+ por termo exato (texto)", BLUE, "white"),
        (3.58, "escolha dos melhores", "junta as duas listas\ne fica com os melhores", BLUE, "white"),
        (5.32, "vai para o agente", "os trechos entram no\nprompt, com a fonte", VIOLET, VIOLET_T),
    ]
    for x, t, s, ec, fc in consulta:
        ww = 1.58 if x > 5.0 else 1.56
        box(ax, x, 1.10, ww, 0.62, "", ec=ec, fc=fc, lw=1.0, r=0.045)
        rotulo(ax, x + ww / 2, 1.56, t, fs=7.0, cor=INK, weight="bold")
        rotulo(ax, x + ww / 2, 1.30, s, fs=5.8, cor=SEC)
    for xa in (1.66, 3.40, 5.14):
        seta(ax, (xa + 0.02, 1.41), (xa + 0.16, 1.41), cor=MUT)
    ax.plot([6.10, 6.10, 2.62], [2.16, 2.06, 2.06], color=MUT, lw=1.0, zorder=1)
    seta(ax, (2.62, 2.06), (2.62, 1.74), cor=MUT)

    ax.add_patch(FancyBboxPatch((0.10, 0.10), 6.80, 0.84,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.1, edgecolor=ORANGE, facecolor=ORANGE_T, zorder=1))
    rotulo(ax, 0.28, 0.78, "OS DOIS ÍNDICES RESPONDEM PERGUNTAS DIFERENTES", fs=6.8, cor=ORANGE,
           ha="left", weight="bold")
    rotulo(ax, 0.28, 0.53,
           "Índice gerado por script (sem custo de modelo)   →   o que existe e como se chama.   Vai inteiro no prompt, sempre.",
           fs=6.3, cor=SEC, ha="left")
    rotulo(ax, 0.28, 0.31,
           "Índice por significado (sobre a história do projeto)   →   onde já resolvemos isto e por quê.   Só os melhores trechos, sob demanda.",
           fs=6.3, cor=SEC, ha="left")
    rotulo(ax, 0.28, 0.15,
           "Um não substitui o outro: o gerado é exato, completo e grátis; o por significado é aproximado e custa transformar a pergunta em vetor.",
           fs=6.0, cor=MUT, ha="left", style="italic")
    salvar(fig, "fig7-rag-v6.png")


fig_cache()
fig_rag()
