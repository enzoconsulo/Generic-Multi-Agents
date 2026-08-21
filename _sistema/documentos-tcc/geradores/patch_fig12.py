# -*- coding: utf-8 -*-
"""Reescreve o bloco fig12 de figuras3.py sem passar por escaping de shell."""
import io

N = chr(92) + "n"  # a sequencia literal \n que deve ir para o arquivo

fases = [
    ("F1", "Fundação", ["esqueleto Phoenix,", "Ecto e migrações,", "suíte e CI,", "cliente falso da API"], 1.06, "AQUA"),
    ("F2", "Laço de agente", ["tool use contra a", "Messages API,", "cache_control,", "custo por volta"], 1.06, "BLUE"),
    ("F3", "Máquina de estados", ["seis estados,", "dois portões,", "3 ciclos, troca", "de modelo"], 1.06, "BLUE"),
    ("F4", "Concorrência", ["supervisão, filas,", "teto de orçamento,", "recuperação", "de queda"], 1.06, "VIOLET"),
    ("F5", "Memória semântica", ["ingestão, pgvector,", "busca híbrida,", "avaliação da", "recuperação"], 1.06, "ORANGE"),
    ("F6", "Painel + genérica", ["LiveView, telemetria,", "conferente e", "escada de prova"], 1.06, "ORANGE"),
]
marcos = [
    ["a suíte roda", "sem tocar a rede"],
    ["um agente resolve", "uma tarefa real"],
    ["uma tarefa percorre", "os seis estados"],
    ["três tarefas em", "paralelo, com teto"],
    ["o agente cita a", "decisão que já existia"],
    ["um projeto inteiro", "sem intervenção"],
]

linhas_fases = ",\n".join(
    '        ("%s", "%s", "%s", %s, %s)' % (cod, nome, N.join(desc), w, cor)
    for cod, nome, desc, w, cor in fases
)
linhas_marcos = ",\n".join('        "%s"' % N.join(m) for m in marcos)

novo = '''def fig12():
    """Roadmap por fases."""
    fig, ax = tela(7.0, 2.60)
    titulo(ax, 0.06, 2.50,
           "Seis fases. Cada uma termina num marco verificável — e a primeira é a que torna todas as outras testáveis.")

    fases = [
%s,
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
%s,
    ]
    for cx, t in zip(centros, marcos):
        ax.plot([cx], [1.08], marker="o", markersize=4, color=GREEN, zorder=3)
        rotulo(ax, cx, 0.80, t, fs=6.0, cor=GREEN)

    rotulo(ax, 3.50, 0.28,
           "A regra herdada da v1: a primeira tarefa de todo projeto é a fundação — e nesta reimplementação a fundação inclui o cliente FALSO da API.%s"
           "Sem ele, cada execução da suíte custa dinheiro, e uma suíte que custa dinheiro não é rodada.",
           fs=6.2, cor=INK)
    salvar(fig, "fig12-fases.png")
''' % (linhas_fases, linhas_marcos, N)

p = "figuras3.py"
s = io.open(p, encoding="utf-8").read()
ini = s.index("def fig12():")
marca = '    salvar(fig, "fig12-fases.png")\n'
fim = s.index(marca, ini) + len(marca)
io.open(p, "w", encoding="utf-8").write(s[:ini] + novo + s[fim:])
print("fig12 reescrita, sem escaping de shell")
