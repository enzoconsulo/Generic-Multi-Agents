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


def _nao_partir(linha):
    """Impede a linha de tabela de se dividir entre duas paginas."""
    trPr = linha._tr.get_or_add_trPr()
    el = OxmlElement("w:cantSplit")
    trPr.append(el)


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
    for row in t.rows:
        _nao_partir(row)
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


# ----------------------------------------------------------------- semaforo/diagramas
# Adicionado na 6a versao: o texto sozinho fazia este trabalho e o softwarefabrik
# parecerem a mesma coisa. Cor e desenho separam o que texto corrido nao separa.
SEMAFORO = {
    "igual":   ("E3F3E7", RGBColor(0x1B, 0x6B, 0x33), "IGUAL"),
    "parcial": ("FDF3D6", RGBColor(0x8A, 0x5D, 0x00), "PARCIAL"),
    "difere":  ("FBE4E2", RGBColor(0xA8, 0x2A, 0x21), "DIFERE"),
}
CAIXA = "E8EFF9"
CAIXA_DESTAQUE = "D6E6FA"


def pagina_nova(d):
    """Quebra de pagina. Usada para nao separar a legenda da tabela que ela explica."""
    from docx.enum.text import WD_BREAK
    d.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


def legenda(d, fonte=8.2):
    """Faixa horizontal com os tres estados do semaforo."""
    t = d.add_table(rows=1, cols=3)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    rotulos = [
        ("igual", "mesma escolha"),
        ("parcial", "mesma intenção, outro meio"),
        ("difere", "escolha oposta"),
    ]
    for i, (chave, glosa) in enumerate(rotulos):
        fundo, tinta, nome = SEMAFORO[chave]
        c = t.rows[0].cells[i]
        _sombra(c, fundo)
        c.text = ""
        p = c.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(1)
        r = p.add_run(nome + "  ")
        r.font.size = Pt(fonte)
        r.font.bold = True
        r.font.color.rgb = tinta
        r2 = p.add_run(glosa)
        r2.font.size = Pt(fonte)
        r2.font.color.rgb = tinta
        c.width = Cm(5.33)
    _nao_partir(t.rows[0])
    # a legenda so faz sentido colada a tabela que ela explica
    pf = d.add_paragraph().paragraph_format
    pf.space_after = Pt(4)
    pf.keep_with_next = True
    return t


def tabela_semaforo(d, cabecalho, linhas, larguras, fonte=8.3):
    """linhas: (estado, celula, celula, ...) — a 1a coluna vira o selo colorido.

    O estado tinge a linha inteira, de leve: e a cor que carrega a leitura, nao o texto.
    """
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
    for linha in linhas:
        estado, valores = linha[0], list(linha[1:])
        fundo, tinta, nome = SEMAFORO[estado]
        cs = t.add_row().cells
        # selo
        _sombra(cs[0], fundo)
        cs[0].text = ""
        p = cs[0].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(1)
        r = p.add_run(nome)
        r.font.size = Pt(fonte - 0.4)
        r.font.bold = True
        r.font.color.rgb = tinta
        for i, val in enumerate(valores, start=1):
            _sombra(cs[i], fundo if estado != "igual" else "F2F9F4")
            cs[i].text = ""
            p = cs[i].paragraphs[0]
            p.paragraph_format.space_after = Pt(1)
            for t_, neg in (val if isinstance(val, list) else [(val, False)]):
                r = p.add_run(t_)
                r.font.size = Pt(fonte)
                r.font.bold = neg
    for row in t.rows:
        _nao_partir(row)
    for i, w in enumerate(larguras):
        for row in t.rows:
            row.cells[i].width = Cm(w)
    d.add_paragraph().paragraph_format.space_after = Pt(4)
    return t


def diagrama(d, rotulo, passos, destaque=None, fonte=8.2, total=15.8, seta=0.62):
    """Fluxo horizontal: caixas sombreadas separadas por setas, sem bordas de tabela.

    passos: lista de strings. destaque: indices que recebem o azul mais forte.
    """
    destaque = destaque or []
    n = len(passos)
    largura = (total - seta * (n - 1)) / n
    t = d.add_table(rows=1, cols=2 * n - 1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    cs = t.rows[0].cells
    for i, passo in enumerate(passos):
        c = cs[2 * i]
        _sombra(c, CAIXA_DESTAQUE if i in destaque else CAIXA)
        c.text = ""
        p = c.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(1)
        r = p.add_run(passo)
        r.font.size = Pt(fonte)
        r.font.bold = i in destaque
        r.font.color.rgb = AZUL if i in destaque else PRETO
        c.width = Cm(largura)
        if i < n - 1:
            a = cs[2 * i + 1]
            a.text = ""
            pa = a.paragraphs[0]
            pa.alignment = WD_ALIGN_PARAGRAPH.CENTER
            pa.paragraph_format.space_after = Pt(1)
            ra = pa.add_run("\u2192")
            ra.font.size = Pt(fonte + 1)
            ra.font.color.rgb = CINZA
            a.width = Cm(seta)
    p = d.add_paragraph()
    p.paragraph_format.space_after = Pt(9)
    p.paragraph_format.space_before = Pt(1)
    r = p.add_run(rotulo)
    r.font.size = Pt(8)
    r.font.color.rgb = CINZA
    r.font.italic = True
    return t


def rotulo_diagrama(d, texto_):
    """Titulo curto acima de um diagrama."""
    p = d.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(texto_)
    r.font.size = Pt(9.5)
    r.font.bold = True
    r.font.color.rgb = AZUL
    return p
