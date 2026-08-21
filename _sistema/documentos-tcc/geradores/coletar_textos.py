# -*- coding: utf-8 -*-
"""Roda os geradores de figura com Axes.text interceptado, so para COLETAR os
textos desenhados, agrupados por figura. Nao grava figura nenhuma."""
import io, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.axes
import matplotlib.figure

AQUI = os.path.dirname(os.path.abspath(__file__))
buffer = []
por_figura = {}

_orig_text = matplotlib.axes.Axes.text


def text_coletor(self, x, y, s, *a, **kw):
    if isinstance(s, str) and s.strip():
        buffer.append(s)
    return _orig_text(self, x, y, s, *a, **kw)


def savefig_coletor(self, caminho, *a, **k):
    nome = os.path.basename(str(caminho))
    por_figura.setdefault(nome, [])
    por_figura[nome].extend(buffer)
    del buffer[:]


matplotlib.axes.Axes.text = text_coletor
matplotlib.figure.Figure.savefig = savefig_coletor

for nome in ("figuras3.py", "figuras5.py", "figuras6.py", "figuras7.py"):
    caminho = os.path.join(AQUI, nome)
    fonte = io.open(caminho, encoding="utf-8").read()
    fonte = fonte.replace('io.open(p, "w", encoding="utf-8").write(s)', "pass")
    try:
        exec(compile(fonte, nome, "exec"),
             {"__name__": "__main__", "__file__": caminho})
    except Exception as e:
        print("aviso em", nome, ":", type(e).__name__, e)

USADAS = ["fig1-fluxo.png", "fig2-supervisao.png", "fig3-camadas.png", "fig4-laco.png",
          "fig5-cache-v6.png", "fig6-estados.png", "fig7-rag-v6.png", "fig8-memoria.png",
          "fig9-paralelismo.png", "fig10-trilhas.png", "fig12-fases.png", "fig13-agente.png",
          "fig14-beam.png", "fig15-tarefa.png", "fig16-portoes.png", "fig17-banco.png",
          "fig18-escada.png", "fig19-equipe.png", "fig20-contexto.png", "fig21-projeto.png",
          "fig22-painel.png"]

vistos = set()
n = 0
linhas = []
for fig in USADAS:
    linhas.append("")
    linhas.append("### " + fig)
    for t in por_figura.get(fig, []):
        if t not in vistos:
            vistos.add(t)
            linhas.append(repr(t) + ",")
            n += 1

saida = os.path.join(AQUI, "textos_figuras.txt")
io.open(saida, "w", encoding="utf-8").write("\n".join(linhas))
print("figuras usadas:", len(USADAS), "| strings unicas a traduzir:", n)
