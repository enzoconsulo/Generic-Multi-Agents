# -*- coding: utf-8 -*-
"""
Gera os dois documentos de originalidade do TCC, em .docx e .pdf.

  originalidade-completo.docx/.pdf  — a analise longa, com fontes
  originalidade-resumo.docx/.pdf    — o resumo para apresentar

PADRAO VISUAL: o mesmo dos demais documentos do TCC (ver
`_sistema/documentos-tcc/CONTEXTO.md`, secao 6) — Calibri, titulos azul #184F95,
tabelas com cabecalho azul #2A78D6 e zebra #F5F5F2.

REGRA DE CONTEUDO: nenhuma citacao de fala do autor dirigida a uma IA. As referencias
sao COMMITS do repositorio publico, com hash e data — verificaveis por qualquer um.

uso:  python originalidade.py
"""

import os

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

AZUL = RGBColor(0x18, 0x4F, 0x95)
AZUL_TAB = "2A78D6"
ZEBRA = "F5F5F2"
CINZA = RGBColor(0x55, 0x5B, 0x66)
PRETO = RGBColor(0x1A, 0x1A, 0x1A)

REPO = "github.com/enzoconsulo/Generic-Multi-Agents"


# --------------------------------------------------------------------------- base
def documento():
    d = Document()
    for s in d.sections:
        s.top_margin = Cm(2.2)
        s.bottom_margin = Cm(2.0)
        s.left_margin = Cm(2.4)
        s.right_margin = Cm(2.4)
    n = d.styles["Normal"]
    n.font.name = "Calibri"
    n.font.size = Pt(10)
    n.font.color.rgb = PRETO
    pf = n.paragraph_format
    pf.space_after = Pt(6)
    pf.line_spacing = 1.12
    return d


def _sombra(celula, cor):
    el = OxmlElement("w:shd")
    el.set(qn("w:val"), "clear")
    el.set(qn("w:fill"), cor)
    celula._tc.get_or_add_tcPr().append(el)


def _borda_inferior(par, cor="C9D1DD", tamanho=6):
    pPr = par._p.get_or_add_pPr()
    bd = OxmlElement("w:pBdr")
    b = OxmlElement("w:bottom")
    b.set(qn("w:val"), "single")
    b.set(qn("w:sz"), str(tamanho))
    b.set(qn("w:color"), cor)
    b.set(qn("w:space"), "3")
    bd.append(b)
    pPr.append(bd)


def titulo(d, texto, subtitulo=None, meta=None):
    p = d.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(texto)
    r.font.size = Pt(21)
    r.font.bold = True
    r.font.color.rgb = AZUL
    if subtitulo:
        p2 = d.add_paragraph()
        p2.paragraph_format.space_after = Pt(4)
        r2 = p2.add_run(subtitulo)
        r2.font.size = Pt(11.5)
        r2.font.color.rgb = CINZA
    if meta:
        p3 = d.add_paragraph()
        p3.paragraph_format.space_after = Pt(14)
        r3 = p3.add_run(meta)
        r3.font.size = Pt(8.5)
        r3.font.color.rgb = CINZA
        _borda_inferior(p3)


def secao(d, numero, texto):
    p = d.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(16)
    pf.space_after = Pt(5)
    pf.keep_with_next = True
    r = p.add_run(f"{numero}  {texto}" if numero else texto)
    r.font.size = Pt(13)
    r.font.bold = True
    r.font.color.rgb = AZUL


def sub(d, texto):
    p = d.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(10)
    pf.space_after = Pt(3)
    pf.keep_with_next = True
    r = p.add_run(texto)
    r.font.size = Pt(10.5)
    r.font.bold = True
    r.font.color.rgb = PRETO
    return p


def texto(d, partes, tamanho=10, espaco=6, italico=False):
    """partes: string, ou lista de (texto, negrito)."""
    p = d.add_paragraph()
    p.paragraph_format.space_after = Pt(espaco)
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    if isinstance(partes, str):
        partes = [(partes, False)]
    for t, neg in partes:
        r = p.add_run(t)
        r.font.size = Pt(tamanho)
        r.font.bold = neg
        r.font.italic = italico
    return p


def marcador(d, partes, tamanho=10):
    p = d.add_paragraph(style="List Bullet")
    pf = p.paragraph_format
    pf.space_after = Pt(3)
    pf.left_indent = Cm(0.7)
    if isinstance(partes, str):
        partes = [(partes, False)]
    for t, neg in partes:
        r = p.add_run(t)
        r.font.size = Pt(tamanho)
        r.font.bold = neg
    return p


def nota(d, rotulo, corpo):
    """Caixa discreta: barra lateral azul, sem cor de fundo berrante."""
    t = d.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    c = t.cell(0, 0)
    _sombra(c, "F2F5FA")
    c.text = ""
    p = c.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run(rotulo + "  ")
    r.font.size = Pt(8.5)
    r.font.bold = True
    r.font.color.rgb = AZUL
    r2 = p.add_run(corpo)
    r2.font.size = Pt(9.5)
    d.add_paragraph().paragraph_format.space_after = Pt(4)
    return t


def tabela(d, cabecalho, linhas, larguras=None, fonte=8.8):
    t = d.add_table(rows=1, cols=len(cabecalho))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(cabecalho):
        c = t.rows[0].cells[i]
        _sombra(c, AZUL_TAB)
        c.text = ""
        p = c.paragraphs[0]
        p.paragraph_format.space_after = Pt(1)
        r = p.add_run(h)
        r.font.size = Pt(fonte)
        r.font.bold = True
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    for n, linha in enumerate(linhas):
        cs = t.add_row().cells
        for i, val in enumerate(linha):
            if n % 2 == 1:
                _sombra(cs[i], ZEBRA)
            cs[i].text = ""
            p = cs[i].paragraphs[0]
            p.paragraph_format.space_after = Pt(1)
            for t_, neg in (val if isinstance(val, list) else [(val, False)]):
                r = p.add_run(t_)
                r.font.size = Pt(fonte)
                r.font.bold = neg
    if larguras:
        for i, w in enumerate(larguras):
            for row in t.rows:
                row.cells[i].width = Cm(w)
    d.add_paragraph().paragraph_format.space_after = Pt(4)
    return t


def salvar(d, nome):
    docx = os.path.join(RAIZ, nome + ".docx")
    d.save(docx)
    print("  gravado:", docx)
    return docx


def para_pdf(docx):
    """Converte com o Word instalado — mesmo caminho dos demais documentos do TCC."""
    import win32com.client as win32

    pdf = docx[:-5] + ".pdf"
    app = win32.Dispatch("Word.Application")
    app.Visible = False
    try:
        doc = app.Documents.Open(docx)
        doc.SaveAs(pdf, FileFormat=17)  # wdFormatPDF
        doc.Close(False)
        print("  gravado:", pdf)
    finally:
        app.Quit()
    return pdf
