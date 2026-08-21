import win32com.client, os, pymupdf
src = r"C:\Users\enzoc\OneDrive\Documentos\Gerador_de_projetos\fabrica-multi-agente-arquitetura-7.docx"
pdf = os.path.join(os.path.dirname(os.path.abspath(__file__)), "preview7.pdf")
w = win32com.client.Dispatch("Word.Application")
w.Visible = False
d = w.Documents.Open(src, ReadOnly=True)
d.SaveAs(pdf, FileFormat=17)
d.Close(False)
w.Quit()
doc = pymupdf.open(pdf)
print("paginas:", doc.page_count)
for i, page in enumerate(doc):
    page.get_pixmap(dpi=110).save(f"v7-pg{i+1}.png")
print("ok")
