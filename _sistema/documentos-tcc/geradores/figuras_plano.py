# -*- coding: utf-8 -*-
"""Figuras do PLANO DE DESENVOLVIMENTO (documento de planejamento do TCC).

Gera PNGs em figs_plano/. Paleta identica a dos documentos de arquitetura
(documento7_base.py), para que os dois documentos pareçam da mesma familia.

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
TRILHO = "#F0F0EC"

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

INICIO = datetime.date(2026, 4, 13)

FASES = {
    "req": ("Requisitos", AZUL_CLARO),
    "proj": ("Projeto", ROXO),
    "impl": ("Implementação", AZUL),
    "teste": ("Testes e entrega", VERDE),
}

ETAPAS = [
    ("E01", "Requisitos e viabilidade", "req"),
    ("E02", "Estado da arte e linha de base", "req"),
    ("E03", "Projeto arquitetural", "proj"),
    ("E04", "Projeto detalhado e ambiente", "proj"),
    ("E05", "Fundação verificável", "impl"),
    ("E06", "O agente e as ferramentas", "impl"),
    ("E07", "Estados e portões", "impl"),
    ("E08", "Integração e governança", "impl"),
    ("E09", "Concorrência e falhas", "impl"),
    ("E10", "Memória do projeto", "impl"),
    ("E11", "Painel e automação", "impl"),
    ("E12", "Testes de sistema em uso real", "teste"),
    ("E13", "Refinamento e entrega", "teste"),
]


def salvar(fig, nome):
    caminho = os.path.join(SAIDA, nome)
    fig.savefig(caminho, dpi=200, bbox_inches="tight", pad_inches=0.06)
    plt.close(fig)
    print("  ", nome)


# ---------------------------------------------------------------- 1. cronograma
def fig_cronograma():
    fig, ax = plt.subplots(figsize=(10.2, 4.6))
    x0 = mdates.date2num(INICIO)
    rotulo_x = x0 - 5          # coluna de rotulos, alinhada a direita, x fixo
    esquerda = x0 - 96

    for i, (cod, nome, fase) in enumerate(ETAPAS):
        y = len(ETAPAS) - 1 - i
        ini = INICIO + datetime.timedelta(days=i * 15)
        cor = FASES[fase][1]
        ax.barh(y, 15, left=mdates.date2num(ini), height=0.62,
                color=cor, edgecolor="white", linewidth=1.1, zorder=3)
        ax.text(mdates.date2num(ini) + 7.5, y, cod, ha="center", va="center",
                color="white", fontsize=7.4, fontweight="bold", zorder=4)
        ax.text(rotulo_x, y, nome, ha="right", va="center",
                color=TINTA, fontsize=8.2, zorder=4)
        ax.plot([rotulo_x + 1.5, mdates.date2num(ini) - 1], [y, y],
                color="#E6E6E2", linewidth=0.7, zorder=1)

    ax.set_ylim(-1.15, len(ETAPAS) - 0.15)
    ax.set_xlim(esquerda, x0 + 199)
    ax.xaxis.set_major_locator(mdates.MonthLocator())
    ax.xaxis.set_major_formatter(FuncFormatter(
        lambda v, _: "%s/%02d" % (MESES[mdates.num2date(v).month - 1],
                                  mdates.num2date(v).year % 100)))
    ax.grid(axis="x", color="#EDEDE9", linewidth=0.8, zorder=0)
    ax.set_yticks([])
    ax.tick_params(axis="x", labelsize=7.6, length=0, pad=4)
    for lado in ("top", "right", "left"):
        ax.spines[lado].set_visible(False)
    ax.spines["bottom"].set_color("#D9D9D6")

    # marcas das fases, na base
    limites = [(0, 2, "req", "REQUISITOS"), (2, 4, "proj", "PROJETO"),
               (4, 11, "impl", "IMPLEMENTAÇÃO"), (11, 13, "teste", "TESTES")]
    for a, b, fase, texto in limites:
        xa = mdates.date2num(INICIO + datetime.timedelta(days=a * 15))
        xb = mdates.date2num(INICIO + datetime.timedelta(days=b * 15))
        ax.plot([xa, xb - 0.8], [-0.72, -0.72], color=FASES[fase][1],
                linewidth=3.4, solid_capstyle="butt", zorder=3)
        ax.text((xa + xb) / 2, -1.0, texto, ha="center", va="center",
                fontsize=6.9, color=FASES[fase][1], fontweight="bold")

    ax.text(esquerda, len(ETAPAS) - 0.42,
            "13 etapas de 15 dias  ·  195 dias  ·  13/04/2026 a 24/10/2026",
            fontsize=8.4, color=MUDO, va="bottom")
    salvar(fig, "fig1_cronograma.png")


# ------------------------------------------------------------- 2. esforço/fase
def fig_esforco():
    fig, ax = plt.subplots(figsize=(10.2, 1.5))
    dados = [("Requisitos", 30, AZUL_CLARO), ("Projeto", 30, ROXO),
             ("Implementação", 105, AZUL), ("Testes e entrega", 30, VERDE)]
    x = 0
    for nome, dias, cor in dados:
        ax.barh(0, dias, left=x, height=0.5, color=cor, edgecolor="white", linewidth=1.4)
        ax.text(x + dias / 2, 0, f"{dias} dias", ha="center", va="center",
                color="white", fontsize=8.4, fontweight="bold")
        ax.text(x + dias / 2, -0.42, nome, ha="center", va="center",
                color=cor, fontsize=8, fontweight="bold")
        ax.text(x + dias / 2, 0.42, f"{dias / 195 * 100:.0f}%", ha="center", va="center",
                color=MUDO, fontsize=7.4)
        x += dias
    ax.set_xlim(-2, 197)
    ax.set_ylim(-0.72, 0.66)
    ax.axis("off")
    salvar(fig, "fig2_esforco.png")


# -------------------------------------------------------------- 3. arquitetura
def fig_arquitetura():
    fig, ax = plt.subplots(figsize=(10.2, 5.4))
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

    # camada 1 — interface
    faixa(48, 12, "INTERFACE", VERDE)
    bloco(6, 48, 44, 12, "Painel ao vivo  ·  Phoenix LiveView",
          ["Quadro de tarefas por estado · console do agente",
           "custo da rodada · parar e retomar"], VERDE, "#EAF7F1")
    bloco(53, 48, 41, 12, "Piloto automático",
          ["Encadeia rodadas até um critério de parada",
           "teto de gasto e de rodadas obrigatórios"], VERDE, "#EAF7F1")

    # camada 2 — motor
    faixa(27, 18.5, "MOTOR", AZUL)
    bloco(6, 27, 28, 18.5, "Máquina de tarefas",
          ["Seis estados", "transição transacional",
           "dois portões independentes", "escada do fracasso"], AZUL, "#EAF2FD")
    bloco(37, 27, 27, 18.5, "Árvore de supervisão  ·  OTP",
          ["Um processo por agente em voo",
           "DynamicSupervisor + Registry",
           "matar um não derruba os outros"], AZUL, "#EAF2FD")
    bloco(67, 27, 27, 18.5, "Ferramentas confinadas",
          ["ler · escrever · editar · buscar",
           "rodar comando, com prazo",
           "registrar_resultado"], AZUL, "#EAF2FD")

    # camada 3 — fronteiras
    faixa(15, 9.5, "FRONTEIRAS", ROXO, tam=5.6)
    bloco(6, 15, 44, 9.5, "Fabrica.Operario  (behaviour)",
          ["Duas famílias: agente completo · endpoint de modelo"], ROXO, "#EFEDFA")
    bloco(53, 15, 41, 9.5, "Fabrica.Embedder  (behaviour)",
          ["Falso · serviço · local — escolhido por medição"], ROXO, "#EFEDFA")

    # camada 4 — persistência
    faixa(1, 11, "ESTADO", LARANJA)
    bloco(6, 1, 28, 11, "PostgreSQL + Ecto",
          ["Projetos, tarefas, ciclos,", "despachos e custos"], LARANJA, "#FCF0EA")
    bloco(37, 1, 27, 11, "Oban",
          ["Fila durável no mesmo banco:", "enfileirar e mudar estado juntos"],
          LARANJA, "#FCF0EA")
    bloco(67, 1, 27, 11, "pgvector",
          ["Memória semântica do projeto,", "busca híbrida com termo exato"],
          LARANJA, "#FCF0EA")

    for y0, y1 in ((48, 45.8), (27, 24.8), (15, 12.2)):
        for x in (20, 50, 80):
            ax.add_patch(FancyArrowPatch((x, y0), (x, y1), arrowstyle="-|>",
                                         mutation_scale=8, color="#C9C9C4",
                                         linewidth=1.0, zorder=1))
    salvar(fig, "fig3_arquitetura.png")


# ------------------------------------------------------------ 4. ciclo/portões
def fig_ciclo():
    fig, ax = plt.subplots(figsize=(10.2, 3.05))
    ax.set_xlim(0, 100)
    ax.set_ylim(1.6, 34)
    ax.axis("off")

    estados = [("backlog", MUDO), ("pronta", AZUL_CLARO), ("em-execução", AZUL),
               ("em-teste", LARANJA), ("em-revisão", ROXO), ("concluída", VERDE)]
    w, gap = 14.2, 2.6
    x = 1.5
    centros = []
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

    # quem age em cada transição
    papeis = [(centros[2], "construtor", AZUL), (centros[3], "verificador", LARANJA),
              (centros[4], "revisor", ROXO)]
    for cx, nome, cor in papeis:
        ax.text(cx, 27.6, nome, ha="center", va="center", fontsize=7.6,
                color=cor, fontweight="bold")

    # os dois portões, com a pergunta de cada um
    for cx, pergunta, cor in ((centros[3], "funciona?", LARANJA),
                              (centros[4], "é o que foi pedido?", ROXO)):
        ax.text(cx, 30.8, pergunta, ha="center", va="center", fontsize=7.8,
                color="white", fontweight="bold", zorder=4,
                bbox=dict(boxstyle="round,pad=0.34", facecolor=cor, edgecolor="none"))

    # Retorno por reprovação. Traçado como polilinha explícita por BAIXO da fileira:
    # arc3 curvava para cima e o percurso ficava escondido atrás das caixas.
    for origem, nivel, desloc in ((3, 14.4, 2.8), (4, 10.8, -2.8)):
        xa, xb = centros[origem], centros[2] + desloc
        ax.plot([xa, xa, xb, xb], [17.9, nivel, nivel, 16.6],
                color=VERMELHO, linewidth=1.15, linestyle=(0, (4, 2.6)),
                solid_capstyle="butt", zorder=5)
        ax.add_patch(FancyArrowPatch((xb, 16.9), (xb, 17.9), arrowstyle="-|>",
                                     mutation_scale=9, color=VERMELHO,
                                     linewidth=1.15, zorder=5))
    ax.text((centros[2] + centros[5]) / 2, 6.8,
            "reprovada — volta para execução, com o relatório anexado",
            ha="center", va="center", fontsize=7.6, color=VERMELHO)
    ax.text((centros[2] + centros[5]) / 2, 3.4,
            "no 4º ciclo a tarefa é bloqueada; o contador é do sistema, não do agente",
            ha="center", va="center", fontsize=7.3, color=MUDO)
    ax.text(1.5, 30.8, "os dois portões,\nduas perguntas", fontsize=8, color=TINTA,
            fontweight="bold", va="center", ha="left")
    salvar(fig, "fig4_ciclo.png")


# ------------------------------------------------------------------- 5. escada
def fig_escada():
    fig, ax = plt.subplots(figsize=(10.2, 2.6))
    ax.set_xlim(0, 100)
    ax.set_ylim(0.6, 29.2)
    ax.axis("off")

    degraus = [
        ("1º ciclo", "Sobe o modelo", "O retrabalho usa um modelo mais forte que o do disparo", AZUL_CLARO),
        ("2º ciclo", "Troca o especialista", "Duas reprovações sob o mesmo prompt indicam viés de ataque", ROXO),
        ("3º ciclo", "Replaneja", "A tarefa é quebrada ou reescrita; a original é cancelada", LARANJA),
        ("4º ciclo", "Bloqueia", "Vai para o humano, com o motivo registrado na tarefa", VERMELHO),
    ]
    w, h = 23.0, 15.5
    for i, (ciclo, titulo, texto, cor) in enumerate(degraus):
        x = i * (w + 2.2) + 1
        y = 1.5 + i * 3.9          # o degrau sobe; a altura da caixa nao muda
        ax.add_patch(FancyBboxPatch((x, y), w, h,
                                    boxstyle="round,pad=0.25,rounding_size=0.7",
                                    facecolor="white", edgecolor=cor, linewidth=1.4, zorder=2))
        ax.add_patch(mpatches.Rectangle((x, y + h - 1.0), w, 1.0, facecolor=cor,
                                        edgecolor="none", zorder=3))
        ax.text(x + 1.4, y + h - 3.4, ciclo, fontsize=7.2, color=cor, fontweight="bold")
        ax.text(x + 1.4, y + h - 6.6, titulo, fontsize=9.4, color=TINTA, fontweight="bold")
        # textwrap a mao: wrap=True do matplotlib quebra pela largura da FIGURA,
        # nao pela da caixa, e o texto atravessa os vizinhos.
        ax.text(x + 1.4, y + h - 9.6, "\n".join(textwrap.wrap(texto, 34)),
                fontsize=7.3, color=CINZA, va="top", linespacing=1.5)
    salvar(fig, "fig5_escada.png")


# -------------------------------------------------------------- 6. ferramentas
def fig_ferramentas():
    fig, ax = plt.subplots(figsize=(10.2, 4.2))
    ax.set_xlim(0, 102.4)
    ax.set_ylim(0, 44)
    ax.axis("off")

    grupos = [
        ("Linguagem e runtime", AZUL, [("Elixir 1.19", "linguagem"), ("Erlang/OTP 28", "runtime"),
                                       ("Mix", "build e tarefas"), ("Git", "versionamento")]),
        ("Web e interface", VERDE, [("Phoenix 1.8", "framework web"), ("LiveView 1.2", "tela ao vivo"),
                                    ("Bandit", "servidor HTTP"), ("Tailwind + daisyUI", "estilo")]),
        ("Dados e fila", LARANJA, [("PostgreSQL 18", "banco"), ("Ecto 3.13", "acesso e migrações"),
                                   ("Oban 2.24", "fila durável"), ("pgvector 0.8", "busca vetorial")]),
        ("Qualidade", ROXO, [("ExUnit", "testes"), ("Credo", "análise estática"),
                             ("Dialyzer", "checagem de tipos"), ("mix format", "formatação")]),
        ("Modelo e rede", AZUL_CLARO, [("Claude Code CLI", "agente completo"),
                                       ("Messages API", "endpoint de modelo"),
                                       ("Req", "cliente HTTP"), ("Telemetry", "medição")]),
    ]
    w = 18.6
    for i, (titulo, cor, itens) in enumerate(grupos):
        x = i * (w + 1.8) + 0.8
        ax.add_patch(FancyBboxPatch((x, 1), w, 42,
                                    boxstyle="round,pad=0.25,rounding_size=0.7",
                                    facecolor="#FBFBF9", edgecolor="#E2E2DE",
                                    linewidth=1.0, zorder=2))
        ax.add_patch(mpatches.Rectangle((x, 37.6), w, 5.4, facecolor=cor,
                                        edgecolor="none", zorder=3))
        ax.text(x + w / 2, 40.3, titulo, fontsize=7.8, color="white", fontweight="bold",
                ha="center", va="center", zorder=4)
        for k, (nome, papel) in enumerate(itens):
            y = 33.2 - k * 7.6
            ax.text(x + 1.4, y, nome, fontsize=8.2, color=TINTA, fontweight="bold", va="center")
            ax.text(x + 1.4, y - 3.0, papel, fontsize=7.1, color=MUDO, va="center")
    salvar(fig, "fig6_ferramentas.png")


# ----------------------------------------------------------------- 7. entregas
def fig_entregas():
    fig, ax = plt.subplots(figsize=(10.2, 4.0))
    marcos = [
        ("E05", "A suíte roda sem rede,\nsem cota e sem chave", 1),
        ("E06", "Um agente resolve\numa tarefa real", 2),
        ("E07", "Uma tarefa reprova,\nretrabalha e conclui", 3),
        ("E08", "Trocar de fornecedor\nnão toca o miolo", 4),
        ("E09", "Três tarefas em paralelo;\nmatar uma não derruba", 5),
        ("E10", "O agente cita\na decisão anterior", 6),
        ("E11", "Um projeto acompanhado\nna tela, do pedido à entrega", 7),
    ]
    xs = [m[2] for m in marcos]
    ax.step(xs, xs, where="post", color="#DCDCD8", linewidth=1.4, zorder=1)
    for cod, texto, x in marcos:
        ax.scatter([x], [x], s=190, color=AZUL, zorder=3, edgecolor="white", linewidth=1.6)
        ax.text(x, x, cod[1:], color="white", fontsize=7.2, fontweight="bold",
                ha="center", va="center", zorder=4)
        ax.text(x + 0.16, x - 0.12, texto, fontsize=7.9, color=TINTA, va="top", zorder=4)
    ax.set_xlim(0.55, 9.35)
    ax.set_ylim(0.15, 8.0)
    ax.axis("off")
    ax.text(0.6, 7.85, "Cada etapa de implementação fecha num marco verificável — e cada marco\n"
                       "pressupõe todos os anteriores. Não é porcentagem de conclusão: é capacidade.",
            fontsize=8, color=MUDO, va="top")
    salvar(fig, "fig7_marcos.png")


if __name__ == "__main__":
    print("gerando figuras em", SAIDA)
    fig_cronograma()
    fig_esforco()
    fig_arquitetura()
    fig_ciclo()
    fig_escada()
    fig_ferramentas()
    fig_entregas()
    print("pronto.")
