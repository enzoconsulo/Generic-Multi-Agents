# Gera figs/E1-requisitos.png (matplotlib): os 15 requisitos em duas colunas.
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch
A = ("O que o sistema faz", ["R1 · o pedido vira especificação, plano e tarefas", "R2 · seis estados, com relatório e custo",
     "R3 · julga duas vezes: funciona? é o pedido?", "R4 · a reprovada volta com o que faltou",
     "R5 · retrabalho limitado, depois o humano", "R6 · tarefas independentes em paralelo",
     "R7 · consulta o histórico, citando a fonte", "R8 · andamento e custo ao vivo"])
B = ("Sob que restrições", ["R9 · cabe em 8 GB e 4 núcleos", "R10 · custo em cota e em dinheiro", "R11 · ninguém escreve fora do projeto",
     "R12 · testes sem internet e sem cota", "R13 · a queda de um agente não derruba os outros",
     "R14 · nenhuma rodada passa do teto de gasto", "R15 · trocar o fornecedor sem mexer no núcleo"])
fig, ax = plt.subplots(figsize=(13, 5.0), dpi=200)
ax.set_xlim(0, 13); ax.set_ylim(0, 5.0); ax.axis("off")
for x0, (tit, itens), cor in ((0.1, A, "#1B2A41"), (6.6, B, "#4A6FA5")):
    ax.add_patch(FancyBboxPatch((x0, 0.1), 6.3, 4.8, boxstyle="round,pad=0,rounding_size=0.12", fc="#F3F5F8", ec="#C9CED6"))
    ax.add_patch(FancyBboxPatch((x0, 4.25), 6.3, 0.65, boxstyle="round,pad=0,rounding_size=0.12", fc=cor, ec=cor))
    ax.text(x0 + 0.25, 4.575, tit, va="center", fontsize=15, weight="bold", color="white")
    for i, t in enumerate(itens):
        r, txt = t.split(" · ", 1)
        y = 3.85 - i * 0.48
        ax.text(x0 + 0.25, y, r, va="center", fontsize=13, weight="bold", color=cor)
        ax.text(x0 + 0.95, y, txt, va="center", fontsize=12.5, color="#1F2328")
fig.savefig(os.path.join(os.path.dirname(os.path.abspath(__file__)), "E1-requisitos.png"), bbox_inches="tight", pad_inches=0.05, facecolor="white")
