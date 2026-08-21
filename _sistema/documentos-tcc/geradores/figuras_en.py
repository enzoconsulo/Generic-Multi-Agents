# -*- coding: utf-8 -*-
"""Gera as figuras em INGLES reaproveitando os geradores em portugues.

Intercepta Axes.text (traduz pelo dicionario) e Figure.savefig (redireciona
para figs_en/). Textos sem traducao que pertencam a figuras USADAS sao
gravados em faltando_en.txt."""
import io, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.axes
import matplotlib.figure

from traducoes_en import TRAD

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA_EN = os.path.join(AQUI, "figs_en")
os.makedirs(SAIDA_EN, exist_ok=True)

USADAS = {"fig1-fluxo.png", "fig2-supervisao.png", "fig3-camadas.png", "fig4-laco.png",
          "fig5-cache-v6.png", "fig6-estados.png", "fig7-rag-v6.png", "fig8-memoria.png",
          "fig9-paralelismo.png", "fig10-trilhas.png", "fig12-fases.png", "fig13-agente.png",
          "fig14-beam.png", "fig15-tarefa.png", "fig16-portoes.png", "fig17-banco.png",
          "fig18-escada.png", "fig19-equipe.png", "fig20-contexto.png", "fig21-projeto.png",
          "fig22-painel.png"}

pendentes = []          # textos sem traducao da figura sendo desenhada agora
faltando_usadas = []    # (figura, texto) apenas das figuras que entram nos documentos

_orig_text = matplotlib.axes.Axes.text
_orig_savefig = matplotlib.figure.Figure.savefig


def text_en(self, x, y, s, *a, **kw):
    if isinstance(s, str) and s.strip():
        t = TRAD.get(s)
        if t is None:
            pendentes.append(s)
        else:
            s = t
    return _orig_text(self, x, y, s, *a, **kw)


def savefig_en(self, caminho, *a, **k):
    nome = os.path.basename(str(caminho))
    if nome in USADAS:
        for s in pendentes:
            faltando_usadas.append((nome, s))
        del pendentes[:]
        return _orig_savefig(self, os.path.join(SAIDA_EN, nome), *a, **k)
    del pendentes[:]
    return None


matplotlib.axes.Axes.text = text_en
matplotlib.figure.Figure.savefig = savefig_en

for nome in ("figuras3.py", "figuras5.py", "figuras6.py", "figuras7.py"):
    caminho = os.path.join(AQUI, nome)
    fonte = io.open(caminho, encoding="utf-8").read()
    fonte = fonte.replace('io.open(p, "w", encoding="utf-8").write(s)', "pass")
    try:
        exec(compile(fonte, nome, "exec"),
             {"__name__": "__main__", "__file__": caminho})
    except Exception as e:
        print("aviso em", nome, ":", type(e).__name__, e)

geradas = sorted(f for f in os.listdir(SAIDA_EN) if f.endswith(".png"))
print("figuras em ingles geradas:", len(geradas), "de", len(USADAS))

vistos = set()
linhas = []
for fig, s in faltando_usadas:
    if s not in vistos:
        vistos.add(s)
        linhas.append("### " + fig)
        linhas.append(repr(s) + ",")
io.open(os.path.join(AQUI, "faltando_en.txt"), "w", encoding="utf-8").write("\n".join(linhas))
print("textos SEM traducao em figuras usadas:", len(vistos))
