# -*- coding: utf-8 -*-
"""Figuras dos documentos por etapa: faixa "Etapa N de 10", mapa do sistema e diagrama didático.

Tudo desenhado com matplotlib (caixas e setas), em PNG de alta resolução.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch  # noqa: E402

NAVY = "#1B2A41"
OK = "#2A9D8F"
WARN = "#E9A23B"
BAD = "#C0392B"
GREY = "#E6E9EE"
INK = "#1F2328"
MUTED = "#6B7480"
BLUE = "#4A6FA5"
STATUS_COR = {"ok": OK, "parcial": WARN, "andamento": WARN, "bloqueada": BAD, "futuro": GREY}
NOMES = ["Planejamento", "Fundação", "Agente", "Linha de\nprodução", "Paralelismo", "Memória", "Painel",
         "Testes\nreais", "Refina-\nmento", "Entrega"]


def faixa(n, status_por_etapa, caminho):
    """Faixa do topo: as 10 etapas, a atual em destaque."""
    fig, ax = plt.subplots(figsize=(13, 1.05), dpi=200)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 1)
    ax.axis("off")
    for i in range(10):
        k = i + 1
        atual = k == n
        cor = STATUS_COR.get(status_por_etapa.get(k, "futuro"), GREY) if k <= n else GREY
        caixa = FancyBboxPatch((i + 0.04, 0.12), 0.92, 0.76, boxstyle="round,pad=0,rounding_size=0.08",
                               fc=cor if k <= n else "white", ec=NAVY if atual else ("#C9CED6" if k > n else cor),
                               lw=3.2 if atual else 1.0)
        ax.add_patch(caixa)
        tc = "white" if k <= n else MUTED
        ax.text(i + 0.5, 0.62, f"E{k}", ha="center", va="center", fontsize=13 if atual else 11, weight="bold", color=tc)
        ax.text(i + 0.5, 0.3, NOMES[i], ha="center", va="center", fontsize=6.5, color=tc, linespacing=0.9)
    fig.savefig(caminho, bbox_inches="tight", pad_inches=0.02, transparent=False, facecolor="white")
    plt.close(fig)


CAMADAS = [("Tela", "quadro, console, piloto automático", 7), ("Motor", "estados, fila, portões, escada de falha, teto", 4),
           ("Execução", "processo por tarefa, fila durável, paralelismo, cota", 5), ("Memória", "histórico, busca, contexto com fonte", 6),
           ("Agentes", "laço de ferramentas, confinamento, adaptadores", 3), ("Base", "banco, custo, fronteiras, verificação, backup", 2)]


def mapa(n, caminho):
    """Camadas do sistema: a desta etapa em destaque, as anteriores prontas, as próximas apagadas."""
    fig, ax = plt.subplots(figsize=(11, 4.6), dpi=200)
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 6.3)
    ax.axis("off")
    for i, (nome, desc, k) in enumerate(CAMADAS):
        y = 5.3 - i * 1.0
        if k == n:
            fc, ec, tc, lw = NAVY, NAVY, "white", 2.5
        elif k < n:
            fc, ec, tc, lw = "#DCEFEC", OK, INK, 1.2
        else:
            fc, ec, tc, lw = "white", "#C9CED6", "#9AA1AB", 1.0
        ax.add_patch(FancyBboxPatch((0.2, y), 9.0, 0.82, boxstyle="round,pad=0,rounding_size=0.12", fc=fc, ec=ec, lw=lw))
        ax.text(0.5, y + 0.41, nome, va="center", fontsize=14, weight="bold", color=tc)
        ax.text(2.4, y + 0.41, desc, va="center", fontsize=11.5, color=tc)
        ax.add_patch(FancyBboxPatch((9.45, y), 1.3, 0.82, boxstyle="round,pad=0,rounding_size=0.12",
                                    fc=(WARN if k == n else (OK if k < n else "white")), ec=(WARN if k == n else (OK if k < n else "#C9CED6"))))
        ax.text(10.1, y + 0.41, f"E{k}", ha="center", va="center", fontsize=14, weight="bold", color="white" if k <= n else "#9AA1AB")
    fig.savefig(caminho, bbox_inches="tight", pad_inches=0.05, facecolor="white")
    plt.close(fig)


# ---------------------------------------------------------------- diagramas didáticos
def _caixa(ax, x, y, w, h, titulo, sub="", cor=NAVY, texto="white", tam=12):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=0.15", fc=cor, ec=cor))
    if sub:
        ax.text(x + w / 2, y + h * 0.63, titulo, ha="center", va="center", fontsize=tam, weight="bold", color=texto)
        ax.text(x + w / 2, y + h * 0.3, sub, ha="center", va="center", fontsize=tam - 3, color=texto, linespacing=1.1)
    else:
        ax.text(x + w / 2, y + h / 2, titulo, ha="center", va="center", fontsize=tam, weight="bold", color=texto, linespacing=1.1)


def _seta(ax, a, b, rot="", cor=INK, tracejada=False, curva=0.0, lado=0.12):
    ax.add_patch(FancyArrowPatch(a, b, arrowstyle="-|>", mutation_scale=16, lw=1.8, color=cor,
                                 linestyle="--" if tracejada else "-", connectionstyle=f"arc3,rad={curva}"))
    if rot:
        ax.text((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + lado, rot, ha="center", va="bottom", fontsize=9.5, color=cor)


def _novo(w=12, h=5.2):
    fig, ax = plt.subplots(figsize=(w, h), dpi=200)
    ax.set_xlim(0, w)
    ax.set_ylim(0, h)
    ax.axis("off")
    return fig, ax


def diagrama(n, caminho):
    fig, ax = _novo()
    if n == 1:
        etapas = [("Requisitos", "R1–R15"), ("Arquitetura", "4 camadas\n6 estados, 2 portões"), ("Tarefas", "39 de código\n(E2–E7)"), ("Critérios", "8 com limite\nnumérico")]
        for i, (t, s) in enumerate(etapas):
            _caixa(ax, 0.3 + i * 2.95, 2.4, 2.5, 1.6, t, s)
            if i:
                _seta(ax, (0.3 + i * 2.95 - 0.42, 3.2), (0.3 + i * 2.95 - 0.05, 3.2))
        _caixa(ax, 8.85, 0.4, 2.5, 1.4, "Projetos de teste", "5 propostos\n(a validar)", cor=WARN)
        _seta(ax, (10.1, 2.4), (10.1, 1.85), cor=WARN)
        ax.text(0.3, 4.6, "Antes de programar: o que o sistema precisa fazer, como será feito e como será julgado", fontsize=12, color=MUTED)
    elif n == 2:
        _caixa(ax, 0.3, 2.0, 2.8, 1.6, "Suíte de testes", "roda em toda verificação")
        _caixa(ax, 4.3, 3.3, 3.0, 1.2, "Provider falso", "no lugar do modelo", cor=OK)
        _caixa(ax, 4.3, 1.1, 3.0, 1.2, "Embedder falso", "no lugar da busca real", cor=OK)
        _caixa(ax, 8.6, 3.3, 3.1, 1.2, "Internet / modelo", "bloqueados no teste", cor=BAD)
        _caixa(ax, 8.6, 1.1, 3.1, 1.2, "PostgreSQL", "projetos, tarefas,\nciclos, consumos", cor=BLUE)
        _seta(ax, (3.1, 3.0), (4.3, 3.8))
        _seta(ax, (3.1, 2.6), (4.3, 1.7))
        _seta(ax, (7.3, 3.9), (8.6, 3.9), cor=BAD, tracejada=True)
        _seta(ax, (7.3, 1.7), (8.6, 1.7))
        ax.text(7.95, 4.55, "requisição\nlevanta erro", ha="center", fontsize=9.5, color=BAD)
        ax.text(7.95, 0.55, "consumo em\ncota e US$", ha="center", fontsize=9.5, color=INK)
        ax.text(0.3, 4.75, "mix factory.ci:  formato → compilação → estilo → testes → tipos → backup", fontsize=12, color=NAVY, weight="bold")
    elif n == 3:
        _caixa(ax, 0.2, 2.1, 2.1, 1.3, "Tarefa", "pedido do agente")
        _caixa(ax, 3.2, 2.0, 2.7, 1.5, "Agente", "processo OTP\nteto de chamadas")
        _caixa(ax, 7.0, 3.5, 2.6, 1.2, "Ferramentas", "ler · escrever · comando", cor=BLUE)
        _caixa(ax, 7.0, 0.7, 2.6, 1.2, "Fornecedor", "CLI  |  API por token", cor=BLUE)
        _caixa(ax, 10.2, 3.5, 1.65, 1.2, "Confina-\nmento", cor=OK, tam=10.5)
        _caixa(ax, 10.2, 0.7, 1.65, 1.2, "Consumo\npor volta", cor=OK, tam=10.5)
        _seta(ax, (2.3, 2.75), (3.2, 2.75))
        _seta(ax, (5.9, 3.1), (7.0, 4.0))
        _seta(ax, (5.9, 2.4), (7.0, 1.3))
        _seta(ax, (9.6, 4.1), (10.2, 4.1))
        _seta(ax, (9.6, 1.3), (10.2, 1.3))
        ax.text(10.1, 4.85, "fora da pasta? recusa", fontsize=9.5, color=OK)
        ax.text(9.8, 0.35, "gravado no banco", fontsize=9.5, color=OK)
    elif n == 4:
        estados = ["backlog", "ready", "in_progress", "in_testing", "in_review", "done"]
        for i, e in enumerate(estados):
            cor = OK if e == "done" else NAVY
            _caixa(ax, 0.15 + i * 1.97, 2.4, 1.7, 0.95, e, cor=cor, tam=11)
            if i:
                _seta(ax, (0.15 + i * 1.97 - 0.27, 2.87), (0.15 + i * 1.97, 2.87))
        ax.text(6.95, 3.6, "Verificador:\nfunciona?", ha="center", fontsize=10, color=BLUE, weight="bold")
        ax.text(8.9, 3.6, "Revisor: é o que\nfoi pedido?", ha="center", fontsize=10, color=BLUE, weight="bold")
        _seta(ax, (6.95, 2.4), (4.95, 2.4), "reprova", cor=BAD, curva=-0.45, lado=-0.55)
        _seta(ax, (8.9, 2.4), (4.95, 2.35), "", cor=BAD, curva=-0.5)
        degraus = ["1º: modelo mais forte", "2º: outro especialista", "3º: replanejar", "4º: humano"]
        for i, d in enumerate(degraus):
            _caixa(ax, 0.4 + i * 2.95, 0.15, 2.6, 0.7, d, cor=WARN, tam=10.5)
        ax.text(0.4, 1.0, "Escada de resposta à falha (o sistema conta os ciclos, não o agente):", fontsize=10.5, color=MUTED)
    elif n == 5:
        _caixa(ax, 4.2, 3.9, 3.6, 1.0, "Supervisor", "um processo por tarefa")
        for i, (t, cor, s) in enumerate([("Agente A", OK, "segue"), ("Agente B", OK, "segue"), ("Agente C", BAD, "morto")]):
            _caixa(ax, 1.4 + i * 3.4, 1.9, 2.4, 1.1, t, s, cor=cor)
            _seta(ax, (6.0, 3.9), (2.6 + i * 3.4, 3.0))
        _caixa(ax, 8.3, 0.1, 3.4, 1.0, "Fila durável (Oban)", "a tarefa volta", cor=BLUE)
        _seta(ax, (9.6, 1.9), (9.8, 1.1), "volta à fila", cor=BAD)
        _caixa(ax, 0.3, 0.1, 3.6, 1.0, "Parede de cota", "dorme e rearma sozinho", cor=WARN)
        ax.text(4.3, 0.45, "áreas disjuntas = sem disputa de arquivo", fontsize=10.5, color=MUTED)
    elif n == 6:
        passos = [("Commit", "do projeto", NAVY), ("Ingestão", "trechos +\nembedding", NAVY), ("Busca híbrida", "significado +\ntermo exato", NAVY),
                  ("Bloco com fonte", "trecho + origem", NAVY), ("Agente", "recebe o contexto", BAD)]
        for i, (t, s, cor) in enumerate(passos):
            _caixa(ax, 0.2 + i * 2.4, 2.2, 2.0, 1.5, t, s, cor=cor, tam=11)
            if i:
                pend = i == 4
                _seta(ax, (0.2 + i * 2.4 - 0.37, 2.95), (0.2 + i * 2.4 - 0.03, 2.95), cor=BAD if pend else INK, tracejada=pend)
        ax.text(10.35, 1.65, "pendente: a fila ainda não\nentrega o bloco ao agente", ha="center", fontsize=9.5, color=BAD, weight="bold")
        ax.text(0.2, 4.3, "Avaliação contínua: recall@8, recall@1 e MRR — abaixo da linha de base, o bloco é desligado", fontsize=11, color=MUTED)
    elif n == 7:
        _caixa(ax, 0.3, 2.0, 2.6, 1.5, "Motor", "despachos e\ntransições")
        _caixa(ax, 4.0, 2.0, 2.6, 1.5, "Eventos", "telemetria por\ndespacho", cor=BLUE)
        _caixa(ax, 7.8, 3.4, 3.8, 1.1, "Quadro de tarefas", "ao vivo, por estado", cor=OK)
        _caixa(ax, 7.8, 1.9, 3.8, 1.1, "Console do agente", "saída e custo da rodada", cor=OK)
        _caixa(ax, 7.8, 0.3, 3.8, 1.1, "Piloto automático", "rodadas com teto de gasto", cor=WARN)
        _seta(ax, (2.9, 2.75), (4.0, 2.75))
        _seta(ax, (6.6, 3.0), (7.8, 3.9))
        _seta(ax, (6.6, 2.6), (7.8, 2.45))
        _seta(ax, (6.6, 2.2), (7.8, 0.85))
        ax.text(0.3, 0.8, "Parar e retomar num botão · busca de segredos\nantes de publicar · entregas que não são código", fontsize=10.5, color=MUTED)
    fig.savefig(caminho, bbox_inches="tight", pad_inches=0.05, facecolor="white")
    plt.close(fig)


if __name__ == "__main__":
    import os
    import sys
    d = sys.argv[1]
    os.makedirs(d, exist_ok=True)
    st = {1: "parcial", 2: "ok", 3: "ok", 4: "ok", 5: "ok", 6: "bloqueada", 7: "andamento"}
    for n in range(1, 8):
        faixa(n, st, f"{d}/faixa-{n}.png")
        mapa(n, f"{d}/mapa-{n}.png")
        diagrama(n, f"{d}/diag-{n}.png")
    print("ok")
