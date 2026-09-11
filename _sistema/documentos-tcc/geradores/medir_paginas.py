# -*- coding: utf-8 -*-
"""Estimador de numero de paginas de um .docx, sem Word nem LibreOffice.

Existe porque a maquina atual nao tem como renderizar, e "cabe em 10 paginas"
e um requisito que precisa ser MEDIDO, nao estimado no olho.

Como funciona: percorre o corpo na ordem, soma a altura de cada bloco
(paragrafo, tabela, imagem) em pontos e divide pela altura util da pagina,
respeitando quebras explicitas. A largura media do caractere e o unico
parametro empirico — calibrado contra documentos cujo numero de paginas
e conhecido (ver CALIBRACAO, abaixo).

    python medir_paginas.py <arquivo.docx> [...]
    python medir_paginas.py --calibrar        # confere contra os conhecidos
"""
import math
import os
import sys

from docx import Document
from docx.oxml.ns import qn

EMU_POR_CM = 360000.0
PT_POR_CM = 28.3465

# Fracao do corpo da fonte que um caractere medio ocupa em largura (Calibri).
LARGURA_CARACTERE = 0.465
# Consolas e monoespacada e mais larga.
LARGURA_CARACTERE_MONO = 0.55

# Documentos com numero de paginas conhecido, para conferir o estimador.
CALIBRACAO = [
    ("fabrica-multi-agente-arquitetura-6.docx", 7),
    ("fabrica-multi-agente-arquitetura-7.docx", 19),
]


def _pt(valor, padrao=0.0):
    return valor.pt if valor is not None else padrao


def _tem_quebra(par):
    return bool(par._p.findall(".//" + qn("w:br") + "[@" + qn("w:type") + "='page']"))


def _altura_texto(texto, tam, largura_cm, espaco, mono=False):
    """Altura em pontos de um texto que flui numa coluna de `largura_cm`."""
    if not texto:
        return tam * espaco
    largura_pt = largura_cm * PT_POR_CM
    frac = LARGURA_CARACTERE_MONO if mono else LARGURA_CARACTERE
    por_linha = max(1.0, largura_pt / (frac * tam))
    linhas = max(1, math.ceil(len(texto) / por_linha))
    return linhas * tam * espaco


def _tam_do_paragrafo(par, padrao=9.5):
    for run in par.runs:
        if run.font.size is not None:
            return run.font.size.pt
    if par.style is not None and par.style.font.size is not None:
        return par.style.font.size.pt
    return padrao


def _mono(par):
    return any(r.font.name == "Consolas" for r in par.runs)


def altura_paragrafo(par, largura_cm):
    pf = par.paragraph_format
    tam = _tam_do_paragrafo(par)
    ls = pf.line_spacing
    if hasattr(ls, "pt"):
        # Altura EXATA por linha (o respiro() entre blocos usa isto). Sem este caso o
        # medidor contava cada respiro de 4 pt como uma linha inteira de texto.
        linhas = 1
        if par.text:
            por_linha = max(1.0, largura_cm * PT_POR_CM / (LARGURA_CARACTERE * tam))
            linhas = max(1, math.ceil(len(par.text) / por_linha))
        return linhas * ls.pt + _pt(pf.space_before) + _pt(pf.space_after, 3.0)
    espaco = ls if isinstance(ls, float) else 1.05
    h = _altura_texto(par.text, tam, largura_cm, espaco, mono=_mono(par))
    h += _pt(pf.space_before) + _pt(pf.space_after, 3.0)
    return h


def altura_tabela(tab, largura_total_cm):
    total = 0.0
    for linha in tab.rows:
        alturas = []
        for cel in linha.cells:
            larg = (cel.width / EMU_POR_CM) if cel.width else (largura_total_cm / len(linha.cells))
            h = 0.0
            for par in cel.paragraphs:
                h += altura_paragrafo(par, max(larg - 0.4, 0.8))
            alturas.append(h)
        total += max(alturas) if alturas else 0.0
        total += 2.0                      # respiro da borda da celula
    return total


def medir(caminho):
    doc = Document(caminho)
    s = doc.sections[0]
    largura_cm = (s.page_width - s.left_margin - s.right_margin) / EMU_POR_CM
    altura_util = (s.page_height - s.top_margin - s.bottom_margin) / EMU_POR_CM * PT_POR_CM

    corpo = s._sectPr.getparent()
    tabelas = {id(t._tbl): t for t in doc.tables}
    paragrafos = {id(p._p): p for p in doc.paragraphs}

    paginas, atual = 1, 0.0
    for filho in corpo.iterchildren():
        if filho.tag == qn("w:p"):
            par = paragrafos.get(id(filho))
            if par is None:
                continue
            if _tem_quebra(par):
                paginas += 1
                atual = 0.0
                continue
            h = altura_paragrafo(par, largura_cm)
            # imagem embutida: a altura real do desenho manda
            for ext in filho.findall(".//" + qn("wp:extent")):
                h = max(h, int(ext.get("cy")) / EMU_POR_CM * PT_POR_CM + 6)
            atual += h
        elif filho.tag == qn("w:tbl"):
            tab = tabelas.get(id(filho))
            if tab is not None:
                atual += altura_tabela(tab, largura_cm)
        while atual > altura_util:
            atual -= altura_util
            paginas += 1
    return paginas + (atual / altura_util)


def _raiz():
    aqui = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(os.path.dirname(os.path.dirname(aqui)))


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] == "--calibrar":
        print("conferencia contra documentos de paginacao conhecida:\n")
        print("  %-52s %8s %8s" % ("documento", "real", "estimado"))
        for nome, real in CALIBRACAO:
            caminho = os.path.join(_raiz(), nome)
            if not os.path.exists(caminho):
                print("  %-52s %8s %8s" % (nome[:52], real, "ausente"))
                continue
            print("  %-52s %8d %8.1f" % (nome[:52], real, medir(caminho)))
    else:
        for a in args:
            print("%6.1f paginas   %s" % (medir(a), os.path.basename(a)))
