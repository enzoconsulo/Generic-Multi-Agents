# -*- coding: utf-8 -*-
"""Ilustracoes do documento v3 — Fabrica Multi-Agente reimplementada em Elixir/OTP."""
import os
import matplotlib as mpl
mpl.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle

mpl.rcParams["font.family"] = "sans-serif"
mpl.rcParams["font.sans-serif"] = ["Segoe UI", "Calibri", "DejaVu Sans"]

SAIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "figs3")
os.makedirs(SAIDA, exist_ok=True)

INK, SEC, MUT, LINE, GRID = "#0b0b0b", "#52514e", "#898781", "#c3c2b7", "#e1e0d9"
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
                                boxstyle=f"round,pad=0,rounding_size={r}",
                                linewidth=lw, edgecolor=ec, facecolor=fc, zorder=2))
    ax.text(x + w / 2, y + h / 2, texto, ha="center", va="center", fontsize=fs,
            color=tc, weight=weight, linespacing=1.45, zorder=3)


def seta(ax, p1, p2, cor=MUT, lw=1.3, estilo="-|>", ms=7, conn="arc3,rad=0"):
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle=estilo, mutation_scale=ms,
                                 linewidth=lw, color=cor, connectionstyle=conn,
                                 shrinkA=1, shrinkB=1, zorder=1))


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


# ---------------------------------------------------------------- Fig 1
def fig1():
    """Do pedido a entrega — o fluxo, agora com onde cada coisa mora."""
    fig, ax = tela(7.0, 2.05)
    itens = [
        ("Pedido", "uma descrição do que\nse quer construir", ORANGE, ORANGE_T),
        ("Planejamento", "especificação, plano, equipe\ne 8–20 tarefas", BLUE, BLUE_T),
        ("Fila", "tarefas prontas, ordenadas\npor dependência", BLUE, BLUE_T),
        ("Pipeline por tarefa", "construir → verificar\n→ revisar", VIOLET, VIOLET_T),
        ("Entrega", "artefato pronto\n+ histórico em git", AQUA, AQUA_T),
    ]
    w, gap, h, y = 1.20, 0.20, 0.88, 0.78
    x0 = (7.0 - (5 * w + 4 * gap)) / 2
    for i, (t, s, ec, fc) in enumerate(itens):
        x = x0 + i * (w + gap)
        box(ax, x, y, w, h, "", ec=ec, fc=fc)
        rotulo(ax, x + w / 2, y + h - 0.24, t, fs=8.2, cor=INK, weight="bold")
        rotulo(ax, x + w / 2, y + h / 2 - 0.19, s, fs=6.5, cor=SEC)
        if i < 4:
            seta(ax, (x + w + 0.03, y + h / 2), (x + w + gap - 0.03, y + h / 2))

    largura = 5 * w + 4 * gap
    ax.add_patch(Rectangle((x0, 0.34), largura, 0.30, facecolor=GRAY_T,
                           edgecolor=LINE, linewidth=0.8, zorder=1))
    rotulo(ax, 3.5, 0.49,
           "PostgreSQL — estado, histórico de execução e índice semântico   ·   git — o artefato e o diff que o revisor julga",
           fs=6.5, cor=SEC)
    ax.add_patch(Rectangle((x0, 0.06), largura, 0.24, facecolor="white",
                           edgecolor=LINE, linewidth=0.8, zorder=1))
    rotulo(ax, 3.5, 0.18,
           "BEAM/OTP — cada tarefa em voo é um processo supervisionado; a queda de um não derruba os outros",
           fs=6.5, cor=VIOLET)
    rotulo(ax, x0 + 0.30, 1.90, "único ponto obrigatório de intervenção humana", fs=6.6,
           cor=MUT, style="italic", ha="left")
    seta(ax, (x0 + 0.24, 1.87), (x0 + w * 0.45, y + h + 0.04), cor=MUT, lw=1.0)
    salvar(fig, "fig1-fluxo.png")


# ---------------------------------------------------------------- Fig 2
def fig2():
    """Arvore de supervisao OTP — a figura-chave da reimplementacao."""
    fig, ax = tela(7.0, 3.55)

    titulo(ax, 0.06, 3.44,
           "Cada tarefa em voo é um processo com endereço, dono e supervisor — e o estado dela vive no banco, não dentro do processo.")

    box(ax, 2.35, 2.86, 2.30, 0.36, "Fabrica.Supervisor\nstrategy: :one_for_one",
        ec=INK, fc=GRAY_T, fs=7.0, weight="bold")

    filhos = [
        (0.10, "Fabrica.Repo", "Ecto + Postgres\nfonte de verdade", AQUA, AQUA_T),
        (1.48, "Oban", "filas duráveis:\nplanejar/construir/\nverificar/revisar", BLUE, BLUE_T),
        (2.86, "Agentes.Sup", "DynamicSupervisor\n+ Registry", VIOLET, VIOLET_T),
        (4.24, "Rag.Servidor", "Nx.Serving de\nembeddings (lote)", ORANGE, ORANGE_T),
        (5.62, "PainelWeb", "Phoenix Endpoint\n+ LiveView", BLUE, BLUE_T),
    ]
    yy = 2.06
    ax.plot([3.50, 3.50], [2.86, 2.76], color=MUT, lw=1.0, zorder=1)
    ax.plot([0.74, 6.26], [2.76, 2.76], color=MUT, lw=1.0, zorder=1)
    for x, nome, sub, ec, fc in filhos:
        box(ax, x, yy, 1.28, 0.56, "", ec=ec, fc=fc, lw=1.0, r=0.045)
        rotulo(ax, x + 0.64, yy + 0.42, nome, fs=7.0, cor=INK, weight="bold")
        rotulo(ax, x + 0.64, yy + 0.17, sub, fs=5.9, cor=SEC)
        ax.plot([x + 0.64, x + 0.64], [2.76, yy + 0.56], color=MUT, lw=1.0, zorder=1)

    rotulo(ax, 3.50, 1.86,
           "um processo por tarefa em voo — iniciado sob demanda, morre ao terminar",
           fs=6.3, cor=VIOLET, style="italic")
    proc = [
        ("Agente T-012", "construtor · opus", VIOLET),
        ("Agente T-013", "construtor · sonnet", VIOLET),
        ("Agente T-009", "verificador · haiku", ORANGE),
        ("Agente T-007", "revisor · sonnet", AQUA),
    ]
    w, gap = 1.52, 0.14
    x0 = (7.0 - (4 * w + 3 * gap)) / 2
    ax.plot([3.50, 3.50], [2.06, 1.98], color=MUT, lw=0.9, zorder=1)
    ax.plot([3.50, 3.50], [1.80, 1.74], color=MUT, lw=0.9, zorder=1)
    ax.plot([x0 + w / 2, x0 + 3 * (w + gap) + w / 2], [1.74, 1.74], color=MUT, lw=0.9, zorder=1)
    for i, (nome, sub, ec) in enumerate(proc):
        x = x0 + i * (w + gap)
        box(ax, x, 1.16, w, 0.50, "", ec=ec, fc="white", lw=1.0, r=0.045)
        rotulo(ax, x + w / 2, 1.51, nome, fs=6.9, cor=INK, weight="bold")
        rotulo(ax, x + w / 2, 1.30, sub, fs=6.0, cor=SEC)
        ax.plot([x + w / 2, x + w / 2], [1.66, 1.74], color=MUT, lw=0.9, zorder=1)

    ax.add_patch(FancyBboxPatch((0.10, 0.10), 6.80, 0.88,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.1, edgecolor=AQUA, facecolor=AQUA_T, zorder=1))
    rotulo(ax, 0.28, 0.82, "O QUE A ÁRVORE DE SUPERVISÃO GARANTE, SEM DEPENDER DE NINGUÉM LEMBRAR",
           fs=6.8, cor=AQUA, ha="left", weight="bold")
    linhas = [
        "um agente é cortado no meio   →   o supervisor percebe e a tarefa volta para a fila: nunca sobra trabalho órfão",
        "o teto de custo é atingido   →   quem encerra é o supervisor, e não uma instrução dentro do texto do agente",
        "3 construtores em paralelo   →   três processos isolados; a falha de um não contamina os outros dois",
        "estado da tarefa   →   vive no Postgres; o processo pode morrer a qualquer instante sem perda",
    ]
    y = 0.65
    for l in linhas:
        rotulo(ax, 0.32, y, "•", fs=7.0, cor=AQUA, ha="left")
        rotulo(ax, 0.46, y, l, fs=6.3, cor=SEC, ha="left")
        y -= 0.155
    salvar(fig, "fig2-supervisao.png")


# ---------------------------------------------------------------- Fig 3
def fig3():
    """As cinco camadas, com a stack concreta de cada uma."""
    fig, ax = tela(7.0, 3.95)
    LX, LW = 0.06, 1.16
    CX = LX + LW + 0.14
    CW = 6.94 - CX
    faixas = [
        ("INTERFACE", "quem dispara", 3.22, 0.66, ORANGE, ORANGE_T),
        ("ORQUESTRAÇÃO", "quem decide a ordem", 2.46, 0.66, BLUE, BLUE_T),
        ("AGENTES", "quem faz o trabalho", 1.42, 0.94, VIOLET, VIOLET_T),
        ("DOUTRINA", "as regras que todos leem", 0.76, 0.56, MUT, GRAY_T),
        ("ESTADO", "a fonte de verdade", 0.08, 0.58, AQUA, AQUA_T),
    ]
    for nome, sub, y, h, ec, fc in faixas:
        ax.add_patch(FancyBboxPatch((LX, y), 6.88, h,
                                    boxstyle="round,pad=0,rounding_size=0.06",
                                    linewidth=1.1, edgecolor=ec, facecolor=fc, zorder=1))
        rotulo(ax, LX + 0.14, y + h / 2 + 0.09, nome, fs=7.1, cor=ec, ha="left", weight="bold")
        rotulo(ax, LX + 0.14, y + h / 2 - 0.10, sub, fs=6.0, cor=MUT, ha="left", style="italic")

    def linha(y, h, textos, ec, fs=6.4):
        n = len(textos)
        gap = 0.10
        w = (CW - (n - 1) * gap) / n
        for i, t in enumerate(textos):
            box(ax, CX + i * (w + gap), y, w, h, t, ec=ec, fc="white", fs=fs, lw=0.9, r=0.04)

    linha(3.32, 0.46, ["Painel web (Phoenix LiveView)\nkanban, console ao vivo, botões",
                       "CLI (Mix task)\nmix fabrica.trabalhar <projeto>"], ORANGE)
    linha(2.56, 0.46, ["Motor de pipeline (GenServer + Oban)\nmáquina de estados pura, testável, sem modelo",
                       "Guardas de orçamento\nteto por tarefa e por rodada"], BLUE)
    linha(1.92, 0.36, ["trilha SOFTWARE\nplanejador · construtor\ntestador · revisor",
                       "trilha GENÉRICA\nplanejador-gen. · construtor\nconferente · revisor-gen.",
                       "COMUNS\ndocumentador\npesquisador"], VIOLET, 5.9)
    linha(1.50, 0.36, ["Agente = GenServer que roda o laço de tool use  ·  papel + especialista + contexto montado por papel"],
          VIOLET, 6.0)
    linha(0.84, 0.40, ["regras gerais\ndo sistema", "protocolo\nde tarefas",
                       "como escolher\na stack", "padrão de\ndocumentação"], MUT, 5.9)
    linha(0.16, 0.42, ["PostgreSQL\ntarefas, execuções,\ncustos, decisões",
                       "pgvector\níndice semântico\ndo projeto",
                       "ETS\ncache quente\nem memória",
                       "git\num repositório\npor projeto"], AQUA, 5.9)

    for y1, y2 in [(3.22, 3.10), (2.46, 2.34), (1.42, 1.30), (0.76, 0.64)]:
        seta(ax, (3.90, y1), (3.90, y2), cor=MUT, lw=1.1)
    salvar(fig, "fig3-camadas.png")


# ---------------------------------------------------------------- Fig 4
def fig4():
    """O laco do agente contra a Messages API."""
    fig, ax = tela(7.0, 3.30)
    titulo(ax, 0.06, 3.20,
           "O laço de tool use: é aqui que o dinheiro é gasto, uma volta de cada vez.")

    box(ax, 0.10, 2.30, 1.70, 0.60, "Agente\n(GenServer)", ec=VIOLET, fc=VIOLET_T,
        fs=7.6, weight="bold")
    rotulo(ax, 0.95, 2.16, "state: %{tarefa, mensagens, custo, voltas}", fs=5.9, cor=MUT)

    box(ax, 2.30, 2.34, 1.90, 0.52, "POST /v1/messages", ec=BLUE, fc=BLUE_T, fs=7.4,
        weight="bold")
    rotulo(ax, 3.25, 2.20, "system + tools + histórico inteiro", fs=5.9, cor=MUT)

    box(ax, 4.75, 2.34, 2.15, 0.52, "resposta + usage", ec=BLUE, fc="white", fs=7.4,
        weight="bold")
    rotulo(ax, 5.82, 2.20, "stop_reason, tokens lidos / escritos", fs=5.9, cor=MUT)

    seta(ax, (1.82, 2.60), (2.28, 2.60), cor=SEC)
    seta(ax, (4.22, 2.60), (4.73, 2.60), cor=SEC)

    box(ax, 4.75, 1.52, 2.15, 0.46, "stop_reason == :tool_use ?", ec=ORANGE, fc=ORANGE_T,
        fs=7.2, weight="bold")
    seta(ax, (5.82, 2.32), (5.82, 2.00), cor=SEC)

    box(ax, 2.30, 1.46, 2.15, 0.58,
        "executa as ferramentas\nTask.async_stream (paralelo)", ec=VIOLET, fc=VIOLET_T,
        fs=6.8)
    seta(ax, (4.73, 1.75), (4.47, 1.75), cor=ORANGE)
    rotulo(ax, 4.60, 1.90, "sim", fs=6.2, cor=ORANGE)

    box(ax, 0.10, 1.46, 1.90, 0.58,
        "devolve TODOS os\ntool_result numa\nÚNICA mensagem", ec=VIOLET, fc="white", fs=6.6)
    seta(ax, (2.28, 1.75), (2.02, 1.75), cor=SEC)
    ax.plot([1.05, 1.05], [2.04, 2.18], color=SEC, lw=1.2, zorder=1)
    seta(ax, (1.05, 2.18), (1.05, 2.28), cor=SEC)
    rotulo(ax, 1.05, 1.30, "+1 volta", fs=6.2, cor=RED, weight="bold")

    box(ax, 4.75, 0.72, 2.15, 0.50, "termina: grava resultado,\ncusto e commit", ec=GREEN,
        fc=GREEN_T, fs=6.8)
    seta(ax, (5.82, 1.50), (5.82, 1.24), cor=GREEN)
    rotulo(ax, 6.02, 1.37, "não  (:end_turn)", fs=6.2, cor=GREEN, ha="left")

    ax.add_patch(FancyBboxPatch((0.10, 0.10), 4.40, 0.52,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.1, edgecolor=RED, facecolor=RED_T, zorder=1))
    rotulo(ax, 0.26, 0.48, "POR QUE O CUSTO É QUADRÁTICO NAS VOLTAS", fs=6.5, cor=RED,
           ha="left", weight="bold")
    rotulo(ax, 0.26, 0.27,
           "cada volta reenvia todo o histórico acumulado até ali. Dobrar as voltas\nmais que dobra o custo do despacho — daí o teto explícito de voltas por papel.",
           fs=6.2, cor=SEC, ha="left")
    salvar(fig, "fig4-laco.png")


# ---------------------------------------------------------------- Fig 5
def fig5():
    """Anatomia do prompt e os quatro pontos de cache."""
    fig, ax = tela(7.0, 3.90)
    titulo(ax, 0.06, 3.78,
           "O prompt é montado do mais estável para o mais volátil — e essa ordem é o que decide a conta.")
    rotulo(ax, 0.06, 3.60,
           "A ordem de renderização é fixada pela API: tools → system → messages. Um byte alterado invalida tudo o que vem depois dele.",
           fs=6.3, cor=SEC, ha="left")

    blocos = [
        ("1", "definições de ferramentas", "idênticas para todo agente da fábrica", "sempre igual", BLUE),
        ("2", "constituição + protocolo de tarefas", "o contrato que não muda entre despachos", "sempre igual", BLUE),
        ("3", "MAPA + GUIA do projeto", "índice denso, regenerado a cada commit", "muda por commit", AQUA),
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

    rotulo(ax, x + w + 0.68, 2.30, "os 4 pontos de cache_control", fs=6.2, cor=MUT,
           rot=90, style="italic")
    rotulo(ax, x + w / 2, 0.72,
           "(sem marcador — todo conteúdo volátil fica DEPOIS do último ponto de cache)",
           fs=6.0, cor=MUT, style="italic")

    px = 5.00
    ax.add_patch(FancyBboxPatch((px, 0.84), 1.90, 2.60,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.1, edgecolor=LINE, facecolor="#fbfbf9", zorder=1))
    rotulo(ax, px + 0.14, 3.30, "A ARITMÉTICA", fs=6.8, cor=INK, ha="left", weight="bold")
    itens = [
        ("escrita, TTL 5 min", "1,25x", "o preço de criar a entrada"),
        ("escrita, TTL 1 h", "2,0x", "compensa com 3+ leituras"),
        ("LEITURA", "0,1x", "é aqui que o ganho mora"),
        ("teto por requisição", "4 pontos", "escolha onde marcar"),
        ("prefixo mínimo", "512 tok", "abaixo disso não cacheia"),
    ]
    yy = 3.04
    for nome, val, sub in itens:
        rotulo(ax, px + 0.14, yy, nome, fs=6.2, cor=SEC, ha="left")
        rotulo(ax, px + 1.76, yy, val, fs=7.0, cor=BLUE, ha="right", weight="bold")
        rotulo(ax, px + 0.14, yy - 0.15, sub, fs=5.7, cor=MUT, ha="left", style="italic")
        yy -= 0.42
    rotulo(ax, px + 0.95, 1.02,
           "ler o prefixo custa 1/10\nde processá-lo de novo", fs=6.2, cor=AQUA, weight="bold")

    ax.add_patch(FancyBboxPatch((0.10, 0.10), 6.80, 0.48,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.1, edgecolor=RED, facecolor=RED_T, zorder=1))
    rotulo(ax, 3.50, 0.34,
           "O erro que zera tudo em silêncio: uma data, um hash de commit ou um contador dentro dos blocos 1 a 3.\n"
           "Nenhum erro é levantado — a economia simplesmente não acontece, e só a contabilidade denuncia.",
           fs=6.3, cor=RED)
    salvar(fig, "fig5-cache.png")


# ---------------------------------------------------------------- Fig 6
def fig6():
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
    rotulo(ax, 1.55, 0.46, "o planejador quebra a tarefa\nem duas ou três menores",
           fs=6.0, cor=SEC)
    # as substitutas voltam para o inicio da fila
    ax.plot([0.60, 0.60], [0.76, 1.72], color=VIOLET, lw=1.0, zorder=1, linestyle=(0, (3, 2)))
    seta(ax, (0.60, 1.72), (0.60, 1.88), cor=VIOLET, lw=1.0)
    rotulo(ax, 0.72, 1.42, "as substitutas entram\ncomo tarefas novas", fs=5.9,
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


# ---------------------------------------------------------------- Fig 7
def fig7():
    """Pipeline de RAG do projeto."""
    fig, ax = tela(7.0, 3.30)
    titulo(ax, 0.06, 3.20,
           "O índice semântico não substitui o índice determinístico — ele responde à pergunta que o outro não responde.")

    rotulo(ax, 0.10, 2.92, "INGESTÃO   (fora do caminho quente — roda no Oban, ao commitar)",
           fs=6.5, cor=AQUA, ha="left", weight="bold")
    passos = [
        ("fontes", "código, GUIA,\nDECISÕES, logs,\ntarefas fechadas", AQUA),
        ("TextChunker", "corte semântico\npor estrutura\n(markdown, código)", AQUA),
        ("Bumblebee / Nx", "embeddings locais\nem lote, na GPU\nou na CPU", ORANGE),
        ("pgvector", "coluna vector +\níndice HNSW,\nno mesmo Postgres", VIOLET),
    ]
    w, gap, h, y = 1.56, 0.18, 0.62, 2.16
    x0 = 0.10
    for i, (t, s, ec) in enumerate(passos):
        x = x0 + i * (w + gap)
        box(ax, x, y, w, h, "", ec=ec, fc="white", lw=1.0, r=0.045)
        rotulo(ax, x + w / 2, y + h - 0.16, t, fs=7.0, cor=INK, weight="bold")
        rotulo(ax, x + w / 2, y + h / 2 - 0.11, s, fs=5.9, cor=SEC)
        if i < 3:
            seta(ax, (x + w + 0.02, y + h / 2), (x + w + gap - 0.02, y + h / 2), cor=MUT)

    rotulo(ax, 0.10, 1.90, "CONSULTA   (no despacho — antes de gastar a primeira volta de modelo)",
           fs=6.5, cor=BLUE, ha="left", weight="bold")
    consulta = [
        (0.10, "a tarefa", "objetivo, critérios\ne áreas declaradas", BLUE, BLUE_T),
        (1.84, "busca híbrida", "vetor (significado)\n+ texto (termo exato)", BLUE, "white"),
        (3.58, "reordenação", "funde os dois rankings\ne corta em k", BLUE, "white"),
        (5.32, "bloco de contexto", "entra no despacho\ncom a fonte citada", VIOLET, VIOLET_T),
    ]
    for x, t, s, ec, fc in consulta:
        ww = 1.58 if x > 5.0 else 1.56
        box(ax, x, 1.10, ww, 0.62, "", ec=ec, fc=fc, lw=1.0, r=0.045)
        rotulo(ax, x + ww / 2, 1.56, t, fs=7.0, cor=INK, weight="bold")
        rotulo(ax, x + ww / 2, 1.30, s, fs=5.9, cor=SEC)
    for xa in (1.66, 3.40, 5.14):
        seta(ax, (xa + 0.02, 1.41), (xa + 0.16, 1.41), cor=MUT)
    ax.plot([6.10, 6.10, 2.62], [2.16, 2.06, 2.06], color=MUT, lw=1.0, zorder=1)
    seta(ax, (2.62, 2.06), (2.62, 1.74), cor=MUT)

    ax.add_patch(FancyBboxPatch((0.10, 0.10), 6.80, 0.84,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.1, edgecolor=ORANGE, facecolor=ORANGE_T, zorder=1))
    rotulo(ax, 0.28, 0.78, "A DIVISÃO DE TRABALHO ENTRE OS DOIS ÍNDICES", fs=6.8, cor=ORANGE,
           ha="left", weight="bold")
    rotulo(ax, 0.28, 0.53,
           "MAPA (determinístico, gerado por script, sem custo de modelo)   →   o que existe e como se chama.   Sempre no prompt, inteiro.",
           fs=6.3, cor=SEC, ha="left")
    rotulo(ax, 0.28, 0.31,
           "Índice semântico (sobre o histórico do projeto)   →   onde já resolvemos isto, o que foi decidido e por quê.   Sob demanda, top-k.",
           fs=6.3, cor=SEC, ha="left")
    rotulo(ax, 0.28, 0.15,
           "Trocar o primeiro pelo segundo seria regressão: índice denso é barato e completo; busca semântica é aproximada e paga embedding.",
           fs=6.0, cor=MUT, ha="left", style="italic")
    salvar(fig, "fig7-rag.png")


# ---------------------------------------------------------------- Fig 8
def fig8():
    """Camadas de memoria, com dono, latencia e custo."""
    fig, ax = tela(7.0, 3.32)
    titulo(ax, 0.06, 3.22,
           "Cinco memórias, cada uma respondendo a uma pergunta diferente — e nenhuma delas é a conversa.")

    cab = [(0.24, "ONDE"), (2.14, "O QUE GUARDA"), (4.36, "LATÊNCIA"), (5.58, "CUSTO DE LEITURA")]
    for x, t in cab:
        rotulo(ax, x, 2.98, t, fs=6.0, cor=MUT, ha="left", weight="bold")

    linhas = [
        ("ETS (memória do nó)", "prefixos montados, contagens de token,\nplano de execução da rodada",
         "microssegundos", "zero", ORANGE),
        ("PostgreSQL", "tarefas, ciclos, execuções, custo por\ndespacho, decisões, equipe do projeto",
         "milissegundos", "zero", AQUA),
        ("pgvector (mesmo banco)", "o histórico do projeto indexado por\nsignificado — decisões, achados, receitas",
         "milissegundos", "embedding\nda pergunta", VIOLET),
        ("git (um repo por projeto)", "o artefato e o diff que o revisor julga;\num commit por tarefa",
         "milissegundos", "zero", BLUE),
        ("cache da API (5 min / 1 h)", "o prefixo do prompt, do lado do provedor",
         "na própria\nrequisição", "0,1x do preço\nde entrada", RED),
    ]
    y = 2.72
    h = 0.42
    for nome, oq, lat, custo, cor in linhas:
        ax.add_patch(FancyBboxPatch((0.10, y - h), 6.80, h,
                                    boxstyle="round,pad=0,rounding_size=0.04",
                                    linewidth=1.0, edgecolor=cor, facecolor="white", zorder=2))
        rotulo(ax, 0.24, y - h / 2, nome, fs=6.9, cor=INK, ha="left", weight="bold")
        rotulo(ax, 2.14, y - h / 2, oq, fs=6.0, cor=SEC, ha="left")
        rotulo(ax, 4.36, y - h / 2, lat, fs=6.0, cor=MUT, ha="left")
        rotulo(ax, 5.58, y - h / 2, custo, fs=6.0, cor=cor, ha="left", weight="bold")
        y -= h + 0.07

    rotulo(ax, 3.50, 0.16,
           "A regra que sustenta tudo: se a execução cair agora, a próxima reconstrói o mundo lendo as quatro primeiras linhas desta tabela.",
           fs=6.4, cor=INK, weight="bold")
    salvar(fig, "fig8-memoria.png")


# ---------------------------------------------------------------- Fig 9
def fig9():
    """Paralelismo: o que a BEAM compra, e a regra de cache que o limita."""
    fig, ax = tela(7.0, 2.90)
    titulo(ax, 0.06, 2.80,
           "Paralelismo real: três tarefas independentes, cada uma num processo, cada uma com seu próprio ciclo de vida.")

    LANE = 1.30
    hy = 0.34

    def barra(y, x, w, texto, cor, fc):
        ax.add_patch(FancyBboxPatch((x, y), w, hy - 0.10,
                                    boxstyle="round,pad=0,rounding_size=0.04",
                                    linewidth=1.0, edgecolor=cor, facecolor=fc, zorder=2))
        rotulo(ax, x + w / 2, y + (hy - 0.10) / 2, texto, fs=6.0, cor=INK)

    rotulo(ax, 0.10, 2.50,
           "UMA LINHA SÓ — cada etapa espera a anterior terminar, mesmo quando as tarefas são independentes",
           fs=6.4, cor=RED, ha="left", weight="bold")
    y = 2.16
    barra(y, LANE, 1.10, "T-012 constrói", VIOLET, VIOLET_T)
    barra(y, LANE + 1.14, 0.80, "verifica", ORANGE, ORANGE_T)
    barra(y, LANE + 1.98, 0.70, "revisa", AQUA, AQUA_T)
    barra(y, LANE + 2.72, 1.10, "T-013 constrói", VIOLET, VIOLET_T)
    barra(y, LANE + 3.86, 0.80, "verifica", ORANGE, ORANGE_T)
    rotulo(ax, LANE - 0.08, y + 0.12, "linha única", fs=6.2, cor=SEC, ha="right")

    rotulo(ax, 0.10, 1.76,
           "COM PROCESSOS ISOLADOS — três tarefas, três processos, um supervisor acima de todos",
           fs=6.4, cor=AQUA, ha="left", weight="bold")
    tarefas = [
        ("T-012", 0.00, [("constrói", 1.10, VIOLET, VIOLET_T), ("verifica", 0.80, ORANGE, ORANGE_T),
                         ("revisa", 0.70, AQUA, AQUA_T)]),
        ("T-013", 0.16, [("constrói", 1.30, VIOLET, VIOLET_T), ("verifica", 0.80, ORANGE, ORANGE_T)]),
        ("T-019", 0.08, [("constrói", 0.90, VIOLET, VIOLET_T), ("verifica", 0.75, ORANGE, ORANGE_T),
                         ("revisa", 0.70, AQUA, AQUA_T)]),
    ]
    y = 1.40
    for nome, atraso, etapas in tarefas:
        x = LANE + atraso
        rotulo(ax, LANE - 0.08, y + 0.12, nome, fs=6.2, cor=SEC, ha="right")
        for t, w, cor, fc in etapas:
            barra(y, x, w, t, cor, fc)
            x += w + 0.04
        y -= hy

    ax.plot([LANE, LANE], [0.60, 2.44], color=LINE, lw=1.0, zorder=0)
    seta(ax, (LANE, 0.60), (6.90, 0.60), cor=LINE, lw=1.0)
    rotulo(ax, 6.86, 0.70, "tempo", fs=6.0, cor=MUT, ha="right")

    ax.add_patch(FancyBboxPatch((0.10, 0.06), 6.80, 0.42,
                                boxstyle="round,pad=0,rounding_size=0.04",
                                linewidth=1.0, edgecolor=BLUE, facecolor=BLUE_T, zorder=1))
    rotulo(ax, 3.50, 0.27,
           "A trava que o paralelismo ingênuo ignora: uma entrada de cache só pode ser LIDA depois que a primeira resposta começa a chegar.\n"
           "Disparar três despachos idênticos ao mesmo instante faz os três pagarem preço de escrita — o primeiro vai sozinho, os outros seguem atrás.",
           fs=6.2, cor=SEC)
    salvar(fig, "fig9-paralelismo.png")


# ---------------------------------------------------------------- Fig 10
def fig10():
    """As duas trilhas."""
    fig, ax = tela(7.0, 3.85)
    titulo(ax, 0.06, 3.76,
           "Um campo declarado no projeto escolhe o elenco inteiro — e é a única coisa que o escolhe.")
    box(ax, 2.30, 3.26, 2.40, 0.38, "domínio declarado no projeto", ec=BLUE,
        fc=BLUE_T, fs=7.2, weight="bold")
    seta(ax, (3.50, 3.26), (3.50, 3.14), cor=SEC)
    ax.plot([1.76, 5.24], [3.14, 3.14], color=SEC, lw=1.2)
    seta(ax, (1.76, 3.14), (1.76, 3.00), cor=SEC)
    seta(ax, (5.24, 3.14), (5.24, 3.00), cor=SEC)

    cols = [
        (0.14, "software   (o padrão)", ORANGE, ORANGE_T,
         ["planejador", "construtor (+ reforçado)", "testador", "revisor"],
         "doutrina: escolha de stack",
         "a prova vem de graça: o programa\nroda, e passa ou quebra"),
        (3.62, "qualquer outro domínio", VIOLET, VIOLET_T,
         ["planejador-genérico", "construtor (+ reforçado)", "conferente", "revisor-genérico"],
         "doutrina: artefato + verificador",
         "a prova precisa ser CONSTRUÍDA:\na T-001 instala o verificador"),
    ]
    for x, tit, ec, fc, agentes, dout, nota in cols:
        box(ax, x, 2.56, 3.24, 0.38, tit, ec=ec, fc=fc, fs=7.5, weight="bold")
        yy = 2.46
        for i, a in enumerate(agentes):
            papel = ["planeja", "constrói", "verifica", "revisa"][i]
            ax.add_patch(FancyBboxPatch((x, yy - 0.28), 3.24, 0.26,
                                        boxstyle="round,pad=0,rounding_size=0.04",
                                        linewidth=0.9, edgecolor=ec, facecolor="white", zorder=2))
            rotulo(ax, x + 0.10, yy - 0.15, papel, fs=6.0, cor=MUT, ha="left")
            rotulo(ax, x + 0.80, yy - 0.15, a, fs=6.9, cor=INK, ha="left")
            yy -= 0.32
        rotulo(ax, x + 1.62, yy - 0.06, dout, fs=6.5, cor=ec, weight="bold")
        rotulo(ax, x + 1.62, yy - 0.30, nota, fs=6.3, cor=SEC)

    ax.add_patch(FancyBboxPatch((0.14, 0.10), 6.72, 0.46,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.1, edgecolor=AQUA, facecolor=AQUA_T, zorder=2))
    rotulo(ax, 3.50, 0.42, "IDÊNTICO NAS DUAS TRILHAS", fs=6.8, cor=AQUA, weight="bold")
    rotulo(ax, 3.50, 0.23,
           "máquina de estados · seis estados · dois portões · limite de 3 ciclos · equipe sob demanda · confinamento · estado no banco · árvore de supervisão",
           fs=6.2, cor=SEC)
    salvar(fig, "fig10-trilhas.png")


# ---------------------------------------------------------------- Fig 11
def fig11():
    """Onde o dinheiro foi na v1, e o que a v2 ataca."""
    fig = plt.figure(figsize=(7.0, 2.65), dpi=220)

    ax = fig.add_axes([0.28, 0.60, 0.68, 0.30])
    dados = [("sessões de chat do orquestrador", 1428, 78),
             ("pipeline (todos os despachos de agente)", 250, 14),
             ("demais sessões", 155, 8)]
    nomes = [d[0] for d in dados][::-1]
    vals = [d[1] for d in dados][::-1]
    pcts = [d[2] for d in dados][::-1]
    cores = [AQUA, BLUE, RED]
    ax.barh(list(range(len(vals))), vals, height=0.55, color=cores, zorder=3)
    ax.set_yticks(list(range(len(vals))))
    ax.set_yticklabels(nomes, fontsize=7.0, color=INK)
    ax.set_xlim(0, 1750)
    ax.set_xticks([])
    for s in ("top", "right", "bottom"):
        ax.spines[s].set_visible(False)
    ax.spines["left"].set_color(LINE)
    ax.tick_params(axis="y", length=0)
    for i, (v, p) in enumerate(zip(vals, pcts)):
        ax.text(v + 30, i, f"US$ {v:,.0f}".replace(",", ".") + f"   ({p}%)",
                va="center", fontsize=7.3, color=INK, weight="bold")
    ax.set_title("Onde o dinheiro foi na v1, em 9 dias de uso real (156 sessões, US$ 1.833)",
                 fontsize=8.0, color=INK, loc="left", pad=7, weight="bold")

    ax2 = fig.add_axes([0.0, 0.0, 1.0, 0.50])
    ax2.set_xlim(0, 7.0)
    ax2.set_ylim(0, 1.325)
    ax2.axis("off")
    rotulo(ax2, 0.26, 1.20,
           "O item mais caro não era o trabalho — era o coordenador conversando consigo mesmo. As três respostas do desenho v2:",
           fs=6.6, cor=INK, ha="left", weight="bold")
    respostas = [
        ("coordenador em código", "uma máquina de estados não\ntem contexto para reler", AQUA),
        ("cache explícito no prefixo", "o que é igual entre despachos\npassa a custar 0,1x", BLUE),
        ("modelo por papel", "verificar é mecânico e roda\nbarato; o retrabalho sobe", VIOLET),
    ]
    w = 2.14
    for i, (t, s, cor) in enumerate(respostas):
        x = 0.26 + i * (w + 0.14)
        ax2.add_patch(FancyBboxPatch((x, 0.18), w, 0.80,
                                     boxstyle="round,pad=0,rounding_size=0.04",
                                     linewidth=1.0, edgecolor=cor, facecolor="white", zorder=2))
        rotulo(ax2, x + w / 2, 0.80, t, fs=6.9, cor=cor, weight="bold")
        rotulo(ax2, x + w / 2, 0.48, s, fs=6.1, cor=SEC)
    fig.savefig(os.path.join(SAIDA, "fig11-custo.png"), dpi=220, facecolor="white")
    plt.close(fig)
    print("ok: fig11-custo.png")


# ---------------------------------------------------------------- Fig 12
def fig12():
    """Roadmap por fases."""
    fig, ax = tela(7.0, 2.60)
    titulo(ax, 0.06, 2.50,
           "Seis fases. Cada uma termina num marco verificável — e a primeira é a que torna todas as outras testáveis.")

    fases = [
        ("F1", "Fundação", "esqueleto Phoenix,\nEcto e migrações,\nsuíte e CI,\ncliente falso da API", 1.06, AQUA),
        ("F2", "Laço de agente", "tool use contra a\nMessages API,\ncache_control,\ncusto por volta", 1.06, BLUE),
        ("F3", "Máquina de estados", "seis estados,\ndois portões,\n3 ciclos, troca\nde modelo", 1.06, BLUE),
        ("F4", "Concorrência", "supervisão, filas,\nteto de orçamento,\nrecuperação\nde queda", 1.06, VIOLET),
        ("F5", "Memória semântica", "ingestão, pgvector,\nbusca híbrida,\navaliação da\nrecuperação", 1.06, ORANGE),
        ("F6", "Painel + genérica", "LiveView, telemetria,\nconferente e\nescada de prova", 1.06, ORANGE),
    ]
    x = 0.10
    y = 1.24
    h = 0.84
    centros = []
    for cod, nome, desc, w, cor in fases:
        ax.add_patch(FancyBboxPatch((x, y), w, h,
                                    boxstyle="round,pad=0,rounding_size=0.05",
                                    linewidth=1.1, edgecolor=cor, facecolor="white", zorder=2))
        ax.add_patch(Rectangle((x, y + h - 0.20), w, 0.20, linewidth=0,
                               facecolor=cor, zorder=2))
        rotulo(ax, x + w / 2, y + h - 0.10, cod + " · " + nome, fs=6.0, cor="white", weight="bold")
        rotulo(ax, x + w / 2, y + 0.31, desc, fs=6.0, cor=SEC)
        if x > 0.10:
            seta(ax, (x - 0.10, y + h / 2), (x - 0.02, y + h / 2), cor=MUT, lw=1.0)
        centros.append(x + w / 2)
        x += w + 0.08

    ax.plot([0.10, 6.90], [1.08, 1.08], color=LINE, lw=1.0, zorder=0)
    marcos = [
        "a suíte roda\nsem tocar a rede",
        "um agente resolve\numa tarefa real",
        "uma tarefa percorre\nos seis estados",
        "três tarefas em\nparalelo, com teto",
        "o agente cita a\ndecisão que já existia",
        "um projeto inteiro\nsem intervenção",
    ]
    for cx, t in zip(centros, marcos):
        ax.plot([cx], [1.08], marker="o", markersize=4, color=GREEN, zorder=3)
        rotulo(ax, cx, 0.80, t, fs=6.0, cor=GREEN)

    rotulo(ax, 3.50, 0.28,
           "A fase 1 entrega, junto com o esqueleto do sistema, um cliente FALSO da API do modelo.\n"
           "Sem ele, cada execução da suíte de testes custa dinheiro — e uma suíte que custa dinheiro deixa de ser executada.",
           fs=6.2, cor=INK)
    salvar(fig, "fig12-fases.png")


for f in (fig1, fig2, fig3, fig4, fig5, fig6, fig7, fig8, fig9, fig10, fig11, fig12):
    f()
print("figuras em", SAIDA)
