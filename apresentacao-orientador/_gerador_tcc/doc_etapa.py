# -*- coding: utf-8 -*-
"""Documento Word de uma etapa (PT), com números medidos na branch da etapa.

    python doc_etapa.py <n> <saida.docx>
"""
import os
import sys
import tempfile

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from docx import Document  # noqa: E402
from docx.enum.table import WD_TABLE_ALIGNMENT  # noqa: E402
from docx.enum.text import WD_ALIGN_PARAGRAPH  # noqa: E402
from docx.oxml import OxmlElement  # noqa: E402
from docx.oxml.ns import qn  # noqa: E402
from docx.shared import Cm, Pt, RGBColor  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalogo as C  # noqa: E402
import metricas as M  # noqa: E402
from textos_etapas import TEXTOS  # noqa: E402

AZUL = RGBColor(0x2A, 0x78, 0xD6)
CINZA = RGBColor(0x55, 0x55, 0x55)
STATUS_PT = {"done": "Concluída", "blocked": "Bloqueada", "in_progress": "Em andamento", "todo": "A fazer"}
COR_STATUS = {"done": "E3F3E8", "blocked": "F9E3E3", "in_progress": "FBF0DC", "todo": "EEEEEE"}
REQ = {
    "R1": "Pedido → especificação, plano e tarefas", "R2": "Seis estados com relatório e custo",
    "R3": "Dois julgamentos independentes", "R4": "Reprovação com decisão de como refazer",
    "R5": "Retrabalho limitado; humano no 4º ciclo", "R6": "Paralelismo sem disputa de arquivo",
    "R7": "Histórico consultado, com fonte", "R8": "Andamento e custo ao vivo",
    "R9": "Cabe em 8 GB / 4 núcleos", "R10": "Custo em cota e em dinheiro",
    "R11": "Nenhum agente escreve fora do projeto", "R12": "Testes sem internet e sem cota",
    "R13": "Queda de um agente não derruba os outros", "R14": "Nenhuma rodada passa do teto",
    "R15": "Fornecedor trocável sem mexer no núcleo",
}


def sombrear(celula, cor):
    tc = celula._tc.get_or_add_tcPr()
    sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear")
    sh.set(qn("w:color"), "auto")
    sh.set(qn("w:fill"), cor)
    tc.append(sh)


def tabela(doc, cab, linhas, larguras=None, cores=None):
    t = doc.add_table(rows=1, cols=len(cab))
    t.style = "Light Grid Accent 1"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, c in enumerate(cab):
        t.rows[0].cells[i].text = c
        t.rows[0].cells[i].paragraphs[0].runs[0].bold = True
    for k, l in enumerate(linhas):
        cel = t.add_row().cells
        for i, v in enumerate(l):
            cel[i].text = str(v)
        if cores and cores[k]:
            sombrear(cel[cores[k][0]], cores[k][1])
    if larguras:
        t.autofit = False
        for i, w in enumerate(larguras):
            t.columns[i].width = Cm(w)
        for row in t.rows:
            for i, w in enumerate(larguras):
                row.cells[i].width = Cm(w)
    for row in t.rows:
        for c in row.cells:
            for p in c.paragraphs:
                for r in p.runs:
                    r.font.size = Pt(9.5)
    return t


def titulo(doc, texto, nivel=1):
    h = doc.add_heading(texto, level=nivel)
    for r in h.runs:
        r.font.color.rgb = AZUL if nivel == 1 else RGBColor(0x22, 0x22, 0x22)
    return h


def grafico(n, cods, caminho):
    etapas = [k for k in range(2, n + 1) if cods.get(k)]
    if not etapas:
        return None
    testes = [cods[k]["testes"] for k in etapas]
    linhas = [cods[k]["linhas_lib"] / 1000 for k in etapas]
    fig, ax = plt.subplots(1, 2, figsize=(7.2, 2.4), dpi=150)
    for a, vals, tit, fmt in [(ax[0], testes, "Testes automáticos", "{:.0f}"),
                              (ax[1], linhas, "Código (mil linhas em lib/)", "{:.1f}")]:
        cores = ["#2a78d6" if k == n else "#a9c6ee" for k in etapas]
        b = a.bar([f"E{k}" for k in etapas], vals, color=cores, width=0.6)
        a.set_title(tit, fontsize=9, loc="left", color="#333")
        a.spines[["top", "right", "left"]].set_visible(False)
        a.tick_params(axis="y", left=False, labelleft=False)
        a.tick_params(axis="x", labelsize=8)
        for r, v in zip(b, vals):
            a.text(r.get_x() + r.get_width() / 2, r.get_height(), fmt.format(v), ha="center", va="bottom", fontsize=7.5)
    fig.tight_layout()
    fig.savefig(caminho)
    plt.close(fig)
    return caminho


def gerar(n, saida):
    e = C.ETAPAS[n]
    tx = TEXTOS[n]
    tarefas = [t for t in C.T if t["etapa"] == n]
    cods = {k: M.codigo(k) for k in range(2, n + 1)}
    cod = cods.get(n)
    proc = M.processo()

    doc = Document()
    sec = doc.sections[0]
    sec.left_margin = sec.right_margin = Cm(2.2)
    sec.top_margin = sec.bottom_margin = Cm(2)
    st = doc.styles["Normal"]
    st.font.name = "Calibri"
    st.font.size = Pt(10.5)

    p = doc.add_paragraph()
    r = p.add_run("FÁBRICA DE SOFTWARE MULTI-AGENTE · TCC · ENZO CONSULO")
    r.font.size = Pt(8.5)
    r.font.color.rgb = CINZA
    r.bold = True
    titulo(doc, f"E{n} — {e['pt']}", 0)
    p = doc.add_paragraph()
    r = p.add_run(f"Período planejado: {e['datas']}   ·   Branch: etapa/{e['slug']}")
    r.font.color.rgb = CINZA

    concl = sum(1 for t in tarefas if t["status"] == "done")
    marco = next((t for t in tarefas if t["tipo"] == "Milestone"), None)
    situ = ("Entrega aprovada" if (marco is None and concl == len(tarefas)) or (marco and marco["status"] == "done")
            else "Entrega pendente" if marco and marco["status"] != "done" else "Em andamento")
    tabela(doc, ["Entrega combinada no plano", "Situação"], [[e["entrega_pt"], situ]], [12.5, 4],
           [(1, "E3F3E8" if situ == "Entrega aprovada" else "FBF0DC")])
    doc.add_paragraph()
    p = doc.add_paragraph()
    p.add_run("Em uma frase: ").bold = True
    p.add_run(tx["resumo"])

    titulo(doc, "O que foi feito")
    linhas, cores = [], []
    for t in tarefas:
        linhas.append([t["key"], t["pacote"], t["pt"]["titulo"], STATUS_PT[t["status"]]])
        cores.append((3, COR_STATUS[t["status"]]))
    tabela(doc, ["Tarefa", "Pacote", "Descrição", "Status"], linhas, [2.2, 1.6, 10.2, 2.6], cores)

    titulo(doc, "Como foi feito")
    for c in tx["como"]:
        doc.add_paragraph(c, style="List Bullet")

    titulo(doc, "Como se prova")
    p = doc.add_paragraph()
    r = p.add_run(tx["prova"])
    r.font.name = "Consolas"
    r.font.size = Pt(9.5)

    titulo(doc, "Números da etapa")
    if cod:
        ant = cods.get(n - 1)
        def d(k):
            return f" (+{cod[k] - ant[k]})" if ant else ""
        dados = [["Tarefas concluídas", f"{concl} de {len(tarefas)}"],
                 ["Commits na branch da etapa", len(cod["commits"])],
                 ["Módulos Elixir", f"{cod['modulos']}{d('modulos')}"],
                 ["Linhas de código (lib/)", f"{cod['linhas_lib']:,}".replace(",", ".") + d("linhas_lib")],
                 ["Testes automáticos", f"{cod['testes']}{d('testes')}"]]
        reais = [proc[t["key"]] for t in tarefas if t["key"] in proc]
        if reais:
            ex = sum(x["execucoes"] for x in reais)
            sub = sum(x["subtarefas"] for x in reais)
            dados += [["Execuções de agente por item de trabalho (média)", f"{ex / sub:.2f}".replace(".", ",") + "  (critério: ≤ 2)"],
                      ["Custo medido dos agentes (dólar-equivalente da cota)", f"US$ {sum(x['custo_usd'] for x in reais):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")]]
        tabela(doc, ["Indicador", "Valor"], dados, [10, 6.5])
        png = grafico(n, cods, os.path.join(tempfile.gettempdir(), f"grafico-e{n}.png"))
        if png:
            doc.add_paragraph()
            doc.add_picture(png, width=Cm(16))
            cap = doc.add_paragraph("Crescimento do sistema até esta etapa (em destaque).")
            cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
            cap.runs[0].font.size = Pt(8.5)
            cap.runs[0].font.color.rgb = CINZA
    else:
        doc.add_paragraph("Etapa de documentos: sem código. Entregáveis em docs/planejamento/ e docs/tasks/.")

    reqs = sorted({r for t in tarefas for r in t["req"]}, key=lambda x: int(x[1:]))
    if reqs:
        titulo(doc, "Requisitos desta etapa")
        tabela(doc, ["Req.", "Requisito"], [[r, REQ[r]] for r in reqs], [1.8, 14.7])

    titulo(doc, "Pendências e próxima etapa")
    if tx["pendente"]:
        for x in tx["pendente"]:
            doc.add_paragraph(x, style="List Bullet")
    else:
        doc.add_paragraph("Nenhuma pendência nesta etapa.")
    p = doc.add_paragraph()
    p.add_run("Próxima etapa: ").bold = True
    p.add_run(tx["proxima"])

    if cod and cod["commits"]:
        titulo(doc, "Commits da etapa", 2)
        for _, s in cod["commits"]:
            p = doc.add_paragraph(style="List Bullet")
            r = p.add_run(s)
            r.font.size = Pt(9)

    os.makedirs(os.path.dirname(os.path.abspath(saida)), exist_ok=True)
    doc.save(saida)
    print("ok", saida)


if __name__ == "__main__":
    gerar(int(sys.argv[1]), sys.argv[2])
